import React from 'react';

/**
 * Íconos del menú, como trazos SVG.
 *
 * Reemplazan a los emojis que usaba el menú: los emojis cambian de dibujo
 * según el sistema operativo, no heredan el color del texto y le restan
 * seriedad a una herramienta de gestión.
 */
const TRAZOS = {
  panel: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  personas: <><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>,
  colegio: <><path d="M3 21h18M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /></>,
  libro: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
  libros: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>,
  lista: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8.5 8h7M8.5 12h7M8.5 16h4" /></>,
  lapiz: <><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  calendario: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  reloj: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  convivencia: <><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="m17 11 2 2 4-4" /></>,
  grafico: <><path d="M3 3v18h18" /><path d="m7 15 3.5-4 3 2.5L20 7" /></>,
  escanear: <><path d="M3 9V6a2 2 0 0 1 2-2h3M16 4h3a2 2 0 0 1 2 2v3M21 15v3a2 2 0 0 1-2 2h-3M8 20H5a2 2 0 0 1-2-2v-3" /><circle cx="12" cy="12" r="3" /></>,
  pizarra: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  familia: <><circle cx="9" cy="8" r="3.4" /><path d="M2.5 21v-1.6A4.4 4.4 0 0 1 7 15h4a4.4 4.4 0 0 1 4.5 4.4V21" /><circle cx="18" cy="10.5" r="2.2" /><path d="M21.5 21v-1a3 3 0 0 0-2.4-2.9" /></>,
  cohete: <><path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.74-.84.73-2.1-.08-2.9a2.05 2.05 0 0 0-2.92-.1z" /><path d="M12 15 9 12a11 11 0 0 1 2-3.5C13.2 5.7 16.5 4 21 4c0 4.5-1.7 7.8-4.5 10a11 11 0 0 1-3.5 2z" /><path d="M9 12H5s.5-2.3 1.7-3.2C8 7.8 11 8 11 8" /></>,
  salir: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>,
  menu: <><path d="M3 6h18M3 12h18M3 18h18" /></>,
  alerta: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  candado: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  abajo: <><path d="m6 9 6 6 6-6" /></>,
  check: <><path d="M20 6 9 17l-5-5" /></>,
  cruz: <><path d="M18 6 6 18M6 6l12 12" /></>,
  mas: <><path d="M12 5v14M5 12h14" /></>,
  flechas: <><path d="M17 3l4 4-4 4" /><path d="M3 7h18" /><path d="M7 21l-4-4 4-4" /><path d="M21 17H3" /></>,
  subir: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5M12 3v12" /></>,
  bajar: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>,
  ascenso: <><path d="m18 15-6-6-6 6" /><path d="m18 21-6-6-6 6" /></>,
  deshacer: <><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-15-6.7L3 13" /></>,
  birrete: <><path d="M22 10 12 5 2 10l10 5 10-5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></>,
  puntos: <><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>,
  historial: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></>,
  ajustes: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
};

export function Icono({ nombre, tam = 17 }) {
  const trazo = TRAZOS[nombre];
  if (!trazo) return null;
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round"
         strokeLinejoin="round" aria-hidden="true">
      {trazo}
    </svg>
  );
}

export default Icono;
