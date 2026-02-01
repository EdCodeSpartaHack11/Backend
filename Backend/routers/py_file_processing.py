import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, Tuple, List

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
# Run / Judge
# ----------------------------

def run_python(py_path: str, stdin_data: str, timeout_s: float) -> Tuple[int, str, str, bool]:
    """
    Run a Python file with given stdin data and timeout.
    Returns: (return_code, stdout, stderr, timed_out)
    """
    try:
        p = subprocess.run(
            ["python3", py_path],
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
    except FileNotFoundError:
        # Fallback to 'python' if 'python3' not found
        try:
            p = subprocess.run(
                ["python", py_path],
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
        except Exception as e:
            return -1, "", f"Python execution error: {str(e)}", False


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


def validate_python_syntax(code: str) -> Tuple[bool, str]:
    """
    Validate Python syntax without executing the code.
    Returns: (is_valid, error_message)
    """
    try:
        compile(code, '<string>', 'exec')
        return True, ""
    except SyntaxError as e:
        return False, f"Syntax Error: {e.msg} at line {e.lineno}"
    except Exception as e:
        return False, f"Code validation error: {str(e)}"


def run_test_cases(py_path: str, part: Dict[str, Any], stdin_args: str) -> Dict[str, Any]:
    """
    part schema (strings-only):
      inputs:  [<stdin string>, ...]
      outputs: [<expected stdout string>, ...]
      time_limit_sec: optional
    """
    time_limit = float(part.get("time_limit_sec", 5.0))  # Python typically needs more time than C++

    inputs: List[str] = list(part.get("inputs", []) or [])
    outputs: List[str] = list(part.get("outputs", []) or [])
    
    if not outputs:
         # Try singular 'output' key if 'outputs' is empty
         outputs = list(part.get("output", []) or [])

    if len(inputs) != len(outputs):
        return {
            "status": "bad_testcase",
            "detail": f"inputs length ({len(inputs)}) != outputs length ({len(outputs)})",
        }

    if len(inputs) == 0:
        return {
            "status": "bad_testcase",
            "detail": "No test cases found",
        }

    results = []
    all_passed = True

    for i, (tc_in, expected) in enumerate(zip(inputs, outputs), start=1):
        tc_id = f"tc{i}"

        # Fix common console-copy issues (literal \n)
        tc_in = _decode_escapes_if_needed(tc_in)
        expected = _decode_escapes_if_needed(expected)

        # Prepend stdin_args if your Python reads "argv line" from stdin
        stdin_data = tc_in
        if stdin_args.strip():
            stdin_data = stdin_args.strip() + "\n" + tc_in

        rcode, stdout, stderr, timed_out = run_python(py_path, stdin_data, timeout_s=time_limit)

        passed = (not timed_out) and (rcode == 0) and (_normalize(stdout) == _normalize(expected))
        all_passed = all_passed and passed

        passed = (not timed_out) and (rcode == 0) and (_normalize(stdout) == _normalize(expected))
        all_passed = all_passed and passed

        results.append({
            "id": tc_id,
            "passed": passed,
            "timed_out": timed_out,
            "exit_code": rcode,
            "stdout": stdout,
            "stderr": stderr,
            # "expected": expected,  # Optional: keep if frontend needs it for diff
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


def run_python_submission(project_id: str, language: str, code: str, stdin_args: str = "") -> Dict[str, Any]:
    """
    project_id == Firestore doc id in collection 'parts'
    """
    if language.lower() not in {"python", "py", "python3"}:
        return {"status": "unsupported_language"}

    part = _get_part(project_id)
    if part is None:
        return {"status": "unknown_project"}

    # Validate Python syntax first
    is_valid, syntax_error = validate_python_syntax(code)
    if not is_valid:
        return {
            "status": "syntax_error",
            "compile_stdout": "",
            "compile_stderr": syntax_error,
            "tests": [],
        }

    with tempfile.TemporaryDirectory(prefix="python_judge_") as td:
        work = Path(td)
        py_file = work / "main.py"

        # Write the Python code to file
        py_file.write_text(code, encoding="utf-8")

        return run_test_cases(str(py_file), part, stdin_args=stdin_args)