from pydantic import BaseModel
import os

class Settings(BaseModel):
    google_client_id: str = os.getenv("GOOGLE_CLIENT_ID", "")
    google_client_secret: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    session_secret: str = os.getenv("SESSION_SECRET", "change-me")
    jwt_secret: str = os.getenv("JWT_SECRET", "change-me-too")
    jwt_issuer: str = os.getenv("JWT_ISSUER", "your-app")
    jwt_audience: str = os.getenv("JWT_AUDIENCE", "your-app-users")

settings = Settings()
