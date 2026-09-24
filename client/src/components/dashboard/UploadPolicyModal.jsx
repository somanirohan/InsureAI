import React, { useState } from 'react';
import { UploadCloud, X, CheckCircle2, Clock, AlertCircle, FileText } from 'lucide-react';
import api from '../../services/api';

export default function UploadPolicyModal({ isOpen, onClose, onUploadSuccess }) {
  const [file, setFile] = useState(null);
  const [insurerName, setInsurerName] = useState('Star Health & Allied Insurance');
  const [policyType, setPolicyType] = useState('individual_health');
  const [uploading, setUploading] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(null); // 'uploading' | 'extracting' | 'indexed' | 'ready'
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select an insurance policy PDF file');
      return;
    }

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

      // Show pipeline simulation states to the user
      setTimeout(() => setPipelineStep('extracting'), 1000);
      setTimeout(() => setPipelineStep('indexed'), 2200);
      setTimeout(() => {
        setPipelineStep('ready');
        setTimeout(() => {
          setUploading(false);
          setPipelineStep(null);
          onUploadSuccess(res.data.policy);
          onClose();
        }, 800);
      }, 3400);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to upload document');
      setUploading(false);
      setPipelineStep(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg glass-panel-glow rounded-3xl p-6 sm:p-8 bg-slate-900 border border-slate-700 shadow-2xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={uploading}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 disabled:opacity-30"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Title */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white font-['Space_Grotesk']">Upload Insurance Policy</h2>
          <p className="text-xs text-slate-400 mt-1">
            Our AI pipeline will extract coverage categories, sub-limits, waiting periods, and chunk text for vector retrieval.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/50 border border-rose-800/80 flex items-center space-x-2 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Pipeline Progress indicator (FR-03) */}
        {pipelineStep && (
          <div className="mb-6 p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
            <div className="text-xs font-semibold text-emerald-400 mb-3 flex items-center space-x-1.5">
              <Clock className="w-4 h-4 animate-spin text-emerald-400" />
              <span>Document Processing Pipeline Active</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { id: 'uploading', label: 'Uploading' },
                { id: 'extracting', label: 'Extracting Facts' },
                { id: 'indexed', label: 'Vector Index' },
                { id: 'ready', label: 'Ready' },
              ].map((step, idx) => {
                const stepOrder = ['uploading', 'extracting', 'indexed', 'ready'];
                const currentIdx = stepOrder.indexOf(pipelineStep);
                const isComplete = currentIdx >= idx;
                const isCurrent = currentIdx === idx;

                return (
                  <div key={step.id} className="flex flex-col items-center">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mb-1 transition-all ${
                        isComplete
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-800 text-slate-400'
                      } ${isCurrent ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-900 animate-pulse' : ''}`}
                    >
                      {isComplete ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                    </div>
                    <span className={`text-[10px] ${isComplete ? 'text-slate-200 font-medium' : 'text-slate-500'}`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* File Picker */}
          <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500/50 rounded-2xl p-6 text-center cursor-pointer bg-slate-950/40 transition-colors">
            <input
              type="file"
              id="policy-file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileChange}
              disabled={uploading}
              className="hidden"
            />
            <label htmlFor="policy-file" className="cursor-pointer block">
              <UploadCloud className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
              {file ? (
                <div className="text-sm font-medium text-emerald-300 flex items-center justify-center space-x-2">
                  <FileText className="w-4 h-4" />
                  <span>{file.name}</span>
                </div>
              ) : (
                <>
                  <div className="text-sm font-semibold text-slate-200">
                    Click to select or drop policy PDF
                  </div>
                  <div className="text-xs text-slate-400 mt-1">Supports PDF (max 25MB)</div>
                </>
              )}
            </label>
          </div>

          {/* Insurer Selection */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Insurance Provider</label>
            <select
              value={insurerName}
              onChange={(e) => setInsurerName(e.target.value)}
              disabled={uploading}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="Star Health & Allied Insurance">Star Health & Allied Insurance</option>
              <option value="HDFC ERGO General Insurance">HDFC ERGO General Insurance</option>
              <option value="Care Health Insurance">Care Health Insurance (Religare)</option>
              <option value="Niva Bupa Health Insurance">Niva Bupa Health Insurance</option>
              <option value="ICICI Lombard Complete Health">ICICI Lombard Complete Health</option>
              <option value="Other Insurer">Other Insurer</option>
            </select>
          </div>

          {/* Policy Type */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Policy Type</label>
            <select
              value={policyType}
              onChange={(e) => setPolicyType(e.target.value)}
              disabled={uploading}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="individual_health">Individual Health Insurance</option>
              <option value="family_floater">Family Floater</option>
              <option value="group_health">Group Health (Corporate)</option>
              <option value="critical_illness">Critical Illness Plan</option>
              <option value="other">Other / Top-Up</option>
            </select>
          </div>

          {/* Submit Action */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={uploading || !file}
              className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? 'Processing Document...' : 'Upload & Start AI Extraction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
