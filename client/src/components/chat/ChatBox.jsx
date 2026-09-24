import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, ShieldCheck, Sparkles, BookOpen, AlertCircle, CheckCircle, HelpCircle } from 'lucide-react';
import api from '../../services/api';

export default function ChatBox({ initialPolicy, policies }) {
  const [selectedPolicyId, setSelectedPolicyId] = useState(initialPolicy?._id || '');
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [plainLanguageMode, setPlainLanguageMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (initialPolicy) {
      setSelectedPolicyId(initialPolicy._id);
    }
  }, [initialPolicy]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const fetchConversations = async () => {
    try {
      const res = await api.get('/chat/conversations');
      setConversations(res.data.conversations || []);
      if (res.data.conversations && res.data.conversations.length > 0) {
        loadConversation(res.data.conversations[0]._id);
      }
    } catch (err) {
      console.error('Error fetching conversations:', err);
    }
  };

  const loadConversation = async (convId) => {
    try {
      const res = await api.get(`/chat/conversations/${convId}`);
      setCurrentConversationId(convId);
      setMessages(res.data.conversation.messages || []);
      if (res.data.conversation.policy_id) {
        setSelectedPolicyId(res.data.conversation.policy_id._id || res.data.conversation.policy_id);
      }
    } catch (err) {
      console.error('Error loading conversation:', err);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputQuestion.trim() || loading) return;

    const questionText = inputQuestion.trim();
    setInputQuestion('');

    // Optimistically append user message
    const tempUserMsg = {
      message_id: Date.now().toString(),
      role: 'user',
      content: questionText,
      created_at: new Date(),
    };

    setMessages((prev) => [...prev, tempUserMsg]);
    setLoading(true);

    try {
      const res = await api.post('/chat/message', {
        conversation_id: currentConversationId,
        policy_id: selectedPolicyId || null,
        question: questionText,
        plain_language_mode: plainLanguageMode,
      });

      if (res.data.success) {
        if (!currentConversationId) {
          setCurrentConversationId(res.data.conversationId);
          fetchConversations();
        }
        setMessages((prev) => [...prev, res.data.assistantMessage]);
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          message_id: Date.now().toString(),
          role: 'assistant',
          content: 'Sorry, I encountered an issue retrieving information from your policy documents. Please ensure your policy has finished processing.',
          confidence_level: 'low',
          verification_passed: false,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleStartNewChat = () => {
    setCurrentConversationId(null);
    setMessages([]);
  };

  const sampleQuestions = [
    "What's my room-rent limit?",
    "Is there any co-payment in Tier 1 hospitals?",
    "What is the waiting period for pre-existing diseases?",
    "What are the major exclusions under this policy?",
  ];

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-8rem)] gap-4">
      {/* Sidebar: Conversations & Policy Scope */}
      <div className="w-full lg:w-72 flex-shrink-0 glass-panel rounded-2xl p-4 flex flex-col justify-between">
        <div>
          {/* Policy Selector Scope */}
          <div className="mb-4">
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Active Policy Scope (FR-09)
            </label>
            <select
              value={selectedPolicyId}
              onChange={(e) => setSelectedPolicyId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="">All Policies (Cross-Policy Search)</option>
              {policies.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.insurer_name || p.file_name} ({p.policy_number || 'Policy'})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleStartNewChat}
            className="w-full py-2 px-3 mb-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center space-x-1.5 transition-colors border border-slate-700/80"
          >
            <span>+ New Conversation</span>
          </button>

          {/* Past Conversations List */}
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Recent Conversations
          </div>
          <div className="space-y-1 overflow-y-auto max-h-[42vh] pr-1">
            {conversations.length === 0 ? (
              <div className="text-xs text-slate-500 py-3 text-center">No chat history yet</div>
            ) : (
              conversations.map((c) => (
                <button
                  key={c._id}
                  onClick={() => loadConversation(c._id)}
                  className={`w-full text-left p-2.5 rounded-xl text-xs transition-colors truncate block ${
                    currentConversationId === c._id
                      ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/80'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  {c.title || 'Untitled Session'}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Plain Language Mode Toggle (FR-13) */}
        <div className="pt-3 border-t border-slate-800">
          <label className="flex items-center justify-between cursor-pointer p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="text-xs font-semibold text-slate-200">Plain Language</div>
                <div className="text-[10px] text-slate-400">Demystifies insurance jargon</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={plainLanguageMode}
              onChange={(e) => setPlainLanguageMode(e.target.checked)}
              className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900 bg-slate-800 border-slate-700"
            />
          </label>
        </div>
      </div>

      {/* Main Chat Interface */}
      <div className="flex-1 glass-panel rounded-2xl flex flex-col overflow-hidden">
        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 max-w-lg mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 shadow-lg shadow-emerald-500/10">
                <Bot className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2 font-['Space_Grotesk']">
                MedShield Policy Intelligence
              </h3>
              <p className="text-xs text-slate-400 mb-6">
                Ask specific questions about coverage amounts, ICU caps, exclusions, waiting periods, or claim conditions. All answers are cited back to exact policy pages.
              </p>

              {/* Sample Questions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full text-left">
                {sampleQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setInputQuestion(q);
                    }}
                    className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800/80 border border-slate-800 text-xs text-slate-300 hover:text-emerald-300 transition-colors"
                  >
                    "{q}"
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={index}
                  className={`flex items-start space-x-3 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}
                >
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                      isUser
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-800 text-emerald-400 border border-slate-700'
                    }`}
                  >
                    {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>

                  <div
                    className={`max-w-2xl rounded-2xl p-4 text-xs leading-relaxed ${
                      isUser
                        ? 'bg-emerald-600/20 border border-emerald-500/30 text-white'
                        : 'bg-slate-900 border border-slate-800 text-slate-200'
                    }`}
                  >
                    {/* Assistant Metadata Badges */}
                    {!isUser && (
                      <div className="flex flex-wrap items-center gap-2 mb-2 pb-2 border-b border-slate-800/80">
                        {/* Query Classification (FR-09) */}
                        {msg.query_type && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                            {msg.query_type === 'structured' ? '⚡ Structured Fact Lookup' : '🔍 Semantic Vector Search'}
                          </span>
                        )}

                        {/* Confidence Level (FR-12) */}
                        {msg.confidence_level && (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                              msg.confidence_level === 'high'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : msg.confidence_level === 'medium'
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : 'bg-rose-950 text-rose-300 border border-rose-800'
                            }`}
                          >
                            Confidence: {msg.confidence_level}
                          </span>
                        )}

                        {/* Self-Verification Status (FR-11) */}
                        {msg.verification_passed !== null && msg.verification_passed !== undefined && (
                          <span className="flex items-center text-[10px] text-emerald-400">
                            <ShieldCheck className="w-3 h-3 mr-1" />
                            Passage Self-Verified
                          </span>
                        )}
                      </div>
                    )}

                    {/* Content */}
                    <div className="whitespace-pre-line text-[13px] leading-relaxed">
                      {plainLanguageMode && msg.plain_language ? msg.plain_language : msg.content}
                    </div>

                    {/* Citations Footer (FR-10) */}
                    {!isUser && msg.citations && msg.citations.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-slate-800/80">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
                          <BookOpen className="w-3 h-3 text-emerald-400" />
                          <span>Document Citations & Traceability (FR-10)</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.citations.map((cite, cIdx) => (
                            <div
                              key={cIdx}
                              className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-emerald-300"
                            >
                              <span className="font-semibold text-white">Page {cite.page_number || 'N/A'}:</span>{' '}
                              <span className="text-slate-400">{cite.section_heading || 'Policy Clause'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {loading && (
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-xl bg-slate-800 text-emerald-400 border border-slate-700 flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-400 flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Classifying query and running vector search across policy facts...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={inputQuestion}
              onChange={(e) => setInputQuestion(e.target.value)}
              placeholder="Ask anything about your policy (e.g. room rent limit, waiting periods, ICU caps)..."
              disabled={loading}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={loading || !inputQuestion.trim()}
              className="p-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-md shadow-emerald-500/20"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
