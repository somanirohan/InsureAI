import React, { useState, useEffect } from 'react';
import { Shield, Lock, Eye, EyeOff, CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft, KeyRound } from 'lucide-react';
import api from '../../services/api';
import { Spinner } from '../common/ui';
import { LiquidBlob, Starfield } from '../common/LiquidBlob';
import PasswordStrengthIndicator, { evaluatePassword } from './PasswordStrengthIndicator';

export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [loadingVerify, setLoadingVerify] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState('');
  const [verifyError, setVerifyError] = useState(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token') || '';
    setToken(tokenParam);

    if (!tokenParam) {
      setLoadingVerify(false);
      setTokenValid(false);
      setVerifyError('Missing password reset verification token. Please use the link sent to your email.');
      return;
    }

    const verifyToken = async () => {
      try {
        setLoadingVerify(true);
        const res = await api.get(`/auth/verify-reset-token?token=${encodeURIComponent(tokenParam)}`);
        if (res.data?.valid) {
          setTokenValid(true);
          setMaskedEmail(res.data.email || '');
          setVerifyError(null);
        } else {
          setTokenValid(false);
          setVerifyError(res.data?.message || 'Verification link is invalid or expired.');
        }
      } catch (err) {
        setTokenValid(false);
        const serverMsg = err.response?.data?.detail || err.response?.data?.error || err.response?.data?.message;
        setVerifyError(serverMsg || 'This verification link is invalid or has expired. Please request a new one.');
      } finally {
        setLoadingVerify(false);
      }
    };

    verifyToken();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);

    // Validate password protection criteria
    const { isSatisfied, label } = evaluatePassword(newPassword);
    if (!isSatisfied) {
      setSubmitError('Please satisfy all password security requirements before proceeding (minimum 8 characters, special character, number, uppercase, lowercase).');
      return;
    }

    if (newPassword !== confirmPassword) {
      setSubmitError('The entered passwords do not match. Please verify both fields.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/auth/reset-password', {
        token,
        new_password: newPassword,
      });

      if (res.data?.success) {
        setSuccess(true);
      }
    } catch (err) {
      const serverMsg = err.response?.data?.detail || err.response?.data?.error || err.response?.data?.message;
      setSubmitError(serverMsg || 'Failed to reset password. The link may have expired.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoHome = () => {
    window.location.href = '/';
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 sm:p-6 overflow-hidden relative text-white selection:bg-[#d2f57b] selection:text-[#062327]"
      style={{ background: '#062327' }}
    >
      {/* ── Starfield background ── */}
      <Starfield count={60} />

      {/* ── Background ambient gradients ── */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at 30% 20%, rgba(210,245,123,0.08) 0%, transparent 50%),
            radial-gradient(ellipse at 70% 80%, rgba(13,59,66,0.6) 0%, transparent 60%)
          `,
        }}
      />

      {/* ── Ambient Liquid Blob ── */}
      <div
        aria-hidden
        className="fixed pointer-events-none"
        style={{
          right: '-10%',
          bottom: '-15%',
          width: 'clamp(320px, 45vw, 600px)',
          height: 'clamp(320px, 45vw, 600px)',
          opacity: 0.18,
        }}
      >
        <LiquidBlob className="w-full h-full" />
      </div>

      <div
        className="w-full max-w-[460px] rounded-[32px] p-6 sm:p-9 relative z-10 animate-slide-up border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
        style={{
          background: 'rgba(5,29,33,0.92)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
        }}
      >
        {/* Brand header */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#04181b] border-2 border-[#d2f57b] p-1 flex items-center justify-center mb-3 shadow-[0_0_24px_rgba(210,245,123,0.25)]">
            <img src="/favicon_io/apple-touch-icon.png" alt="InsurAI Logo" className="w-full h-full object-contain rounded-xl" />
          </div>
          <h1 className="text-2xl font-headline font-bold text-white tracking-tight">
            InsurAI
          </h1>
          <p className="text-xs text-[#a2cbcf] mt-0.5">
            Password Protection & Verification
          </p>
        </div>

        {/* ── Loading verification state ── */}
        {loadingVerify && (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
            <Spinner size={24} className="text-[#d2f57b]" />
            <p className="text-sm text-[#a2cbcf]">Verifying security token…</p>
          </div>
        )}

        {/* ── Invalid or Expired Token State ── */}
        {!loadingVerify && !tokenValid && !success && (
          <div className="text-center py-4 space-y-4">
            <div className="w-14 h-14 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
              <AlertTriangle size={26} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white mb-1.5">Verification Link Expired</h2>
              <p className="text-sm text-[#a2cbcf] leading-relaxed">
                {verifyError || 'This password reset verification link is invalid or has already expired.'}
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleGoHome}
                className="w-full btn-pill-lime py-3 px-5 flex items-center justify-center gap-2 text-sm font-bold shadow-md cursor-pointer"
              >
                <ArrowLeft size={16} />
                <span>Return to Home & Request New Link</span>
              </button>
            </div>
          </div>
        )}

        {/* ── Success State ── */}
        {success && (
          <div className="text-center py-4 space-y-4">
            <div className="w-16 h-16 rounded-full bg-[#d2f57b]/20 border border-[#d2f57b]/50 flex items-center justify-center mx-auto text-[#d2f57b] shadow-[0_0_30px_rgba(210,245,123,0.3)]">
              <CheckCircle2 size={32} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white mb-1.5">Password Reset Complete!</h2>
              <p className="text-sm text-[#a2cbcf] leading-relaxed">
                Your new password satisfies all security layers and has been updated in our encrypted database. You can now log in with your updated credentials.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleGoHome}
                className="w-full btn-pill-lime py-3 px-5 flex items-center justify-center gap-2 text-sm font-bold shadow-md cursor-pointer"
              >
                <span>Proceed to Sign In</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── Reset Password Form ── */}
        {!loadingVerify && tokenValid && !success && (
          <div>
            <div className="mb-5">
              <h2 className="text-lg font-bold text-white mb-1">Set New Password</h2>
              <p className="text-xs text-[#a2cbcf]">
                Resetting password for account{' '}
                <span className="font-semibold text-white">{maskedEmail}</span>
              </p>
            </div>

            {submitError && (
              <div className="flex items-start gap-2.5 p-3 rounded-2xl mb-4 bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs leading-relaxed">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* New Password Field */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a2cbcf] mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#6e9ea3]" />
                  <input
                    id="reset-new-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new strong password"
                    autoComplete="new-password"
                    className="w-full bg-[#04181b] border border-white/10 rounded-xl px-3 py-2.5 pl-10 pr-10 text-sm text-white placeholder-[#558187] focus:outline-none focus:border-[#d2f57b] focus:ring-1 focus:ring-[#d2f57b] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6e9ea3] hover:text-white transition-colors cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>

                {/* Password Protection Layer & Strength Checklist */}
                <PasswordStrengthIndicator password={newPassword} showDetails={true} idPrefix="reset-new" />
              </div>

              {/* Confirm Password Field */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a2cbcf] mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <KeyRound size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#6e9ea3]" />
                  <input
                    id="reset-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    autoComplete="new-password"
                    className="w-full bg-[#04181b] border border-white/10 rounded-xl px-3 py-2.5 pl-10 pr-10 text-sm text-white placeholder-[#558187] focus:outline-none focus:border-[#d2f57b] focus:ring-1 focus:ring-[#d2f57b] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6e9ea3] hover:text-white transition-colors cursor-pointer"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-[11px] text-rose-400 mt-1.5 flex items-center gap-1">
                    <AlertTriangle size={12} /> Passwords do not match yet
                  </p>
                )}
                {confirmPassword && newPassword === confirmPassword && (
                  <p className="text-[11px] text-[#d2f57b] mt-1.5 flex items-center gap-1">
                    <CheckCircle2 size={12} /> Passwords match!
                  </p>
                )}
              </div>

              {/* Submit button */}
              <div className="pt-2">
                <button
                  id="reset-password-submit-btn"
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-full text-sm font-bold bg-[#d2f57b] text-[#062327] border-[1.5px] border-[#062327] shadow-[0_3px_0_#062327] hover:bg-[#dbfa86] transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                >
                  {submitting && <Spinner size={15} className="text-[#062327]" />}
                  <span>{submitting ? 'Updating Password…' : 'Update Password & Protect Account'}</span>
                  {!submitting && <ArrowRight size={15} />}
                </button>
              </div>
            </form>

            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={handleGoHome}
                className="text-xs text-[#a2cbcf] hover:text-white inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <ArrowLeft size={13} /> Back to Sign In
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
