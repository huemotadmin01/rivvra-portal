import { createContext, useState, useEffect } from 'react';
import api from '../services/api';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('huemot_user');
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {}
    }
    // Verify with server
    api.get('/auth/me')
      .then(res => {
        setUser(res.data);
        localStorage.setItem('huemot_user', JSON.stringify(res.data));
      })
      .catch(() => {
        setUser(null);
        localStorage.removeItem('huemot_user');
        localStorage.removeItem('huemot_token');
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    setUser(res.data.user);
    localStorage.setItem('huemot_token', res.data.token);
    localStorage.setItem('huemot_user', JSON.stringify(res.data.user));
    return res.data;
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    setUser(null);
    localStorage.removeItem('huemot_token');
    localStorage.removeItem('huemot_user');
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
