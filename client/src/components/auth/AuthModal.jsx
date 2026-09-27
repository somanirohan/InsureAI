import React, { useState } from 'react';
import { Shield, Mail, Lock, User, Phone, KeyRound, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Spinner } from '../common/ui';
import { LiquidBlob, Starfield } from '../common/LiquidBlob';

export default function AuthModal() {
  const [isLogin, setIsLogin]   = useState(true);
  const [fullName, setFullName] = useState('');
  const [email, setEmail]       = useState('demo@medshield.ai');
  const [password, setPassword] = useState('password123');
  const [phone, setPhone]       = useState('');
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(false);

  const { login, register } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(fullName, email, password, phone);
      }
    } catch (err) {
      const isNetworkError =
        err.code === 'ERR_NETWORK' ||
        err.message?.includes('Network Error') ||
        err.code === 'ECONNREFUSED';
      if (isNetworkError) {
        setError('Cannot reach the backend server. Make sure it is running on port 5001.');
      } else {
        setError(err.response?.data?.error || 'Authentication failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = () => {
    setIsLogin(true);
    setEmail('demo@medshield.ai');
    setPassword('password123');
    setError(null);
  };

  return (
    <div
      className="min-h-screen flex overflow-hidden relative"
      style={{ background: '#0a0a12' }}
    >
      {/* ── Starfield ── */}
      <Starfield count={80} />

      {/* ── Background ambient gradients ── */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at 20% 50%, rgba(60,40,160,0.15) 0%, transparent 55%),
            radial-gradient(ellipse at 80% 30%, rgba(100,70,20,0.12) 0%, transparent 50%)
          `,
        }}
      />

      {/* ── LEFT: Blob hero panel ── */}
      <div className="hidden lg:flex flex-1 relative items-center justify-center overflow-hidden">
        {/* Blob centred */}
        <div
          className="absolute"
          style={{
            width: '70%',
            maxWidth: 540,
            aspectRatio: '1',
            transform: 'translate(15%, 10%)',
          }}
        >
          <LiquidBlob className="w-full h-full" />
        </div>

        {/* Hero text overlay */}
        <div
          className="relative z-10 px-16 animate-slide-up"
          style={{ animationDelay: '0.1s' }}
        >
          <div
            className="flex items-center gap-2 mb-6"
            style={{
              background: 'rgba(200,169,110,0.10)',
              border: '1px solid rgba(200,169,110,0.25)',
              borderRadius: 999,
              padding: '6px 16px',
              width: 'fit-content',
            }}
          >
            <Shield size={12} style={{ color: '#c8a96e' }} />
            <span className="text-xs font-medium" style={{ color: '#c8a96e' }}>
              AI-Powered Insurance Intelligence
            </span>
          </div>

          <h1
            className="text-5xl font-bold tracking-tight leading-tight mb-4"
            style={{ color: '#f0f0f8' }}
          >
            Understand Your<br />
            <span className="text-gold">Policy Fully</span>
          </h1>

          <p className="text-base max-w-xs" style={{ color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>
            Upload your health insurance policy and get grounded AI answers, red-flag detection, and cost simulations — instantly.
          </p>

          {/* Floating stats cards */}
          <div className="flex gap-3 mt-8">
            {[
              { label: 'Claim Accuracy', value: '96%' },
              { label: 'Policies Analyzed', value: '2K+' },
            ].map(stat => (
              <div
                key={stat.label}
                className="px-4 py-3 rounded-2xl"
                style={{
                  background: 'rgba(12,12,24,0.75)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                }}
              >
                <p className="text-xl font-bold" style={{ color: '#e8c97e' }}>{stat.value}</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT: Auth form ── */}
      <div
        className="w-full lg:w-[440px] flex-shrink-0 flex flex-col items-center justify-center p-6 lg:p-10 relative z-10"
        style={{
          background: 'rgba(8,8,18,0.75)',
          borderLeft: '1px solid rgba(255,255,255,0.06)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
        }}
      >
        <div className="w-full max-w-[360px] animate-slide-up">

          {/* Brand */}
          <div className="flex flex-col items-center mb-8">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center mb-3"
              style={{
                background: 'linear-gradient(135deg, rgba(240,200,100,0.22), rgba(80,60,200,0.28))',
                border: '1px solid rgba(200,169,110,0.35)',
                boxShadow: '0 0 24px rgba(200,169,110,0.18)',
              }}
            >
              <Shield size={20} style={{ color: '#c8a96e' }} strokeWidth={2.5} />
            </div>
            <h2 className="text-[17px] font-semibold tracking-tight" style={{ color: '#f0f0f8' }}>
              MedShield
            </h2>
            <p className="text-[13px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
              AI Insurance Policy Intelligence
            </p>
          </div>

          {/* Demo pill */}
          <div
            className="flex items-center justify-between rounded-2xl px-4 py-3.5 mb-6"
            style={{
              background: 'rgba(200,169,110,0.08)',
              border: '1px solid rgba(200,169,110,0.22)',
            }}
          >
            <div className="min-w-0 pr-3">
              <div
                className="flex items-center gap-1.5 text-[12px] font-medium mb-0.5"
                style={{ color: '#c8a96e' }}
              >
                <KeyRound size={11} />
                Quick Demo Access
              </div>
              <p className="text-[11px] leading-tight" style={{ color: 'rgba(255,255,255,0.35)' }}>
                demo@medshield.ai · password123
              </p>
            </div>
            <button
              type="button"
              id="auth-demo-btn"
              onClick={fillDemo}
              className="flex-shrink-0 text-[12px] font-semibold px-3 py-1.5 rounded-xl transition-all"
              style={{
                background: 'rgba(200,169,110,0.18)',
                border: '1px solid rgba(200,169,110,0.35)',
                color: '#e8c97e',
              }}
              onMouseEnter={e => e.currentTarget.style.background='rgba(200,169,110,0.28)'}
              onMouseLeave={e => e.currentTarget.style.background='rgba(200,169,110,0.18)'}
            >
              Fill
            </button>
          </div>

          {/* Tab toggle */}
          <div
            className="flex p-1 mb-5 rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {['Log In', 'Register'].map((label, i) => {
              const active = i === 0 ? isLogin : !isLogin;
              return (
                <button
                  key={label}
                  id={`auth-tab-${i === 0 ? 'login' : 'register'}`}
                  type="button"
                  onClick={() => { setIsLogin(i === 0); setError(null); }}
                  className="flex-1 py-2 text-[12px] font-medium rounded-xl transition-all duration-200"
                  style={active ? {
                    background: 'rgba(200,169,110,0.15)',
                    border: '1px solid rgba(200,169,110,0.25)',
                    color: '#e8c97e',
                  } : {
                    background: 'transparent',
                    border: '1px solid transparent',
                    color: 'rgba(255,255,255,0.38)',
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
              className="flex items-start gap-2.5 px-4 py-3 rounded-xl mb-4 text-[12px] leading-relaxed"
              style={{
                background: 'rgba(220,60,60,0.08)',
                border: '1px solid rgba(220,60,60,0.22)',
                color: '#f07070',
              }}
            >
              <svg className="flex-shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3.5c.4 0 .7.3.7.7v3.4c0 .4-.3.7-.7.7s-.7-.3-.7-.7V5.2c0-.4.3-.7.7-.7zm0 6.5a.85.85 0 1 1 0-1.7.85.85 0 0 1 0 1.7z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form id="auth-form" onSubmit={handleSubmit} className="space-y-3.5">
            {!isLogin && (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  Full Name
                </label>
                <div className="relative">
                  <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'rgba(255,255,255,0.25)' }} />
                  <input
                    id="auth-fullname"
                    type="text"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Dr. Arjun Verma"
                    className="input-field"
                    style={{ paddingLeft: '34px' }}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Email
              </label>
              <div className="relative">
                <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'rgba(255,255,255,0.25)' }} />
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="input-field"
                  style={{ paddingLeft: '34px' }}
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Password
              </label>
              <div className="relative">
                <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'rgba(255,255,255,0.25)' }} />
                <input
                  id="auth-password"
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-field"
                  style={{ paddingLeft: '34px' }}
                />
              </div>
            </div>

            {!isLogin && (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  Phone <span className="normal-case font-normal" style={{ color: 'rgba(255,255,255,0.22)' }}>(optional)</span>
                </label>
                <div className="relative">
                  <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'rgba(255,255,255,0.25)' }} />
                  <input
                    id="auth-phone"
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="input-field"
                    style={{ paddingLeft: '34px' }}
                  />
                </div>
              </div>
            )}

            <div className="pt-1">
              <button
                id="auth-submit-btn"
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[13px] font-semibold transition-all"
                style={{
                  background: 'linear-gradient(135deg, #f0d898, #c8a96e)',
                  color: '#1a1000',
                  boxShadow: '0 4px 20px rgba(200,169,110,0.30)',
                  opacity: loading ? 0.65 : 1,
                  pointerEvents: loading ? 'none' : 'auto',
                }}
              >
                {loading && <Spinner size={14} />}
                <span>
                  {loading
                    ? isLogin ? 'Signing in…' : 'Creating account…'
                    : isLogin ? 'Sign In' : 'Create Account'
                  }
                </span>
                {!loading && <ArrowRight size={14} />}
              </button>
            </div>
          </form>

          <p className="text-center text-[11px] mt-5" style={{ color: 'rgba(255,255,255,0.20)' }}>
            Backend must be running on port 5001 · <code className="font-mono">npm run server</code>
          </p>
        </div>
      </div>
    </div>
  );
}
