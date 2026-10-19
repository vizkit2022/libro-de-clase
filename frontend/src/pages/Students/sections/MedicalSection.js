import React, { useMemo } from 'react';
import axios from 'axios';
import {
  pickForm, toPayload, useCardForm, makeBinder, useSaver, FichaCard, FF, Check,
} from '../fichaShared';
import { GRUPOS_SANGUINEOS, PREVISIONES } from '../fichaOptions';

const CARE_SCHEMA = {
  contraindications: 'text', allergies: 'text', chronic_diseases: 'text', medications: 'text', special_care: 'text',
};
const PROBLEMS_SCHEMA = {
  problem_visual: 'bool', problem_auditory: 'bool', problem_cardiac: 'bool', problem_spine: 'bool', other_problems: 'text',
};
const HEALTH_SCHEMA = {
  blood_type: 'text', health_insurance: 'text', health_provider: 'text', height_cm: 'number', weight_kg: 'number',
  waist_cm: 'number', clothing_size: 'text', specialists: 'text', covid_vaccination: 'text', notes: 'text',
};

function useMedicalCard(schema, { ficha, studentId, applyMedical, showToast }) {
  const source = useMemo(() => pickForm(ficha.medical, schema), [ficha.medical, schema]);
  const card = useCardForm(source);
  const [saving, run] = useSaver(showToast);
  const save = () => run(async () => {
    const { data } = await axios.put(`/api/students/${studentId}/medical`, toPayload(card.form, schema));
    applyMedical(data && data.medical ? data.medical : data);
  });
  return { ...card, saving, save };
}

function CareCard(props) {
  const { canEdit } = props;
  const { form, setField, dirty, saving, save } = useMedicalCard(CARE_SCHEMA, props);
  const b = makeBinder('med-care', form, setField, canEdit);
  return (
    <FichaCard icon="🤲" title="Cuidados" canEdit={canEdit} onSave={save} dirty={dirty} saving={saving}>
      <div className="ff-grid one">
        <FF b={b} name="contraindications" label="Contraindic. médicas" placeholder="Ej: NO" />
        <FF b={b} name="allergies" label="Alérgico a" placeholder="Ej: Penicilina, maní" />
        <FF b={b} name="chronic_diseases" label="Enfermedades crónicas" />
        <FF b={b} name="medications" label="Medicamentos" placeholder="Nombre, dosis y horario" />
        <div className="ff-divider full" />
        <FF b={b} name="special_care" type="area" rows={3} full stack
          label="Observaciones Médicas o Enfermedad/Condición importante para tener especial cuidado (TEA, Asma, Dificultades Articulatorias, Déficit Atencional u otros)" />
      </div>
    </FichaCard>
  );
}

function ProblemsCard(props) {
  const { canEdit } = props;
  const { form, setField, dirty, saving, save } = useMedicalCard(PROBLEMS_SCHEMA, props);
  const b = makeBinder('med-prob', form, setField, canEdit);
  const items = [
    ['problem_visual', 'Visuales'],
    ['problem_auditory', 'Auditivos'],
    ['problem_cardiac', 'Cardiacos'],
    ['problem_spine', 'Columna'],
  ];
  return (
    <FichaCard icon="➕" title="Problemas" canEdit={canEdit} onSave={save} dirty={dirty} saving={saving} className="fc-problems">
      <div className="fcheck-list">
        {items.map(([name, label]) => {
          const p = b(name);
          return <Check key={name} id={p.id} value={p.value} disabled={p.disabled} label={label} onChange={p.onChange} />;
        })}
      </div>
      <div className="ff-grid one" style={{ marginTop: 14 }}>
        <FF b={b} name="other_problems" label="Otros" type="area" rows={2} placeholder="Otros problemas de salud" />
      </div>
    </FichaCard>
  );
}

function HealthCard(props) {
  const { canEdit } = props;
  const { form, setField, dirty, saving, save } = useMedicalCard(HEALTH_SCHEMA, props);
  const b = makeBinder('med-sal', form, setField, canEdit);
  return (
    <FichaCard icon="🩺" title="Datos de Salud" canEdit={canEdit} onSave={save} dirty={dirty} saving={saving}>
      <div className="ff-grid">
        <FF b={b} name="blood_type" label="Grupo sanguíneo" type="select" options={GRUPOS_SANGUINEOS} />
        <FF b={b} name="health_insurance" label="Previsión" listId="ficha-previsiones" placeholder="Fonasa, Isapre…" />
        <FF b={b} name="health_provider" label="Consultorio / Clínica" />
        <FF b={b} name="specialists" label="Especialistas" placeholder="Ej: Neurólogo, fonoaudióloga" />
        <FF b={b} name="height_cm" label="Estatura (cm)" type="number" min="0" step="0.1" />
        <FF b={b} name="weight_kg" label="Peso (kg)" type="number" min="0" step="0.1" />
        <FF b={b} name="waist_cm" label="Cintura (cm)" type="number" min="0" step="0.1" />
        <FF b={b} name="clothing_size" label="Talla" placeholder="Ej: 12, M" />
        <FF b={b} name="covid_vaccination" label="Vacunación COVID" />
        <FF b={b} name="notes" label="Notas" type="area" full rows={3} />
      </div>
      <datalist id="ficha-previsiones">
        {PREVISIONES.map(p => <option key={p} value={p} />)}
      </datalist>
    </FichaCard>
  );
}

export default function MedicalSection(props) {
  return (
    <>
      <div className="fc-row">
        <CareCard {...props} />
        <ProblemsCard {...props} />
      </div>
      <HealthCard {...props} />
    </>
  );
}
