/**
 * constants/index.js
 * Central place for all shared frontend constants.
 * Import from here — never hardcode these values in components.
 */

// ─── API ───────────────────────────────────────────────────
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

export const WS_CHAT_URL =
  import.meta.env.VITE_WS_URL || 'ws://localhost:5001/api/chat/ws';

// ─── Auth ──────────────────────────────────────────────────
export const TOKEN_KEY = 'medshield_token';
export const USER_KEY  = 'medshield_user';

// ─── Policy ────────────────────────────────────────────────
export const POLICY_STATUSES = {
  UPLOADING:  'uploading',
  EXTRACTING: 'extracting',
  INDEXED:    'indexed',
  READY:      'ready',
  FAILED:     'failed',
};

export const POLICY_TYPES = [
  { value: 'individual_health', label: 'Individual Health Insurance' },
  { value: 'family_floater',    label: 'Family Floater' },
  { value: 'group_health',      label: 'Group Health (Corporate)' },
  { value: 'critical_illness',  label: 'Critical Illness Plan' },
  { value: 'other',             label: 'Other / Top-Up' },
];

export const INSURERS = [
  'Star Health & Allied Insurance',
  'HDFC ERGO General Insurance',
  'Care Health Insurance (Religare)',
  'Niva Bupa Health Insurance',
  'ICICI Lombard Complete Health',
  'Other Insurer',
];

// ─── Cost Estimator ────────────────────────────────────────
export const TREATMENTS = [
  { value: 'Knee Replacement',         label: 'Knee Replacement (Orthopedic)' },
  { value: 'Angioplasty',              label: 'Angioplasty / Stent (Cardiology)' },
  { value: 'Cataract Surgery',         label: 'Cataract Surgery (Daycare)' },
  { value: 'Appendectomy',             label: 'Appendectomy (General Surgery)' },
  { value: 'Gallbladder Removal',      label: 'Gallbladder Removal (Laparoscopic)' },
  { value: 'Cardiac Bypass (CABG)',    label: 'Cardiac Bypass CABG' },
  { value: 'Chemotherapy (per cycle)', label: 'Chemotherapy (per cycle)' },
];

export const HOSPITAL_TIERS = [
  { value: 'tier_1', label: 'Tier 1 — Metro Super Specialty' },
  { value: 'tier_2', label: 'Tier 2 — Non-Metro Private' },
  { value: 'tier_3', label: 'Tier 3 — District / Semi-Urban' },
];

// ─── Chat ──────────────────────────────────────────────────
export const SAMPLE_QUESTIONS = [
  "What's my room-rent limit per day?",
  "Is there any co-payment for Tier 1 hospitals?",
  "What is the waiting period for pre-existing diseases?",
  "What are the major exclusions under this policy?",
];

// ─── Fact Categories ───────────────────────────────────────
export const FACT_CATEGORY_META = {
  coverage_category: { label: 'Coverage',        color: 'text-blue-600' },
  sum_insured:       { label: 'Sum Insured',      color: 'text-green-600' },
  sub_limit:         { label: 'Sub-Limit',        color: 'text-purple-600' },
  waiting_period:    { label: 'Waiting Period',   color: 'text-amber-600' },
  exclusion:         { label: 'Exclusion',        color: 'text-red-600' },
  room_rent_limit:   { label: 'Room Rent',        color: 'text-orange-600' },
  co_payment:        { label: 'Co-Payment',       color: 'text-yellow-600' },
  deductible:        { label: 'Deductible',       color: 'text-pink-600' },
  claim_condition:   { label: 'Claim Condition',  color: 'text-cyan-600' },
};
