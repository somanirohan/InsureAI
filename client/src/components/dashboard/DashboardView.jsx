import React, { useState } from 'react';
import { UploadCloud, Shield, FileText, Activity, AlertTriangle, ArrowRight, Zap, CheckCircle2 } from 'lucide-react';
import PolicyCard from './PolicyCard';
import PolicyFactsModal from './PolicyFactsModal';
import UploadPolicyModal from './UploadPolicyModal';

export default function DashboardView({
  policies,
  onPolicyUploadSuccess,
  onDeletePolicy,
  onStartChat,
  onNavigateToCost,
  onNavigateToCompare,
}) {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedPolicyForFacts, setSelectedPolicyForFacts] = useState(null);

  // Compute aggregate stats
  const totalCoverage = policies.reduce((acc, p) => acc + (p.sum_insured || 0), 0);
  const totalFacts = policies.reduce((acc, p) => acc + (p.facts ? p.facts.length : 0), 0);
  const readyPolicies = policies.filter((p) => p.status === 'ready').length;

  return (
    <div className="space-y-8">
      {/* Welcome & Upload Hero Banner */}
      <div className="relative glass-panel-glow rounded-3xl p-6 sm:p-8 overflow-hidden bg-gradient-to-r from-slate-900 via-slate-900/90 to-emerald-950/40 border border-slate-700/80">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-800 text-emerald-400 text-xs font-semibold mb-3">
            <Zap className="w-3.5 h-3.5" />
            <span>MedShield AI Health Intelligence</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-['Space_Grotesk'] leading-tight">
            Demystify Complex Insurance Policies with Grounded AI
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm mt-2 leading-relaxed">
            Upload your health insurance policy documents to get structured fact extraction, automated red-flag detection, citation-backed answers, and treatment cost breakdowns.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => setIsUploadOpen(true)}
              className="flex items-center space-x-2 px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/25 transition-all"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Upload Policy Document</span>
            </button>

            <button
              onClick={onNavigateToCompare}
              className="flex items-center space-x-2 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition-colors border border-slate-700"
            >
              <span>Compare Policies</span>
              <ArrowRight className="w-4 h-4 text-emerald-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Quick Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-4 border border-slate-800">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Policies</div>
          <div className="text-2xl font-bold text-white mt-1">{policies.length}</div>
          <div className="text-[10px] text-emerald-400 mt-1 flex items-center">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            <span>{readyPolicies} ready for semantic chat</span>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-4 border border-slate-800">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Aggregate Sum Insured</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">
            ₹{(totalCoverage / 100000).toFixed(1)} Lakh
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Combined health cover</div>
        </div>

        <div className="glass-panel rounded-2xl p-4 border border-slate-800">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Extracted Facts</div>
          <div className="text-2xl font-bold text-white mt-1">{totalFacts}</div>
          <div className="text-[10px] text-slate-400 mt-1">Across all clause categories</div>
        </div>

        <div className="glass-panel rounded-2xl p-4 border border-slate-800">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Vector Store</div>
          <div className="text-2xl font-bold text-white mt-1">ChromaDB</div>
          <div className="text-[10px] text-emerald-400 mt-1">Grounded RAG retrieval active</div>
        </div>
      </div>

      {/* Policies List Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white font-['Space_Grotesk']">Your Uploaded Policies</h2>
            <p className="text-xs text-slate-400">Click any policy to review extracted parameters or start an AI consultation.</p>
          </div>

          <button
            onClick={() => setIsUploadOpen(true)}
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center space-x-1"
          >
            <span>+ Add Document</span>
          </button>
        </div>

        {policies.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center border-dashed border-2 border-slate-800">
            <FileText className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-300 mb-1">No policies uploaded yet</h3>
            <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
              Upload your insurance policy PDF to start analyzing waiting periods, room-rent limits, and out-of-pocket costs.
            </p>
            <button
              onClick={() => setIsUploadOpen(true)}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all"
            >
              Upload Policy Document
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {policies.map((policy) => (
              <PolicyCard
                key={policy._id}
                policy={policy}
                onSelect={(p) => setSelectedPolicyForFacts(p)}
                onDelete={onDeletePolicy}
                onStartChat={onStartChat}
              />
            ))}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      <UploadPolicyModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={onPolicyUploadSuccess}
      />

      {/* Facts & Traceability Modal */}
      <PolicyFactsModal
        policy={selectedPolicyForFacts}
        isOpen={!!selectedPolicyForFacts}
        onClose={() => setSelectedPolicyForFacts(null)}
      />
    </div>
  );
}
