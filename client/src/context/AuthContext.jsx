import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

const normalizeUser = (u) => {
  if (!u) return null;
  const uid = u._id || u.id;
  return { ...u, _id: uid, id: uid };
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('insurai_user') || localStorage.getItem('medshield_user');
      if (saved && saved !== 'undefined' && saved !== 'null') {
        return normalizeUser(JSON.parse(saved));
      }
      return null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => {
    try {
      const saved = localStorage.getItem('insurai_token') || localStorage.getItem('medshield_token');
      return (saved && saved !== 'undefined' && saved !== 'null') ? saved : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [securityStatus, setSecurityStatus] = useState(null);

  const clearLegacyRecommendationCache = () => {
    try {
      localStorage.removeItem('insurai_latest_recommendations');
      localStorage.removeItem('insurai_compare_recommendations');
    } catch {}
  };

  const fetchSecurityStatus = async () => {
    try {
      const res = await api.get('/auth/security-status');
      setSecurityStatus(res.data);
      return res.data;
    } catch (err) {
      console.warn('Failed to fetch security status:', err);
      return null;
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Validate active session via HttpOnly cookie or token header
        const res = await api.get('/auth/me');
        if (res.data?.user) {
          const normalized = normalizeUser(res.data.user);
          setUser(normalized);
          localStorage.setItem('insurai_user', JSON.stringify(normalized));
          try {
            const secRes = await api.get('/auth/security-status');
            setSecurityStatus(secRes.data);
          } catch (e) {
            // Ignore security status failure
          }
        }
      } catch (err) {
        // Session not found or token expired
        localStorage.removeItem('insurai_token');
        localStorage.removeItem('insurai_user');
        localStorage.removeItem('medshield_token');
        localStorage.removeItem('medshield_user');
        setUser(null);
        setToken(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (email, password) => {
    clearLegacyRecommendationCache();
    const res = await api.post('/auth/login', { email, password });
    const { token: newToken, user: newUser } = res.data;
    if (newToken) {
      localStorage.setItem('insurai_token', newToken);
      localStorage.setItem('medshield_token', newToken);
      setToken(newToken);
    }
    if (newUser) {
      const normalized = normalizeUser(newUser);
      localStorage.setItem('insurai_user', JSON.stringify(normalized));
      localStorage.setItem('medshield_user', JSON.stringify(normalized));
      setUser(normalized);
    }
    fetchSecurityStatus();
    return res.data;
  };

  const register = async (fullName, email, password, phone) => {
    clearLegacyRecommendationCache();
    const res = await api.post('/auth/register', {
      full_name: fullName,
      email,
      password,
      phone: phone || null,
    });
    const { token: newToken, user: newUser } = res.data;
    if (newToken) {
      localStorage.setItem('insurai_token', newToken);
      localStorage.setItem('medshield_token', newToken);
      setToken(newToken);
    }
    if (newUser) {
      const normalized = normalizeUser(newUser);
      localStorage.setItem('insurai_user', JSON.stringify(normalized));
      localStorage.setItem('medshield_user', JSON.stringify(normalized));
      setUser(normalized);
    }
    fetchSecurityStatus();
    return res.data;
  };

  const loginWithGoogle = async (googlePayload) => {
    clearLegacyRecommendationCache();
    const res = await api.post('/auth/google', googlePayload);
    const { token: newToken, user: newUser } = res.data;
    if (newToken) {
      localStorage.setItem('insurai_token', newToken);
      localStorage.setItem('medshield_token', newToken);
      setToken(newToken);
    }
    if (newUser) {
      const normalized = normalizeUser(newUser);
      localStorage.setItem('insurai_user', JSON.stringify(normalized));
      localStorage.setItem('medshield_user', JSON.stringify(normalized));
      setUser(normalized);
    }
    fetchSecurityStatus();
    return res.data;
  };

  const logout = async () => {
    clearLegacyRecommendationCache();
    try {
      // Invalidate HttpOnly cookie on server
      await api.post('/auth/logout');
    } catch (err) {
      console.warn('Server logout failed, clearing local state anyway:', err);
    } finally {
      localStorage.removeItem('insurai_token');
      localStorage.removeItem('insurai_user');
      localStorage.removeItem('medshield_token');
      localStorage.removeItem('medshield_user');
      setToken(null);
      setUser(null);
      setSecurityStatus(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        loginWithGoogle,
        logout,
        securityStatus,
        fetchSecurityStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
