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
      <div className="bg-white text-[#062327] rounded-3xl border border-[#062327]/12 shadow-[0_12px_36px_rgba(6,35,39,0.12)] p-4.5 flex flex-col gap-3 relative">
        {/* Close Button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3.5 right-3.5 text-[#558187] hover:text-[#062327] p-1 rounded-lg hover:bg-[#062327]/05 transition-colors"
          aria-label="Close notice"
        >
          <X size={15} />
        </button>

        {/* Content */}
        <div className="pr-6">
          <h4 className="text-sm font-headline font-bold text-[#062327] tracking-tight">
            Cookie & Privacy Notice
          </h4>
          <p className="text-xs text-[#558187] mt-1.5 leading-relaxed">
            We use essential secure session cookies to keep your account safe and maintain your login state. We do not use third-party marketing or advertising trackers.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2.5 border-t border-[#062327]/08 mt-0.5">
          <button
            type="button"
            onClick={onOpenSecurityModal}
            className="text-xs font-semibold text-[#2d6a71] hover:text-[#062327] underline underline-offset-2 transition-colors"
          >
            Security details
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDismiss}
              className="px-3 py-1.5 text-xs font-semibold text-[#558187] hover:text-[#062327] rounded-full hover:bg-[#062327]/05 transition-colors"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={handleAccept}
              className="btn-pill-lime text-xs px-3.5 py-1.5"
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

