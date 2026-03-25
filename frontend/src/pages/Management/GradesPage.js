import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const MAX_NOTAS = 15;

// ── Colores según valor ─────────────────────────────────────────────
const gradeColor = (v) => {
  const n = parseFloat(v);
  if (isNaN(n) || v === '') return null;
  if (n >= 6.0) return { bg: '#dcfce7', border: '#86efac', color: '#166534', dot: '#16a34a' };
  if (n >= 5.0) return { bg: '#d1fae5', border: '#6ee7b7', color: '#065f46', dot: '#10b981' };
  if (n >= 4.0) return { bg: '#fef9c3', border: '#fde047', color: '#854d0e', dot: '#ca8a04' };
  if (n >= 3.0) return { bg: '#ffedd5', border: '#fdba74', color: '#9a3412', dot: '#ea580c' };
  return       { bg: '#fee2e2', border: '#fca5a5', color: '#991b1b', dot: '#dc2626' };
};

const calcAvg = (vals) => {
  const nums = vals.map(v => parseFloat(v)).filter(n => !isNaN(n) && n > 0);
  if (!nums.length) return null;
  return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1);
};

// ── Celda individual ────────────────────────────────────────────────
const GradeCell = React.memo(({ value, onChange, onKeyDown, inputRef, isExisting, gradeId, onDelete }) => {
  const col = gradeColor(value);
  const empty = value === '' || value === null || value === undefined;

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <input
        ref={inputRef}
        type="number"
        min="1.0" max="7.0" step="0.1"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={e => e.target.select()}
        placeholder="—"
        style={{
          width: 52,
          height: 36,
          textAlign: 'center',
          fontSize: 13,
          fontWeight: col ? 700 : 400,
          border: `2px solid ${col ? col.border : '#e2e8f0'}`,
          borderRadius: 8,
          background: col ? col.bg : '#f8fafc',
          color: col ? col.color : '#94a3b8',
          outline: 'none',
          cursor: 'text',
          transition: 'all 0.15s',
          fontFamily: 'inherit',
          padding: 0,
          // Quitar flechas del spinner en número
          MozAppearance: 'textfield',
        }}
        onWheel={e => e.target.blur()} // evita cambio accidental con scroll
      />
      {/* Indicador de nota guardada */}
      {isExisting && !empty && col && (
        <span style={{
          position: 'absolute', top: 2, right: 3,
          width: 5, height: 5, borderRadius: '50%',
          background: col.dot, flexShrink: 0
        }} title="Nota guardada" />
      )}
    </div>
  );
});

// ── Componente principal ────────────────────────────────────────────
export default function GradesPage() {
  const { school } = useAuth();
  const primary = school?.primary_color || '#2563EB';

  const [courses, setCourses]           = useState([]);
  const [periods, setPeriods]           = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [courseDetail, setCourseDetail] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState('');

  // gridData: { [studentId]: string[15] }  — valores editables
  const [gridData, setGridData]         = useState({});
  // existingGrades: grade objects ya guardados
  const [existingGrades, setExistingGrades] = useState([]);
  // dirtySet: conjunto de studentIds con cambios pendientes
  const [dirty, setDirty]               = useState(false);

  const [view, setView]                 = useState('grid'); // grid | summary
  const [saving, setSaving]             = useState(false);
  const [toast, setToast]               = useState(null);

  // refs de todos los inputs para navegación con Tab
  const cellRefs = useRef({});

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Cargar cursos y períodos ─────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const [c, p] = await Promise.all([axios.get('/api/courses/'), axios.get('/api/periods/')]);
      setCourses(c.data);
      setPeriods(p.data);
      const active = p.data.find(x => x.is_active) || p.data[0];
      if (active) setSelectedPeriod(String(active.id));
    };
    load();
  }, []);

  // ── Cargar detalle del curso ─────────────────────────────────────
  useEffect(() => {
    if (!selectedCourse) return;
    setCourseDetail(null);
    setGridData({});
    axios.get(`/api/courses/${selectedCourse}`).then(({ data }) => {
      setCourseDetail(data);
      if (data.subjects?.length) setSelectedSubject(String(data.subjects[0].id));
    });
  }, [selectedCourse]);

  // ── Cargar notas existentes y construir grilla ───────────────────
  const loadGrades = useCallback(async () => {
    if (!selectedCourse || !selectedPeriod || !courseDetail || !selectedSubject) return;
    const cs = courseDetail.subjects?.find(s => String(s.id) === selectedSubject);
    if (!cs) return;

    const { data } = await axios.get(
      `/api/grades/?period_id=${selectedPeriod}&course_subject_id=${cs.id}`
    );
    setExistingGrades(data);

    // Construir gridData desde las notas existentes
    const grid = {};
    (courseDetail.students || []).forEach(e => {
      const sid = e.student_id;
      const studentGrades = data
        .filter(g => g.student_id === sid)
        .sort((a, b) => a.id - b.id)   // orden de creación
        .slice(0, MAX_NOTAS);

      const row = Array(MAX_NOTAS).fill('');
      studentGrades.forEach((g, i) => { row[i] = String(g.value); });
      grid[sid] = row;
    });
    setGridData(grid);
    setDirty(false);
  }, [selectedCourse, selectedPeriod, courseDetail, selectedSubject]);

  useEffect(() => { loadGrades(); }, [loadGrades]);

  // ── Actualizar celda ─────────────────────────────────────────────
  const handleCellChange = (studentId, colIdx, value) => {
    // Validar rango
    const num = parseFloat(value);
    if (value !== '' && (num < 1 || num > 7)) return;

    setGridData(prev => {
      const row = [...(prev[studentId] || Array(MAX_NOTAS).fill(''))];
      row[colIdx] = value;
      return { ...prev, [studentId]: row };
    });
    setDirty(true);
  };

  // ── Navegación con teclado ───────────────────────────────────────
  const handleKeyDown = (e, studentId, colIdx, studentIdx) => {
    const students = courseDetail?.students || [];
    const totalCols = MAX_NOTAS;

    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      let nextSid, nextCol;

      if (e.shiftKey) {
        // Ir hacia atrás
        if (colIdx > 0) {
          nextSid = studentId; nextCol = colIdx - 1;
        } else if (studentIdx > 0) {
          nextSid = students[studentIdx - 1].student_id;
          nextCol = totalCols - 1;
        }
      } else {
        // Ir hacia adelante: primero horizontal, luego baja de fila
        if (colIdx < totalCols - 1) {
          nextSid = studentId; nextCol = colIdx + 1;
        } else if (studentIdx < students.length - 1) {
          nextSid = students[studentIdx + 1].student_id;
          nextCol = 0;
        }
      }

      if (nextSid !== undefined && nextCol !== undefined) {
        const ref = cellRefs.current[`${nextSid}_${nextCol}`];
        if (ref) ref.focus();
      }
    }

    if (e.key === 'ArrowRight' && colIdx < totalCols - 1) {
      e.preventDefault();
      cellRefs.current[`${studentId}_${colIdx + 1}`]?.focus();
    }
    if (e.key === 'ArrowLeft' && colIdx > 0) {
      e.preventDefault();
      cellRefs.current[`${studentId}_${colIdx - 1}`]?.focus();
    }
    if (e.key === 'ArrowDown' && studentIdx < (courseDetail?.students?.length || 0) - 1) {
      e.preventDefault();
      const nextSid = courseDetail.students[studentIdx + 1].student_id;
      cellRefs.current[`${nextSid}_${colIdx}`]?.focus();
    }
    if (e.key === 'ArrowUp' && studentIdx > 0) {
      e.preventDefault();
      const prevSid = courseDetail.students[studentIdx - 1].student_id;
      cellRefs.current[`${prevSid}_${colIdx}`]?.focus();
    }
  };

  // ── Guardar toda la grilla ───────────────────────────────────────
  const handleSave = async () => {
    const cs = courseDetail?.subjects?.find(s => String(s.id) === selectedSubject);
    if (!cs || !selectedPeriod) return;
    setSaving(true);

    try {
      // Reconstruir las notas que deben quedar en la BD
      // Para cada alumno: las notas existentes (por orden) y las nuevas
      const students = courseDetail.students || [];

      // Estrategia: borrar todo y reinsertar (bulk insert)
      // Construir payload con TODAS las notas no vacías de la grilla
      const allGrades = [];
      students.forEach(e => {
        const sid = e.student_id;
        const row = gridData[sid] || [];
        row.forEach((val) => {
          if (val !== '' && val !== null) {
            const num = parseFloat(val);
            if (!isNaN(num) && num >= 1 && num <= 7) {
              allGrades.push({ student_id: sid, value: num });
            }
          }
        });
      });

      // Primero eliminar notas existentes del período/asignatura
      const deletePromises = existingGrades.map(g =>
        axios.delete(`/api/grades/${g.id}`).catch(() => {})
      );
      await Promise.all(deletePromises);

      // Luego insertar todas las notas de la grilla
      if (allGrades.length > 0) {
        // Agrupar por alumno para el bulk endpoint
        const byStudent = {};
        allGrades.forEach(g => {
          if (!byStudent[g.student_id]) byStudent[g.student_id] = [];
          byStudent[g.student_id].push(g);
        });

        // Crear todas las notas en bulk
        const bulkPayload = {
          course_subject_id: cs.id,
          period_id: parseInt(selectedPeriod),
          grade_type: 'nota',
          grades: allGrades,
        };
        await axios.post('/api/grades/bulk', bulkPayload);
      }

      const savedCount = allGrades.length;
      showToast(`✅ ${savedCount} ${savedCount === 1 ? 'nota guardada' : 'notas guardadas'} correctamente`);
      await loadGrades();
    } catch (err) {
      showToast('Error al guardar las notas', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Columnas usadas: máx entre notas existentes y 3 (mínimo visible) ──
  const getUsedCols = () => {
    if (!courseDetail) return 3;
    let max = 3;
    (courseDetail.students || []).forEach(e => {
      const row = gridData[e.student_id] || [];
      const lastFilled = row.reduce((acc, v, i) => (v !== '' ? i + 1 : acc), 0);
      if (lastFilled > max) max = lastFilled;
    });
    return Math.min(max + 1, MAX_NOTAS); // siempre una columna libre al final
  };

  const cs = courseDetail?.subjects?.find(s => String(s.id) === selectedSubject);
  const visibleCols = getUsedCols();
  const avatarColors = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#0ea5e9'];
  const avatarColor = (id) => avatarColors[id % avatarColors.length];

  // ── Summary view ─────────────────────────────────────────────────
  const SummaryView = () => {
    if (!courseDetail) return null;
    return (
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
          <h3 style={{ fontWeight: 700, fontSize: 15 }}>Resumen del curso: {courseDetail.name}</h3>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>Promedios por asignatura</p>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f8fafc' }}>
              <tr>
                <th style={{ ...thStyle, minWidth: 180, position: 'sticky', left: 0, background: '#f8fafc', zIndex: 2 }}>Alumno</th>
                {courseDetail.subjects?.map(s => (
                  <th key={s.id} style={{ ...thStyle, textAlign: 'center', minWidth: 90 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.subject?.color || primary, display: 'inline-block' }} />
                      <span>{s.subject?.name?.split(' ')[0]}</span>
                    </div>
                  </th>
                ))}
                <th style={{ ...thStyle, textAlign: 'center', background: '#f1f5f9' }}>Prom. Gral.</th>
              </tr>
            </thead>
            <tbody>
              {courseDetail.students?.map(e => {
                const allAvgs = courseDetail.subjects?.map(s => {
                  const row = gridData[e.student_id] || [];
                  return calcAvg(row);
                }) || [];
                const validAvgs = allAvgs.filter(a => a !== null).map(Number);
                const general = validAvgs.length
                  ? (validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length).toFixed(1)
                  : null;

                return (
                  <tr key={e.id} style={{ transition: 'background .15s' }}
                    onMouseEnter={e2 => e2.currentTarget.style.background = '#fafafa'}
                    onMouseLeave={e2 => e2.currentTarget.style.background = ''}>
                    <td style={{ ...tdStyle, position: 'sticky', left: 0, background: 'white', zIndex: 1, fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: avatarColor(e.student_id),
                          color: 'white', fontWeight: 700, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {e.student?.first_name?.[0]}{e.student?.last_name?.[0]}
                        </div>
                        <Link to={`/students/${e.student_id}/life`} style={{ fontSize: 13, color: primary, fontWeight: 600, textDecoration: 'none' }}
                          onMouseEnter={ev => ev.target.style.textDecoration='underline'}
                          onMouseLeave={ev => ev.target.style.textDecoration='none'}>
                          {e.student?.first_name} {e.student?.last_name}
                        </Link>
                      </div>
                    </td>
                    {allAvgs.map((avg, i) => {
                      const col = avg ? gradeColor(avg) : null;
                      return (
                        <td key={i} style={{ ...tdStyle, textAlign: 'center' }}>
                          {avg ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 44, height: 30, borderRadius: 7, fontWeight: 700, fontSize: 13,
                              background: col?.bg, color: col?.color, border: `1.5px solid ${col?.border}` }}>
                              {avg}
                            </span>
                          ) : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>}
                        </td>
                      );
                    })}
                    <td style={{ ...tdStyle, textAlign: 'center', background: '#fafafa' }}>
                      {general ? (() => {
                        const col = gradeColor(general);
                        return (
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 48, height: 32, borderRadius: 8, fontWeight: 800, fontSize: 14,
                            background: col?.bg, color: col?.color, border: `2px solid ${col?.border}` }}>
                            {general}
                          </span>
                        );
                      })() : <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Estilos inline reutilizables ─────────────────────────────────
  const thStyle = {
    padding: '10px 12px',
    fontSize: 11,
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid #e2e8f0',
    whiteSpace: 'nowrap',
    textAlign: 'left',
  };
  const tdStyle = {
    padding: '6px 10px',
    borderBottom: '1px solid #f1f5f9',
    verticalAlign: 'middle',
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">✏️ Calificaciones</h1>
          <p className="page-subtitle">Grilla de ingreso rápido · Tab para avanzar · ↑↓←→ para navegar</p>
        </div>
      </div>

      {/* Barra de selectores */}
      <div className="card" style={{ marginBottom: 16, padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* Curso */}
          <div className="form-group" style={{ minWidth: 180 }}>
            <label>Curso</label>
            <select value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)}>
              <option value="">Seleccionar...</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Período */}
          <div className="form-group" style={{ minWidth: 180 }}>
            <label>Período</label>
            <select value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)}>
              <option value="">Seleccionar...</option>
              {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Asignatura */}
          {courseDetail && (
            <div className="form-group" style={{ minWidth: 200 }}>
              <label>Asignatura</label>
              <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
                {courseDetail.subjects?.map(s => (
                  <option key={s.id} value={s.id}>{s.subject?.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Toggle vista */}
          <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 9, padding: 4, alignSelf: 'flex-end' }}>
            <button
              style={{ padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: view === 'grid' ? 'white' : 'transparent',
                color: view === 'grid' ? primary : '#64748b',
                boxShadow: view === 'grid' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}
              onClick={() => setView('grid')}>
              📋 Grilla
            </button>
            <button
              style={{ padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: view === 'summary' ? 'white' : 'transparent',
                color: view === 'summary' ? primary : '#64748b',
                boxShadow: view === 'summary' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}
              onClick={() => setView('summary')}>
              👤 Resumen
            </button>
          </div>

          {/* Guardar (solo en vista grilla) */}
          {view === 'grid' && selectedCourse && courseDetail && (
            <button
              className="btn"
              onClick={handleSave}
              disabled={saving}
              style={{
                marginLeft: 'auto', alignSelf: 'flex-end',
                background: dirty ? primary : '#e2e8f0',
                color: dirty ? 'white' : '#94a3b8',
                boxShadow: dirty ? `0 2px 8px ${primary}44` : 'none',
                transition: 'all 0.2s',
                padding: '9px 20px', borderRadius: 10, fontWeight: 700, fontSize: 13,
                border: 'none', cursor: dirty ? 'pointer' : 'default',
              }}>
              {saving ? '⏳ Guardando...' : dirty ? '💾 Guardar notas' : '✓ Sin cambios'}
            </button>
          )}
        </div>
      </div>

      {/* Contenido */}
      {!selectedCourse ? (
        <div className="card">
          <div className="illustration-area">
            <div className="illustration">✏️</div>
            <h3>Selecciona un curso para comenzar</h3>
            <p>Elige curso, período y asignatura para abrir la grilla</p>
          </div>
        </div>

      ) : !courseDetail ? (
        <div className="loading-container"><div className="spinner" /></div>

      ) : view === 'summary' ? (
        <SummaryView />

      ) : (
        /* ══════════ GRILLA PRINCIPAL ══════════ */
        <div style={{ borderRadius: 16, background: 'white', border: '1px solid #f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>

          {/* Cabecera de la grilla */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px', borderBottom: '2px solid #f1f5f9', background: 'white' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {cs?.subject?.color && (
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: cs.subject.color, flexShrink: 0, display: 'inline-block' }} />
                )}
                <h3 style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>
                  {cs?.subject?.name || '—'} <span style={{ color: '#94a3b8', fontWeight: 400 }}>—</span> {courseDetail.name}
                </h3>
              </div>
              {cs?.teacher && (
                <p style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
                  👨‍🏫 {cs.teacher.first_name} {cs.teacher.last_name}
                  {' · '}<span style={{ color: '#94a3b8' }}>Máx. {MAX_NOTAS} notas por período · {courseDetail.students?.length} alumnos</span>
                </p>
              )}
            </div>
            {/* Leyenda de colores */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
              {[
                { label: '≥6.0', bg: '#dcfce7', border: '#86efac', color: '#166534' },
                { label: '5–5.9', bg: '#fef9c3', border: '#fde047', color: '#854d0e' },
                { label: '<4.0', bg: '#fee2e2', border: '#fca5a5', color: '#991b1b' },
              ].map(l => (
                <span key={l.label} style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                  background: l.bg, border: `1.5px solid ${l.border}`, color: l.color }}>
                  {l.label}
                </span>
              ))}
            </div>
          </div>

          {/* Tabla-grilla */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 36 }} />   {/* # */}
                <col style={{ width: 180 }} />  {/* Alumno */}
                {Array.from({ length: visibleCols }, (_, i) => (
                  <col key={i} style={{ width: 58 }} />
                ))}
                <col style={{ width: 60 }} />   {/* Prom */}
                <col style={{ width: 44 }} />   {/* HV */}
              </colgroup>

              {/* Encabezado columnas */}
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ ...thStyle, textAlign: 'center', padding: '10px 6px', color: '#cbd5e1' }}>#</th>
                  <th style={{ ...thStyle, paddingLeft: 14 }}>Alumno</th>
                  {Array.from({ length: visibleCols }, (_, i) => (
                    <th key={i} style={{ ...thStyle, textAlign: 'center', padding: '10px 4px',
                      color: i < visibleCols - 1 ? '#475569' : '#cbd5e1',
                      fontWeight: i < visibleCols - 1 ? 700 : 500 }}>
                      N{i + 1}
                    </th>
                  ))}
                  <th style={{ ...thStyle, textAlign: 'center', background: '#f1f5f9', color: '#475569', padding: '10px 4px' }}>PROM</th>
                  <th style={{ ...thStyle, textAlign: 'center', padding: '10px 4px' }}></th>
                </tr>
              </thead>

              <tbody>
                {courseDetail.students?.map((e, studentIdx) => {
                  const sid = e.student_id;
                  const row = gridData[sid] || Array(MAX_NOTAS).fill('');
                  const avg = calcAvg(row);
                  const avgCol = avg ? gradeColor(avg) : null;

                  // Cuántas notas tiene este alumno en la BD
                  const existingCount = existingGrades.filter(g => g.student_id === sid).length;

                  return (
                    <tr key={e.id}
                      style={{ transition: 'background .1s' }}
                      onMouseEnter={ev => ev.currentTarget.style.background = '#fafcff'}
                      onMouseLeave={ev => ev.currentTarget.style.background = ''}>

                      {/* # */}
                      <td style={{ ...tdStyle, textAlign: 'center', color: '#cbd5e1', fontSize: 12, fontWeight: 600, padding: '6px 4px' }}>
                        {studentIdx + 1}
                      </td>

                      {/* Alumno */}
                      <td style={{ ...tdStyle, paddingLeft: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 30, height: 30, borderRadius: '50%',
                            background: avatarColor(sid), color: 'white',
                            fontWeight: 700, fontSize: 10, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {e.student?.first_name?.[0]}{e.student?.last_name?.[0]}
                          </div>
                          <div>
                            <Link to={`/students/${sid}`} style={{ fontWeight: 600, fontSize: 13, color: primary, textDecoration: 'none', lineHeight: 1.3, display: 'block' }}
                              onMouseEnter={ev => ev.target.style.textDecoration='underline'}
                              onMouseLeave={ev => ev.target.style.textDecoration='none'}>
                              {e.student?.last_name}
                            </Link>
                            <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.2 }}>
                              {e.student?.first_name}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Celdas de notas */}
                      {Array.from({ length: visibleCols }, (_, colIdx) => {
                        const val = row[colIdx] ?? '';
                        const isExisting = colIdx < existingCount;
                        return (
                          <td key={colIdx} style={{ ...tdStyle, textAlign: 'center', padding: '5px 3px' }}>
                            <GradeCell
                              value={val}
                              isExisting={isExisting}
                              onChange={v => handleCellChange(sid, colIdx, v)}
                              onKeyDown={ev => handleKeyDown(ev, sid, colIdx, studentIdx)}
                              inputRef={el => { cellRefs.current[`${sid}_${colIdx}`] = el; }}
                            />
                          </td>
                        );
                      })}

                      {/* Promedio */}
                      <td style={{ ...tdStyle, textAlign: 'center', background: '#fafafa', padding: '5px 4px' }}>
                        {avg ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 48, height: 34, borderRadius: 9, fontWeight: 800, fontSize: 14,
                            background: avgCol?.bg, color: avgCol?.color,
                            border: `2px solid ${avgCol?.border}`,
                            boxShadow: `0 1px 4px ${avgCol?.border}66`,
                          }}>
                            {avg}
                          </span>
                        ) : (
                          <span style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600 }}>—</span>
                        )}
                      </td>

                      {/* Hoja de vida */}
                      <td style={{ ...tdStyle, textAlign: 'center', padding: '5px 4px' }}>
                        <Link to={`/students/${sid}/life`}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 30, height: 30, borderRadius: 7, background: '#f1f5f9',
                            border: '1px solid #e2e8f0', color: '#64748b', fontSize: 14,
                            textDecoration: 'none', transition: 'all .15s' }}
                          onMouseEnter={ev => { ev.currentTarget.style.background = primary; ev.currentTarget.style.color = 'white'; }}
                          onMouseLeave={ev => { ev.currentTarget.style.background = '#f1f5f9'; ev.currentTarget.style.color = '#64748b'; }}
                          title="Hoja de vida">
                          📋
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Footer con promedios por columna */}
              <tfoot>
                <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                  <td colSpan={2} style={{ padding: '8px 14px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Promedio clase
                  </td>
                  {Array.from({ length: visibleCols }, (_, colIdx) => {
                    const colVals = (courseDetail.students || [])
                      .map(e => parseFloat(gridData[e.student_id]?.[colIdx] ?? ''))
                      .filter(n => !isNaN(n) && n > 0);
                    const colAvg = colVals.length ? (colVals.reduce((a, b) => a + b, 0) / colVals.length).toFixed(1) : null;
                    const col = colAvg ? gradeColor(colAvg) : null;
                    return (
                      <td key={colIdx} style={{ padding: '8px 3px', textAlign: 'center' }}>
                        {colAvg ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 44, height: 28, borderRadius: 6, fontSize: 12, fontWeight: 700,
                            background: col?.bg, color: col?.color, border: `1.5px solid ${col?.border}` }}>
                            {colAvg}
                          </span>
                        ) : <span style={{ color: '#e2e8f0', fontSize: 12 }}>—</span>}
                      </td>
                    );
                  })}
                  <td style={{ padding: '8px 4px', textAlign: 'center', background: '#f1f5f9' }}>
                    {(() => {
                      const allAvgs = (courseDetail.students || [])
                        .map(e => parseFloat(calcAvg(gridData[e.student_id] || [])))
                        .filter(n => !isNaN(n));
                      if (!allAvgs.length) return <span style={{ color: '#e2e8f0' }}>—</span>;
                      const total = (allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length).toFixed(1);
                      const col = gradeColor(total);
                      return (
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 48, height: 30, borderRadius: 8, fontSize: 13, fontWeight: 800,
                          background: col?.bg, color: col?.color, border: `2px solid ${col?.border}` }}>
                          {total}
                        </span>
                      );
                    })()}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Pie de grilla */}
          <div style={{ padding: '10px 20px', borderTop: '1px solid #f1f5f9', background: '#fafafa',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#94a3b8' }}>
              <span>⌨️ <strong>Tab</strong> / <strong>Enter</strong> → siguiente celda</span>
              <span>↑↓←→ navegar</span>
              <span>🔵 punto = nota guardada</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {dirty && (
                <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>
                  ⚠️ Cambios sin guardar
                </span>
              )}
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                style={{
                  padding: '8px 20px', borderRadius: 10, fontWeight: 700, fontSize: 13,
                  border: 'none', cursor: dirty ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                  background: dirty ? primary : '#e2e8f0',
                  color: dirty ? 'white' : '#94a3b8',
                  boxShadow: dirty ? `0 2px 8px ${primary}44` : 'none',
                  transition: 'all 0.2s',
                }}>
                {saving ? '⏳ Guardando...' : '💾 Guardar notas'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  );
}
