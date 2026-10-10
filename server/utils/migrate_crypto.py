"""
Database migration script to secure existing MongoDB documents.
Applies SHA-256 hashes (for blind indexing, uniqueness, and fast lookups)
and AES-256-GCM encryption at rest to critical fields across users, claims, and policies.
"""

import sys
from pathlib import Path

repo_root = Path(__file__).resolve().parent.parent.parent
server_dir = repo_root / "server"
for p in (str(repo_root), str(server_dir)):
    if p not in sys.path:
        sys.path.insert(0, p)

from server.db import get_sync_db
from server.services.crypto_service import migrate_database_records


def run_migration():
    print("\n" + "=" * 60)
    print(" INSURAI MONGODB SECURITY MIGRATION ")
    print("=" * 60)
    print("[Migration] Connecting to MongoDB...")

    try:
        db = get_sync_db()
        print(f"[Migration] Connected to database: {db.name}")

        counts = migrate_database_records(db)
        print(f"[Migration] Successfully migrated records:")
        print(f"  - Users secured:    {counts['users']}")
        print(f"  - Claims secured:   {counts['claims']}")
        print(f"  - Policies secured: {counts['policies']}")
        print("\nAll sensitive fields are now SHA-256 hashed and encrypted at rest.")
    except Exception as exc:
        print(f"[Migration ERROR] Failed to complete migration: {exc}")


if __name__ == "__main__":
    run_migration()
