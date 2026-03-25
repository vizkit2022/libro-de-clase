import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './LoginPage.css';

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      navigate(user.role === 'super_admin' ? '/super-admin' : '/dashboard');
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(form.email, form.password);
      navigate(data.user?.role === 'super_admin' ? '/super-admin' : '/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (role) => {
    const demos = {
      superadmin: { email: 'superadmin@sistema.cl', password: 'super123' },
      admin: { email: 'admin@sanpatricio.cl', password: 'admin123' },
      directivo: { email: 'directivo@sanpatricio.cl', password: 'dir123' },
      profesor: { email: 'mvaldes@sanpatricio.cl', password: 'prof123' },
      alumno: { email: 'pedro.alvarado@gmail.com', password: 'alumno123' },
    };
    setForm(demos[role]);
  };

  return (
    <div className="login-page">
      {/* Left: ilustración */}
      <div className="login-illustration">
        <div className="illustration-content">
          <div className="big-emoji">🏫</div>
          <h1>Libro de Clases Digital</h1>
          <p>Gestión escolar moderna, simple y eficiente para tu colegio</p>
          <div className="features-list">
            <div className="feature-item"><span>✅</span> Calificaciones en tiempo real</div>
            <div className="feature-item"><span>✅</span> Hoja de vida del alumno</div>
            <div className="feature-item"><span>✅</span> Anotaciones y reportes</div>
            <div className="feature-item"><span>✅</span> Multi-colegio y multi-perfil</div>
          </div>
        </div>
        <div className="shapes">
          <div className="shape shape-1" />
          <div className="shape shape-2" />
          <div className="shape shape-3" />
        </div>
      </div>

      {/* Right: formulario */}
      <div className="login-form-side">
        <div className="login-card">
          <div className="login-logo">📚</div>
          <h2>Bienvenido</h2>
          <p className="login-subtitle">Ingresa tus credenciales para acceder</p>

          {error && <div className="error-banner">⚠️ {error}</div>}

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label>Correo electrónico</label>
              <input
                type="email"
                placeholder="correo@colegio.cl"
                value={form.email}
                onChange={e => setForm({...form, email: e.target.value})}
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Contraseña</label>
              <input
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm({...form, password: e.target.value})}
                required
              />
            </div>
            <button type="submit" className="btn-login" disabled={loading}>
              {loading ? <span className="spinner-sm" /> : '🔐 Ingresar'}
            </button>
          </form>

          {/* Accesos rápidos demo */}
          <div className="demo-section">
            <p className="demo-label">Accesos de prueba</p>
            <div className="demo-buttons">
              <button onClick={() => fillDemo('superadmin')} className="demo-btn" style={{background:'#6366f1',color:'#fff',border:'none'}}>⚡ Super Admin</button>
              <button onClick={() => fillDemo('admin')} className="demo-btn admin">Admin</button>
              <button onClick={() => fillDemo('directivo')} className="demo-btn directivo">Directivo</button>
              <button onClick={() => fillDemo('profesor')} className="demo-btn profesor">Profesor</button>
              <button onClick={() => fillDemo('alumno')} className="demo-btn alumno">Alumno</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
