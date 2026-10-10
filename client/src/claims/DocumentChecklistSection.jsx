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
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#dcfce7] text-[#15803d] border border-[#22c55e]/30">
            <CheckCircle2 size={12} />
            Validated
          </span>
        );
      case 'needs_confirmation':
      case 'flagged':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#fef3c7] text-[#b45309] border border-[#f59e0b]/30">
            <AlertTriangle size={12} />
            Needs Confirmation
          </span>
        );
      case 'uploaded':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#dbeafe] text-[#1e40af] border border-[#3b82f6]/30">
            <Clock size={12} />
            Uploaded
          </span>
        );
      case 'required':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#fee2e2] text-[#b91c1c] border border-[#ef4444]/30">
            Required
          </span>
        );
    }
  };

  return (
    <div className="bg-white border border-[#062327]/10 rounded-3xl p-6 shadow-sm flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <FileCheck size={18} className="text-[#062327]" />
          <h3 className="font-headline text-base font-bold text-[#062327] tracking-tight">
            Policy-Cited Claim Readiness Checklist
          </h3>
        </div>
        <p className="text-xs text-[#558187] mt-1 font-medium">
          Each requirement is extracted from your policy. Upload the cited document for each slot to satisfy claim submission.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {stages.map(stage => {
          const items = grouped[stage] || [];
          if (items.length === 0) return null;

          return (
            <div key={stage} className="flex flex-col gap-3">
              <div className="text-xs font-bold uppercase tracking-wider text-[#558187] flex items-center gap-2">
                <span>{STAGE_LABELS[stage]}</span>
                <span className="text-[10px] text-[#558187] font-medium">({items.length} requirements)</span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {items.map(item => {
                  const doc = documents.find(d => d.item_id === item.item_id || d.document_id === item.document_id);
                  const isUploading = uploadingSlot === item.item_id;
                  const isExpanded = expandedDoc === item.item_id;

                  return (
                    <div
                      key={item.item_id}
                      className={`p-4 rounded-2xl border transition-all ${
                        item.status === 'validated'
                          ? 'bg-[#f0fdf4]/50 border-[#22c55e]/25'
                          : item.status === 'needs_confirmation' || item.status === 'flagged'
                          ? 'bg-[#fffbeb] border-[#f59e0b]/30'
                          : 'bg-[#f5f8f8] border-[#062327]/10'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-xs font-bold text-[#062327]">
                              {item.label}
                            </span>
                            {item.page_cite && (
                              <CitationBadge citation={`Page ${item.page_cite}`} />
                            )}
                            {item.deadline && (
                              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-white border border-[#062327]/15 text-[#062327] shadow-2xs">
                                ⏱ Deadline: {item.deadline}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Status & Upload button */}
                        <div className="flex items-center gap-2.5 flex-shrink-0">
                          {renderStatusBadge(item.status)}

                          <label className="cursor-pointer text-xs font-bold px-3.5 py-1.5 rounded-full border border-[#062327]/15 hover:border-[#062327]/30 bg-white hover:bg-[#f5f8f8] text-[#062327] flex items-center gap-1.5 transition-all shadow-sm">
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
                              className="p-1.5 rounded-full hover:bg-black/5 text-[#558187] hover:text-[#062327] transition-colors"
                              title={isExpanded ? 'Collapse extracted data' : 'View extracted data'}
                            >
                              {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Uploaded document details card */}
                      {doc && (
                        <div className={`mt-3 pt-3 border-t border-[#062327]/08 flex flex-col gap-3 ${!isExpanded ? 'hidden' : ''}`}>
                          <div className="flex items-center justify-between text-xs text-[#558187]">
                            <div className="flex items-center gap-2 truncate">
                              <FileText size={15} className="text-[#062327] flex-shrink-0" />
                              <span className="font-mono text-[#062327] font-semibold truncate">{doc.filename}</span>
                            </div>
                            {doc.needs_confirmation && (
                              <button
                                onClick={() => startEditing(doc)}
                                className="text-[11px] text-[#b45309] hover:text-[#92400e] underline font-bold"
                              >
                                Edit / Confirm Values
                              </button>
                            )}
                          </div>

                          {/* Extracted fields list */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white p-3 rounded-xl border border-[#062327]/08 text-[11px] shadow-2xs">
                            <div>
                              <span className="text-[#558187] block font-medium">Patient Name</span>
                              <span className="text-[#062327] font-bold">{doc.extracted_fields?.patient_name || '—'}</span>
                            </div>
                            <div>
                              <span className="text-[#558187] block font-medium">Dates</span>
                              <span className="text-[#062327] font-bold">
                                {doc.extracted_fields?.admission_date || '—'} to {doc.extracted_fields?.discharge_date || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[#558187] block font-medium">Diagnosis</span>
                              <span className="text-[#062327] font-bold truncate block">{doc.extracted_fields?.diagnosis || '—'}</span>
                            </div>
                            <div>
                              <span className="text-[#558187] block font-medium">Billed Total</span>
                              <span className="text-[#062327] font-bold">
                                {doc.extracted_fields?.total_amount ? `₹${Number(doc.extracted_fields.total_amount).toLocaleString('en-IN')}` : '—'}
                              </span>
                            </div>
                          </div>

                          {/* Validation Issues Alert */}
                          {doc.validation_issues?.length > 0 && (
                            <div className="p-3.5 rounded-xl bg-[#fffbeb] border border-[#f59e0b]/30 flex flex-col gap-1 text-xs text-[#92400e]">
                              <div className="font-bold flex items-center gap-1.5 text-[#b45309]">
                                <AlertTriangle size={14} />
                                <span>Validation Attention Required</span>
                              </div>
                              <ul className="list-disc list-inside text-[11px] text-[#92400e]/90 space-y-0.5 font-medium">
                                {doc.validation_issues.map((iss, i) => (
                                  <li key={i}>{iss}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Confirmation Editor */}
                          {editingDocId === doc.document_id && (
                            <div className="p-5 rounded-2xl bg-[#ffffff] border-2 border-[#062327]/20 shadow-md flex flex-col gap-4">
                              <div className="text-xs font-bold text-[#062327]">
                                Verify & Confirm Extracted Fields
                              </div>
                              <p className="text-[11px] text-[#558187] font-medium">
                                Correct any OCR recognition errors below. Confirming will mark this document validated.
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                <div>
                                  <label className="text-[#062327] font-bold block mb-1">Patient Name</label>
                                  <input
                                    type="text"
                                    value={editFields.patient_name}
                                    onChange={e => setEditFields({ ...editFields, patient_name: e.target.value })}
                                    className="w-full bg-[#f5f8f8] border border-[#062327]/15 rounded-xl px-3 py-2 text-[#062327] font-medium"
                                  />
                                </div>
                                <div>
                                  <label className="text-[#062327] font-bold block mb-1">Total Billed Amount (₹)</label>
                                  <input
                                    type="number"
                                    value={editFields.total_amount}
                                    onChange={e => setEditFields({ ...editFields, total_amount: e.target.value })}
                                    className="w-full bg-[#f5f8f8] border border-[#062327]/15 rounded-xl px-3 py-2 text-[#062327] font-medium"
                                  />
                                </div>
                                <div>
                                  <label className="text-[#062327] font-bold block mb-1">Admission Date</label>
                                  <input
                                    type="date"
                                    value={editFields.admission_date}
                                    onChange={e => setEditFields({ ...editFields, admission_date: e.target.value })}
                                    className="w-full bg-[#f5f8f8] border border-[#062327]/15 rounded-xl px-3 py-2 text-[#062327] font-medium"
                                  />
                                </div>
                                <div>
                                  <label className="text-[#062327] font-bold block mb-1">Diagnosis</label>
                                  <input
                                    type="text"
                                    value={editFields.diagnosis}
                                    onChange={e => setEditFields({ ...editFields, diagnosis: e.target.value })}
                                    className="w-full bg-[#f5f8f8] border border-[#062327]/15 rounded-xl px-3 py-2 text-[#062327] font-medium"
                                  />
                                </div>
                              </div>
                              <div className="flex justify-end gap-2 pt-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingDocId(null)}
                                  className="text-xs px-4 py-2 rounded-full border border-[#062327]/15 text-[#558187] hover:text-[#062327] font-bold cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={confirmingLoading}
                                  onClick={() => handleConfirmSubmit(doc.document_id)}
                                  className="btn-pill-lime text-xs px-5 py-2 font-bold flex items-center gap-1.5 cursor-pointer"
                                >
                                  {confirmingLoading ? <Spinner size="xs" /> : <Check size={14} />}
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
