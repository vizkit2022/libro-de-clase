// Vista imprimible (solo lectura) de la ficha del alumno.
// Se muestra únicamente con @media print; el usuario puede "Guardar como PDF" desde el diálogo de impresión.
import React from 'react';
import { fmtDate, fmtDateTime, fmtBytes } from './fichaShared';
import { FICHA_SECTIONS, TIPOS_ADMISION, ESTADOS_MATRICULA, AUTH_STATUSES, STATUS_CHIP } from './fichaOptions';

const optLabel = (opts) => (v) => (opts.find(o => o.value === v) || {}).label || v;

function fmtValue(v, type) {
  if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return '';
  if (type === 'bool') return v === true ? 'Sí' : v === false ? 'No' : '';
  if (type === 'date') return fmtDate(v);
  if (typeof type === 'function') return type(v);
  return String(v);
}

// rows: [label, value, type?]; las filas vacías se muestran con "—" para que la ficha impresa sea completa
function DataGrid({ rows, cols = 2 }) {
  return (
    <dl className={`fp-grid cols-${cols}`}>
      {rows.map(([label, value, type]) => (
        <div key={label} className="fp-row">
          <dt>{label}</dt>
          <dd>{fmtValue(value, type) || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

function Block({ title, children }) {
  return (
    <div className="fp-block">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function PersonalPrint({ ficha }) {
  const s = ficha.student || {};
  const p = ficha.profile || {};
  let extra = p.extra;
  if (typeof extra === 'string') { try { extra = JSON.parse(extra); } catch { extra = null; } }
  const extraEntries = extra && typeof extra === 'object'
    ? Object.entries(extra).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    : [];
  return (
    <>
      <Block title="Datos del estudiante">
        <DataGrid rows={[
          [`Nº Identificación (${p.id_type || 'RUN'})`, s.rut],
          ['Nº de Matrícula', p.matricula_number],
          ['Nombres', s.first_name],
          ['Apellidos', s.last_name],
          ['Fecha nacimiento', s.birth_date, 'date'],
          ['Nacionalidad', p.nationality],
          ['Sexo', s.gender],
          ['Género', p.gender_identity === 'Otro' && p.gender_other ? `Otro: ${p.gender_other}` : p.gender_identity],
          ['Nombre social', p.social_name],
          ['Dirección', s.address],
          ['Región', p.region],
          ['Comuna', p.comuna],
          ['Ciudad', p.city],
          ['Email', s.email],
          ['Teléfono', s.phone],
        ]} />
      </Block>
      <Block title="Antecedentes escolares">
        <DataGrid rows={[
          ['Colegio de procedencia', p.previous_school],
          ['Cursos repetidos', p.repeated_courses],
          ['Fecha matrícula', p.enrollment_date, 'date'],
          ['Tipo admisión', p.admission_type, optLabel(TIPOS_ADMISION)],
          ['Estado', p.status, optLabel(ESTADOS_MATRICULA)],
          ['Nº de lista', p.list_order],
          ...(p.status === 'retirado' || p.withdrawal_date || p.withdrawal_reason ? [
            ['Fecha de retiro', p.withdrawal_date, 'date'],
            ['Motivo de retiro', p.withdrawal_reason],
          ] : []),
          ['Cambio de curso', p.course_change],
          ['Etnia', p.ethnicity],
          ['Religión', p.religion],
          ['Bautizado(a)', p.baptized, 'bool'],
          ['PIE', p.pie, 'bool'],
          ...(p.pie ? [['Tipo PIE', p.pie_type], ['Diagnóstico PIE', p.pie_diagnosis]] : []),
          ['NEE', p.nee],
          ['Prioritario', p.priority_status],
          ['Beneficio alimentación (JUNAEB)', p.lunch_benefit, 'bool'],
          ['Datos SIGE', p.sige_data],
          ['Intereses', p.interests],
          ['Observaciones', p.observations],
        ]} />
      </Block>
      <Block title="Datos de emergencia">
        <DataGrid rows={[
          ['Nombre contacto', p.emergency_contact_name],
          ['Teléfono de emergencia', p.emergency_phone],
          ['Teléfono de emergencia 2', p.emergency_phone_2],
          ['Email de emergencia', p.emergency_email],
        ]} />
      </Block>
      <Block title="Retiro y resguardo">
        <DataGrid rows={[
          ['Se retira con', p.pickup_with],
          ['Prohibición judicial', p.judicial_restriction, 'bool'],
          ...(p.judicial_restriction ? [['Detalle prohibición', p.judicial_restriction_detail]] : []),
          ['Carta compromiso', p.has_commitment_letter, 'bool'],
        ]} />
      </Block>
      {extraEntries.length > 0 && (
        <Block title="Otros datos importados">
          <DataGrid rows={extraEntries.map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])} />
        </Block>
      )}
    </>
  );
}

function memberName(m) {
  return m ? (m.full_name || `${m.first_name || ''} ${m.last_name || ''}`.trim()) : '';
}

function FamilyPrint({ ficha }) {
  const family = ficha.family || [];
  const p = ficha.profile || {};
  const titular = family.find(m => m.guardian_role === 'titular');
  const suplente = family.find(m => m.guardian_role === 'suplente');
  return (
    <>
      <Block title="Apoderados">
        <DataGrid rows={[
          ['Apoderado titular', titular ? `${memberName(titular)}${titular.relationship ? ` (${titular.relationship})` : ''}` : ''],
          ['Apoderado suplente', suplente ? `${memberName(suplente)}${suplente.relationship ? ` (${suplente.relationship})` : ''}` : ''],
        ]} />
      </Block>
      <Block title="Hogar del estudiante">
        <DataGrid rows={[
          ['Vive con', p.lives_with],
          ['Nº personas en el hogar', p.household_size],
          ['Nº de hermanos', p.siblings_count],
          ['Nº hermanos en establecimiento', p.siblings_in_school],
          ['Tiene hermano(a) en el colegio', p.has_sibling_in_school, 'bool'],
          ['Hijo(a) de funcionario', p.staff_child, 'bool'],
        ]} />
      </Block>
      {family.length === 0 && <p className="fp-empty">No hay familiares registrados.</p>}
      {family.map(m => {
        const rel = m.relationship === 'Otro' && m.relationship_other ? m.relationship_other : m.relationship;
        const role = m.guardian_role === 'titular' ? ' · Apoderado titular' : m.guardian_role === 'suplente' ? ' · Apoderado suplente' : '';
        return (
          <Block key={m.id} title={`${memberName(m) || 'Familiar'}${rel ? ` — ${rel}` : ''}${role}`}>
            <DataGrid rows={[
              [`Nº Identificación (${m.id_type || 'RUN'})`, m.rut],
              ['Fecha nacimiento', m.birth_date, 'date'],
              ['Nacionalidad', m.nationality],
              ['Sexo', m.sex],
              ['Estado civil', m.marital_status],
              ['Teléfono', m.phone],
              ['Teléfono trabajo', m.work_phone],
              ['Correo electrónico', m.email],
              ['Religión', m.religion],
              ['Dirección', [m.address, m.comuna].filter(Boolean).join(', ')],
              ['Estudios', m.education_level],
              ['Profesión', m.profession],
              ['Ocupación o trabajo', m.occupation],
              ['Lugar de trabajo', m.workplace],
              ['Autoriza retirar alumno', m.can_pickup, 'bool'],
              ['Vive con el alumno', m.lives_with_student, 'bool'],
              ['Jefe(a) de hogar', m.is_household_head, 'bool'],
              ['Tutor económico', m.is_economic_tutor, 'bool'],
              ['Contacto de emergencia', m.is_emergency_contact, 'bool'],
              ['Notas', m.notes],
            ]} />
          </Block>
        );
      })}
    </>
  );
}

function MedicalPrint({ ficha }) {
  const md = ficha.medical || {};
  const problems = [
    ['problem_visual', 'Visuales'], ['problem_auditory', 'Auditivos'],
    ['problem_cardiac', 'Cardiacos'], ['problem_spine', 'Columna'],
  ].filter(([k]) => md[k] === true).map(([, l]) => l);
  return (
    <>
      <Block title="Cuidados y condiciones">
        <DataGrid rows={[
          ['Contraindicaciones médicas', md.contraindications],
          ['Alérgico a', md.allergies],
          ['Enfermedades crónicas', md.chronic_diseases],
          ['Medicamentos', md.medications],
          ['Observaciones / condición de especial cuidado', md.special_care],
        ]} />
      </Block>
      <Block title="Problemas">
        <DataGrid rows={[
          ['Problemas de salud', problems.join(', ') || 'Ninguno marcado'],
          ['Otros', md.other_problems],
        ]} />
      </Block>
      <Block title="Salud y medidas">
        <DataGrid rows={[
          ['Grupo sanguíneo', md.blood_type],
          ['Previsión', md.health_insurance],
          ['Consultorio / Clínica', md.health_provider],
          ['Especialistas', md.specialists],
          ['Estatura (cm)', md.height_cm],
          ['Peso (kg)', md.weight_kg],
          ['Cintura (cm)', md.waist_cm],
          ['Talla', md.clothing_size],
          ['Vacunación COVID', md.covid_vaccination],
          ['Notas', md.notes],
        ]} />
      </Block>
    </>
  );
}

function PermissionsPrint({ ficha }) {
  const auths = ficha.authorizations || [];
  if (!auths.length) return <p className="fp-empty">No hay autorizaciones registradas.</p>;
  return (
    <>
      {auths.map(a => {
        const st = AUTH_STATUSES.find(x => x.value === (a.status || 'pendiente')) || AUTH_STATUSES[0];
        return (
          <div key={a.id} className="fp-block fp-auth">
            <h3>{a.title} <span className="fp-tag">{st.icon} {st.label}</span></h3>
            {a.description && <p className="fp-desc">{a.description}</p>}
            <div className="fp-auth-body">
              <DataGrid rows={[
                ['Firmado por', a.signed_by_name],
                ['RUT firmante', a.signed_by_rut],
                ['Fecha', a.signed_at, 'date'],
                ['Notas', a.notes],
              ]} />
              <div className="fp-sig">
                {a.signature_image
                  ? <img src={a.signature_image} alt={`Firma de ${a.signed_by_name || 'apoderado'}`} />
                  : <span>Sin firma registrada</span>}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function DocumentsPrint({ ficha }) {
  const docs = ficha.documents || [];
  if (!docs.length) return <p className="fp-empty">No hay documentos adjuntos.</p>;
  return (
    <table className="fp-table">
      <thead>
        <tr><th>Documento</th><th>Archivo</th><th>Categoría</th><th>Registro</th></tr>
      </thead>
      <tbody>
        {docs.map(d => (
          <tr key={d.id}>
            <td><strong>{d.title || d.filename}</strong>{d.description ? <div className="fp-small">{d.description}</div> : null}</td>
            <td>{d.filename}{d.size_bytes ? <div className="fp-small">{fmtBytes(d.size_bytes)}</div> : null}</td>
            <td>{d.category || 'Otro'}</td>
            <td>{fmtDateTime(d.created_at)}{d.uploaded_by_name ? <div className="fp-small">por {d.uploaded_by_name}</div> : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const RENDERERS = {
  personal: PersonalPrint,
  familia: FamilyPrint,
  medico: MedicalPrint,
  permisos: PermissionsPrint,
  archivos: DocumentsPrint,
};

/**
 * scope: 'all' (las cinco secciones) o la key de una sección.
 * header: { age, sexIcon, statusLabel, guardian, average }
 */
export default function FichaPrintView({ ficha, scope, school, photoUrl, header }) {
  const s = ficha.student || {};
  const summary = ficha.summary || {};
  const sections = scope === 'all' ? FICHA_SECTIONS : FICHA_SECTIONS.filter(x => x.key === scope);
  const today = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const status = STATUS_CHIP[header.status] || STATUS_CHIP.matriculado;
  return (
    <div className="ficha-print" aria-hidden="true">
      <div className="fp-top">
        <span>{school?.name || ''}</span>
        <span>Ficha del estudiante · emitida el {today}</span>
      </div>
      <div className="fp-head">
        <div className="fp-photo">
          {photoUrl ? <img src={photoUrl} alt="" /> : <span>Sin foto</span>}
        </div>
        <div className="fp-head-main">
          <h1><strong>{s.first_name}</strong> {s.last_name}</h1>
          <p className="fp-sub">
            {[
              summary.course_name,
              header.age != null ? `${header.sexIcon ? `${header.sexIcon} ` : ''}${header.age} años${s.birth_date ? ` (${fmtDate(s.birth_date)})` : ''}` : (s.birth_date ? fmtDate(s.birth_date) : ''),
              status.label,
            ].filter(Boolean).join('  ·  ')}
          </p>
          <DataGrid cols={2} rows={[
            ['RUN', s.rut],
            ['Dirección', s.address],
            ['RUN Apoderado', header.guardian?.rut],
            ['Fono Apoderado', header.guardian?.phone],
            ['Apoderado titular', header.guardian?.name],
            ['Prom. Notas', header.average == null ? '' : Number(header.average).toFixed(1)],
          ]} />
        </div>
      </div>
      {sections.map(sec => {
        const R = RENDERERS[sec.key];
        return (
          <section key={sec.key} className="fp-section">
            <h2>{sec.label}</h2>
            <R ficha={ficha} />
          </section>
        );
      })}
    </div>
  );
}
