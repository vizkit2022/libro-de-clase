import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { msgError } from '../../components/UI/Modal';
import '../../components/UI/ui.css';
import './PlanPage.css';

export const clp = (n) => (n || n === 0)
  ? `$${Math.round(Number(n)).toLocaleString('es-CL')}` : '—';
export const fecha = (iso) => iso
  ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-CL',
    { day: 'numeric', month: 'long', year: 'numeric' })
  : '—';

export const ESTADO_COBRO = {
  authorized: 'Activa', paused: 'Pausada', cancelled: 'Cancelada', pending: 'Pendiente',
  finished: 'Terminada', approved: 'Pagado', rejected: 'Rechazado', in_process: 'En proceso',
  scheduled: 'Programado', processed: 'Procesado', recycling: 'Reintentando',
};

const ESTADOS = {
  sin_plan: ['Sin plan asignado', 'ip-chip-gris'],
  prueba: ['En prueba', 'pl-chip-azul'],
  suscrito_en_prueba: ['En prueba · suscrito', 'pl-chip-verde'],
  activo: ['Al día', 'pl-chip-verde'],
  pago_pendiente: ['Pago pendiente', 'pl-chip-ambar'],
  pausado: ['Pausado', 'pl-chip-ambar'],
  vencido: ['Prueba terminada', 'pl-chip-rojo'],
};

export function EstadoPlan({ estado, dias }) {
  const [txt, cls] = ESTADOS[estado] || [estado, 'pl-chip-gris'];
  const extra = (estado === 'prueba' || estado === 'suscrito_en_prueba') && dias
    ? ` · ${dias} ${dias === 1 ? 'día' : 'días'}` : '';
  return <span className={`ui-chip ${cls}`}>{txt}{extra}</span>;
}

// Lo que ve el colegio: su plan, la prueba y el botón para suscribirse.
export default function PlanPage() {
  const { user } = useAuth();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [yendo, setYendo] = useState(false);
  const [aviso, setAviso] = useState('');
  const esAdmin = user?.role === 'admin';

  useEffect(() => {
    // Al volver del checkout, Mercado Pago agrega ?preapproval_id=... a la URL
    const params = new URLSearchParams(window.location.search);
    const pid = params.get('preapproval_id');
    const pedir = pid
      ? axios.post('/api/payments/plan/verificar', { preapproval_id: pid })
      : axios.get('/api/payments/plan');
    pedir.then(r => {
      setDatos(r.data);
      if (pid) {
        setAviso(r.data.suscripcion?.status === 'authorized'
          ? '¡Listo! La suscripción quedó activa. El primer cobro llegará al terminar la prueba.'
          : 'Recibimos tu suscripción. Mercado Pago puede tardar unos minutos en confirmarla.');
        window.history.replaceState({}, '', window.location.pathname);
      }
    }).catch(e => setError(msgError(e, 'No se pudo cargar el plan')));
  }, []);

  const suscribir = async () => {
    setYendo(true);
    setError('');
    try {
      const r = await axios.post('/api/payments/plan/suscribir');
      window.location.href = r.data.init_point;
    } catch (e) {
      setError(msgError(e, 'No se pudo abrir Mercado Pago'));
      setYendo(false);
    }
  };

  if (!datos) {
    return (
      <div className="pl">
        {error ? <div className="ui-aviso ui-aviso-peligro">{error}</div> : <p className="ui-vacio">Cargando…</p>}
      </div>
    );
  }

  const { plan, estado, suscripcion: sub } = datos;
  const porPeriodo = plan.frecuencia === 'anual' ? 'al año' : 'al mes';
  const puedeSuscribir = esAdmin && datos.mp_configurado && plan.monto
    && ['prueba', 'vencido', 'pausado'].includes(estado) && sub?.status !== 'authorized';

  return (
    <div className="pl">
      <div className="pl-cab">
        <div>
          <h2>Plan</h2>
          <p>Tu suscripción a Recreo Edu.</p>
        </div>
      </div>

      {aviso && <div className="ui-aviso ui-aviso-info">{aviso}</div>}
      {error && <div className="ui-aviso ui-aviso-peligro">{error}</div>}

      {estado === 'sin_plan' ? (
        <div className="pl-caja">
          <p className="ui-vacio">Tu colegio aún no tiene un plan asignado. Escríbenos y lo activamos.</p>
        </div>
      ) : (
        <div className="pl-caja pl-resumen">
          <div className="pl-resumen-cab">
            <div>
              <span className="pl-nombre">{plan.nombre || 'Plan'}</span>
              <div className="pl-precio">{clp(plan.monto)} <small>{porPeriodo}</small></div>
            </div>
            <EstadoPlan estado={estado} dias={plan.dias_prueba} />
          </div>

          <dl className="pl-datos">
            <div>
              <dt>Prueba gratis</dt>
              <dd>{plan.trial_ends_at
                ? (plan.dias_prueba ? `Hasta el ${fecha(plan.trial_ends_at)}` : `Terminó el ${fecha(plan.trial_ends_at)}`)
                : 'Sin período de prueba'}</dd>
            </div>
            <div>
              <dt>Suscripción</dt>
              <dd>{sub ? (ESTADO_COBRO[sub.status] || sub.status) : 'Aún no te suscribes'}</dd>
            </div>
            {sub?.next_payment_date && (
              <div><dt>Próximo cobro</dt><dd>{fecha(sub.next_payment_date)}</dd></div>
            )}
            {sub?.mp_payer_email && (
              <div><dt>Cuenta que paga</dt><dd>{sub.mp_payer_email}</dd></div>
            )}
          </dl>

          {estado === 'vencido' && (
            <div className="ui-aviso ui-aviso-alerta">
              La prueba terminó. Suscríbete para seguir usando la plataforma sin interrupciones.
            </div>
          )}
          {estado === 'pago_pendiente' && (
            <div className="ui-aviso ui-aviso-alerta">
              El último cobro fue rechazado y Mercado Pago lo está reintentando. Revisa el medio de
              pago en tu cuenta de Mercado Pago.
            </div>
          )}

          {puedeSuscribir && (
            <div className="pl-acciones">
              <p className="pl-nota">
                Registras tu tarjeta en Mercado Pago y {plan.dias_prueba
                  ? `el primer cobro llega cuando termina la prueba (${fecha(plan.trial_ends_at)}).`
                  : 'se cobra el primer período al suscribirte.'}
              </p>
              <button type="button" className="ui-btn ui-btn-pri pl-btn-mp" onClick={suscribir} disabled={yendo}>
                {yendo ? 'Abriendo Mercado Pago…' : 'Suscribirme con Mercado Pago'}
              </button>
            </div>
          )}
          {!esAdmin && ['prueba', 'vencido'].includes(estado) && (
            <p className="pl-nota">La suscripción la activa el administrador del colegio.</p>
          )}
          {esAdmin && !datos.mp_configurado && (
            <p className="pl-nota">El pago en línea aún no está habilitado. Escríbenos para activarlo.</p>
          )}
        </div>
      )}

      {datos.pagos.length > 0 && (
        <div className="pl-caja">
          <h3 className="pl-sub-tit">Pagos</h3>
          <table className="pl-pagos">
            <thead><tr><th>Fecha</th><th>Monto</th><th>Estado</th></tr></thead>
            <tbody>
              {datos.pagos.map(p => (
                <tr key={p.id}>
                  <td>{fecha(p.debit_date || p.created_at)}</td>
                  <td>{clp(p.amount)}</td>
                  <td>{ESTADO_COBRO[p.payment_status] || ESTADO_COBRO[p.status] || p.payment_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
