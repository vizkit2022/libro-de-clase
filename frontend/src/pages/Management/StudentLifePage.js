import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import UserAvatar, { avatarColor } from '../../components/UserAvatar/UserAvatar';

const ANN_COLORS = {
  positiva: { bg: '#d1fae5', color: '#065f46', icon: '⭐' },
  negativa:  { bg: '#fee2e2', color: '#991b1b', icon: '⚠️' },
  neutral:   { bg: '#f1f5f9', color: '#475569', icon: '📝' },
  academica: { bg: '#dbeafe', color: '#1d4ed8', icon: '📚' },
};

const gradeClass = (v) => v >= 6 ? 'nota-alta' : v >= 4 ? 'nota-media' : 'nota-baja';
const EMPTY_ANN = { annotation_type:'positiva', title:'', description:'', date: new Date().toISOString().split('T')[0], course_id:'' };

const GRADE_TYPES = [
  { value: 'nota', label: 'Nota' },
  { value: 'prueba', label: 'Prueba' },
  { value: 'tarea', label: 'Tarea' },
  { value: 'examen', label: 'Examen' },
  { value: 'participacion', label: 'Participación' },
  { value: 'promedio', label: 'Promedio' },
];

// Colour helper for grade value (1–7)
const colorNota = (v) => {
  if (v === null || v === undefined || v === '') return '#94a3b8';
  const n = parseFloat(v);
  if (n >= 6.0) return '#10b981';
  if (n >= 5.0) return '#3b82f6';
  if (n >= 4.0) return '#f59e0b';
  return '#ef4444';
};

export default function StudentLifePage() {
  const { id } = useParams();
  const { school, user } = useAuth();
  const primary = school?.primary_color || '#2563EB';
  const [report, setReport] = useState(null);
  const [courses, setCourses] = useState([]);
  const [tab, setTab] = useState('grades');
  const [showAnnotModal, setShowAnnotModal] = useState(false);
  const [annForm, setAnnForm] = useState(EMPTY_ANN);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const canAnnotate = ['admin','directivo','profesor'].includes(user?.role);

  // Grading state
  const [showGradePanel, setShowGradePanel] = useState(false);
  const [periods, setPeriods] = useState([]);
  const [courseSubjects, setCourseSubjects] = useState([]);
  const [savingGrade, setSavingGrade] = useState(false);
  const [gradeForm, setGradeForm] = useState({
    course_subject_id: '',
    period_id: '',
    grade_type: 'nota',
    description: '',
    values: [''],   // array of grade inputs
  });

  const showToast = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  const fetchData = async () => {
    const [repRes, courseRes, periodsRes] = await Promise.all([
      axios.get(`/api/reports/student/${id}/life`),
      axios.get('/api/courses/'),
      axios.get('/api/periods/'),
    ]);
    setReport(repRes.data);
    setCourses(courseRes.data);
    setPeriods(periodsRes.data);

    const enrollment = repRes.data.enrollments?.[0];
    if (enrollment) {
      setAnnForm(f => ({...f, course_id: String(enrollment.course_id)}));
      // Fetch subjects of the student's course
      try {
        const { data: courseDetail } = await axios.get(`/api/courses/${enrollment.course_id}`);
        setCourseSubjects(courseDetail.subjects || []);
        if (courseDetail.subjects?.length) {
          setGradeForm(f => ({ ...f, course_subject_id: String(courseDetail.subjects[0].id) }));
        }
      } catch {}
    }
    if (periodsRes.data?.length) {
      setGradeForm(f => ({ ...f, period_id: String(periodsRes.data[0].id) }));
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleSaveAnnotation = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await axios.post('/api/annotations/', { ...annForm, student_id: parseInt(id), course_id: parseInt(annForm.course_id) });
      showToast('Anotación guardada');
      setShowAnnotModal(false);
      fetchData();
    } catch { showToast('Error','error'); }
    finally { setSaving(false); }
  };

  // Add / remove grade value inputs
  const addGradeInput = () => setGradeForm(f => ({ ...f, values: [...f.values, ''] }));
  const removeGradeInput = (i) => setGradeForm(f => ({ ...f, values: f.values.filter((_,idx) => idx !== i) }));
  const updateGradeValue = (i, val) => setGradeForm(f => {
    const values = [...f.values];
    values[i] = val;
    return { ...f, values };
  });

  const handleSaveGrades = async (e) => {
    e.preventDefault();
    const validValues = gradeForm.values.filter(v => v !== '' && !isNaN(parseFloat(v)));
    if (!validValues.length || !gradeForm.course_subject_id || !gradeForm.period_id) {
      showToast('Completa los campos requeridos', 'error'); return;
    }
    // Validate range 1.0 – 7.0
    const outOfRange = validValues.find(v => parseFloat(v) < 1 || parseFloat(v) > 7);
    if (outOfRange) { showToast('Las notas deben estar entre 1.0 y 7.0', 'error'); return; }

    setSavingGrade(true);
    try {
      for (const val of validValues) {
        await axios.post('/api/grades/', {
          student_id: parseInt(id),
          course_subject_id: parseInt(gradeForm.course_subject_id),
          period_id: parseInt(gradeForm.period_id),
          value: parseFloat(val),
          grade_type: gradeForm.grade_type,
          description: gradeForm.description || null,
        });
      }
      showToast(`${validValues.length} calificación${validValues.length > 1 ? 'es' : ''} guardada${validValues.length > 1 ? 's' : ''} ✓`);
      setShowGradePanel(false);
      setGradeForm(f => ({ ...f, values: [''], description: '' }));
      fetchData();
    } catch { showToast('Error al guardar calificaciones', 'error'); }
    finally { setSavingGrade(false); }
  };

  if (!report) return <div className="loading-container"><div className="spinner" /></div>;

  const { student, annotations, annotations_summary } = report;

  // Agrupar notas por asignatura
  const gradesBySubject = {};
  report.grades?.forEach(g => {
    const key = g.subject_name || 'Sin asignatura';
    if (!gradesBySubject[key]) gradesBySubject[key] = [];
    gradesBySubject[key].push(g);
  });

  // Subject name for grading panel label
  const selectedSubjectName = courseSubjects.find(cs => String(cs.id) === gradeForm.course_subject_id)?.subject?.name || '';

  return (
    <div>
      <Link to="/courses" style={{ color: primary, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>← Volver</Link>

      {/* Header alumno */}
      <div className="card" style={{ marginTop: 16, marginBottom: 24, background: `linear-gradient(135deg, ${primary}15, ${primary}05)`, border: `1px solid ${primary}30` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <UserAvatar
            userId={student.id}
            firstName={student.first_name}
            lastName={student.last_name}
            hasPhoto={student.has_photo}
            size={72}
            color={avatarColor(student.id)}
            style={{ borderRadius: 16, flexShrink: 0 }}
          />
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>{student.first_name} {student.last_name}</h1>
            <p style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>
              {student.rut && `RUT: ${student.rut} · `}
              {student.email}
              {student.birth_date && ` · Nac: ${new Date(student.birth_date + 'T12:00').toLocaleDateString('es-CL')}`}
            </p>
          </div>
          {/* Resumen anotaciones */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              ['⭐', annotations_summary.positive, '#d1fae5', '#065f46', 'Positivas'],
              ['⚠️', annotations_summary.negative, '#fee2e2', '#991b1b', 'Negativas'],
              ['📝', annotations_summary.neutral, '#f1f5f9', '#475569', 'Neutras'],
            ].map(([ic, cnt, bg, col, lbl]) => (
              <div key={lbl} style={{ textAlign: 'center', background: bg, borderRadius: 10, padding: '8px 14px' }}>
                <p style={{ fontSize: 18 }}>{ic}</p>
                <p style={{ fontWeight: 800, fontSize: 18, color: col, lineHeight: 1 }}>{cnt}</p>
                <p style={{ fontSize: 11, color: col }}>{lbl}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab === 'grades' ? 'active' : ''}`} onClick={() => setTab('grades')}>📊 Calificaciones</button>
        <button className={`tab ${tab === 'annotations' ? 'active' : ''}`} onClick={() => setTab('annotations')}>
          📝 Anotaciones ({annotations.length})
        </button>
        <button className={`tab ${tab === 'info' ? 'active' : ''}`} onClick={() => setTab('info')}>👤 Datos personales</button>
      </div>

      {/* ── CALIFICACIONES ── */}
      {tab === 'grades' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Botón calificar */}
          {canAnnotate && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-primary"
                onClick={() => setShowGradePanel(v => !v)}
                style={{ background: primary }}
              >
                {showGradePanel ? '✕ Cancelar' : '✏️ Calificar'}
              </button>
            </div>
          )}

          {/* Panel de calificación inline */}
          {showGradePanel && (
            <div className="card" style={{
              border: `2px solid ${primary}40`,
              background: `linear-gradient(135deg, ${primary}08, #fff)`,
              padding: 24,
            }}>
              <h3 style={{ fontWeight: 700, color: '#0f172a', marginBottom: 20, fontSize: 16 }}>
                ✏️ Ingresar calificaciones
              </h3>
              <form onSubmit={handleSaveGrades}>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
                  {/* Asignatura */}
                  <div className="form-group" style={{ gridColumn: '1 / span 2' }}>
                    <label>Asignatura *</label>
                    {courseSubjects.length === 0 ? (
                      <p style={{ fontSize: 13, color: '#94a3b8' }}>El alumno no tiene asignaturas asignadas en su curso</p>
                    ) : (
                      <select
                        value={gradeForm.course_subject_id}
                        onChange={e => setGradeForm(f => ({ ...f, course_subject_id: e.target.value }))}
                        required
                      >
                        <option value="">Elegir asignatura...</option>
                        {courseSubjects.map(cs => (
                          <option key={cs.id} value={cs.id}>
                            {cs.subject?.name}
                            {cs.teacher ? ` — ${cs.teacher.first_name} ${cs.teacher.last_name}` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Período */}
                  <div className="form-group">
                    <label>Período *</label>
                    {periods.length === 0 ? (
                      <p style={{ fontSize: 13, color: '#94a3b8' }}>Sin períodos configurados</p>
                    ) : (
                      <select
                        value={gradeForm.period_id}
                        onChange={e => setGradeForm(f => ({ ...f, period_id: e.target.value }))}
                        required
                      >
                        <option value="">Elegir período...</option>
                        {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    )}
                  </div>

                  {/* Tipo de calificación */}
                  <div className="form-group">
                    <label>Tipo</label>
                    <select value={gradeForm.grade_type} onChange={e => setGradeForm(f => ({ ...f, grade_type: e.target.value }))}>
                      {GRADE_TYPES.map(gt => <option key={gt.value} value={gt.value}>{gt.label}</option>)}
                    </select>
                  </div>

                  {/* Descripción */}
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Descripción (opcional)</label>
                    <input
                      type="text"
                      value={gradeForm.description}
                      onChange={e => setGradeForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Ej: Prueba Unidad 2, Control de lectura..."
                    />
                  </div>
                </div>

                {/* Notas */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <label style={{ fontWeight: 600, fontSize: 13, color: '#374151', margin: 0 }}>
                      Nota{gradeForm.values.length > 1 ? 's' : ''} *
                      {selectedSubjectName && (
                        <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 6 }}>· {selectedSubjectName}</span>
                      )}
                    </label>
                    <button
                      type="button"
                      onClick={addGradeInput}
                      style={{
                        fontSize: 12, fontWeight: 600, color: primary,
                        background: primary + '15', border: 'none', borderRadius: 6,
                        padding: '4px 12px', cursor: 'pointer',
                      }}
                    >
                      ➕ Agregar nota
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {gradeForm.values.map((val, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{
                          display: 'flex', alignItems: 'center',
                          border: `2px solid ${val !== '' && !isNaN(parseFloat(val)) ? colorNota(val) : '#e2e8f0'}`,
                          borderRadius: 10, overflow: 'hidden', background: '#fff',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                          transition: 'border-color 0.2s',
                        }}>
                          <input
                            type="number"
                            min="1.0" max="7.0" step="0.1"
                            value={val}
                            onChange={e => updateGradeValue(i, e.target.value)}
                            placeholder="1.0–7.0"
                            required
                            style={{
                              width: 90, border: 'none', outline: 'none',
                              padding: '10px 12px', fontSize: 18, fontWeight: 700,
                              color: val !== '' && !isNaN(parseFloat(val)) ? colorNota(val) : '#374151',
                              textAlign: 'center',
                            }}
                          />
                          {val !== '' && !isNaN(parseFloat(val)) && (
                            <div style={{
                              width: 4, height: 40,
                              background: colorNota(val),
                              borderRadius: '0 10px 10px 0',
                            }} />
                          )}
                        </div>
                        {gradeForm.values.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeGradeInput(i)}
                            style={{
                              background: '#fee2e2', color: '#991b1b', border: 'none',
                              borderRadius: 6, width: 26, height: 26, cursor: 'pointer',
                              fontSize: 13, fontWeight: 700,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
                    Escala 1.0 – 7.0 · La nota mínima de aprobación es 4.0
                  </p>
                </div>

                {/* Acciones */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button
                    type="button" className="btn btn-secondary"
                    onClick={() => { setShowGradePanel(false); setGradeForm(f => ({ ...f, values: [''], description: '' })); }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit" className="btn btn-primary"
                    disabled={savingGrade || courseSubjects.length === 0 || periods.length === 0}
                    style={{ background: primary }}
                  >
                    {savingGrade ? 'Guardando...' : `💾 Guardar ${gradeForm.values.filter(v => v !== '').length > 1 ? `${gradeForm.values.filter(v => v !== '').length} notas` : 'nota'}`}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Notas existentes por asignatura */}
          {Object.keys(gradesBySubject).length === 0 ? (
            <div className="card"><div className="illustration-area"><div className="illustration">📊</div><h3>Sin calificaciones</h3><p>Usa el botón "Calificar" para ingresar la primera nota</p></div></div>
          ) : Object.entries(gradesBySubject).map(([subject, gs]) => {
            const avg = gs.reduce((a,b) => a + b.value, 0) / gs.length;
            return (
              <div key={subject} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontWeight: 700, fontSize: 15 }}>{subject}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#64748b' }}>Promedio:</span>
                    <span className={`nota-chip ${gradeClass(avg)}`} style={{ fontWeight: 800 }}>{avg.toFixed(1)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {gs.map(g => (
                    <div key={g.id} style={{ textAlign: 'center' }}>
                      <span className={`nota-chip ${gradeClass(g.value)}`}>{g.value}</span>
                      <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                        {g.period_name?.split(' ')[0]}
                      </p>
                      {g.description && (
                        <p style={{ fontSize: 10, color: '#cbd5e1', marginTop: 1, maxWidth: 60, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {g.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Anotaciones */}
      {tab === 'annotations' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            {canAnnotate && (
              <button className="btn btn-primary" onClick={() => setShowAnnotModal(true)} style={{ background: primary }}>
                ➕ Nueva anotación
              </button>
            )}
          </div>
          {annotations.length === 0 ? (
            <div className="card"><div className="illustration-area"><div className="illustration">📝</div><h3>Sin anotaciones</h3></div></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {annotations.map(a => {
                const ann = ANN_COLORS[a.annotation_type] || ANN_COLORS.neutral;
                return (
                  <div key={a.id} style={{ background: ann.bg, borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 14 }}>
                    <span style={{ fontSize: 22, flexShrink: 0 }}>{ann.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <h4 style={{ fontWeight: 700, color: ann.color, fontSize: 14 }}>{a.title}</h4>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>{new Date(a.date + 'T12:00').toLocaleDateString('es-CL')}</span>
                      </div>
                      <p style={{ fontSize: 13, color: ann.color, marginTop: 4, opacity: 0.85 }}>{a.description}</p>
                      {a.creator_name && <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Por: {a.creator_name}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Datos personales */}
      {tab === 'info' && (
        <div className="card">
          <div className="form-grid">
            {[
              ['Nombre completo', `${student.first_name} ${student.last_name}`],
              ['RUT', student.rut || '—'],
              ['Email', student.email],
              ['Teléfono', student.phone || '—'],
              ['Género', student.gender || '—'],
              ['Fecha de nacimiento', student.birth_date ? new Date(student.birth_date+'T12:00').toLocaleDateString('es-CL') : '—'],
              ['Dirección', student.address || '—'],
            ].map(([label, val]) => (
              <div key={label}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>{label}</p>
                <p style={{ fontSize: 14, fontWeight: 500, color: '#1e293b' }}>{val}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal anotación */}
      {showAnnotModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAnnotModal(false)}>
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3>📝 Nueva anotación</h3>
              <button className="modal-close" onClick={() => setShowAnnotModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveAnnotation}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label>Tipo</label>
                    <select value={annForm.annotation_type} onChange={e => setAnnForm({...annForm, annotation_type: e.target.value})}>
                      <option value="positiva">⭐ Positiva</option>
                      <option value="negativa">⚠️ Negativa</option>
                      <option value="neutral">📝 Neutral</option>
                      <option value="academica">📚 Académica</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Fecha</label>
                    <input type="date" value={annForm.date} onChange={e => setAnnForm({...annForm, date: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>Curso</label>
                    <select value={annForm.course_id} onChange={e => setAnnForm({...annForm, course_id: e.target.value})}>
                      {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label>Título *</label>
                    <input required value={annForm.title} onChange={e => setAnnForm({...annForm, title: e.target.value})} placeholder="Ej: Participación destacada" />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label>Descripción *</label>
                    <textarea required rows={3} value={annForm.description} onChange={e => setAnnForm({...annForm, description: e.target.value})} placeholder="Detalle de la anotación..." />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAnnotModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ background: primary }}>
                  {saving ? 'Guardando...' : 'Guardar anotación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {toast && <div className="toast-container"><div className={`toast toast-${toast.type}`}>{toast.msg}</div></div>}
    </div>
  );
}
