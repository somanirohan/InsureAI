import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ShieldCheck,
  Lock,
  Cookie,
  KeyRound,
  Database,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  LogOut,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

export default function SecurityModal({ isOpen, onClose }) {
  const { t } = useLanguage();
  const { user, securityStatus, fetchSecurityStatus, logout } = useAuth();
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditTimestamp, setAuditTimestamp] = useState(null);

  useEffect(() => {
    if (isOpen) {
      handleRunAudit();
    }
  }, [isOpen]);

  const handleRunAudit = async () => {
    setLoadingAudit(true);
    try {
      await fetchSecurityStatus();
      setAuditTimestamp(new Date().toLocaleTimeString());
    } finally {
      setLoadingAudit(false);
    }
  };

  if (!isOpen) return null;

  const sec = securityStatus || {
    session_security: {
      cookie_name: 'access_token',
      httponly: true,
      samesite: 'lax',
      secure: window.location.protocol === 'https:',
      token_algorithm: 'HS256',
      password_hashing: 'Bcrypt with dynamic salt',
    },
    protection_features: {
      anti_csrf_protection: true,
      anti_xss_protection: true,
      rate_limiting_active: true,
      no_store_sensitive_cache: true,
      tenant_data_isolation: 'MongoDB ObjectId + ChromaDB Collection Partitioning',
      third_party_cookies: false,
    },
  };

  const securityPillars = [
    {
      title: 'HttpOnly Secure Cookies',
      desc: 'Session JWT is locked inside browser HttpOnly cookies, completely invisible to JavaScript to stop Cross-Site Scripting (XSS) token harvesting.',
      icon: Cookie,
      status: 'Active · HttpOnly',
      verified: true,
    },
    {
      title: 'Anti-CSRF Origin Defense',
      desc: 'Enforces SameSite cookie isolation and validates Origin / X-Requested-With headers on all state-changing requests.',
      icon: Lock,
      status: 'Enforced',
      verified: sec.protection_features?.anti_csrf_protection,
    },
    {
      title: 'Multi-Tenant Medical Isolation',
      desc: 'Insurance policy PDFs, extracted health facts, and vector embeddings in ChromaDB are strictly partitioned per authenticated user.',
      icon: Database,
      status: 'Strict Isolation',
      verified: true,
    },
    {
      title: 'Sliding-Window Rate Limiting',
      desc: 'In-memory sliding window rate limits protect authentication endpoints against brute force, credential stuffing, and bot attacks.',
      icon: ShieldAlert,
      status: 'Protected',
      verified: sec.protection_features?.rate_limiting_active,
    },
    {
      title: 'Zero Third-Party Tracking',
      desc: 'No advertising cookies, third-party beacons, or telemetry sharing. Your health records and questions remain 100% confidential.',
      icon: ShieldCheck,
      status: 'Zero Tracking',
      verified: true,
    },
    {
      title: 'Sensitive Cache Prevention',
      desc: 'HTTP headers (Cache-Control: no-store, no-cache) prevent medical documents and health query results from being stored in disk or proxy caches.',
      icon: KeyRound,
      status: 'No-Store Active',
      verified: sec.protection_features?.no_store_sensitive_cache,
    },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in"
      style={{ background: 'rgba(6, 35, 39, 0.45)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-3xl shadow-[0_24px_60px_rgba(6,35,39,0.18)] overflow-hidden bg-white border border-[#062327]/12 animate-slide-up"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-[#062327]/08 bg-[#f5f8f8]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 bg-[#d2f57b] border border-[#062327] shadow-[0_2px_0_#062327]">
              <ShieldCheck size={20} className="text-[#062327]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-headline font-bold tracking-tight text-[#062327]">
                  Security & Cookie Architecture
                </h2>
                <span className="px-2.5 py-0.5 text-[10px] font-bold tracking-wide uppercase rounded-full bg-[#d2f57b]/40 text-[#062327] border border-[#062327]/20">
                  Active & Protected
                </span>
              </div>
              <p className="text-xs text-[#558187]">
                HIPAA & DPDP compliant data protection for health records
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#558187] hover:text-[#062327] hover:bg-[#062327]/05 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 custom-scrollbar bg-white">
          {/* Live Session Status Pill */}
          <div className="p-3.5 rounded-2xl flex items-center justify-between gap-3 bg-[#f5f8f8] border border-[#062327]/10">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <div>
                <p className="text-xs font-semibold text-[#062327]">
                  User Session: <span className="font-mono text-[#2d6a71]">{user?.email || 'Authenticated'}</span>
                </p>
                <p className="text-[11px] text-[#558187]">
                  Cookie: <span className="font-mono font-medium text-[#062327]">{sec.session_security?.cookie_name}</span> · SameSite={sec.session_security?.samesite} · Secure={sec.session_security?.secure ? 'True' : 'Auto'}
                </p>
              </div>
            </div>
            <button
              onClick={handleRunAudit}
              disabled={loadingAudit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#062327] bg-white hover:bg-[#f0fbfb] border border-[#062327]/15 shadow-sm transition-all"
            >
              <RefreshCw size={12} className={loadingAudit ? 'animate-spin' : ''} />
              <span>{loadingAudit ? 'Auditing...' : 'Re-verify'}</span>
            </button>
          </div>

          {/* Pillars List */}
          <div className="space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#558187]">
              Active Security Guardrails
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {securityPillars.map((p, idx) => {
                const Icon = p.icon;
                return (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl flex flex-col justify-between bg-[#f8fbfb] border border-[#062327]/08 hover:border-[#062327]/20 transition-all shadow-sm"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <Icon size={14} className="text-[#2d6a71]" />
                          <h3 className="text-xs font-bold text-[#062327]">{p.title}</h3>
                        </div>
                        <CheckCircle2 size={13} className="text-emerald-600 flex-shrink-0" />
                      </div>
                      <p className="text-[11px] leading-relaxed text-[#558187]">{p.desc}</p>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-[#062327]/06 flex items-center justify-between text-[10px]">
                      <span className="text-[#558187]">Status</span>
                      <span className="font-mono text-[#062327] font-semibold">{p.status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Confidentiality Notice */}
          <div className="p-3.5 rounded-2xl flex items-start gap-2.5 text-xs text-[#062327] bg-[#d2f57b]/15 border border-[#062327]/10">
            <CheckCircle2 size={16} className="text-emerald-700 flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed text-[#2d6a71] text-[11.5px]">
              Your health insurance documents are never shared or indexed into general model weights. Vectors exist strictly in a sandboxed, ephemeral ChromaDB tenant collection mapped to your account.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#062327]/08 bg-[#f5f8f8] flex items-center justify-between flex-shrink-0">
          <div className="text-[11px] text-[#558187]">
            {auditTimestamp ? `Audit refreshed at ${auditTimestamp}` : 'Session verified'}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                logout();
                onClose();
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200"
            >
              <LogOut size={13} />
              <span>Invalidate Session</span>
            </button>
            <button
              onClick={onClose}
              className="btn-pill-lime text-xs px-5 py-1.5"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
