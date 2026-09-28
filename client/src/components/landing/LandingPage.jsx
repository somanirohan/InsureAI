import React, { useState, useEffect } from 'react';
import {
  Shield, ArrowRight, Lock, CheckCircle, ChevronRight,
  FileText, Brain, TrendingUp, AlertTriangle, X, Mail,
  User, Phone, Menu, DollarSign, GitCompare, Sparkles,
  CheckCircle2, AlertCircle, Check, Activity, Layers,
  Search, ArrowUpRight, ShieldCheck, Scale, Zap,
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
  const [email, setEmail]       = useState('alex@insurai.com');
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
              <img src="/favicon_io/apple-touch-icon.png" alt="InsurAI Logo" className="w-full h-full object-contain rounded-lg" />
            </div>
            <div>
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#f0f0f8', letterSpacing: '-0.02em' }}>InsurAI</p>
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
   BENTO GRID COMPONENTS (Modern Apple / Linear Pop-Out System)
   Zero layout disturbance: Uses a stable grid placeholder so the card
   floats & pops out above siblings on hover without pushing surrounding cards.
   ───────────────────────────────────────────────────────────── */
function BentoCard({
  className = '',
  children,
  accentColor = '#c8a96e',
  glowColor = 'rgba(200,169,110,0.12)',
  title = '',
  description = '',
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`relative ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ zIndex: hovered ? 50 : 1 }}
    >
      {/* Stable layout anchor: guarantees the grid never shifts or recalculates height */}
      <div
        className="rounded-3xl p-6 sm:p-7 opacity-0 pointer-events-none select-none invisible"
        aria-hidden="true"
      >
        <h3 className="text-lg sm:text-xl font-bold tracking-tight mb-2">
          {title}
        </h3>
        <p className="text-[13px] sm:text-sm leading-relaxed">
          {description}
        </p>
      </div>

      {/* Floating Pop-Out Card: Floats over the grid smoothly without disturbing siblings */}
      <div
        className="absolute top-0 left-0 right-0 rounded-3xl p-6 sm:p-7 flex flex-col justify-start overflow-hidden transition-all duration-300"
        style={{
          background: hovered
            ? 'linear-gradient(145deg, rgba(22,22,38,0.98) 0%, rgba(13,13,22,0.99) 100%)'
            : 'linear-gradient(145deg, rgba(16,16,28,0.70) 0%, rgba(10,10,18,0.78) 100%)',
          border: hovered
            ? `1px solid ${accentColor}66`
            : '1px solid rgba(255,255,255,0.075)',
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          transform: hovered ? 'translateY(-6px) scale(1.015)' : 'translateY(0) scale(1)',
          boxShadow: hovered
            ? `0 32px 80px -10px rgba(0,0,0,0.95), 0 0 35px ${glowColor}`
            : '0 6px 20px -6px rgba(0,0,0,0.4)',
          pointerEvents: 'auto',
        }}
      >
        {/* Ambient background glow orb */}
        <div
          style={{
            position: 'absolute',
            top: '-25%',
            right: '-20%',
            width: '280px',
            height: '280px',
            background: glowColor,
            filter: 'blur(65px)',
            borderRadius: '50%',
            pointerEvents: 'none',
            opacity: hovered ? 0.45 : 0.08,
            transition: 'opacity 0.35s ease',
          }}
        />

        {/* Clean Header: NO icon, NO "hover to view" text */}
        <div className="relative z-10 w-full">
          <h3
            className="text-lg sm:text-xl font-bold tracking-tight text-[#f0f0f8] mb-2 transition-colors duration-200"
            style={{ letterSpacing: '-0.02em', color: hovered ? '#ffffff' : '#f0f0f8' }}
          >
            {title}
          </h3>
          <p
            className="text-[13px] sm:text-sm text-gray-400 leading-relaxed"
            style={{ color: 'rgba(255,255,255,0.52)', lineHeight: 1.6 }}
          >
            {description}
          </p>
        </div>

        {/* Expandable Micro-UI Drawer: Smoothly unfolds inside the floating card */}
        <div
          className="relative z-10 w-full"
          style={{
            display: 'grid',
            gridTemplateRows: hovered ? '1fr' : '0fr',
            opacity: hovered ? 1 : 0,
            transform: hovered ? 'translateY(0)' : 'translateY(8px)',
            transition: 'grid-template-rows 0.38s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease, transform 0.3s ease, margin-top 0.3s ease',
            marginTop: hovered ? '16px' : '0px',
          }}
        >
          <div style={{ minHeight: 0, overflow: 'hidden' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   LANDING NAVBAR (High-Performance Floating Island)
   Isolated state + rAF throttle ensures 0 layout reflows and 120 FPS buttery smoothness
   ───────────────────────────────────────────────────────────── */
function LandingNavbar({ openAuth, navLinks }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const y = window.scrollY;
          setScrolled(prev => (y > 35 ? true : y < 15 ? false : prev));
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <header
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          display: 'flex',
          justifyContent: 'center',
          padding: '0 16px',
          pointerEvents: 'none',
        }}
      >
        <nav
          style={{
            width: '100%',
            maxWidth: scrolled ? '720px' : '1140px',
            transform: scrolled ? 'translate3d(0, 12px, 0)' : 'translate3d(0, 6px, 0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pointerEvents: 'all',
            borderRadius: '999px',
            padding: scrolled ? '8px 12px 8px 18px' : '14px 22px',
            background: scrolled ? 'rgba(8, 8, 18, 0.88)' : 'rgba(8, 8, 18, 0)',
            border: scrolled
              ? '1px solid rgba(200, 169, 110, 0.28)'
              : '1px solid rgba(255, 255, 255, 0)',
            backdropFilter: scrolled ? 'blur(20px)' : 'blur(0px)',
            WebkitBackdropFilter: scrolled ? 'blur(20px)' : 'blur(0px)',
            boxShadow: scrolled
              ? '0 16px 40px rgba(0, 0, 0, 0.65), 0 0 24px rgba(200, 169, 110, 0.08)'
              : '0 0 0 rgba(0, 0, 0, 0)',
            transition: [
              'max-width 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
              'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
              'padding 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
              'background 0.3s ease',
              'border-color 0.3s ease',
              'box-shadow 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            ].join(', '),
            willChange: 'max-width, transform',
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
                width: '32px',
                height: '32px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(200,169,110,0.35)',
                boxShadow: '0 0 14px rgba(200,169,110,0.18)',
                flexShrink: 0,
                overflow: 'hidden',
                padding: '2px',
              }}
            >
              <img
                src="/favicon_io/apple-touch-icon.png"
                alt="InsurAI Logo"
                style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '7px' }}
              />
            </div>
            <span
              style={{
                fontSize: '14px',
                fontWeight: 650,
                color: '#f0f0f8',
                letterSpacing: '-0.02em',
              }}
            >
              InsurAI
            </span>
          </button>

          {/* Center Links */}
          <div
            className="hidden md:flex"
            style={{
              alignItems: 'center',
              gap: '24px',
            }}
          >
            {navLinks.map(link => (
              <a
                key={link}
                href={`#${link.toLowerCase().replace(/ /g, '-')}`}
                style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'rgba(255,255,255,0.55)',
                  textDecoration: 'none',
                  letterSpacing: '-0.01em',
                  padding: '6px 12px',
                  borderRadius: '999px',
                  transition: 'color 0.15s ease, background 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = '#f0f0f8';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = 'rgba(255,255,255,0.55)';
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {link}
              </a>
            ))}
          </div>

          {/* Right CTAs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
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
                padding: '7px 14px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                letterSpacing: '-0.01em',
                transition: 'color 0.15s ease, background 0.15s ease',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = '#f0f0f8';
                e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'rgba(255,255,255,0.55)';
                e.currentTarget.style.background = 'transparent';
              }}
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
                padding: '8px 18px',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(200,169,110,0.30)',
                transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 6px 24px rgba(200,169,110,0.50)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(200,169,110,0.30)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
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
              aria-label="Open mobile menu"
            >
              {mobileMenu ? <X size={17} /> : <Menu size={17} />}
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile menu dropdown */}
      {mobileMenu && (
        <div
          className="fixed top-20 left-4 right-4 z-40 rounded-2xl p-4 animate-slide-up"
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
          <div
            style={{
              borderTop: '1px solid rgba(255,255,255,0.06)',
              marginTop: '10px',
              paddingTop: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <button
              onClick={() => {
                openAuth('login');
                setMobileMenu(false);
              }}
              style={{
                padding: '12px',
                borderRadius: '14px',
                fontSize: '14px',
                fontWeight: 500,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.09)',
                color: '#f0f0f8',
                cursor: 'pointer',
                fontFamily: 'inherit',
                letterSpacing: '-0.01em',
              }}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                openAuth('register');
                setMobileMenu(false);
              }}
              style={{
                padding: '12px',
                borderRadius: '14px',
                fontSize: '14px',
                fontWeight: 650,
                background: 'linear-gradient(135deg, #f0d898, #c8a96e)',
                color: '#1a1000',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                letterSpacing: '-0.01em',
              }}
            >
              Get Started Free
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   MAIN LANDING PAGE
   ───────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab]   = useState('login');

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

      {/* Floating Island Navbar */}
      <LandingNavbar openAuth={openAuth} navLinks={navLinks} />

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
          FEATURES (Bento Box Architecture)
          ════════════════════════════════════════════════ */}
      <section
        id="features"
        style={{
          position: 'relative',
          padding: '120px 24px 220px 24px',
          maxWidth: '1240px',
          margin: '0 auto',
        }}
      >
        {/* Section header */}
        <div style={{ textAlign: 'center', marginBottom: '64px' }}>
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
          <p style={{ fontSize: '15px', lineHeight: 1.75, letterSpacing: '-0.01em', color: 'rgba(255,255,255,0.42)', maxWidth: '480px', margin: '0 auto' }}>
            Built on an enterprise-grade RAG pipeline — every answer, risk score, and cost projection is mathematically grounded in your exact policy contract.
          </p>
        </div>

        {/* Bento Box Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: AI Chat Assistant (Spans 2 cols) */}
          <BentoCard
            className="md:col-span-2"
            accentColor="#c8a96e"
            glowColor="rgba(200,169,110,0.16)"
            title="Conversational Policy Intelligence"
            description="Ask complex coverage questions in plain language. InsurAI analyzes your uploaded policy clause-by-clause, retrieving exact citations and legal definitions with zero speculative hallucinations."
          >
            {/* Embedded Micro-UI: Interactive Chat & Citation Terminal */}
            <div
              className="rounded-2xl overflow-hidden border mt-4"
              style={{
                background: 'rgba(8, 8, 16, 0.75)',
                borderColor: 'rgba(255, 255, 255, 0.08)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
              }}
            >
              {/* Terminal Meta Bar */}
              <div
                className="flex items-center justify-between px-4 py-2.5 border-b text-xs flex-wrap gap-2"
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderColor: 'rgba(255, 255, 255, 0.06)',
                }}
              >
                <div className="flex items-center gap-2 text-gray-300 font-mono text-[11px]">
                  <FileText size={13} className="text-[#c8a96e]" />
                  <span>Star_Comprehensive_2024.pdf</span>
                  <span className="text-gray-500 hidden sm:inline">· 48 Pages Indexed</span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>99.8% Grounding Score</span>
                </div>
              </div>

              {/* Chat Dialogue */}
              <div className="p-4 sm:p-5 space-y-3.5 text-xs">
                {/* User Message */}
                <div className="flex items-start gap-2.5 max-w-[92%] ml-auto justify-end">
                  <div
                    className="rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-right"
                    style={{
                      background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.10))',
                      border: '1px solid rgba(200,169,110,0.3)',
                      color: '#f0f0f8',
                    }}
                  >
                    <p className="leading-relaxed">
                      Does my policy cover robotic joint replacement surgery, and what room category can I choose without penalty?
                    </p>
                  </div>
                </div>

                {/* AI Assistant Message */}
                <div className="flex items-start gap-3 max-w-[96%]">
                  <div
                    className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                    style={{
                      background: 'linear-gradient(135deg, rgba(200,169,110,0.28), rgba(200,169,110,0.08))',
                      border: '1px solid rgba(200,169,110,0.35)',
                    }}
                  >
                    <Sparkles size={14} className="text-[#e8c97e]" />
                  </div>
                  <div className="space-y-2 flex-1">
                    <div
                      className="rounded-2xl rounded-tl-sm p-3.5"
                      style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.07)',
                        color: '#d4d4e0',
                        lineHeight: 1.65,
                      }}
                    >
                      <p>
                        <strong className="text-white">Yes, fully covered.</strong> Under <span className="text-[#e8c97e] font-medium">Section 4.2.1 (Modern & Advanced Procedures)</span>, robotic joint replacement is indemnified up to 100% of Sum Insured (₹15,00,000). You are eligible for a <strong className="text-white">Single Standard Private AC Room</strong> with zero proportionate deduction.
                      </p>

                      {/* Sourced Citation Pill */}
                      <div
                        className="mt-3 p-2.5 rounded-xl border flex items-center justify-between gap-2"
                        style={{
                          background: 'rgba(200,169,110,0.06)',
                          borderColor: 'rgba(200,169,110,0.22)',
                        }}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                          <span className="text-gray-300 truncate text-[11px]">
                            <strong className="text-[#e8c97e]">Clause 4.2.1:</strong> "Modern robotic procedures indemnifiable up to Sum Insured..."
                          </span>
                        </div>
                        <span className="shrink-0 text-[10px] font-mono text-gray-400">
                          Page 19 · Clause 4.2
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </BentoCard>

          {/* Card 2: Red-Flag Detection (Spans 1 col) */}
          <BentoCard
            className="md:col-span-1"
            accentColor="#ef4444"
            glowColor="rgba(239,68,68,0.14)"
            title="Hidden Clause & Trap Radar"
            description="Surfaces punitive room rent caps, sub-limits, and waiting periods buried in cryptic insurance clauses."
          >
            {/* Stack of 3 Audit Cards */}
            <div className="space-y-2.5 mt-3">
              <div
                className="p-3 rounded-2xl border transition-all duration-200"
                style={{
                  background: 'rgba(239,68,68,0.05)',
                  borderColor: 'rgba(239,68,68,0.22)',
                }}
              >
                <div className="mb-1">
                  <span className="text-xs font-semibold text-red-200">1% Room Rent Cap</span>
                </div>
                <p className="text-[11px] text-gray-400 leading-normal">
                  Hospital rooms &gt; ₹10k/day trigger up to 35% proportionate deduction across total bill.
                </p>
              </div>

              <div
                className="p-3 rounded-2xl border transition-all duration-200"
                style={{
                  background: 'rgba(245,158,11,0.05)',
                  borderColor: 'rgba(245,158,11,0.22)',
                }}
              >
                <div className="mb-1">
                  <span className="text-xs font-semibold text-amber-200">24-Mo PED Waiting</span>
                </div>
                <p className="text-[11px] text-gray-400 leading-normal">
                  Pre-existing diabetes & hypertension claims barred until policy month 25.
                </p>
              </div>

              <div
                className="p-3 rounded-2xl border transition-all duration-200"
                style={{
                  background: 'rgba(16,185,129,0.05)',
                  borderColor: 'rgba(16,185,129,0.22)',
                }}
              >
                <div className="mb-1">
                  <span className="text-xs font-semibold text-emerald-200">Zero Co-Payment</span>
                </div>
                <p className="text-[11px] text-gray-400 leading-normal">
                  100% claim settlement across 14,000+ cashless network hospitals.
                </p>
              </div>
            </div>
          </BentoCard>

          {/* Card 3: Out-of-Pocket Cost Estimator (Spans 1 col) */}
          <BentoCard
            className="md:col-span-1"
            accentColor="#10b981"
            glowColor="rgba(16,185,129,0.14)"
            title="Out-of-Pocket Cost Estimator"
            description="Simulate hospital procedures before admission to know your exact deductible liability in advance."
          >
            {/* Interactive Splitter Gauge */}
            <div
              className="p-4 rounded-2xl border mt-3 space-y-3"
              style={{
                background: 'rgba(10, 18, 14, 0.65)',
                borderColor: 'rgba(16,185,129,0.2)',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-300">Cardiac Angioplasty</span>
                <span className="text-xs font-bold text-white font-mono">₹3,80,000 Est.</span>
              </div>

              {/* Segmented Two-Tone Bar */}
              <div className="w-full h-3 rounded-full overflow-hidden flex bg-gray-800">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                  style={{ width: '85%' }}
                />
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-rose-400 transition-all duration-500"
                  style={{ width: '15%' }}
                />
              </div>

              {/* Bar Legend */}
              <div className="flex items-center justify-between text-[11px] font-mono">
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Insurer: ₹3,24,000 (85%)</span>
                </div>
                <div className="flex items-center gap-1.5 text-amber-400">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>You: ₹56,000</span>
                </div>
              </div>

              {/* Itemized Breakdown */}
              <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
                <div className="px-2 py-1 rounded bg-white/5 border border-white/5 text-gray-300">
                  Consumables: <span className="text-amber-400 font-mono">₹32k</span>
                </div>
                <div className="px-2 py-1 rounded bg-white/5 border border-white/5 text-gray-300">
                  Room Diff: <span className="text-amber-400 font-mono">₹24k</span>
                </div>
              </div>
            </div>
          </BentoCard>

          {/* Card 4: Clause Extraction (Spans 1 col) */}
          <BentoCard
            className="md:col-span-1"
            accentColor="#8b5cf6"
            glowColor="rgba(139,92,246,0.14)"
            title="Instant Clause Extraction"
            description="Converts 60+ page dense PDFs into structured, queryable data points in seconds."
          >
            {/* 2x2 Glass Metric Chips */}
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="p-3 rounded-2xl border border-white/5 bg-white/[0.03]">
                <div className="text-[10px] text-gray-400 uppercase font-semibold">Sum Insured</div>
                <div className="text-sm font-bold text-white font-mono mt-0.5">₹15,00,000</div>
                <div className="text-[10px] text-purple-300 mt-0.5">+ 100% Super NCB</div>
              </div>
              <div className="p-3 rounded-2xl border border-white/5 bg-white/[0.03]">
                <div className="text-[10px] text-gray-400 uppercase font-semibold">Room Rent</div>
                <div className="text-sm font-bold text-white font-mono mt-0.5">Single AC</div>
                <div className="text-[10px] text-emerald-400 mt-0.5">Zero Sub-limits</div>
              </div>
              <div className="p-3 rounded-2xl border border-white/5 bg-white/[0.03]">
                <div className="text-[10px] text-gray-400 uppercase font-semibold">Day Care</div>
                <div className="text-sm font-bold text-white font-mono mt-0.5">540+ Types</div>
                <div className="text-[10px] text-blue-300 mt-0.5">No 24h hospital rule</div>
              </div>
              <div className="p-3 rounded-2xl border border-white/5 bg-white/[0.03]">
                <div className="text-[10px] text-gray-400 uppercase font-semibold">Restoration</div>
                <div className="text-sm font-bold text-white font-mono mt-0.5">100% Instant</div>
                <div className="text-[10px] text-amber-300 mt-0.5">Unlimited Reloads</div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-purple-300/80">
              <Zap size={12} className="text-purple-400 shrink-0" />
              <span>42 clauses parsed in 1.4s · 100% OCR fidelity</span>
            </div>
          </BentoCard>

          {/* Card 5: Confidence Scoring (Spans 1 col) */}
          <BentoCard
            className="md:col-span-1"
            accentColor="#06b6d4"
            glowColor="rgba(6,182,212,0.14)"
            title="Calibrated Confidence"
            description="Every answer is evaluated with strict multi-pass verification against original policy embeddings."
          >
            {/* Confidence Gauge & Checklist */}
            <div
              className="p-4 rounded-2xl border mt-3 space-y-3"
              style={{
                background: 'rgba(8, 18, 24, 0.65)',
                borderColor: 'rgba(6,182,212,0.2)',
              }}
            >
              <div>
                <div className="text-2xl font-black tracking-tight text-white font-mono bg-gradient-to-r from-cyan-400 to-[#c8a96e] bg-clip-text text-transparent">
                  99.4%
                </div>
                <div className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider">
                  Grounding Certainty
                </div>
              </div>

              <div className="space-y-1.5 pt-1 text-[11px] text-gray-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-cyan-400 shrink-0" />
                  <span>Verbatim clause cross-reference</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-cyan-400 shrink-0" />
                  <span>Semantic distance &lt; 0.12 verified</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-cyan-400 shrink-0" />
                  <span>Strict negative constraint checking</span>
                </div>
              </div>
            </div>
          </BentoCard>

          {/* Card 6: Policy Comparison Matrix (Spans 3 cols full width) */}
          <BentoCard
            className="md:col-span-3"
            accentColor="#c8a96e"
            glowColor="rgba(200,169,110,0.14)"
            title="Multi-Policy Comparative Matrix"
            description="Compare corporate group insurance, family floaters, and personal covers side-by-side to eliminate redundant premiums and dangerous coverage blindspots."
          >
            {/* Interactive Comparative Matrix */}
            <div
              className="rounded-2xl overflow-x-auto border mt-4"
              style={{
                background: 'rgba(8, 8, 16, 0.75)',
                borderColor: 'rgba(255, 255, 255, 0.08)',
              }}
            >
              <table className="w-full text-left text-xs min-w-[580px]">
                <thead>
                  <tr
                    className="border-b"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      borderColor: 'rgba(255,255,255,0.08)',
                    }}
                  >
                    <th className="py-3 px-4 text-gray-400 font-medium">Coverage Parameter</th>
                    <th className="py-3 px-4 font-semibold text-[#f5e4a8]">
                      Care Supreme (₹10L Base)
                    </th>
                    <th className="py-3 px-4 font-semibold text-gray-300">
                      HDFC ERGO Optima (₹10L Base)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr>
                    <td className="py-2.5 px-4 text-gray-300 font-medium">Room Rent Limit</td>
                    <td className="py-2.5 px-4 text-emerald-400 font-medium flex items-center gap-1.5">
                      <CheckCircle2 size={13} />
                      <span>Single Private AC (No Capping)</span>
                    </td>
                    <td className="py-2.5 px-4 text-amber-400 font-mono">1% of Sum Insured (₹10k/day)</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 text-gray-300 font-medium">Restoration Benefit</td>
                    <td className="py-2.5 px-4 text-emerald-400 font-medium flex items-center gap-1.5">
                      <CheckCircle2 size={13} />
                      <span>Unlimited Automatic Reload</span>
                    </td>
                    <td className="py-2.5 px-4 text-gray-400">100% Once per Policy Year</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 text-gray-300 font-medium">Modern & Robotic Surgery</td>
                    <td className="py-2.5 px-4 text-emerald-400 font-medium flex items-center gap-1.5">
                      <CheckCircle2 size={13} />
                      <span>100% Sum Insured Covered</span>
                    </td>
                    <td className="py-2.5 px-4 text-amber-400 font-mono">50% Sub-limit on Robotic</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 text-gray-300 font-medium">Pre-Existing Waiting Period</td>
                    <td className="py-2.5 px-4 text-gray-400">36 Months Waiting</td>
                    <td className="py-2.5 px-4 text-emerald-400 font-medium flex items-center gap-1.5">
                      <CheckCircle2 size={13} />
                      <span>24 Months Waiting</span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div
                className="p-3 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]"
                style={{
                  background: 'rgba(200,169,110,0.05)',
                  borderColor: 'rgba(200,169,110,0.2)',
                }}
              >
                <div className="flex items-center gap-2 text-gray-300">
                  <Sparkles size={13} className="text-[#c8a96e]" />
                  <span>
                    <strong className="text-white">InsurAI Arbitrage Insight:</strong> Care Supreme saves an estimated ₹1.85L on robotic surgical procedures.
                  </span>
                </div>
                <button
                  onClick={() => openAuth('register')}
                  className="inline-flex items-center gap-1 text-[#e8c97e] hover:text-white font-medium transition-colors"
                >
                  <span>Compare your policies now</span>
                  <ArrowUpRight size={13} />
                </button>
              </div>
            </div>
          </BentoCard>
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
              InsurAI finds them.
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
              <img src="/favicon_io/favicon-32x32.png" alt="InsurAI Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <span style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '-0.02em', color: 'rgba(255,255,255,0.45)' }}>
              InsurAI
            </span>
          </div>
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.18)', letterSpacing: '0.01em' }}>
            © {new Date().getFullYear()} InsurAI
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
