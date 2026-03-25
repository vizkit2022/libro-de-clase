import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';

const ROLE_WELCOME = {
  admin: '¡Hola, Administrador! 👋',
  directivo: '¡Bienvenido, Directivo! 👋',
  profesor: '¡Hola, Profe! 👋',
  apoderado: '¡Hola! 👋',
  alumno: '¡Hola! 👋',
};

export default function DashboardPage() {
  const { user, school } = useAuth();
  const [summary, setSummary] = useState(null);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const primary = school?.primary_color || '#2563EB';

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (['admin','directivo','profesor'].includes(user?.role)) {
          const [sumRes, courseRes] = await Promise.all([
            axios.get('/api/reports/school/summary'),
            axios.get('/api/courses')
          ]);
          setSummary(sumRes.data);
          setCourses(courseRes.data.slice(0, 4));
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchData();
  }, [user]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  if (loading) return (
    <div className="loading-container"><div className="spinner" /></div>
  );

  return (
    <div>
      {/* Bienvenida */}
      <div style={{
        background: `linear-gradient(135deg, ${primary} 0%, ${primary}cc 100%)`,
        borderRadius: '20px',
        padding: '32px',
        marginBottom: '28px',
        color: 'white',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ position: 'relative', zIndex: 2 }}>
          <p style={{ fontSize: '15px', opacity: 0.85, marginBottom: '8px' }}>{greeting} ☀️</p>
          <h1 style={{ fontSize: '26px', fontWeight: 800, margin: 0 }}>
            {user?.first_name} {user?.last_name}
          </h1>
          <p style={{ opacity: 0.85, marginTop: '6px', fontSize: '14px' }}>
            {school?.name} · {new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div style={{
          position: 'absolute', right: 24, top: '50%', transform: 'translateY(-50%)',
          fontSize: '80px', opacity: 0.15, zIndex: 1
        }}>🏫</div>
      </div>

      {/* Stats (solo admin/directivo/profesor) */}
      {summary && (
        <div className="stats-grid" style={{ marginBottom: '28px' }}>
          {[
            { icon: '🎓', label: 'Estudiantes', value: summary.total_students, bg: '#ede9fe', color: '#7c3aed' },
            { icon: '👨‍🏫', label: 'Profesores', value: summary.total_teachers, bg: '#dbeafe', color: '#1d4ed8' },
            { icon: '📚', label: 'Cursos', value: summary.total_courses, bg: '#d1fae5', color: '#065f46' },
            { icon: '⭐', label: 'Anotaciones +', value: summary.annotations_positive, bg: '#fef3c7', color: '#92400e' },
          ].map((s, i) => (
            <div key={i} className="stat-card">
              <div className="stat-icon" style={{ background: s.bg, color: s.color }}>{s.icon}</div>
              <div className="stat-info">
                <h3>{s.value}</h3>
                <p>{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Accesos rápidos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        {/* Cursos recientes */}
        {courses.length > 0 && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>📚 Cursos</h3>
              <Link to="/courses" style={{ fontSize: '13px', color: primary, fontWeight: 600, textDecoration: 'none' }}>Ver todos →</Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {courses.map(c => (
                <Link key={c.id} to={`/courses/${c.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 12px', borderRadius: '10px', background: '#f8fafc',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '8px',
                      background: primary, color: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: '13px', flexShrink: 0
                    }}>
                      {c.level?.[0] || '?'}
                    </div>
                    <div>
                      <p style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px' }}>{c.name}</p>
                      <p style={{ fontSize: '12px', color: '#64748b' }}>{c.student_count} alumnos</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Acciones rápidas */}
        <div className="card">
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '16px' }}>⚡ Acciones rápidas</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              ...(user?.role !== 'alumno' && user?.role !== 'apoderado' ? [
                { to: '/grades', icon: '✏️', label: 'Registrar calificaciones', color: '#dbeafe' },
                { to: '/courses', icon: '📋', label: 'Ver cursos', color: '#d1fae5' },
              ] : []),
              { to: '/reports', icon: '📊', label: 'Ver reportes', color: '#fef3c7' },
              ...(user?.role === 'admin' || user?.role === 'directivo' ? [
                { to: '/users', icon: '👥', label: 'Gestionar usuarios', color: '#ede9fe' },
                { to: '/parameters', icon: '⚙️', label: 'Configurar colegio', color: '#fee2e2' },
              ] : []),
            ].map((item, i) => (
              <Link key={i} to={item.to} style={{ textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 12px', borderRadius: '10px',
                  background: item.color, transition: 'opacity 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                  <span style={{ fontSize: '18px' }}>{item.icon}</span>
                  <span style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b' }}>{item.label}</span>
                  <span style={{ marginLeft: 'auto', color: '#64748b' }}>→</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
