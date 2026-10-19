import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ETAPAS, etapaIdx, fmtDate, fmtDT } from './ConvivenciaPage';
import './ConvivenciaPage.css';

/*
 * Vista de SOLO LECTURA de casos de convivencia, pensada para el apoderado.
 * No hay ningún control de edición: solo muestra la información que el backend
 * ya filtró (casos vinculados a sus alumnos o a él como apoderado).
 */

const TIPIFICACION = {
  conflicto_cotidiano: 'Conflicto cotidiano',
  maltrato_escolar: 'Maltrato escolar',
  acoso_escolar: 'Acoso escolar (bullying)',
  ciberbullying: 'Ciberbullying',
  otro: 'Otro',
};

function Field({ label, value, full }) {
  const empty = value === null || value === undefined || value === '' || value === '___________';
  return (
    <div className={`ro-field ${full ? 'ro-full' : ''}`}>
      <label>{label}</label>
      <p className={empty ? 'empty' : ''}>{empty ? '—' : value}</p>
    </div>
  );
}

function Personas({ label, list }) {
  return (
    <div className="ro-field ro-full">
      <label>{label}</label>
      <p>
        {(list || []).filter(p => p?.nombre).length === 0 ? <span style={{ color: '#cbd5e1' }}>—</span> :
          (list || []).filter(p => p?.nombre).map((p, i) => (
            <span key={i} className={`ro-chip ${p.student_id ? 'linked' : ''}`}>
              {p.nombre}{p.curso ? ` · ${p.curso}` : ''}
            </span>
          ))}
      </p>
    </div>
  );
}

export function CasoReadOnlyDetail({ caso, onBack }) {
  const etapaActual = etapaIdx(caso.estado);
  const reached = (i) => i <= etapaActual;

  return (
    <div className="caso-detail cv-scope">
      <div className="caso-detail-header">
        {onBack && <button className="btn-back" onClick={onBack}>← Volver</button>}
        <div>
          <h2>{caso.numero_caso}</h2>
          <span className={`badge badge-${caso.estado}`}>{ETAPAS.find(e => e.key === caso.estado)?.label || caso.estado}</span>
        </div>
      </div>

      <div className="ro-banner">
        👁️ <span><strong>Modo apoderado · solo lectura.</strong> Esta es la información del seguimiento registrada por el colegio. Para consultas o descargos, contacta a Convivencia Escolar.</span>
      </div>

      {/* Stepper */}
      <div className="stepper">
        {ETAPAS.map((e, i) => (
          <div key={e.key} className={`step ${i <= etapaActual ? 'done' : ''} ${i === etapaActual ? 'active' : ''}`}>
            <div className="step-circle">{i < etapaActual ? '✓' : i + 1}</div>
            <div className="step-label">{e.label}</div>
            {i < ETAPAS.length - 1 && <div className="step-line" />}
          </div>
        ))}
      </div>

      {/* Anexo 1 */}
      <details className="ro-section" open>
        <summary><span className="tab-anexo">Anexo 1</span><span className="tab-label">Recepción</span></summary>
        <div className="ro-body">
          <div className="ro-grid">
            <Field label="Fecha de recepción" value={caso.fecha_recepcion ? fmtDT(caso.fecha_recepcion) : null} />
            <Field label="Recibido por" value={caso.quien_recibe} />
            <Field label="Tipificación preliminar" value={caso.tipificacion ? (TIPIFICACION[caso.tipificacion] || caso.tipificacion) + (caso.tipificacion === 'otro' && caso.tipificacion_otro ? `: ${caso.tipificacion_otro}` : '') : null} />
            <Personas label="Estudiante(s) afectado(s)" list={caso.afectados} />
            <Personas label="Estudiante(s) / persona involucrada" list={caso.involucrados} />
            <Field label="Descripción de los hechos" value={caso.descripcion_hechos} full />
            <Field label="Medidas inmediatas" value={(caso.medidas_inmediatas || []).join(' · ')} full />
          </div>
        </div>
      </details>

      {/* Anexo 2 */}
      {reached(1) && (
        <details className="ro-section" open={caso.estado === 'entrevista'}>
          <summary><span className="tab-anexo">Anexo 2</span><span className="tab-label">Entrevista apoderados</span></summary>
          <div className="ro-body">
            <div className="ro-grid">
              <Field label="Fecha" value={caso.entrevista_fecha ? fmtDate(caso.entrevista_fecha) : null} />
              <Field label="Horario" value={caso.entrevista_hora_inicio ? `${caso.entrevista_hora_inicio} – ${caso.entrevista_hora_termino || ''}` : null} />
              <Field label="Apoderado/a" value={caso.apoderado_nombre} />
              <Field label="Parentesco" value={caso.apoderado_parentesco} />
              <Field label="Entrevistador/a" value={caso.entrevistador ? `${caso.entrevistador}${caso.entrevistador_cargo ? ` (${caso.entrevistador_cargo})` : ''}` : null} />
              <Field label="Próximo monitoreo" value={caso.entrevista_proximo_monitoreo ? fmtDate(caso.entrevista_proximo_monitoreo) : null} />
              <Field label="Motivo de la citación" value={caso.motivo_citacion} full />
              <Field label="Declaración y descargos" value={caso.declaracion_descargos} full />
              <Field label="Compromiso de la familia / estudiante" value={caso.compromiso_familia} full />
              <Field label="Compromiso de Convivencia Escolar" value={caso.compromiso_convivencia} full />
            </div>
          </div>
        </details>
      )}

      {/* Anexo 3 */}
      {reached(2) && (
        <details className="ro-section" open={caso.estado === 'seguimiento'}>
          <summary><span className="tab-anexo">Anexo 3</span><span className="tab-label">Seguimiento individual</span></summary>
          <div className="ro-body">
            <div className="ro-grid">
              <Field label="Coordinador/a a cargo" value={caso.coordinador_cargo} />
              <Field label="Próximo monitoreo" value={caso.seguimiento_proximo_monitoreo ? fmtDate(caso.seguimiento_proximo_monitoreo) : null} />
            </div>
            <table className="bitacora-table">
              <thead><tr><th>Fecha</th><th>Tipo de acción</th><th>Observaciones y avances</th></tr></thead>
              <tbody>
                {(caso.bitacora || []).length === 0 && <tr><td colSpan={3} style={{ color: '#cbd5e1' }}>Sin registros aún</td></tr>}
                {(caso.bitacora || []).map(b => (
                  <tr key={b.id}><td>{fmtDate(b.fecha)}</td><td>{b.tipo_accion}</td><td>{b.observaciones}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="ro-grid" style={{ marginTop: 12 }}>
              <Field label="Observaciones con especialistas / externos" value={caso.observaciones_especialistas} full />
            </div>
          </div>
        </details>
      )}

      {/* Anexo 4 */}
      {reached(3) && (
        <details className="ro-section" open={caso.estado === 'intervencion_grupal'}>
          <summary><span className="tab-anexo">Anexo 4</span><span className="tab-label">Intervención grupal</span></summary>
          <div className="ro-body">
            <div className="ro-grid">
              <Field label="Fecha de ejecución" value={caso.intervencion_fecha ? fmtDate(caso.intervencion_fecha) : null} />
              <Field label="Curso intervenido" value={caso.intervencion_curso} />
              <Field label="Asignatura / espacio" value={caso.intervencion_asignatura} />
              <Field label="Profesional responsable" value={caso.intervencion_profesional ? `${caso.intervencion_profesional}${caso.intervencion_cargo ? ` (${caso.intervencion_cargo})` : ''}` : null} />
              <Field label="Objetivo de la sesión" value={caso.intervencion_objetivo} full />
              <Field label="Contenidos y actividades" value={caso.intervencion_contenidos} full />
              <Field label="Registrado en libro de clases" value={caso.intervencion_registrado_libro ? `Sí${caso.intervencion_fecha_libro ? ` · ${fmtDate(caso.intervencion_fecha_libro)}` : ''}` : 'No'} />
              <Field label="Observaciones del clima de aula" value={caso.intervencion_observaciones} full />
            </div>
          </div>
        </details>
      )}

      {/* Anexo 5 */}
      {reached(4) && (
        <details className="ro-section" open={caso.estado === 'apelacion'}>
          <summary><span className="tab-anexo">Anexo 5</span><span className="tab-label">Apelación</span></summary>
          <div className="ro-body">
            <div className="ro-grid">
              <Field label="Fecha de presentación" value={caso.apelacion_fecha ? fmtDate(caso.apelacion_fecha) : null} />
              <Field label="Apoderado/a recurrente" value={caso.apelacion_apoderado} />
              <Field label="Parentesco" value={caso.apelacion_parentesco} />
              <Field label="Medida impugnada" value={caso.apelacion_medida} full />
              <Field label="Fundamentos" value={caso.apelacion_fundamentos} full />
              <Field label="Documentos adjuntos" value={(caso.apelacion_documentos || []).join(' · ')} full />
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * Lista de casos de solo lectura. Si se pasa studentId, filtra por ese alumno;
 * si no, muestra todos los casos visibles para el usuario actual (apoderado).
 */
export default function CasosReadOnlyList({ studentId, compact = false, emptyText }) {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    setLoading(true);
    const url = studentId ? `/api/convivencia/?student_id=${studentId}` : '/api/convivencia/';
    axios.get(url)
      .then(r => setCases(r.data))
      .catch(() => setCases([]))
      .finally(() => setLoading(false));
  }, [studentId]);

  if (selected) return <CasoReadOnlyDetail caso={selected} onBack={() => setSelected(null)} />;

  if (loading) return <div className="cv-scope"><div className="loading">Cargando...</div></div>;

  return (
    <div className="cv-scope">
      {cases.length === 0 ? (
        <div className="empty-state" style={{ padding: compact ? 16 : 40 }}>
          {emptyText || 'No hay casos de convivencia asociados.'}
        </div>
      ) : (
        <div className="cases-list" style={compact ? { gridTemplateColumns: '1fr', gap: 10 } : {}}>
          {cases.map(c => (
            <div key={c.id} className="case-card" onClick={() => setSelected(c)} title="Ver seguimiento (solo lectura)">
              <div className="case-card-header">
                <span className="case-numero">{c.numero_caso}</span>
                <span className={`badge badge-${c.estado}`}>{ETAPAS.find(e => e.key === c.estado)?.label}</span>
              </div>
              <div className="case-afectados">
                {(c.afectados || []).map(a => a.nombre).filter(Boolean).join(', ') || '—'}
              </div>
              <div className="case-meta">
                <span>{c.tipificacion ? (TIPIFICACION[c.tipificacion] || c.tipificacion) : '—'}</span>
                <span>{c.fecha_recepcion ? new Date(c.fecha_recepcion).toLocaleDateString('es-CL') : '—'}</span>
              </div>
              <div className="case-progress">
                {ETAPAS.slice(0, -1).map((e, i) => (
                  <div key={e.key} className={`progress-dot ${i <= etapaIdx(c.estado) ? 'done' : ''}`} title={e.label} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
