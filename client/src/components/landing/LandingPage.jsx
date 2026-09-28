import React, { useState, useEffect } from 'react';
import {
  Shield, ArrowRight, Zap, Lock, CheckCircle, ChevronRight,
  FileText, Brain, TrendingUp, AlertTriangle, X, Mail,
  User, Phone, Menu, DollarSign, GitCompare,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Spinner } from '../common/ui';
import { LiquidBlob, Starfield } from '../common/LiquidBlob';

/* ─────────────────────────────────────────────────────────────
   INLINE AUTH DRAWER
   Slides in from the right; dummy credentials pre-filled
   ───────────────────────────────────────────────────────────── */
function AuthDrawer({ onClose, defaultTab = 'login' }) {
  const [isLogin, setIsLogin] = useState(defaultTab === 'login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail]       = useState('alex@medshield.ai');
  const [password, setPassword] = useState('Shield@2024');
  const [phone, setPhone]       = useState('');
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const { login, register }     = useAuth();

  // Reset credentials when switching tabs
  const switchTab = (toLogin) => {
    setIsLogin(toLogin);
    setError(null);
    if (toLogin) {
      setEmail('alex@medshield.ai');
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
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: '12px',
    padding: '12px 14px 12px 38px',
    fontSize: '14px',
    fontFamily: 'inherit',
    color: '#f0f0f8',
    width: '100%',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    letterSpacing: '-0.01em',
  };

  const handleFieldFocus = e => {
    e.target.style.borderColor = 'rgba(200,169,110,0.50)';
    e.target.style.boxShadow   = '0 0 0 3px rgba(200,169,110,0.10)';
  };
  const handleFieldBlur  = e => {
    e.target.style.borderColor = 'rgba(255,255,255,0.09)';
    e.target.style.boxShadow   = 'none';
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,4,0.70)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className="fixed top-0 right-0 bottom-0 z-50 flex flex-col animate-slide-in"
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'rgba(7,7,18,0.98)',
          borderLeft: '1px solid rgba(255,255,255,0.07)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          boxShadow: '-32px 0 100px rgba(0,0,0,0.70)',
        }}
      >
        {/* Drawer header */}
        <div
          className="flex items-center justify-between px-8 pt-8 pb-5"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0 p-0.5"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(200,169,110,0.30)',
                boxShadow: '0 0 16px rgba(200,169,110,0.15)',
              }}
            >
              <img src="/favicon_io/apple-touch-icon.png" alt="MedShield Logo" className="w-full h-full object-contain rounded-lg" />
            </div>
            <div>
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#f0f0f8', letterSpacing: '-0.02em' }}>MedShield</p>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.01em' }}>Policy Intelligence</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              color: 'rgba(255,255,255,0.30)',
              padding: '8px',
              borderRadius: '10px',
              transition: 'all 0.15s',
              lineHeight: 1,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#f0f0f8'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.30)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <X size={17} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-8 py-7">

          {/* Headline */}
          <div className="mb-7">
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#f0f0f8', letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: '6px' }}>
              {isLogin ? 'Welcome back' : 'Create account'}
            </h2>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.38)', letterSpacing: '-0.01em', lineHeight: 1.6 }}>
              {isLogin
                ? 'Sign in to access your policy intelligence dashboard.'
                : 'Get started with AI-powered insurance analysis.'}
            </p>
          </div>

          {/* Tab toggle */}
          <div
            className="flex p-1 mb-6 rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            {['Sign In', 'Register'].map((label, i) => {
              const active = i === 0 ? isLogin : !isLogin;
              return (
                <button
                  key={label}
                  id={`drawer-tab-${i === 0 ? 'login' : 'register'}`}
                  type="button"
                  onClick={() => switchTab(i === 0)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    fontSize: '13px',
                    fontWeight: active ? 600 : 400,
                    borderRadius: '14px',
                    border: active ? '1px solid rgba(200,169,110,0.28)' : '1px solid transparent',
                    background: active ? 'rgba(200,169,110,0.12)' : 'transparent',
                    color: active ? '#e8c97e' : 'rgba(255,255,255,0.35)',
                    transition: 'all 0.2s',
                    letterSpacing: '-0.01em',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Error */}
          {error && (
            <div
              className="flex items-start gap-2.5 mb-5 p-4 rounded-xl"
              style={{ background: 'rgba(220,60,60,0.07)', border: '1px solid rgba(220,60,60,0.20)', color: '#f07070', fontSize: '12px', lineHeight: 1.6 }}
            >
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form id="drawer-auth-form" onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {!isLogin && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(255,255,255,0.30)', marginBottom: '8px' }}>
                    Full Name
                  </label>
                  <div style={{ position: 'relative' }}>
                    <User size={13} style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.22)', pointerEvents: 'none' }} />
                    <input
                      id="drawer-fullname"
                      type="text"
                      required
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="Your full name"
                      style={fieldStyle}
                      onFocus={handleFieldFocus}
                      onBlur={handleFieldBlur}
                    />
                  </div>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(255,255,255,0.30)', marginBottom: '8px' }}>
                  Email address
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={13} style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.22)', pointerEvents: 'none' }} />
                  <input
                    id="drawer-email"
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    style={fieldStyle}
                    onFocus={handleFieldFocus}
                    onBlur={handleFieldBlur}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(255,255,255,0.30)', marginBottom: '8px' }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={13} style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.22)', pointerEvents: 'none' }} />
                  <input
                    id="drawer-password"
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    style={fieldStyle}
                    onFocus={handleFieldFocus}
                    onBlur={handleFieldBlur}
                  />
                </div>
              </div>

              {!isLogin && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(255,255,255,0.30)', marginBottom: '8px' }}>
                    Phone <span style={{ textTransform: 'none', fontWeight: 400, color: 'rgba(255,255,255,0.20)' }}>(optional)</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Phone size={13} style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.22)', pointerEvents: 'none' }} />
                    <input
                      id="drawer-phone"
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      style={{ ...fieldStyle, paddingLeft: '38px' }}
                      onFocus={handleFieldFocus}
                      onBlur={handleFieldBlur}
                    />
                  </div>
                </div>
              )}

              <div style={{ paddingTop: '6px' }}>
                <button
                  id="drawer-submit"
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '14px',
                    borderRadius: '16px',
                    fontSize: '14px',
                    fontWeight: 600,
                    letterSpacing: '-0.01em',
                    fontFamily: 'inherit',
                    border: 'none',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    background: 'linear-gradient(135deg, #f0d898, #c8a96e)',
                    color: '#1a1000',
                    boxShadow: '0 4px 24px rgba(200,169,110,0.32)',
                    opacity: loading ? 0.65 : 1,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { if (!loading) { e.currentTarget.style.boxShadow='0 8px 32px rgba(200,169,110,0.50)'; e.currentTarget.style.transform='translateY(-1px)'; }}}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow='0 4px 24px rgba(200,169,110,0.32)'; e.currentTarget.style.transform='translateY(0)'; }}
                >
                  {loading && <Spinner size={14} />}
                  <span>{loading ? (isLogin ? 'Signing in…' : 'Creating account…') : (isLogin ? 'Sign In' : 'Create Account')}</span>
                  {!loading && <ArrowRight size={14} />}
                </button>
              </div>
            </div>
          </form>

          {/* Dummy account note */}
          {isLogin && (
            <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '11px', color: 'rgba(255,255,255,0.18)', lineHeight: 1.6 }}>
              Pre-filled with a demo account. Backend must be running on port 5001.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   FEATURE CARD
   ───────────────────────────────────────────────────────────── */
function FeatureCard({ icon: Icon, title, desc, accent, delay = '0s' }) {
  return (
    <div
      className="rounded-2xl p-6 animate-fade-in"
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.065)',
        backdropFilter: 'blur(12px)',
        transition: 'all 0.28s ease',
        animationDelay: delay,
        cursor: 'default',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background   = 'rgba(255,255,255,0.048)';
        e.currentTarget.style.border       = '1px solid rgba(200,169,110,0.22)';
        e.currentTarget.style.transform    = 'translateY(-5px)';
        e.currentTarget.style.boxShadow    = '0 20px 50px rgba(0,0,0,0.38)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background   = 'rgba(255,255,255,0.025)';
        e.currentTarget.style.border       = '1px solid rgba(255,255,255,0.065)';
        e.currentTarget.style.transform    = 'translateY(0)';
        e.currentTarget.style.boxShadow    = 'none';
      }}
    >
      <div
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '18px',
          background: accent
            ? 'linear-gradient(135deg, rgba(200,169,110,0.20), rgba(200,169,110,0.07))'
            : 'rgba(255,255,255,0.055)',
          border: accent
            ? '1px solid rgba(200,169,110,0.32)'
            : '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <Icon size={17} style={{ color: accent ? '#c8a96e' : 'rgba(255,255,255,0.50)' }} />
      </div>
      <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#f0f0f8', letterSpacing: '-0.02em', marginBottom: '8px' }}>
        {title}
      </h3>
      <p style={{ fontSize: '13px', lineHeight: 1.7, color: 'rgba(255,255,255,0.38)', letterSpacing: '-0.005em' }}>
        {desc}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   MAIN LANDING PAGE
   ───────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const [authOpen, setAuthOpen]     = useState(false);
  const [authTab, setAuthTab]       = useState('login');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [scrolled, setScrolled]     = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const openAuth = (tab = 'login') => {
    setAuthTab(tab);
    setAuthOpen(true);
  };

  /* ── nav link items ── */
  const navLinks = ['Features', 'How it works'];

  return (
    <div className="min-h-screen" style={{ background: '#07070f', color: '#f0f0f8' }}>
      <Starfield count={110} />

      {/* Ambient nebula glow */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at 8% 45%, rgba(55,38,155,0.20) 0%, transparent 55%),
            radial-gradient(ellipse at 92% 12%, rgba(110,72,18,0.16) 0%, transparent 48%),
            radial-gradient(ellipse at 55% 90%, rgba(28,18,88,0.28) 0%, transparent 58%)
          `,
        }}
      />

      {/* ══════════════════════════════════════════════════
          DYNAMIC ISLAND NAVBAR
          ════════════════════════════════════════════════ */}
      {/* ── Outer shell: always full-width, padding creates the vertical lift ── */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          display: 'flex',
          justifyContent: 'center',
          padding: scrolled ? '12px 24px' : '0 24px',
          pointerEvents: 'none',
          /* padding is animatable, so the lift is smooth in both directions */
          transition: 'padding 0.48s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {/* ── Inner nav: all changed props are numeric → fully animatable ── */}
        <nav
          style={{
            width: '100%',
            maxWidth: scrolled ? '660px' : '1120px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pointerEvents: 'all',
            borderRadius: scrolled ? '999px' : '0px',
            background: scrolled ? 'rgba(8,8,20,0.88)' : 'rgba(0,0,0,0)',
            border: scrolled
              ? '1px solid rgba(255,255,255,0.10)'
              : '1px solid rgba(255,255,255,0)',
            backdropFilter: scrolled ? 'blur(28px)' : 'blur(0px)',
            WebkitBackdropFilter: scrolled ? 'blur(28px)' : 'blur(0px)',
            boxShadow: scrolled
              ? '0 8px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)'
              : '0 0px 0px rgba(0,0,0,0)',
            padding: scrolled ? '8px 10px 8px 18px' : '20px 0',
            gap: scrolled ? '6px' : '0px',
            /* Every property above is numeric — smooth in both directions */
            transition: [
              'max-width 0.48s cubic-bezier(0.34,1.56,0.64,1)',
              'border-radius 0.48s cubic-bezier(0.34,1.56,0.64,1)',
              'background 0.40s ease',
              'border-color 0.40s ease',
              'backdrop-filter 0.40s ease',
              '-webkit-backdrop-filter 0.40s ease',
              'box-shadow 0.40s ease',
              'padding 0.48s cubic-bezier(0.34,1.56,0.64,1)',
              'gap 0.48s cubic-bezier(0.34,1.56,0.64,1)',
            ].join(', '),
          }}
        >
          {/* Logo */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: scrolled ? '30px' : '32px',
                height: scrolled ? '30px' : '32px',
                borderRadius: scrolled ? '999px' : '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(200,169,110,0.35)',
                boxShadow: '0 0 14px rgba(200,169,110,0.18)',
                transition: 'all 0.5s cubic-bezier(0.34,1.56,0.64,1)',
                flexShrink: 0,
                overflow: 'hidden',
                padding: '2px',
              }}
            >
              <img src="/favicon_io/apple-touch-icon.png" alt="MedShield Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: scrolled ? '999px' : '7px' }} />
            </div>
            <span
              style={{
                fontSize: scrolled ? '13px' : '14px',
                fontWeight: 650,
                color: '#f0f0f8',
                letterSpacing: '-0.02em',
                transition: 'all 0.3s ease',
              }}
            >
              MedShield
            </span>
          </button>

          {/* Centre links — hide on mobile */}
          <div
            className="hidden md:flex"
            style={{
              alignItems: 'center',
              gap: scrolled ? '4px' : '32px',
              transition: 'gap 0.4s ease',
              ...(scrolled ? { flex: 1, justifyContent: 'center' } : {}),
            }}
          >
            {navLinks.map(link => (
              <a
                key={link}
                href={`#${link.toLowerCase().replace(/ /g, '-')}`}
                style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'rgba(255,255,255,0.50)',
                  textDecoration: 'none',
                  letterSpacing: '-0.01em',
                  padding: scrolled ? '6px 14px' : '6px 4px',
                  borderRadius: '999px',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { e.currentTarget.style.color='#f0f0f8'; if (scrolled) e.currentTarget.style.background='rgba(255,255,255,0.07)'; }}
                onMouseLeave={e => { e.currentTarget.style.color='rgba(255,255,255,0.50)'; e.currentTarget.style.background='transparent'; }}
              >
                {link}
              </a>
            ))}
          </div>

          {/* Right CTAs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <button
              id="nav-signin"
              className="hidden md:flex"
              onClick={() => openAuth('login')}
              style={{
                alignItems: 'center',
                fontSize: '13px',
                fontWeight: 500,
                color: 'rgba(255,255,255,0.55)',
                background: 'transparent',
                border: 'none',
                borderRadius: '999px',
                padding: '8px 14px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                letterSpacing: '-0.01em',
                transition: 'all 0.18s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { e.currentTarget.style.color='#f0f0f8'; e.currentTarget.style.background='rgba(255,255,255,0.07)'; }}
              onMouseLeave={e => { e.currentTarget.style.color='rgba(255,255,255,0.55)'; e.currentTarget.style.background='transparent'; }}
            >
              Sign In
            </button>
            <button
              id="nav-getstarted"
              onClick={() => openAuth('register')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: 650,
                letterSpacing: '-0.01em',
                fontFamily: 'inherit',
                background: 'linear-gradient(135deg, #f0d898, #c8a96e)',
                color: '#1a1000',
                border: 'none',
                borderRadius: '999px',
                padding: scrolled ? '8px 18px' : '9px 20px',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(200,169,110,0.30)',
                transition: 'all 0.22s ease',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow='0 6px 24px rgba(200,169,110,0.50)'; e.currentTarget.style.transform='translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow='0 4px 16px rgba(200,169,110,0.30)'; e.currentTarget.style.transform='translateY(0)'; }}
            >
              Get Started <ArrowRight size={12} />
            </button>

            {/* Mobile menu button */}
            <button
              className="md:hidden"
              onClick={() => setMobileMenu(!mobileMenu)}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: '10px',
                padding: '7px',
                color: 'rgba(255,255,255,0.60)',
                cursor: 'pointer',
                marginLeft: '4px',
              }}
            >
              {mobileMenu ? <X size={17} /> : <Menu size={17} />}
            </button>
          </div>
        </nav>
      </div>

      {/* Mobile menu dropdown */}
      {mobileMenu && (
        <div
          className="fixed top-16 left-4 right-4 z-40 rounded-2xl p-4 animate-slide-up"
          style={{
            background: 'rgba(8,8,22,0.97)',
            border: '1px solid rgba(255,255,255,0.09)',
            backdropFilter: 'blur(28px)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.60)',
          }}
        >
          {navLinks.map(link => (
            <a
              key={link}
              href={`#${link.toLowerCase().replace(/ /g, '-')}`}
              onClick={() => setMobileMenu(false)}
              style={{
                display: 'block',
                padding: '12px 14px',
                fontSize: '14px',
                color: 'rgba(255,255,255,0.60)',
                textDecoration: 'none',
                borderRadius: '12px',
                letterSpacing: '-0.01em',
              }}
            >
              {link}
            </a>
          ))}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '10px', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={() => { openAuth('login'); setMobileMenu(false); }}
              style={{ padding: '12px', borderRadius: '14px', fontSize: '14px', fontWeight: 500, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#f0f0f8', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em' }}
            >
              Sign In
            </button>
            <button
              onClick={() => { openAuth('register'); setMobileMenu(false); }}
              style={{ padding: '12px', borderRadius: '14px', fontSize: '14px', fontWeight: 650, background: 'linear-gradient(135deg, #f0d898, #c8a96e)', color: '#1a1000', border: 'none', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em' }}
            >
              Get Started Free
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          HERO
          ════════════════════════════════════════════════ */}
      <section
        id="hero"
        style={{
          position: 'relative',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
          paddingTop: '80px',
        }}
      >
        {/* Big blob — right side */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            right: '-6%',
            top: '50%',
            transform: 'translateY(-50%)',
            width: 'clamp(460px, 62vw, 940px)',
            height: 'clamp(460px, 62vw, 940px)',
            opacity: 0.92,
            pointerEvents: 'none',
          }}
        >
          <LiquidBlob className="w-full h-full" />
        </div>

        {/* Concentric glow rings */}
        {[1.0, 0.45, 0.18].map((o, i) => (
          <div
            key={i}
            aria-hidden
            style={{
              position: 'absolute',
              right: `${-14 + i * 10}%`,
              top: '50%',
              transform: 'translateY(-50%)',
              width: `${58 + i * 18}vw`,
              height: `${58 + i * 18}vw`,
              borderRadius: '50%',
              border: `1px solid rgba(200,169,110,${o * 0.07})`,
              pointerEvents: 'none',
              animation: `pulse-soft ${7 + i * 2}s ease-in-out ${i * 1.4}s infinite`,
            }}
          />
        ))}

        {/* Hero content */}
        <div
          style={{
            position: 'relative',
            zIndex: 10,
            maxWidth: '1120px',
            margin: '0 auto',
            padding: '0 24px',
            width: '100%',
          }}
        >
          <div className="animate-slide-up" style={{ maxWidth: '580px' }}>

            {/* Status badge */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 16px',
                borderRadius: '999px',
                fontSize: '12px',
                fontWeight: 500,
                letterSpacing: '0.01em',
                color: '#c8a96e',
                background: 'rgba(200,169,110,0.09)',
                border: '1px solid rgba(200,169,110,0.26)',
                marginBottom: '36px',
              }}
            >
              <Zap size={10} />
              RAG-Powered Health Insurance AI
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#5cc85c',
                  boxShadow: '0 0 6px #5cc85c',
                  animation: 'pulseDot 1.6s ease-in-out infinite',
                }}
              />
            </div>

            {/* Main headline */}
            <h1
              style={{
                fontSize: 'clamp(2.8rem, 5.5vw, 4.8rem)',
                fontWeight: 760,
                letterSpacing: '-0.04em',
                lineHeight: 1.04,
                color: '#f0f0f8',
                marginBottom: '28px',
              }}
            >
              Understand every<br />
              <span
                style={{
                  background: 'linear-gradient(135deg, #f5e4a8 0%, #c8a96e 45%, #e8d080 75%, #a07840 100%)',
                  backgroundSize: '200% 200%',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  animation: 'gradientDrift 5s ease infinite',
                }}
              >
                clause of your policy
              </span>
            </h1>

            {/* Subheadline */}
            <p
              style={{
                fontSize: '17px',
                lineHeight: 1.72,
                letterSpacing: '-0.015em',
                color: 'rgba(255,255,255,0.46)',
                marginBottom: '44px',
                maxWidth: '440px',
              }}
            >
              Upload your health insurance PDF. Get AI-grounded answers, hidden-clause detection, and cost simulations — instantly, no guesswork.
            </p>

            {/* CTAs */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '0' }}>
              <button
                id="hero-getstarted"
                onClick={() => openAuth('register')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '15px 28px',
                  borderRadius: '999px',
                  fontSize: '15px',
                  fontWeight: 650,
                  letterSpacing: '-0.02em',
                  fontFamily: 'inherit',
                  background: 'linear-gradient(135deg, #f0d898, #c8a96e)',
                  color: '#1a1000',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 8px 32px rgba(200,169,110,0.40)',
                  transition: 'all 0.22s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow='0 14px 48px rgba(200,169,110,0.60)'; e.currentTarget.style.transform='translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow='0 8px 32px rgba(200,169,110,0.40)'; e.currentTarget.style.transform='translateY(0)'; }}
              >
                Get Started Free <ArrowRight size={16} />
              </button>
              <button
                id="hero-signin"
                onClick={() => openAuth('login')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '15px 28px',
                  borderRadius: '999px',
                  fontSize: '15px',
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  fontFamily: 'inherit',
                  background: 'rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.72)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  cursor: 'pointer',
                  backdropFilter: 'blur(8px)',
                  transition: 'all 0.20s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.10)'; e.currentTarget.style.color='#f0f0f8'; e.currentTarget.style.borderColor='rgba(255,255,255,0.20)'; }}
                onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.06)'; e.currentTarget.style.color='rgba(255,255,255,0.72)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.12)'; }}
              >
                Sign In
              </button>
            </div>
          </div>
        </div>

        {/* Scroll hint */}
        <div
          style={{
            position: 'absolute',
            bottom: '32px',
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'rgba(255,255,255,0.18)',
            animation: 'blobFloat 3s ease-in-out infinite',
          }}
        >
          <ChevronRight size={18} style={{ transform: 'rotate(90deg)' }} />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          FEATURES
          ════════════════════════════════════════════════ */}
      <section
        id="features"
        style={{
          position: 'relative',
          padding: '120px 24px',
          maxWidth: '1120px',
          margin: '0 auto',
        }}
      >
        {/* Section eyebrow */}
        <div style={{ textAlign: 'center', marginBottom: '72px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              padding: '6px 16px',
              borderRadius: '999px',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#c8a96e',
              background: 'rgba(200,169,110,0.07)',
              border: '1px solid rgba(200,169,110,0.18)',
              marginBottom: '22px',
            }}
          >
            <Zap size={10} /> Features
          </div>
          <h2
            style={{
              fontSize: 'clamp(2rem, 3.5vw, 3.2rem)',
              fontWeight: 740,
              letterSpacing: '-0.04em',
              lineHeight: 1.12,
              color: '#f0f0f8',
              marginBottom: '18px',
            }}
          >
            Everything you need to<br />
            <span style={{
              background: 'linear-gradient(135deg, #f5e4a8, #c8a96e)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              color: "#ffffff"
            }}>master your coverage</span>
          </h2>
          <p style={{ fontSize: '15px', lineHeight: 1.75, letterSpacing: '-0.01em', color: 'rgba(255,255,255,0.38)', maxWidth: '420px', margin: '0 auto' }}>
            Built on a Retrieval-Augmented Generation pipeline — every answer is grounded in your actual policy document.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '14px',
          }}
        >
          <FeatureCard icon={Brain}         title="AI Chat Assistant"    desc="Ask anything about your policy. Get precise, cited answers sourced directly from your uploaded document — not generic guesses." accent delay="0s" />
          <FeatureCard icon={AlertTriangle} title="Red-Flag Detection"   desc="Surfaces hidden exclusions, co-payment traps, sub-limits, and waiting period clauses that cost policyholders thousands." delay="0.06s" />
          <FeatureCard icon={DollarSign}    title="Cost Estimator"       desc="Simulate any treatment — hospitalisation, surgery, diagnostics — and see your exact out-of-pocket liability before it happens." delay="0.12s" />
          <FeatureCard icon={GitCompare}    title="Policy Comparison"    desc="Load multiple policies and compare coverage limits, exclusions, and premiums side-by-side to find the best plan." delay="0.18s" />
          <FeatureCard icon={FileText}      title="Clause Extraction"    desc="Room rent, co-pay, cashless network, pre-existing conditions — automatically extracted and categorized at upload time." delay="0.24s" />
          <FeatureCard icon={TrendingUp}    title="Confidence Scoring"   desc="Every AI answer comes with a source citation and a confidence level — High, Medium, or Low — so you know how reliable it is." delay="0.30s" />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          HOW IT WORKS
          ════════════════════════════════════════════════ */}
      <section
        id="how-it-works"
        style={{
          position: 'relative',
          padding: '120px 24px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          overflow: 'hidden',
        }}
      >
        {/* Side blob */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '-12%',
            top: '50%',
            transform: 'translateY(-50%)',
            width: 'clamp(300px, 38vw, 560px)',
            height: 'clamp(300px, 38vw, 560px)',
            opacity: 0.42,
            pointerEvents: 'none',
          }}
        >
          <LiquidBlob className="w-full h-full" />
        </div>

        <div
          style={{
            maxWidth: '1120px',
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '80px',
            alignItems: 'center',
          }}
          className="grid-cols-1 md:grid-cols-2"
        >
          {/* Left — steps */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                padding: '6px 16px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#c8a96e',
                background: 'rgba(200,169,110,0.07)',
                border: '1px solid rgba(200,169,110,0.18)',
                marginBottom: '24px',
              }}
            >
              How it works
            </div>
            <h2
              style={{
                fontSize: 'clamp(1.9rem, 3vw, 3rem)',
                fontWeight: 740,
                letterSpacing: '-0.04em',
                lineHeight: 1.12,
                color: '#f0f0f8',
                marginBottom: '52px',
              }}
            >
              From upload to<br />
              <span style={{
                background: 'linear-gradient(135deg, #f5e4a8, #c8a96e)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>insight in minutes</span>
            </h2>

            {/* Steps */}
            <div style={{ position: 'relative', paddingLeft: '0' }}>
              {[
                { num: '01', title: 'Upload your policy PDF', desc: 'Drag-drop or click to upload. Text is extracted, chunked semantically, and a vector index is built in under 30 seconds.' },
                { num: '02', title: 'AI extracts key clauses', desc: 'Room rent, co-pay, exclusions, waiting periods, sub-limits — tagged and categorized automatically by the NLP pipeline.' },
                { num: '03', title: 'Ask anything, compare, estimate', desc: 'Chat with your policy, run cost simulations, compare plans side-by-side. Every answer cites the exact source clause.' },
              ].map((step, i) => (
                <div
                  key={step.num}
                  style={{
                    display: 'flex',
                    gap: '20px',
                    marginBottom: i < 2 ? '36px' : '0',
                    animation: 'fadeIn 0.3s ease-out both',
                    animationDelay: `${i * 0.1}s`,
                  }}
                >
                  {/* Number */}
                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 700,
                        letterSpacing: '0.02em',
                        background: 'linear-gradient(135deg, rgba(240,216,152,0.18), rgba(200,169,110,0.10))',
                        border: '1px solid rgba(200,169,110,0.35)',
                        color: '#e8c97e',
                        flexShrink: 0,
                      }}
                    >
                      {step.num}
                    </div>
                    {i < 2 && (
                      <div style={{ width: '1px', flex: 1, minHeight: '28px', background: 'linear-gradient(to bottom, rgba(200,169,110,0.25), transparent)', marginTop: '8px' }} />
                    )}
                  </div>
                  {/* Text */}
                  <div style={{ paddingTop: '6px' }}>
                    <h4 style={{ fontSize: '15px', fontWeight: 640, letterSpacing: '-0.02em', color: '#f0f0f8', marginBottom: '7px' }}>
                      {step.title}
                    </h4>
                    <p style={{ fontSize: '13px', lineHeight: 1.72, letterSpacing: '-0.005em', color: 'rgba(255,255,255,0.38)' }}>
                      {step.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — mock AI chat card */}
          <div className="hidden md:block" style={{ position: 'relative', zIndex: 1 }}>
            <div
              className="animate-blob-float"
              style={{
                borderRadius: '24px',
                padding: '1.5px',
                background: 'linear-gradient(135deg, rgba(200,169,110,0.30), rgba(80,60,200,0.20), rgba(255,255,255,0.04))',
              }}
            >
              <div
                style={{
                  borderRadius: '23px',
                  background: 'rgba(7,7,18,0.97)',
                  border: '1px solid rgba(255,255,255,0.055)',
                  overflow: 'hidden',
                }}
              >
                {/* Chat header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '16px 20px',
                    borderBottom: '1px solid rgba(255,255,255,0.055)',
                  }}
                >
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#5cc85c', boxShadow: '0 0 6px #5cc85c', animation: 'pulseDot 2s ease-in-out infinite' }} />
                  <span style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(255,255,255,0.50)', letterSpacing: '-0.01em' }}>
                    AI Assistant · HDFC ERGO Family Floater
                  </span>
                </div>
                {/* Messages */}
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* User msg */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div
                      style={{
                        padding: '11px 16px',
                        borderRadius: '16px 16px 4px 16px',
                        fontSize: '13px',
                        letterSpacing: '-0.01em',
                        lineHeight: 1.55,
                        maxWidth: '78%',
                        background: 'rgba(200,169,110,0.14)',
                        border: '1px solid rgba(200,169,110,0.24)',
                        color: '#f0f0f8',
                      }}
                    >
                      What is the room rent limit for my policy?
                    </div>
                  </div>
                  {/* AI msg */}
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(80,60,180,0.28))',
                        border: '1px solid rgba(200,169,110,0.28)',
                      }}
                    >
                      <Shield size={11} style={{ color: '#c8a96e' }} />
                    </div>
                    <div
                      style={{
                        padding: '11px 16px',
                        borderRadius: '4px 16px 16px 16px',
                        fontSize: '13px',
                        letterSpacing: '-0.01em',
                        lineHeight: 1.65,
                        flex: 1,
                        background: 'rgba(255,255,255,0.035)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        color: 'rgba(255,255,255,0.72)',
                      }}
                    >
                      <p>Your HDFC ERGO Family Floater has <span style={{ color: '#e8c97e', fontWeight: 600 }}>no room rent capping</span> — you can choose any room without proportionate deduction risk.</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px' }}>
                        <CheckCircle size={10} style={{ color: '#5cc85c' }} />
                        <span style={{ fontSize: '11px', color: '#5cc85c', letterSpacing: '0.01em' }}>High confidence · Page 14, §3.2</span>
                      </div>
                    </div>
                  </div>
                  {/* Typing */}
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(80,60,180,0.28))',
                        border: '1px solid rgba(200,169,110,0.28)',
                      }}
                    >
                      <Shield size={11} style={{ color: '#c8a96e' }} />
                    </div>
                    <div
                      style={{
                        padding: '14px 18px',
                        borderRadius: '4px 16px 16px 16px',
                        background: 'rgba(255,255,255,0.035)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        display: 'flex',
                        gap: '5px',
                        alignItems: 'center',
                      }}
                    >
                      {[0, 0.22, 0.44].map(d => (
                        <div key={d} style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#c8a96e', animation: `pulseDot 1.2s ease-in-out ${d}s infinite` }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          FINAL CTA BANNER
          ════════════════════════════════════════════════ */}
      <section
        style={{
          position: 'relative',
          padding: '140px 24px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          overflow: 'hidden',
          textAlign: 'center',
        }}
      >
        {/* Background blob */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            right: '-20%',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '75vw',
            height: '75vw',
            opacity: 0.36,
            pointerEvents: 'none',
          }}
        >
          <LiquidBlob className="w-full h-full" />
        </div>

        <div style={{ position: 'relative', zIndex: 1, maxWidth: '680px', margin: '0 auto' }}>
          <h2
            style={{
              fontSize: 'clamp(2.2rem, 4.5vw, 4.2rem)',
              fontWeight: 760,
              letterSpacing: '-0.04em',
              lineHeight: 1.07,
              color: '#f0f0f8',
              marginBottom: '22px',
            }}
          >
            Your policy has answers.<br />
            <span
              style={{
                background: 'linear-gradient(135deg, #f5e4a8, #c8a96e, #e8d080)',
                backgroundSize: '200% 200%',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                animation: 'gradientDrift 5s ease infinite',
              }}
            >
              MedShield finds them.
            </span>
          </h2>
          <p
            style={{
              fontSize: '16px',
              lineHeight: 1.75,
              letterSpacing: '-0.01em',
              color: 'rgba(255,255,255,0.38)',
              marginBottom: '44px',
            }}
          >
            Upload your policy and start getting AI-powered clarity — completely free.
          </p>
          <button
            id="final-cta"
            onClick={() => openAuth('register')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              padding: '17px 36px',
              borderRadius: '999px',
              fontSize: '16px',
              fontWeight: 650,
              letterSpacing: '-0.02em',
              fontFamily: 'inherit',
              background: 'linear-gradient(135deg, #f0d898, #c8a96e)',
              color: '#1a1000',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 10px 44px rgba(200,169,110,0.46)',
              transition: 'all 0.22s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow='0 18px 56px rgba(200,169,110,0.68)'; e.currentTarget.style.transform='translateY(-3px)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow='0 10px 44px rgba(200,169,110,0.46)'; e.currentTarget.style.transform='translateY(0)'; }}
          >
            Get Started Free <ArrowRight size={17} />
          </button>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          FOOTER
          ════════════════════════════════════════════════ */}
      <footer
        style={{
          borderTop: '1px solid rgba(255,255,255,0.05)',
          padding: '36px 24px',
        }}
      >
        <div
          style={{
            maxWidth: '1120px',
            margin: '0 auto',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '7px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(200,169,110,0.30)',
                overflow: 'hidden',
                padding: '2px',
              }}
            >
              <img src="/favicon_io/favicon-32x32.png" alt="MedShield Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <span style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '-0.02em', color: 'rgba(255,255,255,0.45)' }}>
              MedShield
            </span>
          </div>
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.18)', letterSpacing: '0.01em' }}>
            © {new Date().getFullYear()} MedShield · Built with FastAPI · ChromaDB · React
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            {['Privacy', 'Terms', 'Docs'].map(l => (
              <a
                key={l}
                href="#"
                style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)', textDecoration: 'none', letterSpacing: '-0.01em', transition: 'color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.55)'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}
              >
                {l}
              </a>
            ))}
          </div>
        </div>
      </footer>

      {/* ── Auth Drawer ── */}
      {authOpen && <AuthDrawer onClose={() => setAuthOpen(false)} defaultTab={authTab} />}
    </div>
  );
}
