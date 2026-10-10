"""
Test the full policy processing pipeline end-to-end.
"""
import sys
import os
import asyncio
sys.path.insert(0, '.')
sys.path.insert(0, 'server')

from server.services.policy_service import _blocking_extraction_pipeline
from server.services.fact_mapper import rag_facts_to_mongo_facts

pdf_path = 'server/uploads/policies/1790519546_Rules.pdf'

print('=== Testing full extraction pipeline ===')
print(f'PDF: {pdf_path}')
print(f'Exists: {os.path.exists(pdf_path)}')
print()

try:
    pages, chunks, rag_facts = _blocking_extraction_pipeline(pdf_path)
    print(f'Pages: {len(pages)}')
    print(f'Chunks: {len(chunks)}')
    print('RAG facts:')
    for k, v in rag_facts.items():
        if isinstance(v, list):
            print(f'  {k}: {len(v)} items')
        else:
            print(f'  {k}: {v}')
    
    print()
    mongo_facts = rag_facts_to_mongo_facts(rag_facts)
    print(f'Mongo facts: {len(mongo_facts)} items')
    for f in mongo_facts:
        print(f'  {f["category"]} | {f["fact_key"]}: {f["fact_value"][:60]}')
        
except Exception as e:
    import traceback
    print(f'ERROR: {e}')
    traceback.print_exc()
