import React, { useEffect } from 'react';
import './ui.css';

/**
 * Ventana modal con el estilo del marco (.modal-overlay / .modal de Layout.css).
 * Se cierra con Escape o tocando fuera, salvo mientras `ocupado` es true.
 */
export default function Modal({ titulo, subtitulo, onClose, children, pie, ancho = 520, ocupado = false }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape' && !ocupado) onClose?.(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose, ocupado]);

  return (
    <div className="modal-overlay ui-capa" onMouseDown={() => !ocupado && onClose?.()}>
      <div className="modal ui-modal" role="dialog" aria-modal="true" aria-label={titulo}
        style={{ maxWidth: ancho }} onMouseDown={e => e.stopPropagation()}>
        <div className="ui-modal-cab">
          <div style={{ minWidth: 0 }}>
            <h3>{titulo}</h3>
            {subtitulo && <p>{subtitulo}</p>}
          </div>
          <button type="button" className="modal-close" aria-label="Cerrar"
            disabled={ocupado} onClick={onClose}>×</button>
        </div>
        <div className="ui-modal-cuerpo">{children}</div>
        {pie && <div className="ui-modal-pie">{pie}</div>}
      </div>
    </div>
  );
}

// Fecha de hoy en formato AAAA-MM-DD según la hora local (no UTC)
export function hoyISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// '2026-03-04' o ISO con hora → '04-03-2026'
export function fmtFecha(v) {
  if (!v) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(v);
}

// Mensaje legible de un error de axios
export function msgError(e, porDefecto = 'No se pudo completar la acción') {
  const d = e?.response?.data;
  if (d && typeof d === 'object' && d.error) return d.error;
  if (e?.response?.status === 403) return 'Tu perfil no tiene permiso para hacer esto.';
  if (!e?.response && e?.message && !/status code/i.test(e.message)) return e.message;
  return porDefecto;
}
