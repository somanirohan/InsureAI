import React, { useState, useRef } from 'react';
import { UploadCloud, X, CheckCircle, FileText, AlertCircle } from 'lucide-react';
import api from '../../services/api';
import { Spinner, ErrorBanner } from '../common/ui';

const PIPELINE_STEPS = [
  { id: 'uploading',  label: 'Uploading' },
  { id: 'extracting', label: 'Extracting' },
  { id: 'indexed',    label: 'Indexing' },
  { id: 'ready',      label: 'Ready' },
];

const stepOrder = PIPELINE_STEPS.map(s => s.id);

export default function UploadPolicyModal({ isOpen, onClose, onUploadSuccess }) {
  const [file, setFile] = useState(null);
  const [insurerName, setInsurerName] = useState('Star Health & Allied Insurance');
  const [policyType, setPolicyType] = useState('individual_health');
  const [uploading, setUploading] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  if (!isOpen) return null;

  const handleFile = (f) => {
    if (f && (f.type === 'application/pdf' || f.name.endsWith('.pdf'))) {
      setFile(f);
      setError(null);
    } else {
      setError('Please select a PDF file.');
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
      const formData = new FormData();
      formData.append('file', file);
      formData.append('insurer_name', insurerName);
      formData.append('policy_type', policyType);

      const res = await api.post('/policies/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setTimeout(() => setPipelineStep('extracting'), 800);
      setTimeout(() => setPipelineStep('indexed'), 2000);
      setTimeout(() => {
        setPipelineStep('ready');
        setTimeout(() => {
          setUploading(false);
          setPipelineStep(null);
          setFile(null);
          onUploadSuccess(res.data.policy);
          onClose();
        }, 600);
      }, 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed. Please try again.');
      setUploading(false);
      setPipelineStep(null);
    }
  };

  const currentIdx = stepOrder.indexOf(pipelineStep);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={e => { if (!uploading && e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-[#1e1e23] border border-white/[0.10] rounded-2xl shadow-lg animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Upload Policy</h2>
            <p className="text-xs text-zinc-500 mt-0.5">PDF will be processed by the AI extraction pipeline</p>
          </div>
          <button
            onClick={onClose}
            disabled={uploading}
            className="btn btn-ghost p-2 rounded-xl"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />

          {/* Pipeline progress */}
          {pipelineStep && (
            <div className="surface-inset p-4 rounded-xl">
              <div className="flex items-center gap-2 mb-4">
                <Spinner size={13} className="text-brand-500" />
                <span className="text-xs font-medium text-brand-500">Processing pipeline active</span>
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
                              ? 'bg-brand-500 text-black'
                              : 'bg-white/[0.06] text-zinc-600'
                          } ${isCurrent ? 'ring-2 ring-brand-500/40 ring-offset-2 ring-offset-[#18181c]' : ''}`}
                        >
                          {isComplete && currentIdx > idx ? <CheckCircle size={12} /> : idx + 1}
                        </div>
                        <span className={`text-[10px] ${isComplete ? 'text-zinc-300' : 'text-zinc-600'}`}>
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
              border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-150
              ${dragOver
                ? 'border-brand-500/60 bg-brand-500/[0.04]'
                : 'border-white/[0.08] hover:border-white/[0.14] hover:bg-white/[0.02]'
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
              <div className="flex items-center justify-center gap-2 text-sm">
                <FileText size={16} className="text-brand-500" />
                <span className="text-zinc-200 font-medium truncate max-w-xs">{file.name}</span>
                {!uploading && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setFile(null); }}
                    className="text-zinc-600 hover:text-zinc-300 transition-colors ml-1"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            ) : (
              <>
                <UploadCloud size={24} className="text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-300 font-medium">Drop PDF here or click to browse</p>
                <p className="text-xs text-zinc-600 mt-1">Insurance policy PDF · max 25 MB</p>
              </>
            )}
          </div>

          {/* Fields */}
          <div>
            <label className="label-xs block mb-2">Insurance Provider</label>
            <select
              value={insurerName}
              onChange={e => setInsurerName(e.target.value)}
              disabled={uploading}
              className="input-field"
            >
              <option>Star Health &amp; Allied Insurance</option>
              <option>HDFC ERGO General Insurance</option>
              <option>Care Health Insurance (Religare)</option>
              <option>Niva Bupa Health Insurance</option>
              <option>ICICI Lombard Complete Health</option>
              <option>Other Insurer</option>
            </select>
          </div>

          <div>
            <label className="label-xs block mb-2">Policy Type</label>
            <select
              value={policyType}
              onChange={e => setPolicyType(e.target.value)}
              disabled={uploading}
              className="input-field"
            >
              <option value="individual_health">Individual Health Insurance</option>
              <option value="family_floater">Family Floater</option>
              <option value="group_health">Group Health (Corporate)</option>
              <option value="critical_illness">Critical Illness Plan</option>
              <option value="other">Other / Top-Up</option>
            </select>
          </div>

          <button
            onClick={handleSubmit}
            disabled={uploading || !file}
            className="btn btn-primary w-full py-3 font-semibold"
          >
            {uploading ? (
              <>
                <Spinner size={14} />
                Processing…
              </>
            ) : (
              <>
                <UploadCloud size={15} />
                Upload &amp; Extract
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
