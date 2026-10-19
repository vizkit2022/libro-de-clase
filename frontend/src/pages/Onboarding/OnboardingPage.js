/**
 * Asistente de puesta en marcha.
 *
 * El avance no se guarda: lo calcula el backend mirando los datos reales, así
 * que después de cualquier cambio hay que volver a pedir /estado. Por eso casi
 * todas las acciones terminan llamando a `recargar()`.
 *
 * Los pasos no se bloquean en cadena salvo donde hay dependencia real (no se
 * puede matricular sin cursos): un colegio llena esto en desorden, con lo que
 * tiene a mano.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import descargarArchivo from '../CargaAcademica/descargar';
import './Onboarding.css';

const ROLES_EQUIPO = { profesor: 'Docente', directivo: 'Directivo', admin: 'Administrador' };

const TEXTOS = {
  colegio: ['Datos del colegio',
    'Lo que aparece en la cabecera de todos los informes en Word y PDF. Es lo primero que ve un apoderado cuando recibe un documento.'],
  periodos: ['Año escolar y períodos',
    'De esto dependen las notas: una calificación siempre pertenece a un período.'],
  cursos: ['Cursos',
    'El esqueleto del año. Sin cursos no se puede matricular alumnos ni repartir horas.'],
  asignaturas: ['Asignaturas',
    'Qué se enseña y en qué cursos. Es lo que un docente ve en su panel cuando entra por primera vez.'],
  equipo: ['Equipo del colegio',
    'Docentes, directivos y administrativos. Son los usuarios que se facturan; alumnos y apoderados no.'],
  matricula: ['Matrícula de alumnos',
    'Los alumnos de cada curso, desde la planilla que el colegio ya tiene.'],
  carga: ['Carga horaria y jefaturas',
    'Quién hace qué: el docente a cargo de cada asignatura y el profesor jefe de cada curso.'],
  accesos: ['Activar y entregar accesos',
    'Último paso. Revisa que todo esté en orden, activa las cuentas y entrega las claves.'],
};

const Tic = () => <span aria-hidden="true">✓</span>;
const Alerta = () => <span aria-hidden="true">!</span>;

/**
 * Un mensaje de error que sirva para algo.
 *
 * `e.response.data.error` solo existe si el backend respondió JSON suyo. Si
 * cae un 500, un 413 del proxy o se corta la red, no hay tal campo y el
 * genérico «no se pudo guardar» deja a todo el mundo a ciegas: al usuario y
 * a quien tenga que arreglarlo. Por eso se arrastra el código HTTP.
 */
function explicar(e, generico) {
  const r = e?.response;
  if (!r) return `${generico}: no hubo respuesta del servidor. Revisa tu conexión.`;
  const delServidor = r.data?.error || r.data?.detalle;
  if (delServidor) return delServidor;
  if (r.status === 413) return 'El archivo es demasiado grande para el servidor.';
  if (r.status === 403) return 'Tu cuenta no tiene permisos para esto.';
  if (r.status === 401) return 'Tu sesión expiró. Vuelve a entrar.';
  return `${generico} (error ${r.status} del servidor).`;
}

function Aviso({ tipo = 'info', children }) {
  return <div className={`ob-aviso ${tipo}`}><div>{children}</div></div>;
}

/** Zona de arrastre reutilizable para las dos importaciones por planilla. */
function ZonaArchivo({ onArchivo, titulo, detalle, cargando }) {
  const entrada = useRef(null);
  const [encima, setEncima] = useState(false);

  const soltar = e => {
    e.preventDefault();
    setEncima(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onArchivo(f);
  };

  return (
    <div
      className={`ob-zona${encima ? ' encima' : ''}`}
      onClick={() => entrada.current?.click()}
      onDragOver={e => { e.preventDefault(); setEncima(true); }}
      onDragLeave={() => setEncima(false)}
      onDrop={soltar}
      role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && entrada.current?.click()}
    >
      <input ref={entrada} type="file" accept=".xlsx,.xlsm,.xls,.csv"
             style={{ display: 'none' }}
             onChange={e => { const f = e.target.files?.[0]; if (f) onArchivo(f); e.target.value = ''; }} />
      <b>{cargando ? 'Leyendo la planilla…' : titulo}</b>
      <span>{detalle}</span>
    </div>
  );
}

export default function OnboardingPage() {
  const { school, updateSchool } = useAuth();
  const navegar = useNavigate();

  const [estado, setEstado] = useState(null);
  const [year, setYear] = useState(null);
  const [actual, setActual] = useState('colegio');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const recargar = useCallback(async (y) => {
    try {
      const url = '/api/onboarding/estado' + (y ? `?year=${y}` : '');
      const { data } = await axios.get(url);
      setEstado(data);
      setYear(data.year);
      setError('');
      return data;
    } catch (e) {
      setError(explicar(e, 'No pudimos cargar el estado'));
      return null;
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { recargar(); }, [recargar]);

  const cambiarYear = async nuevo => {
    setCargando(true);
    await axios.put('/api/onboarding/year', { year: nuevo }).catch(() => null);
    await recargar(nuevo);
  };

  if (cargando && !estado) return <div className="ob-cargando">Cargando…</div>;
  if (!estado) return <div className="ob-cargando">{error || 'Sin datos'}</div>;

  const paso = estado.pasos.find(p => p.clave === actual) || estado.pasos[0];
  const comunes = { estado, year, recargar, school, updateSchool, navegar, setActual };

  const PANELES = {
    colegio: PasoColegio, periodos: PasoPeriodos, cursos: PasoCursos,
    asignaturas: PasoAsignaturas, equipo: PasoEquipo, matricula: PasoMatricula,
    carga: PasoCarga, accesos: PasoAccesos,
  };
  const Panel = PANELES[paso.clave];

  const indice = estado.pasos.findIndex(p => p.clave === paso.clave);
  const anterior = estado.pasos[indice - 1];
  const siguiente = estado.pasos[indice + 1];

  return (
    <div className="ob">
      <div className="ob-marco">
        <aside className="ob-etapas">
          <div className="ob-avance-cab">
            <h3>Avance</h3>
            <b>{estado.pct}%</b>
          </div>
          <div className="ob-barra"><i style={{ width: `${estado.pct}%` }} /></div>
          <p className="ob-avance-pie">
            {estado.completos} de {estado.total} pasos completos
          </p>

          {estado.pasos.map(p => (
            <button
              key={p.clave}
              className={`ob-paso es-${p.estado}${p.clave === paso.clave ? ' activo' : ''}`}
              onClick={() => setActual(p.clave)}
              title={p.estado === 'bloqueado'
                ? 'Primero hay que crear los cursos' : p.detalle}
            >
              <span className="ob-num">{p.estado === 'completo' ? <Tic /> : p.n}</span>
              <span>
                <span className="ob-tit">{p.titulo}</span>
                <span className="ob-sub">{p.detalle}</span>
              </span>
            </button>
          ))}

          <div className="ob-etapas-pie">
            <b>¿Pueden entrar los docentes?</b>
            {estado.docentes_pueden_entrar
              ? 'Sí. Con el equipo cargado ya ven sus cursos y asignaturas, aunque falte el resto.'
              : 'Todavía no. Falta cargar el equipo del colegio (paso 5).'}
          </div>
        </aside>

        <section className="ob-panel">
          <div className="ob-panel-cab">
            <p className="ob-et">Paso {paso.n} de {estado.total}</p>
            <h2>{TEXTOS[paso.clave][0]}</h2>
            <p>{TEXTOS[paso.clave][1]}</p>
          </div>

          {error && <Aviso tipo="mal">{error}</Aviso>}

          <Panel {...comunes} paso={paso} cambiarYear={cambiarYear} />

          <div className="ob-pie">
            <span className="ob-izq">{paso.detalle}</span>
            <div className="ob-der">
              {anterior && (
                <button className="ob-btn ob-btn-g" onClick={() => setActual(anterior.clave)}>
                  Atrás
                </button>
              )}
              {siguiente && (
                <button className="ob-btn ob-btn-p" onClick={() => setActual(siguiente.clave)}>
                  Siguiente paso
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ── Paso 1: datos del colegio ──────────────────────────────────────── */

function PasoColegio({ school, updateSchool, recargar }) {
  const [form, setForm] = useState({
    name: '', rut: '', rector: '', subtitulo: '', address: '', phone: '',
  });
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState(null);
  const logo = useRef(null);

  useEffect(() => {
    if (school) {
      setForm({
        name: school.name || '', rut: school.rut || '', rector: school.rector || '',
        subtitulo: school.subtitulo || '', address: school.address || '',
        phone: school.phone || '',
      });
    }
  }, [school]);

  // Mismo tope que la columna de la base: cortar acá evita un error del
  // servidor que el usuario no puede interpretar.
  const TOPES = { name: 200, rut: 20, rector: 200, subtitulo: 200, address: 300, phone: 50 };

  const campo = (k, etiqueta, pista, ancho) => (
    <div className={`ob-campo${ancho ? ' ancho' : ''}`} key={k}>
      <label htmlFor={`ob-${k}`}>{etiqueta}{pista && <em> · {pista}</em>}</label>
      <input id={`ob-${k}`} value={form[k]} maxLength={TOPES[k]}
             onChange={e => setForm({ ...form, [k]: e.target.value })} />
    </div>
  );

  const guardar = async () => {
    setGuardando(true);
    setAviso(null);
    try {
      const { data } = await axios.put(`/api/schools/${school.id}`, form);
      updateSchool(data);
      setAviso({ tipo: 'ok', texto: 'Datos guardados' });
      await recargar();
    } catch (e) {
      setAviso({ tipo: 'mal', texto: explicar(e, 'No se pudo guardar') });
    } finally {
      setGuardando(false);
    }
  };

  const subirLogo = async archivo => {
    setAviso(null);
    // Se revisa acá además de en el servidor: así el usuario no espera la
    // subida completa de un archivo que igual va a ser rechazado.
    if (archivo.size > 2 * 1024 * 1024) {
      setAviso({ tipo: 'mal', texto:
        `El logo pesa ${Math.round(archivo.size / 1024)} KB y el máximo son 2048 KB.` });
      return;
    }
    setSubiendo(true);
    const fd = new FormData();
    fd.append('logo', archivo);
    try {
      const { data } = await axios.post(`/api/schools/${school.id}/upload-logo`, fd);
      updateSchool({ ...school, logo_url: data.logo_url });
      setAviso({ tipo: 'ok', texto: 'Logo actualizado' });
      await recargar();
    } catch (e) {
      setAviso({ tipo: 'mal', texto: explicar(e, 'No se pudo subir el logo') });
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <>
      <div className="ob-campos">
        {campo('name', 'Nombre del establecimiento', '', true)}
        {campo('rut', 'RUT del sostenedor', 'opcional')}
        {campo('rector', 'Rector o director')}
        {campo('subtitulo', 'Bajada institucional', 'sale bajo el nombre en los informes', true)}
        {campo('address', 'Dirección', 'opcional')}
        {campo('phone', 'Teléfono', 'opcional')}
      </div>

      <div className="ob-cajon">
        <div className="ob-cajon-cab">
          <h4>Logo del establecimiento</h4>
          <div className="ob-der">
            <input ref={logo} type="file" accept="image/*" style={{ display: 'none' }}
                   onChange={e => { const f = e.target.files?.[0]; if (f) subirLogo(f); e.target.value = ''; }} />
            <button className="ob-btn ob-btn-g ob-btn-ch" disabled={subiendo}
                    onClick={() => logo.current?.click()}>
              {subiendo ? 'Subiendo…' : school?.logo_url ? 'Cambiar imagen' : 'Subir imagen'}
            </button>
          </div>
        </div>
        <div className="ob-cajon-cuerpo" style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          {school?.logo_url
            ? <img src={school.logo_url} alt="Logo del colegio"
                   style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 12 }} />
            : <div style={{ width: 64, height: 64, borderRadius: 12, background: '#eef1f8',
                            display: 'grid', placeItems: 'center', color: '#9ca3af', fontSize: 12 }}>
                Sin logo
              </div>}
          <div style={{ fontSize: 12.8, color: '#6b7280', lineHeight: 1.6 }}>
            PNG o JPG, idealmente cuadrado y sobre fondo claro. Hasta 2 MB.<br />
            Se usa en los informes, en el portal de apoderados y en la barra lateral.
          </div>
        </div>
      </div>

      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      <div style={{ marginTop: 16 }}>
        <button className="ob-btn ob-btn-p" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar datos del colegio'}
        </button>
      </div>
    </>
  );
}

/* ── Paso 2: año escolar y períodos ─────────────────────────────────── */

function PasoPeriodos({ year, estado, recargar, cambiarYear }) {
  const [periodos, setPeriodos] = useState([]);
  const [creando, setCreando] = useState(false);
  const [aviso, setAviso] = useState('');

  const traer = useCallback(async () => {
    const { data } = await axios.get(`/api/periods/?year=${year}`).catch(() => ({ data: [] }));
    setPeriodos(data);
  }, [year]);

  useEffect(() => { traer(); }, [traer]);

  const crearSemestres = async () => {
    setCreando(true);
    try {
      for (const [n, nombre, desde, hasta] of [
        [1, 'Primer semestre', `${year}-03-01`, `${year}-07-15`],
        [2, 'Segundo semestre', `${year}-07-28`, `${year}-12-15`],
      ]) {
        await axios.post('/api/periods/', {
          name: nombre, period_type: 'semestral', year, number: n,
          start_date: desde, end_date: hasta, is_active: true,
        });
      }
      await traer();
      await recargar(year);
      setAviso('');
    } catch (e) {
      setAviso(explicar(e, 'No se pudieron crear los períodos'));
    } finally {
      setCreando(false);
    }
  };

  return (
    <>
      <div className="ob-campos" style={{ marginBottom: 16 }}>
        <div className="ob-campo">
          <label htmlFor="ob-year">Año escolar que estás configurando</label>
          <select id="ob-year" value={year} onChange={e => cambiarYear(Number(e.target.value))}>
            {estado.anios_disponibles.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div className="ob-cajon">
        <div className="ob-cajon-cab">
          <h4>Períodos de {year}</h4>
          <span className="ob-pill ne">{periodos.length}</span>
          <div className="ob-der">
            <button className="ob-btn ob-btn-g ob-btn-ch" onClick={() => window.open('/periods', '_self')}>
              Administrar períodos
            </button>
          </div>
        </div>
        {periodos.length === 0 ? (
          <div className="ob-cajon-cuerpo" style={{ textAlign: 'center', padding: 28 }}>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>
              {year} todavía no tiene períodos. Sin ellos las notas no tienen dónde guardarse.
            </p>
            <button className="ob-btn ob-btn-p" onClick={crearSemestres} disabled={creando}>
              {creando ? 'Creando…' : 'Crear dos semestres'}
            </button>
          </div>
        ) : (
          <div className="ob-tabla-scroll">
            <table className="ob-tabla">
              <thead><tr><th>Período</th><th>Desde</th><th>Hasta</th><th>Estado</th></tr></thead>
              <tbody>
                {periodos.map(p => (
                  <tr key={p.id}>
                    <td><b>{p.name}</b></td>
                    <td>{p.start_date || '—'}</td>
                    <td>{p.end_date || '—'}</td>
                    <td><span className={`ob-pill ${p.is_active ? 'ok' : 'ne'}`}>
                      {p.is_active ? 'Activo' : 'Programado'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {aviso && <Aviso tipo="mal">{aviso}</Aviso>}
      <Aviso tipo="info">
        Los años anteriores quedan intactos y consultables. Cambiar de año no borra
        nada: cursos, notas e informes siguen donde están.
      </Aviso>
    </>
  );
}

/* ── Paso 3: cursos ─────────────────────────────────────────────────── */

function PasoCursos({ year, estado, recargar, navegar }) {
  const [cursos, setCursos] = useState([]);
  const [nombre, setNombre] = useState('');
  const [origen, setOrigen] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const traer = useCallback(async () => {
    const { data } = await axios.get(`/api/courses/?year=${year}`).catch(() => ({ data: [] }));
    setCursos(Array.isArray(data) ? data : []);
  }, [year]);

  useEffect(() => { traer(); }, [traer]);

  const otrosAnios = estado.anios_disponibles.filter(a => a !== year);
  // Derivado en vez de guardado: si cambia el año y el origen elegido deja de
  // ser válido, no hay que acordarse de limpiarlo en ninguna parte.
  const origenUsado = otrosAnios.includes(origen) ? origen : (otrosAnios[0] ?? null);

  const copiar = async () => {
    if (!origenUsado) return;
    setOcupado(true);
    try {
      const { data } = await axios.post('/api/onboarding/cursos/copiar',
        { year_origen: origenUsado, year_destino: year });
      setAviso({ tipo: 'ok', texto: `Se crearon ${data.creados} cursos` +
        (data.omitidos ? ` · ${data.omitidos} ya existían` : '') });
      await traer();
      await recargar(year);
    } catch (e) {
      setAviso({ tipo: 'mal', texto: explicar(e, 'No se pudo copiar') });
    } finally {
      setOcupado(false);
    }
  };

  const crear = async e => {
    e.preventDefault();
    if (!nombre.trim()) return;
    setOcupado(true);
    try {
      await axios.post('/api/courses/', { name: nombre.trim(), year });
      setNombre('');
      await traer();
      await recargar(year);
    } catch (err) {
      setAviso({ tipo: 'mal', texto: explicar(err, 'No se pudo crear') });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <>
      <div className="ob-cajon">
        <div className="ob-cajon-cab">
          <h4>Cursos de {year}</h4>
          <span className="ob-pill ne">{cursos.length}</span>
          <div className="ob-der">
            {otrosAnios.length > 0 && (
              <>
                <select value={origenUsado ?? ''} onChange={e => setOrigen(Number(e.target.value))}
                        style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 9px', fontSize: 12 }}>
                  {otrosAnios.map(a => <option key={a} value={a}>Desde {a}</option>)}
                </select>
                <button className="ob-btn ob-btn-g ob-btn-ch" onClick={copiar} disabled={ocupado}>
                  Copiar estructura
                </button>
              </>
            )}
          </div>
        </div>
        <div className="ob-cajon-cuerpo">
          {cursos.length === 0
            ? <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: 16 }}>
                Todavía no hay cursos en {year}.
              </p>
            : <div className="ob-malla">
                {cursos.map(c => (
                  <button key={c.id} className="ob-cur" style={{ textAlign: 'left', cursor: 'pointer' }}
                          onClick={() => navegar(`/courses/${c.id}`)}>
                    <b>{c.name}</b>
                    <span>{c.student_count || 0} alumnos</span>
                  </button>
                ))}
              </div>}

          <form onSubmit={crear} style={{ display: 'flex', gap: 9, marginTop: 16 }}>
            <input value={nombre} onChange={e => setNombre(e.target.value)}
                   placeholder="Nombre del curso, por ejemplo 7° Básico A"
                   style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 9, padding: '9px 12px', fontSize: 13.5, fontFamily: 'inherit' }} />
            <button className="ob-btn ob-btn-g" type="submit" disabled={ocupado || !nombre.trim()}>
              Agregar curso
            </button>
          </form>
        </div>
      </div>

      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
    </>
  );
}

/* ── Paso 4: asignaturas ────────────────────────────────────────────── */

function PasoAsignaturas({ year, paso, recargar, navegar }) {
  const [asignaturas, setAsignaturas] = useState([]);
  const [ministerio, setMinisterio] = useState([]);
  const [cursos, setCursos] = useState([]);
  const [nueva, setNueva] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const traer = useCallback(async () => {
    const [a, m, c] = await Promise.all([
      axios.get('/api/subjects/').catch(() => ({ data: [] })),
      axios.get('/api/subjects/ministry').catch(() => ({ data: [] })),
      axios.get(`/api/courses/?year=${year}`).catch(() => ({ data: [] })),
    ]);
    setAsignaturas(a.data || []);
    setMinisterio(m.data || []);
    setCursos(Array.isArray(c.data) ? c.data : []);
  }, [year]);

  useEffect(() => { traer(); }, [traer]);

  const yaEstan = new Set(asignaturas.map(a => (a.name || '').toLowerCase()));
  const porAgregar = ministerio.filter(m => !yaEstan.has(m.name.toLowerCase()));

  const agregar = async (nombre, ministry_code) => {
    setOcupado(true);
    try {
      await axios.post('/api/subjects/', { name: nombre, ministry_code });
      await traer();
      await recargar(year);
    } finally { setOcupado(false); }
  };

  return (
    <>
      <div className="ob-cajon">
        <div className="ob-cajon-cab">
          <h4>Asignaturas del colegio</h4>
          <span className="ob-pill ne">{asignaturas.length}</span>
        </div>
        <div className="ob-cajon-cuerpo">
          {asignaturas.length === 0
            ? <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: 12 }}>
                El catálogo está vacío. Agrega las del currículum o crea las tuyas.
              </p>
            : <div className="ob-malla">
                {asignaturas.map(a => (
                  <div key={a.id} className="ob-cur">
                    <b style={{ fontSize: 12.5 }}>{a.name}</b>
                    <span>{a.ministry_code || 'propia'}</span>
                  </div>
                ))}
              </div>}

          {porAgregar.length > 0 && (
            <>
              <p style={{ fontSize: 12, color: '#6b7280', margin: '18px 0 8px', fontWeight: 650 }}>
                Del currículum nacional, un clic para agregarlas
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {porAgregar.map(m => (
                  <button key={m.code} className="ob-btn ob-btn-g ob-btn-ch"
                          disabled={ocupado} onClick={() => agregar(m.name, m.code)}>
                    + {m.name}
                  </button>
                ))}
              </div>
            </>
          )}

          <form style={{ display: 'flex', gap: 9, marginTop: 18 }}
                onSubmit={e => { e.preventDefault(); if (nueva.trim()) { agregar(nueva.trim(), null); setNueva(''); } }}>
            <input value={nueva} onChange={e => setNueva(e.target.value)}
                   placeholder="O crea una propia: Taller de Lenguaje, Robótica…"
                   style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 9, padding: '9px 12px', fontSize: 13.5, fontFamily: 'inherit' }} />
            <button className="ob-btn ob-btn-g" type="submit" disabled={ocupado || !nueva.trim()}>
              Crear
            </button>
          </form>
        </div>
      </div>

      {paso.pendientes.length > 0 && asignaturas.length > 0 && (
        <Aviso tipo="al">
          Hay cursos sin ninguna asignatura asignada. Entra a cada uno y agrégalas
          desde su ficha:
          <ul>
            {paso.pendientes.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
          <div style={{ marginTop: 10 }}>
            <button className="ob-btn ob-btn-g ob-btn-ch" onClick={() => navegar('/courses')}>
              Ir a Cursos
            </button>
          </div>
        </Aviso>
      )}
    </>
  );
}

/* ── Paso 5: equipo ─────────────────────────────────────────────────── */

const ESTADOS_EQUIPO = {
  nuevo: ['ok', 'Se va a crear'],
  ya_existe: ['ne', 'Ya está cargada'],
  error: ['mal', 'No se va a cargar'],
};

function PasoEquipo({ year, recargar }) {
  const [personas, setPersonas] = useState([]);
  const [previa, setPrevia] = useState(null);
  const [leyendo, setLeyendo] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [manual, setManual] = useState({ nombre: '', apellido: '', email: '', rol: 'profesor' });

  const traer = useCallback(async () => {
    const { data } = await axios.get('/api/onboarding/accesos').catch(() => ({ data: null }));
    setPersonas(data?.personas || []);
  }, []);

  useEffect(() => { traer(); }, [traer]);

  const subir = async archivo => {
    setLeyendo(true);
    setAviso(null);
    const fd = new FormData();
    fd.append('archivo', archivo);
    try {
      const { data } = await axios.post('/api/onboarding/equipo/previsualizar', fd);
      setPrevia(data);
    } catch (e) {
      setAviso({ tipo: 'mal', texto: explicar(e, 'No se pudo leer la planilla') });
    } finally {
      setLeyendo(false);
    }
  };

  const aplicar = async () => {
    const items = previa.items.filter(i => i.estado === 'nuevo');
    if (!items.length) return;
    try {
      const { data } = await axios.post('/api/onboarding/equipo/aplicar', { items });
      setAviso({ tipo: 'ok', texto: `Se cargaron ${data.creados} personas` });
      setPrevia(null);
      await traer();
      await recargar(year);
    } catch (e) {
      setAviso({ tipo: 'mal', texto: explicar(e, 'No se pudo guardar') });
    }
  };

  const agregarManual = async e => {
    e.preventDefault();
    try {
      await axios.post('/api/onboarding/equipo/aplicar', { items: [manual] });
      setManual({ nombre: '', apellido: '', email: '', rol: 'profesor' });
      setAviso(null);
      await traer();
      await recargar(year);
    } catch (err) {
      setAviso({ tipo: 'mal', texto: explicar(err, 'No se pudo agregar') });
    }
  };

  const nuevos = previa ? previa.items.filter(i => i.estado === 'nuevo').length : 0;

  return (
    <>
      <div className="ob-dos">
        <div className="ob-cajon">
          <div className="ob-cajon-cab">
            <h4>Cargar desde planilla</h4>
            <div className="ob-der">
              <button className="ob-btn ob-btn-g ob-btn-ch"
                      onClick={() => descargarArchivo('/api/onboarding/equipo/plantilla.xlsx',
                                                      'Plantilla_equipo.xlsx')
                        .catch(err => setAviso({ tipo: 'mal', texto: err.message }))}>
                Descargar plantilla
              </button>
            </div>
          </div>
          <div className="ob-cajon-cuerpo">
            <ZonaArchivo onArchivo={subir} cargando={leyendo}
                         titulo="Arrastra el Excel con el personal"
                         detalle="Nombre, apellido, correo, rol y jornada" />
          </div>
        </div>

        <div className="ob-cajon">
          <div className="ob-cajon-cab"><h4>O agregar a mano</h4></div>
          <div className="ob-cajon-cuerpo">
            <form onSubmit={agregarManual}>
              <div className="ob-campos" style={{ gridTemplateColumns: '1fr' }}>
                <div className="ob-campo">
                  <label htmlFor="ob-eq-n">Nombre</label>
                  <input id="ob-eq-n" value={manual.nombre} required
                         onChange={e => setManual({ ...manual, nombre: e.target.value })} />
                </div>
                <div className="ob-campo">
                  <label htmlFor="ob-eq-a">Apellido</label>
                  <input id="ob-eq-a" value={manual.apellido} required
                         onChange={e => setManual({ ...manual, apellido: e.target.value })} />
                </div>
                <div className="ob-campo">
                  <label htmlFor="ob-eq-e">Correo <em>· si lo dejas vacío se genera uno</em></label>
                  <input id="ob-eq-e" type="email" value={manual.email}
                         onChange={e => setManual({ ...manual, email: e.target.value })} />
                </div>
                <div className="ob-campo">
                  <label htmlFor="ob-eq-r">Rol</label>
                  <select id="ob-eq-r" value={manual.rol}
                          onChange={e => setManual({ ...manual, rol: e.target.value })}>
                    {Object.entries(ROLES_EQUIPO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                </div>
              </div>
              <button className="ob-btn ob-btn-g" type="submit" style={{ width: '100%', marginTop: 14 }}>
                Agregar al equipo
              </button>
            </form>
          </div>
        </div>
      </div>

      {previa && (
        <div className="ob-cajon">
          <div className="ob-cajon-cab">
            <h4>Vista previa antes de guardar</h4>
            <span className="ob-pill ne">{previa.total} filas</span>
            <div className="ob-der">
              <button className="ob-btn ob-btn-g ob-btn-ch" onClick={() => setPrevia(null)}>
                Descartar
              </button>
              <button className="ob-btn ob-btn-p ob-btn-ch" onClick={aplicar} disabled={!nuevos}>
                Cargar {nuevos} persona{nuevos === 1 ? '' : 's'}
              </button>
            </div>
          </div>
          <div className="ob-tabla-scroll">
            <table className="ob-tabla">
              <thead><tr><th>Fila</th><th>Persona</th><th>Rol</th><th>Correo</th><th>Qué va a pasar</th></tr></thead>
              <tbody>
                {previa.items.map(i => {
                  const [color] = ESTADOS_EQUIPO[i.estado] || ['ne', i.estado];
                  return (
                    <tr key={i.fila}>
                      <td>{i.fila}</td>
                      <td><b>{i.nombre} {i.apellido}</b></td>
                      <td>{ROLES_EQUIPO[i.rol] || i.rol}</td>
                      <td style={{ fontSize: 12 }}>
                        {i.email}{i.email_generado && <span className="ob-pill ne" style={{ marginLeft: 6 }}>generado</span>}
                      </td>
                      <td><span className={`ob-pill ${color}`}>{i.detalle}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="ob-cajon">
        <div className="ob-cajon-cab">
          <h4>Equipo cargado</h4>
          <span className="ob-pill ne">{personas.length} personas</span>
        </div>
        {personas.length === 0
          ? <div className="ob-cajon-cuerpo" style={{ textAlign: 'center', padding: 26, color: '#9ca3af', fontSize: 13 }}>
              Todavía no hay nadie cargado. Sube la planilla o agrega a la primera persona.
            </div>
          : <div className="ob-tabla-scroll">
              <table className="ob-tabla">
                <thead><tr><th>Persona</th><th>Rol</th><th>Correo</th><th>Cuenta</th></tr></thead>
                <tbody>
                  {personas.map(p => (
                    <tr key={p.id}>
                      <td><b>{p.nombre}</b></td>
                      <td>{ROLES_EQUIPO[p.rol] || p.rol}</td>
                      <td style={{ fontSize: 12 }}>{p.email}</td>
                      <td><span className={`ob-pill ${p.is_active ? 'ok' : 'ne'}`}>
                        {p.is_active ? 'Activa' : 'Inactiva'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
      </div>

      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      <Aviso tipo="info">
        <b>Este es el punto de corte.</b> Con el equipo cargado, un docente ya puede
        entrar y ver sus cursos y asignaturas, aunque los alumnos y la carga horaria
        todavía no estén. Las cuentas quedan inactivas hasta el paso 8.
      </Aviso>
    </>
  );
}

/* ── Paso 6: matrícula ──────────────────────────────────────────────── */

const ESTADOS_MATRICULA = {
  nuevo: ['ok', 'Alumno nuevo'],
  rematricula: ['ok', 'Rematrícula'],
  cambio_curso: ['ne', 'Cambia de curso'],
  sin_cambio: ['ne', 'Sin cambios'],
  error: ['mal', 'No se va a cargar'],
};

function PasoMatricula({ year, recargar }) {
  const [previa, setPrevia] = useState(null);
  const [leyendo, setLeyendo] = useState(false);
  const [aviso, setAviso] = useState(null);

  const subir = async archivo => {
    setLeyendo(true);
    setAviso(null);
    const fd = new FormData();
    fd.append('archivo', archivo);
    try {
      const { data } = await axios.post(
        `/api/matricula/importar/previsualizar?year=${year}`, fd);
      setPrevia(data);
    } catch (e) {
      setAviso({ tipo: 'mal', texto: explicar(e, 'No se pudo leer la planilla') });
    } finally {
      setLeyendo(false);
    }
  };

  const aplicar = async () => {
    const items = previa.items.filter(i => i.estado !== 'error' && i.curso_id);
    try {
      const { data } = await axios.post(
        `/api/matricula/importar/aplicar?year=${year}`, { items });
      setAviso({ tipo: 'ok', texto:
        `${data.creados} alumnos creados · ${data.matriculados} matriculados` +
        (data.movidos ? ` · ${data.movidos} cambiaron de curso` : '') });
      setPrevia(null);
      await recargar(year);
    } catch (e) {
      setAviso({ tipo: 'mal', texto: explicar(e, 'No se pudo guardar') });
    }
  };

  const buenos = previa ? previa.items.filter(i => i.estado !== 'error' && i.curso_id).length : 0;
  const malos = previa ? previa.items.filter(i => i.estado === 'error').length : 0;

  return (
    <>
      <div className="ob-cajon">
        <div className="ob-cajon-cab">
          <h4>Cargar matrícula de {year}</h4>
          <div className="ob-der">
            <button className="ob-btn ob-btn-g ob-btn-ch"
                    onClick={() => descargarArchivo(`/api/matricula/plantilla.xlsx?year=${year}`,
                                                    `Plantilla_matricula_${year}.xlsx`)
                      .catch(err => setAviso({ tipo: 'mal', texto: err.message }))}>
              Descargar plantilla con tus cursos
            </button>
          </div>
        </div>
        <div className="ob-cajon-cuerpo">
          <ZonaArchivo onArchivo={subir} cargando={leyendo}
                       titulo="Arrastra el Excel de matrícula"
                       detalle="Nombre, apellido, rut, nivel y letra. Acepta CSV también." />
        </div>
      </div>

      {previa && (
        <div className="ob-cajon">
          <div className="ob-cajon-cab">
            <h4>Vista previa antes de guardar</h4>
            <span className="ob-pill ne">{previa.total} filas leídas</span>
            <div className="ob-der">
              <button className="ob-btn ob-btn-g ob-btn-ch" onClick={() => setPrevia(null)}>
                Descartar
              </button>
              <button className="ob-btn ob-btn-p ob-btn-ch" onClick={aplicar} disabled={!buenos}>
                Matricular {buenos}
              </button>
            </div>
          </div>
          <div className="ob-tabla-scroll">
            <table className="ob-tabla">
              <thead><tr><th>Fila</th><th>Alumno</th><th>Curso</th><th>Qué va a pasar</th></tr></thead>
              <tbody>
                {previa.items.slice(0, 60).map(i => {
                  const [color] = ESTADOS_MATRICULA[i.estado] || ['ne', i.estado];
                  return (
                    <tr key={i.fila}>
                      <td>{i.fila}</td>
                      <td><b>{i.nombre} {i.apellido}</b></td>
                      <td>{i.curso_nombre || i.curso_texto || '—'}</td>
                      <td><span className={`ob-pill ${color}`}>{i.detalle}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {previa.items.length > 60 && (
            <div className="ob-cajon-cuerpo" style={{ fontSize: 12, color: '#6b7280', borderTop: '1px solid #f1f3f7' }}>
              Se muestran las primeras 60 filas de {previa.items.length}.
            </div>
          )}
          {malos > 0 && (
            <div className="ob-cajon-cuerpo" style={{ borderTop: '1px solid #f1f3f7' }}>
              <Aviso tipo="al">
                <b>{malos} fila{malos === 1 ? '' : 's'} con problemas</b> que no se van a
                guardar. Las otras {buenos} sí. Puedes corregir la planilla y volver a
                subirla, o seguir y arreglarlas a mano después.
              </Aviso>
            </div>
          )}
        </div>
      )}

      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
    </>
  );
}

/* ── Paso 7: carga horaria y jefaturas ──────────────────────────────── */

function PasoCarga({ year, paso, recargar, navegar }) {
  const [cursos, setCursos] = useState([]);
  const [docentes, setDocentes] = useState([]);
  const [guardando, setGuardando] = useState(null);

  const traer = useCallback(async () => {
    const [c, d] = await Promise.all([
      axios.get(`/api/courses/?year=${year}`).catch(() => ({ data: [] })),
      axios.get('/api/users/?role=profesor').catch(() => ({ data: [] })),
    ]);
    setCursos(Array.isArray(c.data) ? c.data : []);
    setDocentes(Array.isArray(d.data) ? d.data : []);
  }, [year]);

  useEffect(() => { traer(); }, [traer]);

  const fijarJefe = async (curso, teacher_id) => {
    setGuardando(curso.id);
    try {
      await axios.put(`/api/courses/${curso.id}`,
        { head_teacher_id: teacher_id ? Number(teacher_id) : null });
      await traer();
      await recargar(year);
    } finally { setGuardando(null); }
  };

  return (
    <>
      <div className="ob-cajon">
        <div className="ob-cajon-cab">
          <h4>Profesores jefes</h4>
          <span className={`ob-pill ${cursos.every(c => c.head_teacher_id) ? 'ok' : 'al'}`}>
            {cursos.filter(c => c.head_teacher_id).length} de {cursos.length}
          </span>
        </div>
        {cursos.length === 0
          ? <div className="ob-cajon-cuerpo" style={{ textAlign: 'center', padding: 24, color: '#9ca3af', fontSize: 13 }}>
              Primero hay que crear los cursos.
            </div>
          : <div className="ob-tabla-scroll">
              <table className="ob-tabla">
                <thead><tr><th>Curso</th><th>Profesor jefe</th></tr></thead>
                <tbody>
                  {cursos.map(c => (
                    <tr key={c.id}>
                      <td><b>{c.name}</b></td>
                      <td>
                        <select value={c.head_teacher_id || ''}
                                disabled={guardando === c.id}
                                onChange={e => fijarJefe(c, e.target.value)}
                                style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '5px 9px', fontSize: 12.5, fontFamily: 'inherit', minWidth: 190 }}>
                          <option value="">Sin asignar</option>
                          {docentes.map(d => (
                            <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
      </div>

      <div className="ob-cajon">
        <div className="ob-cajon-cab">
          <h4>Reparto de horas</h4>
          <div className="ob-der">
            <button className="ob-btn ob-btn-g ob-btn-ch" onClick={() => navegar('/carga-academica')}>
              Abrir Carga Académica
            </button>
          </div>
        </div>
        <div className="ob-cajon-cuerpo" style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.7 }}>
          El reparto de horas vive en su propio módulo, porque es un proceso largo:
          se ingresa la jornada contratada de cada docente, se reparten las horas
          según la Tabla Legal del MINEDUC y se publica al libro de clases.
          {paso.pendientes.length > 0 && (
            <ul style={{ margin: '10px 0 0 18px' }}>
              {paso.pendientes.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          )}
        </div>
      </div>

      <Aviso tipo="info">
        Este paso es el único opcional: un colegio puede empezar a usar la
        plataforma sin el horario repartido y completarlo sobre la marcha.
      </Aviso>
    </>
  );
}

/* ── Paso 8: activar y entregar accesos ─────────────────────────────── */

function PasoAccesos({ estado, year, recargar }) {
  const [accesos, setAccesos] = useState(null);
  const [claves, setClaves] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState(null);

  const traer = useCallback(async () => {
    const { data } = await axios.get('/api/onboarding/accesos').catch(() => ({ data: null }));
    setAccesos(data);
  }, []);

  useEffect(() => { traer(); }, [traer]);

  const activar = async generar_claves => {
    setOcupado(true);
    setAviso(null);
    try {
      const { data } = await axios.post('/api/onboarding/accesos/activar', { generar_claves });
      if (generar_claves) setClaves(data.claves);
      else setAviso({ tipo: 'ok', texto: `${data.activadas} cuentas activadas` });
      await traer();
      await recargar(year);
    } catch (e) {
      setAviso({ tipo: 'mal', texto: explicar(e, 'No se pudo activar') });
    } finally { setOcupado(false); }
  };

  const cerrar = async forzar => {
    setOcupado(true);
    try {
      await axios.post(`/api/onboarding/cerrar?year=${year}`, { forzar });
      await recargar(year);
      setAviso({ tipo: 'ok', texto: 'Puesta en marcha cerrada' });
    } catch (e) {
      setAviso({ tipo: 'al', texto: explicar(e, 'No se pudo cerrar') });
    } finally { setOcupado(false); }
  };

  const descargarClaves = () => {
    const filas = [['nombre', 'correo', 'rol', 'clave temporal'],
      ...claves.map(c => [c.nombre, c.email, ROLES_EQUIPO[c.rol] || c.rol, c.clave])];
    // El punto y coma es lo que Excel en español espera como separador
    const csv = '﻿' + filas.map(f => f.map(v => `"${v}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `Claves_${(estado.year)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <>
      <div className="ob-cajon ob-no-imprimir">
        <div className="ob-cajon-cab"><h4>Revisión final</h4></div>
        <div className="ob-cajon-cuerpo">
          <ul className="ob-resumen">
            {estado.pasos.filter(p => p.clave !== 'accesos').map(p => {
              const ok = p.estado === 'completo';
              return (
                <li key={p.clave}>
                  <span className={`ob-ic ${ok ? 'ok' : 'al'}`}>{ok ? <Tic /> : <Alerta />}</span>
                  <div>
                    <b>{p.titulo}</b>
                    <p>{p.detalle}</p>
                  </div>
                  <span className={`ob-der ob-pill ${ok ? 'ok' : 'al'}`}>
                    {ok ? 'Listo' : p.opcional ? 'Opcional' : 'Revisar'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="ob-cajon ob-no-imprimir">
        <div className="ob-cajon-cab">
          <h4>Entrega de accesos</h4>
          {accesos && (
            <span className="ob-pill ne">
              {accesos.activas} de {accesos.total} cuentas activas
            </span>
          )}
        </div>
        <div className="ob-cajon-cuerpo">
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            <button className="ob-btn ob-btn-p" disabled={ocupado} onClick={() => activar(true)}>
              Activar y generar claves ahora
            </button>
            <button className="ob-btn ob-btn-g" disabled={ocupado} onClick={() => activar(false)}>
              Activar y entregar después
            </button>
          </div>
          <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 12, lineHeight: 1.6 }}>
            Si eliges «después», las cuentas quedan activas sin clave entregada y
            puedes generarlas cuando quieras, a una persona o a todas, desde Usuarios.
            Las claves no se guardan en ninguna parte: si se pierden, se generan otras.
          </p>
        </div>
      </div>

      {claves && (
        <div className="ob-cajon">
          <div className="ob-cajon-cab">
            <h4>Claves temporales · {claves.length} personas</h4>
            <div className="ob-der ob-no-imprimir">
              <button className="ob-btn ob-btn-g ob-btn-ch" onClick={() => window.print()}>
                Imprimir
              </button>
              <button className="ob-btn ob-btn-g ob-btn-ch" onClick={descargarClaves}>
                Descargar CSV
              </button>
            </div>
          </div>
          <div className="ob-cajon-cuerpo ob-no-imprimir" style={{ paddingBottom: 0 }}>
            <Aviso tipo="al">
              <b>Se muestran una sola vez.</b> Imprímelas o descárgalas antes de salir
              de esta pantalla. Cada persona debe cambiarla en su primer ingreso.
            </Aviso>
          </div>
          <div className="ob-tabla-scroll">
            <table className="ob-tabla ob-claves">
              <thead><tr><th>Persona</th><th>Correo</th><th>Rol</th><th>Clave temporal</th></tr></thead>
              <tbody>
                {claves.map(c => (
                  <tr key={c.id}>
                    <td><b>{c.nombre}</b></td>
                    <td style={{ fontSize: 12 }}>{c.email}</td>
                    <td>{ROLES_EQUIPO[c.rol] || c.rol}</td>
                    <td><code>{c.clave}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      <div className="ob-cajon ob-no-imprimir">
        <div className="ob-cajon-cab"><h4>Cerrar la puesta en marcha</h4></div>
        <div className="ob-cajon-cuerpo">
          {estado.cerrado_at ? (
            <Aviso tipo="ok">
              Cerrada el {new Date(estado.cerrado_at).toLocaleDateString('es-CL')}.
              El colegio está operativo.
            </Aviso>
          ) : estado.puede_cerrar ? (
            <>
              <p style={{ fontSize: 13, color: '#4b5563', marginBottom: 12 }}>
                Todo lo necesario está listo.
              </p>
              <button className="ob-btn ob-btn-p" disabled={ocupado} onClick={() => cerrar(false)}>
                Dar por terminada la puesta en marcha
              </button>
            </>
          ) : (
            <>
              <Aviso tipo="al">
                Quedan pasos sin completar: {estado.faltan_para_cerrar.join(', ')}.
                Puedes cerrar igual si prefieres resolverlos sobre la marcha.
              </Aviso>
              <button className="ob-btn ob-btn-g" style={{ marginTop: 12 }}
                      disabled={ocupado} onClick={() => cerrar(true)}>
                Cerrar de todas formas
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
