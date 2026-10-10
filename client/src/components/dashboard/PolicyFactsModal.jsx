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
              const isExclusion = category === 'exclusion';
              const isWaiting = category === 'waiting_period';

              return (
                <section key={category}>
                  {/* Category Header */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-xs font-bold uppercase tracking-wider ${meta.color}`}>{meta.label}</span>
                    <div className="flex-1 h-px bg-[#062327]/08" />
                    <span className="text-[11px] font-semibold text-[#558187] bg-[#f5f8f8] px-2 py-0.5 rounded-full border border-[#062327]/08">
                      {categoryFacts.length}
                    </span>
                  </div>

                  {/* All sections in a unified single block per category */}
                  <div className="bg-[#f5f8f8] rounded-2xl p-4 sm:p-5 border border-[#062327]/08 divide-y divide-[#062327]/08">
                    {categoryFacts.map((fact) => {
                      if (isExclusion) {
                        return (
                          <div
                            key={fact.fact_id || fact._id}
                            className="py-3.5 first:pt-0 last:pb-0 flex items-start justify-between gap-4 text-left"
                          >
                            <div className="flex items-start gap-2.5 flex-1 min-w-0">
                              <span className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 flex-shrink-0" />
                              <p className="text-xs sm:text-sm text-[#062327] leading-relaxed font-medium">
                                {fact.fact_value}
                              </p>
                            </div>
                            {fact.source_page && (
                              <span className="text-[10px] text-[#558187] font-mono px-2 py-0.5 rounded-full bg-white border border-[#062327]/08 flex-shrink-0">
                                p.{fact.source_page}
                              </span>
                            )}
                          </div>
                        );
                      }

                      if (isWaiting) {
                        let waitingCond = '';
                        let waitingPeriod = '';
                        const raw = fact.fact_value || '';
                        if (fact.metadata?.condition && fact.metadata?.period) {
                          waitingCond = fact.metadata.condition;
                          waitingPeriod = fact.metadata.period;
                        } else if (raw.includes(':')) {
                          const parts = raw.split(':');
                          // If both condition & period exist, like "Pre-existing Disease: 36 months"
                          // Sometimes the condition text itself repeated the raw text or description
                          waitingCond = parts[0].trim();
                          waitingPeriod = parts.slice(1).join(':').trim();
                        } else {
                          waitingCond = raw;
                        }

                        // If waitingCond is identical to or repeating the full raw value, clean it up
                        const displayCondition = fact.metadata?.condition || waitingCond;
                        const displayPeriod = fact.metadata?.period || waitingPeriod;

                        return (
                          <div
                            key={fact.fact_id || fact._id}
                            className="py-3.5 first:pt-0 last:pb-0 flex items-start justify-between gap-4"
                          >
                            {/* Left column: fixed width ~58% */}
                            <div className="w-[58%] text-left flex-shrink-0">
                              <div className="flex items-start gap-2">
                                {fact.extraction_confidence && (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 mt-0.5 ${CONFIDENCE_STYLE[fact.extraction_confidence] || 'status-info'}`}>
                                    {fact.extraction_confidence}
                                  </span>
                                )}
                                <p className="text-xs sm:text-sm font-semibold text-[#062327] leading-snug break-words">
                                  {displayCondition}
                                </p>
                              </div>
                              {fact.source_page && (
                                <p className="text-[10px] text-[#558187] mt-1">
                                  Page {fact.source_page}
                                  {fact.source_section ? ` · ${fact.source_section}` : ''}
                                </p>
                              )}
                            </div>

                            {/* Right column: fixed width ~40%, right aligned */}
                            <div className="w-[40%] text-right flex-shrink-0">
                              {displayPeriod ? (
                                <p className="font-sans text-sm sm:text-base font-bold text-[#062327] tracking-tight tabular-nums text-right break-words leading-snug">
                                  {displayPeriod}
                                </p>
                              ) : (
                                <span className="text-xs text-[#558187]">—</span>
                              )}
                            </div>
                          </div>
                        );
                      }

                      // Default key-value attributes (metadata, sum insured, limits, co-pay, deductible, etc.)
                      const label = fact.fact_key?.replace(/_/g, ' ') || 'Detail';

                      return (
                        <div
                          key={fact.fact_id || fact._id}
                          className="py-3.5 first:pt-0 last:pb-0 flex items-start justify-between gap-4"
                        >
                          {/* Left column: fixed width ~45% */}
                          <div className="w-[45%] text-left flex-shrink-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {fact.extraction_confidence && (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${CONFIDENCE_STYLE[fact.extraction_confidence] || 'status-info'}`}>
                                  {fact.extraction_confidence}
                                </span>
                              )}
                              <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#558187] break-words">
                                {label}
                              </p>
                            </div>
                            {fact.source_page && (
                              <p className="text-[10px] text-[#558187] font-medium mt-0.5">
                                Page {fact.source_page}
                                {fact.source_section ? ` · ${fact.source_section}` : ''}
                              </p>
                            )}
                          </div>

                          {/* Right column: fixed width ~52%, right aligned */}
                          <div className="w-[52%] text-right flex-shrink-0">
                            <p className="font-sans text-sm sm:text-base font-bold text-[#062327] tracking-tight tabular-nums text-right break-words leading-snug">
                              {fact.fact_value}
                              {fact.unit && fact.unit !== 'INR' && (
                                <span className="text-xs text-[#558187] font-normal ml-1.5">{fact.unit}</span>
                              )}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
