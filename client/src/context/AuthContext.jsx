import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('medshield_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('medshield_token'));
  const [loading, setLoading] = useState(true);

  const [securityStatus, setSecurityStatus] = useState(null);

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
          setUser(res.data.user);
          localStorage.setItem('medshield_user', JSON.stringify(res.data.user));
          // Proactively fetch security metrics
          try {
            const secRes = await api.get('/auth/security-status');
            setSecurityStatus(secRes.data);
          } catch (e) {
            // Ignore security status failure
          }
        }
      } catch (err) {
        // Session not found or token expired
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
    const res = await api.post('/auth/login', { email, password });
    const { token: newToken, user: newUser } = res.data;
    if (newToken) {
      localStorage.setItem('medshield_token', newToken);
      setToken(newToken);
    }
    localStorage.setItem('medshield_user', JSON.stringify(newUser));
    setUser(newUser);
    fetchSecurityStatus();
    return res.data;
  };

  const register = async (fullName, email, password, phone) => {
    const res = await api.post('/auth/register', {
      full_name: fullName,
      email,
      password,
      phone,
    });
    const { token: newToken, user: newUser } = res.data;
    if (newToken) {
      localStorage.setItem('medshield_token', newToken);
      setToken(newToken);
    }
    localStorage.setItem('medshield_user', JSON.stringify(newUser));
    setUser(newUser);
    fetchSecurityStatus();
    return res.data;
  };

  const logout = async () => {
    try {
      // Invalidate HttpOnly cookie on server
      await api.post('/auth/logout');
    } catch (err) {
      console.warn('Server logout failed, clearing local state anyway:', err);
    } finally {
      localStorage.removeItem('medshield_token');
      localStorage.removeItem('medshield_user');
      setToken(null);
      setUser(null);
      setSecurityStatus(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, securityStatus, fetchSecurityStatus }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
