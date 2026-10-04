import axios from 'axios';
import { API_URL } from '../config';

export const AUTH_MESSAGE_KEY = 'authMessage';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['x-auth-token'] = token;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// When the session expires or the account is banned, sign out and send the
// user to the login page with an explanation instead of failing silently.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const data = error.response?.data || {};
    const isBan = status === 403 && data.banReason;

    if (localStorage.getItem('token') && (status === 401 || isBan)) {
      localStorage.removeItem('token');
      try {
        sessionStorage.setItem(
          AUTH_MESSAGE_KEY,
          isBan
            ? `Your account has been banned. Reason: ${data.banReason}`
            : 'Your session has expired. Please log in again.'
        );
      } catch {
        // storage unavailable - the redirect still works
      }
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
