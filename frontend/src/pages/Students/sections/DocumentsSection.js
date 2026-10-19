import React, { useRef, useState } from 'react';
import axios from 'axios';
import { errMsg, fmtDateTime, fmtBytes, fetchDocument, docExtension, fileIcon } from '../fichaShared';
import { CATEGORIAS_DOCUMENTO, DOC_EXTENSIONS, DOC_MAX_BYTES } from '../fichaOptions';

const ACCEPT = DOC_EXTENSIONS.map(e => `.${e}`).join(',');

function validateFile(file) {
  if (!file) return 'Selecciona un archivo';
  const ext = docExtension(file.name);
  if (!DOC_EXTENSIONS.includes(ext)) return `Formato no permitido (.${ext || '?'}). Permitidos: ${DOC_EXTENSIONS.join(', ')}`;
  if (file.size > DOC_MAX_BYTES) return `El archivo pesa ${fmtBytes(file.size)}; el máximo es 10 MB`;
  return null;
}

/* ───────── Zona de subida ───────── */
function UploadZone({ studentId, showToast, reload }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Otro');
  const [description, setDescription] = useState('');
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);

  const choose = (f) => {
    const err = validateFile(f);
    if (err) { showToast(err, 'error'); return; }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) choose(f);
  };

  const clear = () => { setFile(null); setTitle(''); setDescription(''); setCategory('Otro'); };

  const upload = async () => {
    const err = validateFile(file);
    if (err) { showToast(err, 'error'); return; }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', title.trim() || file.name);
    fd.append('category', category);
    if (description.trim()) fd.append('description', description.trim());
    setBusy(true);
    try {
      await axios.post(`/api/students/${studentId}/documents`, fd);
      showToast('Documento subido');
      clear();
      await reload();
    } catch (e2) {
      showToast(errMsg(e2, 'No se pudo subir el documento'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="doc-upload">
      <div
        className={`doc-drop${drag ? ' drag' : ''}${file ? ' has-file' : ''}`}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        {file ? (
          <div className="doc-drop-file">
            <span className="doc-file-icon" aria-hidden="true">{fileIcon(file.name, file.type)}</span>
            <div>
              <strong>{file.name}</strong>
              <small>{fmtBytes(file.size)}</small>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={clear} disabled={busy}>Cambiar</button>
          </div>
        ) : (
          <>
            <span className="doc-drop-icon" aria-hidden="true">📤</span>
            <p><strong>Arrastra un archivo aquí</strong> o</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()}>Seleccionar archivo</button>
            <small>PDF, imágenes, Word, Excel o texto · máx. 10 MB</small>
          </>
        )}
        <input ref={inputRef} type="file" accept={ACCEPT} hidden aria-label="Seleccionar documento"
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) choose(f); }} />
      </div>
      {file && (
        <div className="doc-upload-form">
          <div className="form-group">
            <label htmlFor="doc-new-title">Título</label>
            <input id="doc-new-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={300} />
          </div>
          <div className="form-group">
            <label htmlFor="doc-new-cat">Categoría</label>
            <select id="doc-new-cat" value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIAS_DOCUMENTO.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group doc-upload-desc">
            <label htmlFor="doc-new-desc">Descripción</label>
            <input id="doc-new-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="Opcional" />
          </div>
          <div className="doc-upload-actions">
            <button type="button" className="fbtn-save" onClick={upload} disabled={busy}>
              {busy && <span className="fspin" aria-hidden="true" />}{busy ? 'Subiendo…' : 'Subir documento'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── Modal editar ───────── */
function EditDocModal({ doc, studentId, onClose, onDone, showToast }) {
  const [title, setTitle] = useState(doc.title || doc.filename || '');
  const [category, setCategory] = useState(doc.category || 'Otro');
  const [description, setDescription] = useState(doc.description || '');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (file) {
        const err = validateFile(file);
        if (err) { showToast(err, 'error'); setBusy(false); return; }
        const fd = new FormData();
        fd.append('file', file);
        fd.append('title', title.trim() || file.name);
        fd.append('category', category);
        fd.append('description', description.trim());
        await axios.put(`/api/students/${studentId}/documents/${doc.id}`, fd);
      } else {
        await axios.put(`/api/students/${studentId}/documents/${doc.id}`, {
          title: title.trim() || doc.filename, category, description: description.trim() || null,
        });
      }
      showToast('Documento actualizado');
      onDone();
    } catch (err) {
      showToast(errMsg(err, 'No se pudo actualizar el documento'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 500 }} role="dialog" aria-modal="true" aria-labelledby="edit-doc-title">
        <div className="modal-header">
          <h3 id="edit-doc-title">✏️ Editar documento</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
              <div className="form-group">
                <label htmlFor="doc-ed-title">Título</label>
                <input id="doc-ed-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={300} />
              </div>
              <div className="form-group">
                <label htmlFor="doc-ed-cat">Categoría</label>
                <select id="doc-ed-cat" value={category} onChange={e => setCategory(e.target.value)}>
                  {!CATEGORIAS_DOCUMENTO.includes(category) && <option value={category}>{category}</option>}
                  {CATEGORIAS_DOCUMENTO.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="doc-ed-desc">Descripción</label>
                <textarea id="doc-ed-desc" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="doc-ed-file">Reemplazar archivo (opcional)</label>
                <input id="doc-ed-file" type="file" accept={ACCEPT}
                  onChange={e => {
                    const f = e.target.files?.[0] || null;
                    const err = f ? validateFile(f) : null;
                    if (err) { showToast(err, 'error'); e.target.value = ''; setFile(null); return; }
                    setFile(f);
                  }} />
                <small className="ff-hint">Actual: {doc.filename} {doc.size_bytes ? `(${fmtBytes(doc.size_bytes)})` : ''}</small>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function DocumentsSection({ ficha, canEdit, studentId, showToast, reload }) {
  const docs = ficha.documents || [];
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const open = async (doc, inline) => {
    setBusyId(doc.id);
    try {
      await fetchDocument(studentId, doc, { inline });
    } catch (err) {
      showToast(err.message || 'No se pudo abrir el documento', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (doc) => {
    if (!window.confirm(`¿Quitar el documento "${doc.title || doc.filename}"? Esta acción no se puede deshacer.`)) return;
    setBusyId(doc.id);
    try {
      await axios.delete(`/api/students/${studentId}/documents/${doc.id}`);
      showToast('Documento eliminado');
      await reload();
    } catch (err) {
      showToast(errMsg(err, 'No se pudo eliminar el documento'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="fc">
      <header className="fc-head">
        <h3 className="fc-title"><span className="fc-icon" aria-hidden="true">📁</span>Archivos y Documentos</h3>
        <span className="fc-count">{docs.length} {docs.length === 1 ? 'archivo' : 'archivos'}</span>
      </header>
      <div className="fc-body">
        {canEdit && <UploadZone studentId={studentId} showToast={showToast} reload={reload} />}

        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr><th>Archivo</th><th>Categoría</th><th>Registro</th><th className="ta-r">Acciones</th></tr>
            </thead>
            <tbody>
              {docs.length === 0 ? (
                <tr className="doc-empty-row">
                  <td colSpan={4}>
                    <div className="fc-empty-inline">
                      <span aria-hidden="true">🗂️</span>
                      <p>Aún no hay documentos para este estudiante.{canEdit ? ' Sube certificados, informes o autorizaciones firmadas desde la zona de arriba.' : ''}</p>
                    </div>
                  </td>
                </tr>
              ) : docs.map(d => (
                <tr key={d.id}>
                  <td data-label="Archivo">
                    <div className="doc-name">
                      <span className="doc-file-icon" aria-hidden="true">{fileIcon(d.filename, d.mime_type)}</span>
                      <div>
                        <strong>{d.title || d.filename}</strong>
                        <small>{d.filename}{d.size_bytes ? ` · ${fmtBytes(d.size_bytes)}` : ''}</small>
                        {d.description && <small className="doc-desc">{d.description}</small>}
                      </div>
                    </div>
                  </td>
                  <td data-label="Categoría"><span className="fchip fchip-soft">{d.category || 'Otro'}</span></td>
                  <td data-label="Registro">
                    <span className="doc-reg">{fmtDateTime(d.created_at)}</span>
                    {d.uploaded_by_name && <small className="doc-reg-by">por {d.uploaded_by_name}</small>}
                  </td>
                  <td data-label="Acciones" className="ta-r">
                    <div className="doc-actions">
                      <button type="button" className="btn btn-secondary btn-sm" disabled={busyId === d.id} onClick={() => open(d, true)}>👁️ Ver</button>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={busyId === d.id} onClick={() => open(d, false)}>⬇️ Descargar</button>
                      {canEdit && (
                        <>
                          <button type="button" className="btn btn-secondary btn-sm" disabled={busyId === d.id} onClick={() => setEditing(d)}>✏️ Editar</button>
                          <button type="button" className="btn btn-danger btn-sm" disabled={busyId === d.id} onClick={() => remove(d)}>Quitar</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {editing && (
        <EditDocModal doc={editing} studentId={studentId} showToast={showToast}
          onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />
      )}
    </section>
  );
}
