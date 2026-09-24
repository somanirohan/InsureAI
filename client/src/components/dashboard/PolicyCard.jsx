import React from 'react';
import { FileText, AlertTriangle, CheckCircle2, Clock, Trash2, ArrowUpRight, ShieldCheck, Zap } from 'lucide-react';

export default function PolicyCard({ policy, onSelect, onDelete, onStartChat }) {
  const getStatusBadge = (status) => {
    switch (status) {
      case 'ready':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800">
            <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-400" />
            Ready for Q&A
          </span>
        );
      case 'extracting':
      case 'indexed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-950/80 text-amber-300 border border-amber-800 animate-pulse">
            <Clock className="w-3 h-3 mr-1 text-amber-400" />
            Extracting Facts...
          </span>
        );
      case 'uploading':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-950/80 text-blue-300 border border-blue-800 animate-pulse">
            <Zap className="w-3 h-3 mr-1 text-blue-400" />
            Uploading...
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-950/80 text-rose-300 border border-rose-800">
            <AlertTriangle className="w-3 h-3 mr-1 text-rose-400" />
            Processing Failed
          </span>
        );
    }
  };

  const formattedSum = policy.sum_insured
    ? `₹${(policy.sum_insured / 100000).toFixed(1)} Lakh`
    : 'Pending Extraction';

  const redFlags = policy.red_flag_summary || {};

  return (
    <div className="glass-panel rounded-2xl p-5 hover:border-slate-700 transition-all group flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-emerald-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-base leading-snug group-hover:text-emerald-400 transition-colors">
                {policy.insurer_name || policy.file_name}
              </h3>
              <p className="text-xs text-slate-400 capitalize">
                {policy.policy_type ? policy.policy_type.replace(/_/g, ' ') : 'Health Insurance'} • {policy.policy_number || 'Processing'}
              </p>
            </div>
          </div>
          <div>{getStatusBadge(policy.status)}</div>
        </div>

        {/* Coverage Metrics Grid */}
        <div className="grid grid-cols-2 gap-2 my-4 p-3 rounded-xl bg-slate-900/60 border border-slate-800/60">
          <div>
            <div className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Sum Insured</div>
            <div className="text-base font-bold text-white tracking-tight">{formattedSum}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Annual Premium</div>
            <div className="text-base font-semibold text-slate-200">
              {policy.premium_amount ? `₹${policy.premium_amount.toLocaleString('en-IN')}` : 'Included in Plan'}
            </div>
          </div>
        </div>

        {/* Red Flags / Highlights Summary (FR-06) */}
        {redFlags.room_rent_cap && (
          <div className="space-y-1.5 mb-4">
            <div className="text-[11px] font-semibold text-slate-400 flex items-center space-x-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Extracted Key Conditions ({policy.facts ? policy.facts.length : 0} facts)</span>
            </div>
            <div className="text-xs text-slate-300 bg-slate-950/40 border border-slate-800/80 p-2.5 rounded-lg line-clamp-2">
              <span className="text-amber-400 font-medium">Room Rent: </span>
              {redFlags.room_rent_cap}
            </div>
            {redFlags.copay_percentage && (
              <div className="text-xs text-slate-300 bg-slate-950/40 border border-slate-800/80 p-2 rounded-lg truncate">
                <span className="text-blue-400 font-medium">Co-pay: </span>
                {redFlags.copay_percentage}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
        <button
          onClick={() => onSelect(policy)}
          className="text-xs font-medium text-slate-300 hover:text-white px-3 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 transition-colors"
        >
          View Facts Table
        </button>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => onStartChat(policy)}
            disabled={policy.status !== 'ready'}
            className="flex items-center space-x-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-colors shadow-sm shadow-emerald-500/20"
          >
            <span>Ask AI</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => onDelete(policy._id)}
            title="Delete Policy and clean up vectors"
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
