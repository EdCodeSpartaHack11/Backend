# Backend/db/firestore.py
import firebase_admin
from firebase_admin import firestore

_db = None

def get_db():
    global _db
    if _db is not None:
        return _db

    if not firebase_admin._apps:
        firebase_admin.initialize_app()  # uses GOOGLE_APPLICATION_CREDENTIALS

    _db = firestore.client()
    return _db
