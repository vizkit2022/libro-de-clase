// Criterios con que se pinta el colegio. Cada uno entrega un puntaje 0-100
// por curso y por alumno; el color final es el promedio de los criterios
// elegidos que tengan dato (se suman, no se reemplazan).
//
// Para agregar uno nuevo (notas, convivencia, asistencia...): marcarlo
// `listo: true` y entregar su fuente con la misma forma que personalidad:
//   { cursos: [{ id, nombre, puntaje, alumnos: [{ id, nombre, apellido, puntaje }] }] }
export const CRITERIOS = [
  { id: 'personalidad', nombre: 'Personalidad', listo: true },
  { id: 'notas', nombre: 'Notas', listo: true },
  { id: 'convivencia', nombre: 'Convivencia', listo: true },
  { id: 'asistencia', nombre: 'Asistencia', listo: false },
];

const promedio = (vs) => {
  const ok = vs.filter(v => v !== null && v !== undefined);
  return ok.length ? Math.round(ok.reduce((a, b) => a + b, 0) / ok.length) : null;
};

// fuentes: { [criterioId]: { cursos: [...] } }; seleccion: ids de criterios
export function combinar(fuentes, seleccion) {
  const activos = seleccion.filter(id => fuentes[id]?.cursos);
  const base = activos.length ? fuentes[activos[0]] : Object.values(fuentes).find(f => f?.cursos);
  if (!base) return [];
  // índices por criterio: curso -> puntaje, alumno -> puntaje
  const indice = (id) => {
    const cursos = new Map(); const alumnos = new Map();
    fuentes[id].cursos.forEach(c => {
      cursos.set(c.id, c);
      (c.alumnos || []).forEach(a => alumnos.set(`${c.id}:${a.id}`, a));
    });
    return { id, cursos, alumnos };
  };
  const idx = activos.map(indice);
  // Todos los criterios con datos, aunque no estén encendidos: la tarjeta del
  // alumno los muestra igual (solo los encendidos cuentan para el color)
  const todos = CRITERIOS.filter(c => fuentes[c.id]?.cursos).map(c => indice(c.id));
  // Datos que viajan aparte del puntaje para mostrarlos tal cual:
  // la nota (1-7) de Notas y los casos de Convivencia
  const extra = (i, k, campo, mapa) => {
    const o = i?.[mapa].get(k);
    return o && o[campo] !== undefined ? { [campo]: o[campo] } : {};
  };
  return base.cursos.map(c => {
    const detalle = Object.fromEntries(idx.map(i => [i.id, i.cursos.get(c.id)?.puntaje ?? null]));
    const deNotas = idx.find(i => i.id === 'notas');
    const deConv = idx.find(i => i.id === 'convivencia');
    return {
      ...c,
      ...extra(deNotas, c.id, 'nota', 'cursos'),
      ...extra(deConv, c.id, 'casos', 'cursos'),
      detalle,
      puntaje: promedio(Object.values(detalle)),
      alumnos: (c.alumnos || []).map(a => {
        const k = `${c.id}:${a.id}`;
        const det = Object.fromEntries(idx.map(i => [i.id, i.alumnos.get(k)?.puntaje ?? null]));
        // origen: el alumno tal como lo entrega cada criterio, para explicar su color;
        // todosDet: su puntaje en cada criterio con datos, encendido o no
        const origen = Object.fromEntries(todos.map(i => [i.id, i.alumnos.get(k) || null]));
        const todosDet = Object.fromEntries(todos.map(i => [i.id, i.alumnos.get(k)?.puntaje ?? null]));
        return {
          ...a, ...extra(deNotas, k, 'nota', 'alumnos'), ...extra(deConv, k, 'casos', 'alumnos'),
          detalle: det, todosDet, origen, puntaje: promedio(Object.values(det)),
        };
      }),
    };
  });
}
