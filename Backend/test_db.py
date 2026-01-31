from users.repo import get_db
import sys

try:
    print("Getting DB...")
    db = get_db()
    print("DB Client obtained. Trying to read...")
    
    # Try a simple read
    doc = db.collection("test").document("ping").get()
    print("Read success:", doc.exists)

except Exception as e:
    print("FAILED with error:", e)
    sys.exit(1)
