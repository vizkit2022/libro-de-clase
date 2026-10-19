import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './ConvivenciaPage.css';

export const ETAPAS = [
  { key: 'recepcion',          label: 'Recepción',              anexo: 'Anexo 1' },
  { key: 'entrevista',         label: 'Entrevista Apoderados',  anexo: 'Anexo 2' },
  { key: 'seguimiento',        label: 'Seguimiento Individual', anexo: 'Anexo 3' },
  { key: 'intervencion_grupal',label: 'Intervención Grupal',    anexo: 'Anexo 4' },
  { key: 'apelacion',          label: 'Apelación',              anexo: 'Anexo 5' },
  { key: 'cerrado',            label: 'Cerrado',                anexo: '' },
];

const MEDIDAS_OPTS = [
  'Primeros Auxilios / Seguro Escolar',
  'Pausa Sensorial / Contención en Convivencia',
  'Separación Física de Espacios',
  'Notificación Telefónica a Apoderados/as',
];

const DOC_OPTS = [
  'Informes Médicos/Psicológicos',
  'Cartas de Compromiso',
  'Otros',
];

export function etapaIdx(estado) {
  return ETAPAS.findIndex(e => e.key === estado);
}

export function fmtDate(d) {
  if (!d) return '___________';
  return new Date(d + 'T00:00:00').toLocaleDateString('es-CL');
}

export function fmtDT(d) {
  if (!d) return '___________';
  return new Date(d).toLocaleString('es-CL');
}

// ── Print helpers ─────────────────────────────────────────────────────────────
export function printAnexo(html, title) {
  const w = window.open('', '_blank', 'width=900,height=700');
  w.document.write(`<!DOCTYPE html><html><head>
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11pt; padding: 20px; color: #000; }
      h2 { text-align: center; font-size: 13pt; text-transform: uppercase; margin-bottom: 4px; }
      h3 { text-align: center; font-size: 10pt; font-style: italic; color: #555; margin-top: 0; }
      .field { border-bottom: 1px solid #000; min-height: 18px; margin: 2px 0 8px 0; padding: 2px; }
      .field-inline { display: inline-block; border-bottom: 1px solid #000; min-width: 200px; }
      .section { font-weight: bold; margin-top: 14px; margin-bottom: 4px; }
      .row { display: flex; gap: 20px; margin-bottom: 8px; }
      .row > div { flex: 1; }
      .check { display: inline-block; width: 14px; height: 14px; border: 1px solid #000;
               text-align: center; line-height: 14px; margin-right: 6px; vertical-align: middle; }
      .firma { display: flex; gap: 40px; margin-top: 40px; }
      .firma > div { flex: 1; text-align: center; border-top: 1px solid #000; padding-top: 4px; font-size: 9pt; }
      .tabla { width: 100%; border-collapse: collapse; margin-top: 8px; }
      .tabla th, .tabla td { border: 1px solid #000; padding: 4px 6px; font-size: 9pt; }
      .tabla th { background: #eee; }
      .reserved { text-align: center; font-style: italic; font-size: 9pt; color: #555; }
      @media print { @page { margin: 15mm; } }
    </style>
  </head><body>${html}</body></html>`);
  w.document.close();
  setTimeout(() => { w.print(); }, 400);
}

// ── Formularios por etapa ─────────────────────────────────────────────────────

// Fila de persona (afectado / involucrado): se puede elegir un alumno del colegio
// (queda vinculado → su apoderado podrá ver el caso) o escribir un nombre libre.
function PersonaRow({ item, alumnos, onChange, onRemove }) {
  const linked = alumnos.find(a => a.id === item.student_id);
  const pick = (val) => {
    if (!val) { onChange({ ...item, student_id: undefined }); return; }
    const a = alumnos.find(x => String(x.id) === val);
    onChange({ ...item, student_id: a.id, nombre: a.full_name, curso: a.course_name || item.curso || '' });
  };
  return (
    <div className="row-inputs">
      <select value={item.student_id || ''} onChange={e => pick(e.target.value)} title="Vincular a un alumno del colegio">
        <option value="">— Alumno del colegio (opcional) —</option>
        {alumnos.map(a => <option key={a.id} value={a.id}>{a.full_name}{a.course_name ? ` · ${a.course_name}` : ''}</option>)}
      </select>
      <input placeholder="Nombre" value={item.nombre || ''} onChange={e => onChange({ ...item, nombre: e.target.value })} />
      <input placeholder="Curso" style={{ width: 80 }} value={item.curso || ''} onChange={e => onChange({ ...item, curso: e.target.value })} />
      {linked && <span className="link-pill" title="Alumno vinculado: su apoderado podrá ver este caso">🔗 vinculado</span>}
      {onRemove && <button className="btn-remove" onClick={onRemove}>✕</button>}
    </div>
  );
}

function Anexo1Form({ data, onChange, alumnos = [] }) {
  const afectados = data.afectados?.length ? data.afectados : [{ nombre: '', curso: '' }];
  const involucrados = data.involucrados?.length ? data.involucrados : [{ nombre: '', curso: '' }];
  const medidas = data.medidas_inmediatas || [];

  const setAfectados = (arr) => onChange({ afectados: arr });
  const setInvolucrados = (arr) => onChange({ involucrados: arr });
  const toggleMedida = (m) => {
    const next = medidas.includes(m) ? medidas.filter(x => x !== m) : [...medidas, m];
    onChange({ medidas_inmediatas: next });
  };

  return (
    <div className="form-section">
      <h3>Anexo 1 — Ficha de Recepción de Denuncia</h3>
      <div className="field-row">
        <label>Fecha y Hora de Recepción</label>
        <input type="datetime-local" value={data.fecha_recepcion?.slice(0,16)||''} onChange={e=>onChange({fecha_recepcion:e.target.value})} />
      </div>
      <div className="field-row">
        <label>Nombre de quien recibe el reporte</label>
        <input value={data.quien_recibe||''} onChange={e=>onChange({quien_recibe:e.target.value})} placeholder="Nombre completo" />
      </div>

      <div className="subsection">1. Datos de los involucrados</div>
      <p className="hint">Si eliges un alumno del colegio, el caso queda vinculado a él y su apoderado podrá verlo (solo lectura) desde su portal.</p>
      <label className="sub-label">Estudiante(s) Afectado(s)</label>
      {afectados.map((a, i) => (
        <PersonaRow key={i} item={a} alumnos={alumnos}
          onChange={item => { const arr=[...afectados]; arr[i]=item; setAfectados(arr); }}
          onRemove={i>0 ? () => setAfectados(afectados.filter((_,j)=>j!==i)) : null} />
      ))}
      <button className="btn-add" onClick={()=>setAfectados([...afectados,{nombre:'',curso:''}])}>+ Agregar afectado</button>

      <label className="sub-label" style={{marginTop:10}}>Estudiante(s) / Persona Involucrada</label>
      {involucrados.map((a, i) => (
        <PersonaRow key={i} item={a} alumnos={alumnos}
          onChange={item => { const arr=[...involucrados]; arr[i]=item; setInvolucrados(arr); }}
          onRemove={i>0 ? () => setInvolucrados(involucrados.filter((_,j)=>j!==i)) : null} />
      ))}
      <button className="btn-add" onClick={()=>setInvolucrados([...involucrados,{nombre:'',curso:''}])}>+ Agregar involucrado</button>

      <div className="subsection">2. Descripción de los hechos</div>
      <textarea rows={5} value={data.descripcion_hechos||''} onChange={e=>onChange({descripcion_hechos:e.target.value})} />

      <div className="subsection">3. Tipificación Preliminar</div>
      <div className="check-group">
        {['conflicto_cotidiano','maltrato_escolar','acoso_escolar','ciberbullying','otro'].map(t => (
          <label key={t} className="check-label">
            <input type="radio" name="tipificacion" value={t} checked={data.tipificacion===t} onChange={()=>onChange({tipificacion:t})} />
            {t.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
          </label>
        ))}
      </div>
      {data.tipificacion==='otro' && (
        <input placeholder="Especificar..." value={data.tipificacion_otro||''} onChange={e=>onChange({tipificacion_otro:e.target.value})} style={{marginTop:6}} />
      )}

      <div className="subsection">4. Medidas Inmediatas</div>
      <div className="check-group grid2">
        {MEDIDAS_OPTS.map(m => (
          <label key={m} className="check-label">
            <input type="checkbox" checked={medidas.includes(m)} onChange={()=>toggleMedida(m)} />
            {m}
          </label>
        ))}
      </div>
    </div>
  );
}

function Anexo2Form({ data, onChange, apoderados = [] }) {
  const pickApoderado = (val) => {
    if (!val) { onChange({ apoderado_user_id: null }); return; }
    const ap = apoderados.find(x => String(x.id) === val);
    if (!ap) return;
    onChange({
      apoderado_user_id: ap.id,
      apoderado_nombre: ap.full_name,
      apoderado_rut: ap.rut || data.apoderado_rut || '',
      apoderado_telefono: ap.phone || data.apoderado_telefono || '',
      apoderado_parentesco: ap.students?.[0]?.relationship || data.apoderado_parentesco || '',
    });
  };
  return (
    <div className="form-section">
      <h3>Anexo 2 — Acta de Entrevista a Apoderado/a y Debido Proceso</h3>
      <div className="field-row">
        <label>Apoderado/a del sistema (vincular al caso)</label>
        <select value={data.apoderado_user_id || ''} onChange={e => pickApoderado(e.target.value)}>
          <option value="">— Sin vincular (ingreso manual) —</option>
          {apoderados.map(ap => (
            <option key={ap.id} value={ap.id}>
              {ap.full_name}{ap.students?.length ? ` · apoderado de ${ap.students.map(s => s.full_name).join(', ')}` : ''}
            </option>
          ))}
        </select>
        <p className="hint">Al vincularlo, el apoderado podrá ver el seguimiento de este caso (solo lectura) desde su portal, aunque el alumno afectado no esté vinculado.</p>
      </div>
      <div className="field-row3">
        <div><label>Fecha</label><input type="date" value={data.entrevista_fecha||''} onChange={e=>onChange({entrevista_fecha:e.target.value})} /></div>
        <div><label>Hora Inicio</label><input type="time" value={data.entrevista_hora_inicio||''} onChange={e=>onChange({entrevista_hora_inicio:e.target.value})} /></div>
        <div><label>Hora Término</label><input type="time" value={data.entrevista_hora_termino||''} onChange={e=>onChange({entrevista_hora_termino:e.target.value})} /></div>
      </div>
      <div className="field-row2">
        <div><label>Nombre Apoderado/a</label><input value={data.apoderado_nombre||''} onChange={e=>onChange({apoderado_nombre:e.target.value})} /></div>
        <div><label>RUT</label><input value={data.apoderado_rut||''} onChange={e=>onChange({apoderado_rut:e.target.value})} /></div>
      </div>
      <div className="field-row2">
        <div><label>Parentesco / Rol</label><input value={data.apoderado_parentesco||''} onChange={e=>onChange({apoderado_parentesco:e.target.value})} /></div>
        <div><label>Teléfono</label><input value={data.apoderado_telefono||''} onChange={e=>onChange({apoderado_telefono:e.target.value})} /></div>
      </div>
      <div className="field-row2">
        <div><label>Entrevistador/a</label><input value={data.entrevistador||''} onChange={e=>onChange({entrevistador:e.target.value})} /></div>
        <div><label>Cargo</label><input value={data.entrevistador_cargo||''} onChange={e=>onChange({entrevistador_cargo:e.target.value})} /></div>
      </div>
      <div className="subsection">1. Motivo de la Citación y Exposición de Antecedentes</div>
      <textarea rows={3} value={data.motivo_citacion||''} onChange={e=>onChange({motivo_citacion:e.target.value})} />
      <div className="subsection">2. Declaración y Descargos del Apoderado/a y/o Estudiante</div>
      <textarea rows={3} value={data.declaracion_descargos||''} onChange={e=>onChange({declaracion_descargos:e.target.value})} />
      <div className="subsection">3. Acuerdos, Medidas Reparatorias y Compromisos</div>
      <label className="sub-label">Compromiso de la Familia / Estudiante</label>
      <textarea rows={2} value={data.compromiso_familia||''} onChange={e=>onChange({compromiso_familia:e.target.value})} />
      <label className="sub-label">Compromiso de Convivencia Escolar</label>
      <textarea rows={2} value={data.compromiso_convivencia||''} onChange={e=>onChange({compromiso_convivencia:e.target.value})} />
      <div className="field-row">
        <label>4. Próximo Monitoreo / Fecha de Seguimiento</label>
        <input type="date" value={data.entrevista_proximo_monitoreo||''} onChange={e=>onChange({entrevista_proximo_monitoreo:e.target.value})} />
      </div>
    </div>
  );
}

function Anexo3Form({ data, onChange, bitacora, onAddBitacora, onDeleteBitacora }) {
  const [newEntry, setNewEntry] = useState({ fecha: '', tipo_accion: '', observaciones: '' });
  return (
    <div className="form-section">
      <h3>Anexo 3 — Bitácora de Seguimiento Socioemocional Individual</h3>
      <div className="field-row">
        <label>Coordinador/a a Cargo</label>
        <input value={data.coordinador_cargo||''} onChange={e=>onChange({coordinador_cargo:e.target.value})} />
      </div>
      <div className="subsection">Registro de Acciones</div>
      <table className="bitacora-table">
        <thead><tr><th>Fecha</th><th>Tipo de Acción</th><th>Observaciones y Avances</th><th></th></tr></thead>
        <tbody>
          {bitacora.map(b => (
            <tr key={b.id}>
              <td>{fmtDate(b.fecha)}</td>
              <td>{b.tipo_accion}</td>
              <td>{b.observaciones}</td>
              <td><button className="btn-remove" onClick={()=>onDeleteBitacora(b.id)}>✕</button></td>
            </tr>
          ))}
          <tr className="new-entry-row">
            <td><input type="date" value={newEntry.fecha} onChange={e=>setNewEntry({...newEntry,fecha:e.target.value})} /></td>
            <td>
              <select value={newEntry.tipo_accion} onChange={e=>setNewEntry({...newEntry,tipo_accion:e.target.value})}>
                <option value="">Seleccionar...</option>
                {['Entrevista','Observación','Redes de apoyo','Reunión equipo','Llamada','Otro'].map(t=><option key={t}>{t}</option>)}
              </select>
            </td>
            <td><textarea rows={1} value={newEntry.observaciones} onChange={e=>setNewEntry({...newEntry,observaciones:e.target.value})} /></td>
            <td><button className="btn-add small" onClick={()=>{ onAddBitacora(newEntry); setNewEntry({fecha:'',tipo_accion:'',observaciones:''}); }}>+</button></td>
          </tr>
        </tbody>
      </table>
      <div className="subsection">Observaciones con Especialistas / Externos</div>
      <textarea rows={3} value={data.observaciones_especialistas||''} onChange={e=>onChange({observaciones_especialistas:e.target.value})} />
      <div className="field-row">
        <label>Próximo Monitoreo / Fecha Seguimiento</label>
        <input type="date" value={data.seguimiento_proximo_monitoreo||''} onChange={e=>onChange({seguimiento_proximo_monitoreo:e.target.value})} />
      </div>
    </div>
  );
}

function Anexo4Form({ data, onChange }) {
  return (
    <div className="form-section">
      <h3>Anexo 4 — Ficha de Intervención Socioemocional al Grupo Curso</h3>
      <div className="field-row2">
        <div><label>Fecha de Ejecución</label><input type="date" value={data.intervencion_fecha||''} onChange={e=>onChange({intervencion_fecha:e.target.value})} /></div>
        <div><label>Curso Intervenido</label><input value={data.intervencion_curso||''} onChange={e=>onChange({intervencion_curso:e.target.value})} /></div>
      </div>
      <div className="field-row">
        <label>Asignatura / Espacio</label>
        <input value={data.intervencion_asignatura||''} onChange={e=>onChange({intervencion_asignatura:e.target.value})} />
      </div>
      <div className="field-row2">
        <div><label>Profesional / Responsable</label><input value={data.intervencion_profesional||''} onChange={e=>onChange({intervencion_profesional:e.target.value})} /></div>
        <div><label>Cargo / Función</label><input value={data.intervencion_cargo||''} onChange={e=>onChange({intervencion_cargo:e.target.value})} /></div>
      </div>
      <div className="subsection">1. Objetivo de la Sesión Grupal</div>
      <textarea rows={2} value={data.intervencion_objetivo||''} onChange={e=>onChange({intervencion_objetivo:e.target.value})} />
      <div className="subsection">2. Contenidos y Actividades Desarrolladas</div>
      <textarea rows={3} value={data.intervencion_contenidos||''} onChange={e=>onChange({intervencion_contenidos:e.target.value})} />
      <div className="subsection">3. Registro en Libro de Clases</div>
      <label className="check-label">
        <input type="checkbox" checked={data.intervencion_registrado_libro||false} onChange={e=>onChange({intervencion_registrado_libro:e.target.checked})} />
        Registrado en Libro de Clases (Orientación/Jefatura)
      </label>
      {data.intervencion_registrado_libro && (
        <div className="field-row" style={{marginTop:6}}>
          <label>Fecha de registro en Libro</label>
          <input type="date" value={data.intervencion_fecha_libro||''} onChange={e=>onChange({intervencion_fecha_libro:e.target.value})} />
        </div>
      )}
      <div className="subsection">Observaciones del Clima de Aula / Evaluación de la Sesión</div>
      <textarea rows={3} value={data.intervencion_observaciones||''} onChange={e=>onChange({intervencion_observaciones:e.target.value})} />
    </div>
  );
}

function Anexo5Form({ data, onChange }) {
  const docs = data.apelacion_documentos || [];
  const toggleDoc = (d) => {
    const next = docs.includes(d) ? docs.filter(x=>x!==d) : [...docs, d];
    onChange({ apelacion_documentos: next });
  };
  return (
    <div className="form-section">
      <h3>Anexo 5 — Solicitud de Reconsideración (Apelación)</h3>
      <div className="field-row">
        <label>Fecha de Presentación</label>
        <input type="date" value={data.apelacion_fecha||''} onChange={e=>onChange({apelacion_fecha:e.target.value})} />
      </div>
      <div className="field-row2">
        <div><label>Nombre Apoderado/a</label><input value={data.apelacion_apoderado||''} onChange={e=>onChange({apelacion_apoderado:e.target.value})} /></div>
        <div><label>RUT</label><input value={data.apelacion_rut||''} onChange={e=>onChange({apelacion_rut:e.target.value})} /></div>
      </div>
      <div className="field-row">
        <label>Madre / Padre y/o Tutor</label>
        <input value={data.apelacion_parentesco||''} onChange={e=>onChange({apelacion_parentesco:e.target.value})} />
      </div>
      <div className="subsection">Medida Disciplinaria Impugnada</div>
      <textarea rows={3} value={data.apelacion_medida||''} onChange={e=>onChange({apelacion_medida:e.target.value})} />
      <div className="subsection">Fundamentos de la Apelación</div>
      <textarea rows={4} value={data.apelacion_fundamentos||''} onChange={e=>onChange({apelacion_fundamentos:e.target.value})} />
      <div className="subsection">Documentos o Antecedentes que Adjunta</div>
      <div className="check-group">
        {DOC_OPTS.map(d=>(
          <label key={d} className="check-label">
            <input type="checkbox" checked={docs.includes(d)} onChange={()=>toggleDoc(d)} />{d}
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Funciones de impresión por Anexo ─────────────────────────────────────────

export function generateAnexoHTML(caso, anexo) {
  const afs = (caso.afectados||[]).map(a=>`${a.nombre} — Curso: ${a.curso}`).join('<br>');
  const invs = (caso.involucrados||[]).map(a=>`${a.nombre} — Curso: ${a.curso}`).join('<br>');
  const medidas = (caso.medidas_inmediatas||[]).join(', ');
  const tipMap = {conflicto_cotidiano:'Conflicto Cotidiano',maltrato_escolar:'Maltrato Escolar',acoso_escolar:'Acoso Escolar (Bullying)',ciberbullying:'Ciberbullying',otro:'Otro'};

  if (anexo === 1) return `
    <h2>FICHA DE RECEPCIÓN DE DENUNCIA / REPORTAR SITUACIÓN</h2>
    <p class="reserved">(USO RESERVADO — CONVIVENCIA ESCOLAR)</p>
    <p><strong>Caso N°:</strong> ${caso.numero_caso} &nbsp;&nbsp; <strong>Fecha y Hora de Recepción:</strong> ${fmtDT(caso.fecha_recepcion)}</p>
    <p><strong>Nombre de quien recibe el reporte:</strong> <span class="field-inline">${caso.quien_recibe||''}</span></p>
    <p class="section">1. DATOS DE LOS NIÑOS, NIÑAS O INVOLUCRADOS/AS</p>
    <p><strong>Estudiante(s) Afectado(s):</strong><br>${afs||'—'}</p>
    <p><strong>Estudiante(s) / Persona Involucrada:</strong><br>${invs||'—'}</p>
    <p class="section">2. DESCRIPCIÓN SUCINTA DE LOS HECHOS REPORTADOS</p>
    <div class="field">${(caso.descripcion_hechos||'').replace(/\n/g,'<br>')}</div>
    <p class="section">3. TIPIFICACIÓN PRELIMINAR</p>
    <p>${['conflicto_cotidiano','maltrato_escolar','acoso_escolar','ciberbullying','otro'].map(t=>`<span class="check">${caso.tipificacion===t?'✓':''}</span> ${tipMap[t]}`).join(' &nbsp;&nbsp; ')}</p>
    ${caso.tipificacion==='otro'?`<p><strong>Especificar:</strong> ${caso.tipificacion_otro||''}</p>`:''}
    <p class="section">4. MEDIDAS INMEDIATAS DE CONTENCIÓN / RESGUARDO</p>
    <p>${medidas||'—'}</p>
    <div class="firma">
      <div>FIRMA DE QUIEN RECIBE / INFORMA</div>
      <div>FIRMA COORDINACIÓN CONVIVENCIA</div>
    </div>`;

  if (anexo === 2) return `
    <h2>ACTA DE ENTREVISTA A APODERADO/A Y DEBIDO PROCESO</h2>
    <p class="reserved">(USO RESERVADO — CONVIVENCIA ESCOLAR)</p>
    <p><strong>Caso N°:</strong> ${caso.numero_caso} &nbsp;&nbsp; <strong>Fecha:</strong> ${fmtDate(caso.entrevista_fecha)} &nbsp;&nbsp; <strong>Hora Inicio:</strong> ${caso.entrevista_hora_inicio||'____'} &nbsp;&nbsp; <strong>Hora Término:</strong> ${caso.entrevista_hora_termino||'____'}</p>
    <div class="row">
      <div><strong>Nombre Apoderado/a:</strong> <span class="field-inline">${caso.apoderado_nombre||''}</span></div>
      <div><strong>RUT:</strong> <span class="field-inline">${caso.apoderado_rut||''}</span></div>
    </div>
    <div class="row">
      <div><strong>Parentesco / Rol:</strong> <span class="field-inline">${caso.apoderado_parentesco||''}</span></div>
      <div><strong>Teléfono:</strong> <span class="field-inline">${caso.apoderado_telefono||''}</span></div>
    </div>
    <div class="row">
      <div><strong>Entrevistador/a:</strong> <span class="field-inline">${caso.entrevistador||''}</span></div>
      <div><strong>Cargo:</strong> <span class="field-inline">${caso.entrevistador_cargo||''}</span></div>
    </div>
    <p class="section">1. MOTIVO DE LA CITACIÓN Y EXPOSICIÓN DE ANTECEDENTES</p>
    <div class="field">${(caso.motivo_citacion||'').replace(/\n/g,'<br>')}</div>
    <p class="section">2. DECLARACIÓN Y DESCARGOS DEL APODERADO/A Y/O ESTUDIANTE</p>
    <div class="field">${(caso.declaracion_descargos||'').replace(/\n/g,'<br>')}</div>
    <p class="section">3. ACUERDOS, MEDIDAS REPARATORIAS Y COMPROMISOS</p>
    <p><strong>Compromiso de la Familia / Estudiante:</strong></p>
    <div class="field">${(caso.compromiso_familia||'').replace(/\n/g,'<br>')}</div>
    <p><strong>Compromiso de Convivencia Escolar:</strong></p>
    <div class="field">${(caso.compromiso_convivencia||'').replace(/\n/g,'<br>')}</div>
    <p><strong>4. Próximo Monitoreo / Fecha de Seguimiento:</strong> ${fmtDate(caso.entrevista_proximo_monitoreo)}</p>
    <div class="firma">
      <div>FIRMA DEL APODERADO/A</div>
      <div>FIRMA ENTREVISTADOR/A</div>
    </div>`;

  if (anexo === 3) {
    const rows = (caso.bitacora||[]).map(b=>`<tr><td>${fmtDate(b.fecha)}</td><td>${b.tipo_accion||''}</td><td>${b.observaciones||''}</td></tr>`).join('');
    return `
    <h2>BITÁCORA DE SEGUIMIENTO SOCIOEMOCIONAL Y ACOMPAÑAMIENTO</h2>
    <p class="reserved">(USO RESERVADO — CONVIVENCIA ESCOLAR)</p>
    <p><strong>Caso N°:</strong> ${caso.numero_caso} &nbsp;&nbsp; <strong>Coordinador/a a Cargo:</strong> <span class="field-inline">${caso.coordinador_cargo||''}</span></p>
    <table class="tabla"><thead><tr><th>FECHA</th><th>TIPO DE ACCIÓN</th><th>OBSERVACIONES Y AVANCES</th></tr></thead>
    <tbody>${rows||'<tr><td colspan="3">—</td></tr>'}</tbody></table>
    <p class="section">Observaciones con Especialistas o Profesionales Externos</p>
    <div class="field">${(caso.observaciones_especialistas||'').replace(/\n/g,'<br>')}</div>
    <p><strong>Próximo Monitoreo:</strong> ${fmtDate(caso.seguimiento_proximo_monitoreo)}</p>
    <div class="firma">
      <div>FIRMA DEL APODERADO/A</div>
      <div>FIRMA ENTREVISTADOR/A</div>
    </div>`;
  }

  if (anexo === 4) return `
    <h2>FICHA DE INTERVENCIÓN SOCIOEMOCIONAL AL GRUPO CURSO</h2>
    <p class="reserved">(USO RESERVADO — CONVIVENCIA ESCOLAR)</p>
    <p><strong>Caso N°:</strong> ${caso.numero_caso} &nbsp;&nbsp; <strong>Fecha de Ejecución:</strong> ${fmtDate(caso.intervencion_fecha)} &nbsp;&nbsp; <strong>Curso Intervenido:</strong> ${caso.intervencion_curso||'____'}</p>
    <p><strong>Asignatura / Espacio:</strong> <span class="field-inline">${caso.intervencion_asignatura||''}</span></p>
    <p><strong>Profesional / Responsable:</strong> <span class="field-inline">${caso.intervencion_profesional||''}</span> &nbsp;&nbsp; <strong>Cargo/Función:</strong> <span class="field-inline">${caso.intervencion_cargo||''}</span></p>
    <p class="section">1. OBJETIVO DE LA SESIÓN GRUPAL</p>
    <div class="field">${(caso.intervencion_objetivo||'').replace(/\n/g,'<br>')}</div>
    <p class="section">2. CONTENIDOS Y ACTIVIDADES DESARROLLADAS</p>
    <div class="field">${(caso.intervencion_contenidos||'').replace(/\n/g,'<br>')}</div>
    <p class="section">3. REGISTRO EN LIBRO DE CLASES</p>
    <p><span class="check">${caso.intervencion_registrado_libro?'✓':''}</span> Registrado en Libro de Clases (Orientación/Jefatura)
    &nbsp;&nbsp; <strong>Fecha:</strong> ${fmtDate(caso.intervencion_fecha_libro)}</p>
    <p class="section">OBSERVACIONES DEL CLIMA DE AULA / EVALUACIÓN DE LA SESIÓN</p>
    <div class="field">${(caso.intervencion_observaciones||'').replace(/\n/g,'<br>')}</div>
    <div class="firma">
      <div>FIRMA PROFESIONAL EJECUTOR</div>
      <div>FIRMA COORDINACIÓN CONVIVENCIA</div>
    </div>`;

  if (anexo === 5) {
    const docs = (caso.apelacion_documentos||[]).join(', ');
    return `
    <h2>SOLICITUD DE RECONSIDERACIÓN (APELACIÓN)</h2>
    <p><strong>Caso N°:</strong> ${caso.numero_caso} &nbsp;&nbsp; <strong>Fecha de Presentación:</strong> ${fmtDate(caso.apelacion_fecha)}</p>
    <p><strong>Nombre del Apoderado/a:</strong> <span class="field-inline">${caso.apelacion_apoderado||''}</span> &nbsp;&nbsp; <strong>RUT:</strong> <span class="field-inline">${caso.apelacion_rut||''}</span></p>
    <p><strong>Madre/Padre y/o Tutor:</strong> <span class="field-inline">${caso.apelacion_parentesco||''}</span></p>
    <p class="section">MEDIDA DISCIPLINARIA IMPUGNADA</p>
    <div class="field">${(caso.apelacion_medida||'').replace(/\n/g,'<br>')}</div>
    <p class="section">FUNDAMENTOS DE LA APELACIÓN</p>
    <div class="field">${(caso.apelacion_fundamentos||'').replace(/\n/g,'<br>')}</div>
    <p><strong>Documentos que adjunta:</strong> ${docs||'—'}</p>
    <div class="firma" style="margin-top:60px">
      <div>FIRMA DEL APODERADO/A RECURRENTE</div>
    </div>`;
  }
  return '';
}

// ── Nuevo caso modal ──────────────────────────────────────────────────────────

function NuevoCasoModal({ onClose, onCreate, alumnos }) {
  const [form, setForm] = useState({
    quien_recibe: '', fecha_recepcion: new Date().toISOString().slice(0,16),
    descripcion_hechos: '', tipificacion: '', tipificacion_otro: '',
    afectados: [{ nombre: '', curso: '' }],
    involucrados: [{ nombre: '', curso: '' }],
    medidas_inmediatas: [],
  });
  const ch = (obj) => setForm(f=>({...f,...obj}));
  const submit = async () => {
    await onCreate(form);
    onClose();
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h2>Nuevo Caso de Convivencia</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <Anexo1Form data={form} onChange={ch} alumnos={alumnos} />
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={submit}>Crear Caso</button>
        </div>
      </div>
    </div>
  );
}

// ── Vista de detalle de caso ──────────────────────────────────────────────────

function CasoDetail({ caso: initialCaso, onBack, onUpdate, alumnos, apoderados }) {
  const [caso, setCaso] = useState(initialCaso);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const etapaActual = etapaIdx(caso.estado);

  const save = useCallback(async (patch) => {
    setSaving(true);
    try {
      const r = await axios.put(`/api/convivencia/${caso.id}`, patch);
      setCaso(r.data);
      onUpdate(r.data);
      setSaved(true);
      setTimeout(()=>setSaved(false), 2000);
    } finally { setSaving(false); }
  }, [caso.id, onUpdate]);

  const avanzar = async () => {
    const r = await axios.post(`/api/convivencia/${caso.id}/avanzar`);
    setCaso(r.data);
    onUpdate(r.data);
  };

  const addBitacora = async (entry) => {
    if (!entry.fecha || !entry.tipo_accion) return;
    const r = await axios.post(`/api/convivencia/${caso.id}/bitacora`, entry);
    setCaso(c=>({...c, bitacora:[...c.bitacora, r.data]}));
  };

  const deleteBitacora = async (bid) => {
    await axios.delete(`/api/convivencia/${caso.id}/bitacora/${bid}`);
    setCaso(c=>({...c, bitacora:c.bitacora.filter(b=>b.id!==bid)}));
  };

  const ch = (patch) => setCaso(c=>({...c,...patch}));

  const ETAPAS_ACTIVAS = ETAPAS.filter(e => e.key !== 'cerrado');

  return (
    <div className="caso-detail cv-scope">
      <div className="caso-detail-header">
        <button className="btn-back" onClick={onBack}>← Volver</button>
        <div>
          <h2>{caso.numero_caso}</h2>
          <span className={`badge badge-${caso.estado}`}>{ETAPAS.find(e=>e.key===caso.estado)?.label || caso.estado}</span>
        </div>
        <div className="header-actions">
          {saving && <span className="saving-indicator">Guardando...</span>}
          {saved && <span className="saved-indicator">✓ Guardado</span>}
          <button className="btn-primary" onClick={()=>save(caso)} disabled={saving}>Guardar</button>
          {caso.estado !== 'cerrado' && (
            <button className="btn-secondary" onClick={avanzar}>Avanzar Etapa →</button>
          )}
        </div>
      </div>

      {/* Stepper */}
      <div className="stepper">
        {ETAPAS.map((e, i) => (
          <div key={e.key} className={`step ${i <= etapaActual ? 'done' : ''} ${i === etapaActual ? 'active' : ''}`}>
            <div className="step-circle">{i < etapaActual ? '✓' : i+1}</div>
            <div className="step-label">{e.label}</div>
            {i < ETAPAS.length-1 && <div className="step-line" />}
          </div>
        ))}
      </div>

      {/* Formularios con pestañas */}
      <div className="anexos-tabs">
        {ETAPAS_ACTIVAS.map((e, i) => (
          <details key={e.key} open={e.key === caso.estado}>
            <summary className={`anexo-tab ${i <= etapaActual ? 'unlocked' : 'locked'}`}>
              <span className="tab-anexo">{e.anexo}</span>
              <span className="tab-label">{e.label}</span>
              {e.anexo && (
                <button className="btn-print" onClick={(ev)=>{ ev.preventDefault(); ev.stopPropagation();
                  printAnexo(generateAnexoHTML(caso, i+1), `${e.anexo} — ${caso.numero_caso}`);
                }}>🖨 Imprimir</button>
              )}
            </summary>
            <div className="anexo-body">
              {i === 0 && <Anexo1Form data={caso} onChange={ch} alumnos={alumnos} />}
              {i === 1 && <Anexo2Form data={caso} onChange={ch} apoderados={apoderados} />}
              {i === 2 && <Anexo3Form data={caso} onChange={ch} bitacora={caso.bitacora||[]} onAddBitacora={addBitacora} onDeleteBitacora={deleteBitacora} />}
              {i === 3 && <Anexo4Form data={caso} onChange={ch} />}
              {i === 4 && <Anexo5Form data={caso} onChange={ch} />}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function ConvivenciaPage() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [alumnos, setAlumnos] = useState([]);
  const [apoderados, setApoderados] = useState([]);

  useEffect(() => {
    axios.get('/api/convivencia/').then(r => { setCases(r.data); setLoading(false); });
    axios.get('/api/convivencia/alumnos').then(r => setAlumnos(r.data)).catch(() => {});
    axios.get('/api/convivencia/apoderados').then(r => setApoderados(r.data)).catch(() => {});
  }, []);

  const onCreate = async (form) => {
    const r = await axios.post('/api/convivencia/', form);
    setCases(cs => [r.data, ...cs]);
    setSelected(r.data);
  };

  const onUpdate = (updated) => {
    setCases(cs => cs.map(c => c.id === updated.id ? updated : c));
  };

  if (selected) return (
    <CasoDetail caso={selected} onBack={()=>setSelected(null)} onUpdate={(u)=>{onUpdate(u);setSelected(u);}} alumnos={alumnos} apoderados={apoderados} />
  );

  const filtered = cases.filter(c => !filtroEstado || c.estado === filtroEstado);

  return (
    <div className="convivencia-page cv-scope">
      <div className="page-header">
        <h1>📋 Convivencia Escolar</h1>
        <button className="btn-primary" onClick={()=>setShowNew(true)}>+ Nuevo Caso</button>
      </div>

      <div className="filters">
        <select value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {ETAPAS.map(e=><option key={e.key} value={e.key}>{e.label}</option>)}
        </select>
      </div>

      {loading ? <div className="loading">Cargando...</div> : (
        <div className="cases-list">
          {filtered.length === 0 && <div className="empty-state">No hay casos registrados.</div>}
          {filtered.map(c => (
            <div key={c.id} className="case-card" onClick={()=>setSelected(c)}>
              <div className="case-card-header">
                <span className="case-numero">{c.numero_caso}</span>
                <span className={`badge badge-${c.estado}`}>{ETAPAS.find(e=>e.key===c.estado)?.label}</span>
              </div>
              <div className="case-afectados">
                {(c.afectados||[]).map(a=>a.nombre).filter(Boolean).join(', ') || '—'}
                {(c.linked_student_ids?.length > 0 || c.apoderado_user_id) && (
                  <span className="link-pill" style={{ marginLeft: 6 }} title="Visible para el/los apoderado(s) vinculados">🔗 apoderado</span>
                )}
              </div>
              <div className="case-meta">
                <span>{c.tipificacion?.replace(/_/g,' ') || '—'}</span>
                <span>{c.fecha_recepcion ? new Date(c.fecha_recepcion).toLocaleDateString('es-CL') : '—'}</span>
              </div>
              <div className="case-progress">
                {ETAPAS.slice(0,-1).map((e, i) => (
                  <div key={e.key} className={`progress-dot ${i <= etapaIdx(c.estado) ? 'done' : ''}`} title={e.label} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {showNew && <NuevoCasoModal onClose={()=>setShowNew(false)} onCreate={onCreate} alumnos={alumnos} />}
    </div>
  );
}
