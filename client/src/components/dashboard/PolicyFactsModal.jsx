import React from 'react';
import { createPortal } from 'react-dom';
import { X, BookOpen, Tag, Percent, Clock, AlertTriangle, ShieldCheck, ArrowUpRight } from 'lucide-react';

const CATEGORY_META = {
  coverage_category:  { label: 'Coverage',       color: 'text-blue-400' },
  sum_insured:        { label: 'Sum Insured',     color: 'text-brand-500' },
  sub_limit:          { label: 'Sub-Limit',       color: 'text-purple-400' },
  waiting_period:     { label: 'Waiting Period',  color: 'text-amber-400' },
  exclusion:          { label: 'Exclusion',       color: 'text-red-400' },
  room_rent_limit:    { label: 'Room Rent',       color: 'text-orange-400' },
  co_payment:         { label: 'Co-Payment',      color: 'text-yellow-400' },
  deductible:         { label: 'Deductible',      color: 'text-pink-400' },
  claim_condition:    { label: 'Claim Condition', color: 'text-cyan-400' },
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
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full sm:max-w-2xl max-h-[90dvh] sm:max-h-[80vh] bg-[#1e1e23] border border-white/[0.10] rounded-t-2xl sm:rounded-2xl flex flex-col shadow-lg animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              {policy.insurer_name || policy.file_name}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {facts.length} extracted facts · {Object.keys(grouped).length} categories
            </p>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost p-2 rounded-xl"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 scroll-area">
          {facts.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-sm">
              No facts extracted yet. Policy may still be processing.
            </div>
          ) : (
            Object.entries(grouped).map(([category, categoryFacts]) => {
              const meta = CATEGORY_META[category] || { label: category, color: 'text-zinc-400' };
              return (
                <section key={category}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                    <div className="flex-1 h-px bg-white/[0.06]" />
                    <span className="label-xs">{categoryFacts.length}</span>
                  </div>
                  <div className="space-y-2">
                    {categoryFacts.map((fact) => (
                      <div
                        key={fact.fact_id || fact._id}
                        className="surface-inset rounded-xl p-3.5 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2"
                      >
                        <div>
                          <p className="text-xs font-medium text-zinc-300 capitalize mb-0.5">
                            {fact.fact_key?.replace(/_/g, ' ') || 'Unknown'}
                          </p>
                          <p className="text-sm text-zinc-100 font-semibold">
                            {fact.fact_value}
                            {fact.unit && fact.unit !== 'INR' && (
                              <span className="text-xs text-zinc-500 font-normal ml-1">{fact.unit}</span>
                            )}
                          </p>
                          {(fact.source_page || fact.source_section) && (
                            <p className="text-2xs text-zinc-600 mt-1">
                              {fact.source_page && `Page ${fact.source_page}`}
                              {fact.source_page && fact.source_section && ' · '}
                              {fact.source_section}
                            </p>
                          )}
                        </div>
                        {fact.extraction_confidence && (
                          <div className="flex sm:justify-end items-start">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${CONFIDENCE_STYLE[fact.extraction_confidence] || 'status-info'}`}>
                              {fact.extraction_confidence}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
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
