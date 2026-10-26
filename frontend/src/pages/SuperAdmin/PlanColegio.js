import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { msgError } from '../../components/UI/Modal';
import '../../components/UI/ui.css';
import '../Plan/PlanPage.css';
import { EstadoPlan, clp, fecha, ESTADO_COBRO } from '../Plan/PlanPage';

const hoyMas = (dias) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};

const sumarDias = (iso, dias) => {
  const base = iso && iso >= hoyMas(0) ? new Date(`${iso}T12:00:00`) : new Date();
  base.setDate(base.getDate() + dias);
  return base.toISOString().slice(0, 10);
};

// Plan comercial del colegio: lo define el super admin y se publica en Mercado Pago.
export default function PlanColegio({ schoolId, onCambio }) {
  const [datos, setDatos] = useState(null);
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState(null);

  const cargar = useCallback(() => {
    axios.get(`/api/payments/schools/${schoolId}/plan`).then(r => {
      setDatos(r.data);
      setForm({
        nombre: r.data.plan.nombre || 'Plan Recreo Edu',
        monto: r.data.plan.monto || '',
        frecuencia: r.data.plan.frecuencia || 'mensual',
        trial_ends_at: r.data.plan.trial_ends_at || hoyMas(29),
      });
    }).catch(e => setMsg({ tipo: 'peligro', txt: msgError(e, 'No se pudo cargar el plan') }));
  }, [schoolId]);

  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async () => {
    setGuardando(true);
    setMsg(null);
    try {
      const r = await axios.put(`/api/payments/schools/${schoolId}/plan`, form);
      setDatos(r.data);
      const avisos = r.data.avisos || [];
      setMsg(avisos.length
        ? { tipo: 'alerta', txt: avisos.join(' ') }
        : { tipo: 'info', txt: 'Plan guardado y publicado en Mercado Pago.' });
      onCambio && onCambio();
    } catch (e) {
      setMsg({ tipo: 'peligro', txt: msgError(e, 'No se pudo guardar el plan') });
    }
    setGuardando(false);
  };

  const refrescar = async () => {
    try {
      const r = await axios.post(`/api/payments/schools/${schoolId}/plan/refrescar`);
      setDatos(r.data);
      setMsg({ tipo: 'info', txt: 'Estado actualizado desde Mercado Pago.' });
    } catch (e) { setMsg({ tipo: 'peligro', txt: msgError(e) }); }
  };

  const copiar = () => {
    navigator.clipboard?.writeText(datos.init_point);
    setMsg({ tipo: 'info', txt: 'Link de suscripción copiado.' });
  };

  if (!datos || !form) {
    return <div className="pl-caja">{msg ? <div className={`ui-aviso ui-aviso-${msg.tipo}`}>{msg.txt}</div> : <p className="ui-vacio">Cargando plan…</p>}</div>;
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const sub = datos.suscripcion;

  return (
    <div className="pl-caja">
      <div className="pl-cab">
        <div>
          <h3>Plan y cobro</h3>
          <p>El colegio paga con Mercado Pago. El primer cobro llega cuando termina la prueba.</p>
        </div>
        <EstadoPlan estado={datos.estado} dias={datos.plan.dias_prueba} />
      </div>

      {!datos.mp_configurado && (
        <div className="ui-aviso ui-aviso-alerta">
          Mercado Pago no está configurado en este servidor (falta MP_ACCESS_TOKEN). El plan se guarda,
          pero no se puede cobrar.
        </div>
      )}
      {msg && <div className={`ui-aviso ui-aviso-${msg.tipo}`}>{msg.txt}</div>}

      <div className="pl-form">
        <div className="ui-campo">
          <label htmlFor="pl-nombre">Nombre del plan</label>
          <input id="pl-nombre" value={form.nombre} onChange={e => set('nombre', e.target.value)} />
        </div>
        <div className="ui-campo">
          <label htmlFor="pl-monto">Monto (CLP)</label>
          <input id="pl-monto" type="number" min="1" step="1" value={form.monto}
            placeholder="49990" onChange={e => set('monto', e.target.value)} />
        </div>
        <div className="ui-campo">
          <label htmlFor="pl-frec">Cobro</label>
          <select id="pl-frec" value={form.frecuencia} onChange={e => set('frecuencia', e.target.value)}>
            <option value="mensual">Mensual</option>
            <option value="anual">Anual</option>
          </select>
        </div>
        <div className="ui-campo">
          <label htmlFor="pl-fin">Prueba gratis hasta</label>
          <input id="pl-fin" type="date" value={form.trial_ends_at || ''} min={hoyMas(-365)}
            onChange={e => set('trial_ends_at', e.target.value)} />
          <div className="pl-atajos">
            {[7, 15, 30].map(n => (
              <button key={n} type="button" className="ui-btn ui-btn-sm"
                onClick={() => set('trial_ends_at', sumarDias(form.trial_ends_at, n))}>+{n} días</button>
            ))}
            <button type="button" className="ui-btn ui-btn-sm ui-btn-gris"
              onClick={() => set('trial_ends_at', '')}>Sin prueba</button>
          </div>
        </div>
      </div>

      <div className="pl-acciones">
        {datos.init_point && (
          <button type="button" className="ui-btn" onClick={copiar}>Copiar link de suscripción</button>
        )}
        {datos.mp_plan_id && (
          <button type="button" className="ui-btn" onClick={refrescar}>Actualizar desde Mercado Pago</button>
        )}
        <button type="button" className="ui-btn ui-btn-pri" onClick={guardar}
          disabled={guardando || !form.monto}>
          {guardando ? 'Guardando…' : 'Guardar plan'}
        </button>
      </div>

      {sub && (
        <div className="pl-sub">
          <b>Suscripción:</b> {ESTADO_COBRO[sub.status] || sub.status}
          {sub.mp_payer_email && <> · {sub.mp_payer_email}</>}
          {sub.amount ? <> · {clp(sub.amount)}</> : null}
          {sub.next_payment_date && <> · próximo cobro {fecha(sub.next_payment_date)}</>}
        </div>
      )}
      {datos.pagos.length > 0 && <TablaPagos pagos={datos.pagos} />}
    </div>
  );
}

export function TablaPagos({ pagos }) {
  return (
    <table className="pl-pagos">
      <thead><tr><th>Fecha</th><th>Monto</th><th>Estado</th><th>N° de pago</th></tr></thead>
      <tbody>
        {pagos.map(p => (
          <tr key={p.id}>
            <td>{fecha(p.debit_date || p.created_at)}</td>
            <td>{clp(p.amount)}</td>
            <td>{ESTADO_COBRO[p.payment_status] || ESTADO_COBRO[p.status] || p.payment_status || p.status}</td>
            <td className="pl-mono">{p.mp_payment_id || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
