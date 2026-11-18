// Escala de color del informe de personalidad: rojo (bajo) → ámbar → verde (alto).
// El puntaje va de 0 a 100 (S=100, G=70, AV=35, N=0; "No Observado" no cuenta).

export const UMBRAL_BAJO = 50;   // bajo esto la sala o el alumno se pinta rojo
export const UMBRAL_ALTO = 75;   // desde aquí, verde

const SIN_DATO = { base: '#C9C1B8', claro: '#E4DED7', oscuro: '#A99F95', texto: '#5C463A' };

function hue(p) {
  // bajo 50: rojo; 50-74: ámbar → amarillo; 75+: verde
  if (p < UMBRAL_BAJO) return 1 + (p / UMBRAL_BAJO) * 7;
  if (p < UMBRAL_ALTO) return 34 + ((p - UMBRAL_BAJO) / (UMBRAL_ALTO - UMBRAL_BAJO)) * 18;
  return 95 + ((p - UMBRAL_ALTO) / (100 - UMBRAL_ALTO)) * 50;
}

export function colorPuntaje(p) {
  if (p === null || p === undefined) return SIN_DATO;
  const h = Math.round(hue(Math.max(0, Math.min(100, p))));
  const s = p < UMBRAL_BAJO ? 74 : 62;
  return {
    base: `hsl(${h} ${s}% 52%)`,
    claro: `hsl(${h} ${s}% 66%)`,
    oscuro: `hsl(${h} ${s}% 38%)`,
    texto: `hsl(${h} 60% 18%)`,
  };
}

export function etiquetaPuntaje(p) {
  if (p === null || p === undefined) return 'Sin datos';
  if (p < UMBRAL_BAJO) return 'Requiere atención';
  if (p < UMBRAL_ALTO) return 'En desarrollo';
  return 'Logrado';
}
