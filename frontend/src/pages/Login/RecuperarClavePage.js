import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './LoginPage.css';

function Marco({ titulo, sub, children }) {
  return (
    <div className="kv-login kv-solo">
      <main className="kv-acceso">
        <div className="kv-caja">
          <a href="/" className="kv-logo kv-logo-movil">
            <img src="/inicio/img/recreo-isotipo.png" alt="" width="38" height="38" />
            <span className="kv-lock">
              <b>Recreo Edu</b>
              <i>Tecnología para educar</i>
            </span>
          </a>
          <h2>{titulo}</h2>
          <p className="kv-sub">{sub}</p>
          {children}
        </div>
      </main>
    </div>
  );
}

const textoError = (err, porDefecto) => {
  if (!err.response) return 'No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo.';
  return err.response.data?.error || porDefecto;
};

const Aviso = ({ children }) => (children ? <div className="kv-error" role="alert"><span>{children}</span></div> : null);

/** Pide el enlace. */
export function RecuperarClavePage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState('');

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) { setError('Escribe tu correo.'); return; }
    setEnviando(true);
    try {
      const { data } = await axios.post('/api/auth/recuperar', { email: email.trim() });
      setListo(data.message);
    } catch (err) {
      setError(textoError(err, 'No pudimos enviar el enlace. Inténtalo de nuevo.'));
    } finally {
      setEnviando(false);
    }
  };

  if (listo) {
    return (
      <Marco titulo="Revisa tu correo" sub={listo}>
        <p className="kv-ayuda">El enlace dura 1 hora. <Link to="/login">Volver a ingresar</Link></p>
      </Marco>
    );
  }

  return (
    <Marco titulo="Recupera tu clave" sub="Escribe tu correo y te enviamos un enlace para crear una nueva.">
      <Aviso>{error}</Aviso>
      <form onSubmit={enviar} noValidate>
        <div className="kv-campo">
          <label htmlFor="correo">Correo electrónico</label>
          <input id="correo" type="email" autoComplete="username" autoFocus
                 placeholder="nombre@colegio.cl"
                 value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <button type="submit" className="kv-entrar" disabled={enviando}>
          {enviando ? <span className="kv-girando" /> : 'Enviar enlace'}
        </button>
      </form>
      <p className="kv-ayuda"><Link to="/login">Volver a ingresar</Link></p>
    </Marco>
  );
}

/** Crea la clave nueva. El token llega después del # del enlace. */
export function NuevaClavePage() {
  const [token] = useState(() => window.location.hash.slice(1));
  const [clave, setClave] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [estado, setEstado] = useState(token ? 'formulario' : 'enlace_invalido');

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    if (clave.length < 8) { setError('La clave debe tener al menos 8 caracteres.'); return; }
    if (clave !== repetir) { setError('Las dos claves no coinciden.'); return; }
    setEnviando(true);
    try {
      await axios.post('/api/auth/recuperar/nueva', { token, password: clave });
      setEstado('listo');
    } catch (err) {
      if (err.response?.data?.codigo === 'enlace_invalido') setEstado('enlace_invalido');
      else setError(textoError(err, 'No pudimos guardar tu clave. Inténtalo de nuevo.'));
    } finally {
      setEnviando(false);
    }
  };

  if (estado === 'listo') {
    return (
      <Marco titulo="Tu clave quedó lista" sub="Ya puedes ingresar con tu clave nueva.">
        <Link to="/login" className="kv-entrar kv-enlace-boton">Ingresar</Link>
      </Marco>
    );
  }
  if (estado === 'enlace_invalido') {
    return (
      <Marco titulo="Este enlace ya no sirve" sub="Venció o ya se usó. Pide uno nuevo para cambiar tu clave.">
        <Link to="/recuperar-clave" className="kv-entrar kv-enlace-boton">Pedir otro enlace</Link>
      </Marco>
    );
  }

  return (
    <Marco titulo="Crea tu clave nueva" sub="Usa al menos 8 caracteres.">
      <Aviso>{error}</Aviso>
      <form onSubmit={enviar} noValidate>
        <div className="kv-campo">
          <label htmlFor="clave-nueva">Clave nueva</label>
          <input id="clave-nueva" type="password" autoComplete="new-password" autoFocus
                 value={clave} onChange={e => setClave(e.target.value)} />
        </div>
        <div className="kv-campo">
          <label htmlFor="clave-repetir">Repite la clave</label>
          <input id="clave-repetir" type="password" autoComplete="new-password"
                 value={repetir} onChange={e => setRepetir(e.target.value)} />
        </div>
        <button type="submit" className="kv-entrar" disabled={enviando}>
          {enviando ? <span className="kv-girando" /> : 'Guardar clave'}
        </button>
      </form>
    </Marco>
  );
}
