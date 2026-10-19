import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  pickForm, toPayload, useCardForm, makeBinder, useSaver, errMsg, fmtDate, resizeSignature,
  FichaCard, FF, Field, Sel, Radios,
} from '../fichaShared';
import { AUTH_STATUSES } from '../fichaOptions';

const AUTH_SCHEMA = {
  title: 'text', description: 'text', status: 'text', signed_by_member_id: 'text',
  signed_by_name: 'text', signed_by_rut: 'text', signed_at: 'date', notes: 'text', signature_image: 'text',
};
const MAX_SIGNATURE_CHARS = 1.5 * 1024 * 1024;

const statusInfo = (s) => AUTH_STATUSES.find(x => x.value === s) || AUTH_STATUSES[0];

export function StatusChip({ status }) {
  const st = statusInfo(status);
  return <span className="fchip" style={{ background: st.bg, color: st.color }}>{st.icon} {st.label}</span>;
}

/* ───────── Firma ───────── */
function SignatureBox({ id, value, onChange, disabled, showToast }) {
  const camRef = useRef(null);
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Selecciona una imagen (foto de la firma)', 'error'); return; }
    setBusy(true);
    try {
      const dataUrl = await resizeSignature(file, 800);
      if (dataUrl.length > MAX_SIGNATURE_CHARS) {
        showToast('La imagen de la firma es demasiado pesada incluso reducida. Intenta con otra foto.', 'error');
        return;
      }
      onChange(dataUrl);
    } catch (err) {
      showToast(err.message || 'No se pudo procesar la imagen', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sig-box">
      {value ? (
        <div className="sig-preview">
          <img src={value} alt="Firma registrada" />
        </div>
      ) : (
        <div className="sig-empty">{busy ? 'Procesando imagen…' : 'Sin firma registrada'}</div>
      )}
      {!disabled && (
        <div className="sig-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => camRef.current?.click()} disabled={busy}>📷 Tomar foto</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>🖼️ Subir imagen</button>
          {value && <button type="button" className="btn btn-danger btn-sm" onClick={() => onChange('')} disabled={busy}>Quitar firma</button>}
          <input ref={camRef} id={id} type="file" accept="image/*" capture="environment" hidden onChange={handleFile} aria-label="Tomar foto de la firma" />
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} aria-label="Subir imagen de la firma" />
        </div>
      )}
    </div>
  );
}

/* ───────── Autorización ───────── */
function AuthorizationCard({ auth, family, canEdit, studentId, showToast, reload }) {
  const source = useMemo(() => {
    const f = pickForm(auth, AUTH_SCHEMA);
    if (!f.status) f.status = 'pendiente';
    return f;
  }, [auth]);
  const { form, setField, setForm, dirty } = useCardForm(source);
  const [saving, run] = useSaver(showToast);
  const [deleting, setDeleting] = useState(false);
  const [editText, setEditText] = useState(false);
  const prefix = `aut-${auth.id}`;
  const b = makeBinder(prefix, form, setField, canEdit);
  const st = statusInfo(form.status);

  const memberOptions = family.map(m => ({
    value: String(m.id),
    label: `${m.full_name || m.first_name}${m.relationship ? ` · ${m.relationship}` : ''}`,
  }));

  const pickSigner = (val) => {
    const m = family.find(x => String(x.id) === val);
    setForm(f => ({
      ...f,
      signed_by_member_id: val,
      signed_by_name: m ? (m.full_name || `${m.first_name || ''} ${m.last_name || ''}`.trim()) : f.signed_by_name,
      signed_by_rut: m ? (m.rut || '') : f.signed_by_rut,
    }));
  };

  const save = () => {
    if (!form.title.trim()) { showToast('La autorización debe tener un título', 'error'); return; }
    const payload = toPayload(form, AUTH_SCHEMA);
    payload.signed_by_member_id = form.signed_by_member_id ? Number(form.signed_by_member_id) : null;
    // La imagen de firma solo se envía si cambió (null = quitar firma)
    if (form.signature_image === source.signature_image) delete payload.signature_image;
    run(async () => {
      await axios.put(`/api/students/${studentId}/authorizations/${auth.id}`, payload);
      setEditText(false);
      await reload();
    }, 'Autorización guardada');
  };

  const remove = async () => {
    if (!window.confirm(`¿Eliminar la autorización "${auth.title}"?`)) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/students/${studentId}/authorizations/${auth.id}`);
      showToast('Autorización eliminada');
      await reload();
    } catch (err) {
      showToast(errMsg(err, 'No se pudo eliminar'), 'error');
      setDeleting(false);
    }
  };

  const actions = canEdit ? (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditText(v => !v)}>
        {editText ? 'Ocultar texto' : '✏️ Editar texto'}
      </button>
      <button type="button" className="btn btn-danger btn-sm" onClick={remove} disabled={deleting}>
        {deleting ? 'Eliminando…' : '🗑️ Eliminar'}
      </button>
    </>
  ) : null;

  return (
    <FichaCard icon={<span className="auth-dot" style={{ background: st.bg, color: st.color }}>{st.icon}</span>}
      title={<span className="auth-title">{form.title || 'Autorización'}</span>}
      actions={actions} canEdit={canEdit} onSave={save} dirty={dirty} saving={saving} className="fc-auth">
      {form.description && !editText && <p className="auth-desc">{form.description}</p>}
      <div className="ff-grid">
        {editText && (
          <>
            <FF b={b} name="title" label="Título" required full />
            <FF b={b} name="description" label="Descripción" type="area" rows={2} full />
          </>
        )}
        <Field label="Estado" htmlFor={`${prefix}-status`} full>
          <div className="auth-status">
            <Radios {...b('status')} options={AUTH_STATUSES.map(s => ({ value: s.value, label: `${s.icon} ${s.label}` }))} />
          </div>
        </Field>
        <Field label="Firmado por" htmlFor={`${prefix}-signer`}>
          <Sel id={`${prefix}-signer`} value={form.signed_by_member_id} disabled={!canEdit} onChange={pickSigner}
            options={memberOptions} placeholder="Otra persona (ingresar datos)" />
        </Field>
        <FF b={b} name="signed_at" label="Fecha" type="date" />
        <FF b={b} name="signed_by_name" label="Nombre firmante" />
        <FF b={b} name="signed_by_rut" label="RUT firmante" placeholder="12.345.678-9" />
        <Field label="Firma" htmlFor={`${prefix}-sig`} full>
          <SignatureBox id={`${prefix}-sig`} value={form.signature_image} disabled={!canEdit}
            onChange={v => setField('signature_image', v)} showToast={showToast} />
        </Field>
        <FF b={b} name="notes" label="Notas" type="area" rows={2} full />
      </div>
      {!canEdit && (auth.signed_by_name || auth.signed_at) && (
        <p className="fc-note">Firmado por {auth.signed_by_name || '—'}{auth.signed_at ? ` el ${fmtDate(auth.signed_at)}` : ''}.</p>
      )}
    </FichaCard>
  );
}

/* ───────── Modal agregar ───────── */
function AddAuthorizationModal({ studentId, existing, onClose, onDone, showToast }) {
  const [templates, setTemplates] = useState(null);
  const [choice, setChoice] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('pendiente');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    axios.get('/api/students/authorization-templates')
      .then(({ data }) => { if (alive) setTemplates(Array.isArray(data) ? data : (data?.templates || [])); })
      .catch(() => { if (alive) setTemplates([]); });
    return () => { alive = false; };
  }, []);

  const usedIds = new Set(existing.map(a => a.template_id).filter(Boolean));
  const available = (templates || []).filter(t => t.is_active !== false);

  const submit = async (e) => {
    e.preventDefault();
    let body;
    if (choice === 'custom') {
      if (!title.trim()) { showToast('Escribe el título de la autorización', 'error'); return; }
      body = { title: title.trim(), description: description.trim() || null, status };
    } else if (choice) {
      body = { template_id: Number(choice), status };
    } else {
      showToast('Elige una plantilla o crea una personalizada', 'error');
      return;
    }
    setBusy(true);
    try {
      await axios.post(`/api/students/${studentId}/authorizations`, body);
      showToast('Autorización agregada');
      onDone();
    } catch (err) {
      showToast(errMsg(err, 'No se pudo agregar la autorización'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 600 }} role="dialog" aria-modal="true" aria-labelledby="add-auth-title">
        <div className="modal-header">
          <h3 id="add-auth-title">✅ Agregar autorización</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {templates === null ? (
              <div className="loading-container" style={{ height: 120 }}><div className="spinner" /></div>
            ) : (
              <div className="tpl-list" role="radiogroup" aria-label="Plantillas de autorización">
                {available.map(t => {
                  const used = usedIds.has(t.id);
                  return (
                    <label key={t.id} className={`tpl-item${choice === String(t.id) ? ' active' : ''}${used ? ' used' : ''}`}>
                      <input type="radio" name="tpl" value={t.id} checked={choice === String(t.id)} disabled={used}
                        onChange={() => setChoice(String(t.id))} />
                      <span>
                        <strong>{t.title}</strong>
                        {t.description && <small>{t.description}</small>}
                        {used && <small className="tpl-used">Ya agregada a este alumno</small>}
                      </span>
                    </label>
                  );
                })}
                <label className={`tpl-item${choice === 'custom' ? ' active' : ''}`}>
                  <input type="radio" name="tpl" value="custom" checked={choice === 'custom'} onChange={() => setChoice('custom')} />
                  <span><strong>✍️ Autorización personalizada</strong><small>Escribe un texto propio</small></span>
                </label>
              </div>
            )}
            {choice === 'custom' && (
              <div className="form-grid" style={{ marginTop: 14, gridTemplateColumns: '1fr' }}>
                <div className="form-group">
                  <label htmlFor="new-auth-title">Título *</label>
                  <input id="new-auth-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={300}
                    placeholder="Ej: Autorizo salida pedagógica al Museo de Historia Natural" />
                </div>
                <div className="form-group">
                  <label htmlFor="new-auth-desc">Descripción</label>
                  <textarea id="new-auth-desc" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
                </div>
              </div>
            )}
            <div className="form-group" style={{ marginTop: 14 }}>
              <label htmlFor="new-auth-status">Estado inicial</label>
              <select id="new-auth-status" value={status} onChange={e => setStatus(e.target.value)}>
                {AUTH_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={busy || templates === null}>{busy ? 'Agregando…' : 'Agregar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PermissionsSection(props) {
  const { ficha, canEdit, studentId, showToast, reload } = props;
  const auths = ficha.authorizations || [];
  const family = ficha.family || [];
  const [showAdd, setShowAdd] = useState(false);
  const counts = AUTH_STATUSES.map(s => ({ ...s, n: auths.filter(a => (a.status || 'pendiente') === s.value).length }));

  return (
    <>
      <section className="fc">
        <header className="fc-head">
          <h3 className="fc-title"><span className="fc-icon" aria-hidden="true">✅</span>Permisos</h3>
          {canEdit && (
            <div className="fc-actions">
              <button type="button" className="btn btn-primary btn-sm fbtn-primary" onClick={() => setShowAdd(true)}>+ Agregar autorización</button>
            </div>
          )}
        </header>
        <div className="fc-body">
          {auths.length === 0 ? (
            <div className="fc-empty-inline">
              <span aria-hidden="true">📝</span>
              <p>No hay autorizaciones registradas.{canEdit ? ' Usa "+ Agregar autorización" para elegir una plantilla del colegio o crear una personalizada.' : ''}</p>
            </div>
          ) : (
            <>
              <ul className="auth-summary">
                {auths.map(a => (
                  <li key={a.id}>
                    <span className="auth-check" style={{ background: statusInfo(a.status).bg, color: statusInfo(a.status).color }} aria-hidden="true">
                      {statusInfo(a.status).icon}
                    </span>
                    <span className="auth-summary-title">{a.title}</span>
                    {a.has_signature && <span className="fchip fchip-soft" title="Tiene firma registrada">✍️ Firmada</span>}
                    <StatusChip status={a.status} />
                  </li>
                ))}
              </ul>
              <p className="fc-note">{counts.map(c => `${c.n} ${c.label.toLowerCase()}${c.n === 1 ? '' : 's'}`).join(' · ')}</p>
            </>
          )}
        </div>
      </section>

      {auths.map(a => (
        <AuthorizationCard key={a.id} auth={a} family={family} canEdit={canEdit}
          studentId={studentId} showToast={showToast} reload={reload} />
      ))}

      {showAdd && (
        <AddAuthorizationModal studentId={studentId} existing={auths} showToast={showToast}
          onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); reload(); }} />
      )}
    </>
  );
}
