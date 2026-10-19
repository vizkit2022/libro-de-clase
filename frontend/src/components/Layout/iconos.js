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
