from fastapi import APIRouter, Request, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from auth.google import oauth
from users.repo import get_or_create_user_by_google, get_user_by_id
from core.security import create_access_token, decode_access_token

router = APIRouter(prefix="/auth", tags=["auth"])
bearer = HTTPBearer(auto_error=False)

@router.get("/login")
async def login(request: Request):
    redirect_uri = request.url_for("auth_callback")
    return await oauth.google.authorize_redirect(request, redirect_uri)

@router.get("/callback", name="auth_callback")
async def callback(request: Request):
    token = await oauth.google.authorize_access_token(request)
    # OIDC user info (validated ID token)
    google_user = await oauth.google.parse_id_token(request, token)

    email = google_user.get("email")
    name = google_user.get("name") or google_user.get("given_name") or ""
    sub = google_user.get("sub")  # stable Google user id

    if not email or not sub:
        raise HTTPException(status_code=400, detail="Google profile missing email/sub")

    # Connect to your app user record
    user = get_or_create_user_by_google(email=email, name=name, google_sub=sub)

    # Issue your app JWT
    app_token = create_access_token(sub=user["id"], email=user["email"], minutes=60)

    # Choose one:
    # 1) return JSON token (SPA-friendly)
    return {"access_token": app_token, "token_type": "bearer", "user": user}

    # 2) OR set cookie and redirect (web app style):
    # resp = RedirectResponse(url="/")
    # resp.set_cookie("access_token", app_token, httponly=True, secure=True, samesite="lax")
    # return resp

def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
):
    if not creds:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    payload = decode_access_token(creds.credentials)
    user_id = payload["sub"]
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
