import React, { useMemo } from 'react';
import {
  pickForm, toPayload, useCardForm, makeBinder, useSaver, saveProfileParts,
  FichaCard, FF, Field, Sel,
} from '../fichaShared';
import {
  ID_TYPES, NACIONALIDADES, REGIONES_CHILE, COMUNAS_RM, SEXOS, GENEROS,
  TIPOS_ADMISION, ESTADOS_MATRICULA, PRIORIDAD,
} from '../fichaOptions';

const USER_SCHEMA = {
  first_name: 'text', last_name: 'text', rut: 'text', birth_date: 'date',
  gender: 'text', address: 'text', phone: 'text', email: 'text',
};

const STUDENT_PROFILE_SCHEMA = {
  id_type: 'text', matricula_number: 'text', list_order: 'number', nationality: 'text',
  gender_identity: 'text', gender_other: 'text', social_name: 'text',
  region: 'text', comuna: 'text', city: 'text', previous_school: 'text', repeated_courses: 'text',
  enrollment_date: 'date', admission_type: 'text', status: 'text',
  withdrawal_date: 'date', withdrawal_reason: 'text', course_change: 'text',
  ethnicity: 'text', religion: 'text', baptized: 'bool',
  pie: 'bool', pie_type: 'text', pie_diagnosis: 'text', nee: 'text', priority_status: 'text',
  lunch_benefit: 'bool', sige_data: 'text',
  interests: 'text', observations: 'text',
};

const EMERGENCY_SCHEMA = {
  emergency_contact_name: 'text', emergency_phone: 'text', emergency_phone_2: 'text', emergency_email: 'text',
};

const PICKUP_SCHEMA = {
  pickup_with: 'text', judicial_restriction: 'bool', judicial_restriction_detail: 'text', has_commitment_letter: 'bool',
};

function Divider({ children }) {
  return <div className="ff-divider full"><span>{children}</span></div>;
}

/* ───────── Datos del Estudiante ───────── */
function StudentCard({ ficha, canEdit, showToast, applyFicha, reload, studentId }) {
  const source = useMemo(() => ({
    ...pickForm(ficha.student, USER_SCHEMA),
    ...pickForm(ficha.profile, STUDENT_PROFILE_SCHEMA),
  }), [ficha.student, ficha.profile]);
  const { form, setField, dirty } = useCardForm(source);
  const [saving, run] = useSaver(showToast);
  const b = makeBinder('est', form, setField, canEdit);

  const save = () => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      showToast('Nombres y Apellidos son obligatorios', 'error');
      return;
    }
    run(() => saveProfileParts(studentId, {
      user: toPayload(form, USER_SCHEMA),
      profile: toPayload(form, STUDENT_PROFILE_SCHEMA),
    }, applyFicha, reload));
  };

  return (
    <FichaCard icon="🪪" title="Datos del Estudiante" canEdit={canEdit} onSave={save} dirty={dirty} saving={saving}>
      <div className="ff-grid">
        <Divider>Identificación</Divider>
        <Field label="Nº Identificación" htmlFor="est-rut" required>
          <div className="fi-combo">
            <Sel {...b('id_type')} id="est-id_type" options={ID_TYPES} placeholder="Tipo" className="fi fi-type" />
            <input className="fi" id="est-rut" value={form.rut} disabled={!canEdit} placeholder="12.345.678-9"
              aria-label="Número de identificación" onChange={e => setField('rut', e.target.value)} />
          </div>
        </Field>
        <FF b={b} name="matricula_number" label="Nº de Matrícula" />
        <FF b={b} name="first_name" label="Nombres" required />
        <FF b={b} name="last_name" label="Apellidos" required />
        <FF b={b} name="birth_date" label="Fecha nacimiento" type="date" required />
        <FF b={b} name="nationality" label="Nacionalidad" type="select" options={NACIONALIDADES} />
        <FF b={b} name="gender" label="Sexo" type="radios" options={SEXOS} required />
        <FF b={b} name="gender_identity" label="Género" type="radios" options={GENEROS} />
        {form.gender_identity === 'Otro' && <FF b={b} name="gender_other" label="Género (otro)" placeholder="Especificar" />}
        <FF b={b} name="social_name" label="Nombre social" />

        <Divider>Contacto y domicilio</Divider>
        <FF b={b} name="address" label="Dirección" placeholder="Calle, número, depto." />
        <FF b={b} name="region" label="Región" type="select" options={REGIONES_CHILE} />
        <FF b={b} name="comuna" label="Comuna" listId="ficha-comunas-rm" placeholder="Escribe o elige una comuna" />
        <FF b={b} name="city" label="Ciudad" />
        <FF b={b} name="email" label="Email" type="email" />
        <FF b={b} name="phone" label="Teléfono" type="tel" placeholder="+56 9 1234 5678" />

        <Divider>Escolaridad</Divider>
        <FF b={b} name="previous_school" label="Colegio de procedencia" />
        <FF b={b} name="repeated_courses" label="Cursos repetidos" placeholder='Ej: 0 o "1 BÁSICO"' />
        <FF b={b} name="enrollment_date" label="Fecha matrícula" type="date" />
        <FF b={b} name="admission_type" label="Tipo admisión" type="select" options={TIPOS_ADMISION} />
        <FF b={b} name="status" label="Estado" type="select" options={ESTADOS_MATRICULA} />
        <FF b={b} name="list_order" label="Nº de lista" type="number" min="0" step="1" />
        {(form.status === 'retirado' || form.withdrawal_date || form.withdrawal_reason) && (
          <>
            <FF b={b} name="withdrawal_date" label="Fecha de retiro" type="date" />
            <FF b={b} name="withdrawal_reason" label="Motivo de retiro" />
          </>
        )}
        <FF b={b} name="course_change" label="Cambio de curso" />

        <Divider>Antecedentes y programas de apoyo</Divider>
        <FF b={b} name="ethnicity" label="Etnia" placeholder="Ej: Mapuche, Ninguna" />
        <FF b={b} name="religion" label="Religión" />
        <FF b={b} name="baptized" label="Bautizado(a)" type="yesno" />
        <FF b={b} name="pie" label="PIE" type="yesno" />
        {form.pie === true && (
          <>
            <FF b={b} name="pie_type" label="Tipo PIE" placeholder="Permanente / Transitorio" />
            <FF b={b} name="pie_diagnosis" label="Diagnóstico PIE" />
          </>
        )}
        <FF b={b} name="nee" label="NEE" placeholder="Necesidades educativas especiales" />
        <FF b={b} name="priority_status" label="Prioritario" type="select" options={PRIORIDAD} />
        <FF b={b} name="lunch_benefit" label="Beneficio alimentación (JUNAEB)" type="yesno" />
        <FF b={b} name="sige_data" label="Datos SIGE" />

        <Divider>Observaciones e intereses</Divider>
        <FF b={b} name="interests" label="Intereses" type="area" full rows={2} />
        <FF b={b} name="observations" label="Observaciones" type="area" full rows={3} />
      </div>
      <datalist id="ficha-comunas-rm">
        {COMUNAS_RM.map(c => <option key={c} value={c} />)}
      </datalist>
    </FichaCard>
  );
}

/* ───────── Tarjetas simples de perfil ───────── */
export function ProfileCard({ icon, title, schema, prefix, ficha, canEdit, showToast, applyFicha, reload, studentId, children }) {
  const source = useMemo(() => pickForm(ficha.profile, schema), [ficha.profile, schema]);
  const { form, setField, dirty } = useCardForm(source);
  const [saving, run] = useSaver(showToast);
  const b = makeBinder(prefix, form, setField, canEdit);
  const save = () => run(() => saveProfileParts(studentId, { profile: toPayload(form, schema) }, applyFicha, reload));
  return (
    <FichaCard icon={icon} title={title} canEdit={canEdit} onSave={save} dirty={dirty} saving={saving}>
      <div className="ff-grid one">{children(b, form)}</div>
    </FichaCard>
  );
}

function ExtraDataCard({ extra }) {
  const entries = useMemo(() => {
    if (!extra) return [];
    let obj = extra;
    if (typeof extra === 'string') {
      try { obj = JSON.parse(extra); } catch { return []; }
    }
    if (!obj || typeof obj !== 'object') return [];
    return Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '');
  }, [extra]);
  if (!entries.length) return null;
  return (
    <details className="fc fc-details">
      <summary className="fc-head">
        <h3 className="fc-title"><span className="fc-icon" aria-hidden="true">🗃️</span>Otros datos importados ({entries.length})</h3>
      </summary>
      <div className="fc-body">
        <p className="fc-note">Columnas del Libro de Matrícula que no tienen un campo propio en la ficha. Se conservan como referencia.</p>
        <dl className="extra-list">
          {entries.map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd></div>
          ))}
        </dl>
      </div>
    </details>
  );
}

export default function PersonalSection(props) {
  const { ficha } = props;
  return (
    <>
      <StudentCard {...props} />
      <div className="fc-row">
        <ProfileCard {...props} icon="📞" title="Datos de Emergencia" schema={EMERGENCY_SCHEMA} prefix="emg">
          {(b) => (
            <>
              <FF b={b} name="emergency_contact_name" label="Nombre contacto" />
              <FF b={b} name="emergency_phone" label="Teléfono de emergencia" type="tel" />
              <FF b={b} name="emergency_phone_2" label="Teléfono de emergencia 2" type="tel" />
              <FF b={b} name="emergency_email" label="Email de emergencia" type="email" />
            </>
          )}
        </ProfileCard>
        <ProfileCard {...props} icon="🛡️" title="Retiro y resguardo" schema={PICKUP_SCHEMA} prefix="ret">
          {(b, form) => (
            <>
              <FF b={b} name="pickup_with" label="El/La estudiante se retira con" type="area" rows={2} />
              <FF b={b} name="judicial_restriction" label="Prohibición judicial" type="yesno" />
              {form.judicial_restriction === true && (
                <FF b={b} name="judicial_restriction_detail" label="Detalle prohibición" type="area" rows={2}
                  placeholder="Persona(s) con prohibición de acercamiento, tribunal, vigencia…" />
              )}
              <FF b={b} name="has_commitment_letter" label="Carta compromiso" type="yesno" />
            </>
          )}
        </ProfileCard>
      </div>
      <ExtraDataCard extra={ficha.profile?.extra} />
    </>
  );
}
