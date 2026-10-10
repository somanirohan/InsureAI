"""
Simulate what process_policy_document does from server/ context.
"""
import sys, os
sys.path.insert(0, '..')
sys.path.insert(0, '.')

import asyncio
from services.policy_service import _blocking_extraction_pipeline
from services.fact_mapper import rag_facts_to_mongo_facts
from app.rag.vectorstore import index_chunks
from app.config import settings

print(f'CWD: {os.getcwd()}')
print(f'Chroma dir: {os.path.abspath(settings.chroma_persist_dir)}')

# Test the exact file_path stored in MongoDB
file_path = 'uploads/policies/1790519546_Rules.pdf'
policy_id = '6ab97652a6922f797d280e36'  # Rules.pdf policy ID

print(f'\nFile path: {file_path}')
print(f'Exists: {os.path.exists(file_path)}')

try:
    print('\n--- Running extraction pipeline ---')
    pages, chunks, rag_facts = _blocking_extraction_pipeline(file_path)
    print(f'Pages: {len(pages)}, Chunks: {len(chunks)}')
    
    print('\n--- Indexing into ChromaDB ---')
    n = index_chunks(policy_id, chunks)
    print(f'Indexed {n} chunks')
    
    print('\n--- Facts ---')
    mongo_facts = rag_facts_to_mongo_facts(rag_facts)
    for f in mongo_facts:
        print(f"  {f['category']} | {f['fact_key']}: {f['fact_value'][:60]}")
        
except Exception as e:
    import traceback
    print(f'ERROR: {e}')
    traceback.print_exc()
