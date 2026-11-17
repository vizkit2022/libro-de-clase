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
      <div style={{ fontSize: 26, fontWeight: 700, color: '#2B1B14', lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 13, color: '#6B5446', fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: color, marginTop: 2 }}>{sub}</div>}
    </div>
  </div>
);

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState(null);
  const [schools, setSchools] = useState([]);
  const [puesta, setPuesta] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      axios.get('/api/super-admin/stats'),
      axios.get('/api/super-admin/schools'),
      // Cada fuente va por separado: si una falla, el panel igual abre
      axios.get('/api/super-admin/onboarding').catch(() => null),
    ]).then(([statsRes, schoolsRes, onbRes]) => {
      setStats(statsRes.data);
      setSchools(schoolsRes.data.slice(0, 5)); // últimos 5
      setPuesta(onbRes?.data?.colegios || []);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ textAlign: 'center', color: '#6B5446' }}>
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
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#2B1B14', margin: 0 }}>
              ⚡ Panel Super Administrador
            </h1>
            <p style={{ color: '#6B5446', margin: '6px 0 0', fontSize: 14 }}>
              Gestión global de colegios y suscripciones
            </p>
          </div>
          <button
            onClick={() => navigate('/super-admin/schools/new')}
            style={{
              background: 'linear-gradient(135deg, #2B1B14, #8A2846)',
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
          <StatCard icon="🏫" label="Total Colegios" value={stats.total_schools} color="#2B1B14" />
          <StatCard icon="✅" label="Colegios Activos" value={stats.active_schools} color="#2F7D5B" />
          <StatCard icon="💎" label="Plan de Pago" value={stats.paid_schools} color="#E8A317" sub="Con suscripción activa" />
          <StatCard icon="🆓" label="Plan Gratuito" value={stats.free_schools} color="#2B1B14" />
          <StatCard icon="👥" label="Total Usuarios" value={stats.total_users} color="#8A2846" />
          <StatCard icon="💳" label="Suscripciones" value={stats.active_subscriptions} color="#8A2846" sub="Autorizadas" />
        </div>
      )}

      {/* Puesta en marcha de cada colegio */}
      {puesta.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#2B1B14', margin: '0 0 6px' }}>
            🚀 Puesta en marcha
          </h2>
          <p style={{ color: '#6B5446', margin: '0 0 18px', fontSize: 13 }}>
            En qué va cada colegio y qué lo tiene detenido. «Docentes dentro» significa
            que el equipo ya está cargado y los profesores pueden ver sus cursos.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #F3F0EC' }}>
                  {['Colegio', 'Año', 'Avance', 'Docentes dentro', 'Qué falta'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#6B5446', fontWeight: 600, fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {puesta.map(c => (
                  <tr key={c.id}
                      onClick={() => navigate(`/super-admin/schools/${c.id}`)}
                      style={{ borderBottom: '1px solid #F7F6F4', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F7F6F4'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px', fontWeight: 600, color: '#2B1B14' }}>{c.name}</td>
                    <td style={{ padding: '12px', color: '#6B5446' }}>{c.year}</td>
                    <td style={{ padding: '12px', minWidth: 170 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div style={{ flex: 1, height: 6, borderRadius: 99, background: '#F3F0EC', overflow: 'hidden' }}>
                          <div style={{ width: `${c.pct}%`, height: '100%', borderRadius: 99,
                                        background: c.cerrado_at ? '#2F7D5B' : 'linear-gradient(90deg,#2B1B14,#8A2846)' }} />
                        </div>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#2B1B14', minWidth: 34 }}>{c.pct}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99,
                        background: c.docentes_pueden_entrar ? '#DDF0E6' : '#FFF0C7',
                        color: c.docentes_pueden_entrar ? '#1F5E43' : '#7A4B00',
                      }}>
                        {c.docentes_pueden_entrar ? 'Sí' : 'Todavía no'}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: '#6B5446', fontSize: 13 }}>
                      {c.cerrado_at ? 'Cerrada' : (c.siguiente_paso || '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Últimos colegios */}
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#2B1B14', margin: 0 }}>Colegios Recientes</h2>
          <button
            onClick={() => navigate('/super-admin/schools')}
            style={{ color: '#C2410C', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            Ver todos →
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #F3F0EC' }}>
                {['Colegio', 'Plan', 'Estado', 'Usuarios', 'Creado'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#6B5446', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schools.map(s => (
                <tr
                  key={s.id}
                  onClick={() => navigate(`/super-admin/schools/${s.id}`)}
                  style={{ borderBottom: '1px solid #F7F6F4', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F7F6F4'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px', fontWeight: 600, color: '#2B1B14' }}>{s.name}</td>
                  <td style={{ padding: '12px' }}>
                    <PlanBadge plan={s.plan} />
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: s.is_active ? '#DDF0E6' : '#FDE2D7',
                      color: s.is_active ? '#1F5E43' : '#9A3412',
                    }}>{s.is_active ? 'Activo' : 'Inactivo'}</span>
                  </td>
                  <td style={{ padding: '12px', color: '#6B5446' }}>{s.user_count || 0}</td>
                  <td style={{ padding: '12px', color: '#9C8A7E', fontSize: 12 }}>
                    {s.created_at ? new Date(s.created_at).toLocaleDateString('es-CL') : '-'}
                  </td>
                </tr>
              ))}
              {schools.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#9C8A7E' }}>No hay colegios aún</td></tr>
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
    paid: { bg: '#FFF0C7', color: '#7A4B00', label: '💎 De Pago', border: '#FFE29A' },
    free: { bg: '#FFF8E6', color: '#2B1B14', label: '🆓 Gratuito', border: '#FFE29A' },
  };
  const c = config[plan] || config.free;
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
    }}>{c.label}</span>
  );
}
