from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import Optional
from ai_utils import call_llm

router = APIRouter(prefix="/ai", tags=["ai"])

class TutorRequest(BaseModel):
    text_from_user: str
    code: Optional[str] = None
    project_description: str

@router.post("/tutor")
def ask_tutor(body: TutorRequest):
    try:
        response = call_llm(
            text_from_user=body.text_from_user,
            code=body.code,
            project_description=body.project_description
        )
        return {"response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
