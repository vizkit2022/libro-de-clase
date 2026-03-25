import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

const COLORS = ['#EF4444','#F97316','#EAB308','#22C55E','#06B6D4','#3B82F6','#8B5CF6','#EC4899','#10B981','#6366F1'];
const EMPTY = { name:'', code:'', ministry_code:'', description:'', color:'#6366F1' };

export default function SubjectsPage() {
  const { school, user } = useAuth();
  const primary = school?.primary_color || '#2563EB';
  const [subjects, setSubjects] = useState([]);
  const [ministry, setMinistry] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const canEdit = ['admin','directivo'].includes(user?.role);
  const showToast = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  const fetchData = useCallback(async () => {
    const [subRes, minRes] = await Promise.all([
      axios.get('/api/subjects/'),
      axios.get('/api/subjects/ministry')
    ]);
    setSubjects(subRes.data);
    setMinistry(minRes.data);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editing) { await axios.put(`/api/subjects/${editing.id}`, form); showToast('Asignatura actualizada'); }
      else { await axios.post('/api/subjects/', form); showToast('Asignatura creada'); }
      setShowModal(false); fetchData();
    } catch(err) { showToast(err.response?.data?.error||'Error','error'); }
    finally { setSaving(false); }
  };

  const fillFromMinistry = (m) => { setForm({...EMPTY, name: m.name, code: m.code, ministry_code: m.code}); };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">📖 Asignaturas</h1>
          <p className="page-subtitle">{subjects.length} asignaturas configuradas</p>
        </div>
        {canEdit && <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setEditing(null); setShowModal(true); }} style={{ background: primary }}>＋ Nueva asignatura</button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Asignaturas del colegio */}
        <div className="card">
          <h3 style={{ fontWeight: 700, marginBottom: 16 }}>Asignaturas del colegio</h3>
          {subjects.length === 0 ? (
            <div className="illustration-area"><div className="illustration">📖</div><h3>Sin asignaturas</h3></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {subjects.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: '#f8fafc' }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</p>
                    <p style={{ fontSize: 11, color: '#64748b' }}>{s.code}{s.ministry_code ? ` · Min: ${s.ministry_code}` : ''}</p>
                  </div>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-secondary btn-sm btn-icon" onClick={() => { setForm({...s}); setEditing(s); setShowModal(true); }}>✏️</button>
                      <button className="btn btn-danger btn-sm btn-icon" onClick={async () => { await axios.delete(`/api/subjects/${s.id}`); fetchData(); }}>🗑️</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Asignaturas ministerio */}
        <div className="card">
          <h3 style={{ fontWeight: 700, marginBottom: 4 }}>Asignaturas del Ministerio</h3>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>Haz clic para agregar al colegio</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ministry.map((m, i) => {
              const exists = subjects.some(s => s.ministry_code === m.code);
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '8px 12px', borderRadius: 8, cursor: exists ? 'default' : 'pointer',
                  background: exists ? '#f0fdf4' : '#f8fafc',
                  border: `1px solid ${exists ? '#bbf7d0' : '#e2e8f0'}`,
                  opacity: exists ? 0.7 : 1
                }}
                onClick={() => { if (!exists && canEdit) { fillFromMinistry(m); setEditing(null); setShowModal(true); } }}>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: '#64748b', width: 32 }}>{m.code}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{m.name}</span>
                  {exists ? <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>✓ Agregada</span>
                           : canEdit ? <span style={{ fontSize: 11, color: primary, fontWeight: 600 }}>+ Agregar</span> : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>{editing ? '✏️ Editar asignatura' : '➕ Nueva asignatura'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label>Nombre *</label>
                    <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Matemática" />
                  </div>
                  <div className="form-group">
                    <label>Código</label>
                    <input value={form.code} onChange={e => setForm({...form, code: e.target.value})} placeholder="MAT" />
                  </div>
                  <div className="form-group">
                    <label>Código Ministerio</label>
                    <input value={form.ministry_code} onChange={e => setForm({...form, ministry_code: e.target.value})} placeholder="MAT" />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label>Color identificador</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {COLORS.map(c => (
                        <button type="button" key={c} onClick={() => setForm({...form, color: c})}
                          style={{ width: 32, height: 32, borderRadius: 8, background: c, border: form.color === c ? '3px solid #0f172a' : '2px solid transparent', cursor: 'pointer' }} />
                      ))}
                    </div>
                  </div>
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label>Descripción</label>
                    <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2} placeholder="Descripción opcional..." />
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
