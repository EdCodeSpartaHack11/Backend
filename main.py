from fastapi import FastAPI
from routers.first_router import router as items_router

app = FastAPI()


@app.get("/")
def root():
    return {"status": "ok"}

app.include_router(items_router, prefix="/test")

