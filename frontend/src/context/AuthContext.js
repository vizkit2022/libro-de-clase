import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

export const AuthContext = createContext();

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};

// En producción (Railway) Flask sirve el frontend en el mismo dominio → URL relativa
// En local apuntamos a localhost:5008
axios.defaults.baseURL = process.env.REACT_APP_API_URL || '';

// Año académico elegido en la barra lateral. Se recuerda entre visitas, pero
// el navegador puede negarse a guardar (modo privado, almacenamiento lleno).
const CLAVE_ANIO = 'kv_anio';
const ROLES_CON_ANIOS = ['admin', 'directivo', 'profesor'];

function leerAnioGuardado() {
  try {
    const v = parseInt(localStorage.getItem(CLAVE_ANIO), 10);
    return Number.isFinite(v) && v > 1900 ? v : null;
  } catch { return null; }
}

function guardarAnio(v) {
  try { localStorage.setItem(CLAVE_ANIO, String(v)); } catch { /* sin almacenamiento */ }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [school, setSchool] = useState(null);
  const [loading, setLoading] = useState(true);
  const [anio, setAnioState] = useState(() => leerAnioGuardado() || new Date().getFullYear());
  const [anios, setAnios] = useState([]);

  const setAnio = useCallback((v) => {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return;
    setAnioState(n);
    guardarAnio(n);
  }, []);

  // Trae los años del colegio. Si falla (backend viejo, sin red), la app sigue
  // funcionando con el año guardado o el año calendario.
  const recargarAnios = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/anios');
      const lista = Array.isArray(data?.anios) ? data.anios : [];
      setAnios(lista);
      setAnioState(actual => {
        const guardado = leerAnioGuardado();
        const elegido = guardado ?? actual;
        if (lista.some(a => a.year === elegido)) return elegido;
        const porDefecto = data?.actual || new Date().getFullYear();
        guardarAnio(porDefecto);
        return porDefecto;
      });
      return lista;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (user && ROLES_CON_ANIOS.includes(user.role)) recargarAnios();
    else setAnios([]);
  }, [user, recargarAnios]);

  const anioInfo = anios.find(a => a.year === anio) || null;
  const anioCerrado = anioInfo?.estado === 'cerrado';

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
    // Deja el cierre de sesión en el historial de auditoría. No se espera la
    // respuesta: salir nunca debe fallar por la red.
    try {
      if (axios.defaults.headers.common['Authorization']) {
        const p = axios.post('/api/auth/logout');
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch { /* sin red: igual se cierra la sesión local */ }
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
    <AuthContext.Provider value={{
      user, school, loading, login, logout, updateSchool,
      anio, setAnio, anios, recargarAnios, anioInfo, anioCerrado,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
