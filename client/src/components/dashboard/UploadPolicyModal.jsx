import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  Clock,
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

const parseWaitingPeriod = (str) => {
  if (typeof str !== 'string') return { condition: String(str || ''), period: '' };
  const idx = str.indexOf(':');
  if (idx !== -1) {
    return {
      condition: str.substring(0, idx).trim(),
      period: str.substring(idx + 1).trim(),
    };
  }
  return { condition: str.trim(), period: '' };
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

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(6, 35, 39, 0.25)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      onClick={e => { if (!uploading && e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className={`w-full ${extractedPolicy ? 'max-w-xl max-h-[90vh] flex flex-col' : 'max-w-md'} rounded-[32px] shadow-[0_24px_80px_rgba(6,35,39,0.22)] transition-all duration-300 animate-slide-up overflow-hidden`}
        style={{
          background: '#ffffff',
          border: '1.5px solid rgba(6, 35, 39, 0.12)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-7 pt-6 pb-4 border-b border-[#062327]/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-[#d2f57b] border-2 border-[#062327] overflow-hidden flex items-center justify-center flex-shrink-0 p-1 shadow-sm">
              <img src="/favicon_io/apple-touch-icon.png" alt="Logo" className="w-full h-full object-contain rounded-lg" />
            </div>
            <div>
              <h2 className="font-headline text-base font-bold text-[#062327] tracking-tight">
                {extractedPolicy ? 'Policy Extracted Successfully' : 'Upload Policy'}
              </h2>
              <p className="text-xs text-[#558187] mt-0.5 font-medium">
                {extractedPolicy
                  ? 'Key details & clauses auto-detected from your contract'
                  : 'AI automatically extracts provider, plan type & coverage terms'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={uploading}
            className="text-[#558187] hover:text-[#062327] p-2 rounded-xl hover:bg-[#062327]/08 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-7 py-6 space-y-5 overflow-y-auto flex-1">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />

          {/* ================= EXTRACTED SUMMARY VIEW ================= */}
          {extractedPolicy ? (
            <div className="space-y-4 animate-fade-in">
              {/* Top Insurer Banner */}
              <div className="bg-[#f5f8f8] p-5 rounded-2xl border border-[#062327]/10 relative overflow-hidden">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-headline text-lg font-bold text-[#062327] truncate">
                      {extractedPolicy.insurer_name || 'Insurance Provider'}
                    </h3>
                    <p className="text-xs text-[#558187] font-medium mt-1">
                      {extractedPolicy.policy_type || 'Comprehensive Health Plan'}
                      {extractedPolicy.policy_number && (
                        <span className="text-[#558187] font-mono ml-2">
                          · {extractedPolicy.policy_number}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] text-[#558187] uppercase tracking-wider font-bold">Base Sum Insured</p>
                    <p className="font-headline text-lg font-extrabold text-[#062327] mt-0.5">
                      {formatMoney(extractedPolicy.sum_insured)}
                    </p>
                    {extractedPolicy.premium_amount && (
                      <p className="text-xs text-[#558187] mt-0.5">
                        ₹{extractedPolicy.premium_amount.toLocaleString('en-IN')}/yr
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Extracted Details Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#f5f8f8] p-3.5 rounded-2xl border border-[#062327]/08">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#558187] mb-1">Room Rent Cap</p>
                  <p className="text-xs font-semibold text-[#062327] line-clamp-2">
                    {extractedPolicy.red_flag_summary?.room_rent_cap || 'No sub-limit detected'}
                  </p>
                </div>
                <div className="bg-[#f5f8f8] p-3.5 rounded-2xl border border-[#062327]/08">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#558187] mb-1">Co-Payment</p>
                  <p className="text-xs font-semibold text-[#062327] line-clamp-2">
                    {extractedPolicy.red_flag_summary?.copay_percentage || '0% / None specified'}
                  </p>
                </div>
              </div>

              {/* Waiting Periods & Exclusions Summary */}
              {extractedPolicy.red_flag_summary && (
                <div className="space-y-3">
                  {/* Waiting Periods */}
                  {extractedPolicy.red_flag_summary.waiting_periods?.length > 0 && (
                    <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-200 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                          <Clock size={13} />
                          <span>Waiting Periods</span>
                        </div>
                        <span className="text-[10px] text-amber-600 font-medium">
                          {extractedPolicy.red_flag_summary.waiting_periods.length} clauses
                        </span>
                      </div>
                      <div className="space-y-1.5 pt-0.5">
                        {extractedPolicy.red_flag_summary.waiting_periods.map((wp, i) => {
                          const { condition, period } = parseWaitingPeriod(wp);
                          return (
                            <div
                              key={i}
                              className="flex items-center justify-between gap-3 text-xs bg-white border border-amber-100 px-3 py-2 rounded-lg"
                            >
                              <span className="text-[#062327] font-medium leading-snug">{condition}</span>
                              {period && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap flex-shrink-0">
                                  {period}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Major Exclusions */}
                  {extractedPolicy.red_flag_summary.major_exclusions?.length > 0 && (
                    <div className="bg-rose-50 p-3.5 rounded-xl border border-rose-200 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                          <AlertTriangle size={13} />
                          <span>Key Exclusions</span>
                        </div>
                        <span className="text-[10px] text-rose-500 font-medium">
                          {extractedPolicy.red_flag_summary.major_exclusions.length} items
                        </span>
                      </div>
                      <div className="space-y-1.5 pt-0.5">
                        {extractedPolicy.red_flag_summary.major_exclusions.slice(0, 4).map((item, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-2.5 text-xs text-[#062327] bg-white border border-rose-100 px-3 py-2 rounded-lg leading-relaxed"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 flex-shrink-0" />
                            <span className="flex-1">{item}</span>
                          </div>
                        ))}
                        {extractedPolicy.red_flag_summary.major_exclusions.length > 4 && (
                          <p className="text-[11px] text-[#558187] text-center pt-1 font-medium">
                            +{extractedPolicy.red_flag_summary.major_exclusions.length - 4} more exclusions documented in policy record
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="btn-pill-dark flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={13} />
                  <span>Upload Another</span>
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="btn-pill-lime flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                >
                  <span>View in Dashboard</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          ) : (
            /* ================= UPLOAD FORM VIEW ================= */
            <>
              {/* Pipeline progress steps */}
              {pipelineStep && (
                <div className="bg-[#f5f8f8] p-4 rounded-2xl border border-[#062327]/10">
                  <div className="flex items-center gap-2 mb-4">
                    <Spinner size={14} className="text-[#062327]" />
                    <span className="text-xs font-bold text-[#062327]">
                      Processing policy document with AI pipeline…
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
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black transition-all duration-300 ${
                                isComplete
                                  ? 'bg-[#d2f57b] text-[#062327] border-2 border-[#062327] shadow-sm'
                                  : 'bg-[#062327]/08 text-[#558187]'
                              } ${isCurrent ? 'ring-2 ring-[#062327]/30 ring-offset-2 ring-offset-white' : ''}`}
                            >
                              {isComplete && currentIdx > idx ? <CheckCircle size={14} /> : idx + 1}
                            </div>
                            <span className={`text-[10px] font-bold ${isComplete ? 'text-[#062327]' : 'text-[#558187]'}`}>
                              {step.label}
                            </span>
                          </div>
                          {idx < PIPELINE_STEPS.length - 1 && (
                            <div className={`h-0.5 flex-1 -mt-4 mb-4 mx-1 transition-all duration-300 ${
                              currentIdx > idx ? 'bg-[#062327]' : 'bg-[#062327]/15'
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
                  border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all duration-200
                  ${dragOver
                    ? 'border-[#062327] bg-[#d2f57b]/20 scale-[0.99]'
                    : 'border-[#062327]/18 bg-[#f5f8f8] hover:border-[#062327]/40 hover:bg-[#edf3f3]'
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
                  <div className="flex items-center justify-center gap-3 text-sm">
                    <div className="w-10 h-10 rounded-2xl bg-[#d2f57b]/30 border border-[#062327]/20 flex items-center justify-center text-[#062327]">
                      <FileText size={18} />
                    </div>
                    <div className="text-left min-w-0 max-w-[240px]">
                      <p className="text-[#062327] font-bold text-xs truncate">{file.name}</p>
                      <p className="text-[11px] text-[#558187] mt-0.5">{(file.size / (1024 * 1024)).toFixed(2)} MB PDF ready</p>
                    </div>
                    {!uploading && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setFile(null); }}
                        className="text-[#558187] hover:text-[#062327] transition-colors p-1"
                        aria-label="Remove selected file"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-2xl bg-white border border-[#062327]/15 flex items-center justify-center text-[#062327] mx-auto mb-3 shadow-sm">
                      <UploadCloud size={24} />
                    </div>
                    <p className="font-headline text-sm font-bold text-[#062327]">Drop your insurance policy PDF here</p>
                    <p className="text-xs text-[#558187] mt-1">or click to browse files from your computer</p>
                  </>
                )}
              </div>

              {/* Submit CTA */}
              <button
                onClick={handleSubmit}
                disabled={uploading || !file}
                className="btn-pill-lime w-full py-3.5 px-6 font-bold text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
              >
                {uploading ? (
                  <>
                    <Spinner size={15} />
                    <span>Extracting &amp; Indexing…</span>
                  </>
                ) : (
                  <>
                    <UploadCloud size={16} />
                    <span>Upload &amp; Extract Facts</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
