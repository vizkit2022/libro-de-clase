import React, { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import UserAvatar, { avatarColor } from '../UserAvatar/UserAvatar';
import { Icono } from './iconos';
import './Layout.css';

const ROLES = {
  admin: 'Administrador',
  directivo: 'Directivo',
  profesor: 'Docente',
  apoderado: 'Apoderado',
  alumno: 'Alumno',
};

// El menú va agrupado: con catorce entradas planas cuesta encontrar nada.
const SECCIONES = [
  {
    titulo: 'General',
    items: [
      { to: '/dashboard', icono: 'panel', label: 'Panel', roles: ['admin', 'directivo', 'alumno'] },
      { to: '/onboarding', icono: 'cohete', label: 'Puesta en marcha', roles: ['admin', 'directivo'] },
      { to: '/mis-cursos', icono: 'pizarra', label: 'Mis cursos', roles: ['profesor'] },
      { to: '/apoderado', icono: 'familia', label: 'Mis alumnos', roles: ['apoderado'] },
      { to: '/users', icono: 'personas', label: 'Usuarios', roles: ['admin', 'directivo'] },
      { to: '/parameters', icono: 'colegio', label: 'Colegio', roles: ['admin', 'directivo'] },
      { to: '/anios', icono: 'calendario', label: 'Años académicos', roles: ['admin', 'directivo'] },
      { to: '/auditoria', icono: 'historial', label: 'Auditoría', roles: ['admin'] },
    ],
  },
  {
    titulo: 'Gestión pedagógica',
    items: [
      { to: '/courses', icono: 'libro', label: 'Cursos', roles: ['admin', 'directivo', 'profesor'] },
      { to: '/matricula', icono: 'lista', label: 'Matrícula', roles: ['admin', 'directivo'] },
      { to: '/students/import', icono: 'lista', label: 'Libro de Matrícula', roles: ['admin', 'directivo'] },
      { to: '/subjects', icono: 'libros', label: 'Asignaturas', roles: ['admin', 'directivo', 'profesor'] },
      { to: '/periods', icono: 'calendario', label: 'Períodos', roles: ['admin', 'directivo'] },
    ],
  },
  {
    titulo: 'Gestión docente',
    items: [
      { to: '/grades', icono: 'lapiz', label: 'Calificaciones', roles: ['admin', 'directivo', 'profesor'] },
      { to: '/personalidad', icono: 'informe', label: 'Informe de personalidad', roles: ['admin', 'directivo', 'profesor'] },
    ],
  },
  {
    titulo: 'Planificación',
    items: [
      { to: '/carga-academica', icono: 'reloj', label: 'Carga Académica', roles: ['admin', 'directivo'] },
      { to: '/convivencia', icono: 'convivencia', label: 'Convivencia', roles: ['admin', 'directivo', 'profesor'] },
    ],
  },
  {
    titulo: 'Información',
    items: [
      { to: '/reports', icono: 'grafico', label: 'Reportes', roles: ['admin', 'directivo', 'profesor'] },
      { to: '/ocr-annotations', icono: 'escanear', label: 'Escanear anotaciones', roles: ['admin', 'directivo', 'profesor'] },
    ],
  },
];

// Título de la barra superior según la ruta
const TITULOS = {
  '/dashboard': ['General', 'Panel'],
  '/onboarding': ['General', 'Puesta en marcha'],
  '/mis-cursos': ['General', 'Mis cursos'],
  '/apoderado': ['General', 'Mis alumnos'],
  '/users': ['General', 'Usuarios'],
  '/parameters': ['General', 'Colegio'],
  '/anios': ['General', 'Años académicos'],
  '/auditoria': ['General', 'Historial de accesos y cambios'],
  '/courses': ['Gestión pedagógica', 'Cursos'],
  '/matricula': ['Gestión pedagógica', 'Matrícula'],
  '/students/import': ['Gestión pedagógica', 'Importar Libro de Matrícula'],
  '/students': ['Gestión pedagógica', 'Ficha del alumno'],
  '/subjects': ['Gestión pedagógica', 'Asignaturas'],
  '/grades': ['Gestión docente', 'Calificaciones'],
  '/periods': ['Gestión pedagógica', 'Períodos'],
  '/personalidad': ['Gestión docente', 'Informe de personalidad'],
  '/personalidad/pauta': ['Gestión docente', 'Pauta del informe de personalidad'],
  '/carga-academica': ['Planificación', 'Carga Académica'],
  '/convivencia': ['Planificación', 'Convivencia Escolar'],
  '/reports': ['Información', 'Reportes'],
  '/ocr-annotations': ['Información', 'Escanear anotaciones'],
};

function tituloDe(ruta) {
  const exacto = TITULOS[ruta];
  if (exacto) return exacto;
  // Rutas con parámetros: /courses/3, /convivencia/casos/7
  const base = Object.keys(TITULOS)
    .filter(k => ruta.startsWith(k + '/'))
    .sort((a, b) => b.length - a.length)[0];
  return base ? TITULOS[base] : ['', 'Recreo Edu'];
}

const ROLES_CON_ANIO = ['admin', 'directivo', 'profesor'];

// Selector del año académico con el que se trabaja en toda la plataforma.
function SelectorAnio({ anio, anios, setAnio, puedeGestionar, onGestionar }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    const esc = (e) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('touchstart', fuera);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('touchstart', fuera);
      document.removeEventListener('keydown', esc);
    };
  }, [abierto]);

  // Sin respuesta del servidor igual se muestra el año en uso
  const lista = anios.length ? anios : [{ year: anio, estado: 'abierto' }];
  const actual = lista.find(a => a.year === anio);
  const cerrado = actual?.estado === 'cerrado';

  return (
    <div className="kv-anio" ref={ref}>
      <button type="button" className="kv-anio-btn" aria-haspopup="listbox" aria-expanded={abierto}
        title={cerrado ? `El año ${anio} está cerrado: solo lectura` : `Año académico ${anio}`}
        onClick={() => setAbierto(v => !v)}>
        <span className="kv-anio-et">Año acad.</span>
        <b>{anio}</b>
        {cerrado && <span className="kv-anio-candado" aria-label="Cerrado"><Icono nombre="candado" tam={13} /></span>}
        <span className="kv-anio-flecha"><Icono nombre="abajo" tam={15} /></span>
      </button>
      {abierto && (
        <div className="kv-anio-menu" role="listbox" aria-label="Año académico">
          {lista.map(a => (
            <button key={a.year} type="button" role="option" aria-selected={a.year === anio}
              className={a.year === anio ? 'on' : ''}
              onClick={() => { setAnio(a.year); setAbierto(false); }}>
              <span className="kv-anio-op">{a.year}</span>
              {a.estado === 'cerrado' && (
                <span className="kv-anio-chip"><Icono nombre="candado" tam={11} /> Cerrado</span>
              )}
              {a.year === anio && <span className="kv-anio-ok"><Icono nombre="check" tam={15} /></span>}
            </button>
          ))}
          {puedeGestionar && (
            <button type="button" className="kv-anio-gestionar"
              onClick={() => { setAbierto(false); onGestionar(); }}>
              <Icono nombre="ajustes" tam={14} /> Gestionar años…
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, school, logout, anio, setAnio, anios } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [abierto, setAbierto] = useState(false);     // menú en móvil
  const [menuUsuario, setMenuUsuario] = useState(false);

  // Al navegar se cierra el menú móvil, si no queda tapando el contenido
  useEffect(() => { setAbierto(false); setMenuUsuario(false); }, [pathname]);

  const salir = () => { logout(); navigate('/login'); };
  const [seccion, titulo] = tituloDe(pathname);

  const secciones = SECCIONES
    .map(s => ({ ...s, items: s.items.filter(i => i.roles.includes(user?.role)) }))
    .filter(s => s.items.length);

  const sigla = (school?.name || 'C')
    .split(' ').filter(p => p.length > 2).slice(0, 2)
    .map(p => p[0]).join('').toUpperCase() || 'C';

  return (
    <div className={`kv-app ${abierto ? 'menu-abierto' : ''}`}>

      {/* Velo del menú en móvil */}
      <div className="kv-velo-menu" onClick={() => setAbierto(false)} />

      <aside className="kv-lat">
        <a href="/" className="kv-lat-marca">
          <img src="/inicio/img/recreo-isotipo.png" alt="" width="32" height="32" />
          <span>
            <b>Recreo Edu</b>
            <i>Tecnología para educar</i>
          </span>
        </a>

        <div className="kv-lat-colegio">
          <span className="kv-sello">
            {school?.logo_url
              ? <img src={school.logo_url} alt="" />
              : sigla}
          </span>
          <span className="kv-colegio-txt">
            <i>{ROLES[user?.role] || user?.role}</i>
            <b>{school?.name || 'Colegio'}</b>
          </span>
        </div>

        {ROLES_CON_ANIO.includes(user?.role) && (
          <SelectorAnio
            anio={anio || new Date().getFullYear()}
            anios={Array.isArray(anios) ? anios : []}
            setAnio={setAnio || (() => {})}
            puedeGestionar={['admin', 'directivo'].includes(user?.role)}
            onGestionar={() => navigate('/anios')}
          />
        )}

        <nav className="kv-lat-nav">
          {secciones.map(s => (
            <React.Fragment key={s.titulo}>
              <p className="kv-grupo">{s.titulo}</p>
              {s.items.map(i => (
                <NavLink key={i.to} to={i.to}
                  className={({ isActive }) => `kv-it ${isActive ? 'on' : ''}`}>
                  <Icono nombre={i.icono} />
                  <span>{i.label}</span>
                </NavLink>
              ))}
            </React.Fragment>
          ))}
        </nav>

        <div className="kv-lat-pie">
          <button className="kv-usuario" onClick={() => setMenuUsuario(v => !v)}>
            <UserAvatar
              userId={user?.id}
              firstName={user?.first_name}
              lastName={user?.last_name}
              hasPhoto={user?.has_photo}
              size={32}
              color={avatarColor(user?.id)}
            />
            <span className="kv-usuario-txt">
              <b>{user?.first_name} {user?.last_name}</b>
              <i>{user?.email}</i>
            </span>
            <Icono nombre="salir" tam={16} />
          </button>
          {menuUsuario && (
            <div className="kv-usuario-menu">
              <button onClick={salir}>
                <Icono nombre="salir" tam={15} /> Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="kv-zona">
        <header className="kv-tope">
          <button className="kv-hamburguesa" onClick={() => setAbierto(v => !v)}
                  aria-label="Abrir menú">
            <Icono nombre="menu" tam={20} />
          </button>
          <div className="kv-titulo">
            {seccion && <p>{seccion}</p>}
            <h1>{titulo}</h1>
          </div>
        </header>

        <main className="kv-cont">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
