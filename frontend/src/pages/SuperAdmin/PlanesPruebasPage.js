import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import Modal, { msgError } from '../../components/UI/Modal';
import { clp, fecha } from '../Plan/PlanPage';
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
    const cuerpo = {
      nombre: form.nombre.trim(),
      monto: form.monto === '' || form.monto === null ? null : Number(form.monto),
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

  return (
    <section className="pp-seccion">
      <div className="pl-cab">
        <div>
          <h3>Catálogo de planes</h3>
          <p>
            {predeterminado
              ? <>Cada colegio nuevo parte con <b>{predeterminado.nombre}</b> y <b>{predeterminado.dias_prueba} días</b> de prueba. Para cambiar los días, edita ese plan.</>
              : 'Ningún plan está marcado como predeterminado.'}
          </p>
        </div>
        <button type="button" className="ui-btn ui-btn-pri" onClick={() => setEditando('nuevo')}>Nuevo plan</button>
      </div>

      {(error || msg) && <div className="ui-aviso ui-aviso-peligro" role="alert">{error || msg}</div>}
      {!error && !planes.length && <p className="ui-vacio">Todavía no hay planes en el catálogo.</p>}

      <div className="pp-planes">
        {planes.map(p => {
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
    () => axios.post(`/api/super-admin/schools/${fila.school_id}/aplicar-plan`, { plan_id: Number(planId) }),
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
            {activos.map(p => (
              // Un plan sin monto no se puede cobrar: el servidor no deja aplicarlo
              <option key={p.id} value={p.id} disabled={!p.monto}>
                {p.nombre}{p.monto ? ` · ${clp(p.monto)} ${porFrecuencia(p.frecuencia)}` : ' · sin monto definido'}
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
                    <td>{f.plan_nombre || '—'}</td>
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
      <Catalogo planes={planes} error={error} onCambio={cargarPlanes} />
      <Pruebas planes={planes} />
    </div>
  );
}
