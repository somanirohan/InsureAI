import React, { useState } from 'react';
import { X, ShieldAlert, Award, FileSearch, CheckCircle, Tag } from 'lucide-react';

export default function PolicyFactsModal({ policy, isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('all');

  if (!isOpen || !policy) return null;

  const facts = policy.facts || [];
  const redFlags = policy.red_flag_summary || {};

  const categories = [
    { id: 'all', label: 'All Facts' },
    { id: 'room_rent_limit', label: 'Room Rent' },
    { id: 'waiting_period', label: 'Waiting Periods' },
    { id: 'co_payment', label: 'Co-Pay & Deductibles' },
    { id: 'exclusion', label: 'Exclusions' },
    { id: 'sub_limit', label: 'Sub-Limits' },
  ];

  const filteredFacts = activeTab === 'all'
    ? facts
    : facts.filter((f) => {
        if (activeTab === 'co_payment') {
          return f.category === 'co_payment' || f.category === 'deductible';
        }
        return f.category === activeTab;
      });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col glass-panel rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                {policy.insurer_name}
              </span>
              <span className="text-xs text-slate-400">Policy: {policy.policy_number}</span>
            </div>
            <h2 className="text-xl font-bold text-white mt-1 font-['Space_Grotesk']">
              Extracted Policy Facts & Grounding Traceability
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Red Flags Alert Box (FR-06) */}
        {redFlags.waiting_periods && redFlags.waiting_periods.length > 0 && (
          <div className="mx-6 mt-4 p-4 rounded-2xl bg-amber-950/30 border border-amber-800/60 flex items-start space-x-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-amber-300 uppercase tracking-wider mb-1">
                Automated Red-Flag Diagnostics (FR-06)
              </div>
              <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
                {redFlags.waiting_periods.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
                {redFlags.room_rent_cap && (
                  <li><span className="text-amber-300 font-medium">Room Rent Clause:</span> {redFlags.room_rent_cap}</li>
                )}
              </ul>
            </div>
          </div>
        )}

        {/* Category Filters */}
        <div className="flex items-center space-x-2 px-6 pt-4 pb-2 overflow-x-auto border-b border-slate-800/80">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveTab(c.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === c.id
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Facts Table (FR-05) */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 font-bold">
                <tr>
                  <th className="py-3 px-4">Fact / Parameter</th>
                  <th className="py-3 px-4">Extracted Value</th>
                  <th className="py-3 px-4">Source Section</th>
                  <th className="py-3 px-4">Page</th>
                  <th className="py-3 px-4">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredFacts.map((fact, index) => (
                  <tr key={index} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-200">
                      <div className="flex items-center space-x-1.5">
                        <Tag className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="capitalize">{fact.fact_key.replace(/_/g, ' ')}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 capitalize">{fact.category.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="py-3 px-4 font-medium text-white max-w-xs">{fact.fact_value}</td>
                    <td className="py-3 px-4 text-slate-400">{fact.source_section || 'General Terms'}</td>
                    <td className="py-3 px-4 text-emerald-400 font-mono">Page {fact.source_page || '-'}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          fact.extraction_confidence === 'high'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}
                      >
                        {fact.extraction_confidence || 'high'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
