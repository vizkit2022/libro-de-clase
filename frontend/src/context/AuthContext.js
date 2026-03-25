import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};

// En producción (Railway) Flask sirve el frontend en el mismo dominio → URL relativa
// En local apuntamos a localhost:5008
axios.defaults.baseURL = process.env.REACT_APP_API_URL || '';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [school, setSchool] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      axios.get('/api/auth/me')
        .then(({ data }) => { setUser(data.user); setSchool(data.school); })
        .catch(() => { localStorage.removeItem('token'); delete axios.defaults.headers.common['Authorization']; })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const { data } = await axios.post('/api/auth/login', { email, password });
    localStorage.setItem('token', data.access_token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`;
    setUser(data.user);
    setSchool(data.school);
    // Aplicar colores del colegio
    if (data.school) applySchoolTheme(data.school);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
    setSchool(null);
  };

  const applySchoolTheme = (schoolData) => {
    document.documentElement.style.setProperty('--color-primary', schoolData.primary_color || '#2563EB');
    document.documentElement.style.setProperty('--color-secondary', schoolData.secondary_color || '#1E40AF');
    document.documentElement.style.setProperty('--color-accent', schoolData.accent_color || '#3B82F6');
  };

  const updateSchool = (updatedSchool) => {
    setSchool(updatedSchool);
    applySchoolTheme(updatedSchool);
  };

  return (
    <AuthContext.Provider value={{ user, school, loading, login, logout, updateSchool }}>
      {children}
    </AuthContext.Provider>
  );
};
