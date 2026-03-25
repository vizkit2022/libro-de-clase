import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { buildCurriculumUrl } from '../../utils/curriculumMapping';
import UserAvatar, { avatarColor } from '../../components/UserAvatar/UserAvatar';

function getSubjectEmoji(name) {
  if (!name) return '📖';
  const lower = name.toLowerCase();
  if (lower.includes('matem')) return '🔢';
  if (lower.includes('lenguaje') || lower.includes('comunicac')) return '📝';
  if (lower.includes('historia') || lower.includes('geograf')) return '🌍';
  if (lower.includes('ciencias')) return '🔬';
  if (lower.includes('ingl')) return '🇬🇧';
  if (lower.includes('fís') || lower.includes('fis') || lower.includes('educación f')) return '⚽';
  if (lower.includes('artes vis')) return '🎨';
  if (lower.includes('música') || lower.includes('musica')) return '🎵';
  if (lower.includes('tecnol')) return '💻';
  if (lower.includes('orient')) return '🧭';
  return '📚';
}

export default function CourseDetailPage() {
  const { id } = useParams();
  const { school, user } = useAuth();
  const primary = school?.primary_color || '#2563EB';
  const [course, setCourse] = useState(null);
  const [tab, setTab] = useState('students');
  const [allStudents, setAllStudents] = useState([]);
  const [allSubjects, setAllSubjects] = useState([]);
  const [allTeachers, setAllTeachers] = useState([]);
  const [toast, setToast] = useState(null);
  const [showEnroll, setShowEnroll] = useState(false);
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [enrollStudent, setEnrollStudent] = useState('');
  const [subjectForm, setSubjectForm] = useState({ subject_id:'', teacher_id:'', hours_per_week:2 });
  const canEdit = ['admin','directivo'].includes(user?.role);

  const showToast = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  useEffect(() => {
    const fetch = async () => {
      const [courseRes, studRes, subRes, teachRes] = await Promise.all([
        axios.get(`/api/courses/${id}`),
        axios.get('/api/users/?role=alumno'),
        axios.get('/api/subjects/'),
        axios.get('/api/users/?role=profesor'),
      ]);
      setCourse(courseRes.data);
      setAllStudents(studRes.data);
      setAllSubjects(subRes.data);
      setAllTeachers(teachRes.data);
    };
    fetch();
  }, [id]);

  const handleEnroll = async () => {
    if (!enrollStudent) return;
    await axios.post(`/api/courses/${id}/enroll`, { student_id: parseInt(enrollStudent), year: course.year });
    showToast('Alumno matriculado');
    const { data } = await axios.get(`/api/courses/${id}`);
    setCourse(data);
    setShowEnroll(false);
    setEnrollStudent('');
  };

  const handleAddSubject = async () => {
    if (!subjectForm.subject_id) return;
    await axios.post(`/api/courses/${id}/subjects`, subjectForm);
    showToast('Asignatura agregada');
    const { data } = await axios.get(`/api/courses/${id}`);
    setCourse(data);
    setShowAddSubject(false);
  };

  if (!course) return <div className="loading-container"><div className="spinner" /></div>;

  const enrolledIds = course.students?.map(e => e.student_id) || [];
  const unenrolled = allStudents.filter(s => !enrolledIds.includes(s.id));

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link to="/courses" style={{ color: primary, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>← Volver a cursos</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 12 }}>
          <div>
            <h1 className="page-title">{course.name}</h1>
            <p className="page-subtitle">
              {course.head_teacher ? `👨‍🏫 Prof. Jefe: ${course.head_teacher.first_name} ${course.head_teacher.last_name}` : '👨‍🏫 Sin profesor jefe'} ·
              👥 {course.student_count} alumnos · 📚 {course.subjects?.length} asignaturas
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {[['students','👥 Alumnos'],['subjects','📖 Asignaturas']].map(([key, label]) => (
          <button key={key} className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {/* Alumnos */}
      {tab === 'students' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontWeight: 700, color: '#0f172a' }}>Alumnos matriculados ({course.students?.length})</h3>
            {canEdit && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowEnroll(true)} style={{ background: primary }}>
                ➕ Matricular
              </button>
            )}
          </div>
          {course.students?.length === 0 ? (
            <div className="illustration-area"><div className="illustration">👤</div><h3>Sin alumnos</h3><p>Matricula alumnos en este curso</p></div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead><tr><th>#</th><th>Alumno</th><th>RUT</th><th>Email</th><th>Acciones</th></tr></thead>
                <tbody>
                  {course.students?.map((e, i) => (
                    <tr key={e.id}>
                      <td style={{ color: '#94a3b8', fontWeight: 600 }}>{i + 1}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <UserAvatar
                            userId={e.student_id}
                            firstName={e.student?.first_name}
                            lastName={e.student?.last_name}
                            hasPhoto={e.student?.has_photo}
                            size={34}
                            color={avatarColor(e.student_id)}
                          />
                          <Link to={`/students/${e.student_id}/life`} style={{ fontWeight: 600, color: primary, textDecoration: 'none' }}
                            onMouseEnter={ev => ev.target.style.textDecoration='underline'}
                            onMouseLeave={ev => ev.target.style.textDecoration='none'}>
                            {e.student?.first_name} {e.student?.last_name}
                          </Link>
                        </div>
                      </td>
                      <td style={{ color: '#64748b' }}>{e.student?.rut || '—'}</td>
                      <td style={{ color: '#64748b' }}>{e.student?.email}</td>
                      <td>
                        <Link to={`/students/${e.student_id}/life`} className="btn btn-secondary btn-sm">📋 Hoja de vida</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Asignaturas */}
      {tab === 'subjects' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontWeight: 700, color: '#0f172a' }}>Asignaturas ({course.subjects?.length})</h3>
            {canEdit && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddSubject(true)} style={{ background: primary }}>
                ➕ Agregar asignatura
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {course.subjects?.map(cs => {
              const currInfo = buildCurriculumUrl(cs.subject?.name, course.level);
              return (
                <div key={cs.id} style={{
                  borderRadius: 12, border: `1.5px solid ${cs.subject?.color ? cs.subject.color + '40' : '#e2e8f0'}`,
                  background: '#fff', overflow: 'hidden',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                  transition: 'box-shadow 0.2s, transform 0.2s',
                }}>
                  {/* Franja de color */}
                  <div style={{ height: 5, background: cs.subject?.color || primary }} />

                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 9, background: (cs.subject?.color || primary) + '22',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                        {getSubjectEmoji(cs.subject?.name)}
                      </div>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', margin: 0 }}>{cs.subject?.name}</p>
                        {cs.subject?.code && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: cs.subject?.color || primary }}>
                            {cs.subject.code}
                          </span>
                        )}
                      </div>
                    </div>

                    <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>
                      👨‍🏫 {cs.teacher ? `${cs.teacher.first_name} ${cs.teacher.last_name}` : 'Sin profesor'}<br />
                      🕐 {cs.hours_per_week} hrs/semana
                    </p>

                    {/* Botón ficha del currículo */}
                    <Link
                      to={`/courses/${id}/subject/${cs.id}`}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '7px 0',
                        background: cs.subject?.color ? cs.subject.color + '15' : primary + '15',
                        color: cs.subject?.color || primary,
                        borderRadius: 8,
                        fontSize: 12, fontWeight: 700,
                        textDecoration: 'none',
                        border: `1px solid ${cs.subject?.color ? cs.subject.color + '30' : primary + '30'}`,
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = (cs.subject?.color || primary) + '28'}
                      onMouseLeave={e => e.currentTarget.style.background = (cs.subject?.color || primary) + '15'}
                    >
                      📋 Ver ficha
                      {currInfo && <span style={{ fontSize: 10, opacity: 0.7 }}>· Mineduc</span>}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal matricular */}
      {showEnroll && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowEnroll(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header"><h3>➕ Matricular alumno</h3><button className="modal-close" onClick={() => setShowEnroll(false)}>✕</button></div>
            <div className="modal-body">
              <div className="form-group">
                <label>Seleccionar alumno</label>
                <select value={enrollStudent} onChange={e => setEnrollStudent(e.target.value)}>
                  <option value="">Elegir alumno...</option>
                  {unenrolled.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name} — {s.rut || s.email}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowEnroll(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleEnroll} style={{ background: primary }}>Matricular</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal agregar asignatura */}
      {showAddSubject && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddSubject(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header"><h3>📖 Agregar asignatura</h3><button className="modal-close" onClick={() => setShowAddSubject(false)}>✕</button></div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label>Asignatura</label>
                  <select value={subjectForm.subject_id} onChange={e => setSubjectForm({...subjectForm, subject_id: e.target.value})}>
                    <option value="">Elegir...</option>
                    {allSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label>Profesor</label>
                  <select value={subjectForm.teacher_id} onChange={e => setSubjectForm({...subjectForm, teacher_id: e.target.value})}>
                    <option value="">Sin asignar</option>
                    {allTeachers.map(t => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Horas por semana</label>
                  <input type="number" min="1" max="20" value={subjectForm.hours_per_week}
                    onChange={e => setSubjectForm({...subjectForm, hours_per_week: +e.target.value})} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddSubject(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleAddSubject} style={{ background: primary }}>Agregar</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast-container"><div className={`toast toast-${toast.type}`}>{toast.msg}</div></div>}
    </div>
  );
}
