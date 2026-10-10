import React from 'react';
import { ShieldAlert, ArrowLeft, Home, HelpCircle } from 'lucide-react';
import { LiquidBlob } from './LiquidBlob';

export default function NotFoundPage() {
  const handleGoHome = () => {
    window.location.href = '/';
  };

  return (
    <div
      className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 text-[#062327] overflow-hidden select-none font-sans"
      style={{ background: '#f4f7f7' }}
    >
      {/* ── Ambient Radial Glows ── */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at 15% 10%, rgba(210,245,123,0.35) 0%, transparent 45%),
            radial-gradient(ellipse at 85% 85%, rgba(210,245,123,0.25) 0%, transparent 40%),
            radial-gradient(ellipse at 50% 50%, rgba(6,35,39,0.03) 0%, transparent 70%)
          `,
        }}
      />

      {/* ── Background Clover Watermark ── */}
      <div className="fixed -top-16 -right-16 pointer-events-none opacity-20" aria-hidden>
        <svg width="460" height="460" viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="65" r="46" fill="rgba(6,35,39,0.05)" />
          <circle cx="135" cy="100" r="46" fill="rgba(6,35,39,0.05)" />
          <circle cx="100" cy="135" r="46" fill="rgba(6,35,39,0.05)" />
          <circle cx="65" cy="100" r="46" fill="rgba(6,35,39,0.05)" />
          <circle cx="100" cy="100" r="38" fill="rgba(6,35,39,0.05)" />
        </svg>
      </div>

      {/* ── Liquid Blob Accent (bottom-left) ── */}
      <div
        aria-hidden
        className="fixed pointer-events-none"
        style={{
          left: '-8%',
          bottom: '-12%',
          width: 'clamp(320px, 45vw, 600px)',
          height: 'clamp(320px, 45vw, 600px)',
          zIndex: 0,
          opacity: 0.28,
        }}
      >
        <LiquidBlob className="w-full h-full" />
      </div>

      {/* ── 404 Glass Card Container ── */}
      <div className="relative z-10 w-full max-w-xl mx-auto text-center px-6 py-10 sm:py-14 sm:px-12 rounded-3xl bg-white/80 backdrop-blur-xl border border-[#062327]/10 shadow-[0_20px_60px_-15px_rgba(6,35,39,0.08)]">
        
        {/* Animated Badge & Icon */}
        <div className="inline-flex items-center justify-center mb-6 relative">
          <div className="w-20 h-20 rounded-2xl bg-[#d2f57b] border-2 border-[#062327] flex items-center justify-center shadow-lg relative group transition-transform duration-300 hover:scale-105">
            <ShieldAlert className="w-10 h-10 text-[#062327]" />
          </div>
          <span className="absolute -top-2 -right-3 px-2 py-0.5 rounded-full text-[11px] font-black tracking-wider uppercase bg-[#062327] text-[#d2f57b] shadow-sm">
            404
          </span>
        </div>

        {/* Big 404 Heading */}
        <h1 className="text-6xl sm:text-7xl font-extrabold tracking-tight text-[#062327] mb-2 font-display">
          404
        </h1>

        <h2 className="text-xl sm:text-2xl font-bold text-[#062327] mb-3">
          Policy or Page Not Found
        </h2>

        <p className="text-sm sm:text-base text-[#558187] max-w-md mx-auto mb-8 leading-relaxed">
          The requested insurance route or resource does not exist or may have been relocated. Let&apos;s get you back on track.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-8">
          <button
            onClick={handleGoHome}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#062327] text-[#d2f57b] font-bold text-sm transition-all hover:bg-[#0a353b] hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Go to Dashboard
          </button>

          <button
            onClick={() => window.history.back()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#f0f4f4] text-[#062327] font-semibold text-sm transition-all hover:bg-[#e2e9e9] active:translate-y-0 cursor-pointer border border-[#062327]/10"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>

        {/* Helpful Links Footer */}
        <div className="pt-6 border-t border-[#062327]/10 flex flex-wrap items-center justify-center gap-6 text-xs text-[#558187]">
          <a
            href="/health"
            className="inline-flex items-center gap-1.5 hover:text-[#062327] transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            System Health Check
          </a>
          <span className="text-[#062327]/20">•</span>
          <button
            onClick={handleGoHome}
            className="inline-flex items-center gap-1 hover:text-[#062327] transition-colors cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            InsurAI Support
          </button>
        </div>

      </div>
    </div>
  );
}
