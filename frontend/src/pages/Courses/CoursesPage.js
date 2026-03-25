import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const EMPTY = { name:'', level:'', letter:'', year: new Date().getFullYear(), head_teacher_id:'', description:'' };

export default function CoursesPage() {
  const { school, user } = useAuth();
  const primary = school?.primary_color || '#2563EB';
  const [courses, setCourses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const canEdit = ['admin','directivo'].includes(user?.role);

  const showToast = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  const fetchData = useCallback(async () => {
    const [courseRes, teacherRes] = await Promise.all([
      axios.get(`/api/courses/?year=${year}`),
      axios.get('/api/users/?role=profesor')
    ]);
    setCourses(courseRes.data);
    setTeachers(teacherRes.data);
  }, [year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = {...form, year, head_teacher_id: form.head_teacher_id || null};
      if (editing) { await axios.put(`/api/courses/${editing.id}`, payload); showToast('Curso actualizado'); }
      else { await axios.post('/api/courses/', payload); showToast('Curso creado'); }
      setShowModal(false); fetchData();
    } catch(err) { showToast(err.response?.data?.error||'Error','error'); }
    finally { setSaving(false); }
  };

  const levelColors = {
    'Pre-Kinder':'#fce7f3', 'Kinder':'#fce7f3',
    '1° Básico':'#fef9c3', '2° Básico':'#fef9c3', '3° Básico':'#fef9c3',
    '4° Básico':'#dcfce7', '5° Básico':'#dcfce7', '6° Básico':'#dcfce7',
    '7° Básico':'#dbeafe', '8° Básico':'#dbeafe',
    '1° Medio':'#ede9fe', '2° Medio':'#ede9fe', '3° Medio':'#ede9fe', '4° Medio':'#ede9fe',
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">📚 Cursos</h1>
          <p className="page-subtitle">{courses.length} cursos en {year}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <select value={year} onChange={e => setYear(+e.target.value)}
            style={{ padding: '9px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }}>
            {[year-1, year, year+1].map(y => <option key={y}>{y}</option>)}
          </select>
          {canEdit && <button className="btn btn-primary" onClick={() => { setForm({...EMPTY, year}); setEditing(null); setShowModal(true); }} style={{ background: primary }}>＋ Nuevo curso</button>}
        </div>
      </div>

      {courses.length === 0 ? (
        <div className="card"><div className="illustration-area"><div className="illustration">📚</div><h3>Sin cursos</h3><p>Crea el primer curso para este año</p></div></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
          {courses.map(c => (
            <Link key={c.id} to={`/courses/${c.id}`} style={{ textDecoration: 'none' }}>
              <div className="card" style={{ cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s', borderTop: `4px solid ${primary}` }}
                onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 8px 24px rgba(0,0,0,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: levelColors[c.level] || '#f1f5f9',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>📚</div>
                  {canEdit && (
                    <button className="btn btn-secondary btn-sm btn-icon"
                      onClick={e => { e.preventDefault(); setForm({...c, head_teacher_id: c.head_teacher_id||''}); setEditing(c); setShowModal(true); }}>✏️</button>
                  )}
                </div>
                <h3 style={{ fontWeight: 700, color: '#0f172a', fontSize: '18px', marginBottom: 4 }}>{c.name}</h3>
                <p style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>{c.description || c.level}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ background: '#f1f5f9', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: '#475569' }}>
                    👥 {c.student_count} alumnos
                  </span>
                  {c.head_teacher && (
                    <span style={{ background: '#dbeafe', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: '#1d4ed8' }}>
                      👨‍🏫 {c.head_teacher.first_name} {c.head_teacher.last_name[0]}.
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3>{editing ? '✏️ Editar curso' : '➕ Nuevo curso'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label>Nombre del curso *</label>
                    <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="5° Básico A" />
                  </div>
                  <div className="form-group">
                    <label>Nivel</label>
                    <select value={form.level} onChange={e => setForm({...form, level: e.target.value})}>
                      <option value="">Seleccionar...</option>
                      {['Pre-Kinder','Kinder','1° Básico','2° Básico','3° Básico','4° Básico',
                        '5° Básico','6° Básico','7° Básico','8° Básico',
                        '1° Medio','2° Medio','3° Medio','4° Medio'].map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Letra</label>
                    <select value={form.letter} onChange={e => setForm({...form, letter: e.target.value})}>
                      <option value="">Sin letra</option>
                      {['A','B','C','D','E'].map(l => <option key={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Año</label>
                    <input type="number" value={form.year} onChange={e => setForm({...form, year: +e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>Profesor jefe</label>
                    <select value={form.head_teacher_id} onChange={e => setForm({...form, head_teacher_id: e.target.value})}>
                      <option value="">Sin asignar</option>
                      {teachers.map(t => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label>Descripción</label>
                    <input value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Descripción opcional..." />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ background: primary }}>
                  {saving ? 'Guardando...' : 'Guardar'}
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
