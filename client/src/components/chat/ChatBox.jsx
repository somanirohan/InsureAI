import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send,
  Bot,
  User,
  Plus,
  BookOpen,
  ShieldCheck,
  Sparkles,
  ChevronDown,
  MessageSquare,
  Wifi,
  WifiOff,
  AlertCircle,
} from 'lucide-react';
import api from '../../services/api';
import { Toggle, Select, Spinner, EmptyState, ErrorBanner } from '../common/ui';

// ─── WebSocket connection (ws://localhost:5000/ws/chat) ─────────────────
//
// The backend accepts JSON: { token, question, policy_id, conversation_id, plain_language_mode }
// and streams back:
//   { type: 'status',   message: string }
//   { type: 'chunk',    token: string, isFirst: bool, isLast: bool }
//   { type: 'complete', queryType, confidenceLevel, verificationPassed, citations }
//   { type: 'error',    message: string }
//
// TODO: Replace WS_URL with env var in production.
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:5001/ws/chat';

const SAMPLE_QUESTIONS = [
  "What's my room-rent limit per day?",
  "Is there any co-payment for Tier 1 hospitals?",
  "What is the waiting period for pre-existing diseases?",
  "What are the major exclusions under this policy?",
];

// ─── Message bubble ──────────────────────────────────────────────────────
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
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsAvailable, setWsAvailable] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const messagesEndRef = useRef(null);
  const scrollAreaRef  = useRef(null);
  const wsRef          = useRef(null);
  const inputRef       = useRef(null);

  // ── Fetch conversation list ──────────────────────────
  useEffect(() => { fetchConversations(); }, []);
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

  const fetchConversations = async () => {
    try {
      const res = await api.get('/chat/conversations');
      const list = res.data.conversations || [];
      setConversations(list);
      if (list.length > 0) loadConversation(list[0]._id);
    } catch (err) {
      console.error('Failed to fetch conversations', err);
    }
  };

  const loadConversation = async (convId) => {
    try {
      const res = await api.get(`/chat/conversations/${convId}`);
      setCurrentConversationId(convId);
      const conv = res.data.conversation;
      setMessages(conv.messages || []);
      if (conv.policy_id) {
        setSelectedPolicyId(conv.policy_id._id || conv.policy_id);
      }
    } catch (err) {
      console.error('Failed to load conversation', err);
    }
  };

  const startNewChat = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setError(null);
    inputRef.current?.focus();
  };

  // ── Send message via WebSocket (streaming) ──────────
  const sendViaWS = (question) => {
    return new Promise((resolve, reject) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not open'));
        return;
      }
      const token = localStorage.getItem('medshield_token');
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
            setMessages(prev => prev.map(m =>
              m.message_id === streamingMsgId
                ? {
                    ...m,
                    streaming: false,
                    query_type: data.queryType,
                    confidence_level: data.confidenceLevel,
                    verification_passed: data.verificationPassed,
                    citations: data.citations,
                  }
                : m
            ));
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
      if (!currentConversationId) {
        setCurrentConversationId(res.data.conversationId);
        fetchConversations();
      }
      setMessages(prev => [...prev, res.data.assistantMessage]);
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
      // Remove streaming placeholder if present
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

  const policyOptions = [
    { value: '', label: 'All Policies' },
    ...policies.map(p => ({
      value: p._id,
      label: `${p.insurer_name || p.file_name}`,
    })),
  ];

  return (
    <div className="flex gap-4 h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-5rem)]">
      {/* ─── Sidebar ────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-56 flex-shrink-0 surface rounded-xl overflow-hidden">
        {/* New conversation */}
        <div className="p-3 border-b border-white/[0.06]">
          <button
            onClick={startNewChat}
            className="btn btn-secondary w-full gap-2 text-xs"
          >
            <Plus size={13} />
            New conversation
          </button>
        </div>

        {/* Policy scope */}
        <div className="p-3 border-b border-white/[0.06]">
          <Select
            label="Policy Scope"
            value={selectedPolicyId}
            onChange={setSelectedPolicyId}
            options={policyOptions}
          />
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto p-2 scroll-area">
          <p className="label-xs px-2 mb-2 mt-1">Recent</p>
          {conversations.length === 0 ? (
            <p className="text-xs text-zinc-600 text-center py-6">No chats yet</p>
          ) : (
            <div className="space-y-0.5">
              {conversations.map(c => (
                <button
                  key={c._id}
                  onClick={() => loadConversation(c._id)}
                  className={`
                    w-full text-left px-3 py-2.5 rounded-xl text-xs transition-all duration-100 truncate block
                    ${currentConversationId === c._id
                      ? 'bg-white/[0.07] text-zinc-200'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
                    }
                  `}
                >
                  {c.title || 'Untitled session'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Plain language toggle */}
        <div className="p-3 pt-3 border-t border-white/[0.06]">
          <Toggle
            checked={plainLanguageMode}
            onChange={setPlainLanguageMode}
            label="Plain language"
            description="Simplify insurance jargon"
          />
        </div>

        {/* WS status indicator */}
        <div className={`px-4 py-2.5 flex items-center gap-2 text-2xs ${wsConnected ? 'text-brand-500' : 'text-zinc-600'}`}>
          {wsConnected
            ? <><Wifi size={10} /><span>Streaming connected</span></>
            : <><WifiOff size={10} /><span>REST mode</span></>
          }
        </div>
      </aside>

      {/* ─── Main chat area ──────────────────────────── */}
      <div className="flex-1 flex flex-col surface rounded-xl overflow-hidden min-w-0">
        {/* Mobile: scope + toggle bar */}
        <div className="lg:hidden flex items-center gap-2 px-3 py-2 border-b border-white/[0.06]">
          <select
            value={selectedPolicyId}
            onChange={e => setSelectedPolicyId(e.target.value)}
            className="input-field text-xs flex-1"
          >
            {policyOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={startNewChat}
            className="btn btn-ghost p-2 rounded-xl flex-shrink-0"
            title="New conversation"
          >
            <Plus size={15} />
          </button>
        </div>

        {/* Messages area */}
        <div
          ref={scrollAreaRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5 scroll-area relative"
        >
          {messages.length === 0 && !loading ? (
            // Empty state
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12 max-w-sm mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mb-4">
                <Bot size={20} className="text-zinc-500" />
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
                    className="text-left px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.10] hover:bg-white/[0.05] text-xs text-zinc-400 hover:text-zinc-200 transition-all duration-150"
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
              {loading && statusMsg && !messages.some(m => m.streaming) && (
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
            className="absolute bottom-20 right-6 p-2 rounded-full bg-[#1e1e23] border border-white/[0.10] text-zinc-400 hover:text-zinc-200 shadow-md transition-all animate-fade-in"
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
          className="px-4 pb-4 pt-3 border-t border-white/[0.06] bg-[#0a0a0c]/60"
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
                  max-h-32 overflow-y-auto
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
          <p className="text-2xs text-zinc-700 mt-2 text-center">
            {wsConnected ? 'Streaming via WebSocket' : 'REST API mode'}
            {selectedPolicyId ? '' : ' · All policies'}
          </p>
        </form>
      </div>
    </div>
  );
}
