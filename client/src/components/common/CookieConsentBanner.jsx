import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export default function CookieConsentBanner({ onOpenSecurityModal }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('insureai_cookie_consent');
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 800);
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
      aria-label="Cookie & Privacy Notice"
      className="fixed bottom-5 right-5 left-5 sm:left-auto sm:max-w-sm z-50 animate-slide-up"
    >
      <div className="bg-white text-[#0f172a] rounded-xl border border-slate-200/90 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.15),0_4px_12px_rgba(0,0,0,0.08)] p-4 flex flex-col gap-3 relative">
        {/* Close Button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 p-1 rounded-md transition-colors"
          aria-label="Close notice"
        >
          <X size={15} />
        </button>

        {/* Content */}
        <div className="pr-6">
          <h4 className="text-sm font-semibold text-slate-900 tracking-tight">
            Cookie & Privacy Notice
          </h4>
          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
            We use essential secure session cookies to keep your account safe and maintain your login state. We do not use third-party marketing or advertising trackers.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-0.5">
          <button
            type="button"
            onClick={onOpenSecurityModal}
            className="text-xs font-medium text-slate-600 hover:text-slate-900 underline underline-offset-2 transition-colors"
          >
            Security details
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDismiss}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={handleAccept}
              className="px-3.5 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-xs transition-colors"
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

