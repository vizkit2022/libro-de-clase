// Plano del colegio en un nivel: las salas rodean un patio central
// (mismo plano del video, video-personalidad/src/plano.ts).
//
//   ┌──────┬──────┬──────┬──────┐   ala norte (salas)
//   ├──────┴──────┴──────┴──────┤   pasillo
//   │ sala │     patio      │ sala│   alas oeste y este
//   ├──────┬──────┬──┬──────┬────┤
//   │Direc.│Biblio│▲ │Comedor│Baños│  frente (entrada al medio)
//   └──────┴──────┴──┴──────┴────┘

export const W = 230;      // ancho de una sala
export const D = 165;      // fondo de una sala
export const C = 46;       // ancho del pasillo
export const MURO = 46;    // alto de los muros

export function armarPlano(cursos) {
  const n = cursos.length;
  const lado = Math.max(1, Math.floor(n * 0.3));
  const norte = Math.max(3, n - 2 * lado);
  const anchoTotal = norte * W;
  const altoAlas = lado * D;
  const espacios = [];
  let k = 0;
  const sig = () => cursos[k++];
  const agregar = (x, y, c) => espacios.push({
    tipo: c ? 'sala' : 'otro', x, y, w: W, d: D, curso: c, nombre: c?.nombre ?? 'Taller',
  });

  for (let i = 0; i < norte; i++) agregar(i * W, 0, sig());
  const y0 = D + C;
  for (let j = 0; j < lado; j++) agregar(0, y0 + j * D, sig());
  for (let j = 0; j < lado; j++) agregar(anchoTotal - W, y0 + j * D, sig());

  const yF = y0 + altoAlas + C;
  const entrada = 120;
  const resto = (anchoTotal - entrada) / 2;
  const frente = (x, nombre) => espacios.push({ tipo: 'otro', x, y: yF, w: resto / 2, d: D * 0.8, nombre });
  frente(0, 'Dirección');
  frente(resto / 2, 'Biblioteca');
  frente(resto + entrada, 'Comedor');
  frente(resto + entrada + resto / 2, 'Baños');

  return {
    espacios,
    patio: { x: W + C, y: y0, w: anchoTotal - 2 * (W + C), d: altoAlas },
    pasillos: [
      { x: 0, y: D, w: anchoTotal, d: C },
      { x: W, y: y0, w: C, d: altoAlas },
      { x: anchoTotal - W - C, y: y0, w: C, d: altoAlas },
      { x: 0, y: y0 + altoAlas, w: anchoTotal, d: C },
    ],
    entrada: { x: resto, y: yF, w: entrada, d: D * 0.8 },
    ancho: anchoTotal, fondo: yF + D * 0.8,
  };
}
