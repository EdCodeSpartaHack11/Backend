from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from passlib.context import CryptContext

from core.security import create_access_token
from users.repo import get_user_by_id
from users.repo import get_db  # or your actual function
from datetime import datetime, timezone

router = APIRouter(prefix="/auth", tags=["auth"])

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

class RegisterBody(BaseModel):
    email: str
    name: str = ""
    password: str

class LoginBody(BaseModel):
    email: str
    password: str

@router.post("/register")
def register(body: RegisterBody):
    # Validate password length
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    db = get_db()
    users = db.collection("users")

    user_id = body.email.lower().strip()
    ref = users.document(user_id)
    snap = ref.get()

    if snap.exists:
        raise HTTPException(status_code=409, detail="User already exists")

    now = datetime.now(timezone.utc).isoformat()
    
    # Hash the password before storing
    hashed_password = hash_password(body.password)
    
    user = {
        "id": user_id,
        "provider": "local_test",
        "email": body.email,
        "name": body.name,
        "password": hashed_password,  # Store hashed password
        "createdAt": now,
        "lastLoginAt": now,
    }
    ref.set(user)
    
    # Don't return password in response
    user_response = {k: v for k, v in user.items() if k != "password"}

    token = create_access_token(sub=user_id, email=body.email, minutes=60)
    return {"access_token": token, "token_type": "bearer", "user": user_response}

@router.post("/login")
def login(body: LoginBody):
    user_id = body.email.lower().strip()
    user = get_user_by_id(user_id)
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Verify password
    if "password" not in user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not verify_password(body.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Update last login time
    db = get_db()
    users = db.collection("users")
    ref = users.document(user_id)
    ref.update({"lastLoginAt": datetime.now(timezone.utc).isoformat()})
    
    # Don't return password in response
    user_response = {k: v for k, v in user.items() if k != "password"}

    token = create_access_token(sub=user_id, email=user["email"], minutes=60)
    return {"access_token": token, "token_type": "bearer", "user": user_response}
