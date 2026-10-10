"""
Test the upload endpoint - get an existing user token and test upload.
"""
import sys, os
sys.path.insert(0, '.')
sys.path.insert(0, 'server')

import requests
import asyncio
from server.db import get_async_db

BASE_URL = 'http://localhost:5001/api'

async def get_user_email():
    db = get_async_db()
    user = await db.users.find_one({})
    if user:
        return user.get('email')
    return None

email = asyncio.run(get_user_email())
print(f'Using email: {email}')

# Try to register with the correct field name
reg_resp = requests.post(f'{BASE_URL}/auth/register', json={
    'full_name': 'Test Upload User',
    'email': 'testupload2@insureai.com',
    'password': 'TestPass123!',
    'phone': None
}, timeout=10)
print(f'Register: {reg_resp.status_code}')
if reg_resp.status_code in (200, 201):
    data = reg_resp.json()
    token = data.get('token')
    print(f'Got token: {token[:30]}...' if token else 'No token!')

    headers = {'Authorization': f'Bearer {token}'}

    pdf_path = 'server/uploads/policies/1790519546_Rules.pdf'
    with open(pdf_path, 'rb') as f:
        upload_resp = requests.post(
            f'{BASE_URL}/policies/upload',
            headers=headers,
            files={'file': ('Rules_test.pdf', f, 'application/pdf')},
            timeout=30,
        )

    print(f'\nUpload status: {upload_resp.status_code}')
    print(f'Upload response: {upload_resp.text[:800]}')
else:
    print(f'Register failed: {reg_resp.text[:300]}')
