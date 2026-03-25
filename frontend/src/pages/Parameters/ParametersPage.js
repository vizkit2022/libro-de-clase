import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

export default function ParametersPage() {
  const { school, updateSchool } = useAuth();
  const [form, setForm] = useState(school || {});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await axios.put(`/api/schools/${school.id}`, form);
      updateSchool(data);
      showToast('✅ Datos del colegio actualizados');
    } catch {
      showToast('Error al guardar', 'error');
    } finally { setSaving(false); }
  };

  const primaryColor = form.primary_color || '#2563EB';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">🏫 Parámetros del Colegio</h1>
          <p className="page-subtitle">Configuración general e identidad visual</p>
        </div>
      </div>

      <form onSubmit={handleSave}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

          {/* Datos del colegio */}
          <div className="card" style={{ gridColumn: '1/-1' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px', color: '#0f172a' }}>📋 Información institucional</h3>
            <div className="form-grid">
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label>Nombre del colegio *</label>
                <input required value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} placeholder="Colegio San Patricio" />
              </div>
              <div className="form-group">
                <label>RUT del colegio</label>
                <input value={form.rut || ''} onChange={e => setForm({...form, rut: e.target.value})} placeholder="12.345.678-9" />
              </div>
              <div className="form-group">
                <label>Rector/a</label>
                <input value={form.rector || ''} onChange={e => setForm({...form, rector: e.target.value})} placeholder="Carmen González" />
              </div>
              <div className="form-group">
                <label>Teléfono</label>
                <input value={form.phone || ''} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+56 2 1234 5678" />
              </div>
              <div className="form-group">
                <label>Email institucional</label>
                <input type="email" value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} placeholder="contacto@colegio.cl" />
              </div>
              <div className="form-group">
                <label>Sitio web</label>
                <input value={form.website || ''} onChange={e => setForm({...form, website: e.target.value})} placeholder="www.colegio.cl" />
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label>Dirección</label>
                <input value={form.address || ''} onChange={e => setForm({...form, address: e.target.value})} placeholder="Av. Principal 1234, Santiago" />
              </div>
            </div>
          </div>

          {/* Identidad visual */}
          <div className="card">
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px', color: '#0f172a' }}>🎨 Identidad visual</h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
              Define los colores que identifican a tu colegio en la plataforma.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[
                { key: 'primary_color', label: 'Color primario', desc: 'Sidebar, botones principales' },
                { key: 'secondary_color', label: 'Color secundario', desc: 'Degradados, acentos' },
                { key: 'accent_color', label: 'Color de acento', desc: 'Detalles, highlights' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="form-group">
                  <label>{label}</label>
                  <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '-4px' }}>{desc}</p>
                  <div className="color-picker-row">
                    <input
                      type="color"
                      value={form[key] || '#2563EB'}
                      onChange={e => setForm({...form, [key]: e.target.value})}
                      className="color-swatch"
                      style={{ width: 48, height: 42, cursor: 'pointer', padding: 2 }}
                    />
                    <input
                      value={form[key] || ''}
                      onChange={e => setForm({...form, [key]: e.target.value})}
                      placeholder="#2563EB"
                      style={{ flex: 1, padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontFamily: 'monospace', fontSize: '14px' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="card">
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px', color: '#0f172a' }}>👁️ Vista previa</h3>
            <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
              {/* Sidebar mini */}
              <div style={{ background: form.primary_color || '#2563EB', padding: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: 36, height: 36, borderRadius: '8px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '16px' }}>
                  {form.name?.[0] || 'C'}
                </div>
                <div>
                  <p style={{ color: 'white', fontWeight: 700, fontSize: '13px' }}>{form.name || 'Mi Colegio'}</p>
                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px' }}>Administrador</p>
                </div>
              </div>
              {/* Content mini */}
              <div style={{ padding: '16px', background: '#f8fafc' }}>
                <div style={{ background: 'white', borderRadius: '8px', padding: '12px', marginBottom: '8px' }}>
                  <div style={{ height: 10, background: form.primary_color || '#2563EB', borderRadius: 4, width: '60%', marginBottom: 6 }} />
                  <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, width: '80%' }} />
                </div>
                <div style={{ background: form.primary_color || '#2563EB', borderRadius: '8px', padding: '10px 14px', color: 'white', fontSize: '12px', fontWeight: 600 }}>
                  Botón principal
                </div>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '16px' }}>
              <label>URL del logo</label>
              <input value={form.logo_url || ''} onChange={e => setForm({...form, logo_url: e.target.value})} placeholder="https://..." />
              {form.logo_url && (
                <img src={form.logo_url} alt="logo" style={{ width: 60, height: 60, objectFit: 'contain', borderRadius: 8, border: '1px solid #e2e8f0', marginTop: 8 }} onError={e => e.target.style.display='none'} />
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ background: primaryColor, minWidth: 160 }}>
            {saving ? '⏳ Guardando...' : '💾 Guardar cambios'}
          </button>
        </div>
      </form>

      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  );
}
