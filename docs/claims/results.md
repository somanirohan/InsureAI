# Claim Checklist Split Evaluation Results

**Evaluated At:** `2026-10-10T12:33:45.510742`  
**Total Fixtures Evaluated:** 8  
**Overall Split Accuracy:** `100.0%`  

## Quantitative Accuracy Metrics

| Metric | Count | Rate |
| :--- | :--- | :--- |
| Expected Items | 16 | 100% |
| Correctly Extracted Items | 16 | 100.0% |
| Wrongly Merged Items | 0 | 0.0% |
| Wrongly Split Items | 0 | 0.0% |
| Dropped Items | 0 | 0.0% |

## Fixture Level Breakdown

| Fixture Name | Category | Expected | Actual | Verdict |
| :--- | :--- | :--- | :--- | :--- |
| `numbered_list` | document_list | `discharge_summary, itemised_bills, diagnostic_reports` | `discharge_summary, itemised_bills, diagnostic_reports` | **PASS** |
| `bullet_text` | document_list | `discharge_summary, prescriptions, claim_form` | `discharge_summary, prescriptions, claim_form` | **PASS** |
| `documents_such_as` | document_list | `doctor_certificate, diagnostic_reports, itemised_bills` | `doctor_certificate, diagnostic_reports, itemised_bills` | **PASS** |
| `photocopy_id_proof` | document_list | `id_proof, discharge_summary` | `id_proof, discharge_summary` | **PASS** |
| `pathology_radiology_lab` | document_list | `diagnostic_reports, prescriptions` | `diagnostic_reports, prescriptions` | **PASS** |
| `cashless_preauth_72h` | requirement_deadline | `72 hours` | `72 hours` | **PASS** |
| `emergency_intimation_48h` | requirement_deadline | `48 hours` | `48 hours` | **PASS** |
| `unmapped_document_phrase` | unmapped_phrase | `other_<slug>` | `other_implant_invoice_barcode` | **PASS** |

## Summary

- **Zero LLM dependency**: 100% deterministic parsing using controlled vocabulary and regex tokenization.
- **Zero dropped requirements**: Unmatched document phrases fallback to `other_<slug>` with user confirmation.
- **Preserved compound synonyms**: Complex contractual phrases (e.g. *all itemised bills and receipts*) preserved without false splits.
