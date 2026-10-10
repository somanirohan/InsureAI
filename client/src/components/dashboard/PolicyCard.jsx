import React from 'react';
import { FileText, Trash2, MessageSquare, Eye } from 'lucide-react';
import { StatusBadge } from '../common/ui';
import { useLanguage } from '../../context/LanguageContext';

const formatCoverage = (v) =>
  v ? `₹${(v / 100000).toFixed(1)}L` : '—';

const formatPremium = (v) =>
  v ? `₹${v.toLocaleString('en-IN')}` : '—';

export default function PolicyCard({ policy, onSelect, onDelete, onStartChat }) {
  const { t } = useLanguage();
  const isReady = policy.status === 'ready';
  const redFlags = policy.red_flag_summary || {};
  const factCount = policy.facts?.length ?? 0;

  return (
    <article
      onClick={(e) => {
        if (!e.target.closest('button')) onSelect(policy);
      }}
      className="group h-full flex flex-col justify-between rounded-3xl cursor-pointer transition-all duration-300 hover:-translate-y-1.5 overflow-hidden"
      style={{
        background: '#ffffff',
        border: '1.5px solid rgba(6, 35, 39, 0.09)',
        boxShadow: '0 2px 16px rgba(6, 35, 39, 0.07)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(6, 35, 39, 0.22)';
        e.currentTarget.style.boxShadow = '0 12px 36px rgba(6, 35, 39, 0.14)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(6, 35, 39, 0.09)';
        e.currentTarget.style.boxShadow = '0 2px 16px rgba(6, 35, 39, 0.07)';
      }}
    >
      {/* Top section */}
      <div className="p-6 flex-1 flex flex-col justify-between">
        <div>
          {/* Header row */}
          <div className="flex items-start justify-between gap-3 mb-5">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-[#f5f8f8] border border-[#062327]/10 flex items-center justify-center flex-shrink-0 group-hover:border-[#062327]/25 text-[#062327] transition-colors shadow-sm">
                <FileText size={18} className="stroke-[2.2]" />
              </div>
              <div className="min-w-0">
                <h3 className="font-headline text-base font-bold text-[#062327] truncate leading-tight group-hover:text-[#0b3d45] transition-colors">
                  {policy.insurer_name || policy.file_name}
                </h3>
                <p className="text-xs text-[#558187] capitalize mt-1 font-medium">
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
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-[#f5f8f8] border border-[#062327]/08 p-3.5 rounded-2xl">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#558187] mb-1">
                {t('dashboard.policy_card.sum_insured', 'Sum Insured')}
              </p>
              <p className="font-sans text-base font-bold text-[#062327] tabular-nums">{formatCoverage(policy.sum_insured)}</p>
            </div>
            <div className="bg-[#f5f8f8] border border-[#062327]/08 p-3.5 rounded-2xl">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#558187] mb-1">
                {t('common.premium', 'Premium')}
              </p>
              <p className="font-sans text-base font-bold text-[#062327] tabular-nums">{formatPremium(policy.premium_amount)}</p>
            </div>
          </div>
        </div>

        {/* Facts & Red flags preview */}
        <div className="pt-4 border-t border-[#062327]/08">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#558187]">
              {factCount > 0 ? `${factCount} ${t('facts_modal.extracted_facts', 'Extracted Facts')}` : `0 ${t('facts_modal.extracted_facts', 'Extracted Facts')}`}
            </p>
          </div>
          <div className="min-h-[22px] flex items-center">
            {redFlags.room_rent_cap ? (
              <div className="flex items-start gap-2 text-xs text-[#062327]">
                <span className="text-amber-500 font-bold mt-0.5 flex-shrink-0">●</span>
                <span className="line-clamp-1"><strong className="text-[#2d6a71] font-semibold">{t('dashboard.policy_card.room_rent_cap', 'Room Rent')}:</strong> {redFlags.room_rent_cap}</span>
              </div>
            ) : redFlags.copay_percentage ? (
              <div className="flex items-start gap-2 text-xs text-[#062327]">
                <span className="text-sky-500 font-bold mt-0.5 flex-shrink-0">●</span>
                <span className="line-clamp-1"><strong className="text-[#2d6a71] font-semibold">{t('dashboard.policy_card.copay', 'Co-pay')}:</strong> {redFlags.copay_percentage}</span>
              </div>
            ) : redFlags.waiting_periods?.length > 0 ? (
              <div className="flex items-start gap-2 text-xs text-[#062327]">
                <span className="text-amber-500 font-bold mt-0.5 flex-shrink-0">●</span>
                <span className="line-clamp-1"><strong className="text-[#2d6a71] font-semibold">{t('upload_modal.waiting_label', 'Waiting')}:</strong> {redFlags.waiting_periods[0]}</span>
              </div>
            ) : redFlags.major_exclusions?.length > 0 ? (
              <div className="flex items-start gap-2 text-xs text-[#062327]">
                <span className="text-rose-500 font-bold mt-0.5 flex-shrink-0">●</span>
                <span className="line-clamp-1"><strong className="text-[#2d6a71] font-semibold">{t('upload_modal.exclusions_label', 'Exclusion')}:</strong> {redFlags.major_exclusions[0]}</span>
              </div>
            ) : factCount > 0 ? (
              <div className="flex items-start gap-2 text-xs text-[#062327]">
                <span className="text-[#a4dc37] font-bold mt-0.5 flex-shrink-0">●</span>
                <span className="line-clamp-1">{policy.facts?.[0]?.clause_name || policy.facts?.[0]?.summary || 'Standard terms analyzed'}</span>
              </div>
            ) : (
              <p className="text-xs text-[#558187] italic">No red flags flagged · Ready for analysis</p>
            )}
          </div>
        </div>
      </div>

      {/* Action footer */}
      <div className="border-t border-[#062327]/08 px-5 py-3.5 flex items-center justify-between bg-[#f9fbfb]">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect(policy);
          }}
          className="flex items-center gap-1.5 text-xs font-bold text-[#558187] hover:text-[#062327] transition-colors cursor-pointer"
        >
          <Eye size={14} />
          <span>{t('dashboard.policy_card.view_facts', 'View facts')}</span>
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStartChat(policy);
            }}
            disabled={!isReady}
            className="btn-pill-lime text-xs py-2 px-3.5 flex items-center gap-1.5 font-bold cursor-pointer disabled:opacity-40"
            title={!isReady ? 'Policy still processing' : 'Ask AI about this policy'}
          >
            <MessageSquare size={13} />
            <span>{t('dashboard.policy_card.ask_ai', 'Ask AI')}</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(policy._id);
            }}
            className="p-2 rounded-xl text-[#558187] hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
            title="Delete policy"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}
