import React, { useState } from 'react';
import { Upload, Shield, FileText, Activity, ChevronRight, Plus } from 'lucide-react';
import PolicyCard from './PolicyCard';
import PolicyFactsModal from './PolicyFactsModal';
import UploadPolicyModal from './UploadPolicyModal';
import { SectionHeader, EmptyState, Spinner } from '../common/ui';

export default function DashboardView({
  policies,
  loadingPolicies,
  onPolicyUploadSuccess,
  onDeletePolicy,
  onStartChat,
  onNavigateToCost,
  onNavigateToCompare,
  onNavigateToClaims,
}) {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedPolicyForFacts, setSelectedPolicyForFacts] = useState(null);

  const readyPolicies = policies.filter(p => p.status === 'ready').length;

  return (
    <div className="space-y-8">
      {/* ─── Page header ────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-headline text-2xl sm:text-3xl font-extrabold text-[#062327] tracking-tight">Dashboard</h1>
          <p className="text-xs sm:text-sm text-[#558187] mt-1 font-medium">
            {policies.length > 0
              ? `${policies.length} polic${policies.length === 1 ? 'y' : 'ies'} · ${readyPolicies} analyzed & ready`
              : 'Upload a policy document to extract facts and query clauses'
            }
          </p>
        </div>
        <button
          onClick={() => setIsUploadOpen(true)}
          className="btn-pill-lime py-3 px-6 flex items-center gap-2 text-xs sm:text-sm font-bold shadow-md cursor-pointer"
        >
          <Upload size={16} />
          <span>Upload Policy</span>
        </button>
      </div>

      {/* ─── Quick actions (only shown when policies exist) ─ */}
      {policies.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            onClick={onNavigateToClaims}
            className="bg-white border border-[#062327]/10 rounded-3xl p-5 text-left hover:border-[#062327]/30 hover:shadow-[0_6px_24px_rgba(6,35,39,0.10)] transition-all group cursor-pointer shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-headline text-base font-bold text-[#062327] group-hover:text-[#0b3d45] transition-colors">Claims Workflow</p>
                <p className="text-xs text-[#558187] mt-1">Policy-cited readiness checklist & settlement tracking</p>
              </div>
              <ChevronRight size={18} className="text-[#558187] group-hover:text-[#062327] group-hover:translate-x-1 transition-all" />
            </div>
          </button>
          <button
            onClick={onNavigateToCost}
            className="bg-white border border-[#062327]/10 rounded-3xl p-5 text-left hover:border-[#062327]/30 hover:shadow-[0_6px_24px_rgba(6,35,39,0.10)] transition-all group cursor-pointer shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-headline text-base font-bold text-[#062327] group-hover:text-[#0b3d45] transition-colors">Cost Estimator</p>
                <p className="text-xs text-[#558187] mt-1">Simulate treatment out-of-pocket costs with exact sub-limits</p>
              </div>
              <ChevronRight size={18} className="text-[#558187] group-hover:text-[#062327] group-hover:translate-x-1 transition-all" />
            </div>
          </button>
          <button
            onClick={onNavigateToCompare}
            className="bg-white border border-[#062327]/10 rounded-3xl p-5 text-left hover:border-[#062327]/30 hover:shadow-[0_6px_24px_rgba(6,35,39,0.10)] transition-all group cursor-pointer shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-headline text-base font-bold text-[#062327] group-hover:text-[#0b3d45] transition-colors">Compare Policies</p>
                <p className="text-xs text-[#558187] mt-1">Side-by-side room rent, waiting period, and co-payment comparison</p>
              </div>
              <ChevronRight size={18} className="text-[#558187] group-hover:text-[#062327] group-hover:translate-x-1 transition-all" />
            </div>
          </button>
        </div>
      )}

      {/* ─── Policies grid ──────────────────────────────── */}
      <div>
        <SectionHeader
          title="Your Analyzed Policies"
          subtitle="Click any policy to review extracted contract facts or initiate an AI consultation"
          action={
            policies.length > 0 && (
              <button
                onClick={() => setIsUploadOpen(true)}
                className="btn-pill-dark px-4 py-2 text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} className="text-[#d2f57b]" />
                <span>Add Policy</span>
              </button>
            )
          }
        />

        {loadingPolicies ? (
          <div className="flex flex-col items-center py-20 gap-3">
            <Spinner size={24} className="text-[#062327]" />
            <p className="text-sm font-semibold text-[#558187]">Loading policies…</p>
          </div>
        ) : policies.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-[#062327]/12 rounded-3xl overflow-hidden">
            <EmptyState
              icon={FileText}
              title="No policies uploaded yet"
              description="Upload your health insurance policy PDF to automatically index clauses, flag hidden sub-limits, and simulate medical bills."
              action={
                <button
                  onClick={() => setIsUploadOpen(true)}
                  className="btn-pill-lime py-3 px-6 flex items-center gap-2 text-sm font-bold shadow-md cursor-pointer"
                >
                  <Upload size={16} />
                  <span>Upload your first policy</span>
                </button>
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {policies.map(policy => (
              <PolicyCard
                key={policy._id}
                policy={policy}
                onSelect={p => setSelectedPolicyForFacts(p)}
                onDelete={onDeletePolicy}
                onStartChat={onStartChat}
              />
            ))}
          </div>
        )}
      </div>

      {/* ─── Modals ─────────────────────────────────────── */}
      <UploadPolicyModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={onPolicyUploadSuccess}
      />
      <PolicyFactsModal
        policy={selectedPolicyForFacts}
        isOpen={!!selectedPolicyForFacts}
        onClose={() => setSelectedPolicyForFacts(null)}
      />
    </div>
  );
}
