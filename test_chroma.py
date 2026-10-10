"""
Test ChromaDB indexing and vectorstore.
"""
import sys
import os
sys.path.insert(0, '.')
sys.path.insert(0, 'server')

from app.ingestion.pdf_extract import extract_pages
from app.ingestion.chunking import chunk_pages
from app.rag.vectorstore import index_chunks, query_similar, delete_policy_index

pdf_path = 'server/uploads/policies/1790519546_Rules.pdf'
policy_id = 'test_policy_xyz_123'

print('=== Testing ChromaDB indexing ===')

try:
    pages = extract_pages(pdf_path)
    chunks = chunk_pages(pages)
    print(f'Chunks to index: {len(chunks)}')
    
    # Clean up any existing test collection first
    delete_policy_index(policy_id)
    
    # Index chunks
    n = index_chunks(policy_id, chunks)
    print(f'Indexed: {n} chunks')
    
    # Query
    results = query_similar(policy_id, 'what is the premium amount', top_k=3)
    print(f'Query results: {len(results)}')
    for r in results:
        print(f'  chunk_id={r.chunk_id} page={r.page_number} sim={r.similarity:.3f} text={r.text[:80]!r}')
    
    # Clean up test collection
    delete_policy_index(policy_id)
    print('Test collection cleaned up')
    
except Exception as e:
    import traceback
    print(f'ERROR: {e}')
    traceback.print_exc()
