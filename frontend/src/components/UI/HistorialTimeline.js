import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Icono } from '../Layout/iconos';
import './ui.css';

export const EVENTOS = {
  matricula:       { et: 'Matrícula',             icono: 'mas',      col: '#15803d', bg: '#dcfce7' },
  importacion:     { et: 'Importación',           icono: 'subir',    col: '#1d4ed8', bg: '#dbeafe' },
  retiro:          { et: 'Retiro',                icono: 'cruz',     col: '#b91c1c', bg: '#fee2e2' },
  cambio_curso:    { et: 'Cambio de curso',       icono: 'flechas',  col: '#b45309', bg: '#fef3c7' },
  promocion:       { et: 'Promoción',             icono: 'ascenso',  col: '#4338ca', bg: '#e0e7ff' },
  confirmacion:    { et: 'Matrícula confirmada',  icono: 'check',    col: '#15803d', bg: '#dcfce7' },
  repite:          { et: 'Repite curso',          icono: 'deshacer', col: '#b45309', bg: '#fef3c7' },
  no_continua:     { et: 'No continúa',           icono: 'cruz',     col: '#475569', bg: '#e2e8f0' },
  egreso:          { et: 'Egreso',                icono: 'birrete',  col: '#6d28d9', bg: '#ede9fe' },
  reincorporacion: { et: 'Reincorporación',       icono: 'deshacer', col: '#15803d', bg: '#dcfce7' },
  ficha_editada:   { et: 'Ficha editada',         icono: 'lapiz',    col: '#475569', bg: '#f1f5f9' },
};

function fmtFechaHora(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// `detalles` puede venir como objeto, como texto JSON o vacío
function camposDe(detalles) {
  let d = detalles;
  if (typeof d === 'string') {
    try { d = JSON.parse(d); } catch { return []; }
  }
  return Array.isArray(d?.campos) ? d.campos : [];
}

const vacio = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

function Evento({ ev }) {
  const [abierto, setAbierto] = useState(false);
  const tipo = EVENTOS[ev.evento] || { et: ev.evento || 'Evento', icono: 'historial', col: '#475569', bg: '#f1f5f9' };
  const campos = camposDe(ev.detalles);
  const curso = ev.curso_origen && ev.curso && ev.curso_origen !== ev.curso
    ? `${ev.curso_origen} → ${ev.curso}` : ev.curso;

  return (
    <li className="ui-tl-item">
      <span className="ui-tl-punto" style={{ color: tipo.col, background: tipo.bg }}>
        <Icono nombre={tipo.icono} tam={14} />
      </span>
      <div className="ui-tl-cont">
        <div className="ui-tl-cab">
          <b>{tipo.et}</b>
          {curso && <span className="ui-tl-tag">{curso}</span>}
          {ev.year && <span className="ui-tl-tag">{ev.year}</span>}
        </div>
        {ev.descripcion && <p className="ui-tl-desc">{ev.descripcion}</p>}
        <p className="ui-tl-meta">
          {fmtFechaHora(ev.fecha)} · {ev.usuario ? `por ${ev.usuario}` : 'Sistema'}
        </p>
        {campos.length > 0 && (
          <>
            <button type="button" className="ui-tl-toggle" aria-expanded={abierto}
              onClick={() => setAbierto(v => !v)}>
              {abierto ? 'Ocultar cambios' : `Ver ${campos.length} ${campos.length === 1 ? 'cambio' : 'cambios'}`}
              <span style={{ display: 'inline-flex', transform: abierto ? 'rotate(180deg)' : 'none' }}>
                <Icono nombre="abajo" tam={13} />
              </span>
            </button>
            {abierto && (
              <ul className="ui-tl-campos">
                {campos.map((c, i) => (
                  <li key={i}>
                    <span className="ui-tl-campo">{c.campo}</span>
                    <span className="ui-tl-antes">{vacio(c.antes)}</span>
                    <span className="ui-tl-flecha" aria-label="cambió a">→</span>
                    <span className="ui-tl-despues">{vacio(c.despues)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </li>
  );
}

/** Línea de tiempo con el historial de matrícula y ficha de un alumno. */
export default function HistorialTimeline({ studentId }) {
  const [eventos, setEventos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vivo = true;
    setEventos(null);
    setError(null);
    axios.get(`/api/matricula/alumnos/${studentId}/historial`)
      .then(r => { if (vivo) setEventos(Array.isArray(r.data?.eventos) ? r.data.eventos : []); })
      .catch(e => {
        if (!vivo) return;
        const st = e?.response?.status;
        setError(st === 403 ? 'Tu perfil no tiene acceso al historial de este alumno.'
          : st === 404 ? 'El historial todavía no está disponible.'
            : 'No se pudo cargar el historial. Inténtalo nuevamente.');
      });
    return () => { vivo = false; };
  }, [studentId]);

  if (error) return <p className="ui-vacio">{error}</p>;
  if (!eventos) return <div className="loading-container" style={{ height: 120 }}><div className="spinner" /></div>;
  if (!eventos.length) {
    return (
      <p className="ui-vacio">
        Todavía no hay movimientos registrados. Desde ahora, cada matrícula, retiro,
        cambio de curso o edición de la ficha quedará anotada aquí.
      </p>
    );
  }
  return (
    <ol className="ui-tl">
      {eventos.map((ev, i) => <Evento key={ev.id ?? i} ev={ev} />)}
    </ol>
  );
}
