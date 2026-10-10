import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Send,
  Bot,
  User,
  Plus,
  BookOpen,
  ShieldCheck,
  ChevronDown,
  MessageSquare,
  Wifi,
  WifiOff,
  Search,
  Edit2,
  Trash2,
  Check,
  X,
  History,
  Sparkles,
  ChevronUp,
  Clock,
  AlertTriangle,
  Info,
  CheckSquare,
  Square,
} from 'lucide-react';
import api from '../../services/api';
import { Toggle, Select, Spinner, EmptyState, ErrorBanner } from '../common/ui';
import { useWebRTCVoice } from '../../hooks/useWebRTCVoice';
import { VoiceInputButton, VoiceInputBanner } from './VoiceInput';




const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:5001/api/chat/ws';

const SAMPLE_QUESTIONS = [
  "What's my room-rent limit per day?",
  "Is there any co-payment for Tier 1 hospitals?",
  "What is the waiting period for pre-existing diseases?",
  "What are the major exclusions under this policy?",
];

// ─── Date grouping helper ──────────────────────────────────────────────────
function groupConversations(list, search) {
  const q = (search || '').trim().toLowerCase();
  const filtered = q
    ? list.filter(c =>
        (c.title || '').toLowerCase().includes(q) ||
        (c.last_message || '').toLowerCase().includes(q) ||
        (c.policy_name || '').toLowerCase().includes(q)
      )
    : list;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOfLast7Days = startOfToday - 6 * 86400000;

  const groups = [
    { title: 'Today', items: [] },
    { title: 'Yesterday', items: [] },
    { title: 'Previous 7 Days', items: [] },
    { title: 'Older', items: [] },
  ];

  filtered.forEach(c => {
    const rawDate = c.updated_at || c.created_at;
    const time = rawDate ? new Date(rawDate).getTime() : 0;
    if (time >= startOfToday) {
      groups[0].items.push(c);
    } else if (time >= startOfYesterday) {
      groups[1].items.push(c);
    } else if (time >= startOfLast7Days) {
      groups[2].items.push(c);
    } else {
      groups[3].items.push(c);
    }
  });

  return groups.filter(g => g.items.length > 0);
}

// ─── Single Conversation Sidebar Item ──────────────────────────────────────
function ConversationItem({
  conv,
  isActive,
  onSelect,
  isEditing,
  editTitle,
  setEditTitle,
  onStartRename,
  onSaveRename,
  onCancelRename,
  isConfirmingDelete,
  onStartDelete,
  onConfirmDelete,
  onCancelDelete,
}) {
  const editInputRef = useRef(null);

  useEffect(() => {
    if (isEditing) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#f5f8f8] border border-[#062327]/20 animate-fade-in my-0.5">
        <input
          ref={editInputRef}
          type="text"
          value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onSaveRename(conv._id);
            if (e.key === 'Escape') onCancelRename();
          }}
          className="bg-transparent text-xs text-[#062327] flex-1 min-w-0 outline-none px-1 font-medium"
        />
        <button
          onClick={() => onSaveRename(conv._id)}
          className="p-1 hover:text-[#062327] text-[#558187] transition-colors"
          title="Save title"
        >
          <Check size={12} />
        </button>
        <button
          onClick={onCancelRename}
          className="p-1 hover:text-[#062327] text-[#558187] transition-colors"
          title="Cancel"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  if (isConfirmingDelete) {
    return (
      <div className="flex items-center justify-between px-2.5 py-2 rounded-xl bg-rose-50 border border-rose-200 animate-fade-in my-0.5 text-2xs">
        <span className="text-rose-700 font-medium truncate">Delete this chat?</span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => onConfirmDelete(conv._id)}
            className="px-2 py-0.5 rounded bg-rose-600 text-white font-medium hover:bg-rose-700 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={onCancelDelete}
            className="px-2 py-0.5 rounded bg-white text-[#558187] hover:text-[#062327] border border-[#062327]/10 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => onSelect(conv._id)}
      className={`
        group relative flex items-center justify-between gap-2 px-3.5 py-3 rounded-2xl text-xs cursor-pointer transition-all duration-150 my-1
        ${isActive
          ? 'bg-[#d2f57b]/25 text-[#062327] font-bold border-2 border-[#062327] shadow-sm'
          : 'text-[#558187] hover:text-[#062327] hover:bg-[#f5f8f8] border border-transparent'
        }
      `}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <MessageSquare
          size={14}
          className={`flex-shrink-0 transition-colors ${
            isActive ? 'text-[#062327] stroke-[2.2]' : 'text-[#558187] group-hover:text-[#062327]'
          }`}
        />
        <div className="min-w-0 flex-1">
          <span className="block truncate leading-tight">
            {conv.title || 'Untitled session'}
          </span>
          {conv.policy_name && (
            <span className="block truncate text-[10px] text-[#558187] font-normal leading-tight mt-0.5">
              {conv.policy_name}
            </span>
          )}
        </div>
      </div>

      {/* Action buttons (revealed on hover or active) */}
      <div className="hidden group-hover:flex items-center gap-1 flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => onStartRename(e, conv)}
          className="p-1.5 rounded-lg hover:bg-[#062327]/10 text-[#558187] hover:text-[#062327] transition-colors cursor-pointer"
          title="Rename conversation"
        >
          <Edit2 size={12} />
        </button>
        <button
          onClick={(e) => onStartDelete(e, conv)}
          className="p-1.5 rounded-lg hover:bg-rose-50 text-[#558187] hover:text-rose-600 transition-colors cursor-pointer"
          title="Delete conversation"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── Sidebar Content (shared between Desktop & Mobile) ────────────────────
function ChatSidebarContent({
  onNewChat,
  policyOptions,
  selectedPolicyId,
  setSelectedPolicyId,
  searchQuery,
  setSearchQuery,
  groupedConversations,
  currentConversationId,
  onSelectConversation,
  editingId,
  editTitle,
  setEditTitle,
  onStartRename,
  onSaveRename,
  onCancelRename,
  confirmDeleteId,
  onStartDelete,
  onConfirmDelete,
  onCancelDelete,
  plainLanguageMode,
  setPlainLanguageMode,
  wsConnected,
}) {
  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* New conversation button */}
      <div className="p-3.5 border-b border-[#062327]/08">
        <button
          onClick={onNewChat}
          className="btn-pill-lime w-full gap-2 text-xs font-bold justify-center py-3 flex items-center cursor-pointer shadow-md"
        >
          <Plus size={16} className="stroke-[2.5]" />
          <span>New consultation</span>
        </button>
      </div>

      {/* Policy scope selector */}
      <div className="p-3.5 border-b border-[#062327]/08">
        <Select
          label="Policy Scope"
          value={selectedPolicyId}
          onChange={setSelectedPolicyId}
          options={policyOptions}
        />
      </div>

      {/* Search filter */}
      <div className="px-3.5 pt-3 pb-1">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#558187]" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search past consultations…"
            className="w-full pl-8 pr-7 py-2 text-xs rounded-xl bg-[#f5f8f8] border border-[#062327]/12 text-[#062327] placeholder-[#558187] focus:outline-none focus:border-[#062327] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#558187] hover:text-[#062327]"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2.5 py-1.5 scroll-area">
        {groupedConversations.length === 0 ? (
          <div className="text-center py-10 px-4">
            <MessageSquare size={22} className="text-[#558187] mx-auto mb-2 opacity-50" />
            <p className="text-xs text-[#558187]">
              {searchQuery ? 'No chats found matching search' : 'No previous consultations'}
            </p>
          </div>
        ) : (
          groupedConversations.map(group => (
            <div key={group.title} className="mb-3">
              <p className="text-[10px] font-bold text-[#558187] uppercase tracking-wider px-3 py-1">
                {group.title}
              </p>
              <div className="space-y-1">
                {group.items.map(c => (
                  <ConversationItem
                    key={c._id}
                    conv={c}
                    isActive={currentConversationId === c._id}
                    onSelect={onSelectConversation}
                    isEditing={editingId === c._id}
                    editTitle={editTitle}
                    setEditTitle={setEditTitle}
                    onStartRename={onStartRename}
                    onSaveRename={onSaveRename}
                    onCancelRename={onCancelRename}
                    isConfirmingDelete={confirmDeleteId === c._id}
                    onStartDelete={onStartDelete}
                    onConfirmDelete={onConfirmDelete}
                    onCancelDelete={onCancelDelete}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Plain language toggle */}
      <div className="p-3.5 border-t border-[#062327]/08 bg-[#f9fbfb]">
        <Toggle
          checked={plainLanguageMode}
          onChange={setPlainLanguageMode}
          label="Plain language"
          description="Simplify insurance jargon"
        />
      </div>

      {/* Streaming connection status */}
      <div className={`px-4 py-2.5 flex items-center justify-between border-t border-[#062327]/08 text-[11px] font-semibold ${wsConnected ? 'text-emerald-600' : 'text-[#558187]'}`}>
        <div className="flex items-center gap-1.5">
          {wsConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
          <span>{wsConnected ? 'Streaming active' : 'REST API mode'}</span>
        </div>
        <span className="text-[#558187] font-mono text-[10px]">v1.2</span>
      </div>
    </div>
  );
}

// ─── Claim Readiness Checklist Component ──────────────────────────────────
function ChecklistCard({ checklist, generalAdvice, headsUp }) {
  const [checkedItems, setCheckedItems] = useState({});
  const [collapsedStages, setCollapsedStages] = useState({});

  const toggleCheck = (id) => {
    setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleStage = (stageKey) => {
    setCollapsedStages(prev => ({ ...prev, [stageKey]: !prev[stageKey] }));
  };

  if (!checklist || checklist.length === 0) {
    return null;
  }

  return (
    <div className="w-full flex flex-col gap-2.5 my-2 text-xs">
      {/* Heads-up coverage alert (scenario-aware) */}
      {headsUp && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200">
          <div className="flex items-center gap-1.5 font-semibold text-amber-400 mb-1">
            <AlertTriangle size={13} />
            <span>Coverage Check Notice</span>
          </div>
          <div className="whitespace-pre-line text-xs opacity-90">{headsUp}</div>
        </div>
      )}

      {/* Stage groups */}
      <div className="flex flex-col gap-2">
        {checklist.map((group) => {
          if (!group.items || group.items.length === 0) return null;
          const isCollapsed = !!collapsedStages[group.stage];

          return (
            <div
              key={group.stage}
              className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden transition-all"
            >
              {/* Header */}
              <button
                type="button"
                onClick={() => toggleStage(group.stage)}
                className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-white/[0.04] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-zinc-100 text-xs tracking-tight">
                    {group.label}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-zinc-400 font-mono">
                    {group.items.length}
                  </span>
                </div>
                {isCollapsed ? (
                  <ChevronDown size={14} className="text-zinc-500" />
                ) : (
                  <ChevronUp size={14} className="text-zinc-500" />
                )}
              </button>

              {/* Items */}
              {!isCollapsed && (
                <div className="px-3.5 pb-3 pt-1 flex flex-col gap-2 border-t border-white/[0.04]">
                  {group.items.map((item, idx) => {
                    const itemId = `${group.stage}-${idx}`;
                    const isChecked = !!checkedItems[itemId];

                    return (
                      <div
                        key={itemId}
                        className="flex items-start gap-2.5 py-1 px-1 rounded-lg hover:bg-white/[0.02] transition-colors"
                      >
                        {/* Interactive demo checkbox */}
                        <button
                          type="button"
                          onClick={() => toggleCheck(itemId)}
                          className="mt-0.5 text-zinc-400 hover:text-brand-400 transition-colors flex-shrink-0"
                          title="Mark requirement complete (session demo)"
                        >
                          {isChecked ? (
                            <CheckSquare size={14} className="text-brand-400" />
                          ) : (
                            <Square size={14} className="text-zinc-500" />
                          )}
                        </button>

                        <div className="flex-1 flex flex-col gap-1 min-w-0">
                          {/* Condition text */}
                          <span
                            className={`leading-relaxed text-xs transition-opacity ${
                              isChecked ? 'line-through opacity-50 text-zinc-400' : 'text-zinc-200'
                            }`}
                          >
                            {item.condition}
                          </span>

                          {/* Badges row: deadline badge, citation chip, verify status */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            {/* Deadline badge inline */}
                            {item.deadline && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25">
                                <Clock size={9} />
                                {item.deadline}
                              </span>
                            )}

                            {/* Citation chip (same component styling as chat) */}
                            <span className="inline-flex items-center text-[10px] text-zinc-400 bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-full">
                              <BookOpen size={9} className="inline mr-1 text-zinc-500" />
                              p.{item.page_number || item.page || '?'}
                            </span>

                            {/* Insurer confirmation badge if not verified */}
                            {!item.verified && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                                Confirm with insurer
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Visually distinct General advice block (not from policy) */}
      {generalAdvice && generalAdvice.length > 0 && (
        <div className="p-3.5 rounded-xl bg-blue-950/20 border border-blue-500/20 text-blue-200/90 mt-1">
          <div className="flex items-center gap-1.5 text-blue-400 font-medium text-xs mb-1.5">
            <Info size={13} />
            <span>General advice — not from your policy</span>
          </div>
          <ul className="space-y-1 pl-4 list-disc text-[11px] text-zinc-300">
            {generalAdvice.map((tip, idx) => (
              <li key={idx} className="leading-relaxed">
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Lightweight Markdown Message Renderer ────────────────────────────────
function renderFormattedText(text) {
  if (!text) return null;

  // Split lines to properly format paragraphs, numbered lists, bullet lists
  const lines = text.split('\n');
  const elements = [];
  let currentList = null;

  const renderInlineFormatted = (str) => {
    // Matches **bold**, `code`, and [Page X] or [Page X, Y]
    const parts = str.split(/(\*\*[^*]+\*\*|`[^`]+`|\[Page\s+[^\]]+\])/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        return (
          <strong key={idx} className="font-bold text-[#062327]">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
        return (
          <code key={idx} className="bg-[#062327]/08 px-1.5 py-0.5 rounded text-xs font-mono text-[#062327]">
            {part.slice(1, -1)}
          </code>
        );
      }
      if (/^\[Page\s+[^\]]+\]$/.test(part)) {
        return (
          <span key={idx} className="inline-block bg-[#062327]/08 text-[#2d6a71] text-xs font-semibold px-1.5 py-0.2 rounded-md mx-0.5 border border-[#062327]/10">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const flushList = () => {
    if (currentList) {
      if (currentList.type === 'ol') {
        elements.push(
          <ol key={`list-${elements.length}`} className="my-2 space-y-1.5 pl-5 list-decimal text-sm">
            {currentList.items.map((it, i) => (
              <li key={i} className="leading-relaxed">
                {renderInlineFormatted(it)}
              </li>
            ))}
          </ol>
        );
      } else {
        elements.push(
          <ul key={`list-${elements.length}`} className="my-2 space-y-1.5 pl-5 list-disc text-sm">
            {currentList.items.map((it, i) => (
              <li key={i} className="leading-relaxed">
                {renderInlineFormatted(it)}
              </li>
            ))}
          </ul>
        );
      }
      currentList = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    // Numbered list: e.g. "1. **Hospitalization:** ..." or "1. Text"
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      if (!currentList || currentList.type !== 'ol') {
        flushList();
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(numMatch[2]);
      continue;
    }

    // Bullet list: e.g. "- Item" or "* Item"
    const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      if (!currentList || currentList.type !== 'ul') {
        flushList();
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(bulletMatch[1]);
      continue;
    }

    // Normal paragraph
    flushList();
    elements.push(
      <p key={`p-${elements.length}`} className="mb-2.5 last:mb-0 leading-relaxed">
        {renderInlineFormatted(rawLine)}
      </p>
    );
  }

  flushList();
  return <div className="space-y-1">{elements}</div>;
}

// ─── Message bubble ────────────────────────────────────────────────────────
function MessageBubble({ msg, plainLanguageMode }) {
  const isUser = msg.role === 'user';
  const content = plainLanguageMode && msg.plain_language ? msg.plain_language : msg.content;

  return (
    <div
      className={`flex items-start gap-3.5 animate-fade-in ${isUser ? 'flex-row-reverse' : ''}`}
    >
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-2xl flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm ${
          isUser
            ? 'bg-[#f5f8f8] border border-[#062327]/15 text-[#062327]'
            : 'bg-[#d2f57b] text-[#062327] border-2 border-[#062327] font-bold'
        }`}
      >
        {isUser
          ? <User size={15} className="stroke-[2.2]" />
          : <Bot size={16} className="stroke-[2.5]" />
        }
      </div>

      {/* Bubble */}
      <div className={`max-w-2xl min-w-0 ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1.5`}>
        {/* Meta row (assistant only) */}
        {!isUser && (msg.query_type || msg.confidence_level || msg.verification_passed) && (
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            {msg.query_type && (
              <span className="text-[10px] font-bold text-[#2d6a71] bg-[#f0fbfb] border border-[#062327]/10 px-2.5 py-0.5 rounded-full">
                {msg.query_type === 'structured' ? 'Structured Lookup' : 'Semantic Search'}
              </span>
            )}
            {msg.confidence_level && (
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                msg.confidence_level === 'high'   ? 'status-ready' :
                msg.confidence_level === 'medium' ? 'status-pending' :
                'status-error'
              }`}>
                {msg.confidence_level} confidence
              </span>
            )}
            {msg.verification_passed && (
              <span className="text-[11px] font-bold flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                <ShieldCheck size={12} className="stroke-[2.5]" />
                Zero Hallucinations Verified
              </span>
            )}
          </div>
        )}

        {/* Content */}
        <div
          className={`px-5 py-4 rounded-3xl text-sm leading-relaxed shadow-sm ${
            isUser
              ? 'bg-[#062327] border border-[#062327] text-white rounded-tr-sm'
              : 'bg-[#f8fbfb] border border-[#062327]/10 text-[#062327] rounded-tl-sm'
          }`}
        >
          {msg.streaming ? (
            <div>
              {renderFormattedText(content)}
              <span className="inline-block w-1.5 h-4 bg-[#062327] ml-1 align-middle animate-pulse-dot" />
            </div>
          ) : (
            <>
              {msg.checklist && msg.checklist.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <span className="font-medium text-zinc-100 text-sm">
                    {msg.answer?.split('\n\n')[0] || "Here are the steps your policy requires to file a claim successfully:"}
                  </span>
                  <ChecklistCard
                    checklist={msg.checklist}
                    generalAdvice={msg.general_advice}
                    headsUp={msg.heads_up}
                  />
                </div>
              ) : (
                isUser ? (
                  <span className="whitespace-pre-line">{content}</span>
                ) : (
                  renderFormattedText(content)
                )
              )}
            </>
          )}
        </div>

        {/* Citations */}
        {!isUser && msg.citations?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {msg.citations.map((cite, i) => (
              <span
                key={i}
                className="text-[10px] font-semibold text-[#558187] bg-white border border-[#062327]/10 px-2.5 py-1 rounded-full flex items-center gap-1 hover:border-[#062327]/25 hover:bg-[#f5f8f8] transition-colors shadow-xs"
              >
                <BookOpen size={10} className="text-[#062327]" />
                <span>p.{cite.page_number || '?'} · {cite.section_heading || 'Policy contract clause'}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────
function TypingIndicator({ statusMsg }) {
  return (
    <div className="flex items-start gap-3 animate-fade-in">
      <div className="w-8 h-8 rounded-2xl bg-[#f5f8f8] border border-[#062327]/10 flex items-center justify-center flex-shrink-0 mt-0.5 text-[#558187]">
        <Bot size={15} />
      </div>
      <div className="px-4 py-3 bg-[#f5f8f8] border border-[#062327]/10 rounded-2xl rounded-tl-sm">
        {statusMsg ? (
          <p className="text-xs text-[#558187] italic">{statusMsg}</p>
        ) : (
          <div className="flex items-center gap-1.5 py-0.5">
            {[0, 0.2, 0.4].map((delay, i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-[#062327] animate-pulse-dot"
                style={{ animationDelay: `${delay}s` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main ChatBox ──────────────────────────────────────────────────────────
export default function ChatBox({ initialPolicy, policies }) {
  const [selectedPolicyId, setSelectedPolicyId] = useState(initialPolicy?._id || '');
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [plainLanguageMode, setPlainLanguageMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsAvailable, setWsAvailable] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // Chat management states
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const scrollAreaRef  = useRef(null);
  const wsRef          = useRef(null);
  const inputRef       = useRef(null);

  // ── WebRTC Instant Voice Input Hook (ChatGPT style) ──────
  const {
    isSupported: isVoiceSupported,
    isListening: isVoiceListening,
    isSpeaking: isVoiceSpeaking,
    isPauseDetected: isVoicePauseDetected,
    isTranscribing: isVoiceTranscribing,
    engine: voiceEngine,
    setEngine: setVoiceEngine,
    recordingDuration: voiceDuration,
    audioLevel: voiceAudioLevel,
    transcript: voiceTranscript,
    interimTranscript: voiceInterimTranscript,
    fullTranscript: voiceFullTranscript,
    error: voiceError,
    language: voiceLanguage,
    setLanguage: setVoiceLanguage,
    startListening: startVoiceListening,
    stopListening: stopVoiceListening,
    commitTranscript: commitVoiceTranscript,
    sendImmediately: sendVoiceImmediately,
    cancelListening: cancelVoiceListening,
    toggleListening: toggleVoiceListening,
    setError: setVoiceError,
  } = useWebRTCVoice({
    initialEngine: 'instant',
    onTextCommitted: (transcribedText) => {
      if (transcribedText) {
        setInput((prev) => {
          const next = prev ? `${prev} ${transcribedText}` : transcribedText;
          return next;
        });
        setTimeout(() => {
          inputRef.current?.focus();
          if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 128) + 'px';
          }
        }, 50);
      }
    },
    onSendImmediate: (transcribedText) => {
      if (transcribedText) {
        handleSend(transcribedText);
      }
    },
  });

  // Keyboard shortcut: Alt + V to toggle voice input
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.altKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        toggleVoiceListening();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [toggleVoiceListening]);


  // ── Fetch conversation list ──────────────────────────
  useEffect(() => {
    fetchConversations(true);
  }, []);

  useEffect(() => {
    if (initialPolicy) setSelectedPolicyId(initialPolicy._id);
  }, [initialPolicy]);

  // ── WebSocket init ───────────────────────────────────
  useEffect(() => {
    tryConnectWS();
    return () => wsRef.current?.close();
  }, []);

  const tryConnectWS = () => {
    try {
      const ws = new WebSocket(WS_URL);
      ws.onopen = () => { setWsConnected(true); setWsAvailable(true); };
      ws.onclose = () => { setWsConnected(false); };
      ws.onerror = () => { setWsAvailable(false); setWsConnected(false); };
      wsRef.current = ws;
    } catch {
      setWsAvailable(false);
    }
  };

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, loading]);

  const handleScroll = () => {
    const el = scrollAreaRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
  };

  const fetchConversations = async (autoSelectFirst = false) => {
    try {
      const res = await api.get('/chat/conversations');
      const list = res.data.conversations || [];
      setConversations(list);
      if (autoSelectFirst && list.length > 0 && !currentConversationId) {
        loadConversation(list[0]._id);
      }
    } catch (err) {
      console.error('Failed to fetch conversations', err);
    }
  };

  const loadConversation = async (convId) => {
    if (!convId) return;
    setLoadingChat(true);
    setError(null);
    setConfirmDeleteId(null);
    setEditingId(null);
    try {
      const res = await api.get(`/chat/conversations/${convId}`);
      const conv = res.data.conversation;
      if (conv) {
        setCurrentConversationId(convId);
        setMessages(conv.messages || []);
        if (conv.policy_id) {
          const pId = typeof conv.policy_id === 'object' ? conv.policy_id._id : conv.policy_id;
          setSelectedPolicyId(pId || '');
        }
      }
      setMobileDrawerOpen(false);
    } catch (err) {
      console.error('Failed to load conversation', err);
      setError('Failed to load conversation history.');
    } finally {
      setLoadingChat(false);
    }
  };

  const startNewChat = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setError(null);
    setConfirmDeleteId(null);
    setEditingId(null);
    setMobileDrawerOpen(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // ── Rename handlers ──────────────────────────────────
  const handleStartRename = (e, conv) => {
    e.stopPropagation();
    setConfirmDeleteId(null);
    setEditingId(conv._id);
    setEditTitle(conv.title || '');
  };

  const handleSaveRename = async (convId) => {
    const trimmed = editTitle.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    try {
      await api.patch(`/chat/conversations/${convId}`, { title: trimmed });
      setConversations(prev =>
        prev.map(c => (c._id === convId ? { ...c, title: trimmed } : c))
      );
    } catch (err) {
      console.error('Failed to rename conversation', err);
    } finally {
      setEditingId(null);
    }
  };

  const handleCancelRename = () => {
    setEditingId(null);
  };

  // ── Delete handlers ──────────────────────────────────
  const handleStartDelete = (e, conv) => {
    e.stopPropagation();
    setEditingId(null);
    setConfirmDeleteId(conv._id);
  };

  const handleConfirmDelete = async (convId) => {
    try {
      await api.delete(`/chat/conversations/${convId}`);
      setConversations(prev => prev.filter(c => c._id !== convId));
      if (currentConversationId === convId) {
        startNewChat();
      }
    } catch (err) {
      console.error('Failed to delete conversation', err);
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const handleCancelDelete = () => {
    setConfirmDeleteId(null);
  };

  // ── Send message via WebSocket (streaming) ──────────
  const sendViaWS = (question) => {
    return new Promise((resolve, reject) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not open'));
        return;
      }
      const token = localStorage.getItem('insurai_token') || localStorage.getItem('medshield_token');
      let streamingMsgId = `stream-${Date.now()}`;

      // Add placeholder streaming message
      setMessages(prev => [...prev, {
        message_id: streamingMsgId,
        role: 'assistant',
        content: '',
        streaming: true,
      }]);

      let finalMetadata = null;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'status') {
            setStatusMsg(data.message);
          } else if (data.type === 'chunk') {
            setStatusMsg('');
            setMessages(prev => prev.map(m =>
              m.message_id === streamingMsgId
                ? { ...m, content: m.content + data.token }
                : m
            ));
          } else if (data.type === 'complete') {
            finalMetadata = data;
            const newConvId = data.conversation_id || data.conversationId;
            if (newConvId) {
              setCurrentConversationId(newConvId);
            }
            setMessages(prev => prev.map(m =>
              m.message_id === streamingMsgId
                ? {
                    ...m,
                    streaming: false,
                    query_type: data.query_type ?? data.queryType,
                    confidence_level: data.confidence_level ?? data.confidenceLevel,
                    verification_passed: data.verification_passed ?? data.verificationPassed,
                    verification_notes: data.verification_notes,
                    plain_language: data.plain_language,
                    citations: data.citations || [],
                  }
                : m
            ));
            fetchConversations(false);
            resolve(finalMetadata);
          } else if (data.type === 'error') {
            setMessages(prev => prev.map(m =>
              m.message_id === streamingMsgId
                ? { ...m, streaming: false, content: data.message || 'An error occurred.' }
                : m
            ));
            reject(new Error(data.message));
          }
        } catch {
          reject(new Error('Failed to parse WebSocket message'));
        }
      };

      ws.send(JSON.stringify({
        token,
        question,
        policy_id: selectedPolicyId || null,
        conversation_id: currentConversationId,
        plain_language_mode: plainLanguageMode,
      }));
    });
  };

  // ── Send message via REST (fallback) ────────────────
  const sendViaREST = async (question) => {
    const res = await api.post('/chat/message', {
      conversation_id: currentConversationId,
      policy_id: selectedPolicyId || null,
      question,
      plain_language_mode: plainLanguageMode,
    });
    if (res.data.success) {
      const newConvId = res.data.conversationId || res.data.conversation_id;
      if (newConvId) {
        setCurrentConversationId(newConvId);
      }
      setMessages(prev => [...prev, res.data.assistantMessage]);
      fetchConversations(false);
    }
  };

  const handleSend = async (textOrEvent) => {
    if (textOrEvent && typeof textOrEvent.preventDefault === 'function') {
      textOrEvent.preventDefault();
    }
    const question = (typeof textOrEvent === 'string' ? textOrEvent : input).trim();
    if (!question || loading) return;

    setInput('');
    setError(null);
    setLoading(true);
    setStatusMsg('');

    // Optimistic user message
    setMessages(prev => [...prev, {
      message_id: `user-${Date.now()}`,
      role: 'user',
      content: question,
      created_at: new Date(),
    }]);

    try {
      if (wsAvailable && wsConnected && wsRef.current?.readyState === WebSocket.OPEN) {
        await sendViaWS(question);
      } else {
        await sendViaREST(question);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to get a response. Please try again.');
      setMessages(prev => prev.filter(m => !m.streaming));
    } finally {
      setLoading(false);
      setStatusMsg('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const policyOptions = useMemo(() => [
    { value: '', label: 'All Policies' },
    ...policies.map(p => ({
      value: p._id,
      label: `${p.insurer_name || p.file_name}`,
    })),
  ], [policies]);

  const groupedConversations = useMemo(
    () => groupConversations(conversations, searchQuery),
    [conversations, searchQuery]
  );

  return (
    <div className="flex gap-5 h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-5rem)]">
      {/* ─── Desktop Sidebar ────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-72 flex-shrink-0 rounded-3xl overflow-hidden border border-[#062327]/10 shadow-sm bg-white">
        <ChatSidebarContent
          onNewChat={startNewChat}
          policyOptions={policyOptions}
          selectedPolicyId={selectedPolicyId}
          setSelectedPolicyId={setSelectedPolicyId}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          groupedConversations={groupedConversations}
          currentConversationId={currentConversationId}
          onSelectConversation={loadConversation}
          editingId={editingId}
          editTitle={editTitle}
          setEditTitle={setEditTitle}
          onStartRename={handleStartRename}
          onSaveRename={handleSaveRename}
          onCancelRename={handleCancelRename}
          confirmDeleteId={confirmDeleteId}
          onStartDelete={handleStartDelete}
          onConfirmDelete={handleConfirmDelete}
          onCancelDelete={handleCancelDelete}
          plainLanguageMode={plainLanguageMode}
          setPlainLanguageMode={setPlainLanguageMode}
          wsConnected={wsConnected}
        />
      </aside>

      {/* ─── Mobile Slide-over Drawer ───────────────── */}
      {mobileDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            onClick={() => setMobileDrawerOpen(false)}
            className="fixed inset-0 bg-[#062327]/40 backdrop-blur-sm transition-opacity"
          />

          {/* Drawer content */}
          <div className="relative w-72 max-w-[85vw] h-full bg-white border-r border-[#062327]/10 shadow-2xl flex flex-col z-10 animate-fade-in">
            <div className="p-4 border-b border-[#062327]/08 flex items-center justify-between bg-white">
              <span className="font-headline text-sm font-bold text-[#062327] flex items-center gap-2">
                <History size={16} className="text-[#062327]" />
                Consultation History
              </span>
              <button
                onClick={() => setMobileDrawerOpen(false)}
                className="p-1.5 rounded-xl text-[#558187] hover:text-[#062327] hover:bg-[#062327]/08"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ChatSidebarContent
                onNewChat={startNewChat}
                policyOptions={policyOptions}
                selectedPolicyId={selectedPolicyId}
                setSelectedPolicyId={setSelectedPolicyId}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                groupedConversations={groupedConversations}
                currentConversationId={currentConversationId}
                onSelectConversation={loadConversation}
                editingId={editingId}
                editTitle={editTitle}
                setEditTitle={setEditTitle}
                onStartRename={handleStartRename}
                onSaveRename={handleSaveRename}
                onCancelRename={handleCancelRename}
                confirmDeleteId={confirmDeleteId}
                onStartDelete={handleStartDelete}
                onConfirmDelete={handleConfirmDelete}
                onCancelDelete={handleCancelDelete}
                plainLanguageMode={plainLanguageMode}
                setPlainLanguageMode={setPlainLanguageMode}
                wsConnected={wsConnected}
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── Main chat area ──────────────────────────── */}
      <div className="flex-1 flex flex-col rounded-3xl overflow-hidden min-w-0 border border-[#062327]/10 shadow-sm bg-white">
        {/* Mobile: scope + history toggle bar */}
        <div className="lg:hidden flex items-center gap-2.5 px-4 py-3 border-b border-[#062327]/08 bg-[#f5f8f8]">
          <button
            onClick={() => setMobileDrawerOpen(true)}
            className="px-3 py-1.5 text-xs gap-1.5 flex items-center rounded-xl bg-white border border-[#062327]/12 text-[#062327] font-bold shadow-xs cursor-pointer"
            title="Chat history"
          >
            <History size={14} className="text-[#062327]" />
            <span className="text-[#062327] font-bold">Chats</span>
            {conversations.length > 0 && (
              <span className="text-[10px] text-[#062327] bg-[#d2f57b] font-black px-1.5 py-0.2 rounded-full">
                {conversations.length}
              </span>
            )}
          </button>

          <select
            value={selectedPolicyId}
            onChange={e => setSelectedPolicyId(e.target.value)}
            className="input-field text-xs flex-1 py-1.5 rounded-xl bg-white text-[#062327]"
          >
            {policyOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <button
            onClick={startNewChat}
            className="w-8 h-8 rounded-xl bg-[#d2f57b] text-[#062327] border border-[#062327]/20 flex items-center justify-center flex-shrink-0 cursor-pointer font-bold shadow-xs"
            title="New conversation"
          >
            <Plus size={16} className="stroke-[2.5]" />
          </button>
        </div>

        {/* Messages area */}
        <div
          ref={scrollAreaRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-5 sm:px-7 py-6 space-y-6 scroll-area relative bg-[#fcfefe]"
        >
          {loadingChat ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <Spinner size={26} className="text-[#062327] mb-3" />
              <p className="text-xs font-semibold text-[#558187]">Loading consultation history…</p>
            </div>
          ) : messages.length === 0 && !loading ? (
            // Empty state
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12 max-w-md mx-auto">
              <div className="w-14 h-14 rounded-3xl bg-[#d2f57b] border-2 border-[#062327] flex items-center justify-center mb-5 text-[#062327] shadow-sm">
                <Bot size={24} className="stroke-[2.5]" />
              </div>
              <h3 className="font-headline text-lg sm:text-xl font-bold text-[#062327] mb-2">
                Policy Intelligence Assistant
              </h3>
              <p className="text-xs sm:text-sm text-[#558187] leading-relaxed mb-6 font-medium">
                Ask anything about room-rent sub-limits, waiting periods, modern treatments, or co-pays. Every answer is grounded with verbatim page citations.
              </p>
              <div className="grid grid-cols-1 gap-2.5 w-full">
                {SAMPLE_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(q)}
                    className="text-left px-4 py-3 rounded-2xl bg-white border border-[#062327]/10 hover:border-[#062327]/30 hover:bg-[#f5f8f8] text-xs font-semibold text-[#062327] transition-all duration-150 cursor-pointer shadow-xs"
                  >
                    "{q}"
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <MessageBubble
                  key={msg.message_id || i}
                  msg={msg}
                  plainLanguageMode={plainLanguageMode}
                />
              ))}
              {loading && !messages.some(m => m.streaming) && (
                <TypingIndicator statusMsg={statusMsg} />
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Scroll to bottom button */}
        {showScrollBtn && (
          <button
            onClick={() => scrollToBottom()}
            className="absolute bottom-28 right-8 p-2.5 rounded-full bg-white border border-[#062327]/15 text-[#062327] hover:bg-[#f5f8f8] shadow-md transition-all animate-fade-in cursor-pointer"
          >
            <ChevronDown size={16} />
          </button>
        )}

        {/* Error bar */}
        {error && (
          <div className="px-5 pb-2">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        {/* Input area */}
        <form
          onSubmit={handleSend}
          className="px-5 pb-5 pt-3 border-t border-[#062327]/08 bg-white/95 backdrop-blur-md"
        >
          {/* Mobile: plain language toggle */}
          <div className="lg:hidden flex items-center gap-3 mb-3">
            <Toggle
              checked={plainLanguageMode}
              onChange={setPlainLanguageMode}
              label="Plain language mode"
            />
          </div>

          {/* WebRTC Real-Time Voice Input Banner */}
          <VoiceInputBanner
            isListening={isVoiceListening}
            isSpeaking={isVoiceSpeaking}
            isPauseDetected={isVoicePauseDetected}
            isTranscribing={isVoiceTranscribing}
            engine={voiceEngine}
            onEngineChange={setVoiceEngine}
            transcript={voiceTranscript}
            interimTranscript={voiceInterimTranscript}
            fullTranscript={voiceFullTranscript}
            recordingDuration={voiceDuration}
            audioLevel={voiceAudioLevel}
            language={voiceLanguage}
            onLanguageChange={setVoiceLanguage}
            onCommitTranscript={commitVoiceTranscript}
            onSendImmediately={sendVoiceImmediately}
            onCancel={cancelVoiceListening}
            error={voiceError}
            onErrorDismiss={() => setVoiceError(null)}
          />

          <div className="flex gap-2.5 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading || isVoiceTranscribing}
                placeholder={
                  isVoiceListening
                    ? isVoicePauseDetected
                      ? "⏸️ Pause detected — click 'Use Transcript' to insert, or keep speaking..."
                      : isVoiceSpeaking
                      ? "🎙️ Listening... Streaming words onto screen..."
                      : "Listening... speak now or press Alt+V to finish"
                    : isVoiceTranscribing
                    ? "Transcribing with Whisper Turbo..."
                    : "Ask about room rent limits, exclusions, ICU caps, or claim procedures…"
                }
                className="
                  input-field resize-none py-3.5 pr-12 leading-relaxed
                  max-h-32 overflow-y-auto rounded-2xl bg-[#f5f8f8] text-[#062327] placeholder-[#558187] focus:bg-white focus:border-[#062327] border-[#062327]/12
                "
                onInput={e => {
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
                }}
              />
            </div>

            {/* WebRTC Real-Time Voice Input Microphone Button */}
            <VoiceInputButton
              isListening={isVoiceListening}
              isSpeaking={isVoiceSpeaking}
              isPauseDetected={isVoicePauseDetected}
              isTranscribing={isVoiceTranscribing}
              isSupported={isVoiceSupported}
              disabled={loading}
              onClick={toggleVoiceListening}
            />

            <button
              type="submit"
              disabled={loading || !input.trim() || isVoiceTranscribing}
              className="btn-pill-lime h-12 w-12 p-0 rounded-2xl flex-shrink-0 flex items-center justify-center cursor-pointer disabled:opacity-40 shadow-sm text-[#062327]"
              aria-label="Send message"
            >
              {loading ? (
                <Spinner size={18} className="text-[#062327] shrink-0" />
              ) : (
                <Send size={18} className="text-[#062327] shrink-0 stroke-[#062327] stroke-[2.2] translate-x-px" />
              )}
            </button>
          </div>
          <p className="text-[11px] text-[#558187] mt-2.5 text-center font-medium">
            {wsConnected ? 'Streaming via WebSocket' : 'REST API mode'}
            {selectedPolicyId ? '' : ' · Searching across all policies'}
            {' · WebRTC Instant Voice (Alt+V)'}
            {' · Fully grounded with contract citations'}
          </p>
        </form>
      </div>
    </div>
  );
}
