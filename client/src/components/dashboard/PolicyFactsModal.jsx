import React from 'react';
import { createPortal } from 'react-dom';
import { X, BookOpen, Tag, Percent, Clock, AlertTriangle, ShieldCheck, ArrowUpRight } from 'lucide-react';

const CATEGORY_META = {
  policy_metadata:    { label: 'Policy Overview & Metadata', color: 'text-teal-700' },
  coverage_category:  { label: 'Coverage',                  color: 'text-sky-600' },
  sum_insured:        { label: 'Sum Insured',                color: 'text-[#0b3d45]' },
  sub_limit:          { label: 'Sub-Limits',                 color: 'text-violet-600' },
  waiting_period:     { label: 'Waiting Periods',            color: 'text-amber-600' },
  exclusion:          { label: 'Exclusions',                 color: 'text-rose-600' },
  room_rent_limit:    { label: 'Room Rent Limit',            color: 'text-orange-600' },
  co_payment:         { label: 'Co-Payment',                 color: 'text-yellow-700' },
  deductible:         { label: 'Deductible',                 color: 'text-pink-600' },
  claim_condition:    { label: 'Claim Conditions',           color: 'text-cyan-700' },
};

const CONFIDENCE_STYLE = {
  high:   'status-ready',
  medium: 'status-pending',
  low:    'status-error',
};

export default function PolicyFactsModal({ policy, isOpen, onClose }) {
  if (!isOpen || !policy) return null;

  const facts = policy.facts || [];
  const grouped = facts.reduce((acc, fact) => {
    const cat = fact.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(fact);
    return acc;
  }, {});

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
      style={{ background: 'rgba(6, 35, 39, 0.25)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[90dvh] sm:max-h-[82vh] rounded-t-[28px] sm:rounded-[32px] flex flex-col shadow-[0_24px_80px_rgba(6,35,39,0.25)] animate-slide-up overflow-hidden"
        style={{
          background: '#ffffff',
          border: '1.5px solid rgba(6, 35, 39, 0.12)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-[#062327]/10 flex-shrink-0">
          <div>
            <h2 className="font-headline text-lg font-bold text-[#062327] tracking-tight text-left">
              {policy.insurer_name || policy.file_name}
            </h2>
            <p className="text-xs text-[#558187] mt-0.5 font-medium text-left">
              {facts.length} extracted facts · {Object.keys(grouped).length} contract categories
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#558187] hover:text-[#062327] p-2 rounded-xl hover:bg-[#062327]/08 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-7 py-6 space-y-6 scroll-area">
          {facts.length === 0 ? (
            <div className="text-center py-12 text-[#558187] text-sm">
              No facts extracted yet. Policy may still be processing.
            </div>
          ) : (
            Object.entries(grouped).map(([category, categoryFacts]) => {
              const meta = CATEGORY_META[category] || {
                label: category.replace(/_/g, ' '),
                color: 'text-[#062327]',
              };
              const isMetadata = category === 'policy_metadata';
              const isExclusion = category === 'exclusion';
              const isWaiting = category === 'waiting_period';
              const isClaim = category === 'claim_condition';

              return (
                <section key={category}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-xs font-bold uppercase tracking-wider ${meta.color}`}>{meta.label}</span>
                    <div className="flex-1 h-px bg-[#062327]/08" />
                    <span className="text-[11px] font-semibold text-[#558187] bg-[#f5f8f8] px-2 py-0.5 rounded-full border border-[#062327]/08">
                      {categoryFacts.length}
                    </span>
                  </div>

                  {/* If policy_metadata, group all items into a single unified block */}
                  {isMetadata ? (
                    <div className="bg-[#f5f8f8] rounded-2xl p-5 border border-[#062327]/08 divide-y divide-[#062327]/08">
                      {categoryFacts.map((fact) => (
                        <div
                          key={fact.fact_id || fact._id}
                          className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left"
                        >
                          <div className="flex-1 min-w-0 text-left">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-[#558187] mb-1 text-left">
                              {fact.fact_key?.replace(/_/g, ' ') || 'Detail'}
                            </p>
                            <p className="font-sans text-sm sm:text-base font-bold text-[#062327] tracking-tight text-left">
                              {fact.fact_value}
                              {fact.unit && fact.unit !== 'INR' && (
                                <span className="text-xs text-[#558187] font-normal ml-1.5">{fact.unit}</span>
                              )}
                            </p>
                            {fact.source_page && (
                              <p className="text-[10px] text-[#558187] font-medium mt-1 text-left">
                                Page {fact.source_page}
                                {fact.source_section ? ` · ${fact.source_section}` : ''}
                              </p>
                            )}
                          </div>

                          {fact.extraction_confidence && (
                            <div className="flex-shrink-0 self-start sm:self-center">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${CONFIDENCE_STYLE[fact.extraction_confidence] || 'status-info'}`}>
                                {fact.extraction_confidence}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Other categories */
                    <div className="space-y-2">
                      {categoryFacts.map((fact) => {
                        let waitingCond = null;
                        let waitingPeriod = null;
                        if (isWaiting) {
                          const raw = fact.fact_value || '';
                          if (fact.metadata?.condition && fact.metadata?.period) {
                            waitingCond = fact.metadata.condition;
                            waitingPeriod = fact.metadata.period;
                          } else if (raw.includes(':')) {
                            const parts = raw.split(':');
                            waitingCond = parts[0].trim();
                            waitingPeriod = parts.slice(1).join(':').trim();
                          } else {
                            waitingCond = raw;
                          }
                        }

                        return (
                          <div
                            key={fact.fact_id || fact._id}
                            className="bg-[#f5f8f8] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-[#062327]/08 hover:border-[#062327]/18 transition-colors text-left"
                          >
                            <div className="flex-1 min-w-0 text-left">
                              {isExclusion ? (
                                <div className="flex items-start gap-2.5 text-left">
                                  <span className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 flex-shrink-0" />
                                  <p className="text-sm text-[#062327] leading-relaxed font-medium text-left">
                                    {fact.fact_value}
                                  </p>
                                </div>
                              ) : isWaiting ? (
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left">
                                  <p className="text-sm font-bold text-[#062327] text-left">
                                    {waitingCond}
                                  </p>
                                  {waitingPeriod && (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#d2f57b]/30 text-[#062327] border border-[#062327]/20 whitespace-nowrap self-start sm:self-auto font-sans tabular-nums">
                                      {waitingPeriod}
                                    </span>
                                  )}
                                </div>
                              ) : isClaim ? (
                                <div className="flex items-start gap-2.5 text-left">
                                  <span className="w-2 h-2 rounded-full bg-sky-500 mt-1.5 flex-shrink-0" />
                                  <p className="text-sm text-[#062327] leading-relaxed text-left">
                                    {fact.fact_value}
                                  </p>
                                </div>
                              ) : (
                                <div className="text-left">
                                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#558187] mb-1 text-left">
                                    {fact.fact_key?.replace(/_/g, ' ') || 'Detail'}
                                  </p>
                                  <p className="font-sans text-sm sm:text-base font-bold text-[#062327] tracking-tight tabular-nums text-left">
                                    {fact.fact_value}
                                    {fact.unit && fact.unit !== 'INR' && (
                                      <span className="text-xs text-[#558187] font-normal ml-1.5">{fact.unit}</span>
                                    )}
                                  </p>
                                </div>
                              )}

                              {(fact.source_page || fact.source_section) && (
                                <div className="mt-2 flex items-center gap-2 text-[11px] text-[#558187] text-left">
                                  {fact.source_page && (
                                    <span className="px-2 py-0.5 rounded-full bg-[#062327]/08 text-[#062327] font-mono text-[10px] font-bold">
                                      Page {fact.source_page}
                                    </span>
                                  )}
                                  {fact.source_section && (
                                    <span className="text-[#558187]">· {fact.source_section}</span>
                                  )}
                                </div>
                              )}
                            </div>

                            {fact.extraction_confidence && !isExclusion && !isWaiting && (
                              <div className="flex-shrink-0 self-start sm:self-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${CONFIDENCE_STYLE[fact.extraction_confidence] || 'status-info'}`}>
                                  {fact.extraction_confidence}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
