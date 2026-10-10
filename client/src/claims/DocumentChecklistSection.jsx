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
  Bell,
  CalendarClock,
  Info,
} from 'lucide-react';
import CitationBadge from './CitationBadge';
import { Spinner } from '../components/common/ui';

const STAGE_LABELS = {
  before_admission: 'Before Admission',
  during_stay: 'During Hospital Stay',
  after_discharge: 'After Discharge',
  unspecified: 'General',
};

const STAGE_ORDER = ['before_admission', 'during_stay', 'after_discharge', 'unspecified'];

// ─── Status badges ─────────────────────────────────────────────────────────────

function DocStatusBadge({ status }) {
  switch (status) {
    case 'validated':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#dcfce7] text-[#15803d] border border-[#22c55e]/30">
          <CheckCircle2 size={11} /> Validated
        </span>
      );
    case 'needs_confirmation':
    case 'flagged':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#fef3c7] text-[#b45309] border border-[#f59e0b]/30">
          <AlertTriangle size={11} /> Needs Confirmation
        </span>
      );
    case 'uploaded':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#dbeafe] text-[#1e40af] border border-[#3b82f6]/30">
          <Clock size={11} /> Uploaded
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
}

function ReqStatusBadge({ status }) {
  if (status === 'done') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#dcfce7] text-[#15803d] border border-[#22c55e]/30">
        <Check size={11} /> Done
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#f5f8f8] text-[#558187] border border-[#062327]/15">
      <Clock size={11} /> Pending
    </span>
  );
}

// ─── Requirement item card ─────────────────────────────────────────────────────

function RequirementCard({ item, onMarkDone, markingId }) {
  const isMarking = markingId === item.item_id;
  const isDone = item.status === 'done';
  const deadline = item.deadline;

  // Preauth items may carry an optional "Attach approval letter" slot — handled
  // by the upload section below; here we just show the action card.

  return (
    <div
      className={`p-4 rounded-2xl border transition-all ${
        isDone
          ? 'bg-[#f0fdf4]/60 border-[#22c55e]/25'
          : item.needs_confirmation
          ? 'bg-[#fffbeb] border-[#f59e0b]/30'
          : 'bg-[#f5f8f8] border-[#062327]/10'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        {/* Left: label + deadline badge + citation */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Bell size={13} className={isDone ? 'text-[#15803d]' : 'text-[#558187]'} />
            <span className="text-xs font-bold text-[#062327]">{item.label}</span>
            {item.page_cite && <CitationBadge citation={`Page ${item.page_cite}`} />}
          </div>

          {/* Deadline bubble */}
          {deadline && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <CalendarClock size={12} className="text-[#b45309] flex-shrink-0" />
              <span className="text-[11px] font-semibold text-[#92400e]">
                {deadline.formatted || `${deadline.value} ${deadline.unit} ${deadline.direction || ''} ${deadline.anchor?.replace(/_/g, ' ') || ''}`.trim()}
              </span>
              {item.due_date_hint && (
                <span className="text-[11px] text-[#558187] font-medium">
                  — {item.due_date_hint}
                </span>
              )}
            </div>
          )}

          {/* needs_confirmation: show original policy wording */}
          {item.needs_confirmation && (
            <div className="mt-2 text-[11px] text-[#92400e] bg-[#fffbeb] border border-[#f59e0b]/25 rounded-xl px-3 py-2 leading-relaxed">
              <span className="font-bold block mb-0.5">Confirm — policy wording:</span>
              <span className="italic opacity-90">{item.original_text}</span>
            </div>
          )}
        </div>

        {/* Right: status badge + toggle */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <ReqStatusBadge status={item.status} />
          <button
            onClick={() => onMarkDone(item.item_id, !isDone)}
            disabled={isMarking}
            className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
              isDone
                ? 'bg-white border-[#22c55e]/30 text-[#15803d] hover:bg-[#f0fdf4]'
                : 'bg-white border-[#062327]/15 text-[#062327] hover:border-[#062327]/30 hover:bg-[#f5f8f8]'
            }`}
            title={isDone ? 'Unmark as done' : 'Mark as done'}
          >
            {isMarking ? (
              <Spinner size="xs" />
            ) : isDone ? (
              <>
                <Check size={11} />
                <span>Undo</span>
              </>
            ) : (
              <>
                <Check size={11} />
                <span>Mark done</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Document item card ────────────────────────────────────────────────────────

function DocumentCard({
  item,
  doc,
  uploadingSlot,
  reprocessingDocId,
  onUploadDocument,
  onConfirmDocument,
  onReprocessDocument,
  isSuggestion,
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingDocId, setEditingDocId] = useState(null);
  const [editFields, setEditFields] = useState({});
  const [confirmingLoading, setConfirmingLoading] = useState(false);

  const isUploading = uploadingSlot === item.item_id;
  const isReprocessing = doc && reprocessingDocId === doc.document_id;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) onUploadDocument(item.item_id, file);
  };

  const startEditing = () => {
    setEditingDocId(doc.document_id);
    setEditFields({
      patient_name: doc.extracted_fields?.patient_name || '',
      admission_date: doc.extracted_fields?.admission_date || '',
      discharge_date: doc.extracted_fields?.discharge_date || '',
      diagnosis: doc.extracted_fields?.diagnosis || '',
      total_amount: doc.extracted_fields?.total_amount ? String(doc.extracted_fields.total_amount) : '',
    });
  };

  const handleConfirmSubmit = async () => {
    try {
      setConfirmingLoading(true);
      const payload = {
        patient_name: editFields.patient_name || null,
        admission_date: editFields.admission_date || null,
        discharge_date: editFields.discharge_date || null,
        diagnosis: editFields.diagnosis || null,
        total_amount: editFields.total_amount ? parseFloat(editFields.total_amount) : null,
      };
      await onConfirmDocument(doc.document_id, payload);
      setEditingDocId(null);
    } catch (err) {
      console.error('Confirmation error:', err);
    } finally {
      setConfirmingLoading(false);
    }
  };

  const cardBg =
    item.status === 'validated'
      ? 'bg-[#f0fdf4]/50 border-[#22c55e]/25'
      : item.status === 'needs_confirmation' || item.status === 'flagged'
      ? 'bg-[#fffbeb] border-[#f59e0b]/30'
      : isSuggestion
      ? 'bg-[#f8fafc] border-[#062327]/08 border-dashed'
      : 'bg-[#f5f8f8] border-[#062327]/10';

  return (
    <div className={`p-4 rounded-2xl border transition-all ${cardBg}`}>
      {/* Top row: label + badges + upload button */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <FileText size={13} className="text-[#062327] flex-shrink-0" />
            <span className="text-xs font-bold text-[#062327]">{item.label}</span>
            {item.page_cite && !isSuggestion && (
              <CitationBadge citation={`Page ${item.page_cite}`} />
            )}
            {isSuggestion && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#f0f4ff] text-[#4338ca] border border-[#818cf8]/30">
                Commonly required
              </span>
            )}
          </div>

          {/* Plain-English description */}
          {item.description && (
            <p className="text-[11px] text-[#558187] font-medium mt-0.5 leading-relaxed">
              {item.description}
            </p>
          )}

          {/* needs_confirmation specific reasons */}
          {doc?.needs_confirmation && doc.validation_issues?.length > 0 && (
            <div className="mt-2 text-[11px] text-[#92400e] bg-[#fef3c7]/60 border border-[#f59e0b]/30 rounded-xl px-3 py-2 leading-relaxed">
              <span className="font-bold flex items-center gap-1 mb-0.5 text-[#b45309]">
                <AlertTriangle size={12} />
                Reason: {doc.validation_issues[0]}
              </span>
              {doc.validation_issues.length > 1 && (
                <span className="text-[10px] text-[#92400e]/80">
                  (+{doc.validation_issues.length - 1} more issue{doc.validation_issues.length > 2 ? 's' : ''})
                </span>
              )}
            </div>
          )}

          {/* needs_confirmation: original policy text */}
          {item.needs_confirmation && !doc && !isSuggestion && (
            <div className="mt-2 text-[11px] text-[#92400e] bg-[#fffbeb] border border-[#f59e0b]/25 rounded-xl px-3 py-2 leading-relaxed">
              <span className="font-bold block mb-0.5">Couldn't auto-identify — confirm type:</span>
              <span className="italic opacity-90">{item.original_text}</span>
            </div>
          )}

          {/* Policy wording toggle (for non-suggestion items with original_text) */}
          {!isSuggestion && item.original_text && !item.needs_confirmation && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 mt-1.5 text-[11px] text-[#558187] hover:text-[#062327] font-medium transition-colors"
            >
              {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              <span>{expanded ? 'Hide policy wording' : 'Show policy wording'}</span>
            </button>
          )}

          {expanded && item.original_text && (
            <p className="mt-1.5 text-[11px] text-[#558187] italic leading-relaxed px-2 border-l-2 border-[#062327]/10">
              {item.original_text}
            </p>
          )}
        </div>

        {/* Status + Upload + Reprocess */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap flex-shrink-0">
          <DocStatusBadge status={item.status} />

          {doc && onReprocessDocument && (
            <button
              type="button"
              disabled={isReprocessing || isUploading}
              onClick={() => onReprocessDocument(doc.document_id)}
              className="text-xs font-bold px-3 py-1.5 rounded-full border border-[#062327]/15 hover:border-[#062327]/30 bg-white hover:bg-[#f5f8f8] text-[#558187] hover:text-[#062327] flex items-center gap-1.5 transition-all shadow-2xs disabled:opacity-50 cursor-pointer"
              title="Re-run OCR and extraction pipeline"
            >
              {isReprocessing ? <Spinner size="xs" /> : <Clock size={12} />}
              <span>{isReprocessing ? 'Reprocessing…' : 'Re-run'}</span>
            </button>
          )}

          <label className="cursor-pointer text-xs font-bold px-3.5 py-1.5 rounded-full border border-[#062327]/15 hover:border-[#062327]/30 bg-white hover:bg-[#f5f8f8] text-[#062327] flex items-center gap-1.5 transition-all shadow-sm">
            {isUploading ? (
              <>
                <Spinner size="xs" />
                <span>Scanning…</span>
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
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          {doc && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="p-1.5 rounded-full hover:bg-black/5 text-[#558187] hover:text-[#062327] transition-colors"
              title={expanded ? 'Collapse extracted data' : 'View extracted data'}
            >
              {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          )}
        </div>
      </div>

      {/* Uploaded document details (expanded) */}
      {doc && expanded && (
        <div className="mt-3 pt-3 border-t border-[#062327]/08 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs text-[#558187]">
            <div className="flex items-center gap-2 truncate">
              <FileText size={15} className="text-[#062327] flex-shrink-0" />
              <span className="font-mono text-[#062327] font-semibold truncate">{doc.filename}</span>
            </div>
            {doc.needs_confirmation && !editingDocId && (
              <button
                onClick={startEditing}
                className="text-[11px] text-[#b45309] hover:text-[#92400e] underline font-bold"
              >
                Edit / Confirm Values
              </button>
            )}
          </div>

          {/* Extracted fields grid */}
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
                {doc.extracted_fields?.total_amount
                  ? `₹${Number(doc.extracted_fields.total_amount).toLocaleString('en-IN')}`
                  : '—'}
              </span>
            </div>
          </div>

          {/* Validation issues */}
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

          {/* Confirmation editor */}
          {editingDocId === doc.document_id && (
            <div className="p-5 rounded-2xl bg-[#ffffff] border-2 border-[#062327]/20 shadow-md flex flex-col gap-4">
              <div className="text-xs font-bold text-[#062327]">Verify & Confirm Extracted Fields</div>
              <p className="text-[11px] text-[#558187] font-medium">
                Correct any OCR recognition errors below. Confirming will mark this document validated.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[#062327] font-bold block mb-1">Patient Name</label>
                  <input
                    type="text"
                    value={editFields.patient_name}
                    onChange={(e) => setEditFields({ ...editFields, patient_name: e.target.value })}
                    className="w-full bg-[#f5f8f8] border border-[#062327]/15 rounded-xl px-3 py-2 text-[#062327] font-medium"
                  />
                </div>
                <div>
                  <label className="text-[#062327] font-bold block mb-1">Total Billed Amount (₹)</label>
                  <input
                    type="number"
                    value={editFields.total_amount}
                    onChange={(e) => setEditFields({ ...editFields, total_amount: e.target.value })}
                    className="w-full bg-[#f5f8f8] border border-[#062327]/15 rounded-xl px-3 py-2 text-[#062327] font-medium"
                  />
                </div>
                <div>
                  <label className="text-[#062327] font-bold block mb-1">Admission Date</label>
                  <input
                    type="date"
                    value={editFields.admission_date}
                    onChange={(e) => setEditFields({ ...editFields, admission_date: e.target.value })}
                    className="w-full bg-[#f5f8f8] border border-[#062327]/15 rounded-xl px-3 py-2 text-[#062327] font-medium"
                  />
                </div>
                <div>
                  <label className="text-[#062327] font-bold block mb-1">Diagnosis</label>
                  <input
                    type="text"
                    value={editFields.diagnosis}
                    onChange={(e) => setEditFields({ ...editFields, diagnosis: e.target.value })}
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
                  onClick={handleConfirmSubmit}
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
}

// ─── Main export ───────────────────────────────────────────────────────────────

export default function DocumentChecklistSection({
  checklist = [],
  documents = [],
  readiness = null,
  onUploadDocument,
  onConfirmDocument,
  onReprocessDocument,
  onMarkRequirementDone,
  uploadingSlot,
  reprocessingDocId,
  markingRequirementId,
}) {
  // Split by kind
  const requirements = checklist.filter((it) => it.kind === 'requirement');
  const docItems = checklist.filter((it) => it.kind !== 'requirement');

  // Separate standard suggestions
  const policyDocs = docItems.filter((it) => it.source !== 'standard_suggestion');
  const suggestionDocs = docItems.filter((it) => it.source === 'standard_suggestion');

  // Group by stage
  const groupByStage = (items) =>
    STAGE_ORDER.reduce((acc, st) => {
      const g = items.filter((it) => it.stage === st);
      if (g.length > 0) acc[st] = g;
      return acc;
    }, {});

  const reqByStage = groupByStage(requirements);
  const docByStage = groupByStage(policyDocs);
  const stagesWithContent = STAGE_ORDER.filter(
    (s) => reqByStage[s]?.length > 0 || docByStage[s]?.length > 0
  );

  const hasRequirements = requirements.length > 0;
  const hasDocs = docItems.length > 0;

  return (
    <div className="bg-white border border-[#062327]/10 rounded-3xl p-6 shadow-sm flex flex-col gap-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <FileCheck size={18} className="text-[#062327]" />
          <h3 className="font-headline text-base font-bold text-[#062327] tracking-tight">
            Claim Documents & Actions
          </h3>
        </div>
        <p className="text-xs text-[#558187] mt-1 font-medium">
          Gather these documents, then upload each one in its slot. Actions below are reminders; mark them done as you complete them.
        </p>
      </div>

      {/* Readiness counts */}
      {readiness && (
        <div className="flex flex-wrap gap-3 p-4 rounded-2xl bg-[#f5f8f8] border border-[#062327]/08">
          {readiness.total_documents > 0 && (
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${readiness.missing_documents === 0 ? 'bg-[#22c55e]' : 'bg-[#f59e0b]'}`} />
              <span className="text-xs font-bold text-[#062327]">
                Documents: {readiness.validated_documents} of {readiness.total_documents} uploaded and validated
                {readiness.missing_documents > 0 && `, ${readiness.missing_documents} missing`}
              </span>
            </div>
          )}
          {readiness.total_requirements > 0 && (
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${readiness.pending_requirements === 0 ? 'bg-[#22c55e]' : 'bg-[#558187]'}`} />
              <span className="text-xs font-bold text-[#062327]">
                Actions: {readiness.done_requirements} of {readiness.total_requirements} marked done
              </span>
            </div>
          )}
          {!readiness.total_documents && !readiness.total_requirements && (
            <span className="text-xs text-[#558187] font-medium">Checklist not yet initialized</span>
          )}
        </div>
      )}

      {checklist.length === 0 && (
        <div className="p-6 rounded-2xl bg-[#f5f8f8] border border-[#062327]/08 text-center text-xs text-[#558187] font-medium">
          No checklist items yet. Save treatment details first.
        </div>
      )}

      {/* ── Stage-grouped sections ── */}
      {stagesWithContent.map((stage) => {
        const stageReqs = reqByStage[stage] || [];
        const stageDocs = docByStage[stage] || [];
        const actionCount = stageReqs.length;
        const docCount = stageDocs.length;

        return (
          <div key={stage} className="flex flex-col gap-4">
            {/* Stage heading */}
            <div className="flex items-center gap-2 border-b border-[#062327]/08 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#558187]">
                {STAGE_LABELS[stage]}
              </span>
              <span className="text-[10px] text-[#558187] font-medium">
                ({actionCount > 0 ? `${actionCount} action${actionCount > 1 ? 's' : ''}` : ''}
                {actionCount > 0 && docCount > 0 ? ', ' : ''}
                {docCount > 0 ? `${docCount} document${docCount > 1 ? 's' : ''}` : ''})
              </span>
            </div>

            {/* Actions & Deadlines sub-section */}
            {stageReqs.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#558187]">
                  <Bell size={11} />
                  <span>Actions &amp; Deadlines</span>
                </div>
                <div className="flex flex-col gap-2">
                  {stageReqs.map((item) => (
                    <RequirementCard
                      key={item.item_id}
                      item={item}
                      onMarkDone={onMarkRequirementDone}
                      markingId={markingRequirementId}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Documents to upload sub-section */}
            {stageDocs.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#558187]">
                  <FileText size={11} />
                  <span>Documents to upload</span>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {stageDocs.map((item) => {
                    const doc = documents.find(
                      (d) => d.item_id === item.item_id || d.document_id === item.document_id
                    );
                    return (
                      <DocumentCard
                        key={item.item_id}
                        item={item}
                        doc={doc}
                        uploadingSlot={uploadingSlot}
                        reprocessingDocId={reprocessingDocId}
                        onUploadDocument={onUploadDocument}
                        onConfirmDocument={onConfirmDocument}
                        onReprocessDocument={onReprocessDocument}
                        isSuggestion={false}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Standard suggestions (not found in policy) ── */}
      {suggestionDocs.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 border-t border-[#062327]/08 pt-4">
            <Info size={13} className="text-[#4338ca]" />
            <span className="text-xs font-bold text-[#4338ca]">
              Commonly required — not found in your policy
            </span>
          </div>
          <p className="text-[11px] text-[#558187] font-medium">
            These items are standard IRDAI claim documents not explicitly listed in your policy text. They are non-blocking reminders only.
          </p>
          <div className="grid grid-cols-1 gap-3">
            {suggestionDocs.map((item) => {
              const doc = documents.find(
                (d) => d.item_id === item.item_id || d.document_id === item.document_id
              );
              return (
                <DocumentCard
                  key={item.item_id}
                  item={item}
                  doc={doc}
                  uploadingSlot={uploadingSlot}
                  reprocessingDocId={reprocessingDocId}
                  onUploadDocument={onUploadDocument}
                  onConfirmDocument={onConfirmDocument}
                  onReprocessDocument={onReprocessDocument}
                  isSuggestion
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
