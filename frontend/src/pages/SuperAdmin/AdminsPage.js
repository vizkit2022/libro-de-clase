import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const ROLES = {
  admin:     { et: 'Administrador', col: '#2a2eb0', bg: '#e0e5fb' },
  directivo: { et: 'Directivo',     col: '#6d28d9', bg: '#ede9fe' },
  profesor:  { et: 'Docente',       col: '#15803d', bg: '#dcfce7' },
};

const inp = {
  width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit',
};
const lbl = {
  display: 'block', fontSize: 12, fontWeight: 700, color: '#374151',
  textTransform: 'uppercase', marginBottom: 5, letterSpacing: '.02em',
};

export default function AdminsPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [colegios, setColegios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState({ school_id: '', role: '', buscar: '' });
  const [editando, setEditando] = useState(null);   // usuario o {} para nuevo
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast] = useState(null);

  const aviso = (msg, tipo = 'ok') => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3400);
  };

  const traer = useCallback(async () => {
    const p = new URLSearchParams();
    Object.entries(filtros).forEach(([k, v]) => { if (v) p.set(k, v); });
    try {
      const r = await axios.get(`/api/super-admin/usuarios?${p}`);
      setUsuarios(r.data);
    } catch { setUsuarios([]); }
    setCargando(false);
  }, [filtros]);

  useEffect(() => { traer(); }, [traer]);

  useEffect(() => {
    axios.get('/api/super-admin/schools')
      .then(r => setColegios(r.data))
      .catch(() => setColegios([]));
  }, []);

  const guardar = async () => {
    const u = editando;
    if (!u.nombre?.trim() || !u.apellido?.trim() || !u.email?.trim()) {
      return aviso('Nombre, apellido y correo son obligatorios', 'err');
    }
    if (!u.school_id) return aviso('Elegí a qué colegio pertenece', 'err');

    setGuardando(true);
    try {
      if (u.id) {
        const datos = { ...u };
        if (!datos.password) delete datos.password;   // no pisar la clave actual
        await axios.put(`/api/super-admin/usuarios/${u.id}`, datos);
        aviso('Usuario actualizado');
      } else {
        await axios.post('/api/super-admin/usuarios', u);
        aviso('Usuario creado');
      }
      setEditando(null);
      await traer();
    } catch (e) {
      aviso(e.response?.data?.error || 'No se pudo guardar', 'err');
    }
    setGuardando(false);
  };

  const alternarAcceso = async (u) => {
    const activar = !u.is_active;
    if (!activar && !window.confirm(
      `¿Quitarle el acceso a ${u.nombre} ${u.apellido}?\n\n` +
      `No se elimina: conserva su historial y podés devolverle el acceso cuando quieras.`
    )) return;
    try {
      await axios.put(`/api/super-admin/usuarios/${u.id}`, { is_active: activar });
      await traer();
      aviso(activar ? 'Acceso habilitado' : 'Acceso quitado');
    } catch (e) {
      aviso(e.response?.data?.error || 'No se pudo cambiar', 'err');
    }
  };

  const nuevaClave = async (u) => {
    const clave = window.prompt(
      `Nueva contraseña para ${u.nombre} ${u.apellido}:`, 'colegio123');
    if (!clave || clave.length < 6) {
      if (clave !== null) aviso('La contraseña debe tener al menos 6 caracteres', 'err');
      return;
    }
    try {
      await axios.put(`/api/super-admin/usuarios/${u.id}`, { password: clave });
      aviso(`Contraseña cambiada. Entrégasela a ${u.nombre} por un canal seguro.`);
    } catch (e) {
      aviso(e.response?.data?.error || 'No se pudo cambiar', 'err');
    }
  };

  const porColegio = usuarios.reduce((acc, u) => {
    (acc[u.colegio] ||= []).push(u);
    return acc;
  }, {});

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a' }}>
            Administradores y docentes
          </h1>
          <p style={{ fontSize: 13.5, color: '#64748b', margin: '3px 0 0' }}>
            Quienes operan la plataforma. Alumnos y apoderados los gestiona cada colegio.
          </p>
        </div>
        <button onClick={() => setEditando({
          nombre: '', apellido: '', email: '', rut: '', telefono: '',
          role: 'admin', school_id: '', password: 'colegio123', is_active: true,
        })} style={{ padding: '10px 18px', background: '#3b4fd8', color: '#fff',
          border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit' }}>
          + Nuevo usuario
        </button>
      </div>

      {/* Filtros */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '14px 18px',
        marginBottom: 18, display: 'flex', gap: 12, flexWrap: 'wrap',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <input placeholder="Buscar por nombre o correo" value={filtros.buscar}
          onChange={e => setFiltros({ ...filtros, buscar: e.target.value })}
          style={{ ...inp, flex: 1, minWidth: 210 }} />
        <select value={filtros.school_id} style={{ ...inp, width: 210 }}
          onChange={e => setFiltros({ ...filtros, school_id: e.target.value })}>
          <option value="">Todos los colegios</option>
          {colegios.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filtros.role} style={{ ...inp, width: 170 }}
          onChange={e => setFiltros({ ...filtros, role: e.target.value })}>
          <option value="">Todos los roles</option>
          {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.et}</option>)}
        </select>
      </div>

      {cargando ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="spinner" />
        </div>
      ) : !usuarios.length ? (
        <div style={{ background: '#fff', borderRadius: 14, padding: 46, textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#475569', margin: '0 0 5px' }}>
            No hay usuarios que coincidan
          </p>
          <p style={{ fontSize: 13.5, color: '#94a3b8', margin: 0 }}>
            Probá cambiando los filtros, o creá uno nuevo.
          </p>
        </div>
      ) : (
        Object.entries(porColegio).map(([colegio, lista]) => (
          <div key={colegio} style={{ background: '#fff', borderRadius: 14, marginBottom: 16,
            overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10,
              padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
              <h3 style={{ fontSize: 15, fontWeight: 750, margin: 0, flex: 1 }}>{colegio}</h3>
              <span style={{ fontSize: 12.5, color: '#94a3b8' }}>
                {lista.length} {lista.length === 1 ? 'usuario' : 'usuarios'}
              </span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Nombre', 'Correo', 'Rol', 'Estado', 'Último ingreso', ''].map(h => (
                    <th key={h} style={{ padding: '9px 20px', textAlign: 'left', fontSize: 11,
                      textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map(u => {
                  const r = ROLES[u.role] || ROLES.admin;
                  return (
                    <tr key={u.id} style={{ borderTop: '1px solid #f1f5f9',
                      opacity: u.is_active ? 1 : .62 }}>
                      <td style={{ padding: '11px 20px', fontWeight: 600, color: '#0f172a' }}>
                        {u.nombre} {u.apellido}
                      </td>
                      <td style={{ padding: '11px 20px', color: '#64748b' }}>{u.email}</td>
                      <td style={{ padding: '11px 20px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px',
                          borderRadius: 999, background: r.bg, color: r.col }}>{r.et}</span>
                      </td>
                      <td style={{ padding: '11px 20px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px',
                          borderRadius: 999,
                          background: u.is_active ? '#dcfce7' : '#f1f5f9',
                          color: u.is_active ? '#166534' : '#64748b' }}>
                          {u.is_active ? 'activo' : 'sin acceso'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 20px', color: '#94a3b8', fontSize: 12.5 }}>
                        {u.last_login
                          ? new Date(u.last_login).toLocaleDateString('es-CL',
                              { day: '2-digit', month: 'short', year: 'numeric' })
                          : 'nunca'}
                      </td>
                      <td style={{ padding: '9px 20px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => setEditando({ ...u, password: '' })}
                          style={btnMini}>Editar</button>
                        <button onClick={() => nuevaClave(u)} style={btnMini}>Clave</button>
                        <button onClick={() => alternarAcceso(u)}
                          style={{ ...btnMini, color: u.is_active ? '#b91c1c' : '#15803d',
                            borderColor: u.is_active ? '#fecaca' : '#bbf7d0',
                            background: u.is_active ? '#fef2f2' : '#f0fdf4' }}>
                          {u.is_active ? 'Quitar acceso' : 'Dar acceso'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))
      )}

      {/* Alta y edición */}
      {editando && (
        <div style={capa} onClick={() => !guardando && setEditando(null)}>
          <div style={caja} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px' }}>
              {editando.id ? 'Editar usuario' : 'Nuevo usuario'}
            </h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
              {editando.id
                ? 'Los cambios se aplican de inmediato.'
                : 'Va a poder entrar con el correo y la contraseña que definas.'}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13 }}>
              <div>
                <label style={lbl}>Nombre *</label>
                <input style={inp} value={editando.nombre || ''} autoFocus
                  onChange={e => setEditando({ ...editando, nombre: e.target.value })} />
              </div>
              <div>
                <label style={lbl}>Apellido *</label>
                <input style={inp} value={editando.apellido || ''}
                  onChange={e => setEditando({ ...editando, apellido: e.target.value })} />
              </div>
            </div>

            <div style={{ marginTop: 13 }}>
              <label style={lbl}>Correo *</label>
              <input style={inp} type="email" value={editando.email || ''}
                onChange={e => setEditando({ ...editando, email: e.target.value })} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13, marginTop: 13 }}>
              <div>
                <label style={lbl}>RUT</label>
                <input style={inp} value={editando.rut || ''}
                  onChange={e => setEditando({ ...editando, rut: e.target.value })} />
              </div>
              <div>
                <label style={lbl}>Teléfono</label>
                <input style={inp} value={editando.telefono || ''}
                  onChange={e => setEditando({ ...editando, telefono: e.target.value })} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13, marginTop: 13 }}>
              <div>
                <label style={lbl}>Colegio *</label>
                <select style={inp} value={editando.school_id || ''}
                  onChange={e => setEditando({ ...editando, school_id: Number(e.target.value) })}>
                  <option value="">Elegir…</option>
                  {colegios.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Rol</label>
                <select style={inp} value={editando.role || 'admin'}
                  onChange={e => setEditando({ ...editando, role: e.target.value })}>
                  {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.et}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginTop: 13 }}>
              <label style={lbl}>
                {editando.id ? 'Nueva contraseña (dejar vacío para no cambiarla)' : 'Contraseña inicial'}
              </label>
              <input style={inp} value={editando.password || ''}
                placeholder={editando.id ? 'Sin cambios' : 'colegio123'}
                onChange={e => setEditando({ ...editando, password: e.target.value })} />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 16,
              fontSize: 13.5, color: '#334155', cursor: 'pointer' }}>
              <input type="checkbox" checked={editando.is_active !== false}
                onChange={e => setEditando({ ...editando, is_active: e.target.checked })} />
              Puede iniciar sesión
            </label>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
              <button onClick={() => setEditando(null)} disabled={guardando}
                style={{ padding: '9px 17px', background: '#f1f5f9', border: 'none',
                  borderRadius: 9, fontSize: 13.5, fontWeight: 650, cursor: 'pointer',
                  color: '#475569', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando}
                style={{ padding: '9px 20px', background: '#3b4fd8', color: '#fff',
                  border: 'none', borderRadius: 9, fontSize: 13.5, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', opacity: guardando ? .6 : 1 }}>
                {guardando ? 'Guardando…' : editando.id ? 'Guardar cambios' : 'Crear usuario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 3000,
          background: toast.tipo === 'err' ? '#dc2626' : '#16a34a', color: '#fff',
          padding: '11px 18px', borderRadius: 10, fontWeight: 600, fontSize: 14,
          maxWidth: 440, boxShadow: '0 8px 24px rgba(0,0,0,.2)' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

const btnMini = {
  padding: '5px 11px', background: '#fff', border: '1px solid #e2e8f0',
  borderRadius: 7, fontSize: 12, fontWeight: 650, cursor: 'pointer',
  color: '#475569', fontFamily: 'inherit', marginLeft: 6,
};
const capa = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 2000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
};
const caja = {
  background: '#fff', borderRadius: 16, padding: 26, width: 540, maxWidth: '96vw',
  maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)',
};
