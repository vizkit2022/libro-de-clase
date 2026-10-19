// Componentes y utilidades compartidas por las secciones de la ficha del alumno
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

/* ───────────────────────── Formularios ───────────────────────── */

// Convierte un objeto de la API en valores de formulario según un esquema {campo: tipo}
// tipos: 'text' (default) | 'number' | 'bool' | 'date'
export function pickForm(src, schema) {
  const s = src || {};
  const out = {};
  Object.entries(schema).forEach(([name, type]) => {
    const v = s[name];
    if (type === 'bool') out[name] = v === true ? true : v === false ? false : null;
    else if (type === 'date') out[name] = v ? String(v).slice(0, 10) : '';
    else if (type === 'number') out[name] = v === null || v === undefined ? '' : String(v);
    else out[name] = v === null || v === undefined ? '' : String(v);
  });
  return out;
}

// Convierte los valores del formulario en el payload a enviar ('' → null, números → Number)
export function toPayload(form, schema) {
  const out = {};
  Object.entries(schema).forEach(([name, type]) => {
    const v = form[name];
    if (type === 'bool') out[name] = v === true ? true : v === false ? false : null;
    else if (type === 'number') {
      if (v === '' || v === null || v === undefined) out[name] = null;
      else {
        const n = Number(String(v).replace(',', '.'));
        out[name] = Number.isFinite(n) ? n : null;
      }
    } else {
      const t = typeof v === 'string' ? v.trim() : v;
      out[name] = t === '' || t === undefined ? null : t;
    }
  });
  return out;
}

// Estado de formulario por tarjeta con "dirty tracking".
// Se re-sincroniza solo cuando cambia el contenido de `source` (no la referencia),
// así guardar otra tarjeta no pisa los cambios sin guardar de ésta.
export function useCardForm(source) {
  const key = JSON.stringify(source);
  const [orig, setOrig] = useState(source);
  const [form, setForm] = useState(source);
  useEffect(() => {
    const s = JSON.parse(key);
    setOrig(s);
    setForm(s);
  }, [key]);
  const setField = useCallback((name, value) => setForm(f => ({ ...f, [name]: value })), []);
  const dirty = JSON.stringify(form) !== JSON.stringify(orig);
  const reset = () => setForm(orig);
  return { form, setForm, setField, dirty, reset };
}

// Devuelve una función b(name) con las props para un control
export function makeBinder(prefix, form, setField, canEdit) {
  return (name) => ({
    id: `${prefix}-${name}`,
    name,
    value: form[name],
    onChange: (v) => setField(name, v),
    disabled: !canEdit,
  });
}

/* ───────────────────────── Controles ───────────────────────── */

export function Field({ label, htmlFor, required, full, stack, children, hint }) {
  return (
    <div className={`ff${full ? ' full' : ''}${stack ? ' stack' : ''}`}>
      <label className="ff-label" htmlFor={htmlFor}>
        {label}{required && <span className="ff-req"> *</span>}
      </label>
      <div className="ff-control">
        {children}
        {hint && <small className="ff-hint">{hint}</small>}
      </div>
    </div>
  );
}

const normOptions = (options) => (options || []).map(o => (typeof o === 'string' ? { value: o, label: o } : o));

export function Sel({ id, name, value, onChange, disabled, options, placeholder = 'Seleccionar…', className = 'fi' }) {
  const opts = normOptions(options);
  const v = value === null || value === undefined ? '' : String(value);
  // Si el valor viene importado y no está en la lista, se muestra igual
  const extra = v && !opts.some(o => String(o.value) === v) ? [{ value: v, label: v }] : [];
  return (
    <select id={id} name={name} className={className} value={v} disabled={disabled}
      onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {[...extra, ...opts].map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Radios({ id, name, value, onChange, disabled, options }) {
  const opts = normOptions(options);
  return (
    <div className="fr-group" role="radiogroup">
      {opts.map((o, i) => (
        <label key={String(o.value)} className={`fr${disabled ? ' disabled' : ''}`}>
          <input type="radio" id={i === 0 ? id : `${id}-${i}`} name={id} checked={value === o.value}
            disabled={disabled} onChange={() => onChange(o.value)} />
          <span className="fr-dot" />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

export function YesNo(props) {
  return <Radios {...props} options={[{ value: true, label: 'Sí' }, { value: false, label: 'No' }]} />;
}

export function Check({ id, value, onChange, disabled, label }) {
  return (
    <label className={`fcheck${disabled ? ' disabled' : ''}`} htmlFor={id}>
      <input type="checkbox" id={id} checked={value === true} disabled={disabled}
        onChange={e => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

// Campo genérico: <FF b={b} name="first_name" label="Nombres" required />
export function FF({ b, name, label, type = 'text', options, required, full, stack, placeholder, listId, step, min, max, rows, hint, maxLength }) {
  const p = b(name);
  let control;
  if (type === 'select') {
    control = <Sel {...p} options={options} />;
  } else if (type === 'area') {
    control = (
      <textarea className="fi" id={p.id} name={name} value={p.value ?? ''} disabled={p.disabled}
        rows={rows || 3} placeholder={placeholder} onChange={e => p.onChange(e.target.value)} />
    );
  } else if (type === 'yesno') {
    control = <YesNo {...p} />;
  } else if (type === 'radios') {
    control = <Radios {...p} options={options} />;
  } else {
    control = (
      <input className="fi" id={p.id} name={name} type={type} value={p.value ?? ''} disabled={p.disabled}
        placeholder={placeholder} list={listId} step={step} min={min} max={max} maxLength={maxLength}
        onChange={e => p.onChange(e.target.value)} />
    );
  }
  return <Field label={label} htmlFor={p.id} required={required} full={full} stack={stack} hint={hint}>{control}</Field>;
}

/* ───────────────────────── Tarjeta ───────────────────────── */

export function FichaCard({ icon, title, children, canEdit, onSave, dirty, saving, actions, footerLeft, className = '', badge }) {
  return (
    <section className={`fc ${className}`}>
      <header className="fc-head">
        <h3 className="fc-title">
          {icon && <span className="fc-icon" aria-hidden="true">{icon}</span>}
          {title}
          {badge}
        </h3>
        {actions && <div className="fc-actions">{actions}</div>}
      </header>
      <div className="fc-body">{children}</div>
      {((canEdit && onSave) || footerLeft) && (
        <footer className="fc-foot">
          <div className="fc-foot-left">{footerLeft}</div>
          {canEdit && onSave && (
            <button type="button" className="fbtn-save" disabled={!dirty || saving} onClick={onSave}>
              {saving && <span className="fspin" aria-hidden="true" />}
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          )}
        </footer>
      )}
    </section>
  );
}

// Hook para el estado "guardando" de una tarjeta
export function useSaver(showToast) {
  const [saving, setSaving] = useState(false);
  const run = async (fn, okMsg = 'Cambios guardados') => {
    setSaving(true);
    try {
      await fn();
      if (okMsg) showToast(okMsg);
      return true;
    } catch (err) {
      showToast(errMsg(err, 'No se pudieron guardar los cambios'), 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };
  return [saving, run];
}

/* ───────────────────────── Utilidades ───────────────────────── */

export function errMsg(err, fallback = 'Ocurrió un error') {
  const d = err?.response?.data;
  if (d && typeof d === 'object' && !(typeof Blob !== 'undefined' && d instanceof Blob) && d.error) return d.error;
  if (err?.response?.status === 413) return 'El archivo es demasiado grande';
  if (err?.response?.status === 403) return 'No tienes permiso para realizar esta acción';
  return fallback;
}

// Igual que errMsg pero lee el error cuando la respuesta es un Blob (responseType: 'blob')
export async function blobErrMsg(err, fallback = 'No se pudo obtener el archivo') {
  const d = err?.response?.data;
  if (typeof Blob !== 'undefined' && d instanceof Blob) {
    try {
      const txt = await d.text();
      const j = JSON.parse(txt);
      if (j?.error) return j.error;
    } catch { /* noop */ }
  }
  return errMsg(err, fallback);
}

export function fmtDate(iso) {
  if (!iso) return '';
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return fmtDate(iso);
  return dt.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function calcAge(birth) {
  if (!birth) return null;
  const b = new Date(String(birth).slice(0, 10) + 'T12:00');
  if (Number.isNaN(b.getTime())) return null;
  const t = new Date();
  let a = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
  return a;
}

// Reduce una imagen de firma: máx 800 px lado mayor; JPEG 0.85, o PNG si el original
// es PNG pequeño (< 300 KB) para conservar la transparencia.
export function resizeSignature(file, maxDim = 800) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagen no soportado'));
      img.onload = () => {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
        const keepPng = file.type === 'image/png' && file.size < 300 * 1024;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!keepPng) {
          // JPEG no tiene transparencia: fondo blanco
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(keepPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Ver (inline, nueva pestaña) o descargar un documento usando axios (con token)
export async function fetchDocument(studentId, doc, { inline = false } = {}) {
  // Abrimos la pestaña antes del await para evitar el bloqueador de popups
  const win = inline ? window.open('', '_blank') : null;
  try {
    const res = await axios.get(`/api/students/${studentId}/documents/${doc.id}/download`, {
      params: inline ? { inline: 1 } : undefined,
      responseType: 'blob',
    });
    const type = doc.mime_type || res.headers?.['content-type'] || 'application/octet-stream';
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type });
    const typed = blob.type ? blob : new Blob([blob], { type });
    const url = URL.createObjectURL(typed);
    if (inline && win) {
      win.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.filename || doc.title || 'documento';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  } catch (err) {
    if (win) win.close();
    throw new Error(await blobErrMsg(err));
  }
}

export function docExtension(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

export function fileIcon(name, mime) {
  const ext = docExtension(name);
  if ((mime || '').startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic'].includes(ext)) return '🖼️';
  if (ext === 'pdf') return '📕';
  if (['doc', 'docx'].includes(ext)) return '📘';
  if (['xls', 'xlsx'].includes(ext)) return '📗';
  return '📄';
}

// PUT /profile con las partes indicadas; la API devuelve la ficha completa
export async function saveProfileParts(studentId, { user, profile }, applyFicha, reload) {
  const body = {};
  if (user && Object.keys(user).length) body.user = user;
  if (profile && Object.keys(profile).length) body.profile = profile;
  const { data } = await axios.put(`/api/students/${studentId}/profile`, body);
  if (data && data.student && data.profile) applyFicha(data);
  else await reload();
}
