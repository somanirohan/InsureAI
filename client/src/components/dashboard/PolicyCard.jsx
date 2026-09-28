import React from 'react';
import { FileText, Trash2, MessageSquare, Eye } from 'lucide-react';
import { StatusBadge } from '../common/ui';

const formatCoverage = (v) =>
  v ? `₹${(v / 100000).toFixed(1)}L` : '—';

const formatPremium = (v) =>
  v ? `₹${v.toLocaleString('en-IN')}` : '—';

export default function PolicyCard({ policy, onSelect, onDelete, onStartChat }) {
  const isReady = policy.status === 'ready';
  const redFlags = policy.red_flag_summary || {};
  const factCount = policy.facts?.length ?? 0;

  return (
    <article
      onClick={(e) => {
        if (!e.target.closest('button')) onSelect(policy);
      }}
      className="group h-full flex flex-col justify-between rounded-2xl cursor-pointer transition-all duration-300 hover:-translate-y-1.5"
      style={{
        background: 'rgba(14, 14, 24, 0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(200, 169, 110, 0.35)';
        e.currentTarget.style.boxShadow = '0 16px 36px -4px rgba(0, 0, 0, 0.65), 0 0 20px rgba(200, 169, 110, 0.10)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
        e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.25)';
      }}
    >
      {/* Top section */}
      <div className="p-5 flex-1 flex flex-col justify-between">
        <div>
          {/* Header row */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center flex-shrink-0 group-hover:border-amber-400/30 transition-colors">
                <FileText size={16} className="text-zinc-400 group-hover:text-amber-300 transition-colors" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-zinc-100 truncate leading-tight group-hover:text-amber-100 transition-colors">
                  {policy.insurer_name || policy.file_name}
                </h3>
                <p className="text-xs text-zinc-500 capitalize mt-0.5">
                  {policy.policy_type?.replace(/_/g, ' ') || 'Health Insurance'}
                  {policy.policy_number ? ` · ${policy.policy_number}` : ''}
                </p>
              </div>
            </div>
            {policy.status && policy.status !== 'ready' && (
              <StatusBadge status={policy.status} />
            )}
          </div>

          {/* Coverage row */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="surface-inset p-3 rounded-xl">
              <p className="label-xs mb-1">Sum Insured</p>
              <p className="text-sm font-semibold text-zinc-100">{formatCoverage(policy.sum_insured)}</p>
            </div>
            <div className="surface-inset p-3 rounded-xl">
              <p className="label-xs mb-1">Premium</p>
              <p className="text-sm font-semibold text-zinc-100">{formatPremium(policy.premium_amount)}</p>
            </div>
          </div>
        </div>

        {/* Facts & Red flags preview */}
        <div className="pt-3 border-t border-white/[0.06]">
          <div className="flex items-center justify-between mb-1.5">
            <p className="label-xs">
              {factCount > 0 ? `${factCount} Extracted Facts` : '0 Extracted Facts'}
            </p>
          </div>
          <div className="min-h-[20px] flex items-center">
            {redFlags.room_rent_cap ? (
              <div className="flex items-start gap-2 text-xs text-zinc-300">
                <span className="text-amber-400 font-bold mt-0.5 flex-shrink-0">·</span>
                <span className="line-clamp-1"><strong className="text-zinc-400 font-normal">Room Rent:</strong> {redFlags.room_rent_cap}</span>
              </div>
            ) : redFlags.copay_percentage ? (
              <div className="flex items-start gap-2 text-xs text-zinc-300">
                <span className="text-blue-400 font-bold mt-0.5 flex-shrink-0">·</span>
                <span className="line-clamp-1"><strong className="text-zinc-400 font-normal">Co-pay:</strong> {redFlags.copay_percentage}</span>
              </div>
            ) : redFlags.waiting_periods?.length > 0 ? (
              <div className="flex items-start gap-2 text-xs text-zinc-300">
                <span className="text-amber-400 font-bold mt-0.5 flex-shrink-0">·</span>
                <span className="line-clamp-1"><strong className="text-zinc-400 font-normal">Waiting:</strong> {redFlags.waiting_periods[0]}</span>
              </div>
            ) : redFlags.major_exclusions?.length > 0 ? (
              <div className="flex items-start gap-2 text-xs text-zinc-300">
                <span className="text-rose-400 font-bold mt-0.5 flex-shrink-0">·</span>
                <span className="line-clamp-1"><strong className="text-zinc-400 font-normal">Exclusion:</strong> {redFlags.major_exclusions[0]}</span>
              </div>
            ) : factCount > 0 ? (
              <div className="flex items-start gap-2 text-xs text-zinc-400">
                <span className="text-emerald-400 font-bold mt-0.5 flex-shrink-0">·</span>
                <span className="line-clamp-1">{policy.facts?.[0]?.clause_name || policy.facts?.[0]?.summary || 'Standard coverage terms extracted'}</span>
              </div>
            ) : (
              <p className="text-xs text-zinc-600 italic">No red flags flagged · Ready for analysis</p>
            )}
          </div>
        </div>
      </div>

      {/* Action footer */}
      <div className="border-t border-white/[0.06] px-4 py-3 flex items-center justify-between bg-white/[0.02] rounded-b-2xl">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect(policy);
          }}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          <Eye size={13} />
          View facts
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStartChat(policy);
            }}
            disabled={!isReady}
            className="btn btn-primary text-xs py-1.5 px-3 rounded-lg gap-1.5"
            title={!isReady ? 'Policy still processing' : 'Ask AI about this policy'}
          >
            <MessageSquare size={12} />
            Ask AI
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(policy._id);
            }}
            className="btn btn-destructive p-1.5 rounded-lg transition-colors"
            title="Delete policy"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </article>
  );
}
