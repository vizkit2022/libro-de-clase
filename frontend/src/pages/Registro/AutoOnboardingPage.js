import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth, sinColegio } from '../../context/AuthContext';
import { msgError } from '../../components/UI/Modal';
import { Logo, Aviso } from '../Login/PanelMarca';
import '../Login/LoginPage.css';
import './Registro.css';

const API = '/api/autoonboarding';
const EXTENSIONES = /\.(xlsx|xlsm|csv)$/i;
const MAX_MB = 5;
const MAX_ERRORES = 12;
// La foto la sirve el backend (/inicio/img): va aquí para que el build no la busque en src
const FONDO_BANDA = {
  backgroundImage: 'linear-gradient(135deg, rgba(14, 16, 46, .95) 0%, rgba(14, 16, 46, .86) 55%, rgba(26, 26, 110, .76) 100%), url(/inicio/img/aula-2.jpg)',
};

const ETIQUETAS = {
  curso: 'Curso', rut: 'RUT', nombres: 'Nombres', apellidos: 'Apellidos',
  email_apoderado: 'Correo del apoderado', telefono_apoderado: 'Teléfono del apoderado',
  email: 'Correo', asignatura: 'Asignatura', fila: 'Fila', nombre_completo: 'Nombre completo',
  apellido_paterno: 'Apellido paterno', apellido_materno: 'Apellido materno',
};
const etiqueta = (k) => {
  if (String(k).startsWith('docente_')) return `${etiqueta(k.slice(8))} del docente`;
  return ETIQUETAS[k] || String(k).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
};
const entero = (n) => Math.round(Number(n || 0)).toLocaleString('es-CL');
const plural = (n, uno, varios) => `${entero(n)} ${n === 1 ? uno : varios}`;
const decimal = (n) => Number(n).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function errorDeArchivo(e) {
  if (e?.response?.status === 413) return `El archivo pesa demasiado. El máximo son ${MAX_MB} MB.`;
  if (!e?.response) return 'No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo.';
  return msgError(e, 'No pudimos leer ese archivo. Revisa que sea un Excel e inténtalo de nuevo.');
}

// ─── Piezas ────────────────────────────────────────────────────────────

// Sube desde cero hasta el valor. El lector de pantalla recibe el valor final.
function Cifra({ valor, etiqueta: txt, formato = entero, sufijo = '' }) {
  const [visto, setVisto] = useState(0);
  useEffect(() => {
    const destino = Number(valor) || 0;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisto(destino);
      return undefined;
    }
    let cuadro;
    const inicio = performance.now();
    const paso = (t) => {
      const p = Math.min((t - inicio) / 900, 1);
      setVisto(destino * (1 - (1 - p) ** 3));
      if (p < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [valor]);

  return (
    <div className="rb-cifra" role="group" aria-label={`${txt}: ${formato(valor)}${sufijo}`}>
      <b aria-hidden="true">{formato(visto)}{sufijo}</b>
      <span aria-hidden="true">{txt}</span>
    </div>
  );
}

// Una sola serie: alumnos por curso. El promedio va como texto, sin segundo eje.
function BarrasCurso({ filas, valor, titulo }) {
  const max = Math.max(1, ...filas.map(valor));
  const conPromedio = filas.some(f => f.promedio != null);
  return (
    <figure className="rb-barras">
      <figcaption>{titulo}</figcaption>
      <ul>
        {filas.map((f, i) => (
          <li key={`${f.nombre}-${i}`}
            title={`${f.nombre}: ${plural(valor(f), 'alumno', 'alumnos')}${f.promedio != null ? `, promedio ${decimal(f.promedio)}` : ''}`}>
            <span className="rb-barra-nom">{f.nombre}</span>
            <span className="rb-barra-pista">
              <i style={{ width: `${(valor(f) / max) * 100}%`, animationDelay: `${Math.min(i, 14) * 35}ms` }} />
            </span>
            <span className="rb-barra-val">{entero(valor(f))}</span>
            {conPromedio && (
              <span className="rb-barra-prom">{f.promedio != null ? `prom. ${decimal(f.promedio)}` : ''}</span>
            )}
          </li>
        ))}
      </ul>
    </figure>
  );
}

function Pasos({ actual }) {
  const pasos = ['Tu colegio', 'Tus datos', 'Listo'];
  return (
    <ol className="rb-migas" aria-label="Avance">
      {pasos.map((p, i) => (
        <li key={p} className={i < actual ? 'ok' : i === actual ? 'act' : ''}
          aria-current={i === actual ? 'step' : undefined}>
          <span aria-hidden="true">{i < actual ? '✓' : i + 1}</span>{p}
        </li>
      ))}
    </ol>
  );
}

function Cabecera({ actual, titulo, bajada, puedeSaltar }) {
  return (
    <header className="rb-banda" style={FONDO_BANDA}>
      <div className="rb-banda-env">
        <div className="rb-banda-tope">
          <Logo tam={34} />
          <Pasos actual={actual} />
          {puedeSaltar
            ? <Link className="rb-enlace-claro" to="/dashboard">Saltar por ahora</Link>
            : <span className="rb-banda-hueco" />}
        </div>
        <h1>{titulo}</h1>
        {bajada && <p>{bajada}</p>}
      </div>
    </header>
  );
}

// ─── Paso 1: elegir el camino ──────────────────────────────────────────

function Caminos({ resumen, onArchivo, onDemo, ocupado, error }) {
  const [arrastrando, setArrastrando] = useState(false);
  const [bajando, setBajando] = useState(false);
  const [errorPlantilla, setErrorPlantilla] = useState('');
  const input = useRef(null);

  const soltar = (e) => {
    e.preventDefault();
    setArrastrando(false);
    if (ocupado) return;
    const f = e.dataTransfer?.files?.[0];
    if (f) onArchivo(f);
  };

  const bajarPlantilla = async () => {
    setBajando(true);
    setErrorPlantilla('');
    try {
      const { data } = await axios.get(`${API}/plantilla.xlsx`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Plantilla_Recreo_Edu.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setErrorPlantilla('No pudimos descargar la plantilla. Inténtalo de nuevo.');
    }
    setBajando(false);
  };

  const yaTieneDemo = !!resumen?.tiene_demo;
  const yaTieneDatos = !yaTieneDemo && (resumen?.alumnos || 0) > 0;

  return (
    <div className="rb-env rb-sube">
      <Aviso>{error}</Aviso>
      <div className="rb-caminos">
        <section className="rb-camino rb-camino-excel" aria-labelledby="cam-excel">
          <span className="rb-camino-et">Con tus datos</span>
          <h2 id="cam-excel">Sube tu Excel</h2>
          <p>Sirve la planilla que ya usas: reconocemos las columnas aunque se llamen distinto
            y no guardamos nada hasta que lo apruebes.</p>

          <div className={`rb-zona ${arrastrando ? 'sobre' : ''}`}
            onDragOver={e => { e.preventDefault(); setArrastrando(true); }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={soltar}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5M12 17v-5M9.5 14.5 12 12l2.5 2.5" />
            </svg>
            <span className="rb-zona-txt">Arrastra tu archivo hasta aquí</span>
            <span className="rb-zona-o">o</span>
            <button type="button" className="kv-entrar rb-btn-auto" disabled={ocupado}
              onClick={() => input.current?.click()}>
              {ocupado === 'archivo' ? <><span className="kv-girando" /> Leyendo tu planilla…</> : 'Elegir archivo'}
            </button>
            <input ref={input} type="file" className="sr-solo" tabIndex={-1}
              accept=".xlsx,.xlsm,.csv" aria-label="Archivo Excel"
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onArchivo(f); }} />
          </div>

          <p className="rb-plantilla">
            ¿Prefieres partir ordenado?{' '}
            <button type="button" className="rb-enlace" disabled={bajando} onClick={bajarPlantilla}>
              {bajando ? 'Descargando…' : 'Descarga la plantilla'}
            </button>
          </p>
          {errorPlantilla && <p className="kv-campo-error" role="alert">{errorPlantilla}</p>}
        </section>

        <section className="rb-camino rb-camino-demo" aria-labelledby="cam-demo">
          <span className="rb-camino-et">Sin cargar nada</span>
          <h2 id="cam-demo">Explora con datos de ejemplo</h2>
          <p>Un colegio ficticio ya andando, para que recorras la plataforma antes de traer tus datos.</p>
          <ul className="rb-lista">
            <li>Cursos con sus alumnos y apoderados</li>
            <li>Docentes, asignaturas y notas para revisar</li>
            <li>Anotaciones como las de un libro de clases</li>
            <li>Se borran con un clic, cuando quieras</li>
          </ul>
          {yaTieneDemo ? (
            <Link className="kv-entrar rb-btn-sec" to="/dashboard">Ver el colegio de ejemplo</Link>
          ) : (
            <button type="button" className="kv-entrar rb-btn-sec" disabled={!!ocupado || yaTieneDatos} onClick={onDemo}>
              {ocupado === 'demo' ? <><span className="kv-girando rb-girando-osc" /> Armando el colegio de ejemplo…</> : 'Cargar datos de ejemplo'}
            </button>
          )}
          {yaTieneDatos && (
            <p className="rb-nota">Tu colegio ya tiene alumnos, así que el ejemplo no hace falta.</p>
          )}
        </section>
      </div>
      <p className="rb-saltar">
        <Link to="/dashboard">Prefiero entrar al panel y cargar esto después</Link>
      </p>
    </div>
  );
}

// ─── Paso 2: vista previa ──────────────────────────────────────────────

function textoCargar(d) {
  if (d.total_alumnos > 0) return `Cargar ${plural(d.total_alumnos, 'alumno', 'alumnos')} a mi colegio`;
  if (d.total_docentes > 0) return `Cargar ${plural(d.total_docentes, 'docente', 'docentes')} a mi colegio`;
  return 'Cargar a mi colegio';
}

function VistaPrevia({ nombre, datos, aplicando, error, onAplicar, onOtro }) {
  const detectadas = Object.entries(datos.columnas_detectadas || {});
  const faltantes = datos.columnas_faltantes || [];
  const errores = datos.errores || [];
  const muestra = datos.muestra || [];
  const cursos = datos.cursos || [];
  const columnas = [...new Set(muestra.flatMap(f => Object.keys(f)))];

  return (
    <div className="rb-env rb-sube">
      <div className="rb-caja rb-prev-cab">
        <div className="rb-prev-archivo">
          <span>Revisamos</span>
          <b>{nombre}</b>
        </div>
        <button type="button" className="ui-btn" disabled={aplicando} onClick={onOtro}>Cambiar archivo</button>
      </div>

      <div className="rb-cifras rb-caja">
        <div className="rb-cifra"><b>{entero(cursos.length)}</b><span>{cursos.length === 1 ? 'curso' : 'cursos'}</span></div>
        <div className="rb-cifra"><b>{entero(datos.total_alumnos)}</b><span>alumnos</span></div>
        <div className="rb-cifra"><b>{entero(datos.total_apoderados)}</b><span>apoderados</span></div>
        <div className="rb-cifra"><b>{entero(datos.total_docentes)}</b><span>docentes</span></div>
      </div>

      <div className="rb-prev-grid">
        <section className="rb-caja">
          <h2>Columnas que reconocimos</h2>
          {detectadas.length ? (
            <ul className="rb-cols">
              {detectadas.map(([campo, encabezado]) => (
                <li key={campo}><b>{etiqueta(campo)}</b><span>tu columna «{encabezado}»</span></li>
              ))}
            </ul>
          ) : <p className="rb-nota">No reconocimos ninguna columna.</p>}
          {faltantes.length > 0 && (
            <p className="rb-faltan"><b>No encontramos:</b> {faltantes.map(etiqueta).join(', ')}.</p>
          )}
        </section>

        <section className="rb-caja">
          {cursos.length
            ? <BarrasCurso titulo="Alumnos por curso" filas={cursos} valor={c => c.alumnos || 0} />
            : <p className="rb-nota">No encontramos cursos en el archivo.</p>}
        </section>
      </div>

      {errores.length > 0 && (
        <section className="rb-caja rb-errores">
          <h2>{plural(errores.length, 'fila necesita', 'filas necesitan')} revisión</h2>
          <p className="rb-nota">
            {datos.se_puede_aplicar
              ? 'Estas filas se dejan fuera. Lo demás se carga igual y después puedes corregirlas y volver a subir el archivo: nada se duplica.'
              : 'Corrige estas filas en tu Excel y vuelve a subirlo.'}
          </p>
          <ul>
            {errores.slice(0, MAX_ERRORES).map((e, i) => (
              <li key={`${e.fila}-${i}`}><b>Fila {e.fila}</b> {e.motivo}</li>
            ))}
          </ul>
          {errores.length > MAX_ERRORES && (
            <p className="rb-nota">Y {plural(errores.length - MAX_ERRORES, 'más', 'más')}.</p>
          )}
        </section>
      )}

      {muestra.length > 0 && (
        <section className="rb-caja">
          <h2>Así se leen tus primeras filas</h2>
          <div className="rb-tabla-env" tabIndex={0} role="region" aria-label="Muestra de filas del archivo">
            <table className="rb-tabla">
              <thead><tr>{columnas.map(c => <th key={c} scope="col">{etiqueta(c)}</th>)}</tr></thead>
              <tbody>
                {muestra.map((f, i) => (
                  <tr key={i}>{columnas.map(c => <td key={c}>{f[c] ?? '—'}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Aviso>{error}</Aviso>
      {!datos.se_puede_aplicar && !error && (
        <Aviso>Con este archivo todavía no podemos cargar nada. Revisa lo que falta y vuelve a subirlo.</Aviso>
      )}
      <div className="rb-prev-accion">
        <p>Todavía no se ha guardado nada, y nadie recibirá correos por esto.</p>
        <button type="button" className="kv-entrar rb-btn-auto" disabled={!datos.se_puede_aplicar || aplicando} onClick={onAplicar}>
          {aplicando ? <><span className="kv-girando" /> Cargando tu colegio…</> : textoCargar(datos)}
        </button>
      </div>
    </div>
  );
}

// ─── Paso 3: el resultado ──────────────────────────────────────────────

// "8 cursos nuevos, 184 alumnos nuevos y 171 apoderados.": lo que fue cero no se nombra
function resumenAplicado(a) {
  const partes = [
    a.cursos_creados > 0 && plural(a.cursos_creados, 'curso nuevo', 'cursos nuevos'),
    a.alumnos_creados > 0 && plural(a.alumnos_creados, 'alumno nuevo', 'alumnos nuevos'),
    a.alumnos_actualizados > 0 && plural(a.alumnos_actualizados, 'alumno actualizado', 'alumnos actualizados'),
    a.apoderados_creados > 0 && plural(a.apoderados_creados, 'apoderado', 'apoderados'),
    a.docentes_creados > 0 && plural(a.docentes_creados, 'docente', 'docentes'),
  ].filter(Boolean);
  if (!partes.length) return 'Tus datos ya estaban cargados: no hubo nada nuevo que agregar.';
  const ultima = partes.pop();
  return `${partes.length ? `${partes.join(', ')} y ` : ''}${ultima}.`;
}

function Resultado({ resumen, aplicado, esDemo, errorResumen }) {
  const navigate = useNavigate();
  const por = resumen?.por_curso || [];
  const omitidos = aplicado?.omitidos || [];

  return (
    <div className="rb-env rb-sube">
      {resumen ? (
        <div className="rb-cifras rb-caja rb-cifras-grandes">
          <Cifra valor={resumen.cursos} etiqueta="cursos" />
          <Cifra valor={resumen.alumnos} etiqueta="alumnos" />
          <Cifra valor={resumen.apoderados} etiqueta="apoderados" />
          {resumen.docentes > 0 && <Cifra valor={resumen.docentes} etiqueta="docentes" />}
          {resumen.asignaturas > 0 && <Cifra valor={resumen.asignaturas} etiqueta="asignaturas" />}
          {resumen.promedio_general != null && <Cifra valor={resumen.promedio_general} etiqueta="promedio general" formato={decimal} />}
          {resumen.asistencia != null && <Cifra valor={resumen.asistencia} etiqueta="asistencia" formato={v => Math.round(Number(v)).toLocaleString('es-CL')} sufijo="%" />}
          {resumen.anotaciones > 0 && <Cifra valor={resumen.anotaciones} etiqueta="anotaciones" />}
        </div>
      ) : errorResumen && <div className="ui-aviso ui-aviso-info">Tus datos se cargaron, pero no pudimos traer el resumen. Los verás en tu panel.</div>}

      {aplicado && (
        <p className="rb-caja rb-aplicado">
          {resumenAplicado(aplicado)}
          {' '}Nadie recibió correos: tú decides cuándo entregar los accesos.
        </p>
      )}

      {por.length > 0 && (
        <section className="rb-caja">
          <BarrasCurso titulo="Alumnos por curso" filas={por} valor={c => c.alumnos || 0} />
        </section>
      )}

      {omitidos.length > 0 && (
        <details className="rb-caja rb-omitidos">
          <summary>{plural(omitidos.length, 'fila quedó', 'filas quedaron')} fuera</summary>
          <ul>
            {omitidos.map((o, i) => <li key={`${o.fila}-${i}`}><b>Fila {o.fila}</b> {o.motivo}</li>)}
          </ul>
        </details>
      )}

      {esDemo && (
        <div className="ui-aviso ui-aviso-info">
          Son datos ficticios. Cuando quieras, los borras con un clic desde el aviso del panel y cargas los tuyos.
        </div>
      )}

      <div className="rb-final">
        <button type="button" className="kv-entrar rb-btn-auto" onClick={() => navigate('/dashboard')}>Ir a mi panel</button>
        {!esDemo && <Link className="rb-enlace" to="/onboarding">Seguir con la puesta en marcha</Link>}
      </div>
    </div>
  );
}

// ─── Pantalla ──────────────────────────────────────────────────────────

export default function AutoOnboardingPage() {
  const { user, school, refrescarSesion, recargarAnios } = useAuth();
  const [resumen, setResumen] = useState(null);
  const [etapa, setEtapa] = useState('elegir');   // elegir | vista | listo
  const [ocupado, setOcupado] = useState(null);   // 'archivo' | 'demo' | 'aplicar'
  const [error, setError] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [aplicado, setAplicado] = useState(null);
  const [esDemo, setEsDemo] = useState(false);
  const [errorResumen, setErrorResumen] = useState(false);

  const necesitaColegio = sinColegio(user, school);

  const traerResumen = useCallback(async () => {
    const { data } = await axios.get(`${API}/resumen`);
    setResumen(data);
    return data;
  }, []);

  useEffect(() => {
    if (necesitaColegio) return;
    traerResumen().catch(() => {});   // solo orienta el primer paso; no es indispensable
  }, [necesitaColegio, traerResumen]);

  if (necesitaColegio) return <Navigate to="/bienvenida" replace />;

  const irArriba = () => window.scrollTo?.({ top: 0 });

  const elegirArchivo = async (f) => {
    setError('');
    if (/\.xls$/i.test(f.name)) {
      setError('Ese formato de Excel es muy antiguo. Guárdalo como .xlsx y vuelve a subirlo.');
      return;
    }
    if (!EXTENSIONES.test(f.name)) {
      setError('Ese archivo no es una planilla. Sube un Excel (.xlsx) o un CSV.');
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`El archivo pesa demasiado. El máximo son ${MAX_MB} MB.`);
      return;
    }
    setOcupado('archivo');
    try {
      const fd = new FormData();
      fd.append('archivo', f);
      const { data } = await axios.post(`${API}/previsualizar`, fd);
      setArchivo(f);
      setPrevia(data);
      setEtapa('vista');
      irArriba();
    } catch (e) {
      setError(errorDeArchivo(e));
    }
    setOcupado(null);
  };

  const aplicar = async () => {
    setError('');
    setOcupado('aplicar');
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      const { data } = await axios.post(`${API}/aplicar`, fd);
      setAplicado(data);
      setResumen(data.resumen || null);
      setEsDemo(false);
      setEtapa('listo');
      irArriba();
      if (!data.resumen) traerResumen().catch(() => setErrorResumen(true));
      refrescarSesion?.();
      recargarAnios?.();
    } catch (e) {
      setError(errorDeArchivo(e));
    }
    setOcupado(null);
  };

  const cargarDemo = async () => {
    setError('');
    setOcupado('demo');
    try {
      const { data } = await axios.post(`${API}/demo`);
      setResumen(data?.resumen || null);
      setEsDemo(true);
      setEtapa('listo');
      irArriba();
      if (!data?.resumen) traerResumen().catch(() => setErrorResumen(true));
      refrescarSesion?.();
      recargarAnios?.();
    } catch (e) {
      setError(e.response ? msgError(e, 'No pudimos cargar los datos de ejemplo. Inténtalo de nuevo.')
        : 'No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo.');
    }
    setOcupado(null);
  };

  const volver = () => { setEtapa('elegir'); setPrevia(null); setArchivo(null); setError(''); };

  const colegio = school?.name || 'tu colegio';

  return (
    <div className="rb rb-datos">
      {etapa === 'elegir' && (
        <>
          <Cabecera actual={1} puedeSaltar
            titulo={<>De tu Excel a <em>{colegio}</em> funcionando</>}
            bajada="Elige cómo quieres empezar. Cualquiera de los dos caminos te deja dentro de la plataforma en minutos." />
          <Caminos resumen={resumen} onArchivo={elegirArchivo} onDemo={cargarDemo}
            ocupado={ocupado} error={error} />
        </>
      )}

      {etapa === 'vista' && previa && (
        <>
          <Cabecera actual={1} puedeSaltar
            titulo={tituloVista(previa)}
            bajada="Mira lo que encontramos antes de guardar. Si algo no calza, corrige tu Excel y vuelve a subirlo." />
          <VistaPrevia nombre={archivo?.name} datos={previa} aplicando={ocupado === 'aplicar'}
            error={error} onAplicar={aplicar} onOtro={volver} />
        </>
      )}

      {etapa === 'listo' && (
        <>
          <Cabecera actual={2}
            titulo={esDemo ? <>Así se ve un colegio <em>en Recreo Edu</em></> : <><em>{colegio}</em> ya está en marcha</>}
            bajada={esDemo ? 'Recorre el panel, abre un curso y revisa las notas: todo es ficticio, así que puedes tocar lo que quieras.' : 'Esto es lo que ya tienes dentro de la plataforma.'} />
          <Resultado resumen={resumen} aplicado={aplicado} esDemo={esDemo} errorResumen={errorResumen} />
        </>
      )}
    </div>
  );
}

function tituloVista(previa) {
  const n = previa.total_alumnos || 0;
  const c = (previa.cursos || []).length;
  if (!n && previa.total_docentes > 0) return <>Encontramos <em>{plural(previa.total_docentes, 'docente', 'docentes')}</em></>;
  if (!n) return <>Revisemos <em>tu archivo</em></>;
  return <>Encontramos <em>{plural(n, 'alumno', 'alumnos')}</em> en {plural(c, 'curso', 'cursos')}</>;
}
