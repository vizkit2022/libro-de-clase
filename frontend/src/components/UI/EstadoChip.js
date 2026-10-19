import React from 'react';
import './ui.css';

export const ESTADOS_ENROLLMENT = {
  activo:        { et: 'Activo',        col: '#15803d', bg: '#dcfce7' },
  por_confirmar: { et: 'Por confirmar', col: '#b45309', bg: '#fef3c7' },
  retirado:      { et: 'Retirado',      col: '#b91c1c', bg: '#fee2e2' },
  trasladado:    { et: 'Trasladado',    col: '#1d4ed8', bg: '#dbeafe' },
  no_continua:   { et: 'No continúa',   col: '#475569', bg: '#e2e8f0' },
  egresado:      { et: 'Egresado',      col: '#6d28d9', bg: '#ede9fe' },
};

export default function EstadoChip({ estado }) {
  const e = ESTADOS_ENROLLMENT[estado] || ESTADOS_ENROLLMENT.activo;
  return <span className="ui-chip" style={{ color: e.col, background: e.bg }}>{e.et}</span>;
}
