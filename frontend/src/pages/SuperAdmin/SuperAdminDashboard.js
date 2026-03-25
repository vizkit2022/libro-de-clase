import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const StatCard = ({ icon, label, value, color, sub }) => (
  <div style={{
    background: '#fff', borderRadius: 16, padding: '20px 24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.07)', display: 'flex', alignItems: 'center', gap: 16,
  }}>
    <div style={{
      width: 52, height: 52, borderRadius: 14,
      background: color + '18',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0,
    }}>{icon}</div>
    <div>
      <div style={{ fontSize: 26, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: color, marginTop: 2 }}>{sub}</div>}
    </div>
  </div>
);

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState(null);
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      axios.get('/api/super-admin/stats'),
      axios.get('/api/super-admin/schools'),
    ]).then(([statsRes, schoolsRes]) => {
      setStats(statsRes.data);
      setSchools(schoolsRes.data.slice(0, 5)); // últimos 5
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ textAlign: 'center', color: '#64748b' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>⚡</div>
        <p>Cargando panel...</p>
      </div>
    </div>
  );

  return (
    <div style={{ padding: '32px', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#0f172a', margin: 0 }}>
              ⚡ Panel Super Administrador
            </h1>
            <p style={{ color: '#64748b', margin: '6px 0 0', fontSize: 14 }}>
              Gestión global de colegios y suscripciones
            </p>
          </div>
          <button
            onClick={() => navigate('/super-admin/schools/new')}
            style={{
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', border: 'none', borderRadius: 12,
              padding: '12px 22px', fontWeight: 600, fontSize: 14,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <span>+</span> Nuevo Colegio
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          <StatCard icon="🏫" label="Total Colegios" value={stats.total_schools} color="#6366f1" />
          <StatCard icon="✅" label="Colegios Activos" value={stats.active_schools} color="#10b981" />
          <StatCard icon="💎" label="Plan de Pago" value={stats.paid_schools} color="#f59e0b" sub="Con suscripción activa" />
          <StatCard icon="🆓" label="Plan Gratuito" value={stats.free_schools} color="#3b82f6" />
          <StatCard icon="👥" label="Total Usuarios" value={stats.total_users} color="#ec4899" />
          <StatCard icon="💳" label="Suscripciones" value={stats.active_subscriptions} color="#8b5cf6" sub="Autorizadas" />
        </div>
      )}

      {/* Últimos colegios */}
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>Colegios Recientes</h2>
          <button
            onClick={() => navigate('/super-admin/schools')}
            style={{ color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            Ver todos →
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                {['Colegio', 'Plan', 'Estado', 'Usuarios', 'Creado'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schools.map(s => (
                <tr
                  key={s.id}
                  onClick={() => navigate(`/super-admin/schools/${s.id}`)}
                  style={{ borderBottom: '1px solid #f8fafc', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px', fontWeight: 600, color: '#0f172a' }}>{s.name}</td>
                  <td style={{ padding: '12px' }}>
                    <PlanBadge plan={s.plan} />
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: s.is_active ? '#dcfce7' : '#fee2e2',
                      color: s.is_active ? '#166534' : '#991b1b',
                    }}>{s.is_active ? 'Activo' : 'Inactivo'}</span>
                  </td>
                  <td style={{ padding: '12px', color: '#64748b' }}>{s.user_count || 0}</td>
                  <td style={{ padding: '12px', color: '#94a3b8', fontSize: 12 }}>
                    {s.created_at ? new Date(s.created_at).toLocaleDateString('es-CL') : '-'}
                  </td>
                </tr>
              ))}
              {schools.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>No hay colegios aún</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function PlanBadge({ plan }) {
  const config = {
    paid: { bg: '#fef3c7', color: '#92400e', label: '💎 De Pago', border: '#fde68a' },
    free: { bg: '#eff6ff', color: '#1e40af', label: '🆓 Gratuito', border: '#bfdbfe' },
  };
  const c = config[plan] || config.free;
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
    }}>{c.label}</span>
  );
}
