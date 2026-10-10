"""
Diagnose what's in the ChromaDB store to see if policies are indexed.
"""
import sys
import os
sys.path.insert(0, '.')
sys.path.insert(0, 'server')

import chromadb
from chromadb.config import Settings as ChromaSettings

# Check two chroma store locations
for chroma_dir in ['./chroma_store', './server/chroma_store']:
    abs_dir = os.path.abspath(chroma_dir)
    print(f'\n=== Chroma at {abs_dir} ===')
    if not os.path.exists(abs_dir):
        print('  Does not exist')
        continue
    try:
        client = chromadb.PersistentClient(
            path=abs_dir,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        colls = client.list_collections()
        print(f'  Collections ({len(colls)}):')
        for c in colls:
            count = c.count()
            print(f'    {c.name}: {count} docs')
    except Exception as e:
        print(f'  Error: {e}')
