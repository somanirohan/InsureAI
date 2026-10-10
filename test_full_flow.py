"""
Test upload with demo credentials and watch the result.
"""
import sys, os, time
sys.path.insert(0, '.')
sys.path.insert(0, 'server')

import requests

BASE_URL = 'http://localhost:5001/api'

# Login with demo user
login_resp = requests.post(f'{BASE_URL}/auth/login', json={
    'email': 'demo@medshield.ai',
    'password': 'password123'
}, timeout=10)
print(f'Login: {login_resp.status_code}')
if login_resp.status_code != 200:
    print('Login failed:', login_resp.text)
    sys.exit(1)

token = login_resp.json().get('token')
print(f'Token: OK')
headers = {'Authorization': f'Bearer {token}'}

# Upload a policy PDF
pdf_path = 'server/uploads/policies/1790519546_Rules.pdf'
print(f'\nUploading: {pdf_path}')

with open(pdf_path, 'rb') as f:
    upload_resp = requests.post(
        f'{BASE_URL}/policies/upload',
        headers=headers,
        files={'file': ('PMSBY_Rules.pdf', f, 'application/pdf')},
        timeout=30,
    )

print(f'Upload status: {upload_resp.status_code}')
data = upload_resp.json()
print(f'Response: {data}')

if upload_resp.status_code == 201:
    policy_id = data['policy']['_id']
    print(f'\nPolling policy {policy_id}...')
    
    for i in range(30):
        time.sleep(2)
        poll = requests.get(f'{BASE_URL}/policies/{policy_id}', headers=headers)
        if poll.status_code == 200:
            pol = poll.json()['policy']
            status = pol.get('status')
            print(f'  [{i}] status={status}')
            if status == 'ready':
                print('\n=== Policy is READY! ===')
                print(f'insurer_name: {pol.get("insurer_name")}')
                print(f'policy_type: {pol.get("policy_type")}')
                print(f'sum_insured: {pol.get("sum_insured")}')
                print(f'premium_amount: {pol.get("premium_amount")}')
                print(f'facts count: {len(pol.get("facts", []))}')
                print(f'red_flag_summary: {pol.get("red_flag_summary")}')
                break
            elif status == 'failed':
                print(f'\n=== Policy FAILED! ===')
                print(f'error: {pol.get("processing_error")}')
                break
