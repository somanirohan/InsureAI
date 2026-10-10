import React, { useState, useEffect } from 'react';
import { ShieldCheck, Cookie, Lock, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export default function CookieConsentBanner({ onOpenSecurityModal }) {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('insureai_cookie_consent');
    if (!consent) {
      // Delay slightly for smooth entrance animation
      const timer = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('insureai_cookie_consent', 'accepted');
    setVisible(false);
  };

  const handleDismiss = () => {
    localStorage.setItem('insureai_cookie_consent', 'dismissed');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Cookie & Security Notice"
      className="fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-md z-40 animate-slide-up"
    >
      <div
        className="p-4 rounded-2xl shadow-2xl backdrop-blur-xl flex flex-col gap-3 relative"
        style={{
          background: 'rgba(13, 13, 23, 0.94)',
          border: '1px solid rgba(200, 169, 110, 0.25)',
          boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.8), 0 0 25px rgba(200, 169, 110, 0.12)',
        }}
      >
        {/* Close icon */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300 p-1 rounded-lg transition-colors"
          aria-label="Dismiss cookie notice"
        >
          <X size={14} />
        </button>

        {/* Header with security pill */}
        <div className="flex items-start gap-3 pr-6">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{
              background: 'linear-gradient(135deg, rgba(200,169,110,0.20), rgba(40,180,100,0.15))',
              border: '1px solid rgba(200,169,110,0.30)',
            }}
          >
            <ShieldCheck size={16} style={{ color: '#e8c97e' }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold text-zinc-100 tracking-tight">
                Data Security & Cookie Notice
              </h4>
              <span
                className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                style={{
                  background: 'rgba(40,180,100,0.15)',
                  color: '#4ade80',
                  border: '1px solid rgba(40,180,100,0.25)',
                }}
              >
                Zero Trackers
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
              InsureAI uses essential, encrypted <span className="text-zinc-200 font-medium">HttpOnly cookies</span> to safeguard your sensitive medical insurance data against XSS and CSRF. We do not use third-party marketing or tracking cookies.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-1 border-t border-white/[0.06]">
          <button
            onClick={onOpenSecurityModal}
            className="text-[11px] font-medium text-amber-300/90 hover:text-amber-200 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors"
          >
            Security Details
          </button>
          <div className="flex-1" />
          <button
            onClick={handleAccept}
            className="btn btn-primary px-3.5 py-1.5 text-xs font-medium rounded-xl gap-1.5 shadow-sm"
          >
            <span>Accept & Secure</span>
          </button>
        </div>
      </div>
    </div>
  );
}
