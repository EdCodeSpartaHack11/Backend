# Backend/users/repo.py
from datetime import datetime, timezone
from typing import Optional, Dict, Any

import os
import firebase_admin
from firebase_admin import firestore
from google.auth.exceptions import DefaultCredentialsError

_db = None

def get_db():
    global _db
    if _db is not None:
        return _db

    try:
        if not firebase_admin._apps:
            firebase_admin.initialize_app()  # uses GOOGLE_APPLICATION_CREDENTIALS or ADC
        _db = firestore.client()
        return _db
    except DefaultCredentialsError as e:
        # Raise a clear runtime error only when DB is actually used
        raise RuntimeError(
            "Firestore credentials missing. Set GOOGLE_APPLICATION_CREDENTIALS to your "
            "Firebase service account JSON, or run `gcloud auth application-default login`."
        ) from e


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    db = get_db()
    snap = db.collection("users").document(user_id).get()
    return snap.to_dict() if snap.exists else None


def get_or_create_user_from_google(
    *, google_sub: str, email: str, name: str, picture: str = "", email_verified: bool = False
) -> Dict[str, Any]:
    db = get_db()
    users = db.collection("users")
    ref = users.document(google_sub)
    snap = ref.get()

    now = datetime.now(timezone.utc).isoformat()

    if not snap.exists:
        user = {
            "id": google_sub,
            "provider": "google",
            "email": email,
            "name": name,
            "picture": picture,
            "emailVerified": bool(email_verified),
            "createdAt": now,
            "lastLoginAt": now,
        }
        ref.set(user)
        return user

    # existing user => update login fields
    ref.set(
        {
            "name": name,
            "picture": picture,
            "emailVerified": bool(email_verified),
            "lastLoginAt": now,
        },
        merge=True,
    )
    return ref.get().to_dict()
