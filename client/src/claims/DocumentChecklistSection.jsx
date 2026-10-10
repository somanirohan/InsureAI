import React, { useState } from 'react';
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Check,
  ChevronDown,
  ChevronUp,
  FileCheck,
  AlertOctagon,
} from 'lucide-react';
import CitationBadge from './CitationBadge';
import { Spinner } from '../components/common/ui';

const STAGE_LABELS = {
  before_admission: 'Before Admission',
  during_stay: 'During Hospital Stay',
  after_discharge: 'After Discharge',
  unspecified: 'General Requirements',
};

export default function DocumentChecklistSection({
  checklist = [],
  documents = [],
  onUploadDocument,
  onConfirmDocument,
  uploadingSlot,
}) {
  const [expandedDoc, setExpandedDoc] = useState(null);
  const [editingDocId, setEditingDocId] = useState(null);
  const [editFields, setEditFields] = useState({});
  const [confirmingLoading, setConfirmingLoading] = useState(false);

  // Group checklist items by stage
  const stages = ['before_admission', 'during_stay', 'after_discharge', 'unspecified'];
  const grouped = stages.reduce((acc, st) => {
    acc[st] = checklist.filter(it => it.stage === st);
    return acc;
  }, {});

  const handleFileChange = (itemId, e) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadDocument(itemId, file);
    }
  };

  const startEditing = (doc) => {
    setEditingDocId(doc.document_id);
    setEditFields({
      patient_name: doc.extracted_fields?.patient_name || '',
      admission_date: doc.extracted_fields?.admission_date || '',
      discharge_date: doc.extracted_fields?.discharge_date || '',
      diagnosis: doc.extracted_fields?.diagnosis || '',
      total_amount: doc.extracted_fields?.total_amount ? String(doc.extracted_fields.total_amount) : '',
    });
  };

  const handleConfirmSubmit = async (docId) => {
    try {
      setConfirmingLoading(true);
      const payload = {
        patient_name: editFields.patient_name || null,
        admission_date: editFields.admission_date || null,
        discharge_date: editFields.discharge_date || null,
        diagnosis: editFields.diagnosis || null,
        total_amount: editFields.total_amount ? parseFloat(editFields.total_amount) : null,
      };
      await onConfirmDocument(docId, payload);
      setEditingDocId(null);
    } catch (err) {
      console.error('Confirmation error:', err);
    } finally {
      setConfirmingLoading(false);
    }
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'validated':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 size={12} />
            Validated
          </span>
        );
      case 'needs_confirmation':
      case 'flagged':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle size={12} />
            Needs Confirmation
          </span>
        );
      case 'uploaded':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Clock size={12} />
            Uploaded
          </span>
        );
      case 'required':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            Required
          </span>
        );
    }
  };

  return (
    <div className="surface p-6 rounded-2xl border border-white/[0.08] flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <FileCheck size={18} className="text-amber-400" />
          <h3 className="text-sm font-semibold text-zinc-100 tracking-tight">
            Policy-Cited Claim Readiness Checklist
          </h3>
        </div>
        <p className="text-xs text-zinc-400 mt-1">
          Each requirement is extracted from your policy. Upload the cited document for each slot to satisfy claim submission.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {stages.map(stage => {
          const items = grouped[stage] || [];
          if (items.length === 0) return null;

          return (
            <div key={stage} className="flex flex-col gap-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <span>{STAGE_LABELS[stage]}</span>
                <span className="text-[10px] text-zinc-500 font-normal">({items.length} requirements)</span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {items.map(item => {
                  const doc = documents.find(d => d.item_id === item.item_id || d.document_id === item.document_id);
                  const isUploading = uploadingSlot === item.item_id;
                  const isExpanded = expandedDoc === item.item_id;

                  return (
                    <div
                      key={item.item_id}
                      className={`p-4 rounded-xl border transition-all ${
                        item.status === 'validated'
                          ? 'bg-emerald-500/[0.02] border-emerald-500/20'
                          : item.status === 'needs_confirmation' || item.status === 'flagged'
                          ? 'bg-amber-500/[0.02] border-amber-500/30'
                          : 'bg-white/[0.02] border-white/[0.06]'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-xs font-medium text-zinc-200">
                              {item.label}
                            </span>
                            {item.page_cite && (
                              <CitationBadge citation={`Page ${item.page_cite}`} />
                            )}
                            {item.deadline && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-zinc-300">
                                ⏱ Deadline: {item.deadline}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Status & Upload button */}
                        <div className="flex items-center gap-2.5 flex-shrink-0">
                          {renderStatusBadge(item.status)}

                          <label className="cursor-pointer text-xs font-medium px-3 py-1.5 rounded-xl border border-white/[0.1] hover:border-white/[0.2] bg-white/[0.03] hover:bg-white/[0.06] text-zinc-200 flex items-center gap-1.5 transition-all">
                            {isUploading ? (
                              <>
                                <Spinner size="xs" />
                                <span>Scanning...</span>
                              </>
                            ) : (
                              <>
                                <Upload size={13} />
                                <span>{doc ? 'Replace' : 'Upload'}</span>
                              </>
                            )}
                            <input
                              type="file"
                              accept=".pdf,.png,.jpg,.jpeg"
                              disabled={isUploading}
                              onChange={(e) => handleFileChange(item.item_id, e)}
                              className="hidden"
                            />
                          </label>

                          {doc && (
                            <button
                              onClick={() => setExpandedDoc(isExpanded ? null : item.item_id)}
                              className="p-1.5 rounded-lg hover:bg-white/[0.05] text-zinc-400 hover:text-zinc-200 transition-colors"
                              title={isExpanded ? 'Collapse extracted data' : 'View extracted data'}
                            >
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Uploaded document details card */}
                      {doc && (
                        <div className={`mt-3 pt-3 border-t border-white/[0.05] flex flex-col gap-3 ${!isExpanded ? 'hidden' : ''}`}>
                          <div className="flex items-center justify-between text-xs text-zinc-400">
                            <div className="flex items-center gap-2 truncate">
                              <FileText size={14} className="text-amber-400 flex-shrink-0" />
                              <span className="font-mono text-zinc-300 truncate">{doc.filename}</span>
                            </div>
                            {doc.needs_confirmation && (
                              <button
                                onClick={() => startEditing(doc)}
                                className="text-[11px] text-amber-400 hover:text-amber-300 underline font-medium"
                              >
                                Edit / Confirm Values
                              </button>
                            )}
                          </div>

                          {/* Extracted fields list */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white/[0.02] p-3 rounded-lg text-[11px]">
                            <div>
                              <span className="text-zinc-500 block">Patient Name</span>
                              <span className="text-zinc-200 font-medium">{doc.extracted_fields?.patient_name || '—'}</span>
                            </div>
                            <div>
                              <span className="text-zinc-500 block">Dates</span>
                              <span className="text-zinc-200 font-medium">
                                {doc.extracted_fields?.admission_date || '—'} to {doc.extracted_fields?.discharge_date || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-zinc-500 block">Diagnosis</span>
                              <span className="text-zinc-200 font-medium truncate block">{doc.extracted_fields?.diagnosis || '—'}</span>
                            </div>
                            <div>
                              <span className="text-zinc-500 block">Billed Total</span>
                              <span className="text-zinc-200 font-medium">
                                {doc.extracted_fields?.total_amount ? `₹${Number(doc.extracted_fields.total_amount).toLocaleString('en-IN')}` : '—'}
                              </span>
                            </div>
                          </div>

                          {/* Validation Issues Alert */}
                          {doc.validation_issues?.length > 0 && (
                            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex flex-col gap-1 text-xs text-amber-300">
                              <div className="font-semibold flex items-center gap-1.5">
                                <AlertTriangle size={13} />
                                <span>Validation Attention Required</span>
                              </div>
                              <ul className="list-disc list-inside text-[11px] text-amber-300/80 space-y-0.5">
                                {doc.validation_issues.map((iss, i) => (
                                  <li key={i}>{iss}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Confirmation Editor */}
                          {editingDocId === doc.document_id && (
                            <div className="p-4 rounded-xl bg-black/40 border border-amber-500/30 flex flex-col gap-3">
                              <div className="text-xs font-semibold text-amber-300">
                                Verify & Confirm Extracted Fields
                              </div>
                              <p className="text-[11px] text-zinc-400">
                                Correct any OCR recognition errors below. Confirming will mark this document validated.
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                <div>
                                  <label className="text-zinc-400 block mb-1">Patient Name</label>
                                  <input
                                    type="text"
                                    value={editFields.patient_name}
                                    onChange={e => setEditFields({ ...editFields, patient_name: e.target.value })}
                                    className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.1] text-zinc-100"
                                  />
                                </div>
                                <div>
                                  <label className="text-zinc-400 block mb-1">Total Billed Amount (₹)</label>
                                  <input
                                    type="number"
                                    value={editFields.total_amount}
                                    onChange={e => setEditFields({ ...editFields, total_amount: e.target.value })}
                                    className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.1] text-zinc-100"
                                  />
                                </div>
                                <div>
                                  <label className="text-zinc-400 block mb-1">Admission Date</label>
                                  <input
                                    type="date"
                                    value={editFields.admission_date}
                                    onChange={e => setEditFields({ ...editFields, admission_date: e.target.value })}
                                    className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.1] text-zinc-100"
                                  />
                                </div>
                                <div>
                                  <label className="text-zinc-400 block mb-1">Diagnosis</label>
                                  <input
                                    type="text"
                                    value={editFields.diagnosis}
                                    onChange={e => setEditFields({ ...editFields, diagnosis: e.target.value })}
                                    className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.1] text-zinc-100"
                                  />
                                </div>
                              </div>
                              <div className="flex justify-end gap-2 pt-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingDocId(null)}
                                  className="text-xs px-3 py-1.5 rounded-lg border border-white/[0.1] text-zinc-400 hover:text-zinc-200"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={confirmingLoading}
                                  onClick={() => handleConfirmSubmit(doc.document_id)}
                                  className="btn-primary text-xs px-4 py-1.5 rounded-lg flex items-center gap-1.5"
                                >
                                  {confirmingLoading ? <Spinner size="xs" /> : <Check size={13} />}
                                  <span>Confirm & Validate</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
