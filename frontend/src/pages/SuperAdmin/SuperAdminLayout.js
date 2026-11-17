import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Campana } from '../../components/Marca/Marca';

const NAV_ITEMS = [
  { path: '/super-admin', label: 'Dashboard', icon: '📊', end: true },
  { path: '/super-admin/schools', label: 'Colegios', icon: '🏫' },
  { path: '/super-admin/subscriptions', label: 'Suscripciones', icon: '💳' },
  { path: '/super-admin/planes', label: 'Planes y pruebas', icon: '🎟️' },
  { path: '/super-admin/admins', label: 'Administradores', icon: '👤' },
  { path: '/super-admin/auditoria', label: 'Auditoría', icon: '🕘' },
];

export default function SuperAdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#F3F0EC' }}>
      {/* Sidebar */}
      <aside style={{
        width: collapsed ? 64 : 240,
        background: '#2B1B14',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s',
        flexShrink: 0,
        overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{ padding: collapsed ? '20px 12px' : '20px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Campana tam={34} claro />
            {!collapsed && (
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>Super Admin</div>
                <div style={{ color: '#FFE29A', fontSize: 11 }}>Panel de Control</div>
              </div>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px' }}>
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: collapsed ? '10px 12px' : '10px 14px',
                borderRadius: 10, marginBottom: 4,
                textDecoration: 'none',
                background: isActive ? '#FFC94A' : 'transparent',
                color: isActive ? '#2B1B14' : 'rgba(255,255,255,.72)',
                fontWeight: isActive ? 600 : 400,
                fontSize: 14,
                transition: 'all 0.15s',
              })}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && item.label}
            </NavLink>
          ))}
        </nav>

        {/* User & collapse */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          {!collapsed && (
            <div style={{ padding: '8px 14px', marginBottom: 8 }}>
              <div style={{ color: '#ECE8E3', fontSize: 13, fontWeight: 600 }}>
                {user?.first_name} {user?.last_name}
              </div>
              <div style={{ color: '#6B5446', fontSize: 11 }}>{user?.email}</div>
            </div>
          )}
          <button
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: collapsed ? '10px 12px' : '10px 14px',
              background: 'transparent', border: 'none', borderRadius: 10,
              color: '#B8321B', cursor: 'pointer', fontSize: 14,
            }}
          >
            <span style={{ fontSize: 18 }}>🚪</span>
            {!collapsed && 'Cerrar Sesión'}
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '100%', padding: '8px', marginTop: 4,
              background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 8,
              color: '#9C8A7E', cursor: 'pointer', fontSize: 14,
            }}
          >
            {collapsed ? '→' : '←'}
          </button>
        </div>
      </aside>

      {/* Content */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}
