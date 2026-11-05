import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { msgError } from '../../components/UI/Modal';
import { FotosFondo, Logo, Aviso } from '../Login/PanelMarca';
import { useConfigRegistro } from './BotonGoogle';
import '../Login/LoginPage.css';
import './Registro.css';

// Tamaño aproximado: basta con el orden de magnitud y se responde con un toque.
const TAMANOS = [
  { valor: 100, txt: 'Hasta 100' },
  { valor: 300, txt: '101 a 300' },
  { valor: 600, txt: '301 a 600' },
  { valor: 800, txt: 'Más de 600' },
];

const AVANCE = ['Creando tu colegio', 'Abriendo el año escolar y sus períodos', 'Dejando lista tu prueba'];
const MS_PASO = 480;
const sinMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

export default function BienvenidaPage() {
  const { user, school, logout, iniciarSesion, refrescarSesion } = useAuth();
  const navigate = useNavigate();
  const config = useConfigRegistro();
  const [form, setForm] = useState({ nombre: '', comuna: '', tamano: null });
  const [errorNombre, setErrorNombre] = useState('');
  const [error, setError] = useState('');
  const [creando, setCreando] = useState(false);
  const [paso, setPaso] = useState(0);
  const terminado = useRef(false);
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  // Una vez creado, esta pantalla ya no aplica (salvo en el salto a los datos)
  if (school && !terminado.current) return <Navigate to="/dashboard" replace />;

  const salir = () => { logout(); navigate('/login'); };

  const crear = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.nombre.trim()) {
      setErrorNombre('Escribe el nombre de tu colegio para continuar.');
      document.getElementById('bv-nombre')?.focus();
      return;
    }
    setErrorNombre('');
    setCreando(true);
    setPaso(0);

    // El avance se muestra aunque el servidor responda antes: es breve y cuenta
    // qué se está preparando. Con menos movimiento se salta.
    const pausa = sinMovimiento() ? 0 : MS_PASO;
    const animacion = (async () => {
      for (let i = 1; i <= AVANCE.length && pausa; i += 1) {
        await esperar(pausa);
        if (vivo.current) setPaso(i);
      }
    })();

    try {
      const cuerpo = { nombre: form.nombre.trim() };
      if (form.comuna.trim()) cuerpo.comuna = form.comuna.trim();
      if (form.tamano) cuerpo.cantidad_alumnos_aprox = form.tamano;
      const [{ data }] = await Promise.all([axios.post('/api/registro/colegio', cuerpo), animacion]);
      if (!vivo.current) return;
      terminado.current = true;
      iniciarSesion(data);
      navigate('/bienvenida/datos', { replace: true });
      // La respuesta trae la prueba resumida; /me trae lo que usan los avisos
      refrescarSesion?.();
    } catch (err) {
      if (!vivo.current) return;
      if (err.response?.status === 409) {
        // Ya tenía colegio (otra pestaña): se recupera la sesión y sigue su camino
        const sesion = await refrescarSesion?.();
        if (sesion?.school) return;
      }
      setCreando(false);
      setError(err.response
        ? msgError(err, 'No pudimos crear tu colegio. Inténtalo de nuevo.')
        : 'No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo.');
    }
  };

  const dias = config?.dias_prueba;

  return (
    <div className="rb rb-bv">
      <FotosFondo />
      <div className="rb-bv-cont">
        <header className="rb-bv-tope">
          <Logo tam={38} />
          <button type="button" className="rb-enlace-claro" onClick={salir}>Cerrar sesión</button>
        </header>

        <div className="rb-bv-grid">
          <section className="rb-bv-texto">
            <h1>Hola, {user?.first_name}.<br /><em>Qué bueno tenerte aquí.</em></h1>
            <p>En unos minutos vas a ver tus cursos y a tus alumnos dentro de Recreo Edu.
              Esto es lo que viene:</p>
            <ol className="rb-pasos">
              <li>
                <b>Creas tu colegio</b>
                <span>Solo el nombre. El RUT, el logo y los demás datos pueden esperar.</span>
              </li>
              <li>
                <b>Traes tus datos</b>
                <span>Sube la planilla de matrícula que ya usas, o explora con un colegio de ejemplo.</span>
              </li>
              <li>
                <b>Pruebas todo</b>
                <span>
                  {dias ? `Tienes ${dias} días` : 'Tienes tu período de prueba'} para usar el libro de
                  clases, las notas y la convivencia, sin tarjeta de crédito.
                </span>
              </li>
            </ol>
          </section>

          <section className="rb-bv-tarjeta" aria-live="polite">
            {creando ? (
              <div className="rb-avance" role="status">
                <h2>{form.nombre.trim()}</h2>
                <ul>
                  {AVANCE.map((t, i) => (
                    <li key={t} className={i < paso ? 'ok' : i === paso ? 'act' : ''}>
                      <span className="rb-avance-punto" aria-hidden="true" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <form onSubmit={crear} noValidate>
                <h2>Empecemos por tu colegio</h2>
                <Aviso>{error}</Aviso>

                <div className="kv-campo">
                  <label htmlFor="bv-nombre">Nombre del colegio</label>
                  <input id="bv-nombre" autoFocus autoComplete="organization"
                    placeholder="Ej.: Escuela Básica Los Aromos"
                    value={form.nombre} aria-invalid={!!errorNombre}
                    aria-describedby={errorNombre ? 'bv-nombre-error' : undefined}
                    onChange={e => { setForm({ ...form, nombre: e.target.value }); setErrorNombre(''); }} />
                  {errorNombre && <span className="kv-campo-error" id="bv-nombre-error">{errorNombre}</span>}
                </div>

                <div className="kv-campo">
                  <label htmlFor="bv-comuna">Comuna <small>(opcional)</small></label>
                  <input id="bv-comuna" autoComplete="address-level2" placeholder="Ej.: Talca"
                    value={form.comuna} onChange={e => setForm({ ...form, comuna: e.target.value })} />
                </div>

                <fieldset className="rb-tamanos">
                  <legend>¿Cuántos alumnos tiene? <small>(opcional)</small></legend>
                  <div>
                    {TAMANOS.map(t => (
                      <label key={t.valor} className={form.tamano === t.valor ? 'on' : ''}>
                        <input type="radio" name="bv-tamano" checked={form.tamano === t.valor}
                          onChange={() => setForm({ ...form, tamano: t.valor })} />
                        {t.txt}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <button type="submit" className="kv-entrar">Crear mi colegio</button>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
