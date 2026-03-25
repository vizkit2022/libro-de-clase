import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import { PlanBadge } from './SuperAdminDashboard';

// ── Lista de Colegios ─────────────────────────────────────────────────────────
export default function SchoolsManagementPage() {
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const load = useCallback(() => {
    axios.get('/api/super-admin/schools')
      .then(r => setSchools(r.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = schools.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.rut || '').includes(search) ||
    (s.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleToggle = async (id) => {
    await axios.post(`/api/super-admin/schools/${id}/toggle-active`);
    load();
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>🏫 Gestión de Colegios</h1>
          <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 14 }}>{schools.length} colegios registrados</p>
        </div>
        <button
          onClick={() => navigate('/super-admin/schools/new')}
          style={{
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', border: 'none', borderRadius: 12,
            padding: '11px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}
        >+ Nuevo Colegio</button>
      </div>

      <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
        <input
          type="text" placeholder="🔍 Buscar por nombre, RUT o email..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '10px 16px', borderRadius: 10, border: '1px solid #e2e8f0',
            fontSize: 14, marginBottom: 20, boxSizing: 'border-box', outline: 'none',
          }}
        />

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Cargando...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                {['Colegio', 'RUT', 'Plan', 'Vence', 'Estado', 'Usuarios', 'Acciones'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '13px 12px' }}>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>{s.email}</div>
                  </td>
                  <td style={{ padding: '13px 12px', color: '#64748b', fontSize: 12 }}>{s.rut || '-'}</td>
                  <td style={{ padding: '13px 12px' }}><PlanBadge plan={s.plan} /></td>
                  <td style={{ padding: '13px 12px', fontSize: 12, color: '#64748b' }}>
                    {s.subscription_expires_at
                      ? new Date(s.subscription_expires_at).toLocaleDateString('es-CL')
                      : s.plan === 'free' ? '∞' : '-'}
                  </td>
                  <td style={{ padding: '13px 12px' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: s.is_active ? '#dcfce7' : '#fee2e2',
                      color: s.is_active ? '#166534' : '#991b1b',
                    }}>{s.is_active ? 'Activo' : 'Inactivo'}</span>
                  </td>
                  <td style={{ padding: '13px 12px', color: '#64748b' }}>{s.user_count || 0}</td>
                  <td style={{ padding: '13px 12px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => navigate(`/super-admin/schools/${s.id}`)}
                        style={{ padding: '5px 12px', background: '#eff6ff', color: '#1d4ed8', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                      >Ver</button>
                      <button
                        onClick={() => handleToggle(s.id)}
                        style={{
                          padding: '5px 12px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                          background: s.is_active ? '#fee2e2' : '#dcfce7',
                          color: s.is_active ? '#dc2626' : '#16a34a',
                        }}
                      >{s.is_active ? 'Desactivar' : 'Activar'}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>No hay colegios que coincidan</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Formulario: Nuevo / Editar Colegio ────────────────────────────────────────
export function SchoolFormPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', rut: '', address: '', phone: '', email: '', website: '',
    rector: '', plan: 'free',
    primary_color: '#2563EB', secondary_color: '#1E40AF', accent_color: '#3B82F6',
    admin_email: '', admin_first_name: '', admin_last_name: '', admin_password: 'colegio123',
  });

  useEffect(() => {
    if (!isNew) {
      axios.get(`/api/super-admin/schools/${id}`)
        .then(r => setForm(prev => ({ ...prev, ...r.data })))
        .catch(() => navigate('/super-admin/schools'));
    }
  }, [id, isNew, navigate]);

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      if (isNew) {
        await axios.post('/api/super-admin/schools', form);
        navigate('/super-admin/schools');
      } else {
        await axios.put(`/api/super-admin/schools/${id}`, form);
        navigate(`/super-admin/schools/${id}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ label, field, type = 'text', placeholder = '' }) => (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>{label}</label>
      <input
        type={type} value={form[field] || ''} placeholder={placeholder}
        onChange={e => handleChange(field, e.target.value)}
        style={{ width: '100%', padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
      />
    </div>
  );

  return (
    <div style={{ padding: 32, maxWidth: 800 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <button onClick={() => navigate('/super-admin/schools')}
          style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 10, padding: '7px 14px', cursor: 'pointer', color: '#64748b', fontSize: 13 }}>
          ← Volver
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: 0 }}>
          {isNew ? '+ Nuevo Colegio' : `✏️ Editar: ${form.name}`}
        </h1>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 12, marginBottom: 20, fontSize: 14 }}>
          ⚠️ {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Info del colegio */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 20px' }}>🏫 Información del Colegio</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
            <div style={{ gridColumn: '1/-1' }}><Field label="Nombre *" field="name" placeholder="Colegio San Patricio" /></div>
            <Field label="RUT" field="rut" placeholder="12.345.678-9" />
            <Field label="Email" field="email" type="email" placeholder="contacto@colegio.cl" />
            <Field label="Teléfono" field="phone" placeholder="+56 2 2345 6789" />
            <Field label="Sitio Web" field="website" placeholder="https://www.colegio.cl" />
            <div style={{ gridColumn: '1/-1' }}><Field label="Dirección" field="address" placeholder="Av. Principal 1234, Santiago" /></div>
            <div style={{ gridColumn: '1/-1' }}><Field label="Rector/a" field="rector" placeholder="Nombre del rector" /></div>
          </div>

          {/* Plan */}
          <div style={{ marginTop: 8 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Plan del Colegio</label>
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { value: 'free', label: '🆓 Gratuito', desc: 'Sin costo', bg: '#eff6ff', border: '#3b82f6', color: '#1e40af' },
                { value: 'paid', label: '💎 De Pago', desc: '$29.990 / mes', bg: '#fffbeb', border: '#f59e0b', color: '#92400e' },
              ].map(opt => (
                <label key={opt.value} style={{
                  flex: 1, padding: '14px 18px', borderRadius: 12, cursor: 'pointer',
                  border: `2px solid ${form.plan === opt.value ? opt.border : '#e2e8f0'}`,
                  background: form.plan === opt.value ? opt.bg : '#fff',
                  transition: 'all 0.15s',
                }}>
                  <input type="radio" name="plan" value={opt.value} checked={form.plan === opt.value}
                    onChange={() => handleChange('plan', opt.value)} style={{ display: 'none' }} />
                  <div style={{ fontWeight: 700, color: form.plan === opt.value ? opt.color : '#374151', fontSize: 15 }}>{opt.label}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{opt.desc}</div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Admin inicial (solo al crear) */}
        {isNew && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>👤 Administrador Inicial (opcional)</h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>Crea el primer usuario admin del colegio</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
              <div style={{ gridColumn: '1/-1' }}><Field label="Email del Admin" field="admin_email" type="email" placeholder="admin@colegio.cl" /></div>
              <Field label="Nombre" field="admin_first_name" placeholder="Juan" />
              <Field label="Apellido" field="admin_last_name" placeholder="González" />
              <Field label="Contraseña inicial" field="admin_password" placeholder="colegio123" />
            </div>
          </div>
        )}

        {/* Colores */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 20px' }}>🎨 Colores del Colegio</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[
              { label: 'Color Principal', field: 'primary_color' },
              { label: 'Color Secundario', field: 'secondary_color' },
              { label: 'Color Acento', field: 'accent_color' },
            ].map(c => (
              <div key={c.field}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{c.label}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="color" value={form[c.field] || '#2563EB'}
                    onChange={e => handleChange(c.field, e.target.value)}
                    style={{ width: 40, height: 40, border: 'none', borderRadius: 8, cursor: 'pointer' }} />
                  <span style={{ fontSize: 13, color: '#64748b' }}>{form[c.field]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button type="submit" disabled={saving} style={{
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          color: '#fff', border: 'none', borderRadius: 12,
          padding: '13px 28px', fontWeight: 700, fontSize: 15, cursor: 'pointer',
          opacity: saving ? 0.7 : 1, width: '100%',
        }}>
          {saving ? 'Guardando...' : isNew ? '✅ Crear Colegio' : '✅ Guardar Cambios'}
        </button>
      </form>
    </div>
  );
}

// ── Detalle de un Colegio ─────────────────────────────────────────────────────
export function SchoolDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [school, setSchool] = useState(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [simMonths, setSimMonths] = useState(1);
  const [simEmail, setSimEmail] = useState('');
  const [message, setMessage] = useState('');
  const MP_CONFIGURED = false; // En local, false hasta que configures MP_ACCESS_TOKEN

  const load = useCallback(() => {
    axios.get(`/api/super-admin/schools/${id}`)
      .then(r => setSchool(r.data))
      .catch(() => navigate('/super-admin/schools'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  const handleSetPlan = async (plan) => {
    await axios.post(`/api/super-admin/schools/${id}/set-plan`, { plan, months: 1 });
    setMessage(plan === 'paid' ? '✅ Plan cambiado a De Pago' : '✅ Plan cambiado a Gratuito');
    load();
    setTimeout(() => setMessage(''), 3000);
  };

  const handleSimulate = async () => {
    setSimulating(true);
    try {
      const res = await axios.post(`/api/payments/subscriptions/${id}/simulate-payment`, {
        months: simMonths,
        payer_email: simEmail || 'test@colegio.cl'
      });
      setMessage('✅ Pago simulado exitosamente');
      load();
    } catch (err) {
      setMessage('❌ ' + (err.response?.data?.error || 'Error al simular'));
    } finally {
      setSimulating(false);
      setTimeout(() => setMessage(''), 4000);
    }
  };

  const handleMPSubscription = async () => {
    try {
      const res = await axios.post('/api/payments/subscriptions/create', {
        school_id: parseInt(id),
        payer_email: simEmail || school.email || '',
      });
      // Redirigir al checkout de Mercado Pago
      const url = res.data.sandbox_init_point || res.data.init_point;
      window.open(url, '_blank');
    } catch (err) {
      setMessage('❌ ' + (err.response?.data?.error || 'Error al crear suscripción MP'));
      setTimeout(() => setMessage(''), 4000);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Cargando...</div>;
  if (!school) return null;

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <button onClick={() => navigate('/super-admin/schools')}
          style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 10, padding: '7px 14px', cursor: 'pointer', color: '#64748b', fontSize: 13 }}>
          ← Volver
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: 0 }}>🏫 {school.name}</h1>
        <PlanBadge plan={school.plan} />
      </div>

      {message && (
        <div style={{ background: message.startsWith('✅') ? '#dcfce7' : '#fee2e2', color: message.startsWith('✅') ? '#166534' : '#dc2626', padding: '12px 16px', borderRadius: 12, marginBottom: 20, fontSize: 14 }}>
          {message}
        </div>
      )}

      {/* Info básica */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#64748b', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: 1 }}>Información</h3>
          {[['RUT', school.rut], ['Email', school.email], ['Teléfono', school.phone], ['Rector/a', school.rector], ['Dirección', school.address]].map(([k, v]) => (
            v ? <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 10, fontSize: 14 }}>
              <span style={{ color: '#94a3b8', minWidth: 80 }}>{k}:</span>
              <span style={{ color: '#374151', fontWeight: 500 }}>{v}</span>
            </div> : null
          ))}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, fontSize: 14 }}>
            <span style={{ color: '#94a3b8', minWidth: 80 }}>Usuarios:</span>
            <span style={{ color: '#374151', fontWeight: 500 }}>{school.user_count || 0}</span>
          </div>
        </div>

        {/* Estado del plan */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#64748b', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: 1 }}>Plan & Suscripción</h3>
          <div style={{ marginBottom: 12 }}><PlanBadge plan={school.plan} /></div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
            Estado: <strong style={{ color: school.plan_status === 'active' ? '#16a34a' : '#dc2626' }}>{school.plan_status}</strong>
          </div>
          {school.subscription_expires_at && (
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              Vence: <strong>{new Date(school.subscription_expires_at).toLocaleDateString('es-CL')}</strong>
            </div>
          )}

          {/* Botones cambio de plan */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => handleSetPlan('free')} disabled={school.plan === 'free'}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #3b82f6', background: school.plan === 'free' ? '#eff6ff' : '#fff', color: '#1d4ed8', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: school.plan === 'free' ? 0.6 : 1 }}>
              🆓 Cambiar a Gratuito
            </button>
            <button onClick={() => handleSetPlan('paid')} disabled={school.plan === 'paid'}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #f59e0b', background: school.plan === 'paid' ? '#fffbeb' : '#fff', color: '#92400e', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: school.plan === 'paid' ? 0.6 : 1 }}>
              💎 Cambiar a De Pago
            </button>
            <button onClick={() => navigate(`/super-admin/schools/${id}/edit`)}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              ✏️ Editar
            </button>
          </div>
        </div>
      </div>

      {/* Sección de Pago / Suscripción */}
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>💳 Gestión de Suscripción</h3>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
          Plan mensual: <strong>$29.990 CLP / mes</strong>
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Email del pagador</label>
          <input
            type="email" value={simEmail} onChange={e => setSimEmail(e.target.value)}
            placeholder="pagador@colegio.cl"
            style={{ padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, width: '100%', boxSizing: 'border-box', outline: 'none' }}
          />
        </div>

        {!MP_CONFIGURED ? (
          // Modo desarrollo: simular pago
          <div style={{ background: '#f8fafc', borderRadius: 12, padding: 20, border: '1px dashed #e2e8f0' }}>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
              🧪 <strong>Modo Desarrollo</strong> — Mercado Pago no configurado. Puedes simular un pago para pruebas.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>Meses:</label>
              <select value={simMonths} onChange={e => setSimMonths(parseInt(e.target.value))}
                style={{ padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none' }}>
                {[1, 3, 6, 12].map(m => <option key={m} value={m}>{m} {m === 1 ? 'mes' : 'meses'}</option>)}
              </select>
              <button onClick={handleSimulate} disabled={simulating}
                style={{ padding: '9px 20px', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 13, opacity: simulating ? 0.7 : 1 }}>
                {simulating ? 'Simulando...' : '✅ Simular Pago Exitoso'}
              </button>
            </div>
          </div>
        ) : (
          // Modo producción: Mercado Pago real
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={handleMPSubscription}
              style={{ padding: '11px 22px', background: 'linear-gradient(135deg, #009ee3, #0077cc)', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>💳</span> Suscribir con Mercado Pago
            </button>
          </div>
        )}
      </div>

      {/* Historial de suscripciones */}
      {school.subscriptions && school.subscriptions.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 16px' }}>📋 Historial de Suscripciones</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                {['Fecha', 'Tipo', 'Monto', 'Estado', 'ID MP'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {school.subscriptions.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '10px' }}>{new Date(s.created_at).toLocaleDateString('es-CL')}</td>
                  <td style={{ padding: '10px' }}>{s.plan_type === 'monthly' ? 'Mensual' : s.plan_type}</td>
                  <td style={{ padding: '10px' }}>${s.amount?.toLocaleString('es-CL')}</td>
                  <td style={{ padding: '10px' }}>
                    <StatusBadge status={s.status} />
                  </td>
                  <td style={{ padding: '10px', color: '#94a3b8', fontFamily: 'monospace', fontSize: 11 }}>{s.mp_subscription_id || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const config = {
    authorized: { bg: '#dcfce7', color: '#166534', label: '✅ Autorizada' },
    active: { bg: '#dcfce7', color: '#166534', label: '✅ Activa' },
    pending: { bg: '#fef3c7', color: '#92400e', label: '⏳ Pendiente' },
    cancelled: { bg: '#fee2e2', color: '#991b1b', label: '❌ Cancelada' },
    paused: { bg: '#f1f5f9', color: '#475569', label: '⏸ Pausada' },
    expired: { bg: '#fee2e2', color: '#991b1b', label: '⌛ Expirada' },
  };
  const c = config[status] || { bg: '#f1f5f9', color: '#475569', label: status };
  return (
    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color }}>
      {c.label}
    </span>
  );
}
