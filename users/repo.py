from typing import Optional

# Replace with real DB logic.
_fake_users = {}

def get_or_create_user_by_google(email: str, name: str, google_sub: str) -> dict:
    # Key users by google_sub OR email (your choice)
    user = _fake_users.get(google_sub)
    if user:
        return user
    user = {"id": google_sub, "email": email, "name": name}
    _fake_users[google_sub] = user
    return user

def get_user_by_id(user_id: str) -> Optional[dict]:
    return _fake_users.get(user_id)
