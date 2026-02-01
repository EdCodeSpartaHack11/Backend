
# from ast import Dict
# from http.client import HTTPException

# from pydantic import BaseModel
# from fastapi import APIRouter
# from .cpp_file_compile import run_test_cases, compile_cpp, run_exe
# router = APIRouter()
# import tempfile
# from pathlib import Path

# def run_submission(code: str, project: str, language: str, stdin_args: str = "") -> dict:

#     with tempfile.TemporaryDirectory(prefix="judge_") as td:
#         work = Path(td)
#         cpp_path = work / "main.cpp"
#         exe_path = work / "prog"

#         # Write code string -> file
#         cpp_path.write_text(code, encoding="utf-8")

#         # Compile
#         c_rc, c_out, c_err = compile_cpp(str(cpp_path))
#         if c_rc != 0:
#             return {
#                 "status": "compile_error",
#                 "compile_stderr": c_err,
#                 "compile_stdout": c_out,
#                 "tests": [],
#             }

#         results = run_test_cases(cpp_path, (project))
#         return results

# class SubmitRequest(BaseModel):
#     project_id: str
#     language: str
#     code: str
#     stdin_args: str

# @router.post("/submit")
# def submit(req: SubmitRequest) -> dict:
#     # run judge
#     result = run_submission(
#         project=req.project_id,
#         code=req.code,
#         language=req.language,
#         stdin_args=req.stdin_args,
#     )
#     return {
#         "project_id": req.project_id,
#         **result,
#     }

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .cpp_file_compile import run_submission

router = APIRouter()


class SubmitRequest(BaseModel):
    project_id: str
    language: str
    code: str
    stdin_args: str = ""

class CompleteRequest(BaseModel):
    project_id: str
    email: str


@router.post("/submit")
def submit(req: SubmitRequest) -> dict:
    # For hackathon: support only C++ for now
    if req.language.lower() not in {"cpp", "c++"}:
        raise HTTPException(status_code=400, detail="Only C++ is supported right now (language=cpp).")

    result = run_submission(
        project_id=req.project_id,
        language=req.language,
        code=req.code,
        stdin_args=req.stdin_args or "",
    )

    if result.get("status") == "unknown_project":
        raise HTTPException(status_code=404, detail=f"Unknown project_id: {req.project_id}")

    return {"project_id": req.project_id, **result}


@router.post("/complete")
def complete(req: CompleteRequest):
    from users.repo import get_db
    from datetime import datetime, timezone
    
    db = get_db()
    
    # "The following need to be logged: date: firebase datetime, part : "part/part_id", "uid" : email_id"
    data = {
        "date": datetime.now(timezone.utc),
        "part": f"parts/{req.project_id}",
        "uid": req.email
    }
    
    try:
        db.collection("contributions").add(data)
        return {"status": "success", "message": "Contribution logged"}
    except Exception as e:
        print(f"Error logging contribution: {e}")
        raise HTTPException(status_code=500, detail=str(e))
