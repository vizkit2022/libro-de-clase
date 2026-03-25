import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import UserAvatar, { avatarColor } from '../UserAvatar/UserAvatar';
import './Layout.css';

const ROLE_LABELS = {
  admin: 'Administrador',
  directivo: 'Directivo',
  profesor: 'Profesor',
  apoderado: 'Apoderado',
  alumno: 'Alumno'
};

const navItems = [
  { to: '/dashboard', icon: '🏠', label: 'Dashboard', roles: ['admin','directivo','profesor','apoderado','alumno'] },
  { to: '/users', icon: '👥', label: 'Usuarios', roles: ['admin','directivo'] },
  { to: '/parameters', icon: '🏫', label: 'Colegio', roles: ['admin','directivo'] },
  { to: '/periods', icon: '📅', label: 'Períodos', roles: ['admin','directivo'] },
  { to: '/courses', icon: '📚', label: 'Cursos', roles: ['admin','directivo','profesor'] },
  { to: '/subjects', icon: '📖', label: 'Asignaturas', roles: ['admin','directivo','profesor'] },
  { to: '/grades', icon: '✏️', label: 'Calificaciones', roles: ['admin','directivo','profesor'] },
  { to: '/reports', icon: '📊', label: 'Reportes', roles: ['admin','directivo','profesor'] },
  { to: '/ocr-annotations', icon: '📷', label: 'Escanea anotaciones', roles: ['admin','directivo','profesor'] },
  { to: '/apoderado', icon: '👨‍👧', label: 'Mis alumnos', roles: ['apoderado'] },
];

export default function Layout() {
  const { user, school, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };
  const primaryColor = school?.primary_color || '#2563EB';
  const filteredNav = navItems.filter(item => item.roles.includes(user?.role));

  // initials kept as fallback for avatar
  const initials = user ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase() : '?';

  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'collapsed'}`} style={{ '--primary': primaryColor }}>
        {/* Logo / Colegio */}
        <div className="sidebar-header">
          <div className="school-logo" style={{ background: primaryColor }}>
            {school?.logo_url
              ? <img src={school.logo_url} alt={school.name} />
              : <span>{school?.name?.[0] || 'C'}</span>
            }
          </div>
          {sidebarOpen && (
            <div className="school-info">
              <h2>{school?.name || 'Colegio'}</h2>
              <span className="role-badge">{ROLE_LABELS[user?.role] || user?.role}</span>
            </div>
          )}
          <button className="toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        {/* Navegación */}
        <nav className="sidebar-nav">
          {filteredNav.map(item => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              style={({ isActive }) => isActive ? { background: primaryColor, color: 'white' } : {}}>
              <span className="nav-icon">{item.icon}</span>
              {sidebarOpen && <span className="nav-label">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Usuario */}
        <div className="sidebar-footer">
          <div className="user-info" onClick={() => setMenuOpen(!menuOpen)}>
            <UserAvatar
              userId={user?.id}
              firstName={user?.first_name}
              lastName={user?.last_name}
              hasPhoto={user?.has_photo}
              size={36}
              color={avatarColor(user?.id)}
            />
            {sidebarOpen && (
              <div className="user-details">
                <span className="user-name">{user?.first_name} {user?.last_name}</span>
                <span className="user-email">{user?.email}</span>
              </div>
            )}
          </div>
          {menuOpen && sidebarOpen && (
            <div className="user-menu">
              <button onClick={handleLogout}>🚪 Cerrar sesión</button>
            </div>
          )}
        </div>
      </aside>

      {/* Contenido principal */}
      <main className="main-content">
        <div className="content-wrapper">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
