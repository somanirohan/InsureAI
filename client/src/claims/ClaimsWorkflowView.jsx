import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Plus,
  ArrowLeft,
  Activity,
  CheckCircle2,
  FileCheck,
  Receipt,
  FileText,
  Clock,
  Building,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import api from '../services/api';
import { Spinner, EmptyState, ErrorBanner } from '../components/common/ui';

import TreatmentForm from './TreatmentForm';
import EligibilityCard from './EligibilityCard';
import DocumentChecklistSection from './DocumentChecklistSection';
import SettlementReceiptCard from './SettlementReceiptCard';
import ClaimReviewScreen from './ClaimReviewScreen';
import ManualStatusTracker from './ManualStatusTracker';
import QualitativeReadinessCard from './QualitativeReadinessCard';

const STEPS = [
  { id: 'treatment', label: '1. Treatment', icon: Activity },
  { id: 'eligibility', label: '2. Eligibility', icon: CheckCircle2 },
  { id: 'checklist', label: '3. Checklist & Docs', icon: FileCheck },
  { id: 'settlement', label: '4. Settlement Math', icon: Receipt },
  { id: 'review', label: '5. Review & Submit', icon: FileText },
  { id: 'tracking', label: '6. Status Tracker', icon: Clock },
];

export default function ClaimsWorkflowView({ policies = [] }) {
  const [claims, setClaims] = useState([]);
  const [activeClaimId, setActiveClaimId] = useState(null);
  const [activeClaim, setActiveClaim] = useState(null);
  const [activeStep, setActiveStep] = useState('treatment');

  const [loadingClaims, setLoadingClaims] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState(null);
  const [error, setError] = useState(null);

  // Review screen data
  const [reviewData, setReviewData] = useState(null);

  // New claim modal
  const [isCreatingModal, setIsCreatingModal] = useState(false);
  const [selectedPolicyId, setSelectedPolicyId] = useState('');

  // Fetch all user claims
  const fetchClaims = useCallback(async () => {
    try {
      setLoadingClaims(true);
      const res = await api.get('/claims');
      setClaims(res.data.claims || []);
    } catch (err) {
      console.error('Error fetching claims:', err);
      setError(err.response?.data?.detail || 'Failed to load claims');
    } finally {
      setLoadingClaims(false);
    }
  }, []);

  // Fetch full details of single claim
  const fetchClaimDetails = useCallback(async (claimId) => {
    try {
      setActionLoading(true);
      const res = await api.get(`/claims/${claimId}`);
      const c = res.data.claim;
      setActiveClaim(c);

      // Determine initial active step based on claim lifecycle
      if (['submitted', 'under_review', 'query_raised', 'settled', 'rejected'].includes(c.status)) {
        setActiveStep('tracking');
      } else if (c.status === 'ready_to_submit') {
        setActiveStep('review');
      } else if (!c.treatment) {
        setActiveStep('treatment');
      } else if (!c.eligibility_result) {
        setActiveStep('eligibility');
      } else {
        setActiveStep('checklist');
      }
    } catch (err) {
      console.error('Error fetching claim details:', err);
      setError(err.response?.data?.detail || 'Failed to load claim details');
    } finally {
      setActionLoading(false);
    }
  }, []);

  // Fetch review dossier data
  const fetchReviewData = useCallback(async (claimId) => {
    try {
      const res = await api.get(`/claims/${claimId}/review`);
      setReviewData(res.data);
    } catch (err) {
      console.error('Error fetching review data:', err);
    }
  }, []);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  useEffect(() => {
    if (activeClaimId) {
      fetchClaimDetails(activeClaimId);
    }
  }, [activeClaimId, fetchClaimDetails]);

  useEffect(() => {
    if (activeClaimId && activeStep === 'review') {
      fetchReviewData(activeClaimId);
    }
  }, [activeClaimId, activeStep, fetchReviewData]);

  // Create new claim
  const handleCreateClaim = async (e) => {
    e.preventDefault();
    if (!selectedPolicyId) return;

    try {
      setActionLoading(true);
      const res = await api.post('/claims', { policy_id: selectedPolicyId });
      const newClaim = res.data.claim;
      setIsCreatingModal(false);
      setSelectedPolicyId('');
      await fetchClaims();
      setActiveClaimId(newClaim.claim_id);
    } catch (err) {
      console.error('Error creating claim:', err);
      setError(err.response?.data?.detail || 'Failed to initialize claim');
    } finally {
      setActionLoading(false);
    }
  };

  // Update treatment and trigger eligibility check
  const handleSaveTreatment = async (treatmentData) => {
    try {
      setActionLoading(true);
      const res = await api.put(`/claims/${activeClaimId}/treatment`, treatmentData);
      setActiveClaim(res.data.claim);

      // Auto-evaluate eligibility
      const eligRes = await api.post(`/claims/${activeClaimId}/eligibility`);
      setActiveClaim(eligRes.data.claim);

      // Refresh checklist
      const checkRes = await api.post(`/claims/${activeClaimId}/checklist`);
      setActiveClaim(checkRes.data.claim);

      setActiveStep('eligibility');
    } catch (err) {
      console.error('Error updating treatment:', err);
      setError(err.response?.data?.detail || 'Failed to update treatment');
    } finally {
      setActionLoading(false);
    }
  };

  // Re-evaluate eligibility
  const handleReevaluateEligibility = async () => {
    try {
      setActionLoading(true);
      const eligRes = await api.post(`/claims/${activeClaimId}/eligibility`);
      setActiveClaim(eligRes.data.claim);
    } catch (err) {
      console.error('Error re-evaluating eligibility:', err);
      setError(err.response?.data?.detail || 'Failed to evaluate eligibility');
    } finally {
      setActionLoading(false);
    }
  };

  // Upload document for a slot
  const handleUploadDocument = async (itemId, file) => {
    try {
      setUploadingSlot(itemId);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('item_id', itemId);

      const res = await api.post(`/claims/${activeClaimId}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setActiveClaim(res.data.claim);

      // Auto recalculate settlement
      const settleRes = await api.post(`/claims/${activeClaimId}/settlement`);
      setActiveClaim(prev => ({ ...prev, settlement_estimate: settleRes.data.settlement_estimate }));
    } catch (err) {
      console.error('Error uploading document:', err);
      setError(err.response?.data?.detail || 'Document upload/validation failed');
    } finally {
      setUploadingSlot(null);
    }
  };

  // Confirm manual document fields
  const handleConfirmDocument = async (docId, fields) => {
    try {
      setActionLoading(true);
      const res = await api.put(`/claims/${activeClaimId}/documents/${docId}/confirm`, {
        confirmed_fields: fields,
      });
      setActiveClaim(res.data.claim);

      // Auto recalculate settlement
      const settleRes = await api.post(`/claims/${activeClaimId}/settlement`);
      setActiveClaim(prev => ({ ...prev, settlement_estimate: settleRes.data.settlement_estimate }));
    } catch (err) {
      console.error('Error confirming document fields:', err);
      setError(err.response?.data?.detail || 'Failed to confirm document');
    } finally {
      setActionLoading(false);
    }
  };

  // Recalculate settlement
  const handleRecalculateSettlement = async () => {
    try {
      setActionLoading(true);
      const res = await api.post(`/claims/${activeClaimId}/settlement`);
      setActiveClaim(prev => ({ ...prev, settlement_estimate: res.data.settlement_estimate }));
    } catch (err) {
      console.error('Error recalculating settlement:', err);
      setError(err.response?.data?.detail || 'Failed to calculate settlement');
    } finally {
      setActionLoading(false);
    }
  };

  // Transition claim status
  const handleStatusTransition = async (nextStatus, note) => {
    try {
      setActionLoading(true);
      const res = await api.post(`/claims/${activeClaimId}/status`, {
        status: nextStatus,
        note,
      });
      setActiveClaim(res.data.claim);
      await fetchClaims();
    } catch (err) {
      console.error('Error transitioning status:', err);
      setError(err.response?.data?.detail || 'Status transition rejected');
    } finally {
      setActionLoading(false);
    }
  };

  // Final submit claim
  const handleSubmitClaim = async () => {
    try {
      setActionLoading(true);
      await handleStatusTransition('submitted', 'Claim officially filed by policyholder');
      setActiveStep('tracking');
    } catch (err) {
      console.error('Submit claim error:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // ── Render List of Claims ──────────────────────────────────────────────────
  if (!activeClaimId) {
    return (
      <div className="space-y-8">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-headline text-2xl sm:text-3xl font-extrabold text-[#062327] tracking-tight">
                Claim Readiness & Settlement
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#d2f57b]/30 text-[#062327] border border-[#062327]/15">
                Policy Grounded
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#558187] mt-1 font-medium max-w-2xl">
              Deterministic, policy-cited preparation from First Notice of Loss to settlement tracking without hallucination.
            </p>
          </div>

          <button
            onClick={() => setIsCreatingModal(true)}
            className="btn-pill-lime py-3 px-6 text-xs sm:text-sm font-bold shadow-md cursor-pointer flex items-center gap-2 self-start sm:self-auto"
          >
            <Plus size={16} />
            <span>New Claim</span>
          </button>
        </div>

        {loadingClaims ? (
          <div className="flex justify-center py-16">
            <Spinner size="md" />
          </div>
        ) : claims.length === 0 ? (
          <EmptyState
            icon={FileCheck}
            title="No Claims Initialized Yet"
            description="Create a claim against an uploaded policy to verify eligibility, prepare documents, and estimate settlement."
            action={
              <button
                onClick={() => setIsCreatingModal(true)}
                className="btn-pill-lime py-3 px-6 text-xs font-bold shadow-md cursor-pointer flex items-center gap-2"
              >
                <Plus size={15} />
                <span>Initialize First Claim</span>
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {claims.map((c) => {
              const matchedPolicy = policies.find(p => p._id === c.policy_id || p.id === c.policy_id);
              const treatment = c.treatment;

              return (
                <div
                  key={c.claim_id}
                  onClick={() => setActiveClaimId(c.claim_id)}
                  className="bg-white border border-[#062327]/10 rounded-3xl p-6 hover:border-[#062327]/30 hover:shadow-[0_6px_24px_rgba(6,35,39,0.08)] cursor-pointer transition-all group flex flex-col justify-between gap-5 shadow-sm"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[11px] font-mono text-[#558187] font-semibold">
                        ID: {c.claim_id.slice(0, 8)}...
                      </span>
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#f5f8f8] border border-[#062327]/15 text-[#062327]">
                        {c.status.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </div>

                    <h3 className="font-headline text-base font-bold text-[#062327] group-hover:text-[#0b3d45] transition-colors">
                      {treatment?.name || 'Unspecified Procedure'}
                    </h3>

                    <div className="flex items-center gap-2 text-xs text-[#558187] mt-1 font-medium">
                      <Building size={14} className="text-[#062327]" />
                      <span>{treatment?.hospital || matchedPolicy?.insurer_name || 'Policy Claim'}</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#062327]/08 flex items-center justify-between text-xs text-[#558187] font-medium">
                    <span>
                      {c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN') : '—'}
                    </span>
                    <span className="text-[#062327] font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      <span>Open Claim</span>
                      <ChevronRight size={14} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal: Select Policy to create claim */}
        {isCreatingModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-white border border-[#062327]/15 rounded-3xl p-6 max-w-md w-full flex flex-col gap-5 shadow-2xl animate-fade-in">
              <div>
                <h3 className="font-headline text-base font-bold text-[#062327]">
                  Select Policy for New Claim
                </h3>
                <p className="text-xs text-[#558187] mt-1 font-medium">
                  Choose the insurance policy against which this claim will be evaluated.
                </p>
              </div>

              {policies.length === 0 ? (
                <p className="text-xs text-[#92400e] p-4 rounded-2xl bg-[#fffbeb] border border-[#f59e0b]/30 font-medium">
                  No uploaded policies found. Please upload a policy PDF on the Dashboard first.
                </p>
              ) : (
                <form onSubmit={handleCreateClaim} className="flex flex-col gap-4">
                  <div>
                    <label className="text-xs font-bold text-[#062327] block mb-1.5">
                      Insurance Policy
                    </label>
                    <select
                      value={selectedPolicyId}
                      onChange={e => setSelectedPolicyId(e.target.value)}
                      className="w-full bg-[#f5f8f8] border border-[#062327]/15 rounded-2xl px-4 py-3 text-sm text-[#062327] font-medium focus:bg-white focus:border-[#062327] focus:outline-none cursor-pointer"
                    >
                      <option value="">Choose a policy...</option>
                      {policies.map(p => (
                        <option key={p._id || p.id} value={p._id || p.id}>
                          {p.insurer_name ? `${p.insurer_name} (${p.file_name})` : p.file_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsCreatingModal(false)}
                      className="text-xs px-4 py-2 rounded-full border border-[#062327]/15 text-[#558187] hover:text-[#062327] font-bold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!selectedPolicyId || actionLoading}
                      className="btn-pill-lime text-xs px-5 py-2 font-bold flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                    >
                      {actionLoading ? <Spinner size="xs" /> : <Plus size={15} />}
                      <span>Initialize Claim</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Render Active Claim Workflow ───────────────────────────────────────────
  return (
    <div className="space-y-6">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Top Bar with Back button & Status */}
      <div className="bg-white border border-[#062327]/10 rounded-3xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setActiveClaimId(null);
              setActiveClaim(null);
              fetchClaims();
            }}
            className="p-2.5 rounded-full bg-[#f5f8f8] border border-[#062327]/15 hover:border-[#062327]/30 text-[#062327] transition-all cursor-pointer shadow-2xs"
            title="Return to claims list"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 className="font-headline text-lg sm:text-xl font-bold text-[#062327]">
              {activeClaim?.treatment?.name || 'New Claim'}
            </h2>
            <span className="text-[11px] font-mono text-[#558187] font-medium">
              Claim ID: {activeClaim?.claim_id}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#d2f57b]/30 text-[#062327] border border-[#062327]/15">
            {activeClaim?.status?.replace(/_/g, ' ').toUpperCase() || 'DRAFT'}
          </span>
        </div>
      </div>

      {/* Stepper Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {STEPS.map(st => {
          const Icon = st.icon;
          const isActive = activeStep === st.id;

          return (
            <button
              key={st.id}
              onClick={() => setActiveStep(st.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer shadow-2xs ${
                isActive
                  ? 'bg-[#062327] text-white border border-[#062327]'
                  : 'bg-white text-[#558187] border border-[#062327]/10 hover:text-[#062327] hover:border-[#062327]/25'
              }`}
            >
              <Icon size={14} className={isActive ? 'text-[#d2f57b]' : 'text-[#558187]'} />
              <span>{st.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Step Content */}
      <div className="space-y-6">
        {activeStep === 'treatment' && (
          <TreatmentForm
            initialData={activeClaim?.treatment}
            onSubmit={handleSaveTreatment}
            loading={actionLoading}
          />
        )}

        {activeStep === 'eligibility' && (
          <EligibilityCard
            eligibilityResult={activeClaim?.eligibility_result}
            onReevaluate={handleReevaluateEligibility}
            loading={actionLoading}
          />
        )}

        {activeStep === 'checklist' && (
          <DocumentChecklistSection
            checklist={activeClaim?.checklist || []}
            documents={activeClaim?.documents || []}
            onUploadDocument={handleUploadDocument}
            onConfirmDocument={handleConfirmDocument}
            uploadingSlot={uploadingSlot}
          />
        )}

        {activeStep === 'settlement' && (
          <SettlementReceiptCard
            settlementEstimate={activeClaim?.settlement_estimate}
            onRecalculate={handleRecalculateSettlement}
            loading={actionLoading}
          />
        )}

        {activeStep === 'review' && (
          <ClaimReviewScreen
            reviewData={reviewData}
            onSubmitClaim={handleSubmitClaim}
            submittingLoading={actionLoading}
          />
        )}

        {activeStep === 'tracking' && (
          <ManualStatusTracker
            claim={activeClaim}
            onStatusTransition={handleStatusTransition}
            loading={actionLoading}
          />
        )}
      </div>
    </div>
  );
}
