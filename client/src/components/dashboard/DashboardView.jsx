import React, { useState } from 'react';
import { Upload, Shield, FileText, Activity, ChevronRight, Plus, Sparkles } from 'lucide-react';
import PolicyCard from './PolicyCard';
import PolicyFactsModal from './PolicyFactsModal';
import UploadPolicyModal from './UploadPolicyModal';
import { SectionHeader, EmptyState, Spinner } from '../common/ui';
import { useLanguage } from '../../context/LanguageContext';

export default function DashboardView({
  policies,
  loadingPolicies,
  onPolicyUploadSuccess,
  onDeletePolicy,
  onStartChat,
  onNavigateToCost,
  onNavigateToCompare,
}) {
  const { t } = useLanguage();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedPolicyForFacts, setSelectedPolicyForFacts] = useState(null);

  const readyPolicies = policies.filter(p => p.status === 'ready').length;

  return (
    <div className="space-y-8">
      {/* ─── Page header ────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">
            {t('nav.dashboard', 'Dashboard')}
          </h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            {policies.length > 0
              ? `${policies.length} ${t('dashboard.quick_stats.total_policies', 'policies')} · ${readyPolicies} ${t('common.ready', 'ready')}`
              : t('dashboard.subtitle', 'Review your health insurance coverage, audit clauses, and simulate out-of-pocket costs.')
            }
          </p>
        </div>
        <button
          onClick={() => setIsUploadOpen(true)}
          className="btn btn-primary gap-2"
        >
          <Upload size={14} />
          {t('dashboard.upload_cta', 'Upload Policy')}
        </button>
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
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-zinc-200">
                    {t('cost.title', 'Cost Estimator')}
                  </p>
                  <span className="text-2xs px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400 font-medium">
                    1,750+ CGHS Rates
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {t('cost.subtitle', 'Accurate out-of-pocket estimates using CGHS benchmarks')}
                </p>
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
                <p className="text-sm font-medium text-zinc-200">
                  {t('compare.title', 'Compare Policies')}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {t('compare.subtitle', 'Side-by-side coverage comparison across policies')}
                </p>
              </div>
              <ChevronRight size={16} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            </div>
          </button>
        </div>
      )}

      {/* ─── Policies grid ──────────────────────────────── */}
      <div>
        <SectionHeader
          title={t('dashboard.active_policies', 'Active Policies')}
          subtitle={t('dashboard.subtitle', 'Click any policy to explore extracted clauses or start an AI consultation')}
          action={
            policies.length > 0 && (
              <button
                onClick={() => setIsUploadOpen(true)}
                className="btn btn-ghost text-xs gap-1.5 text-zinc-500 hover:text-zinc-200"
              >
                <Plus size={13} />
                {t('common.upload', 'Add')}
              </button>
            )
          }
        />

        {loadingPolicies ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <Spinner size={20} className="text-zinc-600" />
            <p className="text-sm text-zinc-500">{t('common.processing', 'Loading policies…')}</p>
          </div>
        ) : policies.length === 0 ? (
          <div className="surface border-2 border-dashed border-white/[0.06]">
            <EmptyState
              icon={FileText}
              title={t('dashboard.no_policies_title', 'No policies uploaded yet')}
              description={t('dashboard.no_policies_desc', 'Upload your first health insurance policy PDF to start auditing clauses, estimating medical costs, and asking questions.')}
              action={
                <button
                  onClick={() => setIsUploadOpen(true)}
                  className="btn btn-primary gap-2"
                >
                  <Upload size={14} />
                  {t('dashboard.upload_cta', 'Upload your first policy')}
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
