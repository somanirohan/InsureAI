import React, { useState } from 'react';
import { Shield, Mail, Lock, User, Phone, KeyRound, ArrowRight, Eye, EyeOff, ArrowLeft, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Spinner } from '../common/ui';
import { LiquidBlob, Starfield } from '../common/LiquidBlob';
import GoogleLoginButton from './GoogleLoginButton';
import PasswordStrengthIndicator, { evaluatePassword } from './PasswordStrengthIndicator';
import api from '../../services/api';

export default function AuthModal() {
  // mode: 'login' | 'register' | 'forgot'
  const [mode, setMode] = useState('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('demo@insurai.com');
  const [password, setPassword] = useState('DemoPass@123!');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Forgot password specific state
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState(null);

  const { login, register, loginWithGoogle } = useAuth();

  const isLogin = mode === 'login';
  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (isRegister) {
      const { isSatisfied } = evaluatePassword(password);
      if (!isSatisfied) {
        setError('Please satisfy all password security requirements (at least 8 characters, special character, number, uppercase, lowercase).');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match. Please ensure both password fields are identical.');
        return;
      }
    }

    setLoading(true);
    try {
      if (isLogin) {
        await login(email, password);
      } else if (isRegister) {
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
        const serverMsg = err.response?.data?.detail || err.response?.data?.error || err.response?.data?.message;
        setError(serverMsg || (isLogin ? 'Authentication failed. Please check your credentials.' : 'Registration failed. Please try again.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setForgotSuccess(null);
    setLoading(true);

    try {
      const res = await api.post('/auth/forgot-password', { email: forgotEmail });
      setForgotSuccess(res.data?.message || 'Verification link sent to your email.');
    } catch (err) {
      const serverMsg = err.response?.data?.detail || err.response?.data?.error || err.response?.data?.message;
      setError(serverMsg || 'Failed to request password reset link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = () => {
    setMode('login');
    setEmail('demo@insurai.com');
    setPassword('DemoPass@123!');
    setConfirmPassword('');
    setError(null);
  };

  return (
    <div
      className="min-h-screen flex overflow-hidden relative text-white"
      style={{ background: '#062327' }}
    >
      {/* ── Starfield ── */}
      <Starfield count={60} />

      {/* ── Background ambient gradients ── */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at 20% 50%, rgba(210,245,123,0.06) 0%, transparent 55%),
            radial-gradient(ellipse at 80% 30%, rgba(13,59,66,0.5) 0%, transparent 60%)
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
            transform: 'translate(10%, 5%)',
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
            className="flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full w-fit"
            style={{
              background: 'rgba(210,245,123,0.12)',
              border: '1.5px solid rgba(210,245,123,0.3)',
            }}
          >
            <Shield size={14} className="text-[#d2f57b]" />
            <span className="text-xs font-semibold text-[#d2f57b] tracking-wide">
              AI-Powered Insurance Intelligence
            </span>
          </div>

          <h1 className="text-5xl font-headline font-bold tracking-tight leading-tight mb-4 text-white">
            Understand Your<br />
            <span className="text-[#d2f57b]">Policy Fully.</span>
          </h1>

          <p className="text-base max-w-sm text-[#a2cbcf] leading-relaxed">
            Upload your health insurance policy and get grounded AI answers, red-flag detection, and cost simulations — instantly.
          </p>

          {/* Floating stats cards */}
          <div className="flex gap-4 mt-8">
            {[
              { label: 'Claim Accuracy', value: '96%' },
              { label: 'Policies Analyzed', value: '2K+' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="px-5 py-3.5 rounded-2xl bg-[#07262b]/80 border border-white/10 backdrop-blur-md shadow-xl"
              >
                <p className="text-2xl font-headline font-bold text-[#d2f57b]">{stat.value}</p>
                <p className="text-xs text-[#a2cbcf] mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT: Auth form ── */}
      <div
        className="w-full lg:w-[460px] flex-shrink-0 flex flex-col items-center justify-center p-6 lg:p-12 relative z-10 border-l border-white/10 overflow-y-auto"
        style={{
          background: 'rgba(5,29,33,0.85)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
        }}
      >
        <div className="w-full max-w-[360px] animate-slide-up my-auto py-6">
          {/* Brand */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center mb-3 p-1 bg-[#04181b] border-2 border-[#d2f57b] shadow-[0_0_24px_rgba(210,245,123,0.25)]">
              <img src="/favicon_io/android-chrome-192x192.png" alt="InsurAI Logo" className="w-full h-full object-contain rounded-xl" />
            </div>
            <h2 className="text-2xl font-headline font-bold text-white tracking-tight">
              InsurAI
            </h2>
            <p className="text-xs text-[#a2cbcf] mt-0.5">
              AI Insurance Policy Intelligence
            </p>
          </div>

          {/* Demo pill (only on login) */}
          {isLogin && (
            <div className="flex items-center justify-between rounded-2xl px-4 py-3 mb-6 bg-[#04181b] border border-[#d2f57b]/30 shadow-sm">
              <div className="min-w-0 pr-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#d2f57b] mb-0.5">
                  <KeyRound size={12} />
                  Quick Demo Access
                </div>
                <p className="text-[11px] text-[#a2cbcf]">
                  demo@insurai.com · DemoPass@123!
                </p>
              </div>
              <button
                type="button"
                id="auth-demo-btn"
                onClick={fillDemo}
                className="flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-full bg-[#d2f57b] text-[#062327] hover:bg-[#dbfa86] transition-all shadow-[0_2px_0_#062327] cursor-pointer"
              >
                Fill
              </button>
            </div>
          )}

          {/* Tab toggle (Login / Register) */}
          {!isForgot && (
            <div className="flex p-1 mb-5 rounded-full bg-[#04181b] border border-white/10">
              {[
                { label: 'Log In', m: 'login' },
                { label: 'Register', m: 'register' },
              ].map(({ label, m }) => {
                const active = mode === m;
                return (
                  <button
                    key={label}
                    id={`auth-tab-${m}`}
                    type="button"
                    onClick={() => {
                      setMode(m);
                      setError(null);
                    }}
                    className={`flex-1 py-2 text-xs font-semibold rounded-full transition-all duration-200 cursor-pointer ${
                      active
                        ? 'bg-[#d2f57b] text-[#062327] shadow-sm'
                        : 'text-[#a2cbcf] hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-2xl mb-4 text-xs leading-relaxed bg-rose-500/15 border border-rose-500/30 text-rose-300">
              <AlertTriangle className="flex-shrink-0 mt-0.5" size={14} />
              <span>{error}</span>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              FORGOT PASSWORD VIEW
              ════════════════════════════════════════════════════ */}
          {isForgot ? (
            <div className="space-y-4">
              <div className="text-left mb-2">
                <h3 className="text-lg font-bold text-white mb-1">Reset Password</h3>
                <p className="text-xs text-[#a2cbcf] leading-relaxed">
                  Enter your account email and we'll send a secure verification link to reset your password.
                </p>
              </div>

              {forgotSuccess ? (
                <div className="p-5 rounded-2xl bg-[#d2f57b]/10 border border-[#d2f57b]/30 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#d2f57b]">
                    <CheckCircle2 size={18} />
                    <span>Verification Link Sent</span>
                  </div>
                  <p className="text-xs text-[#a2cbcf] leading-relaxed">
                    We've dispatched a secure password reset link to <strong className="text-white">{forgotEmail}</strong>. Please check your email inbox and spam folder. Click the link inside to choose a new password.
                  </p>
                  <p className="text-[11px] text-[#6e9ea3]">
                    The verification link will expire in 15 minutes for your security.
                  </p>
                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setError(null);
                        setForgotSuccess(null);
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full text-xs font-bold bg-[#d2f57b] text-[#062327] hover:bg-[#dbfa86] transition-all cursor-pointer"
                    >
                      <ArrowLeft size={13} /> Return to Sign In
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotSuccess(null);
                        setError(null);
                      }}
                      className="text-[11px] text-[#a2cbcf] hover:text-white transition-colors text-center cursor-pointer py-1"
                    >
                      Didn't get an email? Try again
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a2cbcf] mb-1.5">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#6e9ea3]" />
                      <input
                        id="forgot-email"
                        type="email"
                        required
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full bg-[#04181b] border border-white/10 rounded-xl px-3 py-2.5 pl-10 text-sm text-white placeholder-[#558187] focus:outline-none focus:border-[#d2f57b] focus:ring-1 focus:ring-[#d2f57b] transition-all"
                      />
                    </div>
                  </div>

                  <button
                    id="forgot-submit-btn"
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-full text-sm font-bold bg-[#d2f57b] text-[#062327] border-[1.5px] border-[#062327] shadow-[0_3px_0_#062327] hover:bg-[#dbfa86] transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {loading && <Spinner size={14} className="text-[#062327]" />}
                    <span>{loading ? 'Sending Verification Link…' : 'Send Verification Link'}</span>
                    {!loading && <ArrowRight size={14} />}
                  </button>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setError(null);
                      }}
                      className="text-xs text-[#a2cbcf] hover:text-white inline-flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <ArrowLeft size={13} /> Back to Sign In
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            /* ══════════════════════════════════════════════════════
                LOGIN / REGISTER VIEW
                ════════════════════════════════════════════════════ */
            <>
              {/* Google Sign-in */}
              <div className="mb-5">
                <GoogleLoginButton
                  label={isLogin ? 'Sign in with Google' : 'Sign up with Google'}
                  onGoogleSuccess={loginWithGoogle}
                  onError={(err) => setError(err)}
                />
              </div>

              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">or with email</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              <form id="auth-form" onSubmit={handleSubmit} className="space-y-4">
                {isRegister && (
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a2cbcf] mb-1.5">
                      Full Name
                    </label>
                    <div className="relative">
                      <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#6e9ea3]" />
                      <input
                        id="auth-fullname"
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Dr. Arjun Verma"
                        autoComplete="name"
                        className="w-full bg-[#04181b] border border-white/10 rounded-xl px-3 py-2.5 pl-10 text-sm text-white placeholder-[#558187] focus:outline-none focus:border-[#d2f57b] focus:ring-1 focus:ring-[#d2f57b] transition-all"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a2cbcf] mb-1.5">
                    Email
                  </label>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#6e9ea3]" />
                    <input
                      id="auth-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      autoComplete="email"
                      className="w-full bg-[#04181b] border border-white/10 rounded-xl px-3 py-2.5 pl-10 text-sm text-white placeholder-[#558187] focus:outline-none focus:border-[#d2f57b] focus:ring-1 focus:ring-[#d2f57b] transition-all"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a2cbcf]">
                      Password
                    </label>
                    {isLogin && (
                      <button
                        type="button"
                        id="auth-forgot-password-link"
                        onClick={() => {
                          setMode('forgot');
                          setForgotEmail(email);
                          setError(null);
                        }}
                        className="text-[11px] text-[#d2f57b] hover:underline font-semibold cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#6e9ea3]" />
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete={isRegister ? 'new-password' : 'current-password'}
                      className="w-full bg-[#04181b] border border-white/10 rounded-xl px-3 py-2.5 pl-10 pr-10 text-sm text-white placeholder-[#558187] focus:outline-none focus:border-[#d2f57b] focus:ring-1 focus:ring-[#d2f57b] transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6e9ea3] hover:text-white transition-colors cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>

                  {/* Password Protection Layer & Live Strength Indicator on Register */}
                  {isRegister && (
                    <PasswordStrengthIndicator password={password} showDetails={true} idPrefix="auth-modal" />
                  )}
                </div>

                {isRegister && (
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a2cbcf] mb-1.5">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#6e9ea3]" />
                      <input
                        id="auth-confirm-password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        className="w-full bg-[#04181b] border border-white/10 rounded-xl px-3 py-2.5 pl-10 pr-10 text-sm text-white placeholder-[#558187] focus:outline-none focus:border-[#d2f57b] focus:ring-1 focus:ring-[#d2f57b] transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6e9ea3] hover:text-white transition-colors cursor-pointer"
                        aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                      >
                        {showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>

                    {/* Live Match / Mismatch status */}
                    {confirmPassword.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                        {password === confirmPassword ? (
                          <span className="text-[#d2f57b] font-medium flex items-center gap-1">
                            <CheckCircle2 size={12} /> Passwords match
                          </span>
                        ) : (
                          <span className="text-amber-400 font-medium flex items-center gap-1">
                            <AlertTriangle size={12} /> Passwords do not match yet
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {isRegister && (
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a2cbcf] mb-1.5">
                      Phone <span className="normal-case font-normal text-[#6e9ea3]">(optional)</span>
                    </label>
                    <div className="relative">
                      <Phone size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#6e9ea3]" />
                      <input
                        id="auth-phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+91 98765 43210"
                        autoComplete="tel"
                        className="w-full bg-[#04181b] border border-white/10 rounded-xl px-3 py-2.5 pl-10 text-sm text-white placeholder-[#558187] focus:outline-none focus:border-[#d2f57b] focus:ring-1 focus:ring-[#d2f57b] transition-all"
                      />
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    id="auth-submit-btn"
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-full text-sm font-bold bg-[#d2f57b] text-[#062327] border-[1.5px] border-[#062327] shadow-[0_3px_0_#062327] hover:bg-[#dbfa86] transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {loading && <Spinner size={14} className="text-[#062327]" />}
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
            </>
          )}

          <p className="text-center text-xs mt-6 text-[#6e9ea3]">
            Backend port: 5001 · <code className="font-mono text-[#a2cbcf]">npm run server</code>
          </p>
        </div>
      </div>
    </div>
  );
}
