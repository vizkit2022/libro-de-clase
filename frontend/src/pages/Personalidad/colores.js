// Escala de color del informe de personalidad: rojo (0) → naranjo → verde (100).
// El puntaje va de 0 a 100 (S=100, G=70, AV=35, N=0; "No Observado" no cuenta).

export const UMBRAL_BAJO = 50;   // bajo esto la sala o el alumno se pinta rojo
export const UMBRAL_ALTO = 75;   // desde aquí, verde

const SIN_DATO = { base: '#C9C1B8', claro: '#E4DED7', oscuro: '#A99F95', texto: '#5C463A' };

// Escala continua: 100 es verde pleno y cada punto menos lo acerca al
// amarillo, al naranjo y al rojo, que se alcanza en 40 o menos. La curva
// hace que la baja se note desde arriba: 89 ya es verde amarillento,
// 80 amarillo, 70 naranjo y 55 rojo anaranjado.
const HUE_VERDE = 125;
const PISO_ROJO = 40;
const CURVA = 1.5;
function hue(p) {
  const t = Math.max(0, (p - PISO_ROJO) / (100 - PISO_ROJO));
  return HUE_VERDE * Math.pow(t, CURVA);
}

export function colorPuntaje(p) {
  if (p === null || p === undefined) return SIN_DATO;
  const v = Math.max(0, Math.min(100, p));
  const h = Math.round(hue(v));
  // Los rojos van un poco más saturados para que llamen la atención
  const s = Math.round(62 + (1 - v / 100) * 14);
  return {
    base: `hsl(${h} ${s}% 52%)`,
    claro: `hsl(${h} ${s}% 66%)`,
    oscuro: `hsl(${h} ${s}% 38%)`,
    texto: `hsl(${h} 60% 18%)`,
  };
}

// Degradado de 0 a 100 para las leyendas
export const DEGRADADO_PUNTAJE = `linear-gradient(90deg, ${
  [0, 15, 30, 45, 60, 75, 90, 100].map(p => `${colorPuntaje(p).base} ${p}%`).join(', ')})`;

export function etiquetaPuntaje(p) {
  if (p === null || p === undefined) return 'Sin datos';
  if (p < UMBRAL_BAJO) return 'Requiere atención';
  if (p < UMBRAL_ALTO) return 'En desarrollo';
  return 'Logrado';
}
