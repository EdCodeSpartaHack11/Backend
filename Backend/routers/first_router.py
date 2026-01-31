from fastapi import APIRouter

router = APIRouter()

@router.get("/first")
def get_first():
    return {"message": "This is the first router"}
