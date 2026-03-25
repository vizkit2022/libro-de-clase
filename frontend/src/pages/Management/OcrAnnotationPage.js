import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

const TIPO_LABELS = {
  positiva:  { label: 'Positiva',  icon: '⭐', bg: '#d1fae5', color: '#065f46', border: '#6ee7b7' },
  negativa:  { label: 'Negativa',  icon: '⚠️', bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
  neutral:   { label: 'Neutral',   icon: '📝', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
  academica: { label: 'Académica', icon: '📚', bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' },
};

const STEPS = { UPLOAD: 'upload', LOADING: 'loading', REVIEW: 'review', SAVING: 'saving', DONE: 'done' };

export default function OcrAnnotationPage() {
  const { school, user } = useAuth();
  const primary = school?.primary_color || '#2563EB';
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  const [step, setStep] = useState(STEPS.UPLOAD);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [imageType, setImageType] = useState('jpeg');
  const [transcription, setTranscription] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);
  const [toast, setToast] = useState(null);

  // Datos para asignar al alumno
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    Promise.all([
      axios.get('/api/users/?role=alumno'),
      axios.get('/api/courses/')
    ]).then(([studRes, courseRes]) => {
      setStudents(studRes.data);
      setCourses(courseRes.data);
    }).catch(() => {});
  }, []);

  // Cuando cambia el alumno, pre-selecciona su curso
  useEffect(() => {
    if (!selectedStudent) return;
    const sid = parseInt(selectedStudent);
    // Buscar en enrollments del alumno
    axios.get(`/api/reports/student/${sid}/life`)
      .then(({ data }) => {
        const enrollment = data.enrollments?.[0];
        if (enrollment?.course_id) setSelectedCourse(String(enrollment.course_id));
      }).catch(() => {});
  }, [selectedStudent]);

  const processFile = useCallback((file) => {
    if (!file) return;
    const ext = file.type.split('/')[1] || 'jpeg';
    setImageType(ext === 'jpg' ? 'jpeg' : ext);

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target.result;          // data:image/jpeg;base64,...
      setImagePreview(result);
      // Extraer solo la parte base64
      const base64 = result.split(',')[1];
      setImageBase64(base64);
    };
    reader.readAsDataURL(file);
    setStep(STEPS.UPLOAD);
    setTranscription(null);
    setAnnotations([]);
    setErrorMsg(null);
  }, []);

  const handleFileChange = (e) => {
    processFile(e.target.files?.[0]);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) processFile(file);
  };

  const handleTranscribe = async () => {
    if (!imageBase64) return;
    setStep(STEPS.LOADING);
    setErrorMsg(null);
    try {
      const { data } = await axios.post('/api/ocr/transcribe', {
        image: imageBase64,
        image_type: imageType
      });
      setTranscription(data);
      // Convertir anotaciones a estado editable
      setAnnotations((data.anotaciones || []).map((ann, i) => ({
        id: i,
        titulo: ann.titulo || '',
        descripcion: ann.descripcion || '',
        tipo: ann.tipo || 'neutral',
        fecha: new Date().toISOString().split('T')[0],
        alumno_nombre: ann.alumno_nombre || '',
        selected: true,
      })));
      setStep(STEPS.REVIEW);
    } catch (err) {
      const msg = err.response?.data?.error || 'Error al procesar la imagen';
      const hint = err.response?.data?.hint || '';
      setErrorMsg(hint ? `${msg}. ${hint}` : msg);
      setStep(STEPS.UPLOAD);
    }
  };

  const updateAnnotation = (id, field, value) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
  };

  const removeAnnotation = (id) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
  };

  const addBlankAnnotation = () => {
    setAnnotations(prev => [...prev, {
      id: Date.now(),
      titulo: '',
      descripcion: '',
      tipo: 'neutral',
      fecha: new Date().toISOString().split('T')[0],
      alumno_nombre: '',
      selected: true,
    }]);
  };

  const handleSave = async () => {
    if (!selectedStudent || !selectedCourse) {
      showToast('Debes seleccionar alumno y curso antes de guardar', 'error');
      return;
    }
    const toSave = annotations.filter(a => a.selected && a.titulo && a.descripcion);
    if (toSave.length === 0) {
      showToast('No hay anotaciones seleccionadas para guardar', 'error');
      return;
    }
    setStep(STEPS.SAVING);
    try {
      const { data } = await axios.post('/api/ocr/save', {
        student_id: parseInt(selectedStudent),
        course_id: parseInt(selectedCourse),
        anotaciones: toSave.map(a => ({
          titulo: a.titulo,
          descripcion: a.descripcion,
          tipo: a.tipo,
          fecha: a.fecha,
        }))
      });
      setStep(STEPS.DONE);
      showToast(data.message || 'Anotaciones guardadas', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Error al guardar', 'error');
      setStep(STEPS.REVIEW);
    }
  };

  const resetAll = () => {
    setStep(STEPS.UPLOAD);
    setImagePreview(null);
    setImageBase64(null);
    setTranscription(null);
    setAnnotations([]);
    setErrorMsg(null);
    setSelectedStudent('');
    setSelectedCourse('');
  };

  // ─── RENDER ───────────────────────────────────────────────────
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">📷 Libro de clases digital</h1>
          <p className="page-subtitle">Fotografía el libro de clases y transcribe las anotaciones automáticamente</p>
        </div>
      </div>

      {/* Indicador de pasos */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28 }}>
        {[
          { key: STEPS.UPLOAD, label: '1. Foto', icon: '📷' },
          { key: STEPS.REVIEW, label: '2. Revisar', icon: '✏️' },
          { key: STEPS.DONE, label: '3. Listo', icon: '✅' },
        ].map((s, i, arr) => {
          const done = (
            (s.key === STEPS.UPLOAD && [STEPS.REVIEW, STEPS.SAVING, STEPS.DONE].includes(step)) ||
            (s.key === STEPS.REVIEW && [STEPS.SAVING, STEPS.DONE].includes(step)) ||
            s.key === step
          );
          const active = s.key === step ||
            (s.key === STEPS.UPLOAD && step === STEPS.LOADING) ||
            (s.key === STEPS.REVIEW && step === STEPS.SAVING);
          return (
            <React.Fragment key={s.key}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 18px',
                borderRadius: 8,
                background: active ? primary : done ? '#ecfdf5' : '#f8fafc',
                color: active ? '#fff' : done ? '#065f46' : '#94a3b8',
                fontWeight: active ? 700 : 500,
                fontSize: 13,
                transition: 'all 0.2s'
              }}>
                <span>{s.icon}</span>
                <span>{s.label}</span>
              </div>
              {i < arr.length - 1 && (
                <div style={{ flex: 1, height: 2, background: done ? primary : '#e2e8f0', transition: 'background 0.3s', minWidth: 20, maxWidth: 60 }} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── PASO 1: Subir imagen ── */}
      {(step === STEPS.UPLOAD || step === STEPS.LOADING) && (
        <div style={{ display: 'grid', gridTemplateColumns: imagePreview ? '1fr 1fr' : '1fr', gap: 20 }}>

          {/* Zona de drop / botones */}
          <div className="card">
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => !imagePreview && fileRef.current?.click()}
              style={{
                border: `2px dashed ${imagePreview ? '#e2e8f0' : primary}`,
                borderRadius: 12,
                padding: imagePreview ? '16px' : '48px 24px',
                textAlign: 'center',
                cursor: imagePreview ? 'default' : 'pointer',
                background: imagePreview ? '#fafafa' : `${primary}08`,
                transition: 'all 0.2s',
              }}
            >
              {!imagePreview ? (
                <>
                  <div style={{ fontSize: 52, marginBottom: 12 }}>📄</div>
                  <p style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', marginBottom: 6 }}>
                    Arrastra una foto aquí
                  </p>
                  <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>
                    o haz clic para seleccionar desde tu dispositivo
                  </p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-primary"
                      style={{ background: primary }}
                      onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
                    >
                      🖼️ Elegir imagen
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={e => { e.stopPropagation(); cameraRef.current?.click(); }}
                    >
                      📷 Usar cámara
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => fileRef.current?.click()}
                  >
                    🔄 Cambiar imagen
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => cameraRef.current?.click()}
                  >
                    📷 Nueva foto
                  </button>
                </div>
              )}
            </div>

            {/* Inputs ocultos */}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileChange} />

            {/* Error */}
            {errorMsg && (
              <div style={{
                marginTop: 16, padding: '12px 16px',
                background: '#fef2f2', border: '1px solid #fca5a5',
                borderRadius: 8, color: '#991b1b', fontSize: 13
              }}>
                ❌ {errorMsg}
              </div>
            )}

            {/* Botón transcribir */}
            {imagePreview && step !== STEPS.LOADING && (
              <button
                className="btn btn-primary"
                style={{ marginTop: 16, width: '100%', background: primary, fontSize: 15, padding: '12px 0' }}
                onClick={handleTranscribe}
              >
                🤖 Transcribir con IA
              </button>
            )}

            {step === STEPS.LOADING && (
              <div style={{
                marginTop: 16, textAlign: 'center', padding: '20px',
                background: `${primary}08`, borderRadius: 10
              }}>
                <div className="spinner" style={{ margin: '0 auto 12px', borderTopColor: primary }} />
                <p style={{ fontWeight: 600, color: primary, fontSize: 14 }}>Analizando imagen...</p>
                <p style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
                  Claude está leyendo el libro de clases
                </p>
              </div>
            )}

            {/* Tips */}
            {!imagePreview && (
              <div style={{ marginTop: 20 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>
                  💡 CONSEJOS PARA MEJORES RESULTADOS
                </p>
                <ul style={{ fontSize: 12, color: '#94a3b8', paddingLeft: 16, lineHeight: 1.8 }}>
                  <li>Fotografía con buena iluminación y sin sombras</li>
                  <li>Mantén el libro plano y la cámara perpendicular</li>
                  <li>Asegúrate que el texto sea legible en la pantalla</li>
                  <li>Puedes fotografiar una o varias páginas a la vez</li>
                </ul>
              </div>
            )}
          </div>

          {/* Vista previa */}
          {imagePreview && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
                <p style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>Vista previa</p>
              </div>
              <img
                src={imagePreview}
                alt="Vista previa"
                style={{
                  width: '100%',
                  maxHeight: 400,
                  objectFit: 'contain',
                  background: '#f8fafc',
                  display: 'block'
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* ── PASO 2: Revisar y editar anotaciones ── */}
      {(step === STEPS.REVIEW || step === STEPS.SAVING) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>

          {/* Panel izquierdo: anotaciones */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>
                  Anotaciones detectadas
                  <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: '#64748b' }}>
                    ({annotations.length} encontrada{annotations.length !== 1 ? 's' : ''})
                  </span>
                </p>
                {transcription?.observaciones && (
                  <p style={{ fontSize: 12, color: '#f59e0b', marginTop: 2 }}>
                    ⚠️ {transcription.observaciones}
                  </p>
                )}
              </div>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 12 }}
                onClick={addBlankAnnotation}
              >
                ＋ Agregar manual
              </button>
            </div>

            {annotations.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '32px' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
                <p style={{ color: '#64748b' }}>No se detectaron anotaciones en la imagen.</p>
                <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={addBlankAnnotation}>
                  ＋ Agregar manualmente
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {annotations.map((ann) => {
                  const tipo = TIPO_LABELS[ann.tipo] || TIPO_LABELS.neutral;
                  return (
                    <div key={ann.id} className="card" style={{
                      padding: 0,
                      border: `1.5px solid ${ann.selected ? tipo.border : '#e2e8f0'}`,
                      opacity: ann.selected ? 1 : 0.55,
                      transition: 'all 0.2s'
                    }}>
                      {/* Header de la anotación */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '12px 16px',
                        background: ann.selected ? tipo.bg : '#f8fafc',
                        borderRadius: '8px 8px 0 0',
                        borderBottom: '1px solid #f1f5f9'
                      }}>
                        {/* Checkbox seleccionar */}
                        <input
                          type="checkbox"
                          checked={ann.selected}
                          onChange={e => updateAnnotation(ann.id, 'selected', e.target.checked)}
                          style={{ width: 16, height: 16, accentColor: primary, flexShrink: 0 }}
                        />
                        <span style={{ fontSize: 18 }}>{tipo.icon}</span>

                        {/* Selector de tipo */}
                        <select
                          value={ann.tipo}
                          onChange={e => updateAnnotation(ann.id, 'tipo', e.target.value)}
                          style={{
                            fontSize: 12, fontWeight: 600,
                            background: tipo.bg, color: tipo.color,
                            border: `1px solid ${tipo.border}`,
                            borderRadius: 6, padding: '2px 8px',
                            cursor: 'pointer'
                          }}
                        >
                          {Object.entries(TIPO_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v.icon} {v.label}</option>
                          ))}
                        </select>

                        {/* Fecha */}
                        <input
                          type="date"
                          value={ann.fecha}
                          onChange={e => updateAnnotation(ann.id, 'fecha', e.target.value)}
                          style={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, padding: '2px 6px', marginLeft: 'auto' }}
                        />

                        {/* Eliminar */}
                        <button
                          onClick={() => removeAnnotation(ann.id)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: '#94a3b8', fontSize: 16, padding: '0 2px',
                            lineHeight: 1
                          }}
                          title="Eliminar"
                        >✕</button>
                      </div>

                      {/* Cuerpo editable */}
                      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input
                          value={ann.titulo}
                          onChange={e => updateAnnotation(ann.id, 'titulo', e.target.value)}
                          placeholder="Título de la anotación..."
                          style={{
                            width: '100%', fontSize: 14, fontWeight: 600,
                            border: '1px solid #e2e8f0', borderRadius: 6,
                            padding: '7px 10px', boxSizing: 'border-box',
                            background: '#fafafa'
                          }}
                        />
                        <textarea
                          value={ann.descripcion}
                          onChange={e => updateAnnotation(ann.id, 'descripcion', e.target.value)}
                          placeholder="Descripción de la anotación (texto transcrito del libro)..."
                          rows={3}
                          style={{
                            width: '100%', fontSize: 13,
                            border: '1px solid #e2e8f0', borderRadius: 6,
                            padding: '7px 10px', boxSizing: 'border-box',
                            resize: 'vertical', lineHeight: 1.5,
                            background: '#fafafa', color: '#374151'
                          }}
                        />
                        {ann.alumno_nombre && (
                          <p style={{ fontSize: 11, color: '#94a3b8' }}>
                            📌 Alumno mencionado en el libro: <strong>{ann.alumno_nombre}</strong>
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Botones inferiores */}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={resetAll}>← Nueva foto</button>
            </div>
          </div>

          {/* Panel derecho: seleccionar alumno */}
          <div style={{ position: 'sticky', top: 80 }}>
            <div className="card" style={{ border: `1.5px solid ${primary}40` }}>
              <p style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 16 }}>
                👤 Asignar a alumno
              </p>

              <div className="form-group" style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>
                  Alumno *
                </label>
                <select
                  value={selectedStudent}
                  onChange={e => setSelectedStudent(e.target.value)}
                  style={{ width: '100%', fontSize: 13 }}
                >
                  <option value="">Selecciona un alumno...</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.last_name}, {s.first_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>
                  Curso *
                </label>
                <select
                  value={selectedCourse}
                  onChange={e => setSelectedCourse(e.target.value)}
                  style={{ width: '100%', fontSize: 13 }}
                >
                  <option value="">Selecciona un curso...</option>
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Resumen */}
              <div style={{
                background: '#f8fafc', borderRadius: 8,
                padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#64748b'
              }}>
                <p style={{ marginBottom: 4 }}>
                  ✅ <strong style={{ color: '#0f172a' }}>{annotations.filter(a => a.selected).length}</strong> anotaciones para guardar
                </p>
                {selectedStudent && (
                  <p>
                    👤 <strong style={{ color: '#0f172a' }}>
                      {students.find(s => s.id === parseInt(selectedStudent))?.first_name}{' '}
                      {students.find(s => s.id === parseInt(selectedStudent))?.last_name}
                    </strong>
                  </p>
                )}
              </div>

              <button
                className="btn btn-primary"
                style={{
                  width: '100%',
                  background: primary,
                  padding: '12px 0',
                  fontSize: 14,
                  fontWeight: 700
                }}
                disabled={step === STEPS.SAVING || !selectedStudent || !selectedCourse || annotations.filter(a => a.selected).length === 0}
                onClick={handleSave}
              >
                {step === STEPS.SAVING ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2, borderTopColor: '#fff' }} />
                    Guardando...
                  </span>
                ) : '💾 Guardar anotaciones'}
              </button>

              {/* Vista previa thumbnail */}
              {imagePreview && (
                <div style={{ marginTop: 16 }}>
                  <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>Foto procesada:</p>
                  <img
                    src={imagePreview}
                    alt="preview"
                    style={{ width: '100%', borderRadius: 8, maxHeight: 160, objectFit: 'cover', border: '1px solid #e2e8f0' }}
                  />
                </div>
              )}
            </div>

            {/* Texto transcrito completo (colapsable) */}
            {transcription?.texto_completo && (
              <details style={{ marginTop: 14 }} className="card">
                <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#64748b' }}>
                  📄 Ver texto completo transcrito
                </summary>
                <pre style={{
                  marginTop: 10, fontSize: 11, color: '#475569',
                  whiteSpace: 'pre-wrap', lineHeight: 1.6,
                  fontFamily: 'inherit', background: '#f8fafc',
                  padding: 10, borderRadius: 6, maxHeight: 200, overflowY: 'auto'
                }}>
                  {transcription.texto_completo}
                </pre>
              </details>
            )}
          </div>
        </div>
      )}

      {/* ── PASO 3: Listo ── */}
      {step === STEPS.DONE && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px', maxWidth: 480, margin: '0 auto' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
          <h2 style={{ fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>¡Anotaciones guardadas!</h2>
          <p style={{ color: '#64748b', marginBottom: 28 }}>
            Las anotaciones fueron registradas exitosamente en la hoja de vida del alumno.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              style={{ background: primary }}
              onClick={resetAll}
            >
              📷 Transcribir otra foto
            </button>
            {selectedStudent && (
              <a
                href={`/students/${selectedStudent}/life`}
                className="btn btn-secondary"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
              >
                👤 Ver hoja de vida
              </a>
            )}
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
