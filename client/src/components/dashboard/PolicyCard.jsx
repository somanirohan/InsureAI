import React from 'react';
import {
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  Upload,
  Trash2,
  MessageSquare,
  ChevronRight,
  Eye,
} from 'lucide-react';
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
    <article className="surface group flex flex-col gap-0 overflow-hidden hover:border-white/[0.12] transition-all duration-200">
      {/* Top section */}
      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
              <FileText size={16} className="text-zinc-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-zinc-100 truncate leading-tight">
                {policy.insurer_name || policy.file_name}
              </h3>
              <p className="text-xs text-zinc-500 capitalize mt-0.5">
                {policy.policy_type?.replace(/_/g, ' ') || 'Health Insurance'}
                {policy.policy_number ? ` · ${policy.policy_number}` : ''}
              </p>
            </div>
          </div>
          <StatusBadge status={policy.status} />
        </div>

        {/* Coverage row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="surface-inset p-3 rounded-xl">
            <p className="label-xs mb-1">Sum Insured</p>
            <p className="text-sm font-semibold text-zinc-100">{formatCoverage(policy.sum_insured)}</p>
          </div>
          <div className="surface-inset p-3 rounded-xl">
            <p className="label-xs mb-1">Premium</p>
            <p className="text-sm font-semibold text-zinc-100">{formatPremium(policy.premium_amount)}</p>
          </div>
        </div>

        {/* Red flag highlights */}
        {factCount > 0 && (
          <div className="mt-3 pt-3 border-t border-white/[0.06]">
            <p className="label-xs mb-2">{factCount} Extracted Facts</p>
            <div className="space-y-1">
              {redFlags.room_rent_cap && (
                <div className="flex items-start gap-2 text-xs text-zinc-400">
                  <span className="text-amber-500 mt-0.5 flex-shrink-0">·</span>
                  <span><span className="text-zinc-300">Room Rent:</span> {redFlags.room_rent_cap}</span>
                </div>
              )}
              {redFlags.copay_percentage && (
                <div className="flex items-start gap-2 text-xs text-zinc-400">
                  <span className="text-blue-500 mt-0.5 flex-shrink-0">·</span>
                  <span><span className="text-zinc-300">Co-pay:</span> {redFlags.copay_percentage}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Action footer */}
      <div className="border-t border-white/[0.06] px-4 py-3 flex items-center justify-between bg-white/[0.02]">
        <button
          onClick={() => onSelect(policy)}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          <Eye size={13} />
          View facts
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onStartChat(policy)}
            disabled={!isReady}
            className="btn btn-primary text-xs py-1.5 px-3 rounded-lg gap-1.5"
            title={!isReady ? 'Policy still processing' : 'Ask AI about this policy'}
          >
            <MessageSquare size={12} />
            Ask AI
          </button>
          <button
            onClick={() => onDelete(policy._id)}
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
