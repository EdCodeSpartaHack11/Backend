from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.security import create_access_token
from users.repo import get_user_by_id
from users.repo import get_db  # or your actual function
from datetime import datetime, timezone

router = APIRouter(prefix="/auth", tags=["auth"])

class RegisterBody(BaseModel):
    email: str
    name: str = ""

class LoginBody(BaseModel):
    email: str

@router.post("/register")
def register(body: RegisterBody):
    # simple "register": create a user doc keyed by email for now
    db = get_db()
    users = db.collection("users")

    user_id = body.email.lower().strip()   # OK for testing; later use google sub
    ref = users.document(user_id)
    snap = ref.get()

    if snap.exists:
        raise HTTPException(status_code=409, detail="User already exists")

    now = datetime.now(timezone.utc).isoformat()
    user = {
        "id": user_id,
        "provider": "local_test",
        "email": body.email,
        "name": body.name,
        "createdAt": now,
        "lastLoginAt": now,
    }
    ref.set(user)

    token = create_access_token(sub=user_id, email=body.email, minutes=60)
    return {"access_token": token, "token_type": "bearer", "user": user}

@router.post("/login")
def login(body: LoginBody):
    user_id = body.email.lower().strip()
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="No such user (register first)")

    token = create_access_token(sub=user_id, email=user["email"], minutes=60)
    return {"access_token": token, "token_type": "bearer", "user": user}
