import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import Modal, { msgError } from '../../components/UI/Modal';
import { Icono } from '../../components/Layout/iconos';
import descargarArchivo from '../CargaAcademica/descargar';
import '../../components/UI/ui.css';
import './AuditoriaPage.css';

export const EVENTOS = {
  login:         { et: 'Inicio de sesión', col: '#15803d', bg: '#dcfce7' },
  login_fallido: { et: 'Inicio fallido',   col: '#b91c1c', bg: '#fee2e2' },
  logout:        { et: 'Cierre de sesión', col: '#475569', bg: '#e2e8f0' },
  crear:         { et: 'Creación',         col: '#1d4ed8', bg: '#dbeafe' },
  editar:        { et: 'Edición',          col: '#b45309', bg: '#fef3c7' },
  eliminar:      { et: 'Eliminación',      col: '#9f1239', bg: '#ffe4e6' },
  descargar:     { et: 'Descarga',         col: '#6d28d9', bg: '#ede9fe' },
  importar:      { et: 'Importación',      col: '#0f766e', bg: '#ccfbf1' },
  accion:        { et: 'Acción',           col: '#4338ca', bg: '#e0e7ff' },
};

const ROLES = {
  admin: 'Administrador', directivo: 'Directivo', profesor: 'Docente',
  apoderado: 'Apoderado', alumno: 'Alumno', super_admin: 'Super admin',
};

// Etiquetas legibles para las claves de `details`
const CLAVES = {
  campos: 'Campos enviados', valores: 'Valores', query: 'Parámetros', archivos: 'Archivos',
  error: 'Error', motivo: 'Motivo', email: 'Email', recortado: 'Recortado',
};

const POR_PAGINA = 50;
const FILTROS_VACIOS = { user_id: '', event: '', entity: '', desde: '', hasta: '', q: '' };

function fmtFechaHora(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export function ChipEvento({ evento }) {
  const e = EVENTOS[evento] || { et: evento || '—', col: '#475569', bg: '#f1f5f9' };
  return <span className="ui-chip" style={{ color: e.col, background: e.bg }}>{e.et}</span>;
}

function ChipResultado({ item }) {
  const ok = item.ok !== false && !(item.status_code >= 400);
  return (
    <span className={`au-res ${ok ? 'ok' : 'err'}`} title={item.status_code ? `Código ${item.status_code}` : undefined}>
      <Icono nombre={ok ? 'check' : 'cruz'} tam={12} />
      {ok ? 'OK' : 'Error'}
      {item.status_code ? <small>{item.status_code}</small> : null}
    </span>
  );
}

function valorTexto(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (Array.isArray(v)) return v.length ? v.map(valorTexto).join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// details JSON como lista clave/valor (un nivel de anidación)
function ListaDetalles({ datos }) {
  if (!datos || typeof datos !== 'object' || !Object.keys(datos).length) {
    return <p className="ui-vacio" style={{ padding: 12 }}>Sin detalles adicionales.</p>;
  }
  return (
    <dl className="au-kv">
      {Object.entries(datos).map(([k, v]) => (
        <React.Fragment key={k}>
          <dt>{CLAVES[k] || k}</dt>
          <dd>
            {v && typeof v === 'object' && !Array.isArray(v) ? (
              <dl className="au-kv au-kv-sub">
                {Object.entries(v).map(([k2, v2]) => (
                  <React.Fragment key={k2}>
                    <dt>{k2}</dt>
                    <dd>{valorTexto(v2)}</dd>
                  </React.Fragment>
                ))}
              </dl>
            ) : valorTexto(v)}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function ModalDetalle({ item, onClose }) {
  const filas = [
    ['Fecha y hora', fmtFechaHora(item.created_at)],
    ['Usuario', item.user_name || item.user_email || 'Sin sesión'],
    ['Email', item.user_email],
    ['Rol', ROLES[item.role] || item.role],
    ['Evento', <ChipEvento evento={item.event} />],
    ['Entidad', item.entity ? `${item.entity}${item.entity_id ? ` #${item.entity_id}` : ''}` : null],
    ['Resultado', <ChipResultado item={item} />],
    ['Solicitud', item.method || item.path ? `${item.method || ''} ${item.path || ''}`.trim() : null],
    ['IP', item.ip],
    ['Navegador', item.user_agent],
  ];
  return (
    <Modal titulo="Detalle del registro" subtitulo={item.description} ancho={620} onClose={onClose}
      pie={<button type="button" className="ui-btn" onClick={onClose}>Cerrar</button>}>
      <dl className="au-kv">
        {filas.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => (
          <React.Fragment key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </React.Fragment>
        ))}
      </dl>
      <h4 className="au-sub">Detalles de la solicitud</h4>
      <ListaDetalles datos={item.details} />
    </Modal>
  );
}

function parametros(filtros) {
  const p = { tz: new Date().getTimezoneOffset() };
  Object.entries(filtros).forEach(([k, v]) => {
    if (v !== '' && v !== null && v !== undefined) p[k] = typeof v === 'string' ? v.trim() : v;
  });
  return p;
}

export default function AuditoriaPage() {
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [busqueda, setBusqueda] = useState('');
  const [page, setPage] = useState(1);
  const [datos, setDatos] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [exportando, setExportando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const pedido = useRef(0);

  // La búsqueda de texto espera a que se deje de escribir
  useEffect(() => {
    const t = setTimeout(() => {
      setFiltros(f => (f.q === busqueda ? f : { ...f, q: busqueda }));
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [busqueda]);

  const cargar = useCallback(async () => {
    const n = ++pedido.current;
    setCargando(true);
    try {
      const r = await axios.get('/api/auditoria', {
        params: { ...parametros(filtros), page, per_page: POR_PAGINA },
      });
      if (n !== pedido.current) return;
      const d = r?.data || {};
      setDatos({
        items: Array.isArray(d.items) ? d.items : [],
        total: d.total || 0,
        pages: d.pages || 1,
        page: d.page || page,
        usuarios: Array.isArray(d.usuarios) ? d.usuarios : [],
        entidades: Array.isArray(d.entidades) ? d.entidades : [],
      });
      setError(null);
    } catch (e) {
      if (n === pedido.current) setError(msgError(e, 'No se pudo cargar el historial.'));
    }
    if (n === pedido.current) setCargando(false);
  }, [filtros, page]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    let vivo = true;
    axios.get('/api/auditoria/resumen')
      .then(r => { if (vivo && r?.data) setResumen(r.data); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  const cambiar = (k) => (e) => {
    const v = e.target.value;
    setFiltros(f => ({ ...f, [k]: v }));
    setPage(1);
  };

  const limpiar = () => {
    setBusqueda('');
    setFiltros(FILTROS_VACIOS);
    setPage(1);
  };

  const exportar = async () => {
    setExportando(true);
    setAviso(null);
    try {
      const qs = new URLSearchParams(parametros(filtros)).toString();
      await descargarArchivo(`/api/auditoria/export.xlsx?${qs}`, 'historial_accesos_y_cambios.xlsx');
    } catch (e) {
      setAviso(e.message || 'No se pudo exportar el historial.');
    }
    setExportando(false);
  };

  const hayFiltros = busqueda || Object.entries(filtros).some(([k, v]) => k !== 'q' && v);
  const items = datos?.items || [];
  const pe = resumen?.por_evento || {};

  return (
    <div className="au">
      <div className="au-cab">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>Historial de accesos y cambios</h2>
          <p>Quién entró a la plataforma, qué modificó y qué descargó. Las contraseñas, firmas y archivos nunca se guardan aquí.</p>
        </div>
        <button type="button" className="ui-btn" onClick={exportar} disabled={exportando}>
          <Icono nombre="bajar" tam={15} /> {exportando ? 'Exportando…' : 'Exportar Excel'}
        </button>
      </div>

      {resumen && (
        <div className="au-resumen" aria-label="Últimos 7 días">
          {[
            ['Inicios de sesión', pe.login],
            ['Inicios fallidos', pe.login_fallido, (pe.login_fallido || 0) > 0 ? 'alerta' : ''],
            ['Cambios', (pe.crear || 0) + (pe.editar || 0) + (pe.eliminar || 0) + (pe.accion || 0) + (pe.importar || 0)],
            ['Descargas', pe.descargar],
            ['Con error', resumen.errores_7d, (resumen.errores_7d || 0) > 0 ? 'alerta' : ''],
          ].map(([et, v, cls]) => (
            <div key={et} className={`au-resumen-it ${cls || ''}`}>
              <b>{(v || 0).toLocaleString('es-CL')}</b><span>{et}</span>
            </div>
          ))}
          <p className="au-resumen-nota">Últimos 7 días</p>
        </div>
      )}

      <div className="card au-filtros">
        <div className="ui-campo">
          <label htmlFor="au-usuario">Usuario</label>
          <select id="au-usuario" value={filtros.user_id} onChange={cambiar('user_id')}>
            <option value="">Todos</option>
            {(datos?.usuarios || []).map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </div>
        <div className="ui-campo">
          <label htmlFor="au-evento">Tipo de evento</label>
          <select id="au-evento" value={filtros.event} onChange={cambiar('event')}>
            <option value="">Todos</option>
            {Object.entries(EVENTOS).map(([k, e]) => <option key={k} value={k}>{e.et}</option>)}
          </select>
        </div>
        <div className="ui-campo">
          <label htmlFor="au-entidad">Entidad</label>
          <select id="au-entidad" value={filtros.entity} onChange={cambiar('entity')}>
            <option value="">Todas</option>
            {(datos?.entidades || []).map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div className="ui-campo">
          <label htmlFor="au-desde">Desde</label>
          <input id="au-desde" type="date" value={filtros.desde} onChange={cambiar('desde')} />
        </div>
        <div className="ui-campo">
          <label htmlFor="au-hasta">Hasta</label>
          <input id="au-hasta" type="date" value={filtros.hasta} onChange={cambiar('hasta')} />
        </div>
        <div className="ui-campo au-buscar">
          <label htmlFor="au-q">Buscar</label>
          <input id="au-q" type="search" placeholder="Descripción, usuario o ruta…" value={busqueda}
            onChange={e => setBusqueda(e.target.value)} />
        </div>
        {hayFiltros && (
          <button type="button" className="ui-btn ui-btn-sm ui-btn-gris au-limpiar" onClick={limpiar}>
            <Icono nombre="cruz" tam={12} /> Limpiar filtros
          </button>
        )}
      </div>

      {aviso && <div className="ui-aviso ui-aviso-peligro">{aviso}</div>}
      {error && (
        <div className="ui-aviso ui-aviso-peligro">
          <span style={{ flex: 1 }}>{error}</span>
          <button type="button" className="ui-btn ui-btn-sm" onClick={cargar}>Reintentar</button>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="au-tabla">
            <thead>
              <tr>
                <th>Fecha y hora</th><th>Usuario</th><th>Evento</th><th>Descripción</th>
                <th>Entidad</th><th>IP</th><th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {!datos && cargando && (
                <tr><td colSpan={7}><div className="loading-container"><div className="spinner" /></div></td></tr>
              )}
              {datos && items.length === 0 && (
                <tr><td colSpan={7} className="ui-vacio">
                  {hayFiltros ? 'No hay registros con esos filtros.' : 'Todavía no hay registros en el historial.'}
                </td></tr>
              )}
              {items.map(it => (
                <tr key={it.id} className="au-fila" tabIndex={0}
                  onClick={() => setDetalle(it)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetalle(it); } }}>
                  <td className="au-fecha">{fmtFechaHora(it.created_at)}</td>
                  <td className="au-usuario">
                    <b>{it.user_name || it.user_email || 'Sin sesión'}</b>
                    {it.role && <span>{ROLES[it.role] || it.role}</span>}
                  </td>
                  <td><ChipEvento evento={it.event} /></td>
                  <td className="au-desc">{it.description || '—'}</td>
                  <td className="au-ent">
                    {it.entity || '—'}
                    {it.entity_id ? <span> #{it.entity_id}</span> : null}
                  </td>
                  <td className="au-ip">{it.ip || '—'}</td>
                  <td><ChipResultado item={it} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {datos && datos.total > 0 && (
        <div className="au-pag">
          <span>
            {datos.total.toLocaleString('es-CL')} {datos.total === 1 ? 'registro' : 'registros'}
            {' · '}Página {datos.page} de {datos.pages}
          </span>
          <div>
            <button type="button" className="ui-btn ui-btn-sm" disabled={page <= 1 || cargando}
              onClick={() => setPage(p => Math.max(p - 1, 1))}>Anterior</button>
            <button type="button" className="ui-btn ui-btn-sm" disabled={page >= datos.pages || cargando}
              onClick={() => setPage(p => p + 1)}>Siguiente</button>
          </div>
        </div>
      )}

      {resumen?.ultimos_accesos?.length > 0 && (
        <div className="card au-accesos">
          <h4 className="au-sub" style={{ marginTop: 0 }}>Último acceso por usuario</h4>
          <ul>
            {resumen.ultimos_accesos.slice(0, 12).map(u => (
              <li key={u.user_id}>
                <b>{u.nombre}</b>
                <span>{ROLES[u.role] || u.role}</span>
                <time>{fmtFechaHora(u.ultimo_login)}</time>
              </li>
            ))}
          </ul>
        </div>
      )}

      {detalle && <ModalDetalle item={detalle} onClose={() => setDetalle(null)} />}
    </div>
  );
}
