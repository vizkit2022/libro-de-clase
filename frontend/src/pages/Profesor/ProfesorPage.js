import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import UserAvatar, { avatarColor } from '../../components/UserAvatar/UserAvatar';

function getSubjectEmoji(name) {
  if (!name) return '📖';
  const lower = name.toLowerCase();
  if (lower.includes('matem')) return '🔢';
  if (lower.includes('lenguaje') || lower.includes('comunicac')) return '📝';
  if (lower.includes('historia') || lower.includes('geograf')) return '🌍';
  if (lower.includes('ciencias')) return '🔬';
  if (lower.includes('ingl')) return '🇬🇧';
  if (lower.includes('fís') || lower.includes('fis') || lower.includes('educación f')) return '⚽';
  if (lower.includes('artes')) return '🎨';
  if (lower.includes('música') || lower.includes('musica')) return '🎵';
  if (lower.includes('tecnol')) return '💻';
  return '📚';
}

export default function ProfesorPage() {
  const { user, school } = useAuth();
  const navigate = useNavigate();
  const primary = '#2B1B14'; // color del sistema recreo.edu, igual para todos los colegios

  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCourse, setExpandedCourse] = useState(null);

  useEffect(() => {
    if (!user) return;
    axios.get(`/api/users/${user.id}/courses`)
      .then(({ data }) => {
        setCourses(data);
        // Auto-expandir si hay solo un curso
        if (data.length === 1) setExpandedCourse(data[0].id);
      })
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, [user]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  const totalStudents = courses.reduce((sum, c) => sum + (c.students?.length || 0), 0);
  const headCourses = courses.filter(c => c.is_head_teacher).length;

  if (loading) return (
    <div className="loading-container"><div className="spinner" /></div>
  );

  return (
    <div>
      {/* Banner de bienvenida */}
      <div style={{
        background: `linear-gradient(135deg, ${primary} 0%, ${primary}cc 100%)`,
        borderRadius: 20,
        padding: '28px 32px',
        marginBottom: 28,
        color: 'white',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ position: 'relative', zIndex: 2 }}>
          <p style={{ fontSize: 14, opacity: 0.85, marginBottom: 6 }}>{greeting} ☀️</p>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px' }}>
            Prof. {user?.first_name} {user?.last_name}
          </h1>
          <p style={{ opacity: 0.85, fontSize: 13, margin: 0 }}>
            {school?.name} · {new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div style={{ position: 'absolute', right: 24, top: '50%', transform: 'translateY(-50%)', fontSize: 72, opacity: 0.12, zIndex: 1 }}>
          👨‍🏫
        </div>
      </div>

      {/* Resumen rápido */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 28 }}>
        {[
          { icon: '📚', label: 'Mis cursos', value: courses.length, bg: '#FCE4EC', color: '#8A2846' },
          { icon: '⭐', label: 'Profesor jefe', value: headCourses, bg: '#FFF0C7', color: '#7A4B00' },
          { icon: '🎓', label: 'Total alumnos', value: totalStudents, bg: '#DDF0E6', color: '#1F5E43' },
          { icon: '📖', label: 'Asignaturas', value: courses.reduce((s, c) => s + (c.my_subjects?.length || 0), 0), bg: '#FFF0C7', color: '#9A3412' },
        ].map((stat, i) => (
          <div key={i} className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
              {stat.icon}
            </div>
            <div>
              <p style={{ fontSize: 24, fontWeight: 800, color: stat.color, margin: 0, lineHeight: 1 }}>{stat.value}</p>
              <p style={{ fontSize: 12, color: '#6B5446', margin: '3px 0 0' }}>{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Mis cursos */}
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#2B1B14' }}>📚 Mis cursos</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6B5446' }}>Año {new Date().getFullYear()}</p>
        </div>
        <Link to="/courses" style={{
          padding: '8px 18px', background: primary, color: '#fff',
          borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none'
        }}>
          Ver todos los cursos →
        </Link>
      </div>

      {courses.length === 0 ? (
        <div className="card">
          <div className="illustration-area">
            <div className="illustration">📋</div>
            <h3>Sin cursos asignados</h3>
            <p>Comunícate con la administración para que te asignen cursos o asignaturas.</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {courses.map(course => {
            const isExpanded = expandedCourse === course.id;
            return (
              <div key={course.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>

                {/* Cabecera del curso */}
                <div
                  style={{
                    padding: '18px 24px',
                    cursor: 'pointer',
                    background: isExpanded ? `${primary}08` : 'white',
                    borderBottom: isExpanded ? `1px solid ${primary}20` : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    transition: 'background 0.2s'
                  }}
                  onClick={() => setExpandedCourse(isExpanded ? null : course.id)}
                >
                  {/* Ícono del curso */}
                  <div style={{
                    width: 52, height: 52, borderRadius: 14,
                    background: `linear-gradient(135deg, ${primary}, ${primary}aa)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontWeight: 800, fontSize: 18, flexShrink: 0
                  }}>
                    {course.level || course.name?.charAt(0) || '?'}
                  </div>

                  {/* Info principal */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <h3 style={{ fontWeight: 700, fontSize: 17, color: '#2B1B14', margin: 0 }}>
                        {course.name}
                      </h3>
                      {course.is_head_teacher && (
                        <span style={{
                          fontSize: 11, fontWeight: 700,
                          background: '#FFF0C7', color: '#7A4B00',
                          padding: '2px 10px', borderRadius: 20,
                          border: '1px solid #FFE29A'
                        }}>
                          ⭐ Profesor Jefe
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, color: '#6B5446' }}>
                        🎓 {course.students?.length || 0} alumno{course.students?.length !== 1 ? 's' : ''}
                      </span>
                      {course.my_subjects?.length > 0 && (
                        <span style={{ fontSize: 13, color: '#6B5446' }}>
                          📖 {course.my_subjects.map(s => s.subject?.name).filter(Boolean).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Acciones rápidas */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <Link
                      to={`/courses/${course.id}`}
                      style={{
                        padding: '6px 14px', background: `${primary}15`, color: primary,
                        borderRadius: 7, fontSize: 12, fontWeight: 600, textDecoration: 'none',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Ver curso
                    </Link>
                    <Link
                      to={`/grades?course=${course.id}`}
                      style={{
                        padding: '6px 14px', background: primary, color: '#fff',
                        borderRadius: 7, fontSize: 12, fontWeight: 600, textDecoration: 'none',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      ✏️ Calificar
                    </Link>
                  </div>

                  {/* Chevron */}
                  <span style={{ color: '#9C8A7E', fontSize: 14, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none', flexShrink: 0 }}>
                    ▼
                  </span>
                </div>

                {/* Panel expandido: mis asignaturas + alumnos */}
                {isExpanded && (
                  <div style={{ padding: '20px 24px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>

                      {/* Mis asignaturas en este curso */}
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#9C8A7E', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
                          Mis asignaturas
                        </p>
                        {course.my_subjects?.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {course.my_subjects.map(cs => (
                              <div key={cs.id} style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 14px', borderRadius: 10,
                                background: cs.subject?.color ? `${cs.subject.color}15` : '#F7F6F4',
                                border: `1px solid ${cs.subject?.color || '#ECE8E3'}30`
                              }}>
                                <span style={{ fontSize: 18 }}>{getSubjectEmoji(cs.subject?.name)}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontWeight: 600, fontSize: 13, color: '#2B1B14', margin: 0 }}>
                                    {cs.subject?.name || 'Sin nombre'}
                                  </p>
                                  {cs.hours_per_week && (
                                    <p style={{ fontSize: 11, color: '#9C8A7E', margin: '2px 0 0' }}>
                                      {cs.hours_per_week}h/semana
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{
                            padding: '14px', borderRadius: 10, background: '#F7F6F4',
                            textAlign: 'center'
                          }}>
                            <p style={{ fontSize: 13, color: '#9C8A7E', margin: 0 }}>
                              Eres Profesor Jefe de este curso sin asignaturas específicas asignadas.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Lista de alumnos */}
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#9C8A7E', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
                          Alumnos ({course.students?.length || 0})
                        </p>
                        {course.students?.length > 0 ? (
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                            gap: 8,
                            maxHeight: 260,
                            overflowY: 'auto'
                          }}>
                            {course.students.map(enrollment => {
                              const s = enrollment.student || enrollment;
                              return (
                                <Link
                                  key={enrollment.id || s.id}
                                  to={`/students/${s.id}/life`}
                                  style={{ textDecoration: 'none' }}
                                >
                                  <div style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '8px 12px', borderRadius: 8,
                                    background: '#F7F6F4', cursor: 'pointer',
                                    border: '1px solid transparent',
                                    transition: 'all 0.15s'
                                  }}
                                    onMouseEnter={e => { e.currentTarget.style.background = `${primary}10`; e.currentTarget.style.borderColor = `${primary}30`; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = '#F7F6F4'; e.currentTarget.style.borderColor = 'transparent'; }}
                                  >
                                    <UserAvatar
                                      userId={s.id}
                                      firstName={s.first_name}
                                      lastName={s.last_name}
                                      hasPhoto={s.has_photo}
                                      size={30}
                                      color={avatarColor(s.id)}
                                    />
                                    <div style={{ minWidth: 0 }}>
                                      <p style={{ fontWeight: 600, fontSize: 12, color: '#2B1B14', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {s.last_name}, {s.first_name}
                                      </p>
                                    </div>
                                  </div>
                                </Link>
                              );
                            })}
                          </div>
                        ) : (
                          <p style={{ fontSize: 13, color: '#9C8A7E', padding: '14px 0' }}>
                            No hay alumnos matriculados en este curso.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
