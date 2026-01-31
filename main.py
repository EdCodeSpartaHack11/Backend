from fastapi import FastAPI, Depends
from starlette.middleware.sessions import SessionMiddleware

from core.config import settings
from auth.router import router as auth_router, get_current_user

app = FastAPI()

# Needed for the OAuth redirect flow (state stored in session)
app.add_middleware(SessionMiddleware, secret_key=settings.session_secret)

app.include_router(auth_router)

@app.get("/protected")
def protected(user=Depends(get_current_user)):
    return {"hello": user["email"], "user": user}
