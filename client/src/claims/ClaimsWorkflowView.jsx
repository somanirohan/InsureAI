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
      <div className="flex flex-col gap-6">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
              <ShieldAlert className="text-amber-400" size={22} />
              Claim Processing & Readiness Workflow
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Deterministic, policy-cited preparation from First Notice of Loss to settlement tracking.
            </p>
          </div>

          <button
            onClick={() => setIsCreatingModal(true)}
            className="btn-primary text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 self-start sm:self-auto"
          >
            <Plus size={15} />
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
            title="No Claims Created Yet"
            description="Create a claim against an uploaded policy to verify eligibility, prepare documents, and estimate settlement."
            action={
              <button
                onClick={() => setIsCreatingModal(true)}
                className="btn-primary text-xs px-4 py-2 rounded-xl flex items-center gap-2"
              >
                <Plus size={14} />
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
                  className="surface p-5 rounded-2xl border border-white/[0.08] hover:border-amber-400/40 cursor-pointer transition-all group flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[11px] font-mono text-zinc-500">
                        ID: {c.claim_id.slice(0, 8)}...
                      </span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-zinc-300">
                        {c.status.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-zinc-100 group-hover:text-amber-300 transition-colors">
                      {treatment?.name || 'Unspecified Procedure'}
                    </h3>

                    <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1">
                      <Building size={13} className="text-zinc-500" />
                      <span>{treatment?.hospital || matchedPolicy?.insurer_name || 'Policy Claim'}</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/[0.05] flex items-center justify-between text-xs text-zinc-500">
                    <span>
                      {c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN') : '—'}
                    </span>
                    <span className="text-amber-400/90 font-medium flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                      <span>Open Claim</span>
                      <ChevronRight size={13} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal: Select Policy to create claim */}
        {isCreatingModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="surface p-6 rounded-2xl border border-white/[0.1] max-w-md w-full flex flex-col gap-5">
              <div>
                <h3 className="text-sm font-bold text-zinc-100">
                  Select Policy for New Claim
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Choose the insurance policy against which this claim will be evaluated.
                </p>
              </div>

              {policies.length === 0 ? (
                <p className="text-xs text-amber-300/80 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  No uploaded policies found. Please upload a policy PDF on the Dashboard first.
                </p>
              ) : (
                <form onSubmit={handleCreateClaim} className="flex flex-col gap-4">
                  <div>
                    <label className="text-xs text-zinc-400 block mb-1.5">
                      Insurance Policy
                    </label>
                    <select
                      value={selectedPolicyId}
                      onChange={e => setSelectedPolicyId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-[#0c0c16] border border-white/[0.1] text-xs text-zinc-100 focus:outline-none focus:border-amber-400/50"
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
                      className="text-xs px-3.5 py-2 rounded-xl border border-white/[0.1] text-zinc-400 hover:text-zinc-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!selectedPolicyId || actionLoading}
                      className="btn-primary text-xs px-4 py-2 rounded-xl flex items-center gap-2 disabled:opacity-50"
                    >
                      {actionLoading ? <Spinner size="xs" /> : <Plus size={14} />}
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
    <div className="flex flex-col gap-6">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Top Bar with Back button & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setActiveClaimId(null);
              setActiveClaim(null);
              fetchClaims();
            }}
            className="p-2 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.15] text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Return to claims list"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 className="text-base font-bold text-zinc-100">
              {activeClaim?.treatment?.name || 'New Claim'}
            </h2>
            <span className="text-[11px] font-mono text-zinc-500">
              Claim ID: {activeClaim?.claim_id}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/20">
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
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all border ${
                isActive
                  ? 'bg-amber-400/10 text-amber-300 border-amber-400/30 shadow-sm'
                  : 'bg-white/[0.02] text-zinc-400 border-white/[0.06] hover:text-zinc-200 hover:border-white/[0.1]'
              }`}
            >
              <Icon size={14} className={isActive ? 'text-amber-400' : 'text-zinc-500'} />
              <span>{st.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Step Content */}
      <div className="flex flex-col gap-6">
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
