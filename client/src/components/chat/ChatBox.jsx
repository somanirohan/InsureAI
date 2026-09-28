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
} from 'lucide-react';
import api from '../../services/api';
import { Toggle, Select, Spinner, EmptyState, ErrorBanner } from '../common/ui';

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
      <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/[0.08] border border-brand-500/40 animate-fade-in my-0.5">
        <input
          ref={editInputRef}
          type="text"
          value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onSaveRename(conv._id);
            if (e.key === 'Escape') onCancelRename();
          }}
          className="bg-transparent text-xs text-zinc-100 flex-1 min-w-0 outline-none px-1"
        />
        <button
          onClick={() => onSaveRename(conv._id)}
          className="p-1 hover:text-brand-400 text-zinc-400 transition-colors"
          title="Save title"
        >
          <Check size={12} />
        </button>
        <button
          onClick={onCancelRename}
          className="p-1 hover:text-zinc-200 text-zinc-500 transition-colors"
          title="Cancel"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  if (isConfirmingDelete) {
    return (
      <div className="flex items-center justify-between px-2.5 py-2 rounded-xl bg-red-500/10 border border-red-500/25 animate-fade-in my-0.5 text-2xs">
        <span className="text-red-400 font-medium truncate">Delete this chat?</span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => onConfirmDelete(conv._id)}
            className="px-2 py-0.5 rounded bg-red-500 text-white font-medium hover:bg-red-600 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={onCancelDelete}
            className="px-2 py-0.5 rounded bg-white/[0.08] text-zinc-400 hover:text-zinc-200 transition-colors"
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
        group relative flex items-center justify-between gap-1.5 px-3 py-2.5 rounded-xl text-xs cursor-pointer transition-all duration-150 my-0.5
        ${isActive
          ? 'bg-brand-500/15 text-zinc-100 font-medium border border-brand-500/25 shadow-sm'
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
        }
      `}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <MessageSquare
          size={13}
          className={`flex-shrink-0 transition-colors ${
            isActive ? 'text-brand-400' : 'text-zinc-500 group-hover:text-zinc-400'
          }`}
        />
        <div className="min-w-0 flex-1">
          <span className="block truncate leading-tight">
            {conv.title || 'Untitled session'}
          </span>
          {conv.policy_name && (
            <span className="block truncate text-[10px] text-zinc-600 font-normal leading-tight mt-0.5">
              {conv.policy_name}
            </span>
          )}
        </div>
      </div>

      {/* Action buttons (revealed on hover or active) */}
      <div className="hidden group-hover:flex items-center gap-1 flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => onStartRename(e, conv)}
          className="p-1 rounded hover:bg-white/[0.1] text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Rename conversation"
        >
          <Edit2 size={11} />
        </button>
        <button
          onClick={(e) => onStartDelete(e, conv)}
          className="p-1 rounded hover:bg-red-500/15 text-zinc-400 hover:text-red-400 transition-colors"
          title="Delete conversation"
        >
          <Trash2 size={11} />
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
    <div className="flex flex-col h-full overflow-hidden">
      {/* New conversation button */}
      <div className="p-3 border-b border-white/[0.06]">
        <button
          onClick={onNewChat}
          className="btn btn-secondary w-full gap-2 text-xs font-medium justify-center py-2.5 rounded-xl border border-white/[0.10] hover:border-white/[0.20] transition-all"
        >
          <Plus size={14} className="text-brand-400" />
          <span>New conversation</span>
        </button>
      </div>

      {/* Policy scope selector */}
      <div className="p-3 border-b border-white/[0.06]">
        <Select
          label="Policy Scope"
          value={selectedPolicyId}
          onChange={setSelectedPolicyId}
          options={policyOptions}
        />
      </div>

      {/* Search filter */}
      <div className="px-3 pt-2.5 pb-1">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search past chats..."
            className="w-full pl-7 pr-6 py-1.5 text-xs rounded-lg bg-white/[0.04] border border-white/[0.06] text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-brand-500/40 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 py-1 scroll-area">
        {groupedConversations.length === 0 ? (
          <div className="text-center py-8 px-4">
            <MessageSquare size={20} className="text-zinc-700 mx-auto mb-2 opacity-60" />
            <p className="text-xs text-zinc-600">
              {searchQuery ? 'No chats found matching search' : 'No previous conversations'}
            </p>
          </div>
        ) : (
          groupedConversations.map(group => (
            <div key={group.title} className="mb-3">
              <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider px-2 py-1">
                {group.title}
              </p>
              <div className="space-y-0.5">
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
      <div className="p-3 border-t border-white/[0.06] bg-[#0c0c10]/40">
        <Toggle
          checked={plainLanguageMode}
          onChange={setPlainLanguageMode}
          label="Plain language"
          description="Simplify insurance jargon"
        />
      </div>

      {/* Streaming connection status */}
      <div className={`px-4 py-2 flex items-center justify-between border-t border-white/[0.04] text-2xs ${wsConnected ? 'text-brand-500' : 'text-zinc-600'}`}>
        <div className="flex items-center gap-1.5">
          {wsConnected ? <Wifi size={10} /> : <WifiOff size={10} />}
          <span>{wsConnected ? 'Streaming active' : 'REST API mode'}</span>
        </div>
        <span className="text-zinc-600 font-mono">v1.2</span>
      </div>
    </div>
  );
}

// ─── Message bubble ────────────────────────────────────────────────────────
function MessageBubble({ msg, plainLanguageMode }) {
  const isUser = msg.role === 'user';
  const content = plainLanguageMode && msg.plain_language ? msg.plain_language : msg.content;

  return (
    <div
      className={`flex items-start gap-3 animate-fade-in ${isUser ? 'flex-row-reverse' : ''}`}
    >
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
          isUser
            ? 'bg-brand-500/15 border border-brand-500/25'
            : 'bg-white/[0.06] border border-white/[0.08]'
        }`}
      >
        {isUser
          ? <User size={13} className="text-brand-500" />
          : <Bot size={13} className="text-zinc-400" />
        }
      </div>

      {/* Bubble */}
      <div className={`max-w-2xl min-w-0 ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1.5`}>
        {/* Meta row (assistant only) */}
        {!isUser && (msg.query_type || msg.confidence_level || msg.verification_passed) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {msg.query_type && (
              <span className="text-[10px] font-medium text-zinc-600 bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-full">
                {msg.query_type === 'structured' ? 'Structured lookup' : 'Semantic search'}
              </span>
            )}
            {msg.confidence_level && (
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                msg.confidence_level === 'high'   ? 'status-ready' :
                msg.confidence_level === 'medium' ? 'status-pending' :
                'status-error'
              }`}>
                {msg.confidence_level} confidence
              </span>
            )}
            {msg.verification_passed && (
              <span className="text-[10px] flex items-center gap-1 text-brand-500">
                <ShieldCheck size={10} />
                Verified
              </span>
            )}
          </div>
        )}

        {/* Content */}
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
            isUser
              ? 'bg-brand-500/12 border border-brand-500/20 text-zinc-100 rounded-tr-sm'
              : 'bg-white/[0.04] border border-white/[0.07] text-zinc-200 rounded-tl-sm'
          }`}
        >
          {msg.streaming ? (
            <span>
              {content}
              <span className="inline-block w-0.5 h-4 bg-brand-500 ml-0.5 animate-pulse-dot" />
            </span>
          ) : (
            <span className="whitespace-pre-line">{content}</span>
          )}
        </div>

        {/* Citations */}
        {!isUser && msg.citations?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-0.5">
            {msg.citations.map((cite, i) => (
              <span
                key={i}
                className="text-[10px] text-zinc-500 bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 rounded-full"
              >
                <BookOpen size={9} className="inline mr-1" />
                p.{cite.page_number || '?'} · {cite.section_heading || 'Policy clause'}
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
      <div className="w-7 h-7 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5">
        <Bot size={13} className="text-zinc-400" />
      </div>
      <div className="px-4 py-3 bg-white/[0.04] border border-white/[0.07] rounded-2xl rounded-tl-sm">
        {statusMsg ? (
          <p className="text-xs text-zinc-500 italic">{statusMsg}</p>
        ) : (
          <div className="flex items-center gap-1.5 py-0.5">
            {[0, 0.2, 0.4].map((delay, i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-pulse-dot"
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

  const handleSend = async (e) => {
    e?.preventDefault();
    const question = input.trim();
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
    <div className="flex gap-4 h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-5rem)]">
      {/* ─── Desktop Sidebar ────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-64 flex-shrink-0 surface rounded-2xl overflow-hidden border border-white/[0.06]">
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
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
          />

          {/* Drawer content */}
          <div className="relative w-72 max-w-[85vw] h-full surface border-r border-white/[0.08] shadow-2xl flex flex-col z-10 animate-fade-in">
            <div className="p-3 border-b border-white/[0.06] flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <History size={14} className="text-brand-400" />
                Conversation History
              </span>
              <button
                onClick={() => setMobileDrawerOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
              >
                <X size={15} />
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
      <div className="flex-1 flex flex-col surface rounded-2xl overflow-hidden min-w-0 border border-white/[0.06]">
        {/* Mobile: scope + history toggle bar */}
        <div className="lg:hidden flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.06] bg-[#0c0c10]/70">
          <button
            onClick={() => setMobileDrawerOpen(true)}
            className="btn btn-ghost px-2.5 py-1.5 text-xs gap-1.5 rounded-xl border border-white/[0.08]"
            title="Chat history"
          >
            <History size={14} className="text-brand-400" />
            <span className="text-zinc-300">Chats</span>
            {conversations.length > 0 && (
              <span className="text-[10px] text-zinc-500 bg-white/[0.06] px-1.5 py-0.2 rounded-full">
                {conversations.length}
              </span>
            )}
          </button>

          <select
            value={selectedPolicyId}
            onChange={e => setSelectedPolicyId(e.target.value)}
            className="input-field text-xs flex-1 py-1.5"
          >
            {policyOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <button
            onClick={startNewChat}
            className="btn btn-ghost p-2 rounded-xl flex-shrink-0 border border-white/[0.08]"
            title="New conversation"
          >
            <Plus size={15} className="text-brand-400" />
          </button>
        </div>

        {/* Messages area */}
        <div
          ref={scrollAreaRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5 scroll-area relative"
        >
          {loadingChat ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <Spinner size={24} className="text-brand-400 mb-3" />
              <p className="text-xs text-zinc-500">Loading conversation history...</p>
            </div>
          ) : messages.length === 0 && !loading ? (
            // Empty state
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12 max-w-sm mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mb-4">
                <Bot size={20} className="text-zinc-400" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-200 mb-1.5">
                Policy Intelligence Assistant
              </h3>
              <p className="text-xs text-zinc-500 leading-relaxed mb-6">
                Ask anything about coverage amounts, waiting periods, exclusions, ICU caps, or claim procedures. Answers are cited back to exact policy pages.
              </p>
              <div className="grid grid-cols-1 gap-2 w-full">
                {SAMPLE_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(q)}
                    className="text-left px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-brand-500/30 hover:bg-white/[0.05] text-xs text-zinc-400 hover:text-zinc-200 transition-all duration-150"
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
            className="absolute bottom-24 right-6 p-2 rounded-full bg-[#1e1e23] border border-white/[0.10] text-zinc-400 hover:text-zinc-200 shadow-lg transition-all animate-fade-in"
          >
            <ChevronDown size={15} />
          </button>
        )}

        {/* Error bar */}
        {error && (
          <div className="px-4 pb-2">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        {/* Input area */}
        <form
          onSubmit={handleSend}
          className="px-4 pb-4 pt-3 border-t border-white/[0.06] bg-[#0a0a0c]/80 backdrop-blur-sm"
        >
          {/* Mobile: plain language toggle */}
          <div className="lg:hidden flex items-center gap-3 mb-3">
            <Toggle
              checked={plainLanguageMode}
              onChange={setPlainLanguageMode}
              label="Plain language mode"
            />
          </div>

          <div className="flex gap-2 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                placeholder="Ask about coverage, exclusions, waiting periods…"
                className="
                  input-field resize-none py-3 pr-12 leading-relaxed
                  max-h-32 overflow-y-auto rounded-xl
                "
                style={{ height: 'auto' }}
                onInput={e => {
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
                }}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="btn btn-primary h-11 w-11 p-0 rounded-xl flex-shrink-0"
              aria-label="Send message"
            >
              {loading ? <Spinner size={15} className="text-black" /> : <Send size={15} />}
            </button>
          </div>
          <p className="text-2xs text-zinc-600 mt-2 text-center">
            {wsConnected ? 'Streaming via WebSocket' : 'REST API mode'}
            {selectedPolicyId ? '' : ' · All policies'}
            {' · Chats saved automatically'}
          </p>
        </form>
      </div>
    </div>
  );
}
