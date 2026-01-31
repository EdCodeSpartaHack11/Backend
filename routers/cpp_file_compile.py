import json
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, Tuple


PROJECTS_PATH = Path("projects.json")


def _load_manifest() -> Dict[str, Any]:
    if not PROJECTS_PATH.exists():
        raise FileNotFoundError(f"Missing projects.json at: {PROJECTS_PATH.resolve()}")
    return json.loads(PROJECTS_PATH.read_text(encoding="utf-8"))


def _get_project(manifest: Dict[str, Any], project_id: str) -> Dict[str, Any] | None:
    return manifest.get("projects", {}).get(str(project_id))


def compile_cpp(cpp_path: str, exe_path: str) -> Tuple[int, str, str]:
    """
    Compile a C++ file into an executable at exe_path.
    """
    p = subprocess.run(
        ["g++", "-std=c++17", cpp_path, "-O2", "-pipe", "-o", exe_path],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return p.returncode, p.stdout, p.stderr


def run_exe(exe_path: str, stdin_data: str, timeout_s: float) -> Tuple[int, str, str, bool]:
    """
    Run executable with stdin_data. Returns (returncode, stdout, stderr, timed_out).
    """
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
        # Program exceeded wall time limit
        out = e.stdout or ""
        err = e.stderr or "TIMEOUT"
        return -1, out, err, True


def _normalize(s: str) -> str:
    """
    Hackathon-friendly normalization: ignore trailing whitespace and final newline differences.
    """
    return "\n".join(line.rstrip() for line in s.replace("\r\n", "\n").split("\n")).strip()


def run_test_cases(exe_path: str, project: Dict[str, Any], stdin_args: str) -> Dict[str, Any]:
    """
    Run the compiled executable against all testcases for the project.
    """
    time_limit = float(project.get("time_limit_sec", 1.0))
    tests = project.get("testcases", [])

    results = []
    all_passed = True

    for tc in tests:
        tc_id = tc.get("id", "")
        in_path = Path(tc["input"])
        out_path = Path(tc["output"])

        if not in_path.exists():
            return {"status": "bad_testcase", "detail": f"Missing input file: {in_path}"}
        if not out_path.exists():
            return {"status": "bad_testcase", "detail": f"Missing output file: {out_path}"}

        tc_in = in_path.read_text(encoding="utf-8")
        expected = out_path.read_text(encoding="utf-8")

        # Prepend the "args line" if provided (your C++ reads argv replacement from first stdin line)
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
    }


def run_submission(project_id: str, language: str, code: str, stdin_args: str = "") -> Dict[str, Any]:
    """
    Main entrypoint used by FastAPI endpoint:
    - load project
    - write code to temp file
    - compile to temp exe
    - run testcases
    """
    manifest = _load_manifest()
    project = _get_project(manifest, project_id)
    if project is None:
        return {"status": "unknown_project"}

    # You can later branch by language; for now it’s C++ only
    if language.lower() not in {"cpp", "c++"}:
        return {"status": "unsupported_language"}

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

        return run_test_cases(str(exe_file), project, stdin_args=stdin_args)
