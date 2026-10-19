import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import descargarArchivo from '../CargaAcademica/descargar';
import Modal, { hoyISO, fmtFecha, msgError } from '../../components/UI/Modal';
import EstadoChip from '../../components/UI/EstadoChip';
import HistorialTimeline from '../../components/UI/HistorialTimeline';
import { Icono } from '../../components/Layout/iconos';
import '../../components/UI/ui.css';
import './MatriculaPage.css';

// Estados de cada fila de la planilla de importación
const ESTADOS = {
  nuevo:        { et: 'Nuevo',            col: '#15803d', bg: '#dcfce7', aplica: true },
  rematricula:  { et: 'Se rematricula',   col: '#1d4ed8', bg: '#dbeafe', aplica: true },
  cambio_curso: { et: 'Cambia de curso',  col: '#b45309', bg: '#fef3c7', aplica: true },
  sin_cambio:   { et: 'Ya está en el curso', col: '#64748b', bg: '#f1f5f9', aplica: false },
  error:        { et: 'No se puede cargar', col: '#b91c1c', bg: '#fee2e2', aplica: false },
};

const VIGENTES = ['activo', 'por_confirmar'];
const ORDEN_ESTADO = { activo: 0, por_confirmar: 0, trasladado: 1, retirado: 1, no_continua: 1, egresado: 1 };

const MOTIVOS_RETIRO = ['Cambio de colegio', 'Cambio de domicilio', 'Cambio de ciudad o país',
  'Motivos económicos', 'Motivos de salud', 'Decisión de la familia'];

const inp = {
  width: '100%', padding: '8px 11px', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit',
};

const nombreDe = (a) => `${a.nombre} ${a.apellido}`.trim();

// ── Menú "⋯" de cada fila ───────────────────────────────────────────
// Posición fija calculada desde el botón: así no lo recorta el scroll horizontal de la tabla.
function MenuFila({ children, etiqueta }) {
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const abrir = () => {
    if (pos) return setPos(null);
    const r = btnRef.current.getBoundingClientRect();
    const ancho = 220;
    const left = Math.max(8, Math.min(r.right - ancho, window.innerWidth - ancho - 8));
    const abajo = window.innerHeight - r.bottom;
    setPos(abajo < 300 ? { left, bottom: window.innerHeight - r.top + 4 } : { left, top: r.bottom + 4 });
  };

  useEffect(() => {
    if (!pos) return undefined;
    const cerrar = () => setPos(null);
    const fuera = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      cerrar();
    };
    const esc = (e) => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', cerrar);
    window.addEventListener('scroll', cerrar, true);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('resize', cerrar);
      window.removeEventListener('scroll', cerrar, true);
    };
  }, [pos]);

  return (
    <>
      <button ref={btnRef} type="button" className="ui-btn ui-btn-sm ui-btn-icono"
        aria-haspopup="menu" aria-expanded={!!pos} aria-label={etiqueta} title="Más acciones"
        onClick={abrir}>
        <Icono nombre="puntos" tam={16} />
      </button>
      {pos && (
        <div ref={menuRef} className="ui-menu" role="menu" style={{ ...pos, width: 220 }}
          onClick={() => setPos(null)}>
          {children}
        </div>
      )}
    </>
  );
}

// ── Modal de una acción sobre la matrícula ──────────────────────────
function ModalAccion({ accion, curso, cursos, year, onClose, onHecho }) {
  const { tipo, alumno: a } = accion;
  const [fecha, setFecha] = useState(hoyISO());
  const [motivo, setMotivo] = useState('');
  const [destino, setDestino] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const otrosCursos = cursos.filter(c => c.id !== curso?.id);
  const nombre = a ? nombreDe(a) : '';

  const cfg = {
    retirar: {
      titulo: `Retirar a ${nombre}`,
      etFecha: 'Fecha de retiro', motivo: true, etMotivo: 'Motivo del retiro', boton: 'Retirar alumno', peligro: true,
      texto: (
        <>
          <p className="mt-texto">{nombre} dejará de figurar como alumno activo de <b>{curso?.nombre}</b> desde la fecha indicada.</p>
          <ul className="mt-lista">
            <li>No se borra nada: sus notas, anotaciones y ficha se conservan.</li>
            <li>Queda registrado en su historial, con la fecha y el motivo.</li>
            <li>Si fue un error, puedes reincorporarlo después.</li>
          </ul>
        </>
      ),
      enviar: () => axios.delete(`/api/matricula/enrollments/${a.enrollment_id}`, { data: { fecha, motivo: motivo.trim() || null } }),
      ok: `${nombre} quedó retirado`,
    },
    cambiar: {
      titulo: `Cambiar de curso a ${nombre}`,
      etFecha: 'Fecha del cambio', motivo: true, etMotivo: 'Motivo (opcional)', boton: 'Cambiar de curso',
      texto: (
        <p className="mt-texto">Desde la fecha indicada, {nombre} quedará activo en el curso que elijas.
          En <b>{curso?.nombre}</b> quedará como <b>Trasladado</b> y lo registrado allí se conserva.</p>
      ),
      enviar: () => {
        if (!destino) throw new Error('Elige el curso de destino.');
        return axios.post(`/api/matricula/enrollments/${a.enrollment_id}/cambiar-curso`,
          { course_id: Number(destino), fecha, motivo: motivo.trim() || null });
      },
      ok: `${nombre} cambió de curso`,
    },
    reincorporar: {
      titulo: `Reincorporar a ${nombre}`,
      etFecha: 'Fecha de reincorporación', boton: 'Reincorporar',
      texto: (
        <p className="mt-texto">{nombre} vuelve a quedar <b>activo</b> en {curso?.nombre}. El retiro anterior
          sigue anotado en su historial.</p>
      ),
      enviar: () => axios.post(`/api/matricula/enrollments/${a.enrollment_id}/reincorporar`, { fecha }),
      ok: `${nombre} fue reincorporado`,
    },
    confirmar: {
      titulo: `Confirmar matrícula de ${nombre}`,
      etFecha: 'Fecha de matrícula', boton: 'Confirmar matrícula',
      texto: (
        <p className="mt-texto">{nombre} quedará <b>matriculado y activo</b> en {curso?.nombre} para {year}.
          La fecha que indiques será su fecha de matrícula.</p>
      ),
      enviar: () => axios.post(`/api/matricula/enrollments/${a.enrollment_id}/confirmar`, { accion: 'confirmar', fecha }),
      ok: `Matrícula de ${nombre} confirmada`,
    },
    repite: {
      titulo: `${nombre} repite curso`,
      etFecha: 'Fecha de matrícula', boton: 'Confirmar que repite',
      texto: (
        <p className="mt-texto">{nombre} volverá a cursar en {year} el mismo nivel que en {year - 1}
          {a?.promovido_desde ? <> (venía de <b>{a.promovido_desde}</b>)</> : null}. Se moverá al curso
          equivalente de {year} y quedará activo allí; deja de aparecer en {curso?.nombre}.</p>
      ),
      enviar: () => axios.post(`/api/matricula/enrollments/${a.enrollment_id}/confirmar`, { accion: 'repite', fecha }),
      ok: `${nombre} quedó matriculado repitiendo nivel`,
    },
    no_continua: {
      titulo: `${nombre} no continúa`,
      etFecha: 'Fecha', motivo: true, etMotivo: 'Motivo', boton: 'Marcar que no continúa', peligro: true,
      texto: (
        <p className="mt-texto">{nombre} <b>no quedará matriculado</b> en {year}. Su información de años anteriores
          se conserva y queda registrado en su historial. Si cambia de idea, puedes reincorporarlo.</p>
      ),
      enviar: () => axios.post(`/api/matricula/enrollments/${a.enrollment_id}/confirmar`,
        { accion: 'no_continua', fecha, motivo: motivo.trim() || null }),
      ok: `${nombre} quedó como "no continúa"`,
    },
    confirmar_todos: {
      titulo: `Confirmar todos en ${curso?.nombre}`,
      etFecha: 'Fecha de matrícula', boton: `Confirmar ${accion.cantidad} ${accion.cantidad === 1 ? 'alumno' : 'alumnos'}`,
      texto: (
        <>
          <p className="mt-texto">Los <b>{accion.cantidad}</b> alumnos por confirmar de {curso?.nombre} quedarán
            matriculados y activos en {year}, con la fecha de matrícula que indiques.</p>
          <div className="ui-aviso ui-aviso-alerta">
            <Icono nombre="alerta" tam={16} />
            <span>Antes, marca uno por uno a quienes <b>repiten</b> o <b>no continúan</b>: esta acción
              confirma a todos los que sigan pendientes.</span>
          </div>
        </>
      ),
      enviar: () => axios.post(`/api/matricula/cursos/${curso.id}/confirmar-todos`, { fecha }),
      ok: (r) => `${r?.data?.confirmados ?? accion.cantidad} matrículas confirmadas`,
    },
  }[tipo];

  const ejecutar = async () => {
    if (!fecha) return setError('Indica la fecha.');
    setEnviando(true);
    setError(null);
    try {
      const r = await cfg.enviar();
      onHecho(typeof cfg.ok === 'function' ? cfg.ok(r) : cfg.ok);
    } catch (e) {
      setError(e.response ? msgError(e) : (e.message || 'No se pudo completar la acción'));
      setEnviando(false);
    }
  };

  return (
    <Modal titulo={cfg.titulo} ancho={500} onClose={onClose} ocupado={enviando}
      pie={<>
        <button type="button" className="ui-btn" onClick={onClose} disabled={enviando}>Cancelar</button>
        <button type="button" className={`ui-btn ${cfg.peligro ? 'ui-btn-peligro' : 'ui-btn-pri'}`}
          onClick={ejecutar} disabled={enviando}>
          {enviando ? 'Guardando…' : cfg.boton}
        </button>
      </>}>
      {error && <div className="ui-aviso ui-aviso-peligro">{error}</div>}
      {cfg.texto}
      {tipo === 'cambiar' && (
        <div className="ui-campo">
          <label htmlFor="mt-destino">Curso de destino</label>
          <select id="mt-destino" value={destino} onChange={e => setDestino(e.target.value)}>
            <option value="">Elige un curso de {year}…</option>
            {otrosCursos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
      )}
      <div className="ui-campo">
        <label htmlFor="mt-fecha">{cfg.etFecha}</label>
        <input id="mt-fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
      </div>
      {cfg.motivo && (
        <div className="ui-campo">
          <label htmlFor="mt-motivo">{cfg.etMotivo}</label>
          <input id="mt-motivo" list="mt-motivos" value={motivo} maxLength={300}
            placeholder="Ej: cambio de colegio" onChange={e => setMotivo(e.target.value)} />
          <datalist id="mt-motivos">
            {MOTIVOS_RETIRO.map(m => <option key={m} value={m} />)}
          </datalist>
        </div>
      )}
    </Modal>
  );
}

export default function MatriculaPage() {
  const { school, user, anio: anioCtx, anioCerrado } = useAuth();
  const primary = school?.primary_color || '#3b4fd8';
  const year = anioCtx || new Date().getFullYear();
  const puedeEditar = ['admin', 'directivo'].includes(user?.role);

  const [cursos, setCursos] = useState([]);
  const [sel, setSel] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [toast, setToast] = useState(null);
  const [filtro, setFiltro] = useState('todos');

  const [nuevo, setNuevo] = useState(null);
  const [accion, setAccion] = useState(null);       // { tipo, alumno }
  const [historial, setHistorial] = useState(null); // alumno
  const [previa, setPrevia] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [omitidas, setOmitidas] = useState({});   // filas desmarcadas a mano
  const archivoRef = useRef(null);
  const toastTimer = useRef(null);

  const aviso = (msg, tipo = 'ok') => {
    setToast({ msg, tipo });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), tipo === 'err' ? 5000 : 3400);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const traerCursos = useCallback(async (reiniciar = false) => {
    try {
      const r = await axios.get(`/api/matricula/cursos?year=${year}`);
      const lista = Array.isArray(r.data) ? r.data : [];
      setCursos(lista);
      setSel(s => {
        if (!reiniciar && s && lista.some(c => c.id === s)) return s;
        return lista[0]?.id ?? null;
      });
    } catch { setCursos([]); setSel(null); }
    setCargando(false);
  }, [year]);

  // Al cambiar el año en la barra lateral se vuelve a empezar
  useEffect(() => {
    setCargando(true);
    setDetalle(null);
    traerCursos(true);
  }, [traerCursos]);

  // Solo se aplica la respuesta de la última consulta: si el usuario cambia de curso o
  // se refresca tras una acción, una respuesta anterior que llegue tarde no pisa la nueva.
  const ultimaConsulta = useRef(0);
  const traerDetalle = useCallback(async (id) => {
    const n = ++ultimaConsulta.current;
    if (!id) return setDetalle(null);
    try {
      const r = await axios.get(`/api/matricula/cursos/${id}/alumnos`, { params: { _: Date.now() } });
      if (n === ultimaConsulta.current) setDetalle(r.data);
    } catch { if (n === ultimaConsulta.current) setDetalle(null); }
  }, []);

  useEffect(() => { traerDetalle(sel); }, [sel, traerDetalle]);

  const refrescar = async () => {
    await traerCursos();
    await traerDetalle(sel);
  };

  const cerrado = !!anioCerrado || !!detalle?.curso?.cerrado;
  const soloLectura = cerrado || !puedeEditar;

  // ── Alta manual ───────────────────────────────────────────────────
  const guardarAlumno = async () => {
    if (!nuevo.nombre.trim() || !nuevo.apellido.trim()) {
      return aviso('El nombre y el apellido son obligatorios', 'err');
    }
    try {
      const r = await axios.post(`/api/matricula/cursos/${sel}/alumnos`, nuevo);
      setNuevo(null);
      await refrescar();
      aviso(r.data.movido_de
        ? `Matriculado. Venía de ${r.data.movido_de}.`
        : r.data.creado ? 'Alumno creado y matriculado' : 'Alumno matriculado');
    } catch (e) {
      aviso(msgError(e, 'No se pudo matricular'), 'err');
    }
  };

  const terminarAccion = async (msg) => {
    setAccion(null);
    await refrescar();
    aviso(msg);
  };

  const bajarFicha = async (a) => {
    const curso = (detalle?.curso?.nombre || '').replace(/[^\w]+/g, '');
    try {
      await descargarArchivo(`/api/matricula/alumnos/${a.id}/ficha.pdf?year=${year}`,
        `ficha_matricula_${curso}_${(a.apellido || 'alumno').split(' ')[0]}.pdf`);
    } catch (e) { aviso(e.message || 'No se pudo descargar la ficha', 'err'); }
  };

  // ── Importación ───────────────────────────────────────────────────
  const subirPlanilla = async (archivo) => {
    if (!archivo) return;
    setSubiendo(true);
    const fd = new FormData();
    fd.append('archivo', archivo);
    try {
      const r = await axios.post(
        `/api/matricula/importar/previsualizar?year=${year}`, fd,
        { headers: { 'Content-Type': 'multipart/form-data' } });
      setPrevia(r.data);
      setOmitidas({});
    } catch (e) {
      aviso(msgError(e, 'No se pudo leer la planilla'), 'err');
    }
    setSubiendo(false);
    if (archivoRef.current) archivoRef.current.value = '';
  };

  const aplicar = async () => {
    const items = previa.items.filter(
      it => ESTADOS[it.estado]?.aplica && !omitidas[it.fila]);
    if (!items.length) return aviso('No hay filas seleccionadas', 'err');
    if (!window.confirm(`¿Aplicar ${items.length} ${items.length === 1 ? 'fila' : 'filas'}?`)) return;

    setAplicando(true);
    try {
      const r = await axios.post(`/api/matricula/importar/aplicar?year=${year}`, { items });
      const d = r.data;
      setPrevia(null);
      await refrescar();
      aviso(`Listo: ${d.matriculados} matriculados, ${d.creados} alumnos nuevos` +
            (d.movidos ? `, ${d.movidos} cambiaron de curso` : ''));
    } catch (e) {
      aviso(msgError(e, 'No se pudo aplicar'), 'err');
    }
    setAplicando(false);
  };

  const bajarPlantilla = async () => {
    try {
      await descargarArchivo(`/api/matricula/plantilla.xlsx?year=${year}`,
        `Plantilla_matricula_${year}.xlsx`);
    } catch (e) { aviso(e.message || 'No se pudo descargar', 'err'); }
  };

  if (cargando) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <div className="spinner" />
    </div>
  );

  const totalAlumnos = cursos.reduce((n, c) => n + (c.alumnos || 0), 0);
  const totalPorConfirmar = cursos.reduce((n, c) => n + (c.por_confirmar || 0), 0);
  const aAplicar = previa
    ? previa.items.filter(it => ESTADOS[it.estado]?.aplica && !omitidas[it.fila]).length
    : 0;

  const alumnos = (detalle?.alumnos || [])
    .map(a => ({ ...a, estado: a.estado || 'activo' }))
    .sort((x, y) => (ORDEN_ESTADO[x.estado] ?? 1) - (ORDEN_ESTADO[y.estado] ?? 1)
      || String(x.apellido || '').localeCompare(String(y.apellido || ''), 'es'));
  const cuenta = (pred) => alumnos.filter(pred).length;
  const nActivos = cuenta(a => a.estado === 'activo');
  const nPorConfirmar = cuenta(a => a.estado === 'por_confirmar');
  const nInactivos = alumnos.length - nActivos - nPorConfirmar;
  const visibles = alumnos.filter(a => filtro === 'todos'
    || (filtro === 'vigentes' ? VIGENTES.includes(a.estado) : !VIGENTES.includes(a.estado)));

  return (
    <div className="mt">

      {/* Encabezado */}
      <div className="mt-cab">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="mt-h1">
            Matrícula {year}
            {cerrado && (
              <span className="ui-chip" style={{ color: '#92400e', background: '#fef3c7', marginLeft: 10, verticalAlign: 'middle' }}>
                <Icono nombre="candado" tam={11} /> Año cerrado
              </span>
            )}
          </h1>
          <p className="mt-sub">
            {totalAlumnos} {totalAlumnos === 1 ? 'alumno activo' : 'alumnos activos'}
            {' '}en {cursos.length} {cursos.length === 1 ? 'curso' : 'cursos'}
            {totalPorConfirmar > 0 && <> · <b style={{ color: '#b45309' }}>{totalPorConfirmar} por confirmar</b></>}
          </p>
        </div>
        {!soloLectura && (
          <>
            <button onClick={bajarPlantilla} className="ui-btn">
              <Icono nombre="bajar" tam={15} /> Plantilla Excel
            </button>
            <label className="ui-btn ui-btn-pri" style={{ background: primary,
              cursor: subiendo ? 'default' : 'pointer', opacity: subiendo ? .6 : 1 }}>
              <Icono nombre="subir" tam={15} /> {subiendo ? 'Leyendo…' : 'Cargar planilla'}
              <input ref={archivoRef} type="file" accept=".xlsx,.xls,.csv" disabled={subiendo}
                onChange={e => subirPlanilla(e.target.files[0])} style={{ display: 'none' }} />
            </label>
          </>
        )}
      </div>

      {cerrado && (
        <div className="ui-aviso ui-aviso-alerta">
          <Icono nombre="candado" tam={16} />
          <span><b>Año cerrado — solo lectura.</b> Puedes consultar y descargar fichas, pero no matricular,
            retirar ni cambiar alumnos de curso. Un administrador puede reabrir el año desde “Años académicos”.</span>
        </div>
      )}

      {cursos.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 46 }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#475569', margin: '0 0 6px' }}>
            Todavía no hay cursos para {year}
          </p>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
            Crea los cursos del año (o crea el año copiando el anterior desde “Años académicos”)
            antes de matricular alumnos.
          </p>
        </div>
      ) : (
        <div className="mt-grid">

          {/* Cursos */}
          <div className="card mt-cursos">
            <h3 className="mt-cursos-tit">Cursos</h3>
            <div className="mt-cursos-lista">
              {cursos.map(c => (
                <button key={c.id} type="button" onClick={() => setSel(c.id)}
                  className={`mt-curso${sel === c.id ? ' on' : ''}`}
                  style={sel === c.id ? { background: `${primary}0E`, borderLeftColor: primary } : undefined}>
                  <span className="mt-curso-txt">
                    <b>{c.nombre}</b>
                    {c.profesor_jefe && <i>{c.profesor_jefe}</i>}
                  </span>
                  {c.por_confirmar > 0 && (
                    <span className="mt-curso-pc" title={`${c.por_confirmar} por confirmar`}>{c.por_confirmar}</span>
                  )}
                  <span className="mt-curso-n" style={{ color: c.alumnos ? primary : '#cbd5e1' }}
                    title={`${c.alumnos} activos`}>{c.alumnos}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Alumnos del curso */}
          <div className="card mt-panel">
            <div className="mt-panel-cab">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3>{detalle?.curso?.nombre || 'Curso'}</h3>
                <p>
                  {nActivos} {nActivos === 1 ? 'activo' : 'activos'}
                  {nPorConfirmar > 0 && ` · ${nPorConfirmar} por confirmar`}
                  {nInactivos > 0 && ` · ${nInactivos} ${nInactivos === 1 ? 'inactivo' : 'inactivos'}`}
                </p>
              </div>
              {nInactivos > 0 && (
                <select value={filtro} onChange={e => setFiltro(e.target.value)} className="mt-filtro"
                  aria-label="Filtrar por estado">
                  <option value="todos">Todos</option>
                  <option value="vigentes">Activos y por confirmar</option>
                  <option value="inactivos">Retirados y otros</option>
                </select>
              )}
              {!soloLectura && (
                <button className="ui-btn" style={{ padding: '6px 13px', fontSize: 13 }}
                  onClick={() => setNuevo({ nombre: '', apellido: '', rut: '', email: '', fecha: hoyISO() })}>
                  <Icono nombre="mas" tam={14} /> Agregar alumno
                </button>
              )}
            </div>

            {nPorConfirmar > 0 && (
              <div className="mt-banner">
                <Icono nombre="ascenso" tam={16} />
                <span style={{ flex: 1 }}>
                  <b>{nPorConfirmar} {nPorConfirmar === 1 ? 'alumno por confirmar' : 'alumnos por confirmar'}.</b>
                  {' '}Vienen promovidos de {year - 1}. Confirma su matrícula o marca si repite o no continúa.
                </span>
                {!soloLectura && (
                  <button type="button" className="ui-btn ui-btn-sm ui-btn-ok"
                    onClick={() => setAccion({ tipo: 'confirmar_todos', cantidad: nPorConfirmar })}>
                    <Icono nombre="check" tam={13} /> Confirmar todos
                  </button>
                )}
              </div>
            )}

            {!visibles.length ? (
              <p className="ui-vacio" style={{ padding: 36 }}>
                {alumnos.length ? 'No hay alumnos con este filtro.' : 'Este curso no tiene alumnos matriculados.'}
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
              <table className="mt-tabla">
                <thead>
                  <tr>
                    <th>#</th><th>Apellido y nombre</th><th>RUT</th><th>Estado</th>
                    <th>Fecha de matrícula</th><th>Fecha de retiro</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((a, i) => {
                    const vigente = VIGENTES.includes(a.estado);
                    return (
                    <tr key={a.enrollment_id} className={vigente ? '' : 'inactivo'}>
                      <td className="mt-n">{i + 1}</td>
                      <td className="mt-nombre">
                        <Link to={`/students/${a.id}/ficha`} title="Ver ficha del alumno">
                          {a.apellido}, {a.nombre}
                        </Link>
                        {a.promovido_desde && <small>Promovido desde {a.promovido_desde}</small>}
                      </td>
                      <td className="mt-gris" style={{ whiteSpace: 'nowrap' }}>{a.rut || '—'}</td>
                      <td><EstadoChip estado={a.estado} /></td>
                      <td className="mt-gris" style={{ whiteSpace: 'nowrap' }}>{fmtFecha(a.fecha_matricula)}</td>
                      <td className="mt-gris">
                        <span style={{ whiteSpace: 'nowrap' }}>{a.fecha_retiro ? fmtFecha(a.fecha_retiro) : '—'}</span>
                        {a.motivo_retiro && <small className="mt-motivo" title={a.motivo_retiro}>{a.motivo_retiro}</small>}
                      </td>
                      <td className="mt-acc">
                        {a.estado === 'por_confirmar' && !soloLectura && (
                          <>
                            <button type="button" className="ui-btn ui-btn-sm ui-btn-ok"
                              onClick={() => setAccion({ tipo: 'confirmar', alumno: a })}>Confirmar</button>
                            <button type="button" className="ui-btn ui-btn-sm ui-btn-amb"
                              onClick={() => setAccion({ tipo: 'repite', alumno: a })}>Repite</button>
                            <button type="button" className="ui-btn ui-btn-sm ui-btn-gris"
                              onClick={() => setAccion({ tipo: 'no_continua', alumno: a })}>No continúa</button>
                          </>
                        )}
                        <MenuFila etiqueta={`Acciones para ${nombreDe(a)}`}>
                          <Link to={`/students/${a.id}/ficha`} role="menuitem">
                            <Icono nombre="lapiz" tam={15} /> {puedeEditar ? 'Editar ficha' : 'Ver ficha'}
                          </Link>
                          <button type="button" role="menuitem" onClick={() => bajarFicha(a)}>
                            <Icono nombre="bajar" tam={15} /> Descargar ficha (PDF)
                          </button>
                          <button type="button" role="menuitem" onClick={() => setHistorial(a)}>
                            <Icono nombre="historial" tam={15} /> Historial
                          </button>
                          {!soloLectura && a.estado === 'activo' && (
                            <>
                              <hr />
                              <button type="button" role="menuitem"
                                onClick={() => setAccion({ tipo: 'cambiar', alumno: a })}>
                                <Icono nombre="flechas" tam={15} /> Cambiar de curso
                              </button>
                              <button type="button" role="menuitem" className="peligro"
                                onClick={() => setAccion({ tipo: 'retirar', alumno: a })}>
                                <Icono nombre="cruz" tam={15} /> Retirar
                              </button>
                            </>
                          )}
                          {!soloLectura && ['retirado', 'no_continua'].includes(a.estado) && (
                            <>
                              <hr />
                              <button type="button" role="menuitem"
                                onClick={() => setAccion({ tipo: 'reincorporar', alumno: a })}>
                                <Icono nombre="deshacer" tam={15} /> Reincorporar
                              </button>
                            </>
                          )}
                        </MenuFila>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      )}

      {accion && (
        <ModalAccion accion={accion} curso={detalle?.curso} cursos={cursos} year={year}
          onClose={() => setAccion(null)} onHecho={terminarAccion} />
      )}

      {historial && (
        <Modal titulo={`Historial de ${nombreDe(historial)}`} ancho={640}
          subtitulo="Matrículas, retiros, cambios de curso y ediciones de la ficha, del más reciente al más antiguo."
          onClose={() => setHistorial(null)}>
          <HistorialTimeline studentId={historial.id} />
        </Modal>
      )}

      {/* Alta manual */}
      {nuevo && (
        <div style={capa} onClick={() => setNuevo(null)}>
          <div style={{ ...caja, width: 440 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>Agregar alumno</h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
              Se matricula en {detalle?.curso?.nombre}. Si el alumno ya existe en otro
              curso, se mueve a este.
            </p>
            {[['nombre', 'Nombre *', 'María José'],
              ['apellido', 'Apellido *', 'González Rojas'],
              ['rut', 'RUT', '21.345.678-9'],
              ['email', 'Correo (opcional)', '']].map(([k, et, ph]) => (
              <div key={k} style={{ marginBottom: 13 }}>
                <label style={lbl}>{et}</label>
                <input style={inp} placeholder={ph} value={nuevo[k]}
                  autoFocus={k === 'nombre'}
                  onChange={e => setNuevo({ ...nuevo, [k]: e.target.value })} />
              </div>
            ))}
            <div style={{ marginBottom: 13 }}>
              <label style={lbl}>Fecha de matrícula</label>
              <input style={inp} type="date" value={nuevo.fecha}
                onChange={e => setNuevo({ ...nuevo, fecha: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setNuevo(null)} style={btnSec}>Cancelar</button>
              <button onClick={guardarAlumno} style={btnPri(primary)}>Matricular</button>
            </div>
          </div>
        </div>
      )}

      {/* Vista previa de la planilla */}
      {previa && (
        <div style={capa} onClick={() => !aplicando && setPrevia(null)}>
          <div style={{ ...caja, width: 880, maxHeight: '88vh', padding: 0,
            display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}>

            <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0, flex: 1 }}>
                  Revisar antes de cargar
                </h2>
                <button onClick={() => setPrevia(null)} style={{ background: 'none',
                  border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
              </div>
              <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 12px' }}>
                {previa.total} filas leídas. Todavía no se cargó nada.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(previa.resumen).map(([k, n]) => {
                  const e = ESTADOS[k] || ESTADOS.error;
                  return (
                    <span key={k} style={{ fontSize: 12, fontWeight: 700, padding: '3px 11px',
                      borderRadius: 999, background: e.bg, color: e.col }}>
                      {n} {e.et.toLowerCase()}
                    </span>
                  );
                })}
              </div>
            </div>

            <div style={{ overflow: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ position: 'sticky', top: 0 }}>
                  <tr style={{ background: '#f8fafc' }}>
                    {['', 'Fila', 'Alumno', 'Curso', 'Qué va a pasar'].map((h, i) => (
                      <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11,
                        textTransform: 'uppercase', color: '#64748b', fontWeight: 700,
                        borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previa.items.map(it => {
                    const e = ESTADOS[it.estado] || ESTADOS.error;
                    const marcada = e.aplica && !omitidas[it.fila];
                    return (
                      <tr key={it.fila} style={{ borderTop: '1px solid #f1f5f9',
                        opacity: e.aplica ? 1 : .62 }}>
                        <td style={{ padding: '7px 12px', width: 34 }}>
                          <input type="checkbox" checked={marcada} disabled={!e.aplica}
                            onChange={() => setOmitidas(o => ({ ...o, [it.fila]: !o[it.fila] }))} />
                        </td>
                        <td style={{ padding: '7px 12px', color: '#cbd5e1' }}>{it.fila}</td>
                        <td style={{ padding: '7px 12px', fontWeight: 600, color: '#0f172a' }}>
                          {it.nombre} {it.apellido}
                          {it.rut && <span style={{ color: '#94a3b8', fontWeight: 400,
                            marginLeft: 7, fontSize: 12 }}>{it.rut}</span>}
                        </td>
                        <td style={{ padding: '7px 12px', color: '#64748b' }}>
                          {it.curso_nombre || it.curso_texto || '—'}
                        </td>
                        <td style={{ padding: '7px 12px' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px',
                            borderRadius: 999, background: e.bg, color: e.col,
                            marginRight: 8, whiteSpace: 'nowrap' }}>{e.et}</span>
                          <span style={{ color: '#64748b', fontSize: 12.5 }}>{it.detalle}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '14px 22px', borderTop: '1px solid #e2e8f0',
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0, flex: 1, minWidth: 220 }}>
                Las filas con problemas no se pueden cargar; corrígelas en la planilla
                y vuelve a subirla.
              </p>
              <button onClick={() => setPrevia(null)} style={btnSec}>Cancelar</button>
              <button onClick={aplicar} disabled={aplicando || !aAplicar}
                style={{ ...btnPri('#16a34a'), opacity: aplicando || !aAplicar ? .55 : 1 }}>
                {aplicando ? 'Cargando…' : `Cargar ${aAplicar} ${aAplicar === 1 ? 'fila' : 'filas'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div role="status" style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 3000,
          background: toast.tipo === 'err' ? '#dc2626' : '#16a34a', color: '#fff',
          padding: '11px 18px', borderRadius: 10, fontWeight: 600, fontSize: 14,
          maxWidth: 420, boxShadow: '0 8px 24px rgba(0,0,0,.2)' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

const lbl = {
  display: 'block', fontSize: 12, fontWeight: 700, color: '#374151',
  textTransform: 'uppercase', marginBottom: 5, letterSpacing: '.02em',
};
const btnSec = {
  padding: '8px 15px', background: '#fff', border: '1px solid #e2e8f0',
  borderRadius: 9, fontSize: 13.5, fontWeight: 650, cursor: 'pointer',
  color: '#475569', fontFamily: 'inherit',
};
const btnPri = (c) => ({
  display: 'inline-flex', alignItems: 'center', padding: '8px 16px', background: c,
  color: '#fff', border: 'none', borderRadius: 9, fontSize: 13.5, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
});
const capa = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 2000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
};
const caja = {
  background: '#fff', borderRadius: 16, padding: 26, maxWidth: '96vw',
  boxShadow: '0 20px 60px rgba(0,0,0,.3)', boxSizing: 'border-box',
};
