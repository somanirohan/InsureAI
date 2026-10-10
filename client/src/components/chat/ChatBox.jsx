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
import { useLanguage, LanguageSelector } from '../../context/LanguageContext';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:5001/api/chat/ws';

// Message bubble component
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
                msg.confidence_level === 'high' || msg.confidence_level === 'High'  ? 'status-ready' :
                msg.confidence_level === 'medium' || msg.confidence_level === 'Medium' ? 'status-pending' :
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
                p.{cite.page_number || cite.page || '?'} · {cite.section_heading || cite.excerpt || 'Policy clause'}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Typing indicator component
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

export default function ChatBox({ initialPolicy, policies = [] }) {
  const { t, language } = useLanguage();
  const [conversations, setConversations]       = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [messages, setMessages]                 = useState([]);
  const [input, setInput]                       = useState('');
  const [loading, setLoading]                   = useState(false);
  const [statusMsg, setStatusMsg]               = useState('');
  const [selectedPolicyId, setSelectedPolicyId] = useState(initialPolicy?._id || '');
  const [plainLanguageMode, setPlainLanguageMode] = useState(false);
  const [wsConnected, setWsConnected]           = useState(false);
  const [wsAvailable, setWsAvailable]           = useState(true);
  const [error, setError]                       = useState(null);

  const messagesEndRef = useRef(null);
  const wsRef          = useRef(null);

  const sampleQuestions = [
    t('chat.samples.0', "What's my room-rent limit per day?"),
    t('chat.samples.1', "Is there any co-payment for Tier 1 hospitals?"),
    t('chat.samples.2', "What is the waiting period for pre-existing diseases?"),
    t('chat.samples.3', "What are the major exclusions under this policy?"),
  ];

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, statusMsg, scrollToBottom]);

  // Fetch conversations on mount
  useEffect(() => {
    fetchConversations();
  }, []);

  // Update selected policy when initialPolicy changes
  useEffect(() => {
    if (initialPolicy?._id) setSelectedPolicyId(initialPolicy._id);
  }, [initialPolicy]);

  const fetchConversations = async () => {
    try {
      const res = await api.get('/chat/conversations');
      setConversations(res.data.conversations || []);
    } catch (err) {
      console.error('Error fetching conversations:', err);
    }
  };

  const loadConversation = async (convId) => {
    try {
      const res = await api.get(`/chat/conversations/${convId}`);
      setCurrentConversationId(convId);
      setMessages(res.data.conversation?.messages || []);
      if (res.data.conversation?.policy_id) {
        setSelectedPolicyId(res.data.conversation.policy_id);
      }
    } catch (err) {
      console.error('Error loading conversation:', err);
    }
  };

  const startNewConversation = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setError(null);
  };

  // WebSocket lifecycle
  useEffect(() => {
    let ws = null;
    let pingInterval = null;

    try {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        setWsAvailable(true);
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      ws.onclose = () => {
        setWsConnected(false);
        clearInterval(pingInterval);
      };

      ws.onerror = () => {
        setWsConnected(false);
        setWsAvailable(false);
      };
    } catch {
      setWsAvailable(false);
    }

    return () => {
      clearInterval(pingInterval);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  // Send message via WebSocket
  const sendViaWS = (question) => {
    return new Promise((resolve, reject) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const token = localStorage.getItem('medshield_token');
      const streamingMsgId = `stream-${Date.now()}`;

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
                    query_type: data.query_type ?? data.queryType,
                    confidence_level: data.confidence_level ?? data.confidenceLevel,
                    verification_passed: data.verification_passed ?? data.verificationPassed,
                    verification_notes: data.verification_notes,
                    plain_language: data.plain_language,
                    citations: data.citations || [],
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
        language: language,
      }));
    });
  };

  // Send message via REST (fallback)
  const sendViaREST = async (question) => {
    const res = await api.post('/chat/message', {
      conversation_id: currentConversationId,
      policy_id: selectedPolicyId || null,
      question,
      plain_language_mode: plainLanguageMode,
      language: language,
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

  const policyOptions = [
    { value: '', label: t('chat.all_policies', 'All Active Policies') },
    ...policies.map(p => ({
      value: p._id,
      label: `${p.insurer_name || p.file_name}`,
    })),
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-h-[900px] surface overflow-hidden">
      {/* ─── Header ───────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between gap-4 flex-shrink-0 bg-white/[0.01]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
            <Bot size={15} className="text-brand-500" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-100 leading-tight">
              {t('chat.title', 'AI Policy Assistant')}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5 truncate">
              {t('chat.subtitle', 'Ask questions grounded in your policy clauses')}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {policies.length > 0 && (
            <div className="w-44 hidden sm:block">
              <Select
                value={selectedPolicyId}
                onChange={setSelectedPolicyId}
                options={policyOptions}
                className="text-xs"
              />
            </div>
          )}

          {/* Plain language toggle */}
          <div className="flex items-center gap-2">
            <Toggle
              checked={plainLanguageMode}
              onChange={setPlainLanguageMode}
              label={t('chat.plain_language', 'Simple View')}
            />
          </div>

          {/* New chat button */}
          <button
            onClick={startNewConversation}
            className="btn btn-ghost p-2 text-zinc-400 hover:text-zinc-100"
            title={t('chat.clear_chat', 'New Chat')}
          >
            <Plus size={15} />
          </button>
        </div>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* ─── Messages area ────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 scroll-area">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto py-8">
            <div className="w-12 h-12 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mb-4">
              <Bot size={22} className="text-brand-500" />
            </div>
            <h3 className="text-base font-semibold text-zinc-100 mb-1">
              {t('chat.empty_title', 'How can I help you today?')}
            </h3>
            <p className="text-xs text-zinc-500 leading-relaxed mb-6">
              {t('chat.empty_desc', 'Select a suggested question below or ask anything about room rent limits, co-pay, waiting periods, and claims.')}
            </p>

            {/* Suggested sample questions */}
            <div className="w-full space-y-2">
              <p className="text-2xs text-zinc-600 uppercase tracking-wider font-semibold text-left mb-2">
                {t('chat.sample_questions_title', 'Suggested Inquiries')}
              </p>
              {sampleQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInput(q);
                    handleSend();
                  }}
                  className="w-full text-left p-3 rounded-xl surface hover:border-white/[0.12] transition-all text-xs text-zinc-300 flex items-center justify-between group"
                >
                  <span className="truncate">{q}</span>
                  <Sparkles size={12} className="text-brand-500/50 group-hover:text-brand-500 flex-shrink-0 ml-2 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <MessageBubble
              key={msg.message_id || idx}
              msg={msg}
              plainLanguageMode={plainLanguageMode}
            />
          ))
        )}

        {loading && <TypingIndicator statusMsg={statusMsg} />}
        <div ref={messagesEndRef} />
      </div>

      {/* ─── Input bar ────────────────────────────────────── */}
      <div className="p-4 border-t border-white/[0.06] bg-white/[0.01] flex-shrink-0">
        <form onSubmit={handleSend} className="relative flex items-center gap-2">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.input_placeholder', 'Ask anything about your health policy (coverage, limits, claims)…')}
            className="input-field pr-12 py-3 resize-none text-sm leading-snug max-h-32"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-primary p-2 rounded-xl"
            title={t('chat.send', 'Send message')}
          >
            {loading ? <Spinner size={14} className="text-black" /> : <Send size={14} />}
          </button>
        </form>
        <p className="text-[11px] text-zinc-600 text-center mt-2">
          {t('chat.disclaimer', 'Answers are grounded in your uploaded policy. Consult your insurer for final claim approvals.')}
        </p>
      </div>
    </div>
  );
}
