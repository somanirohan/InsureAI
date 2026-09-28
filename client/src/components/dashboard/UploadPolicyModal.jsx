import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  X,
  CheckCircle,
  FileText,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  Building2,
  Hash,
  IndianRupee,
  RefreshCw,
  Check,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import api from '../../services/api';
import { Spinner, ErrorBanner } from '../common/ui';

const PIPELINE_STEPS = [
  { id: 'uploading',  label: 'Uploading' },
  { id: 'extracting', label: 'Extracting' },
  { id: 'indexed',    label: 'Indexing' },
  { id: 'ready',      label: 'Ready' },
];

const stepOrder = PIPELINE_STEPS.map(s => s.id);

const formatMoney = (val) => {
  if (!val && val !== 0) return '—';
  if (typeof val === 'number') {
    if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
    if (val >= 100000) return `₹${(val / 100000).toFixed(1)} Lakhs`;
    return `₹${val.toLocaleString('en-IN')}`;
  }
  return String(val);
};

export default function UploadPolicyModal({ isOpen, onClose, onUploadSuccess }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [extractedPolicy, setExtractedPolicy] = useState(null);
  const inputRef = useRef(null);

  if (!isOpen) return null;

  const handleReset = () => {
    setFile(null);
    setUploading(false);
    setPipelineStep(null);
    setError(null);
    setExtractedPolicy(null);
  };

  const handleClose = () => {
    if (extractedPolicy) {
      onUploadSuccess(extractedPolicy);
    }
    handleReset();
    onClose();
  };

  const handleFile = (f) => {
    if (f && (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))) {
      setFile(f);
      setError(null);
      setExtractedPolicy(null);
    } else {
      setError('Please select a valid PDF file.');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setError('Please select a policy PDF.'); return; }

    try {
      setUploading(true);
      setPipelineStep('uploading');
      setError(null);

      const formData = new FormData();
      formData.append('file', file);

      const res = await api.post('/policies/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const uploadedPolicy = res.data.policy;
      const policyId = uploadedPolicy._id;
      setPipelineStep(uploadedPolicy.status || 'uploading');

      // Poll real backend status every 1.2 seconds until ready or failed
      const pollInterval = setInterval(async () => {
        try {
          const pollRes = await api.get(`/policies/${policyId}`);
          const pol = pollRes.data.policy;
          const currentStatus = pol.status;

          setPipelineStep(currentStatus);

          if (currentStatus === 'ready') {
            clearInterval(pollInterval);
            setUploading(false);
            setPipelineStep('ready');
            setExtractedPolicy(pol);
          } else if (currentStatus === 'failed') {
            clearInterval(pollInterval);
            setError(pol.processing_error || 'Policy extraction failed on server.');
            setUploading(false);
            setPipelineStep(null);
          }
        } catch (pollErr) {
          console.error('Error polling policy status:', pollErr);
        }
      }, 1200);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || 'Upload failed. Please try again.');
      setUploading(false);
      setPipelineStep(null);
    }
  };

  const currentIdx = stepOrder.indexOf(pipelineStep);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md animate-fade-in"
      onClick={e => { if (!uploading && e.target === e.currentTarget) handleClose(); }}
    >
      <div className={`w-full ${extractedPolicy ? 'max-w-xl' : 'max-w-md'} bg-[#1e1e23] border border-white/[0.10] rounded-2xl shadow-2xl transition-all duration-300 animate-slide-up overflow-hidden`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            {extractedPolicy ? (
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <ShieldCheck size={18} />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
                <UploadCloud size={18} />
              </div>
            )}
            <div>
              <h2 className="text-base font-semibold text-zinc-100">
                {extractedPolicy ? 'Policy Extracted Successfully' : 'Upload Policy'}
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                {extractedPolicy
                  ? 'Key details & clauses auto-detected from your document'
                  : 'AI automatically extracts provider, plan type & coverage facts'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={uploading}
            className="btn btn-ghost p-2 rounded-xl text-zinc-400 hover:text-zinc-200"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />

          {/* ================= EXTRACTED SUMMARY VIEW ================= */}
          {extractedPolicy ? (
            <div className="space-y-4 animate-fade-in">
              {/* Top Insurer Banner */}
              <div className="surface-inset p-4 rounded-xl border border-white/[0.08] relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/[0.04] rounded-full blur-2xl pointer-events-none" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <Check size={10} /> Auto-Detected Insurer
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-zinc-100 truncate">
                      {extractedPolicy.insurer_name || 'Insurance Provider'}
                    </h3>
                    <p className="text-xs text-zinc-400 font-medium mt-0.5">
                      {extractedPolicy.policy_type || 'Comprehensive Health Plan'}
                      {extractedPolicy.policy_number && (
                        <span className="text-zinc-500 font-mono ml-2">
                          · {extractedPolicy.policy_number}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Base Sum Insured</p>
                    <p className="text-base font-bold text-brand-400 mt-0.5">
                      {formatMoney(extractedPolicy.sum_insured)}
                    </p>
                    {extractedPolicy.premium_amount && (
                      <p className="text-xs text-zinc-400 mt-0.5">
                        ₹{extractedPolicy.premium_amount.toLocaleString('en-IN')}/yr
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Extracted Details Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="surface-inset p-3.5 rounded-xl border border-white/[0.06]">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">Room Rent Cap</p>
                  <p className="text-xs font-medium text-zinc-200 line-clamp-2">
                    {extractedPolicy.red_flag_summary?.room_rent_cap || 'No sub-limit detected'}
                  </p>
                </div>
                <div className="surface-inset p-3.5 rounded-xl border border-white/[0.06]">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">Co-Payment</p>
                  <p className="text-xs font-medium text-zinc-200 line-clamp-2">
                    {extractedPolicy.red_flag_summary?.copay_percentage || '0% / None specified'}
                  </p>
                </div>
              </div>

              {/* Waiting Periods & Exclusions Summary */}
              {extractedPolicy.red_flag_summary && (
                <div className="surface-inset p-3.5 rounded-xl border border-white/[0.06] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-300">Extracted Clauses &amp; Highlights</span>
                    <span className="text-[11px] text-brand-400 font-medium">
                      {extractedPolicy.facts?.length || 0} structured facts
                    </span>
                  </div>

                  {extractedPolicy.red_flag_summary.waiting_periods?.length > 0 && (
                    <div className="text-xs text-zinc-400 flex items-start gap-2 pt-1 border-t border-white/[0.04]">
                      <span className="text-amber-400 font-bold">·</span>
                      <span className="line-clamp-1">
                        <strong className="text-zinc-300">Waiting Periods: </strong>
                        {extractedPolicy.red_flag_summary.waiting_periods.slice(0, 2).join(' | ')}
                      </span>
                    </div>
                  )}

                  {extractedPolicy.red_flag_summary.major_exclusions?.length > 0 && (
                    <div className="text-xs text-zinc-400 flex items-start gap-2 pt-1 border-t border-white/[0.04]">
                      <span className="text-red-400 font-bold">·</span>
                      <span className="line-clamp-1">
                        <strong className="text-zinc-300">Exclusions: </strong>
                        {extractedPolicy.red_flag_summary.major_exclusions.slice(0, 2).join(' | ')}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="btn btn-ghost flex-1 py-2.5 text-xs text-zinc-400 hover:text-zinc-200"
                >
                  <RefreshCw size={13} className="mr-1.5" />
                  Upload Another
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="btn btn-primary flex-1 py-2.5 text-xs font-semibold gap-1.5 shadow-lg shadow-brand-500/10"
                >
                  View in Dashboard
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          ) : (
            /* ================= UPLOAD FORM VIEW ================= */
            <>
              {/* Pipeline progress steps */}
              {pipelineStep && (
                <div className="surface-inset p-4 rounded-xl border border-white/[0.06]">
                  <div className="flex items-center gap-2 mb-4">
                    <Spinner size={13} className="text-brand-500" />
                    <span className="text-xs font-medium text-brand-400">
                      Processing policy document with AI pipeline...
                    </span>
                  </div>
                  <div className="flex items-center gap-0">
                    {PIPELINE_STEPS.map((step, idx) => {
                      const isComplete = currentIdx >= idx;
                      const isCurrent = currentIdx === idx;
                      return (
                        <React.Fragment key={step.id}>
                          <div className="flex flex-col items-center gap-1 flex-1">
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold transition-all duration-300 ${
                                isComplete
                                  ? 'bg-brand-500 text-black shadow-sm'
                                  : 'bg-white/[0.06] text-zinc-600'
                              } ${isCurrent ? 'ring-2 ring-brand-500/40 ring-offset-2 ring-offset-[#18181c]' : ''}`}
                            >
                              {isComplete && currentIdx > idx ? <CheckCircle size={12} /> : idx + 1}
                            </div>
                            <span className={`text-[10px] ${isComplete ? 'text-zinc-300 font-medium' : 'text-zinc-600'}`}>
                              {step.label}
                            </span>
                          </div>
                          {idx < PIPELINE_STEPS.length - 1 && (
                            <div className={`h-px flex-1 -mt-4 mb-4 mx-1 transition-all duration-300 ${
                              currentIdx > idx ? 'bg-brand-500' : 'bg-white/[0.06]'
                            }`} />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* File drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => !uploading && inputRef.current?.click()}
                className={`
                  border-2 border-dashed rounded-xl p-7 text-center cursor-pointer transition-all duration-200
                  ${dragOver
                    ? 'border-brand-500/80 bg-brand-500/[0.06] scale-[0.99]'
                    : 'border-white/[0.10] hover:border-brand-500/40 hover:bg-white/[0.02]'
                  }
                  ${uploading ? 'pointer-events-none opacity-50' : ''}
                `}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf"
                  onChange={e => handleFile(e.target.files[0])}
                  disabled={uploading}
                  className="hidden"
                />
                {file ? (
                  <div className="flex items-center justify-center gap-2.5 text-sm">
                    <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
                      <FileText size={16} />
                    </div>
                    <div className="text-left min-w-0 max-w-[240px]">
                      <p className="text-zinc-100 font-medium text-xs truncate">{file.name}</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">{(file.size / (1024 * 1024)).toFixed(2)} MB PDF ready</p>
                    </div>
                    {!uploading && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setFile(null); }}
                        className="text-zinc-500 hover:text-zinc-200 transition-colors p-1"
                        aria-label="Remove selected file"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-zinc-400 mx-auto mb-3 shadow-inner">
                      <UploadCloud size={24} />
                    </div>
                    <p className="text-sm text-zinc-200 font-medium">Drop policy PDF here or click to browse</p>
                    <p className="text-xs text-zinc-500 mt-1">Official insurance policy document · max 25 MB</p>
                  </>
                )}
              </div>

              {/* Automatic Extraction Info Callout */}
              <div className="surface-inset p-3.5 rounded-xl border border-white/[0.06] flex items-start gap-3">
                <div className="w-6 h-6 rounded-md bg-brand-500/10 text-brand-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Sparkles size={13} />
                </div>
                <div className="text-xs">
                  <p className="font-semibold text-zinc-200">Zero Manual Entry Required</p>
                  <p className="text-zinc-400 mt-0.5 leading-relaxed">
                    Our AI automatically identifies the insurance provider, plan type, policy number, cover limits, and scans all waiting periods &amp; exclusions.
                  </p>
                </div>
              </div>

              {/* Submit CTA */}
              <button
                onClick={handleSubmit}
                disabled={uploading || !file}
                className="btn btn-primary w-full py-3 font-semibold text-sm shadow-lg shadow-brand-500/15"
              >
                {uploading ? (
                  <>
                    <Spinner size={14} />
                    Extracting &amp; Indexing…
                  </>
                ) : (
                  <>
                    <UploadCloud size={15} />
                    Upload &amp; Extract
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
