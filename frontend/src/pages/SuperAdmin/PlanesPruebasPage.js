import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import Modal, { msgError } from '../../components/UI/Modal';
import { clp, enUf, fecha } from '../Plan/PlanPage';
import '../../components/UI/ui.css';
import '../Plan/PlanPage.css';
import './PlanesPruebas.css';

const FILTROS = [
  ['', 'Todas'],
  ['activa', 'Activas'],
  ['por_vencer', 'Por vencer'],
  ['vencida', 'Vencidas'],
  ['suscrito', 'Suscritas'],
];

const ESTADOS = {
  activa: ['Activa', 'pl-chip-azul'],
  por_vencer: ['Por vencer', 'pl-chip-ambar'],
  vencida: ['Vencida', 'pl-chip-rojo'],
  suscrito: ['Suscrita', 'pl-chip-verde'],
};

const PLAN_VACIO = { nombre: '', monto: '', frecuencia: 'mensual', dias_prueba: 30, descripcion: '', predeterminado: false };

const porFrecuencia = (f) => (f === 'anual' ? 'al año' : 'al mes');
const lista = (data) => (Array.isArray(data) ? data : data?.pruebas || data?.planes || data?.items || []);

function validarPlan(f) {
  if (!f.nombre.trim()) return 'Escribe un nombre para el plan.';
  if (f.monto !== '' && f.monto !== null && (!Number.isInteger(Number(f.monto)) || Number(f.monto) <= 0)) {
    return 'El monto debe ser un número entero de pesos, mayor que cero. Déjalo vacío si aún no se define.';
  }
  const d = Number(f.dias_prueba);
  if (!Number.isInteger(d) || d < 1 || d > 365) return 'Los días de prueba deben estar entre 1 y 365.';
  return '';
}

const decimal = (n) => Number(n).toLocaleString('es-CL', { maximumFractionDigits: 3 });

function aFilas(tramos) {
  return tramos.map(t => ({ id: t.id, hasta: String(t.usuarios_max), uf: String(t.monto_uf) }));
}

// La escala se edita completa: cada tramo parte donde termina el anterior.
function EscalaTramos({ planes, onCambio }) {
  const tramos = planes
    .filter(p => p.monto_uf && p.activo !== false)
    .sort((a, b) => a.usuarios_min - b.usuarios_min);
  const original = JSON.stringify(aFilas(tramos));
  const [filas, setFilas] = useState(() => aFilas(tramos));
  const [dias, setDias] = useState(String(tramos[0]?.dias_prueba ?? 30));
  const [valorUf, setValorUf] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState(null);

  const diasGuardados = tramos[0]?.dias_prueba;
  // El catálogo llega después del primer render y vuelve a llegar al guardar
  useEffect(() => { setFilas(JSON.parse(original)); }, [original]);
  useEffect(() => { if (diasGuardados) setDias(String(diasGuardados)); }, [diasGuardados]);
  useEffect(() => {
    axios.get('/api/uf').then(r => setValorUf(r.data?.valor || null)).catch(() => setValorUf(null));
  }, []);

  const predeterminado = planes.find(p => p.predeterminado && p.activo !== false);
  const cambiar = (i, campo, valor) => {
    setMsg(null);
    setFilas(fs => fs.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));
  };
  const hastaDe = (f) => parseInt(f.hasta, 10);
  const desdeDe = (i) => (i === 0 ? 1 : (hastaDe(filas[i - 1]) || 0) + 1);
  const agregar = () => {
    setMsg(null);
    setFilas(fs => {
      const ultimo = fs.length ? hastaDe(fs[fs.length - 1]) || 0 : 0;
      return [...fs, { id: null, hasta: String(ultimo + 10), uf: '' }];
    });
  };
  const quitar = (i) => { setMsg(null); setFilas(fs => fs.filter((_, j) => j !== i)); };
  const tope = filas.length ? hastaDe(filas[filas.length - 1]) : 0;
  const hayCambios = JSON.stringify(filas) !== original || Number(dias) !== tramos[0]?.dias_prueba;

  const guardar = async () => {
    const decimalUf = (t) => Number(String(t).replace(',', '.'));
    for (let i = 0; i < filas.length; i += 1) {
      if (!(hastaDe(filas[i]) >= desdeDe(i))) {
        setMsg({ tipo: 'peligro', txt: `El tramo que parte en ${desdeDe(i)} debe terminar en ${desdeDe(i)} usuarios o más.` });
        return;
      }
      if (!(decimalUf(filas[i].uf) > 0)) {
        setMsg({ tipo: 'peligro', txt: `El tramo que parte en ${desdeDe(i)} necesita un valor en UF mayor que cero.` });
        return;
      }
    }
    setGuardando(true);
    setMsg(null);
    try {
      await axios.put('/api/super-admin/tramos', {
        dias_prueba: Number(dias),
        tramos: filas.map(f => ({ ...(f.id ? { id: f.id } : {}), usuarios_hasta: hastaDe(f), monto_uf: decimalUf(f.uf) })),
      });
      await onCambio();
      setMsg({ tipo: 'info', txt: 'Listo. El sitio y los colegios sin suscripción ya usan estos valores. Las suscripciones vigentes mantienen su monto.' });
    } catch (e) {
      setMsg({ tipo: 'peligro', txt: msgError(e, 'No se pudieron guardar los tramos') });
    }
    setGuardando(false);
  };

  return (
    <section className="pp-seccion">
      <div className="pl-cab">
        <div>
          <h3>Tramos de precio</h3>
          <p>Lo que cambies aquí se aplica al sitio público, a la página de plan y a las nuevas suscripciones. Se cuentan docentes y administradores activos.</p>
        </div>
      </div>
      {msg && <div className={`ui-aviso ui-aviso-${msg.tipo}`} role={msg.tipo === 'peligro' ? 'alert' : 'status'}>{msg.txt}</div>}
      {predeterminado && !predeterminado.monto_uf && tramos.length > 0 && (
        <div className="ui-aviso ui-aviso-alerta">
          Los colegios nuevos están partiendo con {predeterminado.nombre}, no con estos tramos.{' '}
          <button type="button" className="ui-btn ui-btn-sm"
            onClick={async () => { await axios.put(`/api/super-admin/planes/${tramos[0].id}`, { predeterminado: true }); await onCambio(); }}>
            Usar tramos
          </button>
        </div>
      )}
      <div className="pp-tramos-marco">
        <table className="pp-tramos">
          <thead>
            <tr><th scope="col">Usuarios desde</th><th scope="col">Hasta</th><th scope="col">UF al mes</th><th scope="col">Pesos hoy</th><th scope="col">UF por usuario (tope)</th><th aria-label="Acciones" /></tr>
          </thead>
          <tbody>
            {filas.map((f, i) => {
              const uf = Number(String(f.uf).replace(',', '.'));
              const hasta = hastaDe(f);
              return (
                <tr key={f.id || `nuevo-${i}`}>
                  <td>{desdeDe(i)}</td>
                  <td><input aria-label={`Usuarios hasta, tramo ${i + 1}`} type="number" min={desdeDe(i)} step="1" value={f.hasta} onChange={e => cambiar(i, 'hasta', e.target.value)} /></td>
                  <td><input aria-label={`UF al mes, tramo ${i + 1}`} type="number" min="0.01" step="0.01" value={f.uf} onChange={e => cambiar(i, 'uf', e.target.value)} /></td>
                  <td>{valorUf && uf > 0 ? clp(uf * valorUf) : '—'}</td>
                  <td>{uf > 0 && hasta > 0 ? decimal(uf / hasta) : '—'}</td>
                  <td>{filas.length > 1 && <button type="button" className="ui-btn ui-btn-sm" aria-label={`Quitar tramo ${i + 1}`} onClick={() => quitar(i)}>Quitar</button>}</td>
                </tr>
              );
            })}
            <tr className="pp-tramo-especial"><td colSpan="2">Más de {tope || 0}</td><td colSpan="4">Plan Especial · Conversemos</td></tr>
          </tbody>
        </table>
      </div>
      <div className="pp-tramos-pie">
        <button type="button" className="ui-btn" onClick={agregar}>Agregar tramo</button>
        <div className="ui-campo pp-tramos-dias">
          <label htmlFor="pp-dias-tramos">Días de prueba (colegios nuevos)</label>
          <input id="pp-dias-tramos" type="number" min="1" max="365" step="1" value={dias} onChange={e => { setMsg(null); setDias(e.target.value); }} />
        </div>
        <button type="button" className="ui-btn ui-btn-pri" disabled={guardando || !hayCambios} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Guardar tramos'}
        </button>
      </div>
    </section>
  );
}

const ESTADOS_AJUSTE = {
  enviando: ['Enviando aviso', 'pl-chip-ambar'],
  avisado: ['Avisado', 'pl-chip-azul'],
  aplicado: ['Aplicado', 'pl-chip-verde'],
  cancelado: ['Cancelado', 'pl-chip-gris'],
  revision: ['Revisar a mano', 'pl-chip-ambar'],
};

// Cada mes compara lo que paga cada suscripción con lo que le corresponde hoy.
function AjusteMensual() {
  const [datos, setDatos] = useState(null);
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/super-admin/ajustes');
      setDatos(data);
    } catch (e) {
      setMsg({ tipo: 'peligro', txt: msgError(e, 'No se pudieron cargar los ajustes') });
    }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const revisar = async () => {
    setOcupado(true);
    setMsg(null);
    try {
      const { data: r } = await axios.post('/api/super-admin/ajustes/revisar');
      if (r.detenido) setMsg({ tipo: 'alerta', txt: `No se revisó: ${r.detenido}.` });
      else if (r.errores?.length) setMsg({ tipo: 'alerta', txt: `Avisados: ${r.avisados}. Aplicados: ${r.aplicados}. Con problemas: ${r.errores.join(' · ')}` });
      else setMsg({ tipo: 'info', txt: `Revisadas: ${r.revisados}. Avisados: ${r.avisados}. Aplicados: ${r.aplicados}. Por revisar a mano: ${r.revision}.` });
      await cargar();
    } catch (e) {
      setMsg({ tipo: 'peligro', txt: msgError(e, 'No se pudo hacer la revisión') });
    }
    setConfirmar(false);
    setOcupado(false);
  };

  const cancelar = async (id) => {
    setMsg(null);
    try {
      await axios.post(`/api/super-admin/ajustes/${id}/cancelar`);
      await cargar();
    } catch (e) {
      setMsg({ tipo: 'peligro', txt: msgError(e, 'No se pudo cancelar el ajuste') });
    }
  };

  const previsto = datos?.previsto || [];
  const ajustes = datos?.ajustes || [];
  const listo = datos?.mp_configurado && datos?.correo_configurado;

  return (
    <section className="pp-seccion">
      <div className="pl-cab">
        <div>
          <h3>Ajuste mensual de suscripciones</h3>
          <p>Si el monto sube, se avisa por correo y cambia {datos?.dias_aviso ?? 10} días después. Si baja, se aplica de inmediato.</p>
        </div>
        <button type="button" className="ui-btn" disabled={!listo} onClick={() => setConfirmar(true)}>Revisar ahora</button>
      </div>
      {msg && <div className={`ui-aviso ui-aviso-${msg.tipo}`} role="status">{msg.txt}</div>}
      {datos && !datos.mp_configurado && <div className="ui-aviso ui-aviso-alerta">Falta configurar Mercado Pago.</div>}
      {datos && !datos.correo_configurado && <div className="ui-aviso ui-aviso-alerta">Falta configurar el envío de correos.</div>}
      {datos && <p className="pp-txt">Revisión automática: <b>{datos.automatico ? 'activada' : 'apagada'}</b>.{!datos.automatico && ' Solo corre con el botón.'}</p>}

      {datos && (
        <div className="pp-tramos-marco">
          <table className="pp-tramos">
            <thead><tr><th scope="col">Colegio</th><th scope="col">Usuarios</th><th scope="col">Paga hoy</th><th scope="col">Pagaría</th><th scope="col">Estado</th><th aria-label="Acciones" /></tr></thead>
            <tbody>
              {previsto.map(p => (
                <tr key={`p-${p.school_id}`}>
                  <td>{p.colegio}</td><td>{p.usuarios}</td><td>{clp(p.monto_actual)}</td>
                  <td>{p.monto_nuevo ? clp(p.monto_nuevo) : 'Plan Especial'}</td>
                  <td><span className="ui-chip pl-chip-gris">Previsto</span></td><td />
                </tr>
              ))}
              {ajustes.map(a => {
                const [txt, cls] = ESTADOS_AJUSTE[a.estado] || [a.estado, 'pl-chip-gris'];
                return (
                  <tr key={a.id}>
                    <td>{a.colegio}{a.error ? <small> · {a.error}</small> : null}</td><td>{a.usuarios}</td><td>{clp(a.monto_anterior)}</td>
                    <td>{a.monto_nuevo ? clp(a.monto_nuevo) : 'Plan Especial'}{a.estado === 'avisado' ? <small> · desde {fecha(a.aplicar_desde)}</small> : null}</td>
                    <td><span className={`ui-chip ${cls}`}>{txt}</span></td>
                    <td>{['avisado', 'revision'].includes(a.estado) && (
                      <button type="button" className="ui-btn ui-btn-sm" onClick={() => cancelar(a.id)}>Cancelar</button>
                    )}</td>
                  </tr>
                );
              })}
              {!previsto.length && !ajustes.length && <tr><td colSpan="6">No hay cambios previstos.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {confirmar && (
        <Modal titulo="¿Revisar las suscripciones ahora?" ocupado={ocupado} onClose={() => setConfirmar(false)}
          pie={<>
            <button type="button" className="ui-btn" disabled={ocupado} onClick={() => setConfirmar(false)}>Cancelar</button>
            <button type="button" className="ui-btn ui-btn-pri" disabled={ocupado} onClick={revisar}>{ocupado ? 'Revisando…' : 'Revisar'}</button>
          </>}>
          <p className="pp-txt">Se enviarán los avisos a los colegios cuyo monto sube, y las bajas se aplicarán de inmediato en Mercado Pago.</p>
        </Modal>
      )}
    </section>
  );
}

function FormPlan({ plan, onClose, onGuardado }) {
  const [form, setForm] = useState(() => (plan
    ? { ...PLAN_VACIO, ...plan, monto: plan.monto ?? '', descripcion: plan.descripcion ?? '' }
    : PLAN_VACIO));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [k]: v }));
  };

  const guardar = async (e) => {
    e?.preventDefault();
    const problema = validarPlan(form);
    if (problema) { setError(problema); return; }
    setGuardando(true);
    setError('');
    const numero = (v) => (v === '' || v === null ? null : Number(v));
    const cuerpo = {
      nombre: form.nombre.trim(),
      monto: numero(form.monto),
      frecuencia: form.frecuencia,
      dias_prueba: Number(form.dias_prueba),
      descripcion: form.descripcion.trim(),
      predeterminado: !!form.predeterminado,
    };
    try {
      if (plan) await axios.put(`/api/super-admin/planes/${plan.id}`, cuerpo);
      else await axios.post('/api/super-admin/planes', cuerpo);
      onGuardado();
    } catch (err) {
      setError(msgError(err, 'No se pudo guardar el plan'));
      setGuardando(false);
    }
  };

  return (
    <Modal titulo={plan ? `Editar ${plan.nombre}` : 'Nuevo plan'} onClose={onClose} ocupado={guardando}
      pie={<>
        <button type="button" className="ui-btn" disabled={guardando} onClick={onClose}>Cancelar</button>
        <button type="button" className="ui-btn ui-btn-pri" disabled={guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </>}>
      {error && <div className="ui-aviso ui-aviso-peligro" role="alert">{error}</div>}
      <form onSubmit={guardar} noValidate>
        <div className="ui-campo">
          <label htmlFor="pp-nombre">Nombre</label>
          <input id="pp-nombre" value={form.nombre} onChange={set('nombre')} autoFocus />
        </div>
        <div className="ui-fila2">
          <div className="ui-campo">
            <label htmlFor="pp-monto">Monto (CLP)</label>
            <input id="pp-monto" type="number" min="1" step="1" value={form.monto} onChange={set('monto')} placeholder="Por definir" />
          </div>
          <div className="ui-campo">
            <label htmlFor="pp-frec">Cobro</label>
            <select id="pp-frec" value={form.frecuencia} onChange={set('frecuencia')}>
              <option value="mensual">Mensual</option>
              <option value="anual">Anual</option>
            </select>
          </div>
        </div>
        <div className="ui-campo">
          <label htmlFor="pp-dias">Días de prueba</label>
          <input id="pp-dias" type="number" min="1" max="365" step="1" value={form.dias_prueba} onChange={set('dias_prueba')} />
        </div>
        <div className="ui-campo">
          <label htmlFor="pp-desc">Descripción</label>
          <textarea id="pp-desc" value={form.descripcion} onChange={set('descripcion')} />
        </div>
        <label className="ui-check">
          <input type="checkbox" checked={!!form.predeterminado} onChange={set('predeterminado')} />
          <span>Plan predeterminado<small>Es el que reciben los colegios que se registran solos.</small></span>
        </label>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}

function Catalogo({ planes, error, onCambio }) {
  const [editando, setEditando] = useState(null);   // null | 'nuevo' | plan
  const [desactivar, setDesactivar] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState('');

  const accion = async (fn, fallo) => {
    setOcupado(true);
    setMsg('');
    try {
      await fn();
      setDesactivar(null);
      await onCambio();
    } catch (e) {
      setMsg(msgError(e, fallo));
    }
    setOcupado(false);
  };

  const predeterminado = planes.find(p => p.predeterminado && p.activo !== false);
  const fijos = planes.filter(p => !p.monto_uf);

  return (
    <section className="pp-seccion">
      <div className="pl-cab">
        <div>
          <h3>Planes con monto fijo</h3>
          <p>
            {predeterminado
              ? (predeterminado.monto_uf
                ? 'Para acuerdos especiales con un colegio. Los colegios nuevos parten con los tramos de precio.'
                : <>Cada colegio nuevo parte con <b>{predeterminado.nombre}</b> y <b>{predeterminado.dias_prueba} días</b> de prueba. Para cambiar los días, edita ese plan.</>)
              : 'Ningún plan está marcado como predeterminado.'}
          </p>
        </div>
        <button type="button" className="ui-btn ui-btn-pri" onClick={() => setEditando('nuevo')}>Nuevo plan</button>
      </div>

      {(error || msg) && <div className="ui-aviso ui-aviso-peligro" role="alert">{error || msg}</div>}
      {!error && !fijos.length && <p className="ui-vacio">Todavía no hay planes con monto fijo.</p>}

      <div className="pp-planes">
        {fijos.map(p => {
          const activo = p.activo !== false;
          return (
            <article key={p.id} className={`pp-plan ${activo ? '' : 'inactivo'} ${p.predeterminado ? 'pred' : ''}`}>
              <div className="pp-plan-cab">
                <h4>{p.nombre}</h4>
                {p.predeterminado && <span className="ui-chip pl-chip-azul">Predeterminado</span>}
                {!activo && <span className="ui-chip pl-chip-gris">Inactivo</span>}
              </div>
              <div className="pp-plan-precio">
                {p.monto ? <>{clp(p.monto)} <small>{porFrecuencia(p.frecuencia)}</small></> : <span className="pp-sin-monto">Valor por definir</span>}
              </div>
              <p className="pp-plan-dias">{p.dias_prueba} días de prueba</p>
              {p.descripcion && <p className="pp-plan-desc">{p.descripcion}</p>}
              <div className="pp-plan-acc">
                <button type="button" className="ui-btn ui-btn-sm" onClick={() => setEditando(p)}>Editar</button>
                {activo && !p.predeterminado && (
                  <button type="button" className="ui-btn ui-btn-sm" disabled={ocupado}
                    onClick={() => accion(() => axios.put(`/api/super-admin/planes/${p.id}`, { predeterminado: true }), 'No se pudo marcar como predeterminado')}>
                    Hacer predeterminado
                  </button>
                )}
                {activo && !p.predeterminado && (
                  <button type="button" className="ui-btn ui-btn-sm" onClick={() => setDesactivar(p)}>Desactivar</button>
                )}
                {!activo && (
                  <button type="button" className="ui-btn ui-btn-sm" disabled={ocupado}
                    onClick={() => accion(() => axios.put(`/api/super-admin/planes/${p.id}`, { activo: true }), 'No se pudo reactivar el plan')}>
                    Reactivar
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {editando && (
        <FormPlan plan={editando === 'nuevo' ? null : editando} onClose={() => setEditando(null)}
          onGuardado={async () => { setEditando(null); await onCambio(); }} />
      )}

      {desactivar && (
        <Modal titulo={`¿Desactivar ${desactivar.nombre}?`} ocupado={ocupado} onClose={() => setDesactivar(null)}
          pie={<>
            <button type="button" className="ui-btn" disabled={ocupado} onClick={() => setDesactivar(null)}>Cancelar</button>
            <button type="button" className="ui-btn ui-btn-peligro" disabled={ocupado}
              onClick={() => accion(() => axios.delete(`/api/super-admin/planes/${desactivar.id}`), 'No se pudo desactivar el plan')}>
              {ocupado ? 'Desactivando…' : 'Desactivar'}
            </button>
          </>}>
          {msg && <div className="ui-aviso ui-aviso-peligro" role="alert">{msg}</div>}
          <p className="pp-txt">Ya no se podrá aplicar a nuevos colegios. Los que ya lo tienen conservan su plan.</p>
        </Modal>
      )}
    </section>
  );
}

function GestionarPrueba({ fila, planes, onClose, onCambio }) {
  const [fechaNueva, setFechaNueva] = useState('');
  const [planId, setPlanId] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState(null);
  const [termina, setTermina] = useState(fila.trial_ends_at);
  const [planActual, setPlanActual] = useState(fila.plan_nombre);
  const activos = planes.filter(p => p.activo !== false);

  const ejecutar = async (peticion, exito, fallo) => {
    setOcupado(true);
    setMsg(null);
    try {
      const { data } = await peticion();
      const nueva = data?.trial_ends_at || data?.plan?.trial_ends_at;
      if (nueva) setTermina(nueva);
      if (data?.plan?.nombre) setPlanActual(data.plan.nombre);
      const avisos = data?.avisos || [];
      setMsg(avisos.length
        ? { tipo: 'alerta', txt: `${exito(nueva)} ${avisos.join(' ')}` }
        : { tipo: 'info', txt: exito(nueva) });
      await onCambio();
    } catch (e) {
      setMsg({ tipo: 'peligro', txt: msgError(e, fallo) });
    }
    setOcupado(false);
  };

  const prorrogar = (cuerpo) => ejecutar(
    () => axios.post(`/api/super-admin/schools/${fila.school_id}/prueba`, cuerpo),
    (nueva) => (nueva ? `Prueba extendida hasta el ${fecha(nueva)}.` : 'Prueba extendida.'),
    'No se pudo extender la prueba');

  const aplicarPlan = () => ejecutar(
    () => axios.post(`/api/super-admin/schools/${fila.school_id}/aplicar-plan`,
      planId === 'auto' ? { automatico: true } : { plan_id: Number(planId) }),
    () => 'Plan aplicado al colegio.',
    'No se pudo aplicar el plan');

  return (
    <Modal titulo={fila.nombre} subtitulo={`Plan: ${planActual || 'sin plan'} · prueba hasta el ${fecha(termina)}`}
      onClose={onClose} ocupado={ocupado}
      pie={<button type="button" className="ui-btn" disabled={ocupado} onClick={onClose}>Cerrar</button>}>
      {msg && <div className={`ui-aviso ui-aviso-${msg.tipo}`} role="status">{msg.txt}</div>}

      <h4 className="pp-mod-tit">Extender la prueba</h4>
      <div className="pp-mod-fila">
        {[7, 15, 30].map(n => (
          <button key={n} type="button" className="ui-btn" disabled={ocupado} onClick={() => prorrogar({ dias: n })}>+{n} días</button>
        ))}
      </div>
      <div className="pp-mod-fila pp-mod-fecha">
        <div className="ui-campo">
          <label htmlFor="pp-fecha">O hasta una fecha</label>
          <input id="pp-fecha" type="date" value={fechaNueva} onChange={e => setFechaNueva(e.target.value)} />
        </div>
        <button type="button" className="ui-btn" disabled={ocupado || !fechaNueva}
          onClick={() => prorrogar({ trial_ends_at: fechaNueva })}>Aplicar fecha</button>
      </div>

      <h4 className="pp-mod-tit">Cambiar de plan</h4>
      <div className="pp-mod-fila pp-mod-fecha">
        <div className="ui-campo">
          <label htmlFor="pp-aplicar">Plan del catálogo</label>
          <select id="pp-aplicar" value={planId} onChange={e => setPlanId(e.target.value)}>
            <option value="">Elige un plan…</option>
            <option value="auto">Automático según sus usuarios</option>
            {activos.map(p => (
              // Un plan sin monto no se puede cobrar: el servidor no deja aplicarlo
              <option key={p.id} value={p.id} disabled={!p.monto && !p.monto_uf}>
                {p.nombre}{p.monto_uf
                  ? ` · fijo en ${enUf(p.monto_uf)} ${porFrecuencia(p.frecuencia)}`
                  : p.monto ? ` · ${clp(p.monto)} ${porFrecuencia(p.frecuencia)}` : ' · sin monto definido'}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="ui-btn" disabled={ocupado || !planId} onClick={aplicarPlan}>Aplicar plan</button>
      </div>
    </Modal>
  );
}

function Pruebas({ planes }) {
  const [estado, setEstado] = useState('');
  const [filas, setFilas] = useState(null);
  const [totales, setTotales] = useState({});
  const [error, setError] = useState('');
  const [gestionando, setGestionando] = useState(null);

  const cargar = useCallback(async () => {
    setError('');
    try {
      const { data } = await axios.get('/api/super-admin/pruebas', { params: estado ? { estado } : {} });
      setFilas(lista(data));
      if (data?.totales) setTotales(data.totales);
    } catch (e) {
      setFilas([]);
      setError(msgError(e, 'No se pudieron cargar las pruebas'));
    }
  }, [estado]);

  useEffect(() => { cargar(); }, [cargar]);

  const totalDe = (clave) => {
    if (clave) return totales[clave];
    const nums = Object.entries(totales).filter(([k]) => k !== 'total').map(([, v]) => v);
    return totales.total ?? (nums.length ? nums.reduce((a, b) => a + b, 0) : undefined);
  };

  return (
    <section className="pp-seccion">
      <div className="pl-cab">
        <div>
          <h3>Pruebas de colegios</h3>
          <p>Solo los colegios que se registraron solos. Desde aquí extiendes una prueba o les cambias el plan.</p>
        </div>
      </div>

      <div className="pp-filtros" role="group" aria-label="Filtrar por estado">
        {FILTROS.map(([clave, txt]) => (
          <button key={clave} type="button" className={`pp-filtro ${estado === clave ? 'on' : ''}`}
            aria-pressed={estado === clave} onClick={() => setEstado(clave)}>
            {txt}{totalDe(clave) != null && <b>{totalDe(clave)}</b>}
          </button>
        ))}
      </div>

      {error && <div className="ui-aviso ui-aviso-peligro" role="alert">{error}</div>}
      {filas === null && <p className="ui-vacio">Cargando…</p>}
      {filas && !filas.length && !error && (
        <p className="ui-vacio">{estado ? 'No hay colegios en este estado.' : 'Aún no hay colegios registrados por su cuenta.'}</p>
      )}

      {filas && filas.length > 0 && (
        <div className="pp-tabla-env" tabIndex={0} role="region" aria-label="Pruebas de colegios">
          <table className="pp-tabla">
            <thead>
              <tr>
                <th scope="col">Colegio</th><th scope="col">Plan</th><th scope="col">Creado</th>
                <th scope="col">Termina</th><th scope="col">Días</th><th scope="col">Estado</th>
                <th scope="col">Alumnos</th><th scope="col">Último acceso</th><th scope="col"><span className="pp-oculto">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {filas.map(f => {
                const [txt, cls] = ESTADOS[f.estado] || [f.estado, 'pl-chip-gris'];
                return (
                  <tr key={f.school_id}>
                    <td><b>{f.nombre}</b><small>{f.admin_email}</small></td>
                    <td>{f.plan_nombre || '—'}{f.usuarios ? <small> · {f.usuarios} {f.usuarios === 1 ? 'usuario' : 'usuarios'}</small> : null}</td>
                    <td>{fecha(f.creado)}</td>
                    <td>{fecha(f.trial_ends_at)}</td>
                    <td className="pp-num">{f.dias_restantes ?? '—'}</td>
                    <td><span className={`ui-chip ${cls}`}>{txt}</span></td>
                    <td className="pp-num">{f.alumnos ?? 0}</td>
                    <td>{f.ultimo_acceso ? fecha(f.ultimo_acceso) : 'Sin accesos'}</td>
                    <td><button type="button" className="ui-btn ui-btn-sm" onClick={() => setGestionando(f)}>Gestionar</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {gestionando && (
        <GestionarPrueba fila={gestionando} planes={planes} onClose={() => setGestionando(null)} onCambio={cargar} />
      )}
    </section>
  );
}

export default function PlanesPruebasPage() {
  const [planes, setPlanes] = useState([]);
  const [error, setError] = useState('');

  const cargarPlanes = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/super-admin/planes');
      setPlanes(lista(data));
      setError('');
    } catch (e) {
      setError(msgError(e, 'No se pudo cargar el catálogo de planes'));
    }
  }, []);

  useEffect(() => { cargarPlanes(); }, [cargarPlanes]);

  return (
    <div className="pp">
      <div className="pl-cab">
        <div>
          <h2>Planes y pruebas</h2>
          <p>Lo que reciben los colegios nuevos y cómo van los que ya están probando.</p>
        </div>
      </div>
      <EscalaTramos planes={planes} onCambio={cargarPlanes} />
      <AjusteMensual />
      <Catalogo planes={planes} error={error} onCambio={cargarPlanes} />
      <Pruebas planes={planes} />
    </div>
  );
}
