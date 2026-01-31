from fastapi import FastAPI
from fastapi.responses import JSONResponse
from auth.router import router as auth_router
from routers.ai_router import router as ai_router

app = FastAPI()
app.include_router(auth_router)
app.include_router(ai_router)

@app.get("/health")
def health():
    return {"ok": True}

@app.get("/debug/firestore")
def debug_firestore():
    # This will force Firestore init and give a clean error if creds missing
    from users.repo import get_db
    db = get_db()
    return {"ok": True, "project": db.project}
