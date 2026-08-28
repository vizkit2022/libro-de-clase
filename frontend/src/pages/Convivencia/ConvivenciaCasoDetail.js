import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const STEP_STATUS = {
  pending:    { label: 'Pendiente',    bg: '#f1f5f9', color: '#94a3b8', icon: '○' },
  in_progress:{ label: 'En proceso',  bg: '#eff6ff', color: '#2563eb', icon: '◐' },
  completed:  { label: 'Completado',  bg: '#f0fdf4', color: '#16a34a', icon: '●' },
};

const CRITICALITY = {
  alta:  { label: 'Alta',  color: '#dc2626', bg: '#fef2f2' },
  media: { label: 'Media', color: '#d97706', bg: '#fef3c7' },
  baja:  { label: 'Baja',  color: '#64748b', bg: '#f1f5f9' },
};

export default function ConvivenciaCasoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { school, user } = useAuth();
  const primary = school?.primary_color || '#2563EB';

  const [caso, setCaso] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingStep, setEditingStep] = useState(null);
  const [stepNotes, setStepNotes] = useState('');
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchCase = useCallback(() => {
    axios.get(`/api/convivencia/cases/${id}`)
      .then(r => setCaso(r.data))
      .catch(() => navigate('/convivencia/casos'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  useEffect(() => { fetchCase(); }, [fetchCase]);

  const handleStepUpdate = async (step, newStatus) => {
    try {
      await axios.put(`/api/convivencia/cases/${id}/steps/${step.id}`, {
        status: newStatus,
        notes: editingStep === step.id ? stepNotes : step.notes,
      });
      setEditingStep(null);
      showToast('Paso actualizado');
      fetchCase();
    } catch { showToast('Error al actualizar', 'error'); }
  };

  const handleSaveNotes = async (step) => {
    await handleStepUpdate(step, step.status);
  };

  const toggleStatus = (step) => {
    const next = step.status === 'pending' ? 'in_progress'
               : step.status === 'in_progress' ? 'completed'
               : 'pending';
    handleStepUpdate(step, next);
  };

  const handleCloseCase = async () => {
    if (!window.confirm('¿Marcar este caso como cerrado?')) return;
    await axios.put(`/api/convivencia/cases/${id}`, { status: 'cerrado' });
    showToast('Caso cerrado');
    fetchCase();
  };

  if (loading) return <div className="loading-container"><div className="spinner" /></div>;
  if (!caso) return null;

  const crit = CRITICALITY[caso.criticality] || CRITICALITY.baja;
  const stepsCompleted = caso.steps.filter(s => s.status === 'completed').length;
  const pct = caso.steps.length ? (stepsCompleted / caso.steps.length) * 100 : 0;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/convivencia/casos')} style={{
          padding: '8px 14px', background: '#f1f5f9', border: 'none',
          borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#475569', fontWeight: 600
        }}>← Volver</button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 20, color: primary }}>
              #{String(caso.case_number).padStart(2, '0')}
            </span>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>
              {caso.title}
            </h1>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
              background: caso.status === 'cerrado' ? '#d1fae5' : '#fef3c7',
              color: caso.status === 'cerrado' ? '#065f46' : '#92400e' }}>
              {caso.status === 'cerrado' ? '✅ Cerrado' : '🔓 Abierto'}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
              background: crit.bg, color: crit.color }}>
              {crit.label} criticidad
            </span>
          </div>
          <p style={{ fontSize: 13, color: '#64748b', margin: '6px 0 0' }}>
            {caso.date ? new Date(caso.date + 'T00:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
            {caso.procedure && ` · ${caso.procedure}`}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Link to={`/convivencia/casos/${id}/editar`} style={{
            padding: '8px 16px', background: `${primary}15`, color: primary,
            borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none'
          }}>✏️ Editar</Link>
          {caso.status === 'abierto' && (
            <button onClick={handleCloseCase} style={{
              padding: '8px 16px', background: '#d1fae5', color: '#065f46',
              border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer'
            }}>✅ Cerrar caso</button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 20 }}>

        {/* Panel izquierdo: info del caso */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Datos principales */}
          <div className="card">
            <h3 style={{ fontWeight: 700, fontSize: 13, color: '#94a3b8', textTransform: 'uppercase',
              letterSpacing: '0.06em', margin: '0 0 14px' }}>Información</h3>
            {[
              ['Tipificación', caso.typification],
              ['Alumno', caso.student ? `${caso.student.first_name} ${caso.student.last_name}` : null],
              ['Curso', caso.course_name],
              ['Profesional', caso.professional ? `${caso.professional.first_name} ${caso.professional.last_name}` : null],
            ].map(([label, val]) => val ? (
              <div key={label} style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 12, color: '#94a3b8', minWidth: 90, paddingTop: 2 }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{val}</span>
              </div>
            ) : null)}
          </div>

          {/* Motivo */}
          {caso.motive && (
            <div className="card">
              <h3 style={{ fontWeight: 700, fontSize: 13, color: '#94a3b8', textTransform: 'uppercase',
                letterSpacing: '0.06em', margin: '0 0 10px' }}>Motivo</h3>
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0 }}>{caso.motive}</p>
            </div>
          )}

          {/* Acuerdos */}
          {caso.agreements && (
            <div className="card" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <h3 style={{ fontWeight: 700, fontSize: 13, color: '#15803d', textTransform: 'uppercase',
                letterSpacing: '0.06em', margin: '0 0 10px' }}>Acuerdos y compromisos</h3>
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0 }}>{caso.agreements}</p>
            </div>
          )}
        </div>

        {/* Panel derecho: protocolo de pasos */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontWeight: 700, fontSize: 13, color: '#94a3b8', textTransform: 'uppercase',
              letterSpacing: '0.06em', margin: 0 }}>
              Protocolo de seguimiento
            </h3>
            <span style={{ fontSize: 12, fontWeight: 700, color: pct === 100 ? '#16a34a' : primary }}>
              {stepsCompleted}/{caso.steps.length} pasos
            </span>
          </div>

          {/* Barra de progreso */}
          <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, marginBottom: 20, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%',
              background: pct === 100 ? '#10b981' : primary,
              borderRadius: 3, transition: 'width 0.4s' }} />
          </div>

          {/* Pasos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {caso.steps.map((step) => {
              const ss = STEP_STATUS[step.status] || STEP_STATUS.pending;
              const isEditing = editingStep === step.id;
              return (
                <div key={step.id} style={{
                  borderRadius: 10, border: `1px solid ${ss.bg === '#f1f5f9' ? '#e2e8f0' : ss.color + '30'}`,
                  background: ss.bg, overflow: 'hidden'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                    {/* Botón de estado */}
                    <button onClick={() => toggleStatus(step)} title="Cambiar estado"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        fontSize: 20, color: ss.color, lineHeight: 1, flexShrink: 0 }}>
                      {ss.icon}
                    </button>

                    {/* Nombre y estado */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', margin: 0 }}>
                        {step.step_number}. {step.name}
                      </p>
                      <p style={{ fontSize: 11, color: ss.color, margin: '2px 0 0', fontWeight: 600 }}>
                        {ss.label}
                        {step.completed_at && (
                          <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>
                            · {new Date(step.completed_at).toLocaleDateString('es-CL')}
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Botón notas */}
                    <button onClick={() => {
                      if (isEditing) { setEditingStep(null); }
                      else { setEditingStep(step.id); setStepNotes(step.notes || ''); }
                    }} style={{
                      fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0',
                      background: '#fff', color: '#64748b', cursor: 'pointer', fontWeight: 600, flexShrink: 0
                    }}>
                      {isEditing ? 'Cerrar' : step.notes ? '📝 Ver nota' : '+ Nota'}
                    </button>
                  </div>

                  {/* Editor de notas */}
                  {isEditing && (
                    <div style={{ padding: '0 16px 14px', borderTop: '1px solid #e2e8f0' }}>
                      <textarea
                        value={stepNotes}
                        onChange={e => setStepNotes(e.target.value)}
                        placeholder="Agrega notas sobre este paso..."
                        rows={3}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6,
                          border: '1px solid #e2e8f0', fontSize: 12, resize: 'vertical',
                          fontFamily: 'inherit', marginTop: 10, boxSizing: 'border-box' }}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button onClick={() => handleSaveNotes(step)} style={{
                          padding: '5px 14px', background: primary, color: '#fff',
                          border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer'
                        }}>Guardar nota</button>
                        <button onClick={() => handleStepUpdate(step, 'completed')} style={{
                          padding: '5px 14px', background: '#d1fae5', color: '#065f46',
                          border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer'
                        }}>✓ Marcar completado</button>
                      </div>
                    </div>
                  )}

                  {/* Notas guardadas */}
                  {!isEditing && step.notes && (
                    <div style={{ padding: '8px 16px 12px', borderTop: '1px solid #e2e8f0' }}>
                      <p style={{ fontSize: 12, color: '#475569', margin: 0, lineHeight: 1.5,
                        whiteSpace: 'pre-wrap' }}>{step.notes}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  );
}
