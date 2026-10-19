import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { errMsg, fmtBytes } from './fichaShared';
import './StudentFichaPage.css';

const MAX_XLSX = 25 * 1024 * 1024;
const ACTION_LABEL = { crear: 'Crear', actualizar: 'Actualizar', omitir: 'Omitir' };

function Totals({ result }) {
  const items = [
    ['Filas', result.total_rows, '#0f172a'],
    [result.dry_run ? 'Se crearán' : 'Creados', result.created, '#166534'],
    [result.dry_run ? 'Se actualizarán' : 'Actualizados', result.updated, '#1d4ed8'],
    ['Omitidos', result.skipped, '#64748b'],
    ['Errores', result.errors?.length || 0, (result.errors?.length || 0) ? '#991b1b' : '#64748b'],
  ];
  return (
    <div className="imp-totals">
      {items.map(([label, n, color]) => (
        <div key={label} className="imp-total"><b style={{ color }}>{n ?? 0}</b><span>{label}</span></div>
      ))}
    </div>
  );
}

function ResultTable({ result, confirmed, primary }) {
  const rows = result.rows || [];
  if (!rows.length) return <p className="fc-note">El archivo no tiene filas con alumnos.</p>;
  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Fila</th><th>RUT</th><th>Nombre</th><th>Acción</th><th>Familia</th><th>Autoriz.</th><th>Advertencias</th>
            {confirmed && <th>Ficha</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const sid = r.student_id || r.id;
            return (
              <tr key={`${r.row}-${i}`}>
                <td style={{ color: '#94a3b8', fontWeight: 600 }}>{r.row}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{r.rut || '—'}</td>
                <td style={{ fontWeight: 600 }}>{r.name || '—'}</td>
                <td><span className={`imp-action ${r.action}`}>{ACTION_LABEL[r.action] || r.action}</span></td>
                <td style={{ textAlign: 'center' }}>{r.family ?? 0}</td>
                <td style={{ textAlign: 'center' }}>{r.authorizations ?? 0}</td>
                <td>
                  {r.warnings?.length ? (
                    <ul className="imp-warn">{r.warnings.map((w, j) => <li key={j}>{w}</li>)}</ul>
                  ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                </td>
                {confirmed && (
                  <td>
                    {sid && r.action !== 'omitir' ? (
                      <Link to={`/students/${sid}/ficha`} className="btn btn-secondary btn-sm" style={{ color: primary }}>🗂️ Ver ficha</Link>
                    ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function StudentImportPage() {
  const { school } = useAuth();
  const primary = school?.primary_color || '#2563EB';
  const [searchParams] = useSearchParams();
  const fileRef = useRef(null);

  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState(searchParams.get('course_id') || '');
  const [createAccess, setCreateAccess] = useState(false);
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(null); // 'preview' | 'confirm'
  const [preview, setPreview] = useState(null);
  const [final, setFinal] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), type === 'error' ? 5000 : 3500); };

  useEffect(() => {
    axios.get('/api/courses/').then(({ data }) => setCourses(Array.isArray(data) ? data : [])).catch(() => setCourses([]));
  }, []);

  const chooseFile = (f) => {
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) { showToast('El archivo debe ser una planilla Excel .xlsx', 'error'); return; }
    if (f.size > MAX_XLSX) { showToast('El archivo supera los 25 MB', 'error'); return; }
    setFile(f);
    setPreview(null);
    setFinal(null);
  };

  const send = async (dryRun) => {
    if (!file) { showToast('Selecciona el archivo del Libro de Matrícula', 'error'); return null; }
    const fd = new FormData();
    fd.append('file', file);
    if (courseId) fd.append('course_id', courseId);
    fd.append('dry_run', dryRun ? 'true' : 'false');
    fd.append('create_guardian_access', createAccess ? 'true' : 'false');
    const { data } = await axios.post('/api/students/import', fd);
    return data;
  };

  const doPreview = async () => {
    setBusy('preview');
    setFinal(null);
    try {
      const data = await send(true);
      if (data) setPreview(data);
    } catch (err) {
      showToast(errMsg(err, 'No se pudo leer el archivo'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const doConfirm = async () => {
    if (!window.confirm('¿Confirmar la importación? Se crearán y actualizarán los alumnos, familias y autorizaciones mostrados.')) return;
    setBusy('confirm');
    try {
      const data = await send(false);
      if (data) {
        setFinal(data);
        showToast(`Importación completada: ${data.created || 0} creados, ${data.updated || 0} actualizados`);
      }
    } catch (err) {
      showToast(errMsg(err, 'No se pudo completar la importación'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const reset = () => { setFile(null); setPreview(null); setFinal(null); };
  const shown = final || preview;
  const vars = { '--fp': primary, '--fp-tint': `${primary}0f`, '--fp-soft': `${primary}22`, '--fp-ring': `${primary}33` };

  return (
    <div className="ficha" style={vars}>
      <div className="page-header">
        <div>
          <h1 className="page-title">📥 Importar Libro de Matrícula</h1>
          <p className="page-subtitle">Carga la planilla Excel (.xlsx) del Libro de Matrícula para crear o actualizar la ficha completa de los alumnos: datos personales, familia, antecedentes médicos y autorizaciones.</p>
        </div>
        {courseId && <Link to={`/courses/${courseId}`} className="btn btn-secondary">← Volver al curso</Link>}
      </div>

      <section className="fc">
        <header className="fc-head"><h3 className="fc-title"><span className="fc-icon" aria-hidden="true">⚙️</span>1. Opciones y archivo</h3></header>
        <div className="imp-steps">
          <div className="form-group">
            <label htmlFor="imp-course">Curso de destino</label>
            <select id="imp-course" value={courseId} disabled={!!busy || !!final}
              onChange={e => { setCourseId(e.target.value); setPreview(null); }}>
              <option value="">Detectar desde el Excel (columna id_curso)</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}{c.year ? ` · ${c.year}` : ''}</option>)}
            </select>
            <small className="ff-hint">Si eliges un curso, todos los alumnos del archivo se matricularán en él.</small>
          </div>
          <div className="form-group">
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Accesos de apoderado</span>
            <label className="fcheck" htmlFor="imp-access" style={{ marginTop: 6 }}>
              <input id="imp-access" type="checkbox" checked={createAccess} disabled={!!busy || !!final}
                onChange={e => { setCreateAccess(e.target.checked); setPreview(null); }} />
              <span>Crear cuentas de acceso para los apoderados con correo</span>
            </label>
            <small className="ff-hint">Contraseña inicial: Apoderado2026! (las cuentas existentes solo se vinculan).</small>
          </div>
        </div>

        <div
          className={`doc-drop${drag ? ' drag' : ''}${file ? ' has-file' : ''}`} style={{ marginTop: 18 }}
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); if (!busy && !final) chooseFile(e.dataTransfer?.files?.[0]); }}
        >
          {file ? (
            <div className="doc-drop-file">
              <span className="doc-file-icon" aria-hidden="true">📗</span>
              <div><strong>{file.name}</strong><small>{fmtBytes(file.size)}</small></div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={reset} disabled={!!busy}>Cambiar archivo</button>
            </div>
          ) : (
            <>
              <span className="doc-drop-icon" aria-hidden="true">📊</span>
              <p><strong>Arrastra aquí el Libro de Matrícula</strong> o</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>Seleccionar archivo .xlsx</button>
              <small>Formato del Libro de Matrícula (una fila por alumno)</small>
            </>
          )}
          <input ref={fileRef} type="file" hidden aria-label="Seleccionar Libro de Matrícula"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; chooseFile(f); }} />
        </div>

        <div className="fc-foot">
          <div className="fc-foot-left">Primero se muestra una previsualización: nada se guarda hasta que confirmes.</div>
          <button type="button" className="fbtn-save" onClick={doPreview} disabled={!file || !!busy || !!final}>
            {busy === 'preview' && <span className="fspin" aria-hidden="true" />}
            {busy === 'preview' ? 'Analizando…' : '🔍 Previsualizar'}
          </button>
        </div>
      </section>

      {shown && (
        <section className="fc">
          <header className="fc-head">
            <h3 className="fc-title">
              <span className="fc-icon" aria-hidden="true">{final ? '✅' : '👀'}</span>
              {final ? '3. Importación completada' : '2. Previsualización'}
            </h3>
            {shown.course && (
              <span className="fchip fchip-soft">Curso: {shown.course.name}</span>
            )}
          </header>
          {!final && (
            <div className="fc-alert" style={{ marginTop: 0, marginBottom: 16 }}>
              <strong>Revisa antes de confirmar.</strong>
              <p>Esta es una simulación: todavía no se ha guardado nada. Los valores vacíos del Excel no reemplazan datos existentes.</p>
            </div>
          )}
          <Totals result={shown} />
          {shown.errors?.length > 0 && (
            <div className="imp-errors">
              <strong>⚠️ {shown.errors.length} fila(s) con errores{final ? ' (no se importaron)' : ''}:</strong>
              <ul>{shown.errors.map((e, i) => <li key={i}>Fila {e.row}: {e.error}</li>)}</ul>
            </div>
          )}
          <ResultTable result={shown} confirmed={!!final} primary={primary} />
          <div className="fc-foot">
            <div className="fc-foot-left">
              {final
                ? <>Listo. {shown.course?.id && <Link to={`/courses/${shown.course.id}`} style={{ color: primary, fontWeight: 600 }}>Ir al curso {shown.course.name} →</Link>}</>
                : 'Si todo se ve bien, confirma para guardar los datos.'}
            </div>
            {final ? (
              <button type="button" className="btn btn-secondary" onClick={reset}>Importar otro archivo</button>
            ) : (
              <button type="button" className="fbtn-save" onClick={doConfirm} disabled={!!busy || !(shown.created || shown.updated)}>
                {busy === 'confirm' && <span className="fspin" aria-hidden="true" />}
                {busy === 'confirm' ? 'Importando…' : '✅ Confirmar importación'}
              </button>
            )}
          </div>
        </section>
      )}

      {toast && (
        <div className="toast-container" role="status" aria-live="polite">
          <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  );
}
