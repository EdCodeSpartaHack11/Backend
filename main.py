from fastapi import FastAPI, Depends
from starlette.middleware.sessions import SessionMiddleware

from core.config import settings
from auth import router as auth_router#, get_current_user
from routers.submit import router as rt

app = FastAPI()
#app.include_router(auth_router)
app.include_router(rt)

@app.get("/health")
def health():
    return {"ok": True}

@app.get("/debug/firestore")
def debug_firestore():
    # This will force Firestore init and give a clean error if creds missing
    from users.repo import get_db
    db = get_db()
    return {"ok": True, "project": db.project}
