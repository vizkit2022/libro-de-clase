import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Modal, { msgError } from '../../components/UI/Modal';
import { Icono } from '../../components/Layout/iconos';
import '../../components/UI/ui.css';
import './AniosPage.css';

function fmtFechaHora(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const n = (v) => (typeof v === 'number' ? v.toLocaleString('es-CL') : (v ?? '—'));

function ChipEstado({ estado }) {
  const cerrado = estado === 'cerrado';
  return (
    <span className="ui-chip" style={cerrado
      ? { color: '#92400e', background: '#fef3c7' }
      : { color: '#15803d', background: '#dcfce7' }}>
      {cerrado && <Icono nombre="candado" tam={11} />}
      {cerrado ? 'Cerrado' : 'Abierto'}
    </span>
  );
}

// ── Crear año ─────────────────────────────────────────────────────────
function ModalCrear({ anios, onClose, onCreado }) {
  const { setAnio } = useAuth();
  const navigate = useNavigate();
  const maximo = anios.reduce((m, a) => Math.max(m, a.year), new Date().getFullYear() - 1);
  const conCursos = anios.filter(a => a.cursos > 0);
  const [year, setYear] = useState(maximo + 1);
  const [desde, setDesde] = useState(conCursos.length ? String(conCursos[0].year) : '');
  const [copiar, setCopiar] = useState({ cursos: true, asignaturas: true, periodos: true, alumnos: true });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null);

  const sinCopia = !desde;
  const marcar = (k) => setCopiar(c => {
    const nuevo = { ...c, [k]: !c[k] };
    if (k === 'cursos' && !nuevo.cursos) { nuevo.alumnos = false; nuevo.asignaturas = false; }
    return nuevo;
  });

  const crear = async () => {
    const y = parseInt(year, 10);
    if (!Number.isFinite(y) || y < 2000 || y > 2100) return setError('Escribe un año válido.');
    setEnviando(true);
    setError(null);
    try {
      const body = sinCopia
        ? { year: y, copiar_de: null, copiar: { cursos: false, asignaturas: false, periodos: false, alumnos: false } }
        : { year: y, copiar_de: parseInt(desde, 10), copiar };
      const r = await axios.post('/api/anios', body);
      setResultado({ year: y, ...r.data });
      onCreado();
    } catch (e) {
      setError(msgError(e, 'No se pudo crear el año.'));
    }
    setEnviando(false);
  };

  if (resultado) {
    const r = resultado;
    const sinDestino = Array.isArray(r.sin_curso_destino) ? r.sin_curso_destino : [];
    const mapa = Array.isArray(r.mapa) ? r.mapa : [];
    return (
      <Modal titulo={`Año ${r.year} creado`} ancho={640} onClose={onClose}
        subtitulo="Esto es lo que se preparó. Los alumnos promovidos quedan “por confirmar” hasta que confirmes su matrícula."
        pie={<>
          <button type="button" className="ui-btn" onClick={onClose}>Cerrar</button>
          <button type="button" className="ui-btn ui-btn-pri"
            onClick={() => { setAnio(r.year); navigate('/matricula'); }}>
            Ir a Matrícula {r.year}
          </button>
        </>}>
        <div className="an-resumen">
          {[['Cursos creados', r.cursos_creados], ['Asignaturas copiadas', r.asignaturas_copiadas],
            ['Períodos copiados', r.periodos_copiados], ['Alumnos promovidos', r.alumnos_promovidos],
            ['Egresados', r.egresados]].map(([et, v]) => (
            <div key={et} className="an-resumen-it">
              <b>{n(v ?? 0)}</b><span>{et}</span>
            </div>
          ))}
        </div>
        {mapa.length > 0 && (
          <>
            <h4 className="an-sub">Cómo se promovió cada curso</h4>
            <div className="an-mapa">
              {mapa.map((m, i) => (
                <span key={i}><b>{m.desde}</b> <span aria-label="pasa a">→</span> {m.hacia}</span>
              ))}
            </div>
          </>
        )}
        {r.egresados > 0 && (
          <div className="ui-aviso ui-aviso-info" style={{ marginTop: 14 }}>
            <Icono nombre="birrete" tam={16} />
            <span>{r.egresados} {r.egresados === 1 ? 'alumno del último nivel egresa' : 'alumnos del último nivel egresan'}: no se
              matriculan en {r.year} y queda registrado en su historial.</span>
          </div>
        )}
        {sinDestino.length > 0 && (
          <div className="ui-aviso ui-aviso-alerta">
            <Icono nombre="alerta" tam={16} />
            <div>
              <b>{sinDestino.length} {sinDestino.length === 1 ? 'alumno quedó' : 'alumnos quedaron'} sin curso de destino.</b>
              {' '}Matricúlalos a mano desde Matrícula {r.year}.
              <ul>
                {sinDestino.slice(0, 12).map((s, i) => <li key={i}>{s.alumno} <span style={{ opacity: .7 }}>(venía de {s.desde})</span></li>)}
                {sinDestino.length > 12 && <li>y {sinDestino.length - 12} más…</li>}
              </ul>
            </div>
          </div>
        )}
      </Modal>
    );
  }

  const opciones = [
    ['cursos', 'Cursos y profesor jefe', 'Los mismos cursos (1° A, 2° A…) como registros nuevos del año.'],
    ['asignaturas', 'Asignaturas de cada curso', 'Con el profesor asignado en cada una.', !copiar.cursos],
    ['periodos', 'Períodos (semestres/trimestres)', 'Con las mismas fechas, corridas un año.'],
    ['alumnos', 'Promover alumnos al nivel siguiente', 'Quedan “por confirmar”. Los del último nivel egresan.', !copiar.cursos],
  ];

  return (
    <Modal titulo="Crear año académico" ancho={560} onClose={onClose} ocupado={enviando}
      subtitulo="Prepara el año siguiente copiando la estructura de un año anterior. Nada del año de origen se modifica."
      pie={<>
        <button type="button" className="ui-btn" onClick={onClose} disabled={enviando}>Cancelar</button>
        <button type="button" className="ui-btn ui-btn-pri" onClick={crear} disabled={enviando}>
          {enviando ? 'Creando…' : `Crear año ${year || ''}`}
        </button>
      </>}>
      {error && <div className="ui-aviso ui-aviso-peligro">{error}</div>}
      <div className="ui-fila2">
        <div className="ui-campo">
          <label htmlFor="an-year">Año nuevo</label>
          <input id="an-year" type="number" min="2000" max="2100" value={year}
            onChange={e => setYear(e.target.value)} />
        </div>
        <div className="ui-campo">
          <label htmlFor="an-desde">Copiar desde</label>
          <select id="an-desde" value={desde} onChange={e => setDesde(e.target.value)}>
            {conCursos.map(a => <option key={a.year} value={a.year}>{a.year} ({a.cursos} cursos)</option>)}
            <option value="">No copiar (año vacío)</option>
          </select>
        </div>
      </div>
      {!sinCopia && (
        <fieldset className="an-opciones">
          <legend>Qué copiar desde {desde}</legend>
          {opciones.map(([k, et, ayuda, bloqueado]) => (
            <label key={k} className={`ui-check${bloqueado ? ' deshabilitado' : ''}`}>
              <input type="checkbox" checked={!!copiar[k] && !bloqueado} disabled={bloqueado}
                onChange={() => marcar(k)} />
              <span>{et}<small>{bloqueado ? 'Requiere copiar los cursos.' : ayuda}</small></span>
            </label>
          ))}
        </fieldset>
      )}
      {sinCopia && (
        <div className="ui-aviso ui-aviso-info">
          <Icono nombre="calendario" tam={16} />
          <span>Se crea el año sin cursos ni alumnos. Podrás crear los cursos después desde la sección Cursos.</span>
        </div>
      )}
    </Modal>
  );
}

// ── Cerrar / reabrir ──────────────────────────────────────────────────
function ModalEstado({ anio, onClose, onListo }) {
  const cerrar = anio.estado !== 'cerrado';
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const confirmar = async () => {
    setEnviando(true);
    setError(null);
    try {
      await axios.post(`/api/anios/${anio.year}/${cerrar ? 'cerrar' : 'reabrir'}`);
      onListo(cerrar ? `El año ${anio.year} quedó cerrado` : `El año ${anio.year} quedó abierto`);
    } catch (e) {
      setError(msgError(e, cerrar ? 'No se pudo cerrar el año.' : 'No se pudo reabrir el año.'));
      setEnviando(false);
    }
  };

  return (
    <Modal titulo={cerrar ? `¿Cerrar el año ${anio.year}?` : `¿Reabrir el año ${anio.year}?`}
      ancho={500} onClose={onClose} ocupado={enviando}
      pie={<>
        <button type="button" className="ui-btn" onClick={onClose} disabled={enviando}>Cancelar</button>
        <button type="button" className={`ui-btn ${cerrar ? 'ui-btn-peligro' : 'ui-btn-pri'}`}
          onClick={confirmar} disabled={enviando}>
          {enviando ? 'Guardando…' : cerrar ? `Cerrar ${anio.year}` : `Reabrir ${anio.year}`}
        </button>
      </>}>
      {error && <div className="ui-aviso ui-aviso-peligro">{error}</div>}
      {cerrar ? (
        <>
          <p className="an-texto">El año <b>{anio.year}</b> quedará en <b>solo lectura</b>. Desde ese momento nadie podrá:</p>
          <ul className="an-lista">
            <li>poner, cambiar ni borrar notas;</li>
            <li>registrar o editar anotaciones;</li>
            <li>matricular, retirar o cambiar alumnos de curso;</li>
            <li>agregar o quitar asignaturas de los cursos de {anio.year}.</li>
          </ul>
          <p className="an-texto">Todo lo registrado se conserva y se puede seguir consultando y descargando.
            La ficha personal de cada alumno sí se puede seguir actualizando.</p>
          {anio.por_confirmar > 0 && (
            <div className="ui-aviso ui-aviso-alerta">
              <Icono nombre="candado" tam={16} />
              <span>Hay {anio.por_confirmar} {anio.por_confirmar === 1 ? 'alumno' : 'alumnos'} por confirmar en {anio.year}.
                Si cierras ahora, no se podrán confirmar hasta reabrir el año.</span>
            </div>
          )}
          <p className="an-nota">Un administrador puede reabrirlo cuando lo necesite. Queda registrado quién lo cerró y cuándo.</p>
        </>
      ) : (
        <>
          <p className="an-texto">Se vuelven a permitir cambios en notas, anotaciones, matrículas y asignaturas
            de los cursos de <b>{anio.year}</b>.</p>
          <p className="an-nota">Queda registrado quién lo reabrió y cuándo. Recuerda volver a cerrarlo cuando termines.</p>
        </>
      )}
    </Modal>
  );
}

export default function AniosPage() {
  const { user, anio: anioActual, setAnio, recargarAnios } = useAuth();
  const esAdmin = user?.role === 'admin';
  const puedeCrear = ['admin', 'directivo'].includes(user?.role);

  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [crear, setCrear] = useState(false);
  const [cambio, setCambio] = useState(null);
  const [toast, setToast] = useState(null);

  const aviso = (msg, tipo = 'ok') => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3400);
  };

  const cargar = useCallback(async () => {
    try {
      const r = await axios.get('/api/anios');
      setDatos({ actual: r.data?.actual, anios: Array.isArray(r.data?.anios) ? r.data.anios : [] });
      setError(null);
    } catch (e) {
      setError(msgError(e, 'No se pudieron cargar los años académicos.'));
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const refrescarTodo = async () => {
    await cargar();
    if (recargarAnios) recargarAnios();
  };

  if (error && !datos) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40, maxWidth: 560, margin: '20px auto' }}>
        <p style={{ fontWeight: 650, color: '#475569', margin: '0 0 12px' }}>{error}</p>
        <button type="button" className="ui-btn ui-btn-pri" onClick={cargar}>Reintentar</button>
      </div>
    );
  }
  if (!datos) return <div className="loading-container"><div className="spinner" /></div>;

  const anios = [...datos.anios].sort((a, b) => b.year - a.year);
  const siguiente = anios.reduce((m, a) => Math.max(m, a.year), new Date().getFullYear() - 1) + 1;

  return (
    <div className="an">
      <div className="an-cab">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>Años académicos</h2>
          <p>Cada año agrupa sus cursos, matrículas, notas y anotaciones. Al cerrar un año queda en solo lectura.</p>
        </div>
        {puedeCrear && (
          <button type="button" className="ui-btn ui-btn-pri" onClick={() => setCrear(true)}>
            <Icono nombre="mas" tam={15} /> Crear año {siguiente}
          </button>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="an-tabla">
            <thead>
              <tr>
                <th>Año</th><th>Estado</th><th className="num">Cursos</th>
                <th className="num">Alumnos activos</th><th className="num">Por confirmar</th>
                <th>Registro</th><th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {anios.length === 0 && (
                <tr><td colSpan={7} className="ui-vacio">Todavía no hay años registrados.</td></tr>
              )}
              {anios.map(a => (
                <tr key={a.year} className={a.year === anioActual ? 'en-uso' : ''}>
                  <td>
                    <b className="an-year">{a.year}</b>
                    {a.year === anioActual && <span className="an-uso">En uso</span>}
                  </td>
                  <td><ChipEstado estado={a.estado} /></td>
                  <td className="num">{n(a.cursos)}</td>
                  <td className="num">{n(a.alumnos_activos)}</td>
                  <td className="num">
                    {a.por_confirmar > 0
                      ? <span className="ui-chip" style={{ color: '#b45309', background: '#fef3c7' }}>{n(a.por_confirmar)}</span>
                      : <span style={{ color: '#cbd5e1' }}>0</span>}
                  </td>
                  <td className="an-reg">
                    {a.estado === 'cerrado' && a.closed_at && (
                      <span>Cerrado {fmtFechaHora(a.closed_at)}{a.closed_by_name ? ` por ${a.closed_by_name}` : ''}</span>
                    )}
                    {a.estado !== 'cerrado' && a.reopened_at && <span>Reabierto {fmtFechaHora(a.reopened_at)}</span>}
                    {a.created_from_year && <span>Creado a partir de {a.created_from_year}</span>}
                    {!a.closed_at && !a.reopened_at && !a.created_from_year && <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>
                  <td className="an-acc">
                    {a.year !== anioActual && setAnio && (
                      <button type="button" className="ui-btn ui-btn-sm" onClick={() => { setAnio(a.year); aviso(`Ahora trabajas en ${a.year}`); }}>
                        Trabajar en {a.year}
                      </button>
                    )}
                    {esAdmin && (
                      <button type="button" className={`ui-btn ui-btn-sm ${a.estado === 'cerrado' ? '' : 'ui-btn-gris'}`}
                        onClick={() => setCambio(a)}>
                        <Icono nombre={a.estado === 'cerrado' ? 'deshacer' : 'candado'} tam={12} />
                        {a.estado === 'cerrado' ? 'Reabrir' : 'Cerrar año'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {!esAdmin && (
        <p className="an-nota" style={{ marginTop: 10 }}>Solo un administrador puede cerrar o reabrir un año.</p>
      )}

      {crear && <ModalCrear anios={anios} onClose={() => setCrear(false)} onCreado={refrescarTodo} />}
      {cambio && (
        <ModalEstado anio={cambio} onClose={() => setCambio(null)}
          onListo={async (msg) => { setCambio(null); await refrescarTodo(); aviso(msg); }} />
      )}

      {toast && (
        <div className="an-toast" style={{ background: toast.tipo === 'err' ? '#dc2626' : '#16a34a' }}>{toast.msg}</div>
      )}
    </div>
  );
}
