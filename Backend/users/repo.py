# Backend/users/repo.py
from datetime import datetime, timezone
from typing import Optional, Dict, Any

import os
import firebase_admin
from firebase_admin import credentials, firestore
from google.auth.exceptions import DefaultCredentialsError

# --- Mock DB Implementation ---
class MockSnapshot:
    def __init__(self, data):
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return self._data

class MockDocument:
    def __init__(self, collection_data, doc_id):
        self._collection = collection_data
        self.id = doc_id

    def get(self):
        return MockSnapshot(self._collection.get(self.id))

    def set(self, data, merge=False):
        if merge and self.id in self._collection:
            self._collection[self.id].update(data)
        else:
            self._collection[self.id] = data

    def update(self, data):
        if self.id in self._collection:
            self._collection[self.id].update(data)

class MockCollection:
    def __init__(self):
        self._docs = {}

    def document(self, doc_id):
        return MockDocument(self._docs, doc_id)

class MockDB:
    def __init__(self):
        self._collections = {}
        print("\n" + "="*50)
        print(" WARNING: RUNNING WITH MOCK IN-MEMORY DATABASE ")
        print("="*50 + "\n")
        
        # Seed 'parts' collection for hackathon/testing
        # ID: cCh7Y68ZHHBFPmh92ild (from user request)
        self.collection("parts").document("cCh7Y68ZHHBFPmh92ild").set({
            "name": "Hello World Project",
            "description": "Simple C++ Hello World",
            "inputs": [""],
            "outputs": ["Hello World\n"],
            "time_limit_sec": 1.0,
            "next": None
        })
        
        # Also seed 'default_project' or generic IDs just in case
        self.collection("parts").document("default_project").set({
            "name": "Default Project",
            "inputs": [""],
            "outputs": ["Hello World\n"],
            "time_limit_sec": 1.0
        })

    def collection(self, name):
        if name not in self._collections:
            self._collections[name] = MockCollection()
        return self._collections[name]

# --- End Mock DB ---

_db = None

def get_db():
    global _db
    if _db is not None:
        return _db

    try:
        if not firebase_admin._apps:
            # Try to load from known path
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            # base_dir should be .../app
            cred_path = os.path.join(base_dir, "Secrets", "firebase-admin.json")
            
            if os.path.exists(cred_path):
                print(f"Loading credentials from: {cred_path}")
                cred = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred)
            else:
                # Fallback to default (ENV VAR)
                firebase_admin.initialize_app()
                
        _db = firestore.client()
        return _db
    except (DefaultCredentialsError, FileNotFoundError, RuntimeError, Exception) as e:
        print(f"Firebase init failed ({e}). Falling back to MockDB.")
        _db = MockDB()
        return _db


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
