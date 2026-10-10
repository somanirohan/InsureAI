import React, { useState, useEffect, useRef } from 'react';
import {
  Shield, ArrowRight, Lock, CheckCircle, ChevronRight,
  FileText, Brain, TrendingUp, AlertTriangle, X, Mail,
  User, Phone, Menu, DollarSign, Sparkles, CheckCircle2,
  AlertCircle, Check, Activity, Search, ArrowUpRight,
  ShieldCheck, Zap, Heart, Clock, HelpCircle, Layers,
  ExternalLink
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage, LanguageSelector } from '../../context/LanguageContext';
import { Spinner } from '../common/ui';
import GoogleLoginButton from '../auth/GoogleLoginButton';

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
  const { login, register, loginWithGoogle } = useAuth();

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
        className="fixed top-3 right-3 bottom-3 sm:top-5 sm:right-5 sm:bottom-5 z-50 flex flex-col rounded-[28px] sm:rounded-[36px] overflow-hidden animate-slide-in"
        style={{
          width: 'calc(100% - 24px)',
          maxWidth: '430px',
          background: '#07262b',
          border: '1.5px solid rgba(255,255,255,0.14)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-7 pt-7 pb-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#d2f57b] border-2 border-[#062327] flex items-center justify-center flex-shrink-0 p-1.5 shadow-sm">
              <img src="/favicon_io/apple-touch-icon.png" alt="InsurAI Logo" className="w-full h-full object-contain rounded-xl" />
            </div>
            <div>
              <p className="font-headline text-xl font-extrabold text-white tracking-tight leading-tight">InsurAI</p>
              <p className="text-xs text-[#a0c5c9] font-medium">Policy Intelligence</p>
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

          {/* Google Sign-in */}
          <div className="mb-5">
            <GoogleLoginButton
              label={isLogin ? 'Sign in with Google' : 'Sign up with Google'}
              onGoogleSuccess={loginWithGoogle}
              onError={err => setError(err)}
            />
          </div>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">or with email</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

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
  label = '',
  rotation = 0,
  className = '',
  style = {},
  animClass = '',
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
      <div className={`bg-white p-2 sm:p-2.5 rounded-2xl sm:rounded-3xl shadow-[0_16px_36px_rgba(6,35,39,0.18)] border border-black/[0.08] flex flex-col items-center ${animClass}`}>
        <div className="w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28 xl:w-32 xl:h-32 rounded-xl sm:rounded-2xl overflow-hidden bg-gray-100 flex items-center justify-center relative">
          <img
            src={imageSrc}
            alt={label || 'Sticker'}
            className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
            loading="eager"
          />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   TYPEWRITER HOOK FOR SCROLL REVEALS
   ───────────────────────────────────────────────────────────── */
function useTypewriter(fullText, speed = 32, active = false, startDelay = 200) {
  const [displayText, setDisplayText] = useState('');
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    if (!active) return;
    setDisplayText('');
    setIsDone(false);

    let idx = 0;
    const startTimer = setTimeout(() => {
      const interval = setInterval(() => {
        idx++;
        setDisplayText(fullText.slice(0, idx));
        if (idx >= fullText.length) {
          clearInterval(interval);
          setIsDone(true);
        }
      }, speed);

      return () => clearInterval(interval);
    }, startDelay);

    return () => clearTimeout(startTimer);
  }, [fullText, speed, active, startDelay]);

  return { displayText, isDone };
}

/* ─────────────────────────────────────────────────────────────
   INTERSECTION OBSERVER HOOK
   ───────────────────────────────────────────────────────────── */
function useInView(options = { threshold: 0.15 }) {
  const ref = useRef(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsInView(true);
      }
    }, options);

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [options]);

  return [ref, isInView];
}

/* ─────────────────────────────────────────────────────────────
   TUBELIGHT FLICKER SIGNATURE WORDMARK (INSURAI)
   Complete, stretched, deep petrol teal color (#07262b);
   flickers like an authentic tubelight on scroll and stays on!
   ───────────────────────────────────────────────────────────── */
function TubelightWordmark({ inView = false }) {
  const [hasIgnited, setHasIgnited] = useState(false);

  useEffect(() => {
    if (inView && !hasIgnited) {
      setHasIgnited(true);
    }
  }, [inView, hasIgnited]);

  return (
    <div className="relative select-none pointer-events-none w-full flex justify-center -mb-2 sm:-mb-4 md:-mb-6 pt-4 pb-1">
      <svg
        viewBox="0 0 1000 125"
        className={`w-full h-auto max-h-[130px] sm:max-h-[175px] lg:max-h-[210px] overflow-visible transition-all duration-300 ${
          hasIgnited ? 'tubelight-flicker-on' : 'tubelight-off'
        }`}
        style={{
          filter: hasIgnited ? 'drop-shadow(0 4px 22px rgba(7,38,43,0.18))' : 'none',
        }}
        aria-label="INSURAI"
      >
        <text
          x="500"
          y="100"
          textAnchor="middle"
          textLength="980"
          lengthAdjust="spacingAndGlyphs"
          fill="#07262b"
          className="font-headline font-black uppercase"
          style={{
            fontFamily: "'Syne', 'Plus Jakarta Sans', -apple-system, sans-serif",
            fontWeight: 800,
            fontSize: '114px',
          }}
        >
          INSURAI
        </text>
      </svg>
    </div>
  );
}


/* ─────────────────────────────────────────────────────────────
   CAROUSEL CARDS DATA (Infinite Right-to-Left loop)
   ───────────────────────────────────────────────────────────── */
const CAROUSEL_CARDS = [
  {
    id: 'vector-indexing',
    tag: 'Instant Vector Indexing',
    badge: '100% Parsed',
    title: 'Semantic OCR & Chunking',
    desc: 'Parses 60+ policy pages in seconds. Every clause, exclusion, and waiting period is indexed with mathematical precision.',
    visual: (
      <div className="rounded-2xl overflow-hidden border border-black/[0.08] bg-white p-3.5 shadow-sm">
        <div className="flex items-center justify-between text-[11px] font-mono text-gray-700 mb-2 font-bold">
          <span className="flex items-center gap-1.5 text-[#062327]">
            <FileText size={13} className="text-[#062327]" /> Star_Health_Optima.pdf
          </span>
          <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">100% Parsed</span>
        </div>
        <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
          <div className="bg-[#062327] h-full w-full rounded-full" />
        </div>
        <div className="mt-2.5 flex items-center justify-between text-[10px] text-gray-500 font-mono">
          <span>42 Embeddings Indexed</span>
          <span className="text-emerald-700 font-semibold">0 Hallucinations</span>
        </div>
      </div>
    ),
  },
  {
    id: 'clause-radar',
    tag: 'Trap Detection Radar',
    badge: 'Live Audit',
    title: 'Hidden Sub-Limit Scanner',
    desc: 'Surfaces 1% room-rent capping, co-pay traps, and disease-specific limits before you ever get admitted.',
    visual: (
      <div className="relative rounded-2xl overflow-hidden h-36 bg-[#e8f3f4] flex items-center justify-center">
        <img
          src="/images/scanner-3d.jpg"
          alt="3D clause audit scanner"
          className="w-full h-full object-cover"
        />
        <div className="absolute bottom-2.5 left-2.5 right-2.5 bg-white/95 backdrop-blur-md rounded-xl p-2 shadow-md border border-black/10 text-xs">
          <div className="flex items-center justify-between text-[10px] font-bold text-[#062327]">
            <span>Robotic Surgery</span>
            <span className="text-emerald-600 font-bold">100% Covered</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-gray-600 mt-1">
            <span>Room Rent Cap</span>
            <span className="text-amber-600 font-bold">1% Sub-Limit Flagged</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'deductible-calc',
    tag: 'Cost Simulation',
    badge: 'Instant Math',
    title: 'Out-of-Pocket Estimator',
    desc: 'Calculate exact hospital bill liabilities in advance with zero surprises on discharge day.',
    visual: (
      <div className="bg-white rounded-2xl p-3 border border-black/[0.08] shadow-sm space-y-2.5">
        <div className="flex items-center justify-between text-xs font-bold text-[#062327]">
          <span>Cardiac Angioplasty</span>
          <span className="font-mono text-emerald-700 font-bold">₹3,80,000</span>
        </div>
        <div className="w-full h-2.5 rounded-full overflow-hidden flex bg-gray-200">
          <div className="h-full bg-emerald-500" style={{ width: '85%' }} />
          <div className="h-full bg-amber-500" style={{ width: '15%' }} />
        </div>
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className="text-emerald-700 font-bold">Insurer: ₹3,24,000 (85%)</span>
          <span className="text-amber-700 font-bold">You: ₹56,000 (15%)</span>
        </div>
      </div>
    ),
  },
  {
    id: 'room-rent-trap',
    tag: 'Proportional Deduction',
    badge: 'Trap Alert',
    title: 'Room Rent Penalty Guard',
    desc: 'Avoid the dreaded proportional deduction clause where taking an expensive room cuts 40% of surgeon fees.',
    visual: (
      <div className="bg-amber-50 rounded-2xl p-3 border border-amber-200/80 shadow-sm">
        <div className="flex items-center gap-1.5 text-amber-800 font-bold text-xs mb-1">
          <AlertTriangle size={13} className="text-amber-600" />
          <span>Clause 4.1.B Flagged</span>
        </div>
        <p className="text-[11px] text-amber-900 leading-snug">
          Suite rooms trigger a <strong>37.5% proportional penalty</strong> on all doctor consultations.
        </p>
        <div className="mt-1.5 text-[10px] text-emerald-800 font-bold bg-emerald-100 px-2 py-0.5 rounded-md inline-block">
          Deluxe Room Safe (0% Penalty)
        </div>
      </div>
    ),
  },
  {
    id: 'cashless-network',
    tag: 'Hospital Verification',
    badge: '9,800+ Hospitals',
    title: 'Cashless Network Radar',
    desc: 'Instantly verify cashless admission status across Apollo, Max, Fortis, Manipal, and regional hospitals.',
    visual: (
      <div className="bg-white rounded-2xl p-3 border border-black/[0.08] shadow-sm space-y-1.5">
        <div className="flex items-center justify-between text-xs font-bold text-[#062327]">
          <span className="flex items-center gap-1.5"><Heart size={13} className="text-rose-500" /> Max Super Speciality</span>
          <span className="text-emerald-600 font-bold text-[10px] bg-emerald-50 px-2 py-0.5 rounded-full">Cashless Active</span>
        </div>
        <div className="flex items-center justify-between text-[10px] text-gray-500">
          <span>TPA Pre-Auth Average</span>
          <span className="font-bold text-[#062327]">24 Minutes</span>
        </div>
        <div className="w-full bg-emerald-500/20 h-1.5 rounded-full overflow-hidden">
          <div className="bg-emerald-500 h-full w-[95%] rounded-full" />
        </div>
      </div>
    ),
  },
  {
    id: 'verbatim-grounding',
    tag: 'Zero Hallucinations',
    badge: '99.8% Grounded',
    title: 'Direct Contract Citations',
    desc: 'Every answer references the exact page, section, and sub-clause with verbatim excerpt citations.',
    visual: (
      <div className="bg-teal-50/80 rounded-2xl p-3 border border-teal-200/60 shadow-sm">
        <div className="flex items-center justify-between text-[11px] font-mono text-[#062327] font-bold mb-1">
          <span>Page 38 · Section 3.2</span>
          <span className="text-teal-700 font-bold">Verbatim Match</span>
        </div>
        <p className="text-[11px] text-teal-900 italic leading-snug">
          "Pre-existing hypertension covered after 24 continuous renewal months."
        </p>
      </div>
    ),
  },
];

/* ─────────────────────────────────────────────────────────────
   MAIN CHAINLY-THEMED LANDING PAGE
   ───────────────────────────────────────────────────────────── */
export default function LandingPage({ onOpenSecurityModal }) {
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab]   = useState('login');

  // Hero scroll-driven zoom tracking
  const [heroProgress, setHeroProgress] = useState(0);
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });


  useEffect(() => {
    const handleScroll = () => {
      const zoomDistance = 220; // Snappy 220px scroll to reach full screen
      const p = Math.min(1, Math.max(0, window.scrollY / zoomDistance));
      setHeroProgress(p);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleMouseMove = (e) => {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    setMouseOffset({
      x: ((e.clientX - centerX) / centerX) * 12,
      y: ((e.clientY - centerY) / centerY) * 12,
    });
  };

  // Section 2 scroll reveal & typewriter
  const [section2Ref, section2InView] = useInView({ threshold: 0.18 });
  const { displayText: section2Heading, isDone: section2Done } = useTypewriter(
    'Get covered without holding 60 pages of fine print',
    30,
    section2InView
  );

  // Section 4 scroll reveal & typewriter
  const [section4Ref, section4InView] = useInView({ threshold: 0.15 });
  const { displayText: section4Heading, isDone: section4Done } = useTypewriter(
    'Make your insurance work for you',
    35,
    section4InView
  );

  const openAuth = (tab = 'login') => {
    setAuthTab(tab);
    setAuthOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#07262b] text-[#062327] font-display selection:bg-[#d2f57b] selection:text-[#062327] relative overflow-x-clip">

      {/* ══════════════════════════════════════════════════════
          HERO SECTION: STATIONARY STICKY CANVAS
          Starts as centered card box; zooms in quickly (~240px scroll) to take whole page.
          Stays stationary at top while Section 2 slides over it from bottom.
          ════════════════════════════════════════════════════ */}
      {/* ══════════════════════════════════════════════════════
          HERO SECTION: STATIONARY STICKY CANVAS
          Starts as centered card box; zooms in smoothly (~220px scroll) to fill page.
          Stays stationary at top while Section 2 slides over it from bottom.
          ════════════════════════════════════════════════════ */}
      <section
        className="sticky top-0 h-screen w-full z-10 flex items-center justify-center overflow-hidden bg-[#07262b] transition-[padding] duration-75"
        onMouseMove={handleMouseMove}
        style={{
          padding: `${Math.max(0, 24 * (1 - heroProgress * 1.05))}px`,
        }}
      >
        {/* Subtle background clover blooms in outer teal canvas */}
        <CloverBloom color="rgba(255,255,255,0.03)" size={420} className="-top-12 -left-20" />
        <CloverBloom color="rgba(255,255,255,0.025)" size={500} className="top-1/3 -right-24" />
        <CloverBloom color="rgba(255,255,255,0.03)" size={380} className="bottom-0 left-1/4" />

        {/* Master White Card Canvas that smoothly zooms in with scroll */}
        <div
          className="bg-[#ffffff] relative flex flex-col justify-between overflow-hidden transition-all duration-75 w-full h-full p-6 sm:p-8 lg:p-10"
          style={{
            maxWidth: heroProgress >= 0.98 ? '100vw' : '1540px',
            borderRadius: `${Math.max(0, 36 * (1 - heroProgress * 1.1))}px`,
            boxShadow: heroProgress >= 0.95 ? 'none' : '0 24px 60px rgba(0,0,0,0.30)',
            border: heroProgress >= 0.92 ? 'none' : '1px solid rgba(255,255,255,0.18)',
          }}
        >
          {/* Subtle inner card watermarks */}
          <CloverBloom color="rgba(6,35,39,0.02)" size={440} className="-top-20 -right-20" />
          <CloverBloom color="rgba(6,35,39,0.02)" size={500} className="bottom-10 -left-24" />

          {/* ── Top Navbar ── */}
          <header className="relative z-20 flex items-center justify-between pb-3 sm:pb-6 border-b border-black/[0.05] shrink-0">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-2xl bg-[#d2f57b] border-2 border-[#062327] flex items-center justify-center flex-shrink-0 p-1.5 shadow-sm"
              >
                <img src="/favicon_io/apple-touch-icon.png" alt="InsurAI Logo" className="w-full h-full object-contain rounded-xl" />
              </div>
              <div className="min-w-0 text-left">
                <p className="font-headline text-xl font-extrabold tracking-tight text-[#062327] truncate leading-tight">
                  InsurAI
                </p>
                <p className="text-xs text-[#558187] truncate font-medium">
                  Policy Intelligence
                </p>
              </div>
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
                <button
                  type="button"
                  onClick={onOpenSecurityModal}
                  className="px-3 py-1.5 rounded-full hover:bg-white/15 transition-colors cursor-pointer text-white flex items-center gap-1 uppercase tracking-wider text-xs font-bold"
                >
                  Security
                </button>
                <a href="#features" className="px-3 py-1.5 rounded-full hover:bg-white/15 transition-colors">
                  Resources
                </a>
              </nav>

              <button
                type="button"
                onClick={onOpenSecurityModal}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold transition-all cursor-pointer shadow-xs"
                title="Inspect OWASP Session Security & Cookies"
              >
                <Shield size={13} className="text-emerald-600" />
                <span className="hidden sm:inline">Security</span>
              </button>

              <LanguageSelector variant="compact" direction="down" />

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

          {/* ── Hero Center Content (Cleanly Centered, Protected From Card Collisions) ── */}
          <div className="relative z-20 my-auto py-6 sm:py-10 flex flex-col items-center text-center max-w-2xl lg:max-w-3xl mx-auto px-4">
            {/* Main Headline */}
            <h1 className="font-headline text-4xl sm:text-6xl md:text-7xl lg:text-[76px] font-extrabold tracking-tight text-[#062327] leading-[1.02] mb-5">
              Health Insurance<br className="hidden sm:inline" /> Made Simple
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg md:text-xl text-[#062327]/70 font-medium max-w-xl mx-auto leading-relaxed mb-7 sm:mb-9">
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
          </div>

          {/* ── 4 Orbiting Floating Cards (Symmetrically Placed on Outer Periphery: 2 Left, 2 Right. Never Overlapping) ── */}
          {/* Card 1: Top-Left */}
          <FloatingSticker
            imageSrc="/images/shield-3d.jpg"
            label="Zero Hidden Traps"
            rotation={-8}
            className="hidden lg:block top-20 xl:top-24 left-4 sm:left-6 xl:left-10 2xl:left-14 z-10"
            animClass="float-anim-1"
            style={{
              transform: `translate(${-heroProgress * 45 + mouseOffset.x * 0.8}px, ${-heroProgress * 25 + mouseOffset.y * 0.8}px) rotate(-8deg)`,
            }}
          />

          {/* Card 2: Bottom-Left (Separated by ~400px from top card, zero overlap) */}
          <FloatingSticker
            imageSrc="/images/scanner-3d.jpg"
            label="Clause Scanner"
            rotation={-10}
            className="hidden lg:block bottom-8 sm:bottom-10 left-4 sm:left-6 xl:left-10 2xl:left-14 z-10"
            animClass="float-anim-3"
            style={{
              transform: `translate(${-heroProgress * 45 + mouseOffset.x * 1.1}px, ${heroProgress * 20 + mouseOffset.y * 1.1}px) rotate(-10deg)`,
            }}
          />

          {/* Card 3: Top-Right */}
          <FloatingSticker
            imageSrc="/images/tokens-3d.jpg"
            label="Cashless Payouts"
            rotation={7}
            className="hidden lg:block top-20 xl:top-24 right-4 sm:right-6 xl:right-10 2xl:right-14 z-10"
            animClass="float-anim-2"
            style={{
              transform: `translate(${heroProgress * 45 + mouseOffset.x * 0.8}px, ${-heroProgress * 25 + mouseOffset.y * 0.8}px) rotate(7deg)`,
            }}
          />

          {/* Card 4: Bottom-Right (Verified Coverage 3D Policy Document) */}
          <FloatingSticker
            imageSrc="/images/policy-3d.jpg"
            label="Verified Coverage"
            rotation={9}
            className="hidden lg:block bottom-8 sm:bottom-10 right-4 sm:right-6 xl:right-10 2xl:right-14 z-10"
            animClass="float-anim-4"
            style={{
              transform: `translate(${heroProgress * 45 + mouseOffset.x * 1}px, ${heroProgress * 20 + mouseOffset.y * 1}px) rotate(9deg)`,
            }}
          />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          REST OF THE PAGE: SLIDES OVER THE STATIONARY HERO
          ════════════════════════════════════════════════════ */}
      <div className="relative z-20" style={{ marginTop: '260px' }}>
        {/* ══════════════════════════════════════════════════════
            FEATURE SECTION 1: DEEP PETROL TEAL CARD ON LIME CANVAS
            Slides over the hero section from bottom as user scrolls down.
            Text types itself in as it enters view.
            ════════════════════════════════════════════════════ */}
        <section
          ref={section2Ref}
          className="relative z-20 px-3 sm:px-6 lg:px-10 py-16 sm:py-24 bg-[#d7f49e] text-white rounded-t-[44px] sm:rounded-t-[56px] shadow-[0_-35px_80px_rgba(0,0,0,0.55)]"
        >
          {/* Repeating clover blooms in lime canvas */}
          <CloverBloom color="rgba(195, 235, 120, 0.5)" size={420} className="-top-16 left-8" />
          <CloverBloom color="rgba(195, 235, 120, 0.45)" size={480} className="bottom-0 right-10" />

          <div className="max-w-[1340px] mx-auto bg-[#07262b] rounded-[32px] sm:rounded-[44px] lg:rounded-[48px] p-8 sm:p-12 lg:p-16 relative shadow-[0_24px_60px_rgba(6,35,39,0.30)] border border-white/10 overflow-hidden">
            
            {/* Subtle floral watermark inside dark teal card */}
            <CloverBloom color="rgba(255,255,255,0.03)" size={500} className="-bottom-20 -left-20" />
            <CloverBloom color="rgba(255,255,255,0.025)" size={420} className="-top-20 -right-20" />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center relative z-10">
              
              {/* Left Content with Typewriter Heading */}
              <div className="lg:col-span-6 flex flex-col justify-center">
                <h2 className="font-headline text-3xl sm:text-5xl lg:text-6xl font-extrabold text-[#d2f57b] tracking-tight leading-[1.08] mb-6 min-h-[72px] sm:min-h-[120px]">
                  {section2Heading || (section2InView ? '' : 'Get covered without holding 60 pages of fine print')}
                  {!section2Done && <span className="typewriter-cursor text-[#d2f57b]">|</span>}
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
            FEATURE SECTION 2 (THIRD SECTION):
            Cards in an infinite marquee carousel going from right to left in a loop
            ════════════════════════════════════════════════════ */}
        <section id="features" className="relative px-3 sm:px-6 lg:px-10 py-16 sm:py-24 bg-[#07262b] overflow-hidden">
          
          {/* Subtle background blooms */}
          <CloverBloom color="rgba(255,255,255,0.03)" size={480} className="top-10 left-10" />
          <CloverBloom color="rgba(255,255,255,0.025)" size={420} className="bottom-10 right-10" />

          <div className="max-w-[1340px] mx-auto bg-[#ffffff] rounded-[32px] sm:rounded-[44px] lg:rounded-[48px] pt-8 sm:pt-14 pb-10 sm:pb-16 px-4 sm:px-10 lg:px-14 relative shadow-[0_24px_70px_rgba(0,0,0,0.30)] border border-black/10 overflow-hidden">
            
            {/* Section Header */}
            <div className="flex items-center gap-4 mb-4">
              <span className="text-xs font-mono font-bold tracking-widest text-[#062327]/50 uppercase">01-04</span>
            </div>

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 sm:mb-14">
              <div>
                <h2 className="font-headline text-3xl sm:text-5xl lg:text-6xl font-extrabold text-[#062327] tracking-tight">
                  Everything in<br className="hidden sm:inline" /> one place
                </h2>
              </div>
              <p className="text-base text-[#062327]/70 max-w-md font-medium leading-relaxed">
                From multi-page policy indexing to hospital room-rent calculators and direct clause chat — all grounded with zero hallucinations.
              </p>
            </div>

            {/* ── Infinite Marquee Carousel Track (Right to Left Loop) ── */}
            <div className="relative overflow-hidden w-full py-4 -mx-4 sm:-mx-10 lg:-mx-14 px-4 sm:px-10 lg:px-14">
              {/* Left Edge Fade Mask */}
              <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-16 sm:w-28 bg-gradient-to-r from-white via-white/80 to-transparent z-20" />
              
              {/* Right Edge Fade Mask */}
              <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-16 sm:w-28 bg-gradient-to-l from-white via-white/80 to-transparent z-20" />

              {/* Seamless looping carousel track (duplicated array for continuous 0% -> -50% loop) */}
              <div className="carousel-marquee-track flex gap-6 items-stretch">
                {[...CAROUSEL_CARDS, ...CAROUSEL_CARDS].map((card, idx) => (
                  <div
                    key={`${card.id}-${idx}`}
                    className="w-[330px] sm:w-[380px] shrink-0 bg-[#f5f8f8] hover:bg-[#edf5f5] rounded-3xl p-6 border border-black/[0.07] hover:border-[#062327]/25 transition-all duration-300 flex flex-col justify-between shadow-sm hover:shadow-xl hover:-translate-y-1.5 group select-none cursor-pointer"
                  >
                    <div>
                      {/* Top Tag & Badge Pill */}
                      <div className="flex items-center justify-between gap-2 mb-4">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#062327]/70 bg-white px-2.5 py-1 rounded-full border border-black/[0.06]">
                          {card.tag}
                        </span>
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/90 px-2.5 py-0.5 rounded-full">
                          {card.badge}
                        </span>
                      </div>

                      <h3 className="font-headline text-xl font-bold text-[#062327] mb-2 group-hover:text-[#0b4047] transition-colors">
                        {card.title}
                      </h3>
                      <p className="text-xs text-[#062327]/70 leading-relaxed mb-5">
                        {card.desc}
                      </p>
                    </div>

                    {/* Visual Content Block */}
                    <div className="mt-auto pt-2">
                      {card.visual}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Carousel Bottom Explore Row */}
            <div className="mt-8 pt-4 border-t border-black/[0.05] flex items-center justify-end">
              <button
                onClick={() => openAuth('register')}
                className="text-[#062327] font-bold hover:underline inline-flex items-center gap-1 cursor-pointer text-xs"
              >
                <span>Explore all features</span>
                <ArrowRight size={13} />
              </button>
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
            Text types itself in, and signature "INSURAI" flickers like a tubelight!
            ════════════════════════════════════════════════════ */}
        <section
          ref={section4Ref}
          className="relative px-3 sm:px-6 lg:px-10 py-16 sm:py-24 bg-[#d7f49e]"
        >
          {/* Clover watermarks in lime background */}
          <CloverBloom color="rgba(195, 235, 120, 0.55)" size={460} className="-top-10 left-10" />
          <CloverBloom color="rgba(195, 235, 120, 0.5)" size={480} className="bottom-0 right-10" />

          {/* Master Card with Giant Clipped Footer Typography */}
          <div className="max-w-[1340px] mx-auto bg-[#ffffff] rounded-[32px] sm:rounded-[44px] lg:rounded-[48px] pt-12 sm:pt-16 lg:pt-20 px-6 sm:px-12 lg:px-16 pb-0 relative shadow-[0_24px_60px_rgba(6,35,39,0.25)] border border-black/10 overflow-hidden flex flex-col justify-between">
            
            {/* Top CTA Module with Typewriter Headline */}
            <div className="text-center max-w-2xl mx-auto relative z-10 mb-8 sm:mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#062327]/[0.05] border border-[#062327]/15 text-[11px] font-extrabold tracking-wider uppercase text-[#062327] mb-6">
                <span>READY FOR COMPLETE PEACE OF MIND</span>
              </div>

              <h2 className="font-headline text-3xl sm:text-5xl lg:text-6xl font-extrabold text-[#062327] tracking-tight leading-[1.05] mb-8 min-h-[48px] sm:min-h-[75px]">
                {section4Heading || (section4InView ? '' : 'Make your insurance work for you')}
                {!section4Done && <span className="typewriter-cursor text-[#062327]">|</span>}
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

            {/* ── Giant Signature Wordmark: Complete, Stretched & Tubelight Flicker ── */}
            <TubelightWordmark inView={section4InView} />


          </div>
        </section>
      </div>
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
