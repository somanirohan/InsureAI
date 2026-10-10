import axios from 'axios';
import { API_BASE_URL } from '../constants';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
  },
});

// Interceptor to inject JWT token as fallback (dual authentication) and anti-CSRF header
api.interceptors.request.use(
  (config) => {
    config.headers['X-Requested-With'] = 'XMLHttpRequest';
    const token = localStorage.getItem('insurai_token') || localStorage.getItem('medshield_token');
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor to handle expired tokens
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
        localStorage.removeItem('insurai_token');
        localStorage.removeItem('insurai_user');
        localStorage.removeItem('medshield_token');
        localStorage.removeItem('medshield_user');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
