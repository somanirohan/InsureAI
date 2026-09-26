import React, { useState } from 'react';
import { Shield, Mail, Lock, User, Phone, KeyRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Spinner } from '../common/ui';

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
        setError('Cannot reach the backend server. Make sure it is running on port 5001 (npm run server).');
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
    <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-4">
      {/* Subtle ambient glow */}
      <div
        aria-hidden="true"
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[500px] h-[250px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(0,0,0,0.02) 0%, transparent 70%)' }}
      />

      <div className="w-full max-w-[360px] animate-slide-up">
        {/* ── Brand mark ──────────────────────────────── */}
        <div className="flex flex-col items-center mb-7">
          <div className="w-11 h-11 rounded-[14px] bg-zinc-900 flex items-center justify-center mb-3 shadow-md">
            <Shield size={20} className="text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-[17px] font-semibold tracking-tight text-zinc-900">MedShield</h1>
          <p className="text-[13px] text-zinc-500 mt-0.5">AI Insurance Policy Intelligence</p>
        </div>

        {/* ── Card ──────────────────────────────────── */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/[0.08]">

          {/* Demo credentials pill */}
          <div className="flex items-center justify-between rounded-xl px-3.5 py-3 mb-5 bg-zinc-50 border border-black/[0.08]">
            <div className="min-w-0 pr-3">
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-700 mb-0.5">
                <KeyRound size={11} />
                Demo access
              </div>
              <p className="text-[11px] text-zinc-400 leading-tight">
                demo@medshield.ai
                <span className="mx-1 text-zinc-300">·</span>
                password123
              </p>
            </div>
            <button
              type="button"
              onClick={fillDemo}
              className="flex-shrink-0 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 transition-colors"
            >
              Fill
            </button>
          </div>

          {/* Tab toggle */}
          <div className="flex p-[3px] mb-5 rounded-xl bg-zinc-100 border border-black/[0.06]">
            {['Log In', 'Register'].map((label, i) => {
              const active = i === 0 ? isLogin : !isLogin;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => { setIsLogin(i === 0); setError(null); }}
                  className="flex-1 py-2 text-[12px] font-medium rounded-[10px] transition-all duration-150"
                  style={active
                    ? { background: '#ffffff', color: '#1d1d1f', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }
                    : { background: 'transparent', color: '#86868b' }
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Error state */}
          {error && (
            <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl mb-4 text-[12px] leading-relaxed bg-red-50 border border-red-200 text-red-700">
              <svg className="flex-shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3.5c.4 0 .7.3.7.7v3.4c0 .4-.3.7-.7.7s-.7-.3-.7-.7V5.2c0-.4.3-.7.7-.7zm0 6.5a.85.85 0 1 1 0-1.7.85.85 0 0 1 0 1.7z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {!isLogin && (
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                  <input
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
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                Email
              </label>
              <div className="relative">
                <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                <input
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
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                Password
              </label>
              <div className="relative">
                <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                <input
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
                <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                  Phone <span className="text-zinc-300 normal-case font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                  <input
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
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-semibold transition-all bg-zinc-900 text-white hover:bg-zinc-700 active:bg-black"
              >
                {loading && <Spinner size={14} className="text-white" />}
                {loading
                  ? isLogin ? 'Signing in…' : 'Creating account…'
                  : isLogin ? 'Sign In'     : 'Create Account'
                }
              </button>
            </div>
          </form>
        </div>

        <p className="text-center text-[11px] text-zinc-400 mt-5">
          Backend must be running on port 5001 · <code className="text-zinc-500">npm run server</code>
        </p>
      </div>
    </div>
  );
}
