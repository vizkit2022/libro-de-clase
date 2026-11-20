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
export const ALTO_PISO = MURO * 1.25;  // cuánto sube cada piso
const MAX_UN_PISO = 12;    // con más cursos que esto, el colegio crece a 2 pisos

export function armarPlano(todos) {
  // Con muchos cursos el colegio tiene 2 pisos: la mitad arriba, sobre las mismas salas
  const dosPisos = todos.length > MAX_UN_PISO;
  const n1 = dosPisos ? Math.ceil(todos.length / 2) : todos.length;
  const cursos = todos.slice(0, n1);
  const arriba = todos.slice(n1);
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
    piso: 1, dz: 0,
  });

  for (let i = 0; i < norte; i++) agregar(i * W, 0, sig());
  const y0 = D + C;
  for (let j = 0; j < lado; j++) agregar(0, y0 + j * D, sig());
  for (let j = 0; j < lado; j++) agregar(anchoTotal - W, y0 + j * D, sig());

  const yF = y0 + altoAlas + C;
  const entrada = 120;
  const resto = (anchoTotal - entrada) / 2;
  // Segundo piso: los cursos que siguen, sobre las salas del primero (no sobre los servicios)
  const salasP1 = espacios.slice();
  arriba.forEach((c, j) => {
    const b = salasP1[j];
    if (b) espacios.push({ ...b, tipo: 'sala', curso: c, nombre: c.nombre, piso: 2, dz: ALTO_PISO });
  });
  const frente = (x, nombre) => espacios.push({ tipo: 'otro', x, y: yF, w: resto / 2, d: D * 0.8, nombre,
    piso: 1, dz: 0 });
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
    pisos: dosPisos ? 2 : 1,
  };
}
