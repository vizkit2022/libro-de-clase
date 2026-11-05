import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth, rutaInicial } from '../../context/AuthContext';
import { msgError } from '../../components/UI/Modal';
import PanelMarca, { LogoMovil, Aviso, OjoClave } from '../Login/PanelMarca';
import { BloqueGoogle, useConfigRegistro } from './BotonGoogle';
import '../Login/LoginPage.css';

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validar(f) {
  const e = {};
  if (!f.nombre.trim()) e.nombre = 'Escribe tu nombre.';
  if (!f.apellido.trim()) e.apellido = 'Escribe tu apellido.';
  if (!f.email.trim()) e.email = 'Escribe tu correo.';
  else if (!CORREO.test(f.email.trim())) e.email = 'Ese correo no parece válido. Revisa que tenga @ y dominio.';
  if (!f.password) e.password = 'Elige una contraseña.';
  else if (f.password.length < 8) e.password = 'Debe tener al menos 8 caracteres.';
  return e;
}

function Campo({ id, label, error, nota, children }) {
  return (
    <div className="kv-campo">
      <label htmlFor={id}>{label}</label>
      {children}
      {error
        ? <span className="kv-campo-error" id={`${id}-error`}>{error}</span>
        : nota && <span className="kv-campo-nota" id={`${id}-nota`}>{nota}</span>}
    </div>
  );
}

export default function RegistroPage() {
  const { user, school, iniciarSesion } = useAuth();
  const navigate = useNavigate();
  const config = useConfigRegistro();
  const [form, setForm] = useState({ nombre: '', apellido: '', email: '', password: '' });
  const [errores, setErrores] = useState({});
  const [error, setError] = useState('');
  const [correoExiste, setCorreoExiste] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [verClave, setVerClave] = useState(false);

  useEffect(() => {
    if (user) navigate(rutaInicial(user, school), { replace: true });
  }, [user, school, navigate]);

  const set = (k) => (e) => {
    const v = e.target.value;
    setForm(f => ({ ...f, [k]: v }));
    if (errores[k]) setErrores(x => ({ ...x, [k]: undefined }));
  };

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setCorreoExiste(false);
    const encontrados = validar(form);
    setErrores(encontrados);
    const primero = ['nombre', 'apellido', 'email', 'password'].find(k => encontrados[k]);
    if (primero) {
      document.getElementById(`reg-${primero}`)?.focus();
      return;
    }
    setEnviando(true);
    try {
      const { data } = await axios.post('/api/registro', {
        nombre: form.nombre.trim(),
        apellido: form.apellido.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      iniciarSesion(data);   // el efecto de arriba lleva a /bienvenida
    } catch (err) {
      if (err.response?.status === 409) setCorreoExiste(true);
      else if (err.response?.status === 429) setError('Hubo demasiados intentos desde esta conexión. Espera unos minutos y vuelve a probar.');
      else if (!err.response) setError('No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo.');
      else setError(msgError(err, 'No pudimos crear tu cuenta. Inténtalo de nuevo.'));
      setEnviando(false);
    }
  };

  const dias = config?.dias_prueba;
  const describe = (k, conNota) => {
    if (errores[k]) return `reg-${k}-error`;
    return conNota ? `reg-${k}-nota` : undefined;
  };

  return (
    <div className="kv-login">
      <PanelMarca
        titulo={<>Prueba Recreo Edu con <em>tus propios cursos</em></>}
        texto="Crea tu cuenta, sube la planilla de matrícula que ya tienes y mira a tu colegio funcionando, sin instalar nada."
        puntos={[
          'Cursos, alumnos y apoderados desde tu Excel',
          'Libro de clases, calificaciones y convivencia escolar',
          'Carga horaria según la Tabla Legal del MINEDUC',
        ]}
        pie={<>¿Prefieres que te lo mostremos?{' '}<a href="/#contacto">Pide una demostración</a></>}
      />

      <main className="kv-acceso">
        <div className="kv-caja">
          <LogoMovil />

          <h2>{dias ? `Prueba ${dias} días gratis` : 'Prueba gratis tu colegio'}</h2>
          <p className="kv-sub">Crea tu cuenta. Tu colegio lo agregas en el paso siguiente.</p>

          {correoExiste
            ? <Aviso>Ese correo ya tiene una cuenta. <Link to="/login">Ingresa aquí</Link>.</Aviso>
            : <Aviso>{error}</Aviso>}

          <form onSubmit={enviar} noValidate>
            <div className="kv-fila2">
              <Campo id="reg-nombre" label="Nombre" error={errores.nombre}>
                <input id="reg-nombre" autoComplete="given-name" autoFocus
                  value={form.nombre} onChange={set('nombre')}
                  aria-invalid={!!errores.nombre} aria-describedby={describe('nombre')} />
              </Campo>
              <Campo id="reg-apellido" label="Apellido" error={errores.apellido}>
                <input id="reg-apellido" autoComplete="family-name"
                  value={form.apellido} onChange={set('apellido')}
                  aria-invalid={!!errores.apellido} aria-describedby={describe('apellido')} />
              </Campo>
            </div>

            <Campo id="reg-email" label="Correo electrónico" error={errores.email}>
              <input id="reg-email" type="email" autoComplete="email" inputMode="email"
                placeholder="nombre@colegio.cl"
                value={form.email} onChange={set('email')}
                aria-invalid={!!errores.email} aria-describedby={describe('email')} />
            </Campo>

            <Campo id="reg-password" label="Contraseña" error={errores.password} nota="Mínimo 8 caracteres.">
              <div className="kv-clave">
                <input id="reg-password" type={verClave ? 'text' : 'password'} autoComplete="new-password"
                  value={form.password} onChange={set('password')}
                  aria-invalid={!!errores.password} aria-describedby={describe('password', true)} />
                <button type="button" onClick={() => setVerClave(v => !v)}
                        aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                  <OjoClave visible={verClave} />
                </button>
              </div>
            </Campo>

            <button type="submit" className="kv-entrar" disabled={enviando}>
              {enviando ? <><span className="kv-girando" /><span className="sr-solo">Creando tu cuenta…</span></> : 'Crear mi cuenta'}
            </button>
          </form>

          <p className="kv-sin-tarjeta">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
            Sin tarjeta de crédito
          </p>

          <BloqueGoogle clientId={config?.google_client_id} onError={setError} />

          <p className="kv-nuevo">¿Ya tienes cuenta? <Link to="/login">Ingresa</Link></p>
        </div>

        <p className="kv-volver"><a href="/">← Volver al sitio</a></p>
      </main>
    </div>
  );
}
