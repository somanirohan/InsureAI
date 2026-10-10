import React from 'react';
import { BookOpen, Scale, FileText } from 'lucide-react';

export default function CitationBadge({ citation, type = 'policy', className = '' }) {
  if (!citation) return null;

  const isIrdai = type === 'irdai' || String(citation).toLowerCase().includes('irdai');
  const isDoc = type === 'doc' || String(citation).toLowerCase().includes('document') || String(citation).toLowerCase().includes('bill');

  let Icon = BookOpen;
  let colorCls = 'text-amber-400/90 border-amber-500/20 bg-amber-500/10';

  if (isIrdai) {
    Icon = Scale;
    colorCls = 'text-blue-400/90 border-blue-500/20 bg-blue-500/10';
  } else if (isDoc) {
    Icon = FileText;
    colorCls = 'text-emerald-400/90 border-emerald-500/20 bg-emerald-500/10';
  }

  const label = typeof citation === 'string'
    ? citation
    : citation.page_number
    ? `Page ${citation.page_number} ${citation.section_heading ? `· ${citation.section_heading}` : ''}`
    : JSON.stringify(citation);

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${colorCls} ${className}`}
      title={`Verified Citation: ${label}`}
    >
      <Icon size={11} className="flex-shrink-0" />
      <span className="truncate max-w-[280px]">{label}</span>
    </span>
  );
}
