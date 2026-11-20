import React, { useEffect, useMemo, useRef, useState } from 'react';
import { colorPuntaje, etiquetaPuntaje, DEGRADADO_PUNTAJE } from '../../pages/Personalidad/colores';
import { P, Piso, Caja, SalaIso, EspacioIso, ArbolIso, grillaAlumnos } from './iso';
import FichaRapida from './FichaRapida';
import { armarPlano, MURO, ALTO_PISO } from './plano';
import { CRITERIOS } from './criterios';
import './ColegioIso.css';

const DUR = 900; // ms que tarda en abrirse una sala

function limites(ps) {
  const xs = ps.map(p => p[0]); const ys = ps.map(p => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

// Encuadre de todo el colegio
function vbColegio(plano) {
  const alto = MURO * 1.6 + ALTO_PISO * (plano.pisos - 1);
  const l = limites([P(-50, -50, alto), P(plano.ancho + 50, -50, alto),
    P(-50, plano.fondo + 90), P(plano.ancho + 50, plano.fondo + 90)]);
  return [l.x0, l.y0 - 10, l.x1 - l.x0, l.y1 - l.y0 + 10];
}

// Encuadre de una sala, a la izquierda para dejar sitio a la lista de alumnos
function vbSala(e, aspecto) {
  const z = e.dz || 0;
  const l = limites([P(e.x - 6, e.y - 6, MURO * 1.6 + z), P(e.x + e.w, e.y - 6, MURO * 1.6 + z),
    P(e.x - 6, e.y + e.d, z), P(e.x + e.w, e.y + e.d, z)]);
  let w = (l.x1 - l.x0) / 0.58; let h = w / aspecto;
  if (h < (l.y1 - l.y0) * 1.15) { h = (l.y1 - l.y0) * 1.15; w = h * aspecto; }
  return [l.x0 - w * 0.04, (l.y0 + l.y1) / 2 - h / 2, w, h];
}

// Encuadre de un alumno sentado en su banco, con sitio a la derecha para la tarjeta
function vbAlumno(e, curso, al, aspecto) {
  const i = (curso.alumnos || []).findIndex(a => a.id === al.id);
  const { s, pos } = grillaAlumnos(e.x, e.y, e.w, e.d, (curso.alumnos || []).length);
  const p = pos(Math.max(0, i));
  const [cx, cy] = P(p.x + s * 0.3, p.y + s * 0.3, s * 0.5 + (e.dz || 0));
  const h = s * 6; const w = h * aspecto;
  return [cx - w * 0.3, cy - h * 0.5, w, h];
}

// Valor animado 0..1 con requestAnimationFrame
function useTween(dur) {
  const [v, setV] = useState(0);
  const ref = useRef(0); const raf = useRef(null);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const ir = (hacia, alTerminar) => {
    cancelAnimationFrame(raf.current);
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const desde = ref.current; const t0 = performance.now();
    const paso = (ahora) => {
      const k = reducido ? 1 : Math.min(1, (ahora - t0) / dur);
      ref.current = desde + (hacia - desde) * k;
      setV(ref.current);
      if (k < 1) raf.current = requestAnimationFrame(paso);
      else if (alTerminar) alTerminar();
    };
    raf.current = requestAnimationFrame(paso);
  };
  return [v, ir];
}

// "Josefa Poblete Contreras" -> "Josefa P."
const corto = (a) => `${(a.nombre || '').split(' ')[0]} ${(a.apellido || '').charAt(0)}${a.apellido ? '.' : ''}`.trim();

const mezcla = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// El colegio en isométrico. Primera vista: cada curso es una sala cerrada
// con el techo verde, ámbar o rojo según su puntaje. Al hacer clic la sala
// se abre (el techo sube) y se ven sus alumnos, cada uno con su color.
export default function ColegioIso({ cursos, criterios = ['personalidad'], areas = [] }) {
  const [hover, setHover] = useState(null);
  const [sel, setSel] = useState(null);      // espacio abierto (o cerrándose)
  const [t, animar] = useTween(DUR);         // 0 colegio, 1 sala abierta
  const [alId, setAlId] = useState(null);    // alumno enfocado
  const [z, enfocar] = useTween(750);        // 0 sala, 1 zoom al alumno
  const [alHover, setAlHover] = useState(null); // alumno bajo el mouse (sala abierta)
  const [pisoVer, setPisoVer] = useState(0);    // 0 ambos pisos, 1 o 2 solo ese piso
  const plano = useMemo(() => armarPlano(cursos), [cursos]);
  const { patio, pasillos, entrada } = plano;

  const vbBase = useMemo(() => vbColegio(plano), [plano]);
  const aspecto = vbBase[2] / vbBase[3];
  // El curso se busca de nuevo en los datos: al cambiar los criterios cambian sus colores
  const cursoSel = sel ? cursos.find(c => c.id === sel.curso?.id) || sel.curso : null;
  const al = cursoSel && alId != null ? (cursoSel.alumnos || []).find(a => a.id === alId) : null;
  let vb = sel ? mezcla(vbBase, vbSala(sel, aspecto), suave(t)) : vbBase;
  if (sel && al) vb = mezcla(vb, vbAlumno(sel, cursoSel, al, aspecto), suave(z));

  const abrir = (e) => { if (sel) return; setHover(null); setSel(e); animar(1); };
  const soltarAlumno = (luego) => enfocar(0, () => { setAlId(null); if (luego) luego(); });
  const cerrar = () => (alId != null ? soltarAlumno(() => animar(0, () => setSel(null)))
    : animar(0, () => setSel(null)));
  const verAlumno = (a) => { setAlId(a.id); enfocar(1); };

  useEffect(() => {
    if (!sel) return undefined;
    const tecla = (ev) => { if (ev.key === 'Escape') (alId != null ? soltarAlumno() : cerrar()); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  });

  // De atrás hacia adelante, para que lo cercano tape a lo lejano
  const prof = (e) => e.x + e.w / 2 + e.y + e.d / 2;
  // Cada columna de salas se dibuja de abajo hacia arriba (piso 1 y luego piso 2)
  // Con un piso elegido, el de arriba no se dibuja y el de abajo queda tenue
  const visibles = plano.espacios.filter(e => !(pisoVer === 1 && e.piso === 2));
  const orden = [...visibles].sort((a, b) => prof(a) - prof(b) || a.piso - b.piso);
  const tapada = (e) => visibles.some(o => o.piso > e.piso && o.x === e.x && o.y === e.y);
  const mismo = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y && a.piso === b.piso;
  const arboles = [[0.12, 0.12], [0.88, 0.14], [0.1, 0.9], [0.9, 0.88]]
    .map(([fx, fy]) => ({ x: patio.x + patio.w * fx, y: patio.y + patio.d * fy }));
  const cancha = (fx, fy) => P(patio.x + patio.w * fx, patio.y + patio.d * fy);

  const nodos = [
    ...orden.map((e, i) => {
      const esSel = mismo(sel, e);
      // La sala de arriba de la que se abre desaparece del todo; el resto queda tenue
      const encima = !!sel && e.x === sel.x && e.y === sel.y && e.piso > sel.piso;
      const base = pisoVer === 2 && e.piso === 1 ? 0.45 : 1;
      const opacidad = (!sel || esSel ? 1 : encima ? 1 - suave(t) : 1 - suave(t) * 0.82) * base;
      const techo = esSel ? t : 0;
      return {
        k: prof(e),
        n: (
          <g key={`${e.x}-${e.y}-${e.piso}`} className={`ci-esp ${e.curso && !sel ? 'ci-sala' : ''}`}
             transform={e.dz ? `translate(0 ${-e.dz})` : undefined}
             style={{ animationDelay: `${i * 45}ms`, opacity: opacidad }}
             onClick={e.curso ? () => abrir(e) : undefined}
             onPointerEnter={e.curso && !sel ? () => setHover({ ...e.curso, piso: plano.pisos > 1 ? e.piso : null }) : undefined}
             onPointerLeave={e.curso ? () => setHover(null) : undefined}>
            {e.tipo === 'sala'
              ? <SalaIso x={e.x} y={e.y} w={e.w} d={e.d} muro={MURO} curso={e.curso}
                  techo={techo} caras={esSel && t > 0.85}
                  alumnoSel={esSel && z > 0.02 ? alId : null}
                  onAlumno={esSel && t > 0.9 ? verAlumno : undefined}
                  onHoverAlumno={esSel && t > 0.9 ? setAlHover : undefined} />
              : <EspacioIso x={e.x} y={e.y} w={e.w} d={e.d} muro={MURO} nombre={e.nombre} />}
          </g>
        ),
      };
    }),
    ...arboles.map((a, i) => ({ k: a.x + a.y, n: <ArbolIso key={`t${i}`} x={a.x} y={a.y} r={22} /> })),
    { k: entrada.x + entrada.y + 200, n: (
      <g key="arco">
        <Caja x={entrada.x + 8} y={entrada.y + entrada.d - 10} w={12} d={10} h={MURO + 22} c="#FF7417" />
        <Caja x={entrada.x + entrada.w - 20} y={entrada.y + entrada.d - 10} w={12} d={10} h={MURO + 22} c="#FF7417" />
        <Caja x={entrada.x + 8} y={entrada.y + entrada.d - 10} z={MURO + 22} w={entrada.w - 16} d={10} h={14} c="#FF7417" />
      </g>) },
  ].sort((a, b) => a.k - b.k).map(o => o.n);

  const curso = cursoSel;
  const alumnos = curso ? [...(curso.alumnos || [])].sort((a, b) => (a.puntaje ?? 999) - (b.puntaje ?? 999)) : [];
  const nombresCrit = Object.fromEntries(CRITERIOS.map(c => [c.id, c.nombre]));

  return (
    <div className={`ci ${sel ? 'abierto' : ''}`}>
      {plano.pisos > 1 && !sel && (
        <div className="ci-pisos" role="group" aria-label="Pisos">
          {[[0, 'Ambos pisos'], [1, 'Piso 1'], [2, 'Piso 2']].map(([v, txt]) => (
            <button key={v} type="button" className={pisoVer === v ? 'on' : ''}
              aria-pressed={pisoVer === v} onClick={() => setPisoVer(v)}>{txt}</button>
          ))}
        </div>
      )}
      <svg viewBox={vb.join(' ')} role="img" aria-label={`Plano del colegio con ${cursos.length} cursos`}>
        <Piso x={-50} y={-50} w={plano.ancho + 100} d={plano.fondo + 140} c="#DCEBC8" />
        <Piso x={patio.x} y={patio.y} w={patio.w} d={patio.d} c="#A9D48A" />
        <Piso x={patio.x + patio.w * 0.22} y={patio.y + patio.d * 0.25} w={patio.w * 0.56} d={patio.d * 0.5} c="#9CCFEF" />
        <polygon fill="none" stroke="#fff" strokeWidth={2}
          points={[cancha(0.25, 0.28), cancha(0.75, 0.28), cancha(0.75, 0.72), cancha(0.25, 0.72)].map(p => p.join(',')).join(' ')} />
        {pasillos.map((p, i) => <Piso key={i} {...p} c="#ECE3D2" />)}
        <Piso {...entrada} c="#E2D6C1" />
        <Piso x={entrada.x + entrada.w * 0.3} y={entrada.y + entrada.d} w={entrada.w * 0.4} d={70} c="#E2D6C1" />
        {nodos}
        {/* etiquetas sobre cada techo; se esconden al abrir una sala */}
        <g opacity={1 - Math.min(1, t * 2)} pointerEvents={sel ? 'none' : undefined}>
          {visibles.filter(e => e.tipo === 'sala' && !tapada(e) && !(pisoVer === 2 && e.piso === 1)).map(e => {
            const [lx, ly] = P(e.x + e.w * 0.5, e.y + e.d * 0.5, MURO * 1.2 + 14 + (e.dz || 0));
            const c = colorPuntaje(e.curso.puntaje);
            const txt = e.curso.puntaje == null ? e.nombre : `${e.nombre} · ${e.curso.puntaje}`;
            const ancho = txt.length * 12 + 40;
            return (
              <g key={`l${e.x}-${e.y}-${e.piso}`} className="ci-etq" transform={`translate(${lx}, ${ly - 18})`}
                 onClick={() => abrir(e)}>
                <rect x={-ancho / 2} y={0} width={ancho} height={36} rx={18} fill="#fff" stroke={c.base} strokeWidth={3} />
                <circle cx={-ancho / 2 + 19} cy={18} r={8} fill={c.base} />
                <text x={10} y={25} textAnchor="middle" fontSize={21} fontWeight={700} fill="#2B1B14">{txt}</text>
              </g>
            );
          })}
        </g>
        {/* nombre corto sobre la cabeza del alumno bajo el mouse y del enfocado */}
        {sel && t > 0.9 && cursoSel && [...new Set([alHover?.id, alId].filter(v => v != null))].map(id => {
          const lista = cursoSel.alumnos || [];
          const i = lista.findIndex(a => a.id === id);
          if (i < 0) return null;
          const a = lista[i];
          const { s, pos } = grillaAlumnos(sel.x, sel.y, sel.w, sel.d, lista.length);
          const p = pos(i);
          const [lx, ly] = P(p.x + s * 0.3, p.y + s * 0.42, s * (alId === id ? 1.62 : 1.38) + (sel.dz || 0));
          const f = s * 0.42 * (1 - suave(z) * 0.45);
          const txt = `${corto(a)} · ${a.puntaje ?? '—'}`;
          const ancho = txt.length * f * 0.56 + f * 1.4;
          const col = colorPuntaje(a.puntaje).base;
          return (
            <g key={`n${id}`} className="ci-nombre" transform={`translate(${lx} ${ly})`} pointerEvents="none">
              <rect x={-ancho / 2} y={-f * 1.25} width={ancho} height={f * 1.6} rx={f * 0.8}
                fill="#fff" stroke={col} strokeWidth={f * 0.14} />
              <text x={0} y={-f * 0.12} textAnchor="middle" fontSize={f} fontWeight={700} fill="#2B1B14">{txt}</text>
            </g>
          );
        })}
      </svg>

      {hover && !sel && (
        <div className="ci-tip">
          <b>{hover.nombre}{hover.piso ? <em className="ci-piso">Piso {hover.piso}</em> : null}</b>
          <span>{etiquetaPuntaje(hover.puntaje)}{hover.puntaje != null ? ` · ${hover.puntaje}/100` : ''}</span>
          <small>{(hover.alumnos || []).length} alumnos · clic para entrar a la sala</small>
        </div>
      )}

      {curso && (
        <aside className="ci-panel" style={{ opacity: Math.max(0, (t - 0.5) * 2) }}>
          {al ? (
            <FichaRapida key={al.id} al={al} curso={curso} areas={areas} criterios={criterios}
              onVolver={() => soltarAlumno()} />
          ) : (<>
          <button type="button" className="ci-volver" onClick={cerrar}>← Volver al colegio</button>
          <div className="ci-panel-cab">
            <h4>{curso.nombre}</h4>
            <span className="ci-nota" style={{ background: colorPuntaje(curso.puntaje).base }}>
              {curso.puntaje ?? '—'}
            </span>
          </div>
          <p className="ci-panel-sub">
            {etiquetaPuntaje(curso.puntaje)}
            {curso.nota != null ? ` · promedio de notas ${curso.nota.toFixed(1).replace('.', ',')}` : ''}
            {curso.casos > 0 ? ` · ${curso.casos} caso${curso.casos === 1 ? '' : 's'} de convivencia` : ''}
            {curso.profesor_jefe ? ` · Prof. jefe ${curso.profesor_jefe}` : ''}
          </p>
          {curso.detalle && Object.keys(curso.detalle).length > 1 && (
            <div className="ci-crit">
              {Object.entries(curso.detalle).map(([id, p]) => (
                <span key={id}><i style={{ background: colorPuntaje(p).base }} />{nombresCrit[id]} {p ?? '—'}</span>
              ))}
            </div>
          )}
          <h5>Alumnos, de menor a mayor</h5>
          {alumnos.length === 0 && <p className="ci-panel-sub">Este curso no tiene alumnos activos.</p>}
          <ol className="ci-alumnos">
            {alumnos.map(a => (
              <li key={a.id} onClick={() => verAlumno(a)} role="button" tabIndex={0}
                  onPointerEnter={() => setAlHover(a)} onPointerLeave={() => setAlHover(null)}
                  onKeyDown={ev => { if (ev.key === 'Enter') verAlumno(a); }}>
                <i style={{ background: colorPuntaje(a.puntaje).base }} />
                <span>{a.nombre} {a.apellido}</span>
                {a.casos > 0 && <small className="ci-casos" title="Casos de convivencia">{a.casos} caso{a.casos === 1 ? '' : 's'}</small>}
                {a.nota != null && <small className="ci-nota-chile">{a.nota.toFixed(1).replace('.', ',')}</small>}
                <b>{a.puntaje ?? '—'}</b>
              </li>
            ))}
          </ol>
          </>)}
        </aside>
      )}

      <div className="ci-leyenda" style={{ opacity: 1 - Math.min(1, t * 2) }}>
        <span className="ci-ley-crit">{criterios.map(id => nombresCrit[id]).join(' + ')}</span>
        <span className="ci-escala"><small>0</small><i style={{ background: DEGRADADO_PUNTAJE }} /><small>100</small></span>
        <span><i style={{ background: colorPuntaje(null).base }} /> Sin datos</span>
      </div>
    </div>
  );
}
