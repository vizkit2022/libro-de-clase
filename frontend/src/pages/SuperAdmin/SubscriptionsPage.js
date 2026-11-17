import React, { useEffect, useState } from 'react';
import axios from 'axios';

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
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#2B1B14', margin: 0 }}>💳 Suscripciones</h1>
        <p style={{ color: '#6B5446', margin: '4px 0 0', fontSize: 14 }}>{subs.length} suscripciones registradas</p>
      </div>

      {/* Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total', value: subs.length, color: '#C2410C', icon: '📊' },
          { label: 'Activas', value: subs.filter(s => s.status === 'authorized').length, color: '#2F7D5B', icon: '✅' },
          { label: 'Pendientes', value: subs.filter(s => s.status === 'pending').length, color: '#E8A317', icon: '⏳' },
          { label: 'Ingresos / mes', value: `$${totalRevenue.toLocaleString('es-CL')}`, color: '#8A2846', icon: '💰' },
        ].map(c => (
          <div key={c.label} style={{ background: '#fff', borderRadius: 16, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}>{c.icon}</span>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#2B1B14' }}>{c.value}</div>
              <div style={{ fontSize: 12, color: '#6B5446' }}>{c.label}</div>
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
                background: filter === val ? '#2B1B14' : '#F3F0EC',
                color: filter === val ? '#fff' : '#5C463A' }}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#9C8A7E' }}>Cargando...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #F3F0EC' }}>
                {['Colegio', 'Tipo', 'Monto', 'Pagador', 'Estado', 'Inicio', 'Próx. Pago', 'ID MP'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#6B5446', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #F7F6F4' }}>
                  <td style={{ padding: '13px 12px', fontWeight: 600, color: '#2B1B14' }}>{s.school_name}</td>
                  <td style={{ padding: '13px 12px', color: '#6B5446' }}>{s.plan_type === 'monthly' ? 'Mensual' : s.plan_type}</td>
                  <td style={{ padding: '13px 12px', fontWeight: 600, color: '#2F7D5B' }}>${(s.amount || 0).toLocaleString('es-CL')}</td>
                  <td style={{ padding: '13px 12px', color: '#6B5446', fontSize: 12 }}>{s.mp_payer_email || '-'}</td>
                  <td style={{ padding: '13px 12px' }}><StatusBadge status={s.status} /></td>
                  <td style={{ padding: '13px 12px', color: '#9C8A7E', fontSize: 12 }}>
                    {s.start_date ? new Date(s.start_date).toLocaleDateString('es-CL') : '-'}
                  </td>
                  <td style={{ padding: '13px 12px', color: '#9C8A7E', fontSize: 12 }}>
                    {s.next_payment_date ? new Date(s.next_payment_date).toLocaleDateString('es-CL') : '-'}
                  </td>
                  <td style={{ padding: '13px 12px', color: '#D9D2CA', fontFamily: 'monospace', fontSize: 11 }}>
                    {s.mp_subscription_id ? s.mp_subscription_id.substring(0, 12) + '…' : '-'}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#9C8A7E' }}>No hay suscripciones</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Info de configuración MP */}
      <div style={{ marginTop: 24, background: '#FFF8E1', border: '1px solid #FFE29A', borderRadius: 16, padding: 20 }}>
        <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: '#7A4B00' }}>⚙️ Configuración de Mercado Pago</h4>
        <p style={{ margin: 0, fontSize: 13, color: '#7A4B00', lineHeight: 1.6 }}>
          Para activar pagos reales, agrega las variables de entorno en tu archivo <code style={{ background: '#FFF0C7', padding: '2px 6px', borderRadius: 4 }}>.env</code>:
        </p>
        <pre style={{ background: '#FFF0C7', padding: '12px 16px', borderRadius: 10, fontSize: 12, margin: '10px 0 0', color: '#7A4B00', overflowX: 'auto' }}>
{`MP_ACCESS_TOKEN=TEST-xxxxx-xxxx-xxxx-xxxx   # o APP_... para producción
APP_BASE_URL=http://localhost:5008             # URL base de tu app`}
        </pre>
        <p style={{ margin: '10px 0 0', fontSize: 12, color: '#7A4B00' }}>
          Obtén tus credenciales en: <a href="https://www.mercadopago.cl/developers/panel" target="_blank" rel="noreferrer" style={{ color: '#8A2846', fontWeight: 600 }}>mercadopago.cl/developers/panel</a>
        </p>
      </div>
    </div>
  );
}
