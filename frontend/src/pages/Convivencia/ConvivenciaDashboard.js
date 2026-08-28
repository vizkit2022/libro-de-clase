import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const CRITICALITY_COLOR = { alta: '#ef4444', media: '#f59e0b', baja: '#94a3b8' };

function StatCard({ label, value, pct, color }) {
  return (
    <div style={{
      border: `1px dashed ${color || '#e2e8f0'}`,
      borderRadius: 8, padding: '12px 16px', minWidth: 110, textAlign: 'center',
      background: color ? `${color}08` : '#fafafa'
    }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: color || '#94a3b8', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </p>
      <p style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', margin: 0, lineHeight: 1 }}>{value}</p>
      {pct !== undefined && (
        <p style={{ fontSize: 11, color: '#94a3b8', margin: '3px 0 0' }}>{pct}%</p>
      )}
    </div>
  );
}

export default function ConvivenciaDashboard() {
  const { school } = useAuth();
  const primary = school?.primary_color || '#2563EB';
  const year = new Date().getFullYear();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`/api/convivencia/dashboard?year=${year}`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [year]);

  if (loading) return <div className="loading-container"><div className="spinner" /></div>;
  if (!data) return <p style={{ color: '#ef4444', padding: 24 }}>Error al cargar datos.</p>;

  const total = data.total || 1; // evitar /0

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title">🏫 Convivencia Escolar</h1>
          <p className="page-subtitle">Estadísticas del año {year} · {data.total} caso{data.total !== 1 ? 's' : ''} registrado{data.total !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/convivencia/casos" style={{
            padding: '9px 20px', background: primary, color: '#fff',
            borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none'
          }}>
            📋 Ver casos
          </Link>
          <Link to="/convivencia/casos/nuevo" style={{
            padding: '9px 20px', background: '#10b981', color: '#fff',
            borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none'
          }}>
            + Crear caso
          </Link>
        </div>
      </div>

      {/* Resumen abiertos/cerrados */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 16, marginBottom: 28 }}>
        {[
          { icon: '📂', label: 'Total casos', value: data.total, bg: '#ede9fe', color: '#7c3aed' },
          { icon: '🔓', label: 'Abiertos', value: data.open, bg: '#fef3c7', color: '#d97706' },
          { icon: '✅', label: 'Cerrados', value: data.closed, bg: '#d1fae5', color: '#059669' },
        ].map((s, i) => (
          <div key={i} className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
              {s.icon}
            </div>
            <div>
              <p style={{ fontSize: 26, fontWeight: 800, color: s.color, margin: 0, lineHeight: 1 }}>{s.value}</p>
              <p style={{ fontSize: 12, color: '#64748b', margin: '3px 0 0' }}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Casos por mes */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', margin: '0 0 20px', textAlign: 'center' }}>
          Cantidad de casos por mes
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
          {data.by_month.map(m => (
            <StatCard
              key={m.month}
              label={MONTHS[m.month - 1]}
              value={m.count}
              pct={m.count ? Math.round((m.count / data.total) * 100) : 0}
              color={m.count > 0 ? primary : null}
            />
          ))}
          <div style={{
            border: `2px solid ${primary}`,
            borderRadius: 8, padding: '12px 20px', minWidth: 110, textAlign: 'center',
            background: `${primary}12`
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: primary, margin: '0 0 4px', textTransform: 'uppercase' }}>
              TOTAL ANUAL
            </p>
            <p style={{ fontSize: 32, fontWeight: 900, color: primary, margin: 0 }}>{data.total}</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Procedimientos */}
        <div className="card">
          <h3 style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', margin: '0 0 16px', textAlign: 'center' }}>
            Procedimientos
          </h3>
          {data.by_procedure.length === 0
            ? <p style={{ color: '#94a3b8', textAlign: 'center', fontSize: 13 }}>Sin datos</p>
            : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                {data.by_procedure.map(p => (
                  <StatCard key={p.name} label={p.name} value={p.count}
                    pct={Math.round((p.count / total) * 100)} color="#6366f1" />
                ))}
              </div>
          }
        </div>

        {/* Tipificación */}
        <div className="card">
          <h3 style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', margin: '0 0 16px', textAlign: 'center' }}>
            Tipificación de casos
          </h3>
          {data.by_typification.length === 0
            ? <p style={{ color: '#94a3b8', textAlign: 'center', fontSize: 13 }}>Sin datos</p>
            : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                {data.by_typification.map(t => (
                  <StatCard key={t.name} label={t.name} value={t.count}
                    pct={Math.round((t.count / total) * 100)} color="#ef4444" />
                ))}
              </div>
          }
        </div>
      </div>

      {/* Por profesional */}
      <div className="card">
        <h3 style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', margin: '0 0 16px', textAlign: 'center' }}>
          Atenciones por Profesional
        </h3>
        {data.by_professional.length === 0
          ? <p style={{ color: '#94a3b8', textAlign: 'center', fontSize: 13 }}>Sin datos</p>
          : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
              {data.by_professional.map(p => (
                <StatCard key={p.name} label={p.name} value={p.count}
                  pct={Math.round((p.count / total) * 100)} color="#0ea5e9" />
              ))}
            </div>
        }
      </div>
    </div>
  );
}
