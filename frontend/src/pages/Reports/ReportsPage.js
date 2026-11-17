import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const gradeClass = (v) => v >= 6 ? 'nota-alta' : v >= 4 ? 'nota-media' : 'nota-baja';

export default function ReportsPage() {
  const { school } = useAuth();
  const primary = '#2B1B14'; // color del sistema recreo.edu, igual para todos los colegios
  const [tab, setTab] = useState('course');
  const [courses, setCourses] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [report, setReport] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const [c, p, s] = await Promise.all([
        axios.get('/api/courses/'),
        axios.get('/api/periods/'),
        axios.get('/api/reports/school/summary'),
      ]);
      setCourses(c.data);
      setPeriods(p.data);
      setSummary(s.data);
      const active = p.data.find(x => x.is_active) || p.data[0];
      if (active) setSelectedPeriod(String(active.id));
    };
    fetch();
  }, []);

  const loadCourseReport = async () => {
    if (!selectedCourse) return;
    setLoading(true);
    try {
      const url = `/api/reports/course/${selectedCourse}/grades${selectedPeriod ? `?period_id=${selectedPeriod}` : ''}`;
      const { data } = await axios.get(url);
      setReport(data);
    } finally { setLoading(false); }
  };

  const handlePrint = () => window.print();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">📊 Reportes</h1>
          <p className="page-subtitle">Informes académicos y resúmenes</p>
        </div>
        {report && (
          <button className="btn btn-secondary" onClick={handlePrint}>🖨️ Imprimir</button>
        )}
      </div>

      {/* Resumen general */}
      {summary && (
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          {[
            { icon: '🎓', label: 'Estudiantes', value: summary.total_students, bg: '#FCE4EC', col: '#8A2846' },
            { icon: '👨‍🏫', label: 'Profesores', value: summary.total_teachers, bg: '#FFF0C7', col: '#3D2A21' },
            { icon: '📚', label: 'Cursos activos', value: summary.total_courses, bg: '#DDF0E6', col: '#1F5E43' },
            { icon: '⭐', label: 'Anotaciones positivas', value: summary.annotations_positive, bg: '#FFF0C7', col: '#7A4B00' },
            { icon: '⚠️', label: 'Anotaciones negativas', value: summary.annotations_negative, bg: '#FDE2D7', col: '#B8321B' },
          ].map((s, i) => (
            <div key={i} className="stat-card">
              <div className="stat-icon" style={{ background: s.bg, color: s.col }}>{s.icon}</div>
              <div className="stat-info"><h3>{s.value}</h3><p>{s.label}</p></div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs de reportes */}
      <div className="tabs">
        <button className={`tab ${tab === 'course' ? 'active' : ''}`} onClick={() => setTab('course')}>📋 Informe de curso</button>
        <button className={`tab ${tab === 'students' ? 'active' : ''}`} onClick={() => setTab('students')}>👥 Hojas de vida</button>
      </div>

      {tab === 'course' && (
        <div>
          {/* Selector */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ minWidth: 200 }}>
                <label>Curso</label>
                <select value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)}>
                  <option value="">Seleccionar curso...</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ minWidth: 200 }}>
                <label>Período</label>
                <select value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)}>
                  <option value="">Todos los períodos</option>
                  {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <button className="btn btn-primary" onClick={loadCourseReport} style={{ background: primary }}>
                🔍 Generar informe
              </button>
            </div>
          </div>

          {loading && <div className="loading-container"><div className="spinner" /></div>}

          {report && !loading && (
            <div className="card" id="report-print">
              {/* Header del informe */}
              <div style={{ textAlign: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '2px solid #ECE8E3' }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#2B1B14' }}>
                  Informe de Calificaciones
                </h2>
                <p style={{ fontSize: 16, fontWeight: 600, color: '#5C463A', marginTop: 4 }}>{report.course?.name}</p>
                <p style={{ fontSize: 13, color: '#9C8A7E', marginTop: 4 }}>
                  {school?.name} · {periods.find(p => String(p.id) === selectedPeriod)?.name || 'Todos los períodos'}
                </p>
              </div>

              {/* Tabla de notas */}
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Alumno</th>
                      {report.students?.[0]?.subjects?.map((s, i) => (
                        <th key={i} style={{ textAlign: 'center', fontSize: 11 }}>{s.subject?.split(' ')[0] || s.subject}</th>
                      ))}
                      <th style={{ textAlign: 'center' }}>Promedio Gral.</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.students?.map((s, i) => (
                      <tr key={i}>
                        <td style={{ color: '#9C8A7E', fontWeight: 600 }}>{i+1}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="avatar-sm" style={{ background: primary }}>{s.student?.first_name?.[0]}{s.student?.last_name?.[0]}</div>
                            <Link to={`/students/${s.student?.id}/life`} style={{ fontWeight: 600, fontSize: 13, color: primary, textDecoration: 'none' }}
                              onMouseEnter={ev => ev.target.style.textDecoration='underline'}
                              onMouseLeave={ev => ev.target.style.textDecoration='none'}>
                              {s.student?.first_name} {s.student?.last_name}
                            </Link>
                          </div>
                        </td>
                        {s.subjects?.map((subj, j) => (
                          <td key={j} style={{ textAlign: 'center' }}>
                            {subj.average > 0
                              ? <span className={`nota-chip ${gradeClass(subj.average)}`}>{subj.average}</span>
                              : <span style={{ color: '#D9D2CA' }}>—</span>}
                          </td>
                        ))}
                        <td style={{ textAlign: 'center' }}>
                          {s.general_average > 0
                            ? <span className={`nota-chip ${gradeClass(s.general_average)}`} style={{ fontWeight: 800 }}>{s.general_average}</span>
                            : <span style={{ color: '#D9D2CA' }}>—</span>}
                        </td>
                        <td>
                          <Link to={`/students/${s.student?.id}/life`} className="btn btn-secondary btn-sm">📋</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Estadísticas */}
              <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                {(() => {
                  const avgs = report.students?.map(s => s.general_average).filter(a => a > 0) || [];
                  if (!avgs.length) return null;
                  const best = Math.max(...avgs);
                  const worst = Math.min(...avgs);
                  const mean = (avgs.reduce((a,b) => a+b, 0) / avgs.length).toFixed(1);
                  const approved = avgs.filter(a => a >= 4).length;
                  return [
                    ['🏆', 'Mejor promedio', best.toFixed(1), '#DDF0E6'],
                    ['📈', 'Promedio del curso', mean, '#FFF0C7'],
                    ['✅', 'Aprobados', `${approved}/${avgs.length}`, '#DDF0E6'],
                    ['❌', 'En riesgo', `${avgs.length - approved}/${avgs.length}`, '#FDE2D7'],
                  ].map(([ic, lbl, val, bg], i) => (
                    <div key={i} style={{ background: bg, borderRadius: 12, padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 22 }}>{ic}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#2B1B14' }}>{val}</div>
                      <div style={{ fontSize: 11, color: '#6B5446', fontWeight: 500 }}>{lbl}</div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'students' && (
        <div className="card">
          <h3 style={{ fontWeight: 700, marginBottom: 16 }}>Alumnos con hoja de vida</h3>
          {courses.length === 0 ? (
            <div className="illustration-area"><div className="illustration">👥</div><h3>Sin alumnos</h3></div>
          ) : (
            <div>
              {courses.map(course => (
                <div key={course.id} style={{ marginBottom: 20 }}>
                  <h4 style={{ fontWeight: 700, color: primary, marginBottom: 10, fontSize: 14 }}>{course.name}</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                    {/* Placeholder: aquí vendría la lista de alumnos del curso */}
                    <Link to={`/courses/${course.id}`} style={{ textDecoration: 'none' }}>
                      <div style={{ padding: '10px 14px', borderRadius: 10, background: '#F7F6F4', border: '1px solid #ECE8E3',
                        display: 'flex', alignItems: 'center', gap: 10, color: '#5C463A', fontSize: 13, fontWeight: 500 }}>
                        <span>📋</span> Ver alumnos de {course.name}
                      </div>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
