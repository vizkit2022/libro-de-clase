import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import UserAvatar, { avatarColor } from '../../components/UserAvatar/UserAvatar';

export default function ApoderadoPage() {
  const { user, school } = useAuth();
  const primary = '#2B1B14'; // color del sistema recreo.edu, igual para todos los colegios

  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lifeData, setLifeData] = useState({});   // { student_id: { grades, annotations, enrollments } }

  useEffect(() => {
    if (!user) return;
    axios.get(`/api/users/${user.id}/students`)
      .then(({ data }) => {
        setStudents(data);
        // Cargar hoja de vida de cada alumno
        data.forEach(s => {
          axios.get(`/api/reports/student/${s.id}/life`)
            .then(({ data: life }) => {
              setLifeData(prev => ({ ...prev, [s.id]: life }));
            })
            .catch(() => {});
        });
      })
      .catch(() => setStudents([]))
      .finally(() => setLoading(false));
  }, [user]);

  // avatarColor imported from UserAvatar

  // Agrupa notas por asignatura y calcula promedio
  const buildSubjectSummary = (life) => {
    if (!life?.grades?.length) return [];
    const bySubject = {};
    life.grades.forEach(g => {
      const key = g.subject_name || 'Sin asignatura';
      if (!bySubject[key]) bySubject[key] = [];
      bySubject[key].push(g.value);
    });
    return Object.entries(bySubject).map(([name, vals]) => ({
      name,
      avg: vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : null
    })).sort((a, b) => a.name.localeCompare(b.name));
  };

  const calcPromedioGeneral = (subjects) => {
    const avgs = subjects.map(s => s.avg).filter(a => a !== null);
    if (!avgs.length) return null;
    return (avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(1);
  };

  const colorNota = (nota) => {
    if (nota === null || nota === undefined) return '#9C8A7E';
    const n = parseFloat(nota);
    if (n >= 6.0) return '#2F7D5B';
    if (n >= 5.0) return '#2B1B14';
    if (n >= 4.0) return '#E8A317';
    return '#B8321B';
  };

  const getCourseFromEnrollments = (life, s) => {
    return life?.enrollments?.[0]?.course_name || s?.course_name || null;
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">🏠 Mis alumnos</h1>
          <p className="page-subtitle">
            Hola, {user?.first_name}. Aquí puedes hacer seguimiento a tus alumnos: calificaciones publicadas por sus profesores y anotaciones. Esta vista es solo de lectura.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="loading-container"><div className="spinner" /></div>
      ) : students.length === 0 ? (
        <div className="card">
          <div className="illustration-area">
            <div className="illustration">👨‍👧</div>
            <h3>Sin alumnos asignados</h3>
            <p>Comunícate con la administración del colegio para que te asignen alumnos.</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
          {students.map(s => {
            const life = lifeData[s.id];
            const subjects = life ? buildSubjectSummary(life) : [];
            const prom = calcPromedioGeneral(subjects);
            const annotations = life?.annotations || [];
            const posCount = annotations.filter(a => a.annotation_type === 'positiva').length;
            const negCount = annotations.filter(a => a.annotation_type === 'negativa').length;
            const courseName = getCourseFromEnrollments(life, s);

            return (
              <div key={s.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>

                {/* Cabecera del alumno */}
                <div style={{
                  background: `linear-gradient(135deg, ${primary}22, ${primary}08)`,
                  borderBottom: `3px solid ${primary}`,
                  padding: '20px 20px 16px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <UserAvatar
                      userId={s.id}
                      firstName={s.first_name}
                      lastName={s.last_name}
                      hasPhoto={s.has_photo}
                      size={52}
                      color={avatarColor(s.id)}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 700, fontSize: 16, color: '#2B1B14', margin: 0 }}>
                        {s.first_name} {s.last_name}
                      </p>
                      {courseName && (
                        <p style={{ fontSize: 12, color: '#6B5446', margin: '2px 0 0' }}>
                          📚 {courseName}{s.relationship ? ` · ${s.relationship}` : ''}
                        </p>
                      )}
                      {!life && (
                        <p style={{ fontSize: 12, color: '#9C8A7E', margin: '2px 0 0' }}>Cargando...</p>
                      )}
                    </div>
                    {prom !== null && (
                      <div style={{
                        textAlign: 'center',
                        background: '#fff',
                        borderRadius: 10,
                        padding: '6px 14px',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                        flexShrink: 0
                      }}>
                        <p style={{
                          fontSize: 24, fontWeight: 800,
                          color: colorNota(prom),
                          margin: 0, lineHeight: 1
                        }}>
                          {prom}
                        </p>
                        <p style={{ fontSize: 10, color: '#9C8A7E', margin: '2px 0 0', textTransform: 'uppercase' }}>prom.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Resumen por asignatura */}
                <div style={{ padding: '14px 20px' }}>
                  {subjects.length > 0 ? (
                    <>
                      <p style={{
                        fontSize: 11, fontWeight: 700, color: '#9C8A7E',
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                        margin: '0 0 8px'
                      }}>
                        Asignaturas
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {subjects.slice(0, 5).map(sub => (
                          <div key={sub.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, color: '#5C463A', flex: 1 }}>{sub.name}</span>
                            {/* Barra de progreso visual */}
                            <div style={{ width: 60, height: 5, background: '#F3F0EC', borderRadius: 3, overflow: 'hidden' }}>
                              {sub.avg !== null && (
                                <div style={{
                                  width: `${(sub.avg / 7) * 100}%`,
                                  height: '100%',
                                  background: colorNota(sub.avg),
                                  borderRadius: 3
                                }} />
                              )}
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: colorNota(sub.avg), minWidth: 28, textAlign: 'right' }}>
                              {sub.avg !== null ? sub.avg.toFixed(1) : '—'}
                            </span>
                          </div>
                        ))}
                        {subjects.length > 5 && (
                          <p style={{ fontSize: 12, color: '#9C8A7E', margin: '4px 0 0' }}>
                            + {subjects.length - 5} asignatura(s) más
                          </p>
                        )}
                      </div>
                    </>
                  ) : life ? (
                    <p style={{ fontSize: 13, color: '#9C8A7E', textAlign: 'center', padding: '6px 0' }}>
                      Sin calificaciones publicadas aún
                    </p>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', padding: '6px 0' }}>
                      <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                      <span style={{ fontSize: 13, color: '#9C8A7E' }}>Cargando notas...</span>
                    </div>
                  )}
                </div>

                {/* Anotaciones */}
                {(posCount > 0 || negCount > 0) && (
                  <div style={{ padding: '0 20px 12px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {posCount > 0 && (
                      <span style={{
                        fontSize: 12, background: '#DDF0E6', color: '#1F5E43',
                        borderRadius: 6, padding: '3px 10px', fontWeight: 600
                      }}>
                        ✅ {posCount} positiva{posCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {negCount > 0 && (
                      <span style={{
                        fontSize: 12, background: '#FEF1EB', color: '#9A3412',
                        borderRadius: 6, padding: '3px 10px', fontWeight: 600
                      }}>
                        ⚠️ {negCount} negativa{negCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                )}

                {/* Botón de acción */}
                <div style={{
                  padding: '12px 20px',
                  borderTop: '1px solid #F3F0EC',
                }}>
                  <Link
                    to={`/students/${s.id}/life`}
                    style={{
                      display: 'block',
                      textAlign: 'center',
                      padding: '9px 0',
                      background: primary,
                      color: '#fff',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    📋 Ver hoja de vida completa
                  </Link>
                  <Link
                    to={`/students/${s.id}/ficha`}
                    style={{
                      display: 'block', textAlign: 'center', padding: '8px 0', marginTop: 8,
                      background: '#fff', color: primary, border: `1px solid ${primary}55`,
                      borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none',
                    }}
                  >
                    🗂️ Ver ficha
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
