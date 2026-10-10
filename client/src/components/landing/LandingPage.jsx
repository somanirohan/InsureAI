import React, { useState, useEffect } from 'react';
import {
  Shield, ArrowRight, Lock, CheckCircle, ChevronRight,
  FileText, Brain, TrendingUp, AlertTriangle, X, Mail,
  User, Phone, Menu, DollarSign, Sparkles, CheckCircle2,
  AlertCircle, Check, Activity, Search, ArrowUpRight,
  ShieldCheck, Zap, Heart, Clock, HelpCircle, Layers,
  ExternalLink
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Spinner } from '../common/ui';

/* ─────────────────────────────────────────────────────────────
   CLOVER WATERMARK BLOOM
   Matches the organic geometric floral background of Chainly
   ───────────────────────────────────────────────────────────── */
function CloverBloom({ color = 'rgba(255,255,255,0.035)', size = 320, className = '', style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={`pointer-events-none select-none absolute ${className}`}
      style={style}
      aria-hidden="true"
    >
      <circle cx="100" cy="65" r="46" fill={color} />
      <circle cx="135" cy="100" r="46" fill={color} />
      <circle cx="100" cy="135" r="46" fill={color} />
      <circle cx="65" cy="100" r="46" fill={color} />
      <circle cx="100" cy="100" r="38" fill={color} />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────
   HAND-DRAWN DOODLE ARROW
   ───────────────────────────────────────────────────────────── */
function DoodleArrow({ className = '', style = {} }) {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" className={className} style={style} aria-hidden="true">
      <path
        d="M6 10 C18 14, 32 20, 30 34 M30 34 L22 32 M30 34 L33 26"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────
   INLINE AUTH DRAWER (Styled in Chainly Petrol Teal & Lime)
   ───────────────────────────────────────────────────────────── */
function AuthDrawer({ onClose, defaultTab = 'login' }) {
  const [isLogin, setIsLogin]   = useState(defaultTab === 'login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail]       = useState('alex@insurai.com');
  const [password, setPassword] = useState('Shield@2024');
  const [phone, setPhone]       = useState('');
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const { login, register }     = useAuth();

  const switchTab = (toLogin) => {
    setIsLogin(toLogin);
    setError(null);
    if (toLogin) {
      setEmail('alex@insurai.com');
      setPassword('Shield@2024');
    } else {
      setEmail('');
      setPassword('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isLogin) await login(email, password);
      else await register(fullName, email, password, phone);
    } catch (err) {
      const isNet = err.code === 'ERR_NETWORK' || err.message?.includes('Network Error');
      setError(isNet
        ? 'Cannot reach the backend on port 5001. Run: npm run server'
        : err.response?.data?.error || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const fieldStyle = {
    background: '#04181b',
    border: '1.5px solid rgba(255,255,255,0.12)',
    borderRadius: '16px',
    padding: '13px 14px 13px 40px',
    fontSize: '14px',
    fontFamily: 'inherit',
    color: '#ffffff',
    width: '100%',
    outline: 'none',
    transition: 'all 0.2s ease',
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 transition-opacity"
        style={{ background: 'rgba(5, 23, 27, 0.72)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
        onClick={onClose}
      />
      <div
        className="fixed top-0 right-0 bottom-0 z-50 flex flex-col animate-slide-in"
        style={{
          width: '100%',
          maxWidth: '430px',
          background: '#07262b',
          borderLeft: '1.5px solid rgba(255,255,255,0.12)',
          boxShadow: '-24px 0 80px rgba(0,0,0,0.65)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-7 pt-7 pb-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#d2f57b] flex items-center justify-center p-2 text-[#062327] font-black text-lg border-2 border-[#062327]">
              <Shield size={20} className="stroke-[2.5]" />
            </div>
            <div>
              <p className="font-headline text-lg font-bold text-white tracking-tight leading-tight">InsurAI</p>
              <p className="text-xs text-[#a0c5c9]">Policy Intelligence</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={19} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-7 py-6">
          <div className="mb-6">
            <h2 className="font-headline text-2xl font-bold text-white mb-1.5">
              {isLogin ? 'Welcome back' : 'Create account'}
            </h2>
            <p className="text-sm text-[#b2d5d9] leading-relaxed">
              {isLogin ? 'Sign in to access your grounded policy intelligence.' : 'Start analyzing your health insurance in minutes.'}
            </p>
          </div>

          {/* Toggle pill */}
          <div className="flex p-1 mb-6 rounded-full bg-[#051c20] border border-white/10">
            {['Sign In', 'Register'].map((label, i) => {
              const active = i === 0 ? isLogin : !isLogin;
              return (
                <button
                  key={label}
                  id={`drawer-tab-${i === 0 ? 'login' : 'register'}`}
                  type="button"
                  onClick={() => switchTab(i === 0)}
                  className={`flex-1 py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    active
                      ? 'bg-[#d2f57b] text-[#062327] shadow-sm'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {error && (
            <div className="flex items-start gap-2.5 mb-5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs leading-relaxed">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form id="drawer-auth-form" onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#9fc4c8] mb-1.5">Full Name</label>
                <div className="relative">
                  <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                  <input
                    id="drawer-fullname"
                    type="text"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Alex Morgan"
                    style={fieldStyle}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#9fc4c8] mb-1.5">Email address</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                <input
                  id="drawer-email"
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={fieldStyle}
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#9fc4c8] mb-1.5">Password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                <input
                  id="drawer-password"
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={fieldStyle}
                />
              </div>
            </div>

            {!isLogin && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#9fc4c8] mb-1.5">Phone (optional)</label>
                <div className="relative">
                  <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                  <input
                    id="drawer-phone"
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    style={fieldStyle}
                  />
                </div>
              </div>
            )}

            <div className="pt-2">
              <button
                id="drawer-submit"
                type="submit"
                disabled={loading}
                className="w-full btn-pill-lime py-3.5 px-5 flex items-center justify-center gap-2 text-sm font-bold shadow-md cursor-pointer disabled:opacity-50"
              >
                {loading && <Spinner size={15} />}
                <span>{loading ? (isLogin ? 'Signing in…' : 'Creating account…') : (isLogin ? 'Sign In' : 'Create Account')}</span>
                {!loading && <ArrowRight size={16} />}
              </button>
            </div>
          </form>

          {isLogin && (
            <p className="text-center mt-5 text-[11px] text-[#7da7ac] leading-relaxed">
              Pre-filled with demo account. Backend runs on port 5001.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   FLOATING POLAROID / STICKER CARD (Hero orbits)
   ───────────────────────────────────────────────────────────── */
function FloatingSticker({
  imageSrc,
  label,
  rotation = 0,
  className = '',
  style = {},
  badgeColor = '#062327',
  badgeTextColor = '#ffffff',
}) {
  return (
    <div
      className={`tilted-sticker absolute select-none cursor-pointer ${className}`}
      style={{
        transform: `rotate(${rotation}deg)`,
        '--rot': `${rotation}deg`,
        ...style,
      }}
    >
      <div className="bg-white p-2 sm:p-2.5 rounded-2xl sm:rounded-3xl shadow-[0_16px_36px_rgba(6,35,39,0.18)] border border-black/[0.08] flex flex-col items-center">
        <div className="w-20 h-20 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-xl sm:rounded-2xl overflow-hidden bg-gray-100 flex items-center justify-center relative">
          <img
            src={imageSrc}
            alt={label}
            className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
            loading="eager"
          />
        </div>
        <div className="mt-2 sm:mt-2.5 mb-0.5">
          <span
            className="inline-block px-2.5 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold tracking-tight border border-black/10"
            style={{ background: badgeColor, color: badgeTextColor }}
          >
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   MAIN CHAINLY-THEMED LANDING PAGE
   ───────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab]   = useState('login');

  const openAuth = (tab = 'login') => {
    setAuthTab(tab);
    setAuthOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#07262b] text-[#062327] font-display selection:bg-[#d2f57b] selection:text-[#062327] relative overflow-x-clip">

      {/* ══════════════════════════════════════════════════════
          HERO MASTER CARD (Bone-White Card on Deep Petrol Canvas)
          ════════════════════════════════════════════════════ */}
      <section className="relative px-3 sm:px-6 lg:px-10 pt-4 sm:pt-6 pb-12 sm:pb-20">
        
        {/* Subtle background clover blooms in outer teal canvas */}
        <CloverBloom color="rgba(255,255,255,0.03)" size={420} className="-top-12 -left-20" />
        <CloverBloom color="rgba(255,255,255,0.025)" size={500} className="top-1/3 -right-24" />
        <CloverBloom color="rgba(255,255,255,0.03)" size={380} className="bottom-0 left-1/4" />

        {/* Master White Card Canvas */}
        <div className="max-w-[1340px] mx-auto bg-[#ffffff] rounded-[32px] sm:rounded-[44px] lg:rounded-[48px] p-6 sm:p-10 lg:p-14 relative shadow-[0_24px_70px_rgba(0,0,0,0.35)] border border-white/20 min-h-[720px] sm:min-h-[800px] flex flex-col justify-between overflow-hidden">
          
          {/* Subtle inner card watermarks */}
          <CloverBloom color="rgba(6,35,39,0.02)" size={440} className="-top-20 -right-20" />
          <CloverBloom color="rgba(6,35,39,0.02)" size={500} className="bottom-10 -left-24" />

          {/* ── Top Navbar ── */}
          <header className="relative z-20 flex items-center justify-between pb-8 sm:pb-12 border-b border-black/[0.05]">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-[#062327] flex items-center justify-center p-2 text-[#d2f57b]">
                <Shield size={22} className="stroke-[2.5]" />
              </div>
              <span className="font-headline text-2xl sm:text-3xl font-extrabold tracking-tight text-[#062327]">
                InsurAI
              </span>
            </div>

            {/* Center & Right Navigation Capsule */}
            <div className="flex items-center gap-2 sm:gap-3">
              <nav className="hidden md:flex items-center gap-1 bg-[#062327] px-4 py-2 rounded-full text-white text-xs font-bold tracking-wider uppercase">
                <a href="#features" className="px-3 py-1.5 rounded-full hover:bg-white/15 transition-colors">
                  Product
                </a>
                <a href="#features" className="px-3 py-1.5 rounded-full hover:bg-white/15 transition-colors">
                  Solutions
                </a>
                <a href="#how-it-works" className="px-3 py-1.5 rounded-full hover:bg-white/15 transition-colors">
                  Security
                </a>
                <a href="#features" className="px-3 py-1.5 rounded-full hover:bg-white/15 transition-colors">
                  Resources
                </a>
              </nav>

              <button
                id="nav-getstarted"
                onClick={() => openAuth('register')}
                className="bg-[#062327] text-white hover:bg-[#0e3b43] text-xs sm:text-sm font-bold tracking-tight px-4 sm:px-5 py-2.5 sm:py-3 rounded-full flex items-center gap-2 transition-all shadow-sm group cursor-pointer"
              >
                <span>Get Started</span>
                <span className="w-5 h-5 rounded-full bg-[#d2f57b] text-[#062327] flex items-center justify-center group-hover:translate-x-0.5 transition-transform">
                  <ArrowRight size={11} className="stroke-[3]" />
                </span>
              </button>
            </div>
          </header>

          {/* ── Hero Center Content with Orbiting Stickers ── */}
          <div className="relative z-10 my-auto py-12 sm:py-16 md:py-20 flex flex-col items-center text-center">
            
            {/* Top Pill Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#062327]/[0.05] border border-[#062327]/15 text-[11px] sm:text-xs font-extrabold tracking-wider uppercase text-[#062327] mb-6">
              <span>PDF IN, CLARITY OUT</span>
            </div>

            {/* Main Headline (Ultra Bold Wide Chainly Style) */}
            <h1 className="font-headline text-4xl sm:text-6xl md:text-7xl lg:text-[80px] font-extrabold tracking-tight text-[#062327] leading-[1.02] max-w-4xl mb-6">
              Health Insurance<br className="hidden sm:inline" /> Made Simple
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg md:text-xl text-[#062327]/70 font-medium max-w-xl mx-auto leading-relaxed mb-8 sm:mb-10">
              Upload your policy PDF, avoid fine-print traps, and receive AI-grounded claim answers instantly in plain English.
            </p>

            {/* Primary Action Button */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button
                id="hero-cta-accept"
                onClick={() => openAuth('register')}
                className="btn-pill-lime px-8 py-3.5 sm:py-4 text-sm sm:text-base font-bold flex items-center gap-2.5 shadow-[0_6px_0_#062327] cursor-pointer"
              >
                <span>Analyze Policy</span>
                <span className="w-5 h-5 rounded-full bg-[#062327] text-[#d2f57b] flex items-center justify-center">
                  <ArrowRight size={11} className="stroke-[3]" />
                </span>
              </button>
            </div>

            {/* ── 5 Orbiting Floating Polaroid / Sticker Cards ── */}
            {/* Card 1: Top-Left (Tilted -8deg) */}
            <FloatingSticker
              imageSrc="/images/shield-3d.jpg"
              label="Zero Hidden Traps"
              rotation={-8}
              className="hidden lg:block top-6 left-6 xl:left-12"
              badgeColor="#062327"
              badgeTextColor="#ffffff"
            />

            {/* Card 2: Top-Right (Tilted +7deg) */}
            <FloatingSticker
              imageSrc="/images/cute-sticker.jpg"
              label="Stress-Free Claims"
              rotation={7}
              className="hidden lg:block top-10 right-6 xl:right-14"
              badgeColor="#062327"
              badgeTextColor="#ffffff"
            />

            {/* Card 3: Middle-Left (Tilted -10deg) */}
            <FloatingSticker
              imageSrc="/images/scanner-3d.jpg"
              label="Clause Scanner"
              rotation={-10}
              className="hidden md:block bottom-16 sm:bottom-24 left-2 sm:left-6 xl:left-12"
              badgeColor="#062327"
              badgeTextColor="#ffffff"
            />

            {/* Card 4: Bottom-Left (Tilted -12deg) */}
            <FloatingSticker
              imageSrc="/images/sleep-peace.jpg"
              label="Secure Coverage"
              rotation={-12}
              className="hidden lg:block bottom-4 left-1/4"
              badgeColor="#062327"
              badgeTextColor="#ffffff"
            />

            {/* Card 5: Bottom-Right (Tilted +9deg) */}
            <FloatingSticker
              imageSrc="/images/tokens-3d.jpg"
              label="Instant Settlement"
              rotation={9}
              className="hidden md:block bottom-10 right-2 sm:right-6 xl:right-16"
              badgeColor="#062327"
              badgeTextColor="#ffffff"
            />
          </div>

          {/* Bottom Trust Row */}
          <div className="relative z-10 pt-6 border-t border-black/[0.05] flex flex-wrap items-center justify-between gap-4 text-xs font-semibold text-[#062327]/60">
            <div className="flex items-center gap-6">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={15} className="text-emerald-600" /> 100% Cashless Hospitals
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={15} className="text-emerald-600" /> Verbatim PDF Citations
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={15} className="text-emerald-600" /> Private & Secure OCR
              </span>
            </div>
            <div className="flex items-center gap-2 text-[#062327]">
              <span>Trusted across 4,200+ Indian health policies</span>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          FEATURE SECTION 1: DEEP PETROL TEAL CARD ON LIME CANVAS
          Matches Chainly Image 2 ("Get paid without holding any crypto")
          ════════════════════════════════════════════════════ */}
      <section className="relative px-3 sm:px-6 lg:px-10 py-16 sm:py-24 bg-[#d7f49e] text-white">
        
        {/* Repeating clover blooms in lime canvas */}
        <CloverBloom color="rgba(195, 235, 120, 0.5)" size={420} className="-top-16 left-8" />
        <CloverBloom color="rgba(195, 235, 120, 0.45)" size={480} className="bottom-0 right-10" />

        <div className="max-w-[1340px] mx-auto bg-[#07262b] rounded-[32px] sm:rounded-[44px] lg:rounded-[48px] p-8 sm:p-12 lg:p-16 relative shadow-[0_24px_60px_rgba(6,35,39,0.30)] border border-white/10 overflow-hidden">
          
          {/* Subtle floral watermark inside dark teal card */}
          <CloverBloom color="rgba(255,255,255,0.03)" size={500} className="-bottom-20 -left-20" />
          <CloverBloom color="rgba(255,255,255,0.025)" size={420} className="-top-20 -right-20" />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center relative z-10">
            
            {/* Left Content */}
            <div className="lg:col-span-6 flex flex-col justify-center">
              <h2 className="font-headline text-3xl sm:text-5xl lg:text-6xl font-extrabold text-[#d2f57b] tracking-tight leading-[1.08] mb-6">
                Get covered without holding 60 pages of fine print
              </h2>
              <p className="text-base sm:text-lg text-[#b8dfe3] font-normal leading-relaxed mb-8 max-w-lg">
                Your hospital shouldn’t surprise you with proportional deductions. InsurAI decodes every waiting period, room-rent cap, and medical exclusion into plain English.
              </p>

              <div className="flex items-center gap-4">
                <button
                  id="section1-accepting-btn"
                  onClick={() => openAuth('register')}
                  className="btn-pill-lime px-7 py-3.5 text-sm font-bold flex items-center gap-2 cursor-pointer"
                >
                  <span>Start Accepting Clarity</span>
                  <ArrowRight size={15} />
                </button>
              </div>

              {/* Hand-Drawn Doodle Annotation */}
              <div className="mt-8 flex items-center gap-3">
                <DoodleArrow className="text-[#d2f57b] rotate-12" />
                <span className="font-handwriting text-2xl text-[#d2f57b] tracking-wide">
                  Policy jargon for them, cash savings for you!
                </span>
              </div>
            </div>

            {/* Right Visual with Overlapping Floating Card */}
            <div className="lg:col-span-6 relative">
              {/* Main Photo: Person Working on Laptop */}
              <div className="rounded-[28px] sm:rounded-[36px] overflow-hidden border-2 border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative">
                <img
                  src="/images/person-laptop.jpg"
                  alt="Young professional reviewing policy clarity"
                  className="w-full h-[360px] sm:h-[420px] object-cover"
                />
              </div>

              {/* Overlapping Floating Polaroid Sticker Card */}
              <div className="absolute -bottom-6 -left-4 sm:-bottom-8 sm:-left-8 select-none z-20">
                <div className="bg-white p-2.5 sm:p-3 rounded-2xl sm:rounded-3xl shadow-[0_20px_45px_rgba(0,0,0,0.4)] border border-black/10 -rotate-6 transition-transform hover:rotate-0 duration-300 cursor-pointer">
                  <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-xl sm:rounded-2xl overflow-hidden bg-[#062327]">
                    <img
                      src="/images/scanner-3d.jpg"
                      alt="Instant Clause Detection Scanner"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="mt-2 text-center">
                    <span className="inline-block px-3 py-1 rounded-full bg-[#062327] text-white text-[11px] font-bold">
                      Instant Clause Scan
                    </span>
                  </div>
                </div>
              </div>

              {/* Overlapping Floating Grounding Badge */}
              <div className="absolute top-6 -right-3 sm:-right-6 bg-[#062327]/90 backdrop-blur-md border border-[#d2f57b]/30 rounded-2xl p-3.5 shadow-xl text-xs text-white max-w-[210px]">
                <div className="flex items-center gap-1.5 text-[#d2f57b] font-bold mb-1">
                  <Sparkles size={13} />
                  <span>99.8% Grounding</span>
                </div>
                <p className="text-[11px] text-gray-300 leading-snug">
                  Section 4.2 cited directly from uploaded PDF.
                </p>
              </div>

            </div>

          </div>

        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          FEATURE SECTION 2: WHITE MASTER CARD ("Everything in one place")
          Matches Chainly Image 3 with Module Grid & Floating Overlays
          ════════════════════════════════════════════════════ */}
      <section id="features" className="relative px-3 sm:px-6 lg:px-10 py-16 sm:py-24 bg-[#07262b]">
        
        {/* Subtle background blooms */}
        <CloverBloom color="rgba(255,255,255,0.03)" size={480} className="top-10 left-10" />
        <CloverBloom color="rgba(255,255,255,0.025)" size={420} className="bottom-10 right-10" />

        <div className="max-w-[1340px] mx-auto bg-[#ffffff] rounded-[32px] sm:rounded-[44px] lg:rounded-[48px] p-6 sm:p-12 lg:p-16 relative shadow-[0_24px_70px_rgba(0,0,0,0.30)] border border-black/10 overflow-hidden">
          
          {/* Section Header with index tag */}
          <div className="flex items-center gap-4 mb-4">
            <span className="text-xs font-mono font-bold tracking-widest text-[#062327]/50 uppercase">01-04</span>
          </div>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 sm:mb-16">
            <div>
              <h2 className="font-headline text-3xl sm:text-5xl lg:text-6xl font-extrabold text-[#062327] tracking-tight">
                Everything in<br className="hidden sm:inline" /> one place
              </h2>
            </div>
            <p className="text-base text-[#062327]/70 max-w-md font-medium leading-relaxed">
              From multi-page policy indexing to hospital room-rent calculators and direct clause chat — all grounded with zero hallucinations.
            </p>
          </div>

          {/* ── 3-Column Visual Feature Showcase ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 items-start">
            
            {/* Card 1: Accept & Scan PDF */}
            <div className="bg-[#f5f8f8] rounded-3xl p-5 sm:p-6 border border-black/[0.06] flex flex-col justify-between min-h-[380px] relative overflow-hidden group">
              <div className="relative z-10">
                {/* Floating Notification Pill */}
                <div className="bg-white rounded-2xl p-3.5 shadow-md border border-black/[0.06] flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-[#d2f57b] flex items-center justify-center text-[#062327]">
                    <FileText size={20} className="stroke-[2.5]" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#062327]">Accept Policy PDF</h4>
                    <p className="text-[11px] text-gray-500">Scan 60+ pages in seconds</p>
                  </div>
                </div>

                <h3 className="font-headline text-xl font-bold text-[#062327] mb-2">
                  Instant Vector Indexing
                </h3>
                <p className="text-xs text-[#062327]/70 leading-relaxed mb-4">
                  Chunks legal text semantically with OCR precision so no exclusion or sub-limit is overlooked.
                </p>
              </div>

              {/* Bottom preview snippet */}
              <div className="rounded-2xl overflow-hidden border border-black/[0.08] bg-white p-3 shadow-inner">
                <div className="flex items-center justify-between text-[11px] font-mono text-gray-600 mb-2">
                  <span>Bajaj_Allianz_Health.pdf</span>
                  <span className="text-emerald-600 font-bold">100% Parsed</span>
                </div>
                <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                  <div className="bg-[#062327] h-full w-full rounded-full" />
                </div>
              </div>
            </div>

            {/* Card 2: 3D Tokens Showcase with Overlapping Transactions Pill */}
            <div className="bg-[#f5f8f8] rounded-3xl p-5 sm:p-6 border border-black/[0.06] flex flex-col justify-between min-h-[380px] relative overflow-hidden group">
              <div className="relative z-10">
                <h3 className="font-headline text-xl font-bold text-[#062327] mb-2">
                  Real-Time Clause Radar
                </h3>
                <p className="text-xs text-[#062327]/70 leading-relaxed mb-4">
                  Surfaces hidden traps: 1% room rent penalties, co-payments, and disease-specific sub-limits.
                </p>
              </div>

              {/* Center 3D Tokens Visual */}
              <div className="relative my-2 rounded-2xl overflow-hidden h-44 bg-[#e8f3f4] flex items-center justify-center">
                <img
                  src="/images/tokens-3d.jpg"
                  alt="3D pastel insurance tokens"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />

                {/* Overlaid Notification Pill: Recent Audit */}
                <div className="absolute bottom-3 left-3 right-3 bg-white/95 backdrop-blur-md rounded-2xl p-2.5 shadow-lg border border-black/10 text-xs">
                  <div className="flex items-center justify-between text-[11px] font-bold text-[#062327] mb-1">
                    <span>Recent Claim Audits</span>
                    <ArrowUpRight size={13} />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-600">
                    <span className="font-medium">Robotic Surgery</span>
                    <span className="font-bold text-emerald-600">100% Covered</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-600">
                    <span className="font-medium">Room Rent Cap</span>
                    <span className="font-bold text-amber-600">1% Sub-Limit</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Out-of-Pocket Cost Estimator */}
            <div className="bg-[#f5f8f8] rounded-3xl p-5 sm:p-6 border border-black/[0.06] flex flex-col justify-between min-h-[380px] relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="font-headline text-xl font-bold text-[#062327] mb-2">
                  Deductible & Cost Calculator
                </h3>
                <p className="text-xs text-[#062327]/70 leading-relaxed mb-4">
                  Simulate medical procedures before hospital admission to calculate out-of-pocket liabilities.
                </p>

                {/* Interactive Split Gauge */}
                <div className="bg-white rounded-2xl p-4 border border-black/[0.08] shadow-sm space-y-3 mt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#062327]">Cardiac Angioplasty</span>
                    <span className="text-xs font-mono font-bold text-[#062327]">₹3,80,000 Total</span>
                  </div>

                  <div className="w-full h-3 rounded-full overflow-hidden flex bg-gray-200">
                    <div className="h-full bg-emerald-500" style={{ width: '85%' }} />
                    <div className="h-full bg-amber-500" style={{ width: '15%' }} />
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-emerald-700 font-bold">Insurer: ₹3,24,000 (85%)</span>
                    <span className="text-amber-700 font-bold">You: ₹56,000 (15%)</span>
                  </div>

                  <div className="pt-2 border-t border-black/[0.05] flex items-center justify-between text-[11px] text-gray-500">
                    <span>Single AC Private Room</span>
                    <span className="text-emerald-600 font-semibold">Zero deduction</span>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button
                  onClick={() => openAuth('register')}
                  className="w-full btn-pill-dark py-2.5 text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Simulate Your Procedure</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          HOW IT WORKS SECTION: 3 CLEAN NUMBERED STEPS
          ════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="relative px-3 sm:px-6 lg:px-10 py-16 sm:py-24 bg-[#07262b] text-white">
        
        <CloverBloom color="rgba(255,255,255,0.03)" size={500} className="top-1/4 -right-16" />

        <div className="max-w-[1340px] mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-14 sm:mb-20">
            <span className="text-xs font-mono font-bold tracking-widest text-[#d2f57b] uppercase">Step-by-step workflow</span>
            <h2 className="font-headline text-3xl sm:text-5xl font-extrabold text-white tracking-tight mt-2 mb-4">
              From PDF upload to verified claim answers
            </h2>
            <p className="text-sm sm:text-base text-[#b8dfe3]">
              Simple, transparent, and completely grounded in your insurance company's official policy wording.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {[
              {
                num: '01',
                title: 'Upload your policy PDF',
                desc: 'Upload any health insurance policy (Star, HDFC Ergo, Care, Bajaj Allianz). Text is vectorized in under 30 seconds.',
                badge: 'Instant OCR'
              },
              {
                num: '02',
                title: 'AI scans critical clauses',
                desc: 'Sub-limits, room-rent categories, waiting periods, and modern robotic procedures are tagged automatically.',
                badge: 'Trap Detection'
              },
              {
                num: '03',
                title: 'Ask questions & simulate bills',
                desc: 'Chat in plain English. Every response cites the exact page number and contract clause with verbatim quotes.',
                badge: 'Zero Hallucinations'
              }
            ].map(step => (
              <div
                key={step.num}
                className="bg-[#051d21] rounded-3xl p-7 border border-white/10 flex flex-col justify-between hover:border-[#d2f57b]/40 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <span className="w-12 h-12 rounded-2xl bg-[#d2f57b] text-[#062327] font-headline font-black text-lg flex items-center justify-center">
                      {step.num}
                    </span>
                    <span className="px-3 py-1 rounded-full bg-white/10 text-xs text-[#d2f57b] font-bold">
                      {step.badge}
                    </span>
                  </div>
                  <h3 className="font-headline text-xl font-bold text-white mb-3">
                    {step.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#a2cbcf] leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          FOOTER / CTA SECTION: WHITE MASTER CARD ON LIME CANVAS
          Matches Chainly Image 4 ("Make crypto work for you" + Giant Wordmark)
          ════════════════════════════════════════════════════ */}
      <section className="relative px-3 sm:px-6 lg:px-10 py-16 sm:py-24 bg-[#d7f49e]">
        
        {/* Clover watermarks in lime background */}
        <CloverBloom color="rgba(195, 235, 120, 0.55)" size={460} className="-top-10 left-10" />
        <CloverBloom color="rgba(195, 235, 120, 0.5)" size={480} className="bottom-0 right-10" />

        {/* Master Card with Giant Clipped Footer Typography */}
        <div className="max-w-[1340px] mx-auto bg-[#ffffff] rounded-[32px] sm:rounded-[44px] lg:rounded-[48px] pt-12 sm:pt-16 lg:pt-20 px-6 sm:px-12 lg:px-16 pb-0 relative shadow-[0_24px_60px_rgba(6,35,39,0.25)] border border-black/10 overflow-hidden flex flex-col justify-between">
          
          {/* Top CTA Module */}
          <div className="text-center max-w-2xl mx-auto relative z-10 mb-14 sm:mb-20">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#062327]/[0.05] border border-[#062327]/15 text-[11px] font-extrabold tracking-wider uppercase text-[#062327] mb-6">
              <span>READY FOR COMPLETE PEACE OF MIND</span>
            </div>

            <h2 className="font-headline text-3xl sm:text-5xl lg:text-6xl font-extrabold text-[#062327] tracking-tight leading-[1.05] mb-8">
              Make your insurance work for you
            </h2>

            {/* Lime Pill CTA */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative">
              <button
                id="footer-getstarted-btn"
                onClick={() => openAuth('register')}
                className="btn-pill-lime px-8 py-4 text-sm sm:text-base font-bold flex items-center gap-2 shadow-[0_6px_0_#062327] cursor-pointer"
              >
                <span>Get Started Free</span>
                <ArrowRight size={16} />
              </button>

              {/* Doodle annotation arrow pointing to the button */}
              <div className="hidden sm:flex items-center gap-2 absolute -right-40 top-0">
                <DoodleArrow className="text-[#062327] rotate-[-45deg]" />
                <span className="font-handwriting text-2xl text-[#062327] font-bold">
                  Start analyzing today!
                </span>
              </div>
            </div>
          </div>

          {/* Middle Footer Navigation & Socials */}
          <div className="relative z-10 border-t border-black/[0.06] pt-8 pb-10 flex flex-col md:flex-row items-center justify-between gap-6">
            <p className="text-xs sm:text-sm text-[#062327]/70 font-medium max-w-sm text-center md:text-left">
              Health policy clarity made simple for modern families. Upload your policy, verify hospital terms, and protect your hard-earned money.
            </p>

            {/* Social Icons Pill */}
            <div className="flex items-center gap-2.5">
              {/* X / Twitter */}
              <a
                href="#"
                aria-label="X (Twitter)"
                className="w-9 h-9 rounded-full bg-[#062327] text-white flex items-center justify-center hover:bg-[#d2f57b] hover:text-[#062327] transition-all"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
              {/* Instagram */}
              <a
                href="#"
                aria-label="Instagram"
                className="w-9 h-9 rounded-full bg-[#062327] text-white flex items-center justify-center hover:bg-[#d2f57b] hover:text-[#062327] transition-all"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                  <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
                </svg>
              </a>
              {/* LinkedIn */}
              <a
                href="#"
                aria-label="LinkedIn"
                className="w-9 h-9 rounded-full bg-[#062327] text-white flex items-center justify-center hover:bg-[#d2f57b] hover:text-[#062327] transition-all"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                </svg>
              </a>
              {/* GitHub */}
              <a
                href="#"
                aria-label="GitHub"
                className="w-9 h-9 rounded-full bg-[#062327] text-white flex items-center justify-center hover:bg-[#d2f57b] hover:text-[#062327] transition-all"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
              </a>
            </div>
          </div>

          {/* ── Giant Signature Wordmark Clipped at the Bottom ── */}
          {/* Matches the massive "Chainly" text at the floor of the Dribbble card */}
          <div className="relative select-none pointer-events-none w-full overflow-hidden flex justify-center -mb-4 sm:-mb-8 md:-mb-12">
            <span
              className="font-headline font-black text-[#07262b] text-[80px] sm:text-[140px] md:text-[200px] lg:text-[250px] leading-[0.78] tracking-tighter uppercase whitespace-nowrap opacity-95 transition-all"
              style={{
                textShadow: '0 4px 20px rgba(7,38,43,0.15)'
              }}
            >
              INSURAI
            </span>
          </div>

        </div>
      </section>

      {/* ── Auth Slide-in Drawer ── */}
      {authOpen && (
        <AuthDrawer
          onClose={() => setAuthOpen(false)}
          defaultTab={authTab}
        />
      )}

    </div>
  );
}
