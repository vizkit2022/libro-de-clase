import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import descargarArchivo from '../CargaAcademica/descargar';

const ESTADOS = {
  nuevo:        { et: 'Nuevo',            col: '#15803d', bg: '#dcfce7', aplica: true },
  rematricula:  { et: 'Se rematricula',   col: '#1d4ed8', bg: '#dbeafe', aplica: true },
  cambio_curso: { et: 'Cambia de curso',  col: '#b45309', bg: '#fef3c7', aplica: true },
  sin_cambio:   { et: 'Ya está en el curso', col: '#64748b', bg: '#f1f5f9', aplica: false },
  error:        { et: 'No se puede cargar', col: '#b91c1c', bg: '#fee2e2', aplica: false },
};

const inp = {
  width: '100%', padding: '8px 11px', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit',
};

export default function MatriculaPage() {
  const { school } = useAuth();
  const primary = school?.primary_color || '#3b4fd8';
  const year = new Date().getFullYear();

  const [cursos, setCursos] = useState([]);
  const [sel, setSel] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [toast, setToast] = useState(null);

  const [nuevo, setNuevo] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [omitidas, setOmitidas] = useState({});   // filas desmarcadas a mano
  const archivoRef = useRef(null);

  const aviso = (msg, tipo = 'ok') => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3400);
  };

  const traerCursos = useCallback(async () => {
    try {
      const r = await axios.get(`/api/matricula/cursos?year=${year}`);
      setCursos(r.data);
      setSel(s => s ?? (r.data[0]?.id ?? null));
    } catch { setCursos([]); }
    setCargando(false);
  }, [year]);

  useEffect(() => { traerCursos(); }, [traerCursos]);

  useEffect(() => {
    if (!sel) return setDetalle(null);
    axios.get(`/api/matricula/cursos/${sel}/alumnos`)
      .then(r => setDetalle(r.data))
      .catch(() => setDetalle(null));
  }, [sel]);

  const refrescar = async () => {
    await traerCursos();
    if (sel) {
      const r = await axios.get(`/api/matricula/cursos/${sel}/alumnos`);
      setDetalle(r.data);
    }
  };

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
      aviso(e.response?.data?.error || 'No se pudo matricular', 'err');
    }
  };

  const retirar = async (a) => {
    if (!window.confirm(
      `¿Retirar a ${a.nombre} ${a.apellido} de ${detalle.curso.nombre}?\n\n` +
      `El alumno no se elimina: queda sin curso y podés volver a matricularlo.`)) return;
    await axios.delete(`/api/matricula/enrollments/${a.enrollment_id}`);
    await refrescar();
    aviso('Alumno retirado del curso');
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
      aviso(e.response?.data?.error || 'No se pudo leer la planilla', 'err');
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
      aviso(e.response?.data?.error || 'No se pudo aplicar', 'err');
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

  const totalAlumnos = cursos.reduce((n, c) => n + c.alumnos, 0);
  const aAplicar = previa
    ? previa.items.filter(it => ESTADOS[it.estado]?.aplica && !omitidas[it.fila]).length
    : 0;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
            Matrícula {year}
          </h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '3px 0 0' }}>
            {totalAlumnos} {totalAlumnos === 1 ? 'alumno matriculado' : 'alumnos matriculados'}
            {' '}en {cursos.length} {cursos.length === 1 ? 'curso' : 'cursos'}
          </p>
        </div>
        <button onClick={bajarPlantilla} style={btnSec}>⬇ Plantilla Excel</button>
        <label style={{ ...btnPri(primary), cursor: subiendo ? 'default' : 'pointer',
          opacity: subiendo ? .6 : 1 }}>
          {subiendo ? 'Leyendo…' : '📄 Cargar planilla'}
          <input ref={archivoRef} type="file" accept=".xlsx,.xls,.csv" disabled={subiendo}
            onChange={e => subirPlanilla(e.target.files[0])} style={{ display: 'none' }} />
        </label>
      </div>

      {cursos.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 46 }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#475569', margin: '0 0 6px' }}>
            Todavía no hay cursos para {year}
          </p>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
            Creá los cursos del año antes de matricular alumnos.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '262px 1fr', gap: 16 }}>

          {/* Cursos */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', alignSelf: 'start' }}>
            <div style={{ padding: '11px 15px', borderBottom: '1px solid #f1f5f9' }}>
              <h3 style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', margin: 0,
                textTransform: 'uppercase', letterSpacing: '.06em' }}>Cursos</h3>
            </div>
            {cursos.map(c => (
              <div key={c.id} onClick={() => setSel(c.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 15px',
                  cursor: 'pointer', borderTop: '1px solid #f8fafc',
                  background: sel === c.id ? `${primary}0E` : 'transparent',
                  borderLeft: `3px solid ${sel === c.id ? primary : 'transparent'}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13.5, fontWeight: sel === c.id ? 700 : 600,
                    color: '#0f172a', margin: 0 }}>{c.nombre}</p>
                  {c.profesor_jefe && (
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: '1px 0 0',
                      whiteSpace: 'nowrap', overflow: 'hidden',
                      textOverflow: 'ellipsis' }}>{c.profesor_jefe}</p>
                  )}
                </div>
                <span style={{ fontSize: 12, fontWeight: 800,
                  color: c.alumnos ? primary : '#cbd5e1' }}>{c.alumnos}</span>
              </div>
            ))}
          </div>

          {/* Alumnos del curso */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10,
              padding: '13px 18px', borderBottom: '1px solid #f1f5f9' }}>
              <h3 style={{ fontSize: 15, fontWeight: 750, margin: 0, flex: 1 }}>
                {detalle?.curso?.nombre || 'Curso'}
              </h3>
              <button onClick={() => setNuevo({ nombre: '', apellido: '', rut: '', email: '' })}
                style={{ ...btnSec, padding: '6px 13px', fontSize: 13 }}>
                + Agregar alumno
              </button>
            </div>

            {!detalle?.alumnos?.length ? (
              <p style={{ padding: 36, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                Este curso no tiene alumnos matriculados.
              </p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['#', 'Apellido y nombre', 'RUT', ''].map((h, i) => (
                      <th key={i} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11,
                        textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detalle.alumnos.map((a, i) => (
                    <tr key={a.enrollment_id} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '9px 14px', color: '#cbd5e1', width: 36 }}>{i + 1}</td>
                      <td style={{ padding: '9px 14px', fontWeight: 600, color: '#0f172a' }}>
                        {a.apellido}, {a.nombre}
                      </td>
                      <td style={{ padding: '9px 14px', color: '#64748b' }}>{a.rut || '—'}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                        <button onClick={() => retirar(a)} title="Retirar del curso"
                          style={{ background: '#fee2e2', border: 'none', borderRadius: 6,
                            cursor: 'pointer', color: '#dc2626', fontSize: 11,
                            padding: '4px 9px', fontWeight: 600 }}>Retirar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
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

            <div style={{ overflowY: 'auto', flex: 1 }}>
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
              display: 'flex', alignItems: 'center', gap: 12 }}>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0, flex: 1 }}>
                Las filas con problemas no se pueden cargar; corregilas en la planilla
                y volvé a subirla.
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
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 3000,
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
  boxShadow: '0 20px 60px rgba(0,0,0,.3)',
};
