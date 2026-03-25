import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

const TYPES = { anual:'Anual', semestral:'Semestral', trimestral:'Trimestral', mensual:'Mensual' };
const EMPTY = { name:'', period_type:'semestral', year: new Date().getFullYear(), number:1, start_date:'', end_date:'', is_active:true };

export default function PeriodsPage() {
  const { school } = useAuth();
  const primary = school?.primary_color || '#2563EB';
  const [periods, setPeriods] = useState([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  const fetchPeriods = useCallback(async () => {
    const { data } = await axios.get(`/api/periods/?year=${year}`);
    setPeriods(data);
  }, [year]);

  useEffect(() => { fetchPeriods(); }, [fetchPeriods]);

  const openNew = () => { setForm({...EMPTY, year}); setEditing(null); setShowModal(true); };
  const openEdit = (p) => { setForm({...p, start_date: p.start_date||'', end_date: p.end_date||''}); setEditing(p); setShowModal(true); };

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editing) { await axios.put(`/api/periods/${editing.id}`, form); showToast('Período actualizado'); }
      else { await axios.post('/api/periods/', form); showToast('Período creado'); }
      setShowModal(false); fetchPeriods();
    } catch(err) { showToast(err.response?.data?.error||'Error','error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar período?')) return;
    await axios.delete(`/api/periods/${id}`);
    showToast('Período eliminado');
    fetchPeriods();
  };

  const years = [new Date().getFullYear()-1, new Date().getFullYear(), new Date().getFullYear()+1];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">📅 Períodos académicos</h1>
          <p className="page-subtitle">Configura los períodos del año escolar</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={year} onChange={e => setYear(+e.target.value)}
            style={{ padding: '9px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', fontFamily: 'inherit' }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="btn btn-primary" onClick={openNew} style={{ background: primary }}>＋ Nuevo período</button>
        </div>
      </div>

      {periods.length === 0 ? (
        <div className="card">
          <div className="illustration-area">
            <div className="illustration">📅</div>
            <h3>Sin períodos para {year}</h3>
            <p>Crea períodos para comenzar a registrar calificaciones</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {periods.map(p => (
            <div key={p.id} className="card" style={{ borderTop: `4px solid ${primary}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <h3 style={{ fontWeight: 700, color: '#0f172a', fontSize: '16px' }}>{p.name}</h3>
                  <span className={`badge ${p.is_active ? 'badge-active' : 'badge-inactive'}`} style={{ marginTop: 4 }}>
                    {p.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-secondary btn-sm btn-icon" onClick={() => openEdit(p)}>✏️</button>
                  <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(p.id)}>🗑️</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#64748b' }}>
                  <span>📋</span> <span>{TYPES[p.period_type]} — N° {p.number}</span>
                </div>
                {p.start_date && (
                  <div style={{ fontSize: 13, color: '#64748b', display: 'flex', gap: 8 }}>
                    <span>📆</span>
                    <span>{new Date(p.start_date + 'T12:00').toLocaleDateString('es-CL')} → {p.end_date ? new Date(p.end_date + 'T12:00').toLocaleDateString('es-CL') : '...'}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>{editing ? '✏️ Editar período' : '➕ Nuevo período'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label>Nombre del período *</label>
                    <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="1er Semestre 2026" />
                  </div>
                  <div className="form-group">
                    <label>Tipo *</label>
                    <select value={form.period_type} onChange={e => setForm({...form, period_type: e.target.value})}>
                      {Object.entries(TYPES).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Año *</label>
                    <input type="number" value={form.year} onChange={e => setForm({...form, year: +e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>Número</label>
                    <input type="number" min="1" value={form.number} onChange={e => setForm({...form, number: +e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>Inicio</label>
                    <input type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>Fin</label>
                    <input type="date" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})} />
                  </div>
                  <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <input type="checkbox" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} style={{ width: 18, height: 18 }} />
                    <label style={{ margin: 0 }}>Período activo</label>
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
