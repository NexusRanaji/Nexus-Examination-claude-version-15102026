import React, { createContext, useState, useEffect, useContext } from 'react';
import API from '../services/api';
import { getAuthToken, getAuthUser, setAuthSession, clearAuthSession } from '../services/auth';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => getAuthUser());
  const [token, setToken] = useState(() => getAuthToken());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkLoggedIn = async () => {
      const activeToken = getAuthToken();
      if (activeToken) {
        try {
          const res = await API.get('/auth/me');
          if (res.ok && res.data.user) {
            setUser(res.data.user);
            setAuthSession(activeToken, res.data.user);
          } else {
            logout();
          }
        } catch (err) {
          console.error('Failed to verify profile session:', err);
          logout();
        }
      }
      setLoading(false);
    };
    checkLoggedIn();
  }, [token]);

  const login = async (identifier, password) => {
    const res = await API.post('/auth/login', { username: identifier, password });
    if (res.ok && res.data.success) {
      setToken(res.data.token);
      setUser(res.data.user);
      setAuthSession(res.data.token, res.data.user);
    }
    return res.data;
  };

  const studentLogin = async (username, password) => {
    return login(username, password);
  };

  const facultyLogin = async (username, password) => {
    return login(username, password);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    clearAuthSession();
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, studentLogin, facultyLogin, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
