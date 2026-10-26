import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import descargarArchivo from '../CargaAcademica/descargar';
import { msgError } from '../../components/UI/Modal';
import { Icono } from '../../components/Layout/iconos';
import '../../components/UI/ui.css';
import './Personalidad.css';

const SEMESTRES = [1, 2];
const NOMBRE_SEM = { 1: '1er semestre', 2: '2do semestre' };
// Primera opción de la escala: se pre-marca para llenar más rápido
const PRIMERA = 'S';

function useAviso() {
  const [toast, setToast] = useState(null);
  const aviso = useCallback((msg, tipo = 'ok') => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3500);
  }, []);
  const nodo = toast && (
    <div className="ip-toast" style={{ background: toast.tipo === 'err' ? '#b91c1c' : '#15803d' }}>
      {toast.msg}
    </div>
  );
  return [aviso, nodo];
}

function Avance({ n, total }) {
  if (!total) return <span className="ui-chip ip-chip-gris">—</span>;
  if (n >= total) return <span className="ui-chip ip-chip-ok"><Icono nombre="check" tam={12} /> Completo</span>;
  if (!n) return <span className="ui-chip ip-chip-gris">Sin llenar</span>;
  return <span className="ui-chip ip-chip-amb">{n} de {total}</span>;
}

function Barra({ n, total }) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return (
    <div className="ip-barra" title={`${n} de ${total} alumnos con el informe completo`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

const nombreCompleto = (a) => `${a.apellido}, ${a.nombre}`;
const sinTildes = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ── 1. Cursos ─────────────────────────────────────────────────────────────
export default function PersonalidadCursosPage() {
  const { user, anio } = useAuth();
  const year = anio || new Date().getFullYear();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const gestiona = ['admin', 'directivo'].includes(user?.role);

  useEffect(() => {
    setDatos(null);
    axios.get(`/api/personalidad/cursos?year=${year}`)
      .then(r => setDatos(r.data))
      .catch(e => setError(msgError(e, 'No se pudieron cargar los cursos')));
  }, [year]);

  return (
    <div className="ip">
      <div className="ip-cab">
        <div>
          <h2>Informe de personalidad</h2>
          <p>Elige un curso para llenar el informe de cada alumno. Año {year}.</p>
        </div>
        {gestiona && (
          <Link to="/personalidad/pauta" className="ui-btn">
            <Icono nombre="ajustes" tam={15} /> Pauta de criterios
          </Link>
        )}
      </div>

      {error && <div className="ui-aviso ui-aviso-peligro">{error}</div>}
      {!datos && !error && <p className="ui-vacio">Cargando…</p>}
      {datos && !datos.cursos.length && (
        <p className="ui-vacio">
          {user?.role === 'profesor'
            ? `No tienes cursos a cargo en ${year}.`
            : `No hay cursos creados para ${year}.`}
        </p>
      )}

      <div className="ip-cursos">
        {datos?.cursos.map(c => (
          <Link key={c.id} to={`/personalidad/cursos/${c.id}`} className="ip-curso">
            <div className="ip-curso-cab">
              <b>{c.nombre}</b>
              {c.soy_jefe && <span className="ui-chip ip-chip-pri">Profesor(a) jefe</span>}
            </div>
            <p className="ip-curso-jefe">{c.profesor_jefe || 'Sin profesor(a) jefe'} · {c.alumnos} alumnos</p>
            {SEMESTRES.map(s => (
              <div key={s} className="ip-curso-sem">
                <span>{NOMBRE_SEM[s]}</span>
                <Barra n={c.completos[s]} total={c.alumnos} />
                <small>{c.completos[s]}/{c.alumnos}</small>
              </div>
            ))}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── 2. Alumnos del curso ──────────────────────────────────────────────────
export function PersonalidadCursoPage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [buscar, setBuscar] = useState('');
  const [verRetirados, setVerRetirados] = useState(true);
  const [bajando, setBajando] = useState(false);
  const [aviso, toast] = useAviso();

  useEffect(() => {
    axios.get(`/api/personalidad/cursos/${courseId}`)
      .then(r => setDatos(r.data))
      .catch(e => setError(msgError(e, 'No se pudo cargar el curso')));
  }, [courseId]);

  const alumnos = useMemo(() => {
    if (!datos) return [];
    const q = sinTildes(buscar.trim());
    return datos.alumnos.filter(a =>
      (verRetirados || a.estado === 'activo') &&
      (!q || sinTildes(`${a.nombre} ${a.apellido} ${a.rut || ''}`).includes(q)));
  }, [datos, buscar, verRetirados]);

  const bajarCurso = async () => {
    setBajando(true);
    try {
      await descargarArchivo(`/api/personalidad/cursos/${courseId}/informe.pdf`,
        `informe_personalidad_${datos.curso.nombre}.pdf`);
    } catch (e) { aviso(e.message, 'err'); }
    setBajando(false);
  };

  if (error) return <div className="ip"><div className="ui-aviso ui-aviso-peligro">{error}</div></div>;
  if (!datos) return <div className="ip"><p className="ui-vacio">Cargando…</p></div>;

  return (
    <div className="ip">
      <Link to="/personalidad" className="ip-volver">← Cursos</Link>
      <div className="ip-cab">
        <div>
          <h2>{datos.curso.nombre}</h2>
          <p>Profesor(a) jefe: {datos.curso.profesor_jefe || 'sin asignar'} · Año {datos.curso.year}</p>
        </div>
        <button type="button" className="ui-btn" onClick={bajarCurso} disabled={bajando}>
          <Icono nombre="bajar" tam={15} /> {bajando ? 'Generando…' : 'PDF del curso'}
        </button>
      </div>

      <div className="ip-filtros">
        <input type="search" placeholder="Buscar alumno" value={buscar}
          onChange={e => setBuscar(e.target.value)} />
        <label className="ip-toggle">
          <input type="checkbox" checked={verRetirados} onChange={e => setVerRetirados(e.target.checked)} />
          Mostrar retirados y cambios de curso
        </label>
      </div>

      <div className="ip-caja">
        <table className="ip-tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th className="cen">1er semestre</th>
              <th className="cen">2do semestre</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {alumnos.map(a => {
              const ir = () => navigate(`/personalidad/cursos/${courseId}/alumnos/${a.id}`);
              return (
                <tr key={a.id} onClick={ir} className="clic">
                  <td className={a.estado !== 'activo' ? 'ip-retirado' : ''}>
                    {nombreCompleto(a)}
                    {a.estado !== 'activo' && <small> · {a.estado.replace('_', ' ')}</small>}
                  </td>
                  <td className="cen"><Avance n={a.avance['1']} total={datos.criterios} /></td>
                  <td className="cen"><Avance n={a.avance['2']} total={datos.criterios} /></td>
                  <td className="der">
                    <button type="button" className="ui-btn ui-btn-sm"
                      onClick={e => { e.stopPropagation(); ir(); }}>Abrir</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!alumnos.length && <p className="ui-vacio">No hay alumnos que mostrar.</p>}
        <p className="ip-pie">Mostrando {alumnos.length} de {datos.alumnos.length} alumnos</p>
      </div>
      {toast}
    </div>
  );
}

// ── 3. Informe del alumno ─────────────────────────────────────────────────
export function PersonalidadAlumnoPage() {
  const { courseId, studentId } = useParams();
  const navigate = useNavigate();
  const [datos, setDatos] = useState(null);
  const [lista, setLista] = useState([]);
  const [error, setError] = useState('');
  const [sem, setSem] = useState(null);
  const [valores, setValores] = useState({});
  const [obs, setObs] = useState('');
  const [sucio, setSucio] = useState(false);
  const [premarcado, setPremarcado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, toast] = useAviso();

  const criterios = useMemo(
    () => (datos ? datos.areas.flatMap(a => a.criterios) : []), [datos]);

  // Arma el formulario del semestre: lo guardado y, lo que falte, pre-marcado
  const armar = useCallback((d, s) => {
    const guardado = d.respuestas[String(s)] || {};
    const crit = d.areas.flatMap(a => a.criterios);
    const v = {};
    let faltan = 0;
    crit.forEach(c => {
      v[c.id] = guardado[String(c.id)] || PRIMERA;
      if (!guardado[String(c.id)]) faltan += 1;
    });
    setValores(v);
    setObs(d.observaciones[String(s)] || '');
    setPremarcado(faltan > 0);
    setSucio(faltan > 0);
  }, []);

  useEffect(() => {
    setDatos(null);
    setError('');
    axios.get(`/api/personalidad/cursos/${courseId}/alumnos/${studentId}`)
      .then(r => {
        const d = r.data;
        const total = d.areas.reduce((n, a) => n + a.criterios.length, 0);
        const lleno = s => Object.keys(d.respuestas[String(s)] || {}).length >= total;
        const s = lleno(1) ? 2 : 1;
        setDatos(d);
        setSem(s);
        armar(d, s);
      })
      .catch(e => setError(msgError(e, 'No se pudo cargar el informe')));
  }, [courseId, studentId, armar]);

  useEffect(() => {
    axios.get(`/api/personalidad/cursos/${courseId}`)
      .then(r => setLista(r.data.alumnos))
      .catch(() => {});
  }, [courseId]);

  // Avisa antes de cerrar la pestaña con cambios sin guardar
  useEffect(() => {
    if (!sucio) return undefined;
    const fn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', fn);
    return () => window.removeEventListener('beforeunload', fn);
  }, [sucio]);

  const confirmarSalida = () =>
    !sucio || window.confirm('Hay respuestas sin guardar. ¿Salir de todas formas?');

  const cambiarSem = (s) => {
    if (s === sem || !confirmarSalida()) return;
    setSem(s);
    armar(datos, s);
  };

  const marcar = (cid, v) => { setValores(p => ({ ...p, [cid]: v })); setSucio(true); };
  const marcarArea = (area, v) => {
    setValores(p => {
      const n = { ...p };
      area.criterios.forEach(c => { n[c.id] = v; });
      return n;
    });
    setSucio(true);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await axios.put(`/api/personalidad/cursos/${courseId}/alumnos/${studentId}`,
        { semestre: sem, respuestas: valores, observacion: obs });
      setDatos(d => ({ ...d, respuestas: r.data.respuestas, observaciones: r.data.observaciones }));
      setSucio(false);
      setPremarcado(false);
      setLista(l => l.map(a => (String(a.id) === String(studentId)
        ? { ...a, avance: { ...a.avance, [sem]: Object.keys(r.data.respuestas[String(sem)]).length } }
        : a)));
      aviso(`Informe del ${NOMBRE_SEM[sem]} guardado`);
      setGuardando(false);
      return true;
    } catch (e) {
      aviso(msgError(e, 'No se pudo guardar el informe'), 'err');
      setGuardando(false);
      return false;
    }
  };

  const bajarPdf = async () => {
    if (sucio && !window.confirm('El PDF sale con lo guardado. Hay cambios sin guardar: ¿descargar igual?')) return;
    try {
      await descargarArchivo(
        `/api/personalidad/cursos/${courseId}/alumnos/${studentId}/informe.pdf`,
        `informe_personalidad_${datos.alumno.apellido}.pdf`);
    } catch (e) { aviso(e.message, 'err'); }
  };

  const activos = lista.filter(a => a.estado === 'activo' || String(a.id) === String(studentId));
  const pos = activos.findIndex(a => String(a.id) === String(studentId));
  const anterior = pos > 0 ? activos[pos - 1] : null;
  const siguiente = pos >= 0 && pos < activos.length - 1 ? activos[pos + 1] : null;
  const irA = (a) => {
    if (a && confirmarSalida()) navigate(`/personalidad/cursos/${courseId}/alumnos/${a.id}`);
  };

  if (error) {
    return (
      <div className="ip">
        <Link to={`/personalidad/cursos/${courseId}`} className="ip-volver">← Volver al curso</Link>
        <div className="ui-aviso ui-aviso-peligro">{error}</div>
      </div>
    );
  }
  if (!datos) return <div className="ip"><p className="ui-vacio">Cargando…</p></div>;

  const escala = datos.escala;

  return (
    <div className="ip ip-form">
      <Link to={`/personalidad/cursos/${courseId}`} className="ip-volver"
        onClick={e => { if (!confirmarSalida()) e.preventDefault(); }}>← {datos.curso.nombre}</Link>

      <div className="ip-cab">
        <div>
          <h2 className={datos.alumno.estado !== 'activo' ? 'ip-retirado' : ''}>
            {datos.alumno.nombre} {datos.alumno.apellido}
          </h2>
          <p>{datos.alumno.rut || 'Sin RUT'} · {datos.curso.nombre} · Año {datos.curso.year}</p>
        </div>
        <div className="ip-nav">
          <button type="button" className="ui-btn ui-btn-icono" disabled={!anterior}
            onClick={() => irA(anterior)} title={anterior ? nombreCompleto(anterior) : ''}
            aria-label="Alumno anterior">‹</button>
          <span>{pos >= 0 ? `${pos + 1} de ${activos.length}` : ''}</span>
          <button type="button" className="ui-btn ui-btn-icono" disabled={!siguiente}
            onClick={() => irA(siguiente)} title={siguiente ? nombreCompleto(siguiente) : ''}
            aria-label="Alumno siguiente">›</button>
        </div>
      </div>

      <div className="ip-sems" role="tablist">
        {SEMESTRES.map(s => {
          const n = Object.keys(datos.respuestas[String(s)] || {}).length;
          return (
            <button key={s} type="button" role="tab" aria-selected={sem === s}
              className={sem === s ? 'on' : ''} onClick={() => cambiarSem(s)}>
              {NOMBRE_SEM[s]}
              <Avance n={n} total={criterios.length} />
            </button>
          );
        })}
      </div>

      {premarcado && sucio && (
        <div className="ip-banner">
          <b>¡Informe sin guardar!</b>
          <p>Para llenarlo más rápido, la primera opción viene marcada en todos los criterios
            que faltaban, pero las respuestas no quedan registradas hasta que presiones «Guardar».</p>
        </div>
      )}

      <div className="ip-escala">
        {escala.map(e => <span key={e.valor}><b>{e.valor}</b>: {e.nombre}</span>)}
      </div>

      <div className="ip-caja">
        {datos.areas.map(area => (
          <table key={area.id} className="ip-pauta">
            <thead>
              <tr>
                <th>{area.nombre}</th>
                {escala.map(e => (
                  <th key={e.valor} className="op">
                    <button type="button" title={`Marcar toda el área con «${e.nombre}»`}
                      onClick={() => marcarArea(area, e.valor)}>{e.valor}</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {area.criterios.map(c => (
                <tr key={c.id}>
                  <td>{c.numero}. {c.texto}</td>
                  {escala.map(e => {
                    const on = valores[c.id] === e.valor;
                    return (
                      <td key={e.valor} className="op">
                        <button type="button" className={`ip-radio${on ? ' on' : ''}`}
                          role="radio" aria-checked={on}
                          aria-label={`${c.numero}: ${e.nombre}`} title={e.nombre}
                          onClick={() => marcar(c.id, e.valor)}>
                          {on && <Icono nombre="check" tam={12} />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>

      <div className="ui-campo ip-obs">
        <label htmlFor="ip-obs">Observaciones del {NOMBRE_SEM[sem]}</label>
        <textarea id="ip-obs" value={obs} rows={3} placeholder="Sin observaciones"
          onChange={e => { setObs(e.target.value); setSucio(true); }} />
      </div>

      <div className="ip-acciones">
        <button type="button" className="ui-btn" onClick={bajarPdf}>
          <Icono nombre="bajar" tam={15} /> Descargar PDF
        </button>
        <button type="button" className="ui-btn ui-btn-pri" onClick={guardar} disabled={guardando}>
          <Icono nombre="check" tam={15} /> {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        {siguiente && (
          <button type="button" className="ui-btn ui-btn-pri" disabled={guardando}
            onClick={async () => { if (await guardar()) navigate(`/personalidad/cursos/${courseId}/alumnos/${siguiente.id}`); }}>
            Guardar y seguir ›
          </button>
        )}
      </div>
      {toast}
    </div>
  );
}
