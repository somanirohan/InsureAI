import React, { useState } from 'react';
import { Upload, Shield, FileText, Activity, ChevronRight, Plus } from 'lucide-react';
import PolicyCard from './PolicyCard';
import PolicyFactsModal from './PolicyFactsModal';
import UploadPolicyModal from './UploadPolicyModal';
import { MetricCard, SectionHeader, EmptyState, Spinner } from '../common/ui';

export default function DashboardView({
  policies,
  loadingPolicies,
  onPolicyUploadSuccess,
  onDeletePolicy,
  onStartChat,
  onNavigateToCost,
  onNavigateToCompare,
}) {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedPolicyForFacts, setSelectedPolicyForFacts] = useState(null);

  const totalCoverage = policies.reduce((acc, p) => acc + (p.sum_insured || 0), 0);
  const totalFacts    = policies.reduce((acc, p) => acc + (p.facts?.length || 0), 0);
  const readyPolicies = policies.filter(p => p.status === 'ready').length;

  const formatCoverage = (v) =>
    v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v > 0 ? `₹${v.toLocaleString('en-IN')}` : '—';

  return (
    <div className="space-y-8">
      {/* ─── Page header ────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {policies.length > 0
              ? `${policies.length} polic${policies.length === 1 ? 'y' : 'ies'} · ${readyPolicies} ready`
              : 'Upload a policy to get started'
            }
          </p>
        </div>
        <button
          onClick={() => setIsUploadOpen(true)}
          className="btn btn-primary gap-2"
        >
          <Upload size={14} />
          Upload Policy
        </button>
      </div>

      {/* ─── Overview metrics ────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label="Policies"
          value={policies.length}
          sub={`${readyPolicies} ready for AI`}
        />
        <MetricCard
          label="Total Coverage"
          value={formatCoverage(totalCoverage)}
          sub="Combined sum insured"
          accent
        />
        <MetricCard
          label="Extracted Facts"
          value={totalFacts}
          sub="Clause categories"
        />
        <MetricCard
          label="Vector Store"
          value="ChromaDB"
          sub="RAG retrieval active"
        />
      </div>

      {/* ─── Quick actions (only shown when policies exist) ─ */}
      {policies.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={onNavigateToCost}
            className="surface p-4 text-left hover:border-white/[0.12] transition-all duration-150 group"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-200">Cost Estimator</p>
                <p className="text-xs text-zinc-500 mt-0.5">Simulate treatment out-of-pocket costs</p>
              </div>
              <ChevronRight size={16} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            </div>
          </button>
          <button
            onClick={onNavigateToCompare}
            className="surface p-4 text-left hover:border-white/[0.12] transition-all duration-150 group"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-200">Compare Policies</p>
                <p className="text-xs text-zinc-500 mt-0.5">Side-by-side coverage comparison</p>
              </div>
              <ChevronRight size={16} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            </div>
          </button>
        </div>
      )}

      {/* ─── Policies grid ──────────────────────────────── */}
      <div>
        <SectionHeader
          title="Your Policies"
          subtitle="Click any policy to explore extracted clauses or start an AI consultation"
          action={
            policies.length > 0 && (
              <button
                onClick={() => setIsUploadOpen(true)}
                className="btn btn-ghost text-xs gap-1.5 text-zinc-500 hover:text-zinc-200"
              >
                <Plus size={13} />
                Add
              </button>
            )
          }
        />

        {loadingPolicies ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <Spinner size={20} className="text-zinc-600" />
            <p className="text-sm text-zinc-500">Loading policies…</p>
          </div>
        ) : policies.length === 0 ? (
          <div className="surface border-2 border-dashed border-white/[0.06]">
            <EmptyState
              icon={FileText}
              title="No policies yet"
              description="Upload a health insurance policy PDF to start extracting facts, detecting red flags, and getting AI-powered answers."
              action={
                <button
                  onClick={() => setIsUploadOpen(true)}
                  className="btn btn-primary gap-2"
                >
                  <Upload size={14} />
                  Upload your first policy
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
