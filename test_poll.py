"""
Poll the policy until ready or failed.
"""
import sys, os
sys.path.insert(0, '.')
sys.path.insert(0, 'server')

import asyncio
import time
from server.db import get_async_db

policy_id_str = '6aba4c09cc71f9065b67a605'

async def poll():
    db = get_async_db()
    from bson import ObjectId
    p_oid = ObjectId(policy_id_str)
    
    for i in range(20):
        p = await db.policies.find_one({'_id': p_oid})
        if p:
            status = p.get('status')
            error = p.get('processing_error')
            print(f'[{i}] status={status} | error={error}')
            if status in ('ready', 'failed'):
                break
        await asyncio.sleep(2)

asyncio.run(poll())
