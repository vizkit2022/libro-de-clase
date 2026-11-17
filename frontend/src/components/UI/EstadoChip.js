import React from 'react';
import './ui.css';

export const ESTADOS_ENROLLMENT = {
  activo:        { et: 'Activo',        col: '#1F5E43', bg: '#DDF0E6' },
  por_confirmar: { et: 'Por confirmar', col: '#7A4B00', bg: '#FFF0C7' },
  retirado:      { et: 'Retirado',      col: '#9A3412', bg: '#FDE2D7' },
  trasladado:    { et: 'Trasladado',    col: '#3D2A21', bg: '#FFF0C7' },
  no_continua:   { et: 'No continúa',   col: '#5C463A', bg: '#ECE8E3' },
  egresado:      { et: 'Egresado',      col: '#8A2846', bg: '#FCE4EC' },
};

export default function EstadoChip({ estado }) {
  const e = ESTADOS_ENROLLMENT[estado] || ESTADOS_ENROLLMENT.activo;
  return <span className="ui-chip" style={{ color: e.col, background: e.bg }}>{e.et}</span>;
}
