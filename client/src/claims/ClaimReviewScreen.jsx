import React from 'react';
import {
  FileCheck2,
  AlertOctagon,
  CheckCircle2,
  Shield,
  Send,
  Building,
  User,
  Activity,
  Receipt,
  AlertTriangle,
} from 'lucide-react';
import QualitativeReadinessCard from './QualitativeReadinessCard';
import SettlementReceiptCard from './SettlementReceiptCard';
import CitationBadge from './CitationBadge';
import { Spinner } from '../components/common/ui';

export default function ClaimReviewScreen({
  reviewData,
  onSubmitClaim,
  submittingLoading,
}) {
  if (!reviewData) return null;

  const {
    claim,
    policy,
    readiness,
    settlement_estimate,
    can_submit = false,
    submission_blockers = [],
  } = reviewData;

  const treatment = claim?.treatment;
  const checklist = claim?.checklist || [];

  return (
    <div className="flex flex-col gap-6">
      {/* Header Banner */}
      <div className="bg-white border border-[#062327]/10 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] uppercase tracking-wider font-extrabold text-[#062327] px-2.5 py-0.5 rounded-full bg-[#d2f57b]/30 border border-[#062327]/15 inline-block mb-1">
            Final Submission Review Screen
          </span>
          <h2 className="font-headline text-xl sm:text-2xl font-bold text-[#062327] mt-1">
            Claim Dossier: {treatment?.name || 'Medical Claim'}
          </h2>
          <div className="flex items-center gap-3 mt-2 text-xs text-[#558187] flex-wrap font-medium">
            <span className="flex items-center gap-1">
              <Building size={14} className="text-[#062327]" />
              {policy?.insurer_name || 'Insurance Provider'}
            </span>
            <span>·</span>
            <span className="font-mono text-[#062327] font-semibold">
              {policy?.policy_number || 'Policy'}
            </span>
            <span>·</span>
            <span>Hospital: {treatment?.hospital || '—'}</span>
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <span className="text-[11px] text-[#558187] uppercase tracking-wider block font-bold">
            Approved Estimate
          </span>
          <span className="text-2xl font-black font-mono text-[#15803d]">
            ₹{(settlement_estimate?.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Notice: In-app review screen only */}
      <div className="p-4 rounded-2xl bg-[#f5f8f8] border border-[#062327]/10 flex items-center justify-between text-xs text-[#558187] font-medium">
        <span className="text-[#062327] font-bold">In-App Submission Package Review</span>
        <span className="text-[11px] italic">
          Verified against policy terms and uploaded documentation.
        </span>
      </div>

      {/* Qualitative Readiness Summary */}
      <QualitativeReadinessCard readiness={readiness} />

      {/* Treatment & Hospitalization Summary */}
      {treatment && (
        <div className="bg-white border border-[#062327]/10 rounded-3xl p-6 shadow-sm flex flex-col gap-4">
          <h3 className="font-headline text-sm font-bold uppercase tracking-wider text-[#062327]">
            Hospitalization Overview
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-[#f5f8f8] p-4 rounded-2xl border border-[#062327]/08">
            <div>
              <span className="text-[#558187] block font-medium">Procedure</span>
              <span className="text-[#062327] font-bold">{treatment.name}</span>
            </div>
            <div>
              <span className="text-[#558187] block font-medium">Hospital</span>
              <span className="text-[#062327] font-bold">{treatment.hospital}</span>
            </div>
            <div>
              <span className="text-[#558187] block font-medium">Dates</span>
              <span className="text-[#062327] font-bold">
                {treatment.admission_date} {treatment.discharge_date ? `to ${treatment.discharge_date}` : ''}
              </span>
            </div>
            <div>
              <span className="text-[#558187] block font-medium">Room Type</span>
              <span className="text-[#062327] font-bold">{treatment.room_type}</span>
            </div>
          </div>
        </div>
      )}

      {/* Settlement Math Breakdown */}
      {settlement_estimate && (
        <SettlementReceiptCard settlementEstimate={settlement_estimate} />
      )}

      {/* Itemised Bill Line Items Breakdown */}
      {(() => {
        const billDoc = claim?.documents?.find(
          (d) =>
            ['final_hospital_bill', 'hospital_bill', 'itemised_bill', 'bill'].includes(d.item_id) &&
            d.line_items &&
            d.line_items.length > 0
        );
        if (!billDoc) return null;
        return (
          <div className="bg-white border border-[#062327]/10 rounded-3xl p-6 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-headline text-sm font-bold uppercase tracking-wider text-[#062327]">
                  Itemised Bill Line Items
                </h3>
                <p className="text-xs text-[#558187] font-medium mt-0.5">
                  Extracted from verified hospital bill ({billDoc.filename || 'Bill'})
                </p>
              </div>
              <span className="font-mono text-sm font-bold text-[#15803d]">
                ₹{billDoc.line_items.reduce((acc, li) => acc + (Number(li.amount) || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="border border-[#062327]/10 rounded-2xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#f5f8f8] text-[#558187] font-semibold border-b border-[#062327]/10">
                  <tr>
                    <th className="py-2 px-3">Description</th>
                    <th className="py-2 px-3 text-center w-20">Quantity</th>
                    <th className="py-2 px-3 text-right w-32">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#062327]/05">
                  {billDoc.line_items.map((li, idx) => (
                    <tr key={idx} className="hover:bg-[#f5f8f8]/50">
                      <td className="py-2 px-3 font-medium text-[#062327]">{li.description}</td>
                      <td className="py-2 px-3 text-center text-[#558187]">{li.quantity != null ? li.quantity : '—'}</td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-[#062327]">
                        {Number(li.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Submission Gate Alert / Submission Action */}
      <div className="bg-white border border-[#062327]/10 rounded-3xl p-6 shadow-sm flex flex-col gap-4">
        {!can_submit ? (
          <div className="p-5 rounded-2xl bg-[#fef2f2] border border-[#ef4444]/30 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[#991b1b] font-bold text-xs sm:text-sm">
              <AlertOctagon size={18} />
              <span>Claim Submission Is Currently Blocked</span>
            </div>
            <p className="text-xs text-[#991b1b]/90 leading-relaxed font-medium">
              To prevent claim rejection by your insurer, all cited requirements and blocking eligibility criteria must be satisfied before submission:
            </p>
            <ul className="list-disc list-inside text-xs text-[#991b1b] space-y-1 mt-1 font-semibold">
              {submission_blockers.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="p-5 rounded-2xl bg-[#f0fdf4] border border-[#22c55e]/25 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={22} className="text-[#15803d]" />
              <div>
                <span className="text-sm font-bold text-[#15803d] block">
                  All Policy Requirements Satisfied
                </span>
                <span className="text-xs text-[#166534] font-medium">
                  Zero blocking flags and all required documents are validated.
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-2">
          <span className="text-xs text-[#558187] font-medium">
            {can_submit
              ? 'Ready to proceed to official claim filing'
              : 'Complete remaining items above to enable submission'}
          </span>

          <button
            onClick={onSubmitClaim}
            disabled={!can_submit || submittingLoading}
            className="btn-pill-lime py-3 px-8 text-sm font-bold shadow-md cursor-pointer flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed self-end sm:self-auto"
          >
            {submittingLoading ? (
              <>
                <Spinner size="xs" />
                <span>Submitting Claim...</span>
              </>
            ) : (
              <>
                <Send size={15} />
                <span>Submit Claim</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
