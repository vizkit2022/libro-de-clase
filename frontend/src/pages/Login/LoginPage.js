import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, rutaInicial } from '../../context/AuthContext';
import PanelMarca, { LogoMovil, Aviso, OjoClave } from './PanelMarca';
import { BloqueGoogle, useConfigRegistro } from '../Registro/BotonGoogle';
import './LoginPage.css';

export default function LoginPage() {
  const { login, user, school } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verClave, setVerClave] = useState(false);
  const config = useConfigRegistro();

  // Toda sesión que se abre acá (clave o Google) termina en este salto
  useEffect(() => {
    if (user) navigate(rutaInicial(user, school));
  }, [user, school, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.email, form.password);
    } catch (err) {
      setError(err.response?.data?.error || 'No pudimos iniciar sesión. Revisa tus datos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="kv-login">

      {/* Panel izquierdo: marca sobre las fotos del sitio */}
      <PanelMarca
        titulo={<>Todo tu colegio,<br /><em>conectado</em></>}
        texto="Libro de clases, calificaciones, convivencia escolar y carga horaria docente. Lo que cargas una vez, no se vuelve a escribir."
        puntos={[
          'Carga horaria según la Tabla Legal del MINEDUC',
          'Convivencia escolar con los anexos oficiales',
          'Informes en Word y PDF con el logo del colegio',
        ]}
        pie={<>¿Tu colegio todavía no usa Recreo Edu?{' '}<a href="/#contacto">Pide una demostración</a></>}
      />

      {/* Panel derecho: el formulario */}
      <main className="kv-acceso">
        <div className="kv-caja">
          <LogoMovil />

          <h2>Ingresa a tu cuenta</h2>
          <p className="kv-sub">Usa el correo que te entregó tu establecimiento.</p>

          <Aviso>{error}</Aviso>

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
                  <OjoClave visible={verClave} />
                </button>
              </div>
            </div>

            <button type="submit" className="kv-entrar" disabled={loading}>
              {loading ? <span className="kv-girando" /> : 'Ingresar'}
            </button>
          </form>

          <BloqueGoogle clientId={config?.google_client_id} onError={setError} />

          <p className="kv-nuevo">
            ¿Nuevo aquí?{' '}
            <Link to="/registro">
              {config?.dias_prueba ? `Regístrate y prueba ${config.dias_prueba} días` : 'Regístrate y prueba gratis'}
            </Link>
          </p>

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
