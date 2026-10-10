import sys
sys.path.insert(0, '.')
sys.path.insert(0, 'server')

import asyncio
from server.db import get_async_db

async def check():
    db = get_async_db()
    policies = await db.policies.find({}).sort('uploaded_at', -1).to_list(length=20)
    print(f'Found {len(policies)} policies in DB')
    for p in policies:
        pid = str(p.get('_id', ''))
        status = p.get('status', '?')
        fname = p.get('file_name', '?')
        error = p.get('processing_error', None)
        fpath = p.get('file_path', '?')
        print(f'  ID={pid} | status={status} | file={fname}')
        print(f'    path={fpath}')
        if error:
            print(f'    error={error[:150]}')

asyncio.run(check())
