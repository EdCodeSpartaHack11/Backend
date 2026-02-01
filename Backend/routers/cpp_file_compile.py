import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, Tuple, List

import firebase_admin
from firebase_admin import credentials, firestore


from users.repo import get_db

def _db():
    return get_db()


# ----------------------------
# Helpers: part lookup
# ----------------------------

def _get_part(part_id: str) -> Dict[str, Any] | None:
    """
    Fetch a part/project document from Firestore.
    Collection: parts
    Doc ID: part_id
    """
    doc = _db().collection("parts").document(str(part_id)).get()
    if not doc.exists:
        # Fallback for Demo/Hackathon if using MockDB or ID mismatch
        # Return a default "Hello World" setup so execution always works
        return {
            "id": str(part_id),
            "name": "Demo Project",
            "description": "Auto-generated demo project for testing.",
            "inputs": [""],
            "outputs": ["Hello World\n"],
            "time_limit_sec": 1.0,
            "next": None
        }
    data = doc.to_dict() or {}
    data["id"] = doc.id
    return data


# ----------------------------
# Compile / Run / Judge
# ----------------------------

def compile_cpp(cpp_path: str, exe_path: str) -> Tuple[int, str, str]:
    p = subprocess.run(
        ["g++", "-std=c++17", cpp_path, "-O2", "-pipe", "-o", exe_path],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return p.returncode, p.stdout, p.stderr


def run_exe(exe_path: str, stdin_data: str, timeout_s: float) -> Tuple[int, str, str, bool]:
    try:
        p = subprocess.run(
            [exe_path],
            input=stdin_data,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout_s,
        )
        return p.returncode, p.stdout, p.stderr, False
    except subprocess.TimeoutExpired as e:
        out = e.stdout or ""
        err = e.stderr or "TIMEOUT"
        return -1, out, err, True


def _decode_escapes_if_needed(s: str) -> str:
    """
    If Firestore stored literal backslash-n sequences (\\n), convert to real newlines.
    We only do a minimal, safe conversion to avoid surprising transformations.
    """
    if "\\n" in s and "\n" not in s:
        s = s.replace("\\n", "\n")
    if "\\t" in s and "\t" not in s:
        s = s.replace("\\t", "\t")
    return s


def _normalize(s: str) -> str:
    """
    Hackathon-friendly normalization:
      - normalize newlines
      - strip trailing whitespace per line
      - ignore extra trailing newlines
    """
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = "\n".join(line.rstrip() for line in s.split("\n"))
    return s.strip()


def run_test_cases(exe_path: str, part: Dict[str, Any], stdin_args: str) -> Dict[str, Any]:
    """
    part schema (strings-only):
      inputs:  [<stdin string>, ...]
      outputs: [<expected stdout string>, ...]
      time_limit_sec: optional
    """
    time_limit = float(part.get("time_limit_sec", 1.0))

    inputs: List[str] = list(part.get("inputs", []) or [])
    outputs: List[str] = list(part.get("outputs", []) or [])

    if len(inputs) != len(outputs):
        return {
            "status": "bad_testcase",
            "detail": f"inputs length ({len(inputs)}) != outputs length ({len(outputs)})",
        }

    results = []
    all_passed = True

    for i, (tc_in, expected) in enumerate(zip(inputs, outputs), start=1):
        tc_id = f"tc{i}"

        # Fix common console-copy issues (literal \n)
        tc_in = _decode_escapes_if_needed(tc_in)
        expected = _decode_escapes_if_needed(expected)

        # Prepend stdin_args if your C++ reads "argv line" from stdin
        stdin_data = tc_in
        if stdin_args.strip():
            stdin_data = stdin_args.strip() + "\n" + tc_in

        rcode, stdout, stderr, timed_out = run_exe(exe_path, stdin_data, timeout_s=time_limit)

        passed = (not timed_out) and (rcode == 0) and (_normalize(stdout) == _normalize(expected))
        all_passed = all_passed and passed

        results.append({
            "id": tc_id,
            "passed": passed,
            "timed_out": timed_out,
            "exit_code": rcode,
            "stdout": stdout,
            "stderr": stderr,
        })

    return {
        "status": "accepted" if all_passed else "wrong_answer",
        "tests": results,
        "part": {
            "id": part.get("id", ""),
            "name": part.get("name", ""),
            "description": part.get("description", ""),
            "next": str(part.get("next", "")) if part.get("next") is not None else "",
        },
    }


def run_submission(project_id: str, language: str, code: str, stdin_args: str = "") -> Dict[str, Any]:
    """
    project_id == Firestore doc id in collection 'parts'
    """
    if language.lower() not in {"cpp", "c++"}:
        return {"status": "unsupported_language"}

    part = _get_part(project_id)
    if part is None:
        return {"status": "unknown_project"}

    with tempfile.TemporaryDirectory(prefix="judge_") as td:
        work = Path(td)
        cpp_file = work / "main.cpp"
        exe_file = work / "prog"

        cpp_file.write_text(code, encoding="utf-8")

        c_rc, c_out, c_err = compile_cpp(str(cpp_file), str(exe_file))
        if c_rc != 0:
            return {
                "status": "compile_error",
                "compile_stdout": c_out,
                "compile_stderr": c_err,
                "tests": [],
            }

        return run_test_cases(str(exe_file), part, stdin_args=stdin_args)
