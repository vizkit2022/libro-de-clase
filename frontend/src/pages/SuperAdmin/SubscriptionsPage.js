import React, { useEffect, useState } from 'react';
import axios from 'axios';

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

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    axios.get('/api/super-admin/subscriptions')
      .then(r => setSubs(r.data))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? subs : subs.filter(s => s.status === filter);

  const totalRevenue = subs.filter(s => s.status === 'authorized')
    .reduce((acc, s) => acc + (s.amount || 0), 0);

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>💳 Suscripciones</h1>
        <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 14 }}>{subs.length} suscripciones registradas</p>
      </div>

      {/* Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total', value: subs.length, color: '#6366f1', icon: '📊' },
          { label: 'Activas', value: subs.filter(s => s.status === 'authorized').length, color: '#10b981', icon: '✅' },
          { label: 'Pendientes', value: subs.filter(s => s.status === 'pending').length, color: '#f59e0b', icon: '⏳' },
          { label: 'Ingresos / mes', value: `$${totalRevenue.toLocaleString('es-CL')}`, color: '#8b5cf6', icon: '💰' },
        ].map(c => (
          <div key={c.label} style={{ background: '#fff', borderRadius: 16, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}>{c.icon}</span>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{c.value}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {[['all', 'Todas'], ['authorized', 'Activas'], ['pending', 'Pendientes'], ['cancelled', 'Canceladas']].map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)}
              style={{ padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                background: filter === val ? '#6366f1' : '#f1f5f9',
                color: filter === val ? '#fff' : '#475569' }}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Cargando...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                {['Colegio', 'Tipo', 'Monto', 'Pagador', 'Estado', 'Inicio', 'Próx. Pago', 'ID MP'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '13px 12px', fontWeight: 600, color: '#0f172a' }}>{s.school_name}</td>
                  <td style={{ padding: '13px 12px', color: '#64748b' }}>{s.plan_type === 'monthly' ? 'Mensual' : s.plan_type}</td>
                  <td style={{ padding: '13px 12px', fontWeight: 600, color: '#059669' }}>${(s.amount || 0).toLocaleString('es-CL')}</td>
                  <td style={{ padding: '13px 12px', color: '#64748b', fontSize: 12 }}>{s.mp_payer_email || '-'}</td>
                  <td style={{ padding: '13px 12px' }}><StatusBadge status={s.status} /></td>
                  <td style={{ padding: '13px 12px', color: '#94a3b8', fontSize: 12 }}>
                    {s.start_date ? new Date(s.start_date).toLocaleDateString('es-CL') : '-'}
                  </td>
                  <td style={{ padding: '13px 12px', color: '#94a3b8', fontSize: 12 }}>
                    {s.next_payment_date ? new Date(s.next_payment_date).toLocaleDateString('es-CL') : '-'}
                  </td>
                  <td style={{ padding: '13px 12px', color: '#cbd5e1', fontFamily: 'monospace', fontSize: 11 }}>
                    {s.mp_subscription_id ? s.mp_subscription_id.substring(0, 12) + '…' : '-'}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>No hay suscripciones</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Info de configuración MP */}
      <div style={{ marginTop: 24, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 16, padding: 20 }}>
        <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: '#92400e' }}>⚙️ Configuración de Mercado Pago</h4>
        <p style={{ margin: 0, fontSize: 13, color: '#78350f', lineHeight: 1.6 }}>
          Para activar pagos reales, agrega las variables de entorno en tu archivo <code style={{ background: '#fef3c7', padding: '2px 6px', borderRadius: 4 }}>.env</code>:
        </p>
        <pre style={{ background: '#fef3c7', padding: '12px 16px', borderRadius: 10, fontSize: 12, margin: '10px 0 0', color: '#78350f', overflowX: 'auto' }}>
{`MP_ACCESS_TOKEN=TEST-xxxxx-xxxx-xxxx-xxxx   # o APP_... para producción
APP_BASE_URL=http://localhost:5008             # URL base de tu app`}
        </pre>
        <p style={{ margin: '10px 0 0', fontSize: 12, color: '#92400e' }}>
          Obtén tus credenciales en: <a href="https://www.mercadopago.cl/developers/panel" target="_blank" rel="noreferrer" style={{ color: '#7c3aed', fontWeight: 600 }}>mercadopago.cl/developers/panel</a>
        </p>
      </div>
    </div>
  );
}
