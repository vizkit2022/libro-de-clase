import React, { useMemo, useState } from 'react';
import axios from 'axios';
import {
  pickForm, toPayload, useCardForm, makeBinder, useSaver, errMsg,
  FichaCard, FF, Field, Sel,
} from '../fichaShared';
import { ProfileCard } from './PersonalSection';
import {
  ID_TYPES, PARENTESCOS, NACIONALIDADES, SEXOS, ESTADOS_CIVILES, NIVELES_ESTUDIO, VIVE_CON, COMUNAS_RM,
} from '../fichaOptions';

const HOGAR_SCHEMA = {
  lives_with: 'text', household_size: 'number', siblings_count: 'number', siblings_in_school: 'number',
  has_sibling_in_school: 'bool', staff_child: 'bool',
};

const MEMBER_SCHEMA = {
  relationship: 'text', relationship_other: 'text', id_type: 'text', rut: 'text',
  first_name: 'text', last_name: 'text', birth_date: 'date', nationality: 'text', sex: 'text',
  marital_status: 'text', religion: 'text', phone: 'text', work_phone: 'text', email: 'text',
  address: 'text', comuna: 'text', education_level: 'text', profession: 'text', occupation: 'text',
  workplace: 'text', is_household_head: 'bool', lives_with_student: 'bool', can_pickup: 'bool',
  is_economic_tutor: 'bool', is_emergency_contact: 'bool', notes: 'text',
};

const MEMBER_ICON = { Madre: '👩', Padre: '👨', 'Abuelo/a': '🧓', 'Tío/a': '🧑', 'Hermano/a': '🧒', 'Tutor legal': '⚖️' };

const memberLabel = (m) => {
  const rel = m.relationship === 'Otro' && m.relationship_other ? m.relationship_other : (m.relationship || 'Familiar');
  const name = m.full_name || `${m.first_name || ''} ${m.last_name || ''}`.trim();
  return `${rel} (${name})`;
};

/* ───────── Apoderados ───────── */
function GuardiansCard({ family, canEdit, showToast, reload, studentId }) {
  const source = useMemo(() => {
    const t = family.find(m => m.guardian_role === 'titular');
    const s = family.find(m => m.guardian_role === 'suplente');
    return { titular: t ? String(t.id) : '', suplente: s ? String(s.id) : '' };
  }, [family]);
  const { form, setField, dirty } = useCardForm(source);
  const [saving, run] = useSaver(showToast);
  const b = makeBinder('apo', form, setField, canEdit && family.length > 0);
  const options = family.map(m => ({ value: String(m.id), label: memberLabel(m) }));

  const save = () => {
    if (form.titular && form.titular === form.suplente) {
      showToast('El apoderado titular y el suplente deben ser personas distintas', 'error');
      return;
    }
    run(async () => {
      await axios.put(`/api/students/${studentId}/guardians`, {
        titular_member_id: form.titular ? Number(form.titular) : null,
        suplente_member_id: form.suplente ? Number(form.suplente) : null,
      });
      await reload();
    }, 'Apoderados actualizados');
  };

  return (
    <FichaCard icon="👪" title="Apoderados" canEdit={canEdit} onSave={save} dirty={dirty} saving={saving}>
      <div className="ff-grid one">
        <Field label="Apoderado Titular" htmlFor="apo-titular" required>
          <Sel {...b('titular')} options={options} placeholder={family.length ? 'Seleccionar…' : 'Sin familiares registrados'} />
        </Field>
        <Field label="Apoderado Suplente" htmlFor="apo-suplente">
          <Sel {...b('suplente')} options={options.filter(o => o.value !== form.titular)}
            placeholder={family.length ? 'Sin suplente' : 'Sin familiares registrados'} />
        </Field>
      </div>
      <div className="fc-alert" role="note">
        <strong>Atención.</strong>
        <p>Para seleccionar los apoderados, debes primero agregar los datos de la familia del estudiante en la parte inferior de esta sección.</p>
      </div>
    </FichaCard>
  );
}

/* ───────── Modal crear acceso ───────── */
function AccessModal({ member, studentId, onClose, onDone, showToast }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = password.trim() ? { password: password.trim() } : {};
      const { data } = await axios.post(`/api/students/${studentId}/family/${member.id}/access`, body);
      const email = data?.user?.email || member.email;
      if (data?.created) showToast(`Cuenta creada para ${email}. Contraseña inicial: ${password.trim() || 'Apoderado2026!'}`);
      else showToast(`Se vinculó la cuenta existente ${email}`);
      onDone();
    } catch (err) {
      showToast(errMsg(err, 'No se pudo crear el acceso'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }} role="dialog" aria-modal="true" aria-labelledby="access-title">
        <div className="modal-header">
          <h3 id="access-title">🔑 Crear acceso de apoderado</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            <p className="fc-note" style={{ marginTop: 0 }}>
              Se creará (o vinculará, si ya existe) una cuenta de <strong>apoderado</strong> para <strong>{member.full_name || member.first_name}</strong> con el correo:
            </p>
            <p className="access-email">✉️ {member.email}</p>
            <div className="form-group" style={{ marginTop: 14 }}>
              <label htmlFor="access-pw">Contraseña inicial (opcional)</label>
              <input id="access-pw" type="text" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Apoderado2026! (por defecto)" autoComplete="off" />
            </div>
            <p className="fc-note">Si la cuenta ya existe, se mantiene su contraseña actual y solo se vincula al alumno.</p>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Creando…' : 'Crear acceso'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ───────── Miembro de la familia ───────── */
function MemberCard({ member, draft, canEdit, showToast, reload, studentId, onDiscard, onCreated }) {
  const isNew = !member;
  const src = member || draft;
  const source = useMemo(() => pickForm(src, MEMBER_SCHEMA), [src]);
  const { form, setField, dirty } = useCardForm(source);
  const [saving, run] = useSaver(showToast);
  const [deleting, setDeleting] = useState(false);
  const [showAccess, setShowAccess] = useState(false);
  const prefix = isNew ? `fam-new-${draft.key}` : `fam-${member.id}`;
  const b = makeBinder(prefix, form, setField, canEdit);

  const rel = form.relationship === 'Otro' && form.relationship_other ? form.relationship_other : form.relationship;
  const title = isNew ? `Nuevo miembro de la familia${rel ? ` · ${rel}` : ''}` : `Datos ${rel || 'Familiar'}`;
  const icon = MEMBER_ICON[form.relationship] || '🧑';

  const save = () => {
    if (!form.first_name.trim()) { showToast('El nombre del familiar es obligatorio', 'error'); return; }
    if (!form.relationship) { showToast('Indica el parentesco con el estudiante', 'error'); return; }
    const payload = toPayload(form, MEMBER_SCHEMA);
    run(async () => {
      if (isNew) {
        await axios.post(`/api/students/${studentId}/family`, payload);
        onCreated && onCreated();
      } else {
        await axios.put(`/api/students/${studentId}/family/${member.id}`, payload);
      }
      await reload();
    }, isNew ? 'Familiar agregado' : 'Datos del familiar guardados');
  };

  const remove = async () => {
    if (isNew) { onDiscard && onDiscard(); return; }
    if (!window.confirm(`¿Eliminar a ${member.full_name || member.first_name} de la familia del estudiante? Esta acción no se puede deshacer.`)) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/students/${studentId}/family/${member.id}`);
      showToast('Familiar eliminado');
      await reload();
    } catch (err) {
      showToast(errMsg(err, 'No se pudo eliminar'), 'error');
      setDeleting(false);
    }
  };

  const openAccess = () => {
    if (dirty) { showToast('Guarda los cambios del familiar antes de crear el acceso', 'error'); return; }
    if (!member.email) { showToast('El familiar debe tener un correo electrónico para crear su acceso', 'error'); return; }
    setShowAccess(true);
  };

  const badge = !isNew && member.guardian_role ? (
    <span className={`fchip ${member.guardian_role === 'titular' ? 'fchip-primary' : 'fchip-soft'}`}>
      {member.guardian_role === 'titular' ? 'Apoderado titular' : 'Apoderado suplente'}
    </span>
  ) : null;

  const actions = (
    <>
      {!isNew && member.has_access && (
        <span className="fchip fchip-ok" title={member.user_email ? `Cuenta: ${member.user_email}` : undefined}>Acceso activo ✓</span>
      )}
      {!isNew && !member.has_access && canEdit && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={openAccess}>🔑 Crear acceso apoderado</button>
      )}
      {canEdit && (
        <button type="button" className="btn btn-danger btn-sm" onClick={remove} disabled={deleting}>
          {isNew ? 'Descartar' : deleting ? 'Eliminando…' : '🗑️ Eliminar'}
        </button>
      )}
    </>
  );

  return (
    <FichaCard icon={icon} title={title} badge={badge} actions={actions} canEdit={canEdit} onSave={save}
      dirty={isNew ? true : dirty} saving={saving} className={isNew ? 'fc-new' : ''}>
      <div className="ff-grid">
        <Field label="Nº Identificación" htmlFor={`${prefix}-rut`}>
          <div className="fi-combo">
            <Sel {...b('id_type')} options={ID_TYPES} placeholder="Tipo" className="fi fi-type" />
            <input className="fi" id={`${prefix}-rut`} value={form.rut} disabled={!canEdit} placeholder="12.345.678-9"
              aria-label="Número de identificación del familiar" onChange={e => setField('rut', e.target.value)} />
          </div>
        </Field>
        <FF b={b} name="relationship" label="Parentesco con el Estudiante" type="select" options={PARENTESCOS} required />
        {form.relationship === 'Otro' && <FF b={b} name="relationship_other" label="Parentesco (otro)" placeholder="Especificar" />}
        <FF b={b} name="first_name" label="Nombres" required />
        <FF b={b} name="last_name" label="Apellidos" />
        <FF b={b} name="birth_date" label="Fecha nacimiento" type="date" />
        <FF b={b} name="nationality" label="Nacionalidad" type="select" options={NACIONALIDADES} />
        <FF b={b} name="sex" label="Sexo" type="radios" options={SEXOS} />
        <FF b={b} name="marital_status" label="Estado civil" type="select" options={ESTADOS_CIVILES} />
        <FF b={b} name="phone" label="Teléfono" type="tel" placeholder="+56 9 1234 5678" />
        <FF b={b} name="work_phone" label="Teléfono trabajo" type="tel" />
        <FF b={b} name="email" label="Correo electrónico" type="email" hint={!isNew && !member.has_access ? 'Necesario para crear su acceso de apoderado' : undefined} />
        <FF b={b} name="religion" label="Religión" />
        <FF b={b} name="address" label="Dirección" />
        <FF b={b} name="comuna" label="Comuna" listId="ficha-comunas-fam" />
        <FF b={b} name="education_level" label="Estudios" type="select" options={NIVELES_ESTUDIO} />
        <FF b={b} name="profession" label="Profesión" />
        <FF b={b} name="occupation" label="Ocupación o Trabajo" />
        <FF b={b} name="workplace" label="Lugar de trabajo" />
        <FF b={b} name="can_pickup" label="Autoriza retirar alumno" type="yesno" />
        <FF b={b} name="lives_with_student" label="Vive con el alumno" type="yesno" />
        <FF b={b} name="is_household_head" label="Jefe(a) de hogar" type="yesno" />
        <FF b={b} name="is_economic_tutor" label="Tutor económico" type="yesno" />
        <FF b={b} name="is_emergency_contact" label="Contacto de emergencia" type="yesno" />
        <FF b={b} name="notes" label="Notas" type="area" full rows={2} />
      </div>
      {showAccess && (
        <AccessModal member={member} studentId={studentId} showToast={showToast}
          onClose={() => setShowAccess(false)} onDone={() => { setShowAccess(false); reload(); }} />
      )}
    </FichaCard>
  );
}

let draftSeq = 0;

export default function FamilySection(props) {
  const { ficha, canEdit } = props;
  const family = useMemo(() => ficha.family || [], [ficha.family]);
  const [drafts, setDrafts] = useState([]);

  const addDraft = () => {
    const has = (r) => family.some(m => m.relationship === r) || drafts.some(d => d.relationship === r);
    const relationship = !has('Madre') ? 'Madre' : !has('Padre') ? 'Padre' : '';
    draftSeq += 1;
    setDrafts(d => [...d, { key: draftSeq, relationship, id_type: 'RUN', nationality: 'Chile' }]);
  };
  const dropDraft = (key) => setDrafts(d => d.filter(x => x.key !== key));

  return (
    <>
      <div className="fc-row">
        <GuardiansCard {...props} family={family} />
        <ProfileCard {...props} icon="🏠" title="Hogar del Estudiante" schema={HOGAR_SCHEMA} prefix="hog">
          {(b) => (
            <>
              <FF b={b} name="lives_with" label="Vive con" type="select" options={VIVE_CON} />
              <FF b={b} name="household_size" label="Nº Personas en el hogar" type="number" min="0" step="1" />
              <FF b={b} name="siblings_count" label="Nº de Hermanos" type="number" min="0" step="1" />
              <FF b={b} name="siblings_in_school" label="Nº Hermanos en establecimiento" type="number" min="0" step="1" />
              <FF b={b} name="has_sibling_in_school" label="Tiene hermano(a) en el colegio" type="yesno" />
              <FF b={b} name="staff_child" label="Hijo(a) de funcionario" type="yesno" />
            </>
          )}
        </ProfileCard>
      </div>

      {family.length === 0 && drafts.length === 0 && (
        <div className="fc fc-empty">
          <div className="fc-empty-icon" aria-hidden="true">👨‍👩‍👧</div>
          <p><strong>Aún no hay familiares registrados.</strong></p>
          <p className="fc-note">{canEdit ? 'Agrega a la madre, el padre u otros familiares para poder asignar apoderados.' : 'La ficha no tiene datos de familia.'}</p>
        </div>
      )}

      {family.map(m => (
        <MemberCard key={m.id} {...props} member={m} />
      ))}
      {drafts.map(d => (
        <MemberCard key={`draft-${d.key}`} {...props} member={null} draft={d}
          onDiscard={() => dropDraft(d.key)} onCreated={() => dropDraft(d.key)} />
      ))}

      {canEdit && (
        <button type="button" className="fbtn-add" onClick={addDraft}>+ Agregar miembro de la familia</button>
      )}
      <datalist id="ficha-comunas-fam">
        {COMUNAS_RM.map(c => <option key={c} value={c} />)}
      </datalist>
    </>
  );
}
