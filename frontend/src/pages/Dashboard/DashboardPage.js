import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Icono } from '../../components/Layout/iconos';
import './DashboardPage.css';

const SALUDO = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
};

const FECHA = () => new Date().toLocaleDateString('es-CL', {
  weekday: 'long', day: 'numeric', month: 'long',
});

export default function DashboardPage() {
  const { user, school } = useAuth();
  const year = new Date().getFullYear();

  const [resumen, setResumen] = useState(null);
  const [cursos, setCursos] = useState([]);
  const [carga, setCarga] = useState(null);
  const [cargando, setCargando] = useState(true);

  const gestiona = ['admin', 'directivo'].includes(user?.role);
  const docente = user?.role === 'profesor';

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!['admin', 'directivo', 'profesor'].includes(user?.role)) {
        return setCargando(false);
      }
      // Cada fuente va por su lado: si una falla, el resto del panel se ve igual
      const pedir = (url) => axios.get(url).then(r => r.data).catch(() => null);
      const [s, c, k] = await Promise.all([
        pedir('/api/reports/school/summary'),
        pedir('/api/courses'),
        gestiona ? pedir(`/api/carga-academica/dashboard?year=${year + 1}`) : null,
      ]);
      if (!vivo) return;
      setResumen(s);
      setCursos(Array.isArray(c) ? c : []);
      setCarga(k);
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [user, gestiona, year]);

  if (cargando) return <div className="loading-container"><div className="spinner" /></div>;

  const alertas = carga?.alertas || [];
  const cob = carga?.resumen;

  const indicadores = [
    { et: 'Estudiantes', val: resumen?.total_students ?? '—', ico: 'familia',
      color: '#3b4fd8', fondo: '#eef1fe', nota: 'matriculados y activos' },
    { et: 'Docentes', val: resumen?.total_teachers ?? '—', ico: 'personas',
      color: '#2f7d4f', fondo: '#eaf7ef', nota: 'con cuenta en la plataforma' },
    { et: 'Cursos', val: resumen?.total_courses ?? '—', ico: 'libro',
      color: '#6d4ed8', fondo: '#f1eefe', nota: `año lectivo ${year}` },
    { et: 'Requieren atención', val: alertas.length, ico: 'reloj',
      color: alertas.length ? '#b91c1c' : '#2f7d4f',
      fondo: alertas.length ? '#fee2e2' : '#eaf7ef',
      nota: alertas.length ? 'en la carga académica' : 'sin pendientes' },
  ];

  return (
    <div className="kv-panel">

      <div className="kv-saludo">
        <div>
          <h2>{SALUDO()}, {user?.first_name}</h2>
          <p>{FECHA()} · {school?.name}</p>
        </div>
        <div className="kv-saludo-acc">
          {(gestiona || docente) && (
            <Link to="/grades" className="kv-btn kv-btn-p">
              <Icono nombre="lapiz" tam={15} /> Registrar notas
            </Link>
          )}
        </div>
      </div>

      {/* Indicadores */}
      <div className="kv-kpis">
        {indicadores.map(k => (
          <div className="kv-kpi" key={k.et}>
            <div className="cab">
              <span className="et">{k.et}</span>
              <span className="ico" style={{ background: k.fondo, color: k.color }}>
                <Icono nombre={k.ico} tam={15} />
              </span>
            </div>
            <b>{k.val}</b>
            <span className="nota">{k.nota}</span>
          </div>
        ))}
      </div>

      <div className="kv-rejilla">

        {/* Cobertura de la carga */}
        {gestiona && (
          <div className="card kv-tarj">
            <div className="kv-tarj-cab">
              <div>
                <h3>Carga académica {year + 1}</h3>
                <p>Cobertura por asignatura</p>
              </div>
              {cob?.total_demanda > 0 && (
                <span className={`kv-pill ${cob.cobertura_pct >= 100 ? 'v' : 'a'}`}>
                  {cob.cobertura_pct}% repartido
                </span>
              )}
              <Link to="/carga-academica" className="kv-mas">Ver detalle →</Link>
            </div>

            {!carga?.por_asignatura?.length ? (
              <p className="kv-vacio">
                Todavía no hay demanda de horas definida para {year + 1}.{' '}
                <Link to="/carga-academica">Abrir el proceso →</Link>
              </p>
            ) : (
              <div className="kv-barras">
                {carga.por_asignatura.slice(0, 6).map(a => {
                  const falta = a.horas_faltantes;
                  const col = falta === 0 ? '#2f7d4f' : falta < 0 ? '#b91c1c' : '#b45309';
                  return (
                    <div className="kv-barra" key={a.asignatura}>
                      <span className="nom" title={a.asignatura}>{a.asignatura}</span>
                      <span className="pista">
                        <i style={{ width: `${Math.min(a.cobertura_pct, 100)}%`,
                          background: falta === 0 ? '#7cc496' : '#3b4fd8' }} />
                      </span>
                      <span className="cif" style={{ color: col }}>
                        {a.horas_asignadas}/{a.horas_demanda}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Pendientes */}
        {gestiona && (
          <div className="card kv-tarj">
            <div className="kv-tarj-cab">
              <div>
                <h3>Requiere tu atención</h3>
                <p>{alertas.length
                  ? `${alertas.length} ${alertas.length === 1 ? 'asunto abierto' : 'asuntos abiertos'}`
                  : 'Nada pendiente'}</p>
              </div>
            </div>

            {!alertas.length ? (
              <p className="kv-vacio kv-ok">
                No hay descuadres en la carga académica.
              </p>
            ) : (
              <div className="kv-pends">
                {alertas.slice(0, 5).map((a, i) => (
                  <Link to="/carga-academica" className="kv-pend" key={i}>
                    <span className="mk" style={{
                      background: a.tipo === 'descuadre' ? '#fee2e2' : '#fef3c7',
                      color: a.tipo === 'descuadre' ? '#b91c1c' : '#b45309' }}>
                      <Icono nombre="reloj" tam={14} />
                    </span>
                    <span className="txt">{a.mensaje}</span>
                    <span className="ir">›</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Cursos */}
        <div className="card kv-tarj">
          <div className="kv-tarj-cab">
            <div>
              <h3>{docente ? 'Mis cursos' : 'Cursos del establecimiento'}</h3>
              <p>Año lectivo {year}</p>
            </div>
            <Link to="/courses" className="kv-mas">Ver todos →</Link>
          </div>

          {!cursos.length ? (
            <p className="kv-vacio">
              Todavía no hay cursos creados para {year}.{' '}
              <Link to="/courses">Crear el primero →</Link>
            </p>
          ) : (
            <div className="kv-cursos">
              {cursos.slice(0, 6).map(c => (
                <Link to={`/courses/${c.id}`} className="kv-curso" key={c.id}>
                  <span className="nom">{c.name}</span>
                  <span className="dato">
                    {c.student_count ?? 0} {c.student_count === 1 ? 'estudiante' : 'estudiantes'}
                  </span>
                  {c.head_teacher && (
                    <span className="jefe">
                      {c.head_teacher.first_name} {c.head_teacher.last_name}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Accesos */}
        <div className="card kv-tarj">
          <div className="kv-tarj-cab"><div><h3>Accesos rápidos</h3></div></div>
          <div className="kv-accesos">
            {[
              { to: '/grades', ico: 'lapiz', t1: 'Registrar', t2: 'calificaciones' },
              gestiona && { to: '/matricula', ico: 'lista', t1: 'Matricular', t2: 'alumnos' },
              gestiona && { to: '/carga-academica', ico: 'reloj', t1: 'Repartir', t2: `carga ${year + 1}` },
              { to: '/reports', ico: 'grafico', t1: 'Generar', t2: 'reportes' },
              { to: '/convivencia', ico: 'convivencia', t1: 'Convivencia', t2: 'escolar' },
              { to: '/ocr-annotations', ico: 'escanear', t1: 'Escanear', t2: 'anotaciones' },
            ].filter(Boolean).slice(0, 6).map(a => (
              <Link to={a.to} className="kv-acc" key={a.to}>
                <span className="ic"><Icono nombre={a.ico} tam={15} /></span>
                <span>{a.t1}<br />{a.t2}</span>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
