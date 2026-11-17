import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import PlanColegio from './PlanColegio';
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
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#2B1B14', margin: 0 }}>🏫 Gestión de Colegios</h1>
          <p style={{ color: '#6B5446', margin: '4px 0 0', fontSize: 14 }}>{schools.length} colegios registrados</p>
        </div>
        <button
          onClick={() => navigate('/super-admin/schools/new')}
          style={{
            background: 'linear-gradient(135deg, #2B1B14, #8A2846)',
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
            width: '100%', padding: '10px 16px', borderRadius: 10, border: '1px solid #ECE8E3',
            fontSize: 14, marginBottom: 20, boxSizing: 'border-box', outline: 'none',
          }}
        />

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#9C8A7E' }}>Cargando...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #F3F0EC' }}>
                {['Colegio', 'RUT', 'Plan', 'Vence', 'Estado', 'Usuarios', 'Acciones'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#6B5446', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #F7F6F4' }}>
                  <td style={{ padding: '13px 12px' }}>
                    <div style={{ fontWeight: 600, color: '#2B1B14' }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: '#9C8A7E' }}>{s.email}</div>
                  </td>
                  <td style={{ padding: '13px 12px', color: '#6B5446', fontSize: 12 }}>{s.rut || '-'}</td>
                  <td style={{ padding: '13px 12px' }}><PlanBadge plan={s.plan} /></td>
                  <td style={{ padding: '13px 12px', fontSize: 12, color: '#6B5446' }}>
                    {s.subscription_expires_at
                      ? new Date(s.subscription_expires_at).toLocaleDateString('es-CL')
                      : s.plan === 'free' ? '∞' : '-'}
                  </td>
                  <td style={{ padding: '13px 12px' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: s.is_active ? '#DDF0E6' : '#FDE2D7',
                      color: s.is_active ? '#1F5E43' : '#9A3412',
                    }}>{s.is_active ? 'Activo' : 'Inactivo'}</span>
                  </td>
                  <td style={{ padding: '13px 12px', color: '#6B5446' }}>{s.user_count || 0}</td>
                  <td style={{ padding: '13px 12px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => navigate(`/super-admin/schools/${s.id}`)}
                        style={{ padding: '5px 12px', background: '#FFF8E6', color: '#9A3412', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                      >Ver</button>
                      <button
                        onClick={() => handleToggle(s.id)}
                        style={{
                          padding: '5px 12px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                          background: s.is_active ? '#FDE2D7' : '#DDF0E6',
                          color: s.is_active ? '#B8321B' : '#2F7D5B',
                        }}
                      >{s.is_active ? 'Desactivar' : 'Activar'}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#9C8A7E' }}>No hay colegios que coincidan</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Field helper (fuera del componente para evitar remount en cada keystroke) ──
function Field({ label, field, type = 'text', placeholder = '', value, onChange }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#5C463A', marginBottom: 5 }}>{label}</label>
      <input
        type={type} value={value || ''} placeholder={placeholder}
        onChange={e => onChange(field, e.target.value)}
        style={{ width: '100%', padding: '9px 14px', border: '1px solid #ECE8E3', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
      />
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
    rector: '', subtitulo: '', plan: 'free',
    primary_color: '#C2410C', secondary_color: '#2B1B14', accent_color: '#C2410C',
    admin_email: '', admin_first_name: '', admin_last_name: '', admin_password: 'colegio123', admin_role: 'admin',
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

  return (
    <div style={{ padding: 32, maxWidth: 800 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <button onClick={() => navigate('/super-admin/schools')}
          style={{ background: 'none', border: '1px solid #ECE8E3', borderRadius: 10, padding: '7px 14px', cursor: 'pointer', color: '#6B5446', fontSize: 13 }}>
          ← Volver
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#2B1B14', margin: 0 }}>
          {isNew ? '+ Nuevo Colegio' : `✏️ Editar: ${form.name}`}
        </h1>
      </div>

      {error && (
        <div style={{ background: '#FDE2D7', color: '#B8321B', padding: '12px 16px', borderRadius: 12, marginBottom: 20, fontSize: 14 }}>
          ⚠️ {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Info del colegio */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#2B1B14', margin: '0 0 20px' }}>🏫 Información del Colegio</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
            <div style={{ gridColumn: '1/-1' }}>
              <Field label="Nombre *" field="name" placeholder="Colegio San Patricio"
                value={form.name} onChange={handleChange} />
            </div>
            <Field label="RUT" field="rut" placeholder="12.345.678-9" value={form.rut} onChange={handleChange} />
            <Field label="Email" field="email" type="email" placeholder="contacto@colegio.cl" value={form.email} onChange={handleChange} />
            <Field label="Teléfono" field="phone" placeholder="+56 2 2345 6789" value={form.phone} onChange={handleChange} />
            <Field label="Sitio Web" field="website" placeholder="https://www.colegio.cl" value={form.website} onChange={handleChange} />
            <div style={{ gridColumn: '1/-1' }}>
              <Field label="Dirección" field="address" placeholder="Av. Principal 1234, Santiago" value={form.address} onChange={handleChange} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <Field label="Rector/a" field="rector" placeholder="Nombre del rector" value={form.rector} onChange={handleChange} />
              <Field label="Bajada institucional" field="subtitulo"
                placeholder="Institución Teresiana" value={form.subtitulo} onChange={handleChange} />
            </div>
          </div>

          {/* Plan */}
          <div style={{ marginTop: 8 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#5C463A', marginBottom: 8 }}>Plan del Colegio</label>
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { value: 'free', label: '🆓 Gratuito', desc: 'Sin costo', bg: '#FFF8E6', border: '#2B1B14', color: '#2B1B14' },
                { value: 'paid', label: '💎 De Pago', desc: '$29.990 / mes', bg: '#FFF8E1', border: '#E8A317', color: '#7A4B00' },
              ].map(opt => (
                <label key={opt.value} style={{
                  flex: 1, padding: '14px 18px', borderRadius: 12, cursor: 'pointer',
                  border: `2px solid ${form.plan === opt.value ? opt.border : '#ECE8E3'}`,
                  background: form.plan === opt.value ? opt.bg : '#fff',
                  transition: 'all 0.15s',
                }}>
                  <input type="radio" name="plan" value={opt.value} checked={form.plan === opt.value}
                    onChange={() => handleChange('plan', opt.value)} style={{ display: 'none' }} />
                  <div style={{ fontWeight: 700, color: form.plan === opt.value ? opt.color : '#5C463A', fontSize: 15 }}>{opt.label}</div>
                  <div style={{ fontSize: 12, color: '#6B5446', marginTop: 2 }}>{opt.desc}</div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Crear usuario admin — disponible al crear Y al editar */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#2B1B14', margin: '0 0 6px' }}>
            👤 {isNew ? 'Administrador Inicial' : 'Crear Usuario para este Colegio'} <span style={{ fontWeight: 400, color: '#9C8A7E', fontSize: 13 }}>(opcional)</span>
          </h3>
          <p style={{ fontSize: 13, color: '#6B5446', margin: '0 0 20px' }}>
            {isNew ? 'Crea el primer usuario admin del colegio.' : 'Si dejas el email en blanco, no se crea ningún usuario.'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
            <div style={{ gridColumn: '1/-1' }}>
              <Field label="Email" field="admin_email" type="email" placeholder="admin@colegio.cl"
                value={form.admin_email} onChange={handleChange} />
            </div>
            <Field label="Nombre" field="admin_first_name" placeholder="Juan" value={form.admin_first_name} onChange={handleChange} />
            <Field label="Apellido" field="admin_last_name" placeholder="González" value={form.admin_last_name} onChange={handleChange} />
            <Field label="Contraseña inicial" field="admin_password" placeholder="colegio123" value={form.admin_password} onChange={handleChange} />
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B5446', textTransform:'uppercase', marginBottom:6 }}>Rol</label>
              <select
                value={form.admin_role || 'admin'}
                onChange={e => handleChange({ target: { name: 'admin_role', value: e.target.value } })}
                style={{ width:'100%', padding:'9px 12px', border:'1px solid #ECE8E3', borderRadius:8, fontSize:14 }}>
                <option value="admin">Admin</option>
                <option value="directivo">Directivo</option>
                <option value="profesor">Profesor</option>
              </select>
            </div>
          </div>
        </div>

        {/* Colores */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#2B1B14', margin: '0 0 20px' }}>🎨 Colores del Colegio</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[
              { label: 'Color Principal', field: 'primary_color' },
              { label: 'Color Secundario', field: 'secondary_color' },
              { label: 'Color Acento', field: 'accent_color' },
            ].map(c => (
              <div key={c.field}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5C463A', marginBottom: 6 }}>{c.label}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="color" value={form[c.field] || '#2B1B14'}
                    onChange={e => handleChange(c.field, e.target.value)}
                    style={{ width: 40, height: 40, border: 'none', borderRadius: 8, cursor: 'pointer' }} />
                  <span style={{ fontSize: 13, color: '#6B5446' }}>{form[c.field]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button type="submit" disabled={saving} style={{
          background: 'linear-gradient(135deg, #2B1B14, #8A2846)',
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
  const [message, setMessage] = useState('');

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

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9C8A7E' }}>Cargando...</div>;
  if (!school) return null;

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <button onClick={() => navigate('/super-admin/schools')}
          style={{ background: 'none', border: '1px solid #ECE8E3', borderRadius: 10, padding: '7px 14px', cursor: 'pointer', color: '#6B5446', fontSize: 13 }}>
          ← Volver
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#2B1B14', margin: 0 }}>🏫 {school.name}</h1>
        <PlanBadge plan={school.plan} />
      </div>

      {message && (
        <div style={{ background: message.startsWith('✅') ? '#DDF0E6' : '#FDE2D7', color: message.startsWith('✅') ? '#1F5E43' : '#B8321B', padding: '12px 16px', borderRadius: 12, marginBottom: 20, fontSize: 14 }}>
          {message}
        </div>
      )}

      {/* Info básica */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#6B5446', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: 1 }}>Información</h3>
          {[['RUT', school.rut], ['Email', school.email], ['Teléfono', school.phone], ['Rector/a', school.rector], ['Bajada', school.subtitulo], ['Dirección', school.address]].map(([k, v]) => (
            v ? <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 10, fontSize: 14 }}>
              <span style={{ color: '#9C8A7E', minWidth: 80 }}>{k}:</span>
              <span style={{ color: '#5C463A', fontWeight: 500 }}>{v}</span>
            </div> : null
          ))}
          <div style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 14 }}>
            <span style={{ color: '#9C8A7E', minWidth: 80 }}>Usuarios:</span>
            <span style={{ color: '#5C463A', fontWeight: 600 }}>
              {school.user_count || 0}
              <span style={{ color: '#9C8A7E', fontWeight: 400, marginLeft: 6, fontSize: 13 }}>
                facturables
              </span>
            </span>
          </div>
          <p style={{ fontSize: 12.5, color: '#9C8A7E', margin: '0 0 0 88px', lineHeight: 1.5 }}>
            Docentes y administradores. No se cobran
            {' '}{school.otros_usuarios?.alumnos ?? 0} alumnos
            {school.otros_usuarios?.apoderados
              ? ` ni ${school.otros_usuarios.apoderados} apoderados` : ''}.
          </p>
        </div>

        {/* Estado del plan */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#6B5446', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: 1 }}>Plan & Suscripción</h3>
          <div style={{ marginBottom: 12 }}><PlanBadge plan={school.plan} /></div>
          <div style={{ fontSize: 13, color: '#6B5446', marginBottom: 8 }}>
            Estado: <strong style={{ color: school.plan_status === 'active' ? '#2F7D5B' : '#B8321B' }}>{school.plan_status}</strong>
          </div>
          {school.subscription_expires_at && (
            <div style={{ fontSize: 13, color: '#6B5446', marginBottom: 16 }}>
              Vence: <strong>{new Date(school.subscription_expires_at).toLocaleDateString('es-CL')}</strong>
            </div>
          )}

          {/* Botones cambio de plan */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => handleSetPlan('free')} disabled={school.plan === 'free'}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #2B1B14', background: school.plan === 'free' ? '#FFF8E6' : '#fff', color: '#9A3412', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: school.plan === 'free' ? 0.6 : 1 }}>
              🆓 Cambiar a Gratuito
            </button>
            <button onClick={() => handleSetPlan('paid')} disabled={school.plan === 'paid'}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #E8A317', background: school.plan === 'paid' ? '#FFF8E1' : '#fff', color: '#7A4B00', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: school.plan === 'paid' ? 0.6 : 1 }}>
              💎 Cambiar a De Pago
            </button>
            <button onClick={() => navigate(`/super-admin/schools/${id}/edit`)}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #ECE8E3', background: '#fff', color: '#5C463A', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              ✏️ Editar
            </button>
          </div>
        </div>
      </div>

      {/* Usuarios facturables */}
      <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
        marginBottom: 20, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 24px',
          borderBottom: '1px solid #F3F0EC', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#6B5446', margin: 0,
              textTransform: 'uppercase', letterSpacing: 1 }}>Usuarios del colegio</h3>
            <p style={{ fontSize: 12.5, color: '#9C8A7E', margin: '3px 0 0' }}>
              Los que determinan el valor del plan
            </p>
          </div>
          {Object.entries(school.usuarios_por_rol || {})
            .filter(([r]) => ['admin', 'directivo', 'profesor'].includes(r))
            .map(([rol, n]) => (
              <span key={rol} style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px',
                borderRadius: 999, background: '#ECE8E3', color: '#9A3412' }}>
                {n} {rol === 'profesor' ? (n === 1 ? 'docente' : 'docentes') : rol}
              </span>
            ))}
        </div>

        {!school.usuarios?.length ? (
          <p style={{ padding: 32, textAlign: 'center', color: '#9C8A7E', fontSize: 14 }}>
            Este colegio todavía no tiene docentes ni administradores cargados.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: '#F7F6F4' }}>
                {['Nombre', 'Correo', 'Rol', 'Estado', 'Último ingreso'].map(h => (
                  <th key={h} style={{ padding: '9px 24px', textAlign: 'left', fontSize: 11,
                    textTransform: 'uppercase', color: '#6B5446', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {school.usuarios.map(u => (
                <tr key={u.id} style={{ borderTop: '1px solid #F3F0EC',
                  opacity: u.is_active ? 1 : 0.62 }}>
                  <td style={{ padding: '10px 24px', fontWeight: 600, color: '#2B1B14' }}>
                    {u.nombre}
                  </td>
                  <td style={{ padding: '10px 24px', color: '#6B5446' }}>{u.email}</td>
                  <td style={{ padding: '10px 24px', color: '#5C463A',
                    textTransform: 'capitalize' }}>{u.role}</td>
                  <td style={{ padding: '10px 24px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px',
                      borderRadius: 999,
                      background: u.is_active ? '#DDF0E6' : '#F3F0EC',
                      color: u.is_active ? '#1F5E43' : '#6B5446' }}>
                      {u.is_active ? 'activo' : 'sin acceso'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 24px', color: '#9C8A7E', fontSize: 12.5 }}>
                    {u.last_login
                      ? new Date(u.last_login).toLocaleDateString('es-CL',
                          { day: '2-digit', month: 'short', year: 'numeric' })
                      : 'nunca'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Plan comercial y cobro con Mercado Pago */}
      <PlanColegio schoolId={id} onCambio={load} />

      {/* Historial de suscripciones */}
      {school.subscriptions && school.subscriptions.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#2B1B14', margin: '0 0 16px' }}>📋 Historial de Suscripciones</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #F3F0EC' }}>
                {['Fecha', 'Tipo', 'Monto', 'Estado', 'ID MP'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: '#6B5446', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {school.subscriptions.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #F7F6F4' }}>
                  <td style={{ padding: '10px' }}>{new Date(s.created_at).toLocaleDateString('es-CL')}</td>
                  <td style={{ padding: '10px' }}>{s.plan_type === 'monthly' ? 'Mensual' : s.plan_type}</td>
                  <td style={{ padding: '10px' }}>${s.amount?.toLocaleString('es-CL')}</td>
                  <td style={{ padding: '10px' }}>
                    <StatusBadge status={s.status} />
                  </td>
                  <td style={{ padding: '10px', color: '#9C8A7E', fontFamily: 'monospace', fontSize: 11 }}>{s.mp_subscription_id || '-'}</td>
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
    authorized: { bg: '#DDF0E6', color: '#1F5E43', label: '✅ Autorizada' },
    active: { bg: '#DDF0E6', color: '#1F5E43', label: '✅ Activa' },
    pending: { bg: '#FFF0C7', color: '#7A4B00', label: '⏳ Pendiente' },
    cancelled: { bg: '#FDE2D7', color: '#9A3412', label: '❌ Cancelada' },
    paused: { bg: '#F3F0EC', color: '#5C463A', label: '⏸ Pausada' },
    expired: { bg: '#FDE2D7', color: '#9A3412', label: '⌛ Expirada' },
  };
  const c = config[status] || { bg: '#F3F0EC', color: '#5C463A', label: status };
  return (
    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color }}>
      {c.label}
    </span>
  );
}
