import React, { useEffect, useState, useRef } from 'react';
import api from '../../services/api';
import { Spinner } from '../common/ui';

export default function GoogleLoginButton({
  onGoogleSuccess,
  onError,
  label = 'Continue with Google',
  disabled = false,
}) {
  const [loading, setLoading] = useState(false);
  const [clientId, setClientId] = useState(() => import.meta.env.VITE_GOOGLE_CLIENT_ID || '');
  const [gisReady, setGisReady] = useState(false);
  const googleBtnContainerRef = useRef(null);

  // Fetch clientId from backend if not present in env
  useEffect(() => {
    if (!clientId) {
      api.get('/auth/google/config')
        .then(res => {
          if (res.data?.client_id) {
            setClientId(res.data.client_id);
          }
        })
        .catch(err => console.warn('Could not fetch Google OAuth config:', err));
    }
  }, [clientId]);

  // Initialize Google Identity Services (GIS)
  useEffect(() => {
    if (!clientId) return;

    let mounted = true;

    const setupGIS = () => {
      if (!window.google?.accounts?.id || !mounted) return;

      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response) => {
            if (response?.credential) {
              try {
                setLoading(true);
                await onGoogleSuccess({ credential: response.credential });
              } catch (err) {
                const msg = err.response?.data?.detail || err.response?.data?.error || err.message || 'Google login failed.';
                onError?.(msg);
              } finally {
                setLoading(false);
              }
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        if (googleBtnContainerRef.current) {
          googleBtnContainerRef.current.innerHTML = '';
          window.google.accounts.id.renderButton(googleBtnContainerRef.current, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'continue_with',
            shape: 'pill',
            width: 340,
            logo_alignment: 'left',
          });
          setGisReady(true);
        }
      } catch (err) {
        console.warn('Google Identity initialization notice:', err);
      }
    };

    if (window.google?.accounts?.id) {
      setupGIS();
    } else {
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval);
          setupGIS();
        }
      }, 250);
      return () => {
        mounted = false;
        clearInterval(interval);
      };
    }

    return () => {
      mounted = false;
    };
  }, [clientId, onGoogleSuccess, onError]);

  const handleCustomClick = () => {
    if (disabled || loading) return;

    if (!clientId) {
      onError?.('Google OAuth is not configured. Missing Google Client ID.');
      return;
    }

    setLoading(true);

    // Option 1: Try Google Code Client popup
    if (window.google?.accounts?.oauth2) {
      try {
        const client = window.google.accounts.oauth2.initCodeClient({
          client_id: clientId,
          scope: 'openid email profile',
          ux_mode: 'popup',
          callback: async (response) => {
            if (response?.code) {
              try {
                await onGoogleSuccess({
                  code: response.code,
                  redirect_uri: 'postmessage',
                });
              } catch (err) {
                onError?.(err.response?.data?.detail || err.response?.data?.error || err.message || 'Google authorization failed.');
              } finally {
                setLoading(false);
              }
            } else if (response?.error) {
              setLoading(false);
              if (response.error !== 'popup_closed_by_user') {
                onError?.(`Google error: ${response.error_description || response.error}`);
              }
            }
          },
          error_callback: (err) => {
            setLoading(false);
            console.warn('Google popup notice:', err);
            // Fallback to full-page redirect if popup is blocked
            const redirectUri = window.location.origin;
            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile`;
            window.location.href = authUrl;
          },
        });
        client.requestCode();
        return;
      } catch (e) {
        console.warn('Could not launch Google CodeClient, attempting redirect fallback:', e);
      }
    }

    // Option 2: Full page OAuth redirect fallback
    const redirectUri = window.location.origin;
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile`;
    window.location.href = authUrl;
  };

  return (
    <div className="w-full flex flex-col items-center justify-center">
      {/* Official GIS rendered button */}
      <div
        ref={googleBtnContainerRef}
        className={`w-full flex items-center justify-center min-h-[44px] ${gisReady ? 'block' : 'hidden'}`}
      />

      {/* Fallback styled button displayed while GIS is loading or if script blocked */}
      {!gisReady && (
        <button
          id="google-login-btn"
          type="button"
          onClick={handleCustomClick}
          disabled={disabled || loading}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-full text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md active:scale-[0.99] disabled:opacity-50"
          style={{
            background: '#ffffff',
            color: '#1f2937',
            border: '1.5px solid rgba(255,255,255,0.2)',
          }}
        >
          {loading ? (
            <Spinner size={16} className="text-[#062327]" />
          ) : (
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
          )}
          <span>{loading ? 'Connecting to Google…' : label}</span>
        </button>
      )}
    </div>
  );
}

