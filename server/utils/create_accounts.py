import sys
from pathlib import Path
repo_root = Path(__file__).resolve().parent.parent.parent
server_dir = repo_root / "server"
for p in (str(repo_root), str(server_dir)):
    if p not in sys.path:
        sys.path.insert(0, p)

from datetime import datetime, timedelta
from bson import ObjectId
from server.db import get_sync_db
from server.services.auth_service import hash_password, verify_password
from server.services.crypto_service import build_user_email_query, secure_user_data, unsecure_user_data

def setup_accounts():
    db = get_sync_db()

    accounts = [
        {
            "email": "demo@insurai.com",
            "full_name": "Dr. Arjun Verma",
            "phone": "+91 98765 43210",
            "password": "password123",
            "role": "Primary Doctor / Comprehensive Policyholder"
        },
        {
            "email": "rohan@insurai.com",
            "full_name": "Rohan Somani",
            "phone": "+91 98111 22334",
            "password": "password123",
            "role": "Admin / Lead Developer"
        },
        {
            "email": "priya.sharma@example.com",
            "full_name": "Priya Sharma",
            "phone": "+91 98222 33445",
            "password": "password123",
            "role": "Senior / Family Floater Plan"
        },
        {
            "email": "rahul.mehta@example.com",
            "full_name": "Rahul Mehta",
            "phone": "+91 98333 44556",
            "password": "password123",
            "role": "Individual Health Policyholder"
        },
        {
            "email": "testuser@insurai.com",
            "full_name": "Alex Taylor",
            "phone": "+91 98444 55667",
            "password": "password123",
            "role": "Fresh User (Clean State / First-Time Upload Testing)"
        }
    ]

    for acc in accounts:
        pwd_hash = hash_password(acc["password"])
        existing = db.users.find_one(build_user_email_query(acc["email"]))
        if existing:
            update_payload = secure_user_data({
                "password_hash": pwd_hash,
                "full_name": acc["full_name"],
                "email": acc["email"],
                "phone": acc["phone"],
                "is_active": True,
            })
            db.users.update_one(
                {"_id": existing["_id"]},
                {"$set": update_payload}
            )
            print(f"Updated user: {acc['email']}")
        else:
            raw_doc = {
                "_id": ObjectId(),
                "full_name": acc["full_name"],
                "email": acc["email"],
                "password_hash": pwd_hash,
                "phone": acc["phone"],
                "is_active": True,
                "created_at": datetime.utcnow() - timedelta(days=5),
                "last_login_at": datetime.utcnow()
            }
            doc = secure_user_data(raw_doc)
            db.users.insert_one(doc)
            print(f"Created user: {acc['email']}")

    print("\nVerifying credentials for all 5 accounts:")
    for acc in accounts:
        u = db.users.find_one(build_user_email_query(acc["email"]))
        unsecured_u = unsecure_user_data(u)
        ok = verify_password(acc["password"], u["password_hash"])
        print(f" -> {unsecured_u['email']} ({unsecured_u['full_name']}) | pwd: {acc['password']} | verified: {ok} | email_hash: {u.get('email_hash')[:16]}...")

if __name__ == "__main__":
    setup_accounts()
