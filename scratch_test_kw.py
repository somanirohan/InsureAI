import re
from app.ingestion.pdf_extract import extract_pages

def check_policy(pages):
    full_text = ' '.join(p.text.lower() for p in pages)
    
    core_terms = ['insurance', 'insured', 'insurer', 'policyholder', 'proposer', 'underwriting', 'mediclaim', 'policy schedule', 'irdai', 'irda']
    term_terms = ['sum insured', 'premium', 'deductible', 'co-pay', 'copay', 'room rent', 'no claim bonus', 'ncb', 'restoration', 'coverage']
    clause_terms = ['waiting period', 'exclusion', 'exclusions', 'pre-existing', 'hospitalization', 'in-patient', 'day care', 'cashless', 'reimbursement', 'tpa', 'critical illness', 'claim procedure', 'claim settlement', 'grace period', 'domiciliary', 'ayush', 'maternity']
    
    matched_core = [t for t in core_terms if t in full_text]
    matched_term = [t for t in term_terms if t in full_text]
    matched_clause = [t for t in clause_terms if t in full_text]
    
    cleaned_policy_text = re.sub(r'(privacy|cookie|terms of service)\s+policy', '', full_text)
    has_policy_word = 'policy' in cleaned_policy_text
    
    total_distinct = len(matched_core) + len(matched_term) + len(matched_clause) + (1 if has_policy_word else 0)
    
    print('Core:', matched_core)
    print('Terms:', matched_term)
    print('Clauses:', matched_clause)
    print('Has policy word:', has_policy_word)
    print('Total distinct:', total_distinct)

print('=== Rules.pdf ===')
check_policy(extract_pages('server/uploads/policies/1790519546_Rules.pdf'))

print('\n=== Prescription ===')
check_policy(extract_pages('server/uploads/policies/1790519030_prescription_Mayank_Chandak.pdf'))
