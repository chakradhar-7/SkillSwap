import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));
  // True once the user has filled out their profile (has skills to teach)
  const [profileComplete, setProfileComplete] = useState(false);

  const clearSession = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setProfileComplete(false);
  };

  // Reloads the current user. Only the very first load shows the app-wide
  // loading screen, so later reloads don't unmount the whole app.
  const loadUser = useCallback(async () => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      setUser(null);
      setProfileComplete(false);
      setLoading(false);
      return;
    }

    setToken(storedToken);
    try {
      const { data: userData } = await api.get('/auth');
      if (!userData.role) {
        userData.role = 'user';
      }
      setUser(userData);
      setProfileComplete(Array.isArray(userData.skillsToTeach) && userData.skillsToTeach.length > 0);
    } catch (err) {
      console.error('Failed to load user', err);
      clearSession();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', res.data.token);
    await loadUser();
  };

  const register = async (username, email, password) => {
    const res = await api.post('/auth/register', { username, email, password });
    localStorage.setItem('token', res.data.token);
    await loadUser();
  };

  const logout = () => {
    clearSession();
  };

  // Apply a small change to the cached user (e.g. a new credit balance pushed by the server)
  const updateUser = useCallback((patch) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const value = {
    user,
    token,
    login,
    register,
    logout,
    loading,
    isAuthenticated: !!token && !!user,
    loadUser,
    updateUser,
    profileComplete,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
