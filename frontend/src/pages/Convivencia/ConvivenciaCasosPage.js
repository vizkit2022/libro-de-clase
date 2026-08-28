import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';

// ── Helpers ──────────────────────────────────────────────────────────

const CRITICALITY_STYLE = {
  alta:  { bg: '#fef2f2', color: '#dc2626', dot: '#dc2626' },
  media: { bg: '#fef3c7', color: '#d97706', dot: '#f59e0b' },
  baja:  { bg: '#f1f5f9', color: '#64748b', dot: '#94a3b8' },
};

const STATUS_STYLE = {
  abierto: { bg: '#fef3c7', color: '#92400e' },
  cerrado: { bg: '#d1fae5', color: '#065f46' },
};

function CritDot({ level }) {
  const s = CRITICALITY_STYLE[level] || CRITICALITY_STYLE.baja;
  return (
    <span style={{
      display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
      background: s.dot, flexShrink: 0
    }} title={level} />
  );
}

function ProtocolProgress({ done, total }) {
  const pct = total ? (done / total) * 100 : 0;
  const color = pct === 100 ? '#10b981' : pct > 50 ? '#3b82f6' : '#f59e0b';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 700, whiteSpace: 'nowrap' }}>{done}/{total}</span>
    </div>
  );
}

// ── Lista de casos ────────────────────────────────────────────────────

export default function ConvivenciaCasosPage() {
  const { school } = useAuth();
  const primary = school?.primary_color || '#2563EB';
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const fetch = useCallback(() => {
    setLoading(true);
    const params = statusFilter !== 'all' ? `&status=${statusFilter}` : '';
    axios.get(`/api/convivencia/cases?year=${new Date().getFullYear()}${params}`)
      .then(r => setCases(r.data))
      .catch(() => setCases([]))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { fetch(); }, [fetch]);

  const filtered = cases.filter(c => {
    const term = search.toLowerCase();
    return !term || [c.title, c.student?.first_name, c.student?.last_name,
      c.professional?.first_name, c.procedure, c.typification]
      .some(v => v && v.toLowerCase().includes(term));
  });

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">📋 Gestión de Casos</h1>
          <p className="page-subtitle">{filtered.length} caso{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/convivencia" style={{
            padding: '9px 18px', background: '#f1f5f9', color: '#475569',
            borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none'
          }}>
            📊 Dashboard
          </Link>
          <Link to="/convivencia/casos/nuevo" style={{
            padding: '9px 20px', background: primary, color: '#fff',
            borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none'
          }}>
            + Crear nuevo caso
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <div className="card" style={{ marginBottom: 16, padding: '12px 20px' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="tabs" style={{ margin: 0 }}>
            {['all','abierto','cerrado'].map(s => (
              <button key={s} className={`tab ${statusFilter === s ? 'active' : ''}`}
                onClick={() => setStatusFilter(s)}
                style={statusFilter === s ? { background: primary, color: '#fff' } : {}}>
                {s === 'all' ? 'Todos' : s === 'abierto' ? '🔓 Abiertos' : '✅ Cerrados'}
              </button>
            ))}
          </div>
          <div className="search-bar" style={{ marginLeft: 'auto' }}>
            <span>🔍</span>
            <input placeholder="Buscar por título, alumno, profesional..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="loading-container"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="illustration-area">
            <div className="illustration">📂</div>
            <h3>No hay casos registrados</h3>
            <p>Haz clic en "+ Crear nuevo caso" para comenzar.</p>
            <Link to="/convivencia/casos/nuevo" style={{
              display: 'inline-block', marginTop: 8,
              padding: '9px 20px', background: primary, color: '#fff',
              borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none'
            }}>+ Crear primer caso</Link>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Título del caso</th>
                  <th>Procedimiento</th>
                  <th>Alumno</th>
                  <th>Responsable</th>
                  <th>Protocolo</th>
                  <th>Crit.</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const cs = CRITICALITY_STYLE[c.criticality] || CRITICALITY_STYLE.baja;
                  const ss = STATUS_STYLE[c.status] || STATUS_STYLE.abierto;
                  return (
                    <tr key={c.id} style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/convivencia/casos/${c.id}`)}>
                      <td style={{ fontWeight: 700, color: primary, fontSize: 13 }}>
                        #{String(c.case_number).padStart(2, '0')}
                      </td>
                      <td style={{ maxWidth: 220 }}>
                        <p style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', margin: 0,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.title}
                        </p>
                        {c.typification && (
                          <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>{c.typification}</p>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: '#475569' }}>{c.procedure || '—'}</td>
                      <td style={{ fontSize: 12, color: '#475569' }}>
                        {c.student ? `${c.student.first_name} ${c.student.last_name}` : '—'}
                        {c.course_name && <span style={{ color: '#94a3b8', marginLeft: 4 }}>({c.course_name})</span>}
                      </td>
                      <td style={{ fontSize: 12, color: '#475569' }}>
                        {c.professional ? `${c.professional.first_name} ${c.professional.last_name}` : '—'}
                      </td>
                      <td style={{ minWidth: 110 }}>
                        <ProtocolProgress done={c.steps_completed} total={c.steps_total} />
                      </td>
                      <td><CritDot level={c.criticality} /></td>
                      <td>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px',
                          borderRadius: 20, background: ss.bg, color: ss.color }}>
                          {c.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
                        {c.date ? new Date(c.date + 'T00:00:00').toLocaleDateString('es-CL') : '—'}
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
  );
}

// ── Formulario Nuevo / Editar caso ───────────────────────────────────

export function ConvivenciaCasoForm() {
  const { school } = useAuth();
  const primary = school?.primary_color || '#2563EB';
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const isEdit = Boolean(id);

  // Pre-relleno desde extracción IA (viene via navigate state)
  const prefill = location.state?.prefill || {};

  const [form, setForm] = useState({
    title: prefill.title || '',
    date: prefill.date || new Date().toISOString().split('T')[0],
    procedure: prefill.procedure || '',
    typification: prefill.typification || '',
    motive: prefill.motive || '',
    agreements: prefill.agreements || '',
    status: 'abierto',
    criticality: prefill.criticality || 'media',
    student_id: '', professional_id: '', course_id: '',
  });
  const [catalogs, setCatalogs] = useState({ procedures: [], typifications: [] });
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      axios.get('/api/convivencia/catalogs'),
      axios.get('/api/users/?role=alumno'),
      axios.get('/api/users/?role=profesor'),
      axios.get('/api/courses/'),
    ]).then(([cat, stu, tea, cou]) => {
      setCatalogs(cat.data);
      setStudents(stu.data);
      setTeachers(tea.data);
      setCourses(cou.data);
    });
    if (isEdit) {
      axios.get(`/api/convivencia/cases/${id}`).then(r => {
        const c = r.data;
        setForm({
          title: c.title || '', date: c.date || '',
          procedure: c.procedure || '', typification: c.typification || '',
          motive: c.motive || '', agreements: c.agreements || '',
          status: c.status || 'abierto', criticality: c.criticality || 'media',
          student_id: c.student_id || '', professional_id: c.professional_id || '',
          course_id: c.course_id || '',
        });
      });
    }
  }, [id, isEdit]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const payload = {
        ...form,
        student_id: form.student_id || null,
        professional_id: form.professional_id || null,
        course_id: form.course_id || null,
      };
      if (isEdit) {
        await axios.put(`/api/convivencia/cases/${id}`, payload);
      } else {
        const r = await axios.post('/api/convivencia/cases', payload);
        navigate(`/convivencia/casos/${r.data.id}`);
        return;
      }
      navigate(`/convivencia/casos/${id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar');
    } finally { setSaving(false); }
  };

  const f = (field, val) => setForm(prev => ({ ...prev, [field]: val }));

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title">{isEdit ? '✏️ Editar caso' : '➕ Nuevo caso'}</h1>
          <p className="page-subtitle">Convivencia Escolar</p>
        </div>
        <button onClick={() => navigate(-1)} style={{
          padding: '9px 18px', background: '#f1f5f9', color: '#475569',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer'
        }}>← Volver</button>
      </div>

      {prefill.title && (
        <div style={{ background: '#f3e8ff', border: '1px solid #c4b5fd', borderRadius: 8,
          padding: '10px 16px', marginBottom: 16, color: '#6d28d9', fontSize: 13, fontWeight: 500 }}>
          ✨ Datos pre-rellenados por IA — revisa y completa antes de guardar
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
          padding: '12px 16px', marginBottom: 16, color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontWeight: 700, fontSize: 14, color: '#64748b', margin: '0 0 16px',
            textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Información del caso
          </h3>
          <div className="form-grid">
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label>Título del caso *</label>
              <input required value={form.title} onChange={e => f('title', e.target.value)}
                placeholder="Ej: Alumno interrumpe constantemente las clases" />
            </div>
            <div className="form-group">
              <label>Fecha *</label>
              <input type="date" required value={form.date} onChange={e => f('date', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Estado</label>
              <select value={form.status} onChange={e => f('status', e.target.value)}>
                <option value="abierto">Abierto</option>
                <option value="cerrado">Cerrado</option>
              </select>
            </div>
            <div className="form-group">
              <label>Procedimiento</label>
              <select value={form.procedure} onChange={e => f('procedure', e.target.value)}>
                <option value="">Sin especificar</option>
                {catalogs.procedures.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Tipificación</label>
              <select value={form.typification} onChange={e => f('typification', e.target.value)}>
                <option value="">Sin tipificación</option>
                {catalogs.typifications.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Criticidad</label>
              <select value={form.criticality} onChange={e => f('criticality', e.target.value)}>
                <option value="baja">🔘 Baja</option>
                <option value="media">🟡 Media</option>
                <option value="alta">🔴 Alta</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontWeight: 700, fontSize: 14, color: '#64748b', margin: '0 0 16px',
            textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Involucrados
          </h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Alumno involucrado</label>
              <select value={form.student_id} onChange={e => f('student_id', e.target.value)}>
                <option value="">— Sin especificar —</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.last_name}, {s.first_name} {s.rut ? `· ${s.rut}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Curso</label>
              <select value={form.course_id} onChange={e => f('course_id', e.target.value)}>
                <option value="">— Sin especificar —</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label>Profesional responsable</label>
              <select value={form.professional_id} onChange={e => f('professional_id', e.target.value)}>
                <option value="">— Sin asignar —</option>
                {teachers.map(t => (
                  <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ fontWeight: 700, fontSize: 14, color: '#64748b', margin: '0 0 16px',
            textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Descripción y acuerdos
          </h3>
          <div className="form-grid">
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label>Motivo / Descripción del caso</label>
              <textarea rows={4} value={form.motive} onChange={e => f('motive', e.target.value)}
                placeholder="Describe el motivo o situación detectada..."
                style={{ resize: 'vertical' }} />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label>Acuerdos y compromisos</label>
              <textarea rows={3} value={form.agreements} onChange={e => f('agreements', e.target.value)}
                placeholder="Acuerdos tomados, compromisos adquiridos..."
                style={{ resize: 'vertical' }} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" onClick={() => navigate(-1)} style={{
            padding: '10px 24px', background: '#f1f5f9', color: '#475569',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer'
          }}>Cancelar</button>
          <button type="submit" disabled={saving} style={{
            padding: '10px 28px', background: primary, color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
            opacity: saving ? 0.7 : 1
          }}>
            {saving ? 'Guardando...' : isEdit ? 'Actualizar caso' : 'Crear caso'}
          </button>
        </div>
      </form>
    </div>
  );
}
