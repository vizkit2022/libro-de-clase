import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import UserAvatar, { avatarColor, compressImage } from '../../components/UserAvatar/UserAvatar';

const ROLES = ['admin','directivo','profesor','apoderado','alumno'];

function PhotoUploadSection({ editing, form, pendingPhoto, setPendingPhoto, primary }) {
  const fileRef = React.useRef(null);
  const color = avatarColor(editing?.id || 0);
  const initials = `${(form.first_name||'?')[0]}${(form.last_name||'')[0] || ''}`.toUpperCase();

  // Foto que mostrar: pendingPhoto (preview) > foto existente > iniciales
  const previewSrc = pendingPhoto || null;
  const API_BASE = process.env.REACT_APP_API_URL || '';
  const existingPhotoUrl = (!pendingPhoto && editing?.has_photo && editing?.id)
    ? `${API_BASE}/api/users/${editing.id}/photo`
    : null;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const compressed = await compressImage(file, 300, 0.85);
    setPendingPhoto(compressed);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, padding: '14px 0', borderBottom: '1px solid #f1f5f9' }}>
      {/* Avatar clickable */}
      <div
        style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}
        onClick={() => fileRef.current?.click()}
        title="Cambiar foto"
      >
        {previewSrc || existingPhotoUrl ? (
          <img
            src={previewSrc || existingPhotoUrl}
            alt="Foto"
            style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover',
              border: `2px solid ${primary}`, boxShadow: '0 2px 10px rgba(0,0,0,0.15)' }}
          />
        ) : (
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 26,
            boxShadow: '0 2px 10px rgba(0,0,0,0.12)' }}>
            {initials}
          </div>
        )}
        {/* Overlay cámara */}
        <div style={{ position: 'absolute', bottom: 0, right: 0,
          width: 24, height: 24, borderRadius: '50%', background: primary,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
          📷
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />

      {/* Texto y acciones */}
      <div>
        <p style={{ fontWeight: 600, fontSize: 14, color: '#0f172a', margin: 0 }}>Foto de perfil</p>
        <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 6px' }}>Haz clic en el círculo para subir o cambiar la foto</p>
        {pendingPhoto && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 5, fontWeight: 600 }}>
              ✓ Nueva foto lista
            </span>
            <button type="button" onClick={() => setPendingPhoto(null)}
              style={{ fontSize: 11, background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 600 }}>
              Cancelar
            </button>
          </div>
        )}
        {!pendingPhoto && editing?.has_photo && (
          <button type="button" onClick={() => setPendingPhoto('')}
            style={{ fontSize: 11, background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 600, padding: 0 }}>
            🗑 Eliminar foto actual
          </button>
        )}
      </div>
    </div>
  );
}
const ROLE_LABELS = { admin:'Administrador', directivo:'Directivo', profesor:'Profesor', apoderado:'Apoderado', alumno:'Alumno' };
const EMPTY_FORM = { first_name:'', last_name:'', email:'', rut:'', phone:'', address:'', role:'alumno', gender:'', birth_date:'', password:'', is_active:true };

export default function UsersPage() {
  const { school } = useAuth();
  const primary = school?.primary_color || '#2563EB';
  const [users, setUsers] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Apoderado → students
  const [allStudents, setAllStudents] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);

  // Foto de perfil en modal
  const [pendingPhoto, setPendingPhoto] = useState(null); // base64 data URL a guardar

  const showToast = (msg, type='success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchUsers = useCallback(async () => {
    try {
      const params = roleFilter !== 'all' ? `?role=${roleFilter}` : '';
      const { data } = await axios.get(`/api/users/${params}`);
      setUsers(data);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, [roleFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    const term = search.toLowerCase();
    setFiltered(users.filter(u =>
      `${u.first_name} ${u.last_name} ${u.email} ${u.rut}`.toLowerCase().includes(term)
    ));
  }, [users, search]);

  // Cargar alumnos cuando el rol es apoderado
  useEffect(() => {
    if (form.role === 'apoderado') {
      axios.get('/api/users/?role=alumno')
        .then(({ data }) => setAllStudents(data))
        .catch(() => setAllStudents([]));
    }
  }, [form.role]);

  const openNew = () => {
    setForm(EMPTY_FORM);
    setEditing(null);
    setSelectedStudents([]);
    setPendingPhoto(null);
    setShowModal(true);
  };

  const openEdit = async (u) => {
    setForm({ ...u, password: '', birth_date: u.birth_date || '' });
    setEditing(u);
    setSelectedStudents([]);
    setPendingPhoto(null);
    if (u.role === 'apoderado') {
      try {
        const { data } = await axios.get(`/api/users/${u.id}/students`);
        setSelectedStudents(data.map(s => s.id));
      } catch(e) { /* sin alumnos aún */ }
    }
    setShowModal(true);
  };

  const toggleStudent = (id) => {
    setSelectedStudents(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      let savedUser;
      if (editing) {
        const { data } = await axios.put(`/api/users/${editing.id}`, form);
        savedUser = data;
        showToast('Usuario actualizado');
      } else {
        const { data } = await axios.post('/api/users/', form);
        savedUser = data;
        showToast('Usuario creado');
      }

      // Si es apoderado, guardar alumnos asignados
      if (form.role === 'apoderado' && savedUser?.id) {
        await axios.post(`/api/users/${savedUser.id}/students`, {
          student_ids: selectedStudents,
          relationship: 'apoderado'
        });
      }

      // Guardar foto si hay una pendiente
      if (pendingPhoto !== null && savedUser?.id) {
        await axios.put(`/api/users/${savedUser.id}/photo`, { photo: pendingPhoto });
      }

      setShowModal(false);
      fetchUsers();
    } catch(err) {
      showToast(err.response?.data?.error || 'Error al guardar', 'error');
    } finally { setSaving(false); }
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('¿Desactivar este usuario?')) return;
    await axios.delete(`/api/users/${id}`);
    showToast('Usuario desactivado');
    fetchUsers();
  };

  // avatarColor imported from UserAvatar component

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">👥 Usuarios</h1>
          <p className="page-subtitle">{filtered.length} {roleFilter !== 'all' ? ROLE_LABELS[roleFilter] : 'usuarios'} registrados</p>
        </div>
        <button className="btn btn-primary" onClick={openNew} style={{ background: primary }}>
          ＋ Nuevo usuario
        </button>
      </div>

      {/* Filtros */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="tabs" style={{ margin: 0 }}>
            <button className={`tab ${roleFilter === 'all' ? 'active' : ''}`} onClick={() => setRoleFilter('all')}>Todos</button>
            {ROLES.map(r => (
              <button key={r} className={`tab ${roleFilter === r ? 'active' : ''}`} onClick={() => setRoleFilter(r)}>
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
          <div className="search-bar" style={{ marginLeft: 'auto' }}>
            <span>🔍</span>
            <input placeholder="Buscar por nombre, email, RUT..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="loading-container"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="illustration-area">
            <div className="illustration">👤</div>
            <h3>No hay usuarios</h3>
            <p>Haz clic en "Nuevo usuario" para agregar el primero</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>RUT</th>
                  <th>Teléfono</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <UserAvatar
                          userId={u.id}
                          firstName={u.first_name}
                          lastName={u.last_name}
                          hasPhoto={u.has_photo}
                          size={36}
                          color={avatarColor(u.id)}
                        />
                        <div>
                          <p style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px' }}>{u.first_name} {u.last_name}</p>
                          <p style={{ fontSize: '12px', color: '#64748b' }}>{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ color: '#64748b', fontSize: '13px' }}>{u.rut || '—'}</td>
                    <td style={{ color: '#64748b', fontSize: '13px' }}>{u.phone || '—'}</td>
                    <td><span className={`badge badge-${u.role}`}>{ROLE_LABELS[u.role]}</span></td>
                    <td><span className={`badge ${u.is_active ? 'badge-active' : 'badge-inactive'}`}>{u.is_active ? 'Activo' : 'Inactivo'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-secondary btn-sm btn-icon" onClick={() => openEdit(u)} title="Editar">✏️</button>
                        {u.is_active && <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDeactivate(u.id)} title="Desactivar">🚫</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 620 }}>
            <div className="modal-header">
              <h3>{editing ? '✏️ Editar usuario' : '➕ Nuevo usuario'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                {/* Foto de perfil */}
                <PhotoUploadSection
                  editing={editing}
                  form={form}
                  pendingPhoto={pendingPhoto}
                  setPendingPhoto={setPendingPhoto}
                  primary={primary}
                />

                <div className="form-grid">
                  <div className="form-group">
                    <label>Nombre *</label>
                    <input required value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})} placeholder="Pedro" />
                  </div>
                  <div className="form-group">
                    <label>Apellido *</label>
                    <input required value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value})} placeholder="González" />
                  </div>
                  <div className="form-group">
                    <label>Email *</label>
                    <input type="email" required value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="correo@ejemplo.cl" />
                  </div>
                  <div className="form-group">
                    <label>RUT</label>
                    <input value={form.rut} onChange={e => setForm({...form, rut: e.target.value})} placeholder="12.345.678-9" />
                  </div>
                  <div className="form-group">
                    <label>Teléfono</label>
                    <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+56 9 1234 5678" />
                  </div>
                  <div className="form-group">
                    <label>Fecha de nacimiento</label>
                    <input type="date" value={form.birth_date} onChange={e => setForm({...form, birth_date: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>Género</label>
                    <select value={form.gender} onChange={e => setForm({...form, gender: e.target.value})}>
                      <option value="">Sin especificar</option>
                      <option value="masculino">Masculino</option>
                      <option value="femenino">Femenino</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Rol *</label>
                    <select required value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                      {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label>Dirección</label>
                    <input value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="Av. Principal 123, Santiago" />
                  </div>
                  <div className="form-group">
                    <label>{editing ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña *'}</label>
                    <input type="password" required={!editing} value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="••••••••" />
                  </div>
                  <div className="form-group" style={{ justifyContent: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <label style={{ margin: 0 }}>Activo</label>
                    <input type="checkbox" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} style={{ width: 18, height: 18 }} />
                  </div>

                  {/* Selector de alumnos para apoderado */}
                  {form.role === 'apoderado' && (
                    <div className="form-group" style={{ gridColumn: '1/-1' }}>
                      <label>👨‍👧 Alumnos asignados</label>
                      {allStudents.length === 0 ? (
                        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0' }}>No hay alumnos registrados aún.</p>
                      ) : (
                        <div style={{
                          border: '1px solid #e2e8f0',
                          borderRadius: 8,
                          maxHeight: 200,
                          overflowY: 'auto',
                          padding: '6px 0'
                        }}>
                          {allStudents.map(s => (
                            <label key={s.id} style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: '7px 14px',
                              cursor: 'pointer',
                              background: selectedStudents.includes(s.id) ? '#eff6ff' : 'transparent',
                              transition: 'background 0.15s'
                            }}>
                              <input
                                type="checkbox"
                                checked={selectedStudents.includes(s.id)}
                                onChange={() => toggleStudent(s.id)}
                                style={{ width: 16, height: 16, accentColor: primary }}
                              />
                              <span style={{ fontSize: 13, fontWeight: selectedStudents.includes(s.id) ? 600 : 400 }}>
                                {s.last_name}, {s.first_name}
                              </span>
                              {s.rut && <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>{s.rut}</span>}
                            </label>
                          ))}
                        </div>
                      )}
                      {selectedStudents.length > 0 && (
                        <p style={{ fontSize: 12, color: primary, marginTop: 4 }}>
                          {selectedStudents.length} alumno(s) seleccionado(s)
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ background: primary }}>
                  {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Crear usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  );
}
