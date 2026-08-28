import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// ── Constantes ────────────────────────────────────────────────────────

const ETAPAS = [
  { key: 'recepcion',           label: 'Recepción',            anexo: 1 },
  { key: 'entrevista',          label: 'Entrevista Apoderado', anexo: 2 },
  { key: 'seguimiento',         label: 'Seguimiento',          anexo: 3 },
  { key: 'intervencion_grupal', label: 'Intervención Grupal',  anexo: 4 },
  { key: 'apelacion',           label: 'Apelación',            anexo: 5 },
  { key: 'cerrado',             label: 'Cerrado',              anexo: null },
];

const TIPIFICACIONES = [
  'Falta Leve','Falta Grave','Falta Gravísima',
  'Desregulación Emocional','Víctima','No corresponde','Otro',
];

const MEDIDAS_INMEDIATAS = [
  'Entrevista con el/la estudiante',
  'Notificación al apoderado',
  'Derivación a Inspectoría',
  'Derivación a Orientación/Psicólogo',
  'Derivación a autoridades externas',
  'Separación temporal del aula',
  'Atención primaria de urgencia',
  'Otras medidas de contención',
];

const TIPOS_ACCION = [
  'Entrevista estudiante', 'Entrevista apoderado', 'Derivación psicológica',
  'Seguimiento escolar', 'Contacto red de apoyo', 'Observación en aula',
  'Reunión equipo directivo', 'Otro',
];

const DOCUMENTOS_APELACION = [
  'Carta de apelación del apoderado',
  'Copia del reglamento interno',
  'Informe del profesional a cargo',
  'Actas de entrevistas previas',
  'Otros antecedentes escritos',
];

// ── Helpers ──────────────────────────────────────────────────────────

const fmtDate = (s) => s ? new Date(s + 'T12:00:00').toLocaleDateString('es-CL', { day:'2-digit', month:'2-digit', year:'numeric' }) : '';

// ── Print ─────────────────────────────────────────────────────────────

function printAnexo(html, title) {
  const w = window.open('', '_blank', 'width=900,height=700');
  w.document.write(`<!DOCTYPE html><html><head>
    <meta charset="utf-8">
    <title>${title}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; font-size: 11pt; color: #000; padding: 20px; }
      h1 { font-size: 13pt; text-align: center; margin-bottom: 4px; }
      h2 { font-size: 11pt; text-align: center; color: #555; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
      td, th { border: 1px solid #999; padding: 5px 8px; vertical-align: top; }
      th { background: #e8e8e8; font-weight: 700; font-size: 10pt; text-align: left; width: 30%; }
      .section { font-size: 10pt; font-weight: 700; text-transform: uppercase;
                 background: #dce6f5; padding: 5px 8px; border: 1px solid #999;
                 margin-bottom: 0; letter-spacing: 0.04em; }
      .firma-row td { height: 50px; }
      @media print { body { padding: 10px; } }
    </style>
  </head><body>${html}<script>window.onload=()=>window.print();<\/script></body></html>`);
  w.document.close();
}

function generateAnexo1(caso) {
  const d = caso.anx1_data || {};
  const afectados = d.afectados || [];
  const involucrados = d.involucrados || [];
  const medidas = d.medidas_inmediatas || [];

  return `
    <h1>COLEGIO — CONVIVENCIA ESCOLAR</h1>
    <h2>ANEXO 1: RECEPCIÓN DE CASO N° ${String(caso.case_number).padStart(3,'0')}-${caso.year}</h2>
    <p class="section">I. ANTECEDENTES DE LA RECEPCIÓN</p>
    <table>
      <tr><th>Fecha de recepción</th><td>${fmtDate(d.fecha_recepcion || caso.date)}</td></tr>
      <tr><th>Recibido por</th><td>${d.quien_recibe || ''}</td></tr>
    </table>
    <p class="section">II. PERSONA(S) AFECTADA(S)</p>
    <table>
      <tr><th>Nombre</th><th>RUT</th><th>Curso</th><th>Rol</th></tr>
      ${afectados.map(a => `<tr><td>${a.nombre||''}</td><td>${a.rut||''}</td><td>${a.curso||''}</td><td>${a.rol||''}</td></tr>`).join('') || '<tr><td colspan="4"> </td></tr>'}
    </table>
    <p class="section">III. PERSONA(S) INVOLUCRADA(S)</p>
    <table>
      <tr><th>Nombre</th><th>RUT</th><th>Curso</th><th>Rol</th></tr>
      ${involucrados.map(a => `<tr><td>${a.nombre||''}</td><td>${a.rut||''}</td><td>${a.curso||''}</td><td>${a.rol||''}</td></tr>`).join('') || '<tr><td colspan="4"> </td></tr>'}
    </table>
    <p class="section">IV. DESCRIPCIÓN DE LOS HECHOS</p>
    <table><tr><td style="min-height:80px;">${(d.descripcion_hechos || '').replace(/\n/g,'<br>')}</td></tr></table>
    <p class="section">V. TIPIFICACIÓN</p>
    <table><tr><th>Tipificación</th><td>${d.tipificacion || caso.typification || ''}${d.tipificacion_otro ? ' — ' + d.tipificacion_otro : ''}</td></tr></table>
    <p class="section">VI. MEDIDAS INMEDIATAS ADOPTADAS</p>
    <table><tr><td>${medidas.length ? medidas.map(m => `☑ ${m}`).join('<br>') : 'Ninguna'}</td></tr></table>
    <br><table class="firma-row">
      <tr>
        <td style="text-align:center;"><br>_________________________<br>Firma y Timbre</td>
        <td style="text-align:center;"><br>_________________________<br>Cargo</td>
      </tr>
    </table>`;
}

function generateAnexo2(caso) {
  const d = caso.anx2_data || {};
  return `
    <h1>COLEGIO — CONVIVENCIA ESCOLAR</h1>
    <h2>ANEXO 2: ENTREVISTA CON APODERADO/A — CASO N° ${String(caso.case_number).padStart(3,'0')}-${caso.year}</h2>
    <p class="section">I. DATOS DE LA ENTREVISTA</p>
    <table>
      <tr><th>Fecha</th><td>${fmtDate(d.fecha)}</td><th>Hora inicio</th><td>${d.hora_inicio||''}</td><th>Hora término</th><td>${d.hora_termino||''}</td></tr>
    </table>
    <p class="section">II. DATOS DEL APODERADO/A</p>
    <table>
      <tr><th>Nombre</th><td>${d.apoderado_nombre||''}</td></tr>
      <tr><th>RUT</th><td>${d.apoderado_rut||''}</td><th>Parentesco</th><td>${d.apoderado_parentesco||''}</td><th>Teléfono</th><td>${d.apoderado_telefono||''}</td></tr>
    </table>
    <p class="section">III. ENTREVISTADOR/A</p>
    <table>
      <tr><th>Nombre</th><td>${d.entrevistador||''}</td><th>Cargo</th><td>${d.entrevistador_cargo||''}</td></tr>
    </table>
    <p class="section">IV. MOTIVO DE CITACIÓN</p>
    <table><tr><td style="min-height:60px;">${(d.motivo_citacion||'').replace(/\n/g,'<br>')}</td></tr></table>
    <p class="section">V. DECLARACIÓN Y DESCARGOS DEL APODERADO/A</p>
    <table><tr><td style="min-height:80px;">${(d.declaracion_descargos||'').replace(/\n/g,'<br>')}</td></tr></table>
    <p class="section">VI. COMPROMISOS</p>
    <table>
      <tr><th>Familia</th><td>${(d.compromiso_familia||'').replace(/\n/g,'<br>')}</td></tr>
      <tr><th>Convivencia Escolar</th><td>${(d.compromiso_convivencia||'').replace(/\n/g,'<br>')}</td></tr>
    </table>
    <p class="section">VII. PRÓXIMO MONITOREO</p>
    <table><tr><th>Fecha</th><td>${fmtDate(d.proximo_monitoreo)}</td></tr></table>
    <br><table class="firma-row">
      <tr>
        <td style="text-align:center;"><br>_________________________<br>Firma Apoderado/a</td>
        <td style="text-align:center;"><br>_________________________<br>Firma Entrevistador/a</td>
      </tr>
    </table>`;
}

function generateAnexo3(caso) {
  const d = caso.anx3_data || {};
  const bitacora = caso.bitacora || [];
  return `
    <h1>COLEGIO — CONVIVENCIA ESCOLAR</h1>
    <h2>ANEXO 3: SEGUIMIENTO INDIVIDUAL — CASO N° ${String(caso.case_number).padStart(3,'0')}-${caso.year}</h2>
    <p class="section">I. DATOS DEL CASO</p>
    <table>
      <tr><th>Alumno/a</th><td>${caso.student ? `${caso.student.first_name} ${caso.student.last_name}` : ''}</td></tr>
      <tr><th>Coordinador/a responsable</th><td>${d.coordinador_cargo||''}</td></tr>
    </table>
    <p class="section">II. OBSERVACIONES DE ESPECIALISTAS</p>
    <table><tr><td style="min-height:60px;">${(d.observaciones_especialistas||'').replace(/\n/g,'<br>')}</td></tr></table>
    <p class="section">III. BITÁCORA DE SEGUIMIENTO</p>
    <table>
      <tr><th style="width:15%">Fecha</th><th style="width:30%">Tipo de acción</th><th>Observaciones</th></tr>
      ${bitacora.length ? bitacora.map(b => `<tr><td>${fmtDate(b.fecha)}</td><td>${b.tipo_accion||''}</td><td>${(b.observaciones||'').replace(/\n/g,'<br>')}</td></tr>`).join('') : '<tr><td colspan="3"> </td></tr>'}
    </table>
    <p class="section">IV. PRÓXIMO MONITOREO</p>
    <table><tr><th>Fecha</th><td>${fmtDate(d.proximo_monitoreo)}</td></tr></table>
    <br><table class="firma-row">
      <tr><td style="text-align:center;"><br>_________________________<br>Firma y Cargo</td></tr>
    </table>`;
}

function generateAnexo4(caso) {
  const d = caso.anx4_data || {};
  return `
    <h1>COLEGIO — CONVIVENCIA ESCOLAR</h1>
    <h2>ANEXO 4: INTERVENCIÓN GRUPAL — CASO N° ${String(caso.case_number).padStart(3,'0')}-${caso.year}</h2>
    <p class="section">I. DATOS DE LA INTERVENCIÓN</p>
    <table>
      <tr><th>Fecha</th><td>${fmtDate(d.fecha)}</td><th>Curso</th><td>${d.curso||''}</td><th>Asignatura</th><td>${d.asignatura||''}</td></tr>
      <tr><th>Profesional</th><td>${d.profesional||''}</td><th>Cargo</th><td colspan="3">${d.cargo||''}</td></tr>
    </table>
    <p class="section">II. OBJETIVO DE LA SESIÓN</p>
    <table><tr><td style="min-height:60px;">${(d.objetivo||'').replace(/\n/g,'<br>')}</td></tr></table>
    <p class="section">III. CONTENIDOS Y ACTIVIDADES</p>
    <table><tr><td style="min-height:80px;">${(d.contenidos||'').replace(/\n/g,'<br>')}</td></tr></table>
    <p class="section">IV. REGISTRO EN LIBRO DE CLASES</p>
    <table>
      <tr><th>¿Registrado en libro?</th><td>${d.registrado_libro ? 'Sí' : 'No'}</td><th>Fecha libro</th><td>${fmtDate(d.fecha_libro)}</td></tr>
    </table>
    <p class="section">V. OBSERVACIONES</p>
    <table><tr><td style="min-height:60px;">${(d.observaciones||'').replace(/\n/g,'<br>')}</td></tr></table>
    <br><table class="firma-row">
      <tr>
        <td style="text-align:center;"><br>_________________________<br>Firma Profesional</td>
        <td style="text-align:center;"><br>_________________________<br>Firma Dirección</td>
      </tr>
    </table>`;
}

function generateAnexo5(caso) {
  const d = caso.anx5_data || {};
  const docs = d.documentos || [];
  return `
    <h1>COLEGIO — CONVIVENCIA ESCOLAR</h1>
    <h2>ANEXO 5: APELACIÓN — CASO N° ${String(caso.case_number).padStart(3,'0')}-${caso.year}</h2>
    <p class="section">I. DATOS DE LA APELACIÓN</p>
    <table><tr><th>Fecha</th><td>${fmtDate(d.fecha)}</td></tr></table>
    <p class="section">II. DATOS DEL APODERADO/A APELANTE</p>
    <table>
      <tr><th>Nombre</th><td>${d.apoderado||''}</td></tr>
      <tr><th>RUT</th><td>${d.rut||''}</td><th>Parentesco</th><td>${d.parentesco||''}</td></tr>
    </table>
    <p class="section">III. MEDIDA DISCIPLINARIA OBJETO DE APELACIÓN</p>
    <table><tr><td style="min-height:60px;">${(d.medida||'').replace(/\n/g,'<br>')}</td></tr></table>
    <p class="section">IV. FUNDAMENTOS DE LA APELACIÓN</p>
    <table><tr><td style="min-height:80px;">${(d.fundamentos||'').replace(/\n/g,'<br>')}</td></tr></table>
    <p class="section">V. DOCUMENTOS ADJUNTOS</p>
    <table><tr><td>${docs.length ? docs.map(doc => `☑ ${doc}`).join('<br>') : 'Ninguno'}</td></tr></table>
    <br><table class="firma-row">
      <tr>
        <td style="text-align:center;"><br>_________________________<br>Firma Apoderado/a</td>
        <td style="text-align:center;"><br>_________________________<br>Firma Dirección</td>
      </tr>
    </table>`;
}

// ── Sub-componentes de formulario ─────────────────────────────────────

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inp = {
  width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0',
  borderRadius: 6, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit',
};

const ta = { ...inp, resize: 'vertical' };

function Anx1Form({ data, onChange }) {
  const d = data || {};
  const set = (k, v) => onChange({ ...d, [k]: v });

  const setAfectado = (i, k, v) => {
    const arr = [...(d.afectados || [{ nombre:'',rut:'',curso:'',rol:''}])];
    arr[i] = { ...arr[i], [k]: v };
    set('afectados', arr);
  };
  const addAfectado = () => set('afectados', [...(d.afectados || []), { nombre:'',rut:'',curso:'',rol:'' }]);
  const removeAfectado = (i) => set('afectados', (d.afectados || []).filter((_,j) => j !== i));

  const setInvolucrado = (i, k, v) => {
    const arr = [...(d.involucrados || [{ nombre:'',rut:'',curso:'',rol:''}])];
    arr[i] = { ...arr[i], [k]: v };
    set('involucrados', arr);
  };
  const addInvolucrado = () => set('involucrados', [...(d.involucrados || []), { nombre:'',rut:'',curso:'',rol:'' }]);
  const removeInvolucrado = (i) => set('involucrados', (d.involucrados || []).filter((_,j) => j !== i));

  const toggleMedida = (m) => {
    const arr = d.medidas_inmediatas || [];
    set('medidas_inmediatas', arr.includes(m) ? arr.filter(x => x !== m) : [...arr, m]);
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <Field label="Fecha de recepción">
          <input type="date" style={inp} value={d.fecha_recepcion||''} onChange={e => set('fecha_recepcion', e.target.value)} />
        </Field>
        <Field label="Recibido por">
          <input type="text" style={inp} value={d.quien_recibe||''} onChange={e => set('quien_recibe', e.target.value)} />
        </Field>
      </div>

      <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', margin: '14px 0 6px', borderLeft: '3px solid #2563eb', paddingLeft: 8 }}>
        Persona(s) Afectada(s)
      </p>
      {(d.afectados || [{ nombre:'',rut:'',curso:'',rol:'' }]).map((a, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
          <input placeholder="Nombre" style={{ ...inp, flex: 2 }} value={a.nombre||''} onChange={e => setAfectado(i,'nombre',e.target.value)} />
          <input placeholder="RUT" style={{ ...inp, flex: 1 }} value={a.rut||''} onChange={e => setAfectado(i,'rut',e.target.value)} />
          <input placeholder="Curso" style={{ ...inp, flex: 1 }} value={a.curso||''} onChange={e => setAfectado(i,'curso',e.target.value)} />
          <input placeholder="Rol" style={{ ...inp, flex: 1 }} value={a.rol||''} onChange={e => setAfectado(i,'rol',e.target.value)} />
          {i > 0 && <button onClick={() => removeAfectado(i)} style={{ background: '#fee2e2', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', color: '#dc2626', fontSize: 12 }}>✕</button>}
        </div>
      ))}
      <button onClick={addAfectado} style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', marginBottom: 14 }}>+ Agregar afectado</button>

      <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', margin: '0 0 6px', borderLeft: '3px solid #2563eb', paddingLeft: 8 }}>
        Persona(s) Involucrada(s)
      </p>
      {(d.involucrados || [{ nombre:'',rut:'',curso:'',rol:'' }]).map((a, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
          <input placeholder="Nombre" style={{ ...inp, flex: 2 }} value={a.nombre||''} onChange={e => setInvolucrado(i,'nombre',e.target.value)} />
          <input placeholder="RUT" style={{ ...inp, flex: 1 }} value={a.rut||''} onChange={e => setInvolucrado(i,'rut',e.target.value)} />
          <input placeholder="Curso" style={{ ...inp, flex: 1 }} value={a.curso||''} onChange={e => setInvolucrado(i,'curso',e.target.value)} />
          <input placeholder="Rol" style={{ ...inp, flex: 1 }} value={a.rol||''} onChange={e => setInvolucrado(i,'rol',e.target.value)} />
          {i > 0 && <button onClick={() => removeInvolucrado(i)} style={{ background: '#fee2e2', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', color: '#dc2626', fontSize: 12 }}>✕</button>}
        </div>
      ))}
      <button onClick={addInvolucrado} style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', marginBottom: 14 }}>+ Agregar involucrado</button>

      <Field label="Descripción de los hechos">
        <textarea rows={4} style={ta} value={d.descripcion_hechos||''} onChange={e => set('descripcion_hechos', e.target.value)} />
      </Field>

      <Field label="Tipificación">
        <select style={inp} value={d.tipificacion||''} onChange={e => set('tipificacion', e.target.value)}>
          <option value="">Seleccionar...</option>
          {TIPIFICACIONES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {d.tipificacion === 'Otro' && (
          <input type="text" placeholder="Especifique..." style={{ ...inp, marginTop: 6 }} value={d.tipificacion_otro||''} onChange={e => set('tipificacion_otro', e.target.value)} />
        )}
      </Field>

      <Field label="Medidas inmediatas adoptadas">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {MEDIDAS_INMEDIATAS.map(m => (
            <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={(d.medidas_inmediatas||[]).includes(m)} onChange={() => toggleMedida(m)} />
              {m}
            </label>
          ))}
        </div>
      </Field>
    </div>
  );
}

function Anx2Form({ data, onChange }) {
  const d = data || {};
  const set = (k, v) => onChange({ ...d, [k]: v });
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        <Field label="Fecha"><input type="date" style={inp} value={d.fecha||''} onChange={e => set('fecha', e.target.value)} /></Field>
        <Field label="Hora inicio"><input type="time" style={inp} value={d.hora_inicio||''} onChange={e => set('hora_inicio', e.target.value)} /></Field>
        <Field label="Hora término"><input type="time" style={inp} value={d.hora_termino||''} onChange={e => set('hora_termino', e.target.value)} /></Field>
      </div>

      <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', margin: '4px 0 8px', borderLeft: '3px solid #2563eb', paddingLeft: 8 }}>Apoderado/a</p>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
        <Field label="Nombre"><input type="text" style={inp} value={d.apoderado_nombre||''} onChange={e => set('apoderado_nombre', e.target.value)} /></Field>
        <Field label="RUT"><input type="text" style={inp} value={d.apoderado_rut||''} onChange={e => set('apoderado_rut', e.target.value)} /></Field>
        <Field label="Parentesco"><input type="text" style={inp} value={d.apoderado_parentesco||''} onChange={e => set('apoderado_parentesco', e.target.value)} /></Field>
        <Field label="Teléfono"><input type="text" style={inp} value={d.apoderado_telefono||''} onChange={e => set('apoderado_telefono', e.target.value)} /></Field>
      </div>

      <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', margin: '4px 0 8px', borderLeft: '3px solid #2563eb', paddingLeft: 8 }}>Entrevistador/a</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <Field label="Nombre"><input type="text" style={inp} value={d.entrevistador||''} onChange={e => set('entrevistador', e.target.value)} /></Field>
        <Field label="Cargo"><input type="text" style={inp} value={d.entrevistador_cargo||''} onChange={e => set('entrevistador_cargo', e.target.value)} /></Field>
      </div>

      <Field label="Motivo de citación"><textarea rows={3} style={ta} value={d.motivo_citacion||''} onChange={e => set('motivo_citacion', e.target.value)} /></Field>
      <Field label="Declaración y descargos del apoderado/a"><textarea rows={4} style={ta} value={d.declaracion_descargos||''} onChange={e => set('declaracion_descargos', e.target.value)} /></Field>
      <Field label="Compromiso de la familia"><textarea rows={3} style={ta} value={d.compromiso_familia||''} onChange={e => set('compromiso_familia', e.target.value)} /></Field>
      <Field label="Compromisos de Convivencia Escolar"><textarea rows={3} style={ta} value={d.compromiso_convivencia||''} onChange={e => set('compromiso_convivencia', e.target.value)} /></Field>
      <Field label="Próximo monitoreo (fecha)"><input type="date" style={inp} value={d.proximo_monitoreo||''} onChange={e => set('proximo_monitoreo', e.target.value)} /></Field>
    </div>
  );
}

function Anx3Form({ data, onChange, caseId, bitacora, onBitacoraChange }) {
  const d = data || {};
  const set = (k, v) => onChange({ ...d, [k]: v });
  const [newEntry, setNewEntry] = useState({ fecha: '', tipo_accion: '', observaciones: '' });
  const [saving, setSaving] = useState(false);

  const addEntry = async () => {
    if (!newEntry.fecha || !newEntry.tipo_accion) return;
    setSaving(true);
    try {
      const r = await axios.post(`/api/convivencia/cases/${caseId}/bitacora`, newEntry);
      onBitacoraChange([...bitacora, r.data]);
      setNewEntry({ fecha: '', tipo_accion: '', observaciones: '' });
    } catch {}
    setSaving(false);
  };

  const deleteEntry = async (id) => {
    try {
      await axios.delete(`/api/convivencia/cases/${caseId}/bitacora/${id}`);
      onBitacoraChange(bitacora.filter(b => b.id !== id));
    } catch {}
  };

  return (
    <div>
      <Field label="Coordinador/a responsable (nombre y cargo)">
        <input type="text" style={inp} value={d.coordinador_cargo||''} onChange={e => set('coordinador_cargo', e.target.value)} />
      </Field>
      <Field label="Observaciones de especialistas">
        <textarea rows={4} style={ta} value={d.observaciones_especialistas||''} onChange={e => set('observaciones_especialistas', e.target.value)} />
      </Field>
      <Field label="Próximo monitoreo (fecha)">
        <input type="date" style={inp} value={d.proximo_monitoreo||''} onChange={e => set('proximo_monitoreo', e.target.value)} />
      </Field>

      <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', margin: '16px 0 8px', borderLeft: '3px solid #2563eb', paddingLeft: 8 }}>Bitácora de Seguimiento</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 10 }}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            <th style={{ padding: '6px 8px', textAlign: 'left', border: '1px solid #e2e8f0', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', width: 110 }}>Fecha</th>
            <th style={{ padding: '6px 8px', textAlign: 'left', border: '1px solid #e2e8f0', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', width: 160 }}>Tipo de acción</th>
            <th style={{ padding: '6px 8px', textAlign: 'left', border: '1px solid #e2e8f0', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>Observaciones</th>
            <th style={{ width: 36, border: '1px solid #e2e8f0' }}></th>
          </tr>
        </thead>
        <tbody>
          {bitacora.map(b => (
            <tr key={b.id}>
              <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0' }}>{fmtDate(b.fecha)}</td>
              <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0' }}>{b.tipo_accion}</td>
              <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0', whiteSpace: 'pre-wrap' }}>{b.observaciones}</td>
              <td style={{ padding: '4px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <button onClick={() => deleteEntry(b.id)} style={{ background: '#fee2e2', border: 'none', borderRadius: 4, cursor: 'pointer', color: '#dc2626', fontSize: 11, padding: '2px 6px' }}>✕</button>
              </td>
            </tr>
          ))}
          {/* Fila nueva entrada */}
          <tr style={{ background: '#f8fafc' }}>
            <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0' }}>
              <input type="date" style={{ ...inp, fontSize: 12, padding: '4px 6px' }} value={newEntry.fecha} onChange={e => setNewEntry(p => ({ ...p, fecha: e.target.value }))} />
            </td>
            <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0' }}>
              <select style={{ ...inp, fontSize: 12, padding: '4px 6px' }} value={newEntry.tipo_accion} onChange={e => setNewEntry(p => ({ ...p, tipo_accion: e.target.value }))}>
                <option value="">Seleccionar...</option>
                {TIPOS_ACCION.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </td>
            <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0' }}>
              <textarea rows={2} style={{ ...ta, fontSize: 12, padding: '4px 6px' }} placeholder="Observaciones..." value={newEntry.observaciones} onChange={e => setNewEntry(p => ({ ...p, observaciones: e.target.value }))} />
            </td>
            <td style={{ padding: '4px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
              <button onClick={addEntry} disabled={saving} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '4px 8px' }}>
                {saving ? '...' : '+ Add'}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Anx4Form({ data, onChange }) {
  const d = data || {};
  const set = (k, v) => onChange({ ...d, [k]: v });
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        <Field label="Fecha"><input type="date" style={inp} value={d.fecha||''} onChange={e => set('fecha', e.target.value)} /></Field>
        <Field label="Curso"><input type="text" style={inp} value={d.curso||''} onChange={e => set('curso', e.target.value)} /></Field>
        <Field label="Asignatura"><input type="text" style={inp} value={d.asignatura||''} onChange={e => set('asignatura', e.target.value)} /></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <Field label="Profesional"><input type="text" style={inp} value={d.profesional||''} onChange={e => set('profesional', e.target.value)} /></Field>
        <Field label="Cargo"><input type="text" style={inp} value={d.cargo||''} onChange={e => set('cargo', e.target.value)} /></Field>
      </div>
      <Field label="Objetivo de la sesión"><textarea rows={3} style={ta} value={d.objetivo||''} onChange={e => set('objetivo', e.target.value)} /></Field>
      <Field label="Contenidos y actividades"><textarea rows={4} style={ta} value={d.contenidos||''} onChange={e => set('contenidos', e.target.value)} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="¿Registrado en libro de clases?">
          <select style={inp} value={d.registrado_libro ? 'si' : 'no'} onChange={e => set('registrado_libro', e.target.value === 'si')}>
            <option value="no">No</option>
            <option value="si">Sí</option>
          </select>
        </Field>
        {d.registrado_libro && <Field label="Fecha en libro"><input type="date" style={inp} value={d.fecha_libro||''} onChange={e => set('fecha_libro', e.target.value)} /></Field>}
      </div>
      <div style={{ marginTop: 12 }}>
        <Field label="Observaciones"><textarea rows={3} style={ta} value={d.observaciones||''} onChange={e => set('observaciones', e.target.value)} /></Field>
      </div>
    </div>
  );
}

function Anx5Form({ data, onChange }) {
  const d = data || {};
  const set = (k, v) => onChange({ ...d, [k]: v });
  const toggleDoc = (doc) => {
    const arr = d.documentos || [];
    set('documentos', arr.includes(doc) ? arr.filter(x => x !== doc) : [...arr, doc]);
  };
  return (
    <div>
      <Field label="Fecha de apelación"><input type="date" style={inp} value={d.fecha||''} onChange={e => set('fecha', e.target.value)} /></Field>

      <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', margin: '10px 0 8px', borderLeft: '3px solid #2563eb', paddingLeft: 8 }}>Apoderado/a Apelante</p>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
        <Field label="Nombre"><input type="text" style={inp} value={d.apoderado||''} onChange={e => set('apoderado', e.target.value)} /></Field>
        <Field label="RUT"><input type="text" style={inp} value={d.rut||''} onChange={e => set('rut', e.target.value)} /></Field>
        <Field label="Parentesco"><input type="text" style={inp} value={d.parentesco||''} onChange={e => set('parentesco', e.target.value)} /></Field>
      </div>

      <Field label="Medida disciplinaria que se apela"><textarea rows={3} style={ta} value={d.medida||''} onChange={e => set('medida', e.target.value)} /></Field>
      <Field label="Fundamentos de la apelación"><textarea rows={4} style={ta} value={d.fundamentos||''} onChange={e => set('fundamentos', e.target.value)} /></Field>

      <Field label="Documentos adjuntos">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {DOCUMENTOS_APELACION.map(doc => (
            <label key={doc} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={(d.documentos||[]).includes(doc)} onChange={() => toggleDoc(doc)} />
              {doc}
            </label>
          ))}
        </div>
      </Field>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────

export default function ConvivenciaCasoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { school } = useAuth();
  const primary = school?.primary_color || '#2563EB';

  const [caso, setCaso] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState(null);
  const [openAnexo, setOpenAnexo] = useState(null);

  // Local form state for each Anexo
  const [anx1, setAnx1] = useState(null);
  const [anx2, setAnx2] = useState(null);
  const [anx3, setAnx3] = useState(null);
  const [anx4, setAnx4] = useState(null);
  const [anx5, setAnx5] = useState(null);
  const [bitacora, setBitacora] = useState([]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchCase = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`/api/convivencia/cases/${id}`);
      const c = r.data;
      setCaso(c);
      setAnx1(c.anx1_data || {});
      setAnx2(c.anx2_data || {});
      setAnx3(c.anx3_data || {});
      setAnx4(c.anx4_data || {});
      setAnx5(c.anx5_data || {});
      setBitacora(c.bitacora || []);
    } catch { navigate('/convivencia/casos'); }
    setLoading(false);
  }, [id, navigate]);

  useEffect(() => { fetchCase(); }, [fetchCase]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`/api/convivencia/cases/${id}`, {
        anx1_data: anx1, anx2_data: anx2, anx3_data: anx3,
        anx4_data: anx4, anx5_data: anx5,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { showToast('Error al guardar', 'error'); }
    setSaving(false);
  };

  const handleAvanzar = async () => {
    const etapa = ETAPAS.find(e => e.key === caso.estado);
    const label = etapa ? etapa.label : caso.estado;
    const nextEtapa = ETAPAS[ETAPAS.findIndex(e => e.key === caso.estado) + 1];
    if (!nextEtapa) return;
    if (!window.confirm(`¿Avanzar de "${label}" a "${nextEtapa.label}"?`)) return;
    await handleSave();
    try {
      await axios.post(`/api/convivencia/cases/${id}/avanzar`);
      showToast(`Etapa avanzada a: ${nextEtapa.label}`);
      fetchCase();
    } catch { showToast('Error al avanzar', 'error'); }
  };

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding: 60 }}><div className="spinner" /></div>;
  if (!caso) return null;

  const estadoIdx = ETAPAS.findIndex(e => e.key === caso.estado);
  const isCerrado = caso.estado === 'cerrado';
  const canAdvance = !isCerrado;

  // Which Anexos are unlocked (up to current estado + 1 to preview next)
  const isUnlocked = (etapaKey) => {
    const i = ETAPAS.findIndex(e => e.key === etapaKey);
    return i <= estadoIdx;
  };

  const CRIT_COLORS = { alta: '#dc2626', media: '#d97706', baja: '#64748b' };
  const critColor = CRIT_COLORS[caso.criticality] || CRIT_COLORS.baja;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/convivencia/casos')} style={{
          padding: '7px 14px', background: '#f1f5f9', border: 'none', borderRadius: 8,
          cursor: 'pointer', fontSize: 13, color: '#475569', fontWeight: 600
        }}>← Volver</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 18, color: primary }}>#{String(caso.case_number).padStart(3,'0')}</span>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{caso.title}</h1>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
              background: isCerrado ? '#d1fae5' : '#fef3c7',
              color: isCerrado ? '#065f46' : '#92400e' }}>
              {isCerrado ? '✅ Cerrado' : '🔓 Abierto'}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
              background: `${critColor}18`, color: critColor }}>
              {caso.criticality || 'media'} criticidad
            </span>
          </div>
          <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>
            {caso.date ? fmtDate(caso.date) : ''}
            {caso.student && ` · ${caso.student.first_name} ${caso.student.last_name}`}
            {caso.course_name && ` · ${caso.course_name}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {saved && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✓ Guardado</span>}
          <button onClick={handleSave} disabled={saving} style={{
            padding: '8px 16px', background: primary, color: '#fff', border: 'none',
            borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1
          }}>{saving ? 'Guardando...' : '💾 Guardar'}</button>
          {canAdvance && (
            <button onClick={handleAvanzar} style={{
              padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none',
              borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer'
            }}>Avanzar Etapa →</button>
          )}
        </div>
      </div>

      {/* Stepper */}
      <div style={{ display: 'flex', marginBottom: 28, overflowX: 'auto', paddingBottom: 8 }}>
        {ETAPAS.map((etapa, i) => {
          const isDone = i < estadoIdx;
          const isActive = i === estadoIdx;
          const color = isDone ? '#22c55e' : isActive ? primary : '#e2e8f0';
          const textColor = isDone ? '#15803d' : isActive ? primary : '#94a3b8';
          return (
            <div key={etapa.key} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 80 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: '50%', background: color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: isDone || isActive ? '#fff' : '#94a3b8',
                  fontWeight: 800, fontSize: 14, flexShrink: 0
                }}>
                  {isDone ? '✓' : i + 1}
                </div>
                <span style={{ fontSize: 10, color: textColor, textAlign: 'center', marginTop: 4, maxWidth: 76, fontWeight: isActive ? 700 : 400 }}>
                  {etapa.label}
                </span>
              </div>
              {i < ETAPAS.length - 1 && (
                <div style={{ width: 30, height: 2, background: isDone ? '#22c55e' : '#e2e8f0', flexShrink: 0, margin: '0 2px' }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Anexos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          { etapa: 'recepcion',           label: 'Recepción del Caso',             tag: 'ANEXO 1', data: anx1, onChange: setAnx1,         form: <Anx1Form data={anx1} onChange={setAnx1} />,               gen: () => generateAnexo1({ ...caso, anx1_data: anx1 }) },
          { etapa: 'entrevista',          label: 'Entrevista con Apoderado/a',     tag: 'ANEXO 2', data: anx2, onChange: setAnx2,         form: <Anx2Form data={anx2} onChange={setAnx2} />,               gen: () => generateAnexo2({ ...caso, anx2_data: anx2 }) },
          { etapa: 'seguimiento',         label: 'Seguimiento Individual',         tag: 'ANEXO 3', data: anx3, onChange: setAnx3,         form: <Anx3Form data={anx3} onChange={setAnx3} caseId={id} bitacora={bitacora} onBitacoraChange={setBitacora} />, gen: () => generateAnexo3({ ...caso, anx3_data: anx3, bitacora }) },
          { etapa: 'intervencion_grupal', label: 'Intervención Grupal',            tag: 'ANEXO 4', data: anx4, onChange: setAnx4,         form: <Anx4Form data={anx4} onChange={setAnx4} />,               gen: () => generateAnexo4({ ...caso, anx4_data: anx4 }) },
          { etapa: 'apelacion',           label: 'Apelación',                      tag: 'ANEXO 5', data: anx5, onChange: setAnx5,         form: <Anx5Form data={anx5} onChange={setAnx5} />,               gen: () => generateAnexo5({ ...caso, anx5_data: anx5 }) },
        ].map(({ etapa, label, tag, form, gen }) => {
          const unlocked = isUnlocked(etapa);
          const isOpen = openAnexo === etapa;
          const etapaObj = ETAPAS.find(e => e.key === etapa);
          const etapaI = ETAPAS.findIndex(e => e.key === etapa);
          const isDone = etapaI < estadoIdx;
          const isActive = etapa === caso.estado;

          return (
            <div key={etapa} style={{
              border: `1px solid ${isActive ? primary : isDone ? '#bbf7d0' : '#e2e8f0'}`,
              borderRadius: 12, overflow: 'hidden',
              opacity: unlocked ? 1 : 0.5,
            }}>
              {/* Summary */}
              <div
                onClick={() => unlocked && setOpenAnexo(isOpen ? null : etapa)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  background: isActive ? `${primary}08` : isDone ? '#f0fdf4' : '#f8fafc',
                  cursor: unlocked ? 'pointer' : 'not-allowed', userSelect: 'none',
                }}
              >
                <span style={{ fontSize: 10, background: isActive ? primary : isDone ? '#22c55e' : '#e2e8f0',
                  color: isActive || isDone ? '#fff' : '#94a3b8',
                  padding: '2px 8px', borderRadius: 4, fontWeight: 700, flexShrink: 0 }}>
                  {tag}
                </span>
                <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b', flex: 1 }}>{label}</span>
                {isDone && <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>✓ Completado</span>}
                {isActive && <span style={{ fontSize: 11, color: primary, fontWeight: 700 }}>● En curso</span>}
                {!unlocked && <span style={{ fontSize: 12, color: '#94a3b8' }}>🔒</span>}
                {unlocked && (
                  <button
                    onClick={e => { e.stopPropagation(); printAnexo(gen(), `${tag} - Caso #${String(caso.case_number).padStart(3,'0')}`); }}
                    style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#374151',
                      padding: '3px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
                  >🖨️ Imprimir</button>
                )}
                <span style={{ color: '#94a3b8', fontSize: 16 }}>{isOpen ? '▲' : '▼'}</span>
              </div>

              {/* Body */}
              {isOpen && unlocked && (
                <div style={{ padding: '20px 20px 16px', borderTop: `1px solid ${isActive ? primary + '40' : '#e2e8f0'}` }}>
                  {form}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: toast.type === 'error' ? '#dc2626' : '#16a34a',
          color: '#fff', padding: '10px 18px', borderRadius: 10, fontWeight: 600, fontSize: 14, zIndex: 9999,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
