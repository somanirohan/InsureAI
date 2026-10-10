import React from 'react';
import { BookOpen, Scale, FileText } from 'lucide-react';

export default function CitationBadge({ citation, type = 'policy', className = '' }) {
  if (!citation) return null;

  const isIrdai = type === 'irdai' || String(citation).toLowerCase().includes('irdai');
  const isDoc = type === 'doc' || String(citation).toLowerCase().includes('document') || String(citation).toLowerCase().includes('bill');

  let Icon = BookOpen;
  let colorCls = 'text-[#062327] border-[#062327]/15 bg-[#edf3f3]';

  if (isIrdai) {
    Icon = Scale;
    colorCls = 'text-[#1e40af] border-[#3b82f6]/20 bg-[#eff6ff]';
  } else if (isDoc) {
    Icon = FileText;
    colorCls = 'text-[#15803d] border-[#22c55e]/20 bg-[#f0fdf4]';
  }

  const label = typeof citation === 'string'
    ? citation
    : citation.page_number
    ? `Page ${citation.page_number} ${citation.section_heading ? `· ${citation.section_heading}` : ''}`
    : JSON.stringify(citation);

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${colorCls} ${className}`}
      title={`Verified Citation: ${label}`}
    >
      <Icon size={11} className="flex-shrink-0" />
      <span className="truncate max-w-[260px]">{label}</span>
    </span>
  );
}
