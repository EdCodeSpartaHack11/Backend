from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from auth.router import router as auth_router
from routers.ai_router import router as ai_router
from routers.submit import router as submit_router


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    # Allow ANY localhost/127.0.0.1 port in dev (5173, 3000, 5174, etc.)
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(ai_router)
#app.include_router(auth_router)
app.include_router(submit_router)

@app.get("/health")
def health():
    return {"ok": True}

@app.get("/debug/firestore")
def debug_firestore():
    # This will force Firestore init and give a clean error if creds missing
    from users.repo import get_db
    db = get_db()
    return {"ok": True, "project": db.project}
