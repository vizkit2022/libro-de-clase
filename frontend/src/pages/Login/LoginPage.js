import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './LoginPage.css';

// Las mismas fotos del sitio público: el ingreso se siente parte de Kolevia
const FONDOS = [
  '/inicio/img/aula-1.jpg',
  '/inicio/img/aula-2.jpg',
  '/inicio/img/aula-3.jpg',
];

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verClave, setVerClave] = useState(false);
  const [lamina, setLamina] = useState(0);

  useEffect(() => {
    if (user) {
      navigate(user.role === 'super_admin' ? '/super-admin' : '/dashboard');
    }
  }, [user, navigate]);

  // Fondo que rota lento, salvo que el sistema pida menos movimiento
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const reloj = setInterval(
      () => setLamina(i => (i + 1) % FONDOS.length), 7000);
    return () => clearInterval(reloj);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(form.email, form.password);
      navigate(data.user?.role === 'super_admin' ? '/super-admin' : '/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'No pudimos iniciar sesión. Revisa tus datos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="kv-login">

      {/* Panel izquierdo: marca sobre las fotos del sitio */}
      <aside className="kv-marca">
        <div className="kv-fotos" aria-hidden="true">
          {FONDOS.map((src, i) => (
            <div key={src} className={`kv-foto ${i === lamina ? 'act' : ''}`}
                 style={{ backgroundImage: `url(${src})` }} />
          ))}
          <div className="kv-velo" />
        </div>

        <div className="kv-marca-cont">
          <a href="/" className="kv-logo">
            <img src="/inicio/img/kolevia-isotipo.png" alt="" width="44" height="44" />
            <span className="kv-lock">
              <b>Kolevia</b>
              <i>Tecnología para educar</i>
            </span>
          </a>

          <div className="kv-pitch">
            <h1>Todo tu colegio,<br /><em>conectado</em></h1>
            <p>
              Libro de clases, calificaciones, convivencia escolar y carga horaria
              docente. Lo que cargas una vez, no se vuelve a escribir.
            </p>
            <ul>
              <li>Carga horaria según la Tabla Legal del MINEDUC</li>
              <li>Convivencia escolar con los anexos oficiales</li>
              <li>Informes en Word y PDF con el logo del colegio</li>
            </ul>
          </div>

          <p className="kv-pie">
            ¿Tu colegio todavía no usa Kolevia?{' '}
            <a href="/#contacto">Pide una demostración</a>
          </p>
        </div>
      </aside>

      {/* Panel derecho: el formulario */}
      <main className="kv-acceso">
        <div className="kv-caja">
          <a href="/" className="kv-logo kv-logo-movil">
            <img src="/inicio/img/kolevia-isotipo.png" alt="" width="38" height="38" />
            <span className="kv-lock">
              <b>Kolevia</b>
              <i>Tecnología para educar</i>
            </span>
          </a>

          <h2>Ingresa a tu cuenta</h2>
          <p className="kv-sub">Usa el correo que te entregó tu establecimiento.</p>

          {error && (
            <div className="kv-error" role="alert">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2.2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v5M12 16.5v.01" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="kv-campo">
              <label htmlFor="correo">Correo electrónico</label>
              <input
                id="correo" type="email" autoComplete="username" required autoFocus
                placeholder="nombre@colegio.cl"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div className="kv-campo">
              <label htmlFor="clave">Contraseña</label>
              <div className="kv-clave">
                <input
                  id="clave" type={verClave ? 'text' : 'password'} required
                  autoComplete="current-password" placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                />
                <button type="button" onClick={() => setVerClave(v => !v)}
                        aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                  {verClave ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <path d="M6.6 6.6A18.5 18.5 0 0 0 2 12s3 8 10 8a9.1 9.1 0 0 0 5.4-1.6M2 2l20 20" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button type="submit" className="kv-entrar" disabled={loading}>
              {loading ? <span className="kv-girando" /> : 'Ingresar'}
            </button>
          </form>

          <p className="kv-ayuda">
            ¿Olvidaste tu contraseña? Pídele a la dirección de tu colegio que la
            restablezca.
          </p>
        </div>

        <p className="kv-volver">
          <a href="/">← Volver al sitio</a>
        </p>
      </main>
    </div>
  );
}
