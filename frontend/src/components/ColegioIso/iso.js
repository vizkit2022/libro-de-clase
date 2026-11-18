// Dibujo isométrico en SVG, el mismo estilo del video "aulas 3D"
// (video-personalidad/src/iso.tsx), sin Remotion: cajas con 3 caras sombreadas.
// Ejes: x crece hacia abajo-derecha, y hacia abajo-izquierda, z hacia arriba.
import React from 'react';
import { colorPuntaje, UMBRAL_BAJO } from '../../pages/Personalidad/colores';

const CX = Math.cos(Math.PI / 6);
export const P = (x, y, z = 0) => [(x - y) * CX, (x + y) * 0.5 - z];
export const pts = (...ps) => ps.map(([x, y, z]) => P(x, y, z).join(',')).join(' ');

export const PALETA = {
  piso: '#F7F1DE', muro: '#F6E9BC', muroIzq: '#EBDA9E',
  madera: '#A8704B', maderaClara: '#C48A5E',
  silla: '#D0573F', estante: '#E0A53F', pizarraMarco: '#D9573E', azul: '#4A7FD0',
  pelo: ['#3B2416', '#5A3A22', '#1F1612', '#8A5A2B', '#C46A2B', '#2E2E2E'],
  piel: ['#F3C9A8', '#E0AC86', '#C68863', '#9C6644', '#F6D7BE'],
  libros: ['#3E7CB1', '#D9573E', '#F2C14E', '#5BA36B', '#8E5BA6', '#EFE6D2'],
};

// Aclara (f>1) u oscurece (f<1) un color hex o hsl (con o sin comas)
export function tono(c, f) {
  const m = c.match(/hsl\((\d+)[,\s]+(\d+)%[,\s]+(\d+)%\)/);
  if (m) return `hsl(${m[1]}, ${m[2]}%, ${Math.max(0, Math.min(100, Number(m[3]) * f))}%)`;
  const n = parseInt(c.slice(1), 16);
  const ch = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

const BORDE = { stroke: 'rgba(60,35,20,.28)', strokeWidth: 0.6, strokeLinejoin: 'round' };

// Caja con techo, cara +y (izquierda) y cara +x (derecha)
export function Caja({ x, y, z = 0, w, d, h, c, borde = true }) {
  const s = borde ? BORDE : {};
  return (
    <g>
      <polygon {...s} fill={tono(c, 0.86)} points={pts([x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h])} />
      <polygon {...s} fill={tono(c, 0.7)} points={pts([x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h])} />
      <polygon {...s} fill={c} points={pts([x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h])} />
    </g>
  );
}

export function Piso({ x, y, w, d, c, z = 0, opacidad = 1 }) {
  return <polygon fill={c} opacity={opacidad} points={pts([x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z])} />;
}

// Polera del alumno: misma escala del curso (rojo, ámbar, verde; gris sin datos)
const colorAlumno = (p) => colorPuntaje(p).base;

// Burbuja con carita sobre el alumno: feliz desde 50, triste bajo 50
function Carita({ cx, cy, r, p }) {
  if (p === null || p === undefined) return null;
  const bien = p >= UMBRAL_BAJO;
  const fondo = colorPuntaje(p).base;
  return (
    <g transform={`translate(${cx} ${cy})`} className="ci-carita">
      <path d={`M ${-r * 0.25} ${r * 0.9} L 0 ${r * 1.45} L ${r * 0.25} ${r * 0.9} Z`} fill={fondo} />
      <circle r={r} fill={fondo} stroke="#fff" strokeWidth={r * 0.14} />
      <circle cx={-r * 0.35} cy={-r * 0.2} r={r * 0.12} fill="#fff" />
      <circle cx={r * 0.35} cy={-r * 0.2} r={r * 0.12} fill="#fff" />
      {bien
        ? <path d={`M ${-r * 0.45} ${r * 0.18} Q 0 ${r * 0.65} ${r * 0.45} ${r * 0.18}`} stroke="#fff" strokeWidth={r * 0.14} fill="none" strokeLinecap="round" />
        : <path d={`M ${-r * 0.42} ${r * 0.5} Q 0 ${r * 0.1} ${r * 0.42} ${r * 0.5}`} stroke="#fff" strokeWidth={r * 0.14} fill="none" strokeLinecap="round" />}
    </g>
  );
}

function AlumnoIso({ a, x, y, s, cara, sel, apagado, onClick }) {
  const piel = PALETA.piel[a.id % PALETA.piel.length];
  const pelo = PALETA.pelo[(a.id * 7) % PALETA.pelo.length];
  const bw = s * 0.62; const bd = s * 0.3; const bh = s * 0.34;
  const cx = x + (bw - s * 0.28) / 2;
  const [hx, hy] = P(cx + s * 0.14, y + bd + s * 0.12, s * 0.72);
  const [px, py] = P(x + bw / 2, y + bd + s * 0.2, 0);
  return (
    <g className={`ci-al ${sel ? 'ci-al-sel' : ''}`} opacity={apagado ? 0.18 : 1}
       onClick={onClick ? (ev) => { ev.stopPropagation(); onClick(a); } : undefined}
       style={onClick ? { cursor: 'pointer' } : undefined}>
      {sel && <ellipse className="ci-halo" cx={px} cy={py} rx={s * 0.75} ry={s * 0.38}
        fill="none" stroke="#FF7417" strokeWidth={s * 0.06} />}
      <Caja x={x} y={y} w={bw} d={bd} h={bh} c={PALETA.madera} />
      <Caja x={cx - s * 0.03} y={y + bd + s * 0.08} w={s * 0.34} d={s * 0.26} h={s * 0.2} c={PALETA.silla} />
      <Caja x={cx} y={y + bd + s * 0.04} z={s * 0.2} w={s * 0.28} d={s * 0.16} h={s * 0.42} c={colorAlumno(a.puntaje)} />
      <circle cx={hx} cy={hy} r={s * 0.13} fill={piel} stroke="rgba(60,35,20,.25)" strokeWidth={0.5} />
      <path d={`M${hx - s * 0.13} ${hy - s * 0.01} A ${s * 0.13} ${s * 0.13} 0 0 1 ${hx + s * 0.13} ${hy - s * 0.01} Q ${hx} ${hy - s * 0.06} ${hx - s * 0.13} ${hy - s * 0.01} Z`} fill={pelo} />
      <Caja x={cx - s * 0.03} y={y + bd + s * 0.3} w={s * 0.34} d={s * 0.05} h={s * 0.38} c={PALETA.silla} />
      {cara && <Carita cx={hx} cy={hy - s * 0.42} r={s * (sel ? 0.24 : 0.17)} p={a.puntaje} />}
    </g>
  );
}

// Grilla de bancos de una sala: la usa el dibujo y el zoom al alumno
export function grillaAlumnos(x, y, w, d, n) {
  const ax0 = x + w * 0.1; const ay0 = y + d * 0.34;
  const aw = w * 0.84; const ad = d * 0.62;
  let cols = Math.max(3, Math.round(Math.sqrt(Math.max(1, n) * (aw / ad) * 0.75)));
  let filas = Math.ceil(n / cols);
  while (filas > 6) { cols++; filas = Math.ceil(n / cols); }
  const cw = aw / cols; const cd = ad / Math.max(1, filas);
  const s = Math.min(cw * 1.15, cd * 1.05, 40);
  const pos = (i) => {
    const fi = Math.floor(i / cols); const ci = i % cols;
    return { x: ax0 + ci * cw + (cw - s * 0.62) / 2, y: ay0 + fi * cd };
  };
  return { s, pos };
}

// Muros delanteros y techo de una sala. techo: 0 = cerrada, 1 = abierta
// (el techo sube y todo se desvanece, igual que en el video)
function Cubierta({ x, y, w, d, muro, t, techo, c }) {
  const muros = Math.max(0, 1 - techo * 1.6);
  const sube = techo * muro * 4;
  const op = Math.max(0, 1 - Math.max(0, techo - 0.35) / 0.65);
  if (op <= 0 && muros <= 0) return null;
  return (
    <g pointerEvents={techo > 0.5 ? 'none' : undefined}>
      <g opacity={muros}>
        <Caja x={x - t} y={y + d - t} w={w + t} d={t} h={muro} c={PALETA.muro} />
        <Caja x={x + w - t} y={y - t} w={t} d={d} h={muro} c={PALETA.muroIzq} />
        {[0.12, 0.42, 0.72].map(f => (
          <polygon key={f} fill="#8DC3E8" stroke="#fff" strokeWidth={1}
            points={pts([x + w * f, y + d, muro * 0.4], [x + w * (f + 0.18), y + d, muro * 0.4], [x + w * (f + 0.18), y + d, muro * 0.82], [x + w * f, y + d, muro * 0.82])} />
        ))}
        {[0.15, 0.55].map(f => (
          <polygon key={f} fill="#6FA8D6" stroke="#fff" strokeWidth={1}
            points={pts([x + w, y + d * f, muro * 0.4], [x + w, y + d * (f + 0.25), muro * 0.4], [x + w, y + d * (f + 0.25), muro * 0.82], [x + w, y + d * f, muro * 0.82])} />
        ))}
        <polygon fill="#8A6340" points={pts([x + w * 0.9, y + d, 0], [x + w * 0.97, y + d, 0], [x + w * 0.97, y + d, muro * 0.75], [x + w * 0.9, y + d, muro * 0.75])} />
      </g>
      <g opacity={op}>
        <Caja x={x - t - 4} y={y - t - 4} z={muro + sube} w={w + t + 8} d={d + t + 8} h={muro * 0.14} c={c.base} />
        <polygon fill={c.claro} opacity={0.6} points={pts([x + w * 0.1, y + d * 0.15, muro * 1.14 + sube], [x + w * 0.9, y + d * 0.15, muro * 1.14 + sube], [x + w * 0.9, y + d * 0.85, muro * 1.14 + sube], [x + w * 0.1, y + d * 0.85, muro * 1.14 + sube])} />
      </g>
    </g>
  );
}

function Profesor({ x, y, s }) {
  const [hx, hy] = P(x + s * 0.16, y + s * 0.09, s * 1.0);
  return (
    <g>
      <Caja x={x + s * 0.02} y={y + s * 0.03} w={s * 0.09} d={s * 0.1} h={s * 0.4} c="#3F4A5C" />
      <Caja x={x + s * 0.21} y={y + s * 0.03} w={s * 0.09} d={s * 0.1} h={s * 0.4} c="#3F4A5C" />
      <Caja x={x} y={y} z={s * 0.4} w={s * 0.32} d={s * 0.18} h={s * 0.46} c="#5B8FD6" />
      <circle cx={hx} cy={hy} r={s * 0.14} fill="#F0C8A4" stroke="rgba(60,35,20,.25)" strokeWidth={0.5} />
      <path d={`M${hx - s * 0.14} ${hy} A ${s * 0.14} ${s * 0.14} 0 0 1 ${hx + s * 0.14} ${hy} Z`} fill="#6B6B6B" />
    </g>
  );
}

// Una sala de clases abierta (sin techo) con el color de su curso
export function SalaIso({ x, y, w, d, muro, curso, techo = 0, caras = false, alumnoSel = null, onAlumno }) {
  const col = colorPuntaje(curso.puntaje);
  const t = Math.max(3, w * 0.022);
  const alumnos = curso.alumnos || [];
  const { s, pos } = grillaAlumnos(x, y, w, d, alumnos.length);
  const estanteH = muro * 0.45;

  const libros = [];
  for (let i = 0, yy = y + d * 0.2; yy < y + d * 0.92 - 3; i++) {
    const g = 2 + (i % 3);
    for (let r = 0; r < 2; r++) {
      const z0 = estanteH * (0.12 + r * 0.45);
      const hh = estanteH * (0.26 + ((i + r) % 3) * 0.04);
      libros.push(
        <polygon key={`${i}-${r}`} fill={PALETA.libros[(i * 3 + r) % PALETA.libros.length]}
          points={pts([x + w * 0.05, yy, z0], [x + w * 0.05, yy + g, z0], [x + w * 0.05, yy + g, z0 + hh], [x + w * 0.05, yy, z0 + hh])} />,
      );
    }
    yy += g + 0.6;
  }

  return (
    <g>
      <Piso x={x} y={y} w={w} d={d} c={PALETA.piso} />
      <Piso x={x} y={y} w={w} d={d} c={col.claro} opacidad={0.38} />
      <Caja x={x - t} y={y} w={t} d={d} h={muro} c={PALETA.muroIzq} />
      <Caja x={x - t} y={y - t} w={w + t} d={t} h={muro} c={PALETA.muro} />
      {/* franja superior de los muros: color del curso */}
      <polygon fill={col.base} points={pts([x - t, y - t, muro], [x + w, y - t, muro], [x + w, y, muro], [x, y, muro], [x, y + d, muro], [x - t, y + d, muro])} />
      {[0.12, 0.55].map(f => (
        <polygon key={f} fill="#8DC3E8" stroke="#FFFFFF" strokeWidth={1.2}
          points={pts([x, y + d * f, muro * 0.52], [x, y + d * (f + 0.3), muro * 0.52], [x, y + d * (f + 0.3), muro * 0.9], [x, y + d * f, muro * 0.9])} />
      ))}
      <polygon fill={PALETA.pizarraMarco} points={pts([x + w * 0.42, y, muro * 0.25], [x + w * 0.93, y, muro * 0.25], [x + w * 0.93, y, muro * 0.88], [x + w * 0.42, y, muro * 0.88])} />
      <polygon fill="#FFFFFF" points={pts([x + w * 0.44, y, muro * 0.3], [x + w * 0.91, y, muro * 0.3], [x + w * 0.91, y, muro * 0.83], [x + w * 0.44, y, muro * 0.83])} />
      <Caja x={x} y={y + d * 0.18} w={w * 0.05} d={d * 0.76} h={estanteH} c={PALETA.estante} />
      {libros}
      <Caja x={x + w * 0.24} y={y + d * 0.11} w={w * 0.15} d={d * 0.09} h={s * 0.42} c={PALETA.azul} />
      <Profesor x={x + w * 0.66} y={y + d * 0.12} s={s * 1.05} />
      {alumnos.map((a, i) => {
        const p = pos(i);
        return <AlumnoIso key={a.id} a={a} s={s} cara={caras} x={p.x} y={p.y}
          sel={alumnoSel === a.id} apagado={alumnoSel != null && alumnoSel !== a.id}
          onClick={onAlumno} />;
      })}
      {techo < 1 && <Cubierta x={x} y={y} w={w} d={d} muro={muro} t={t} techo={techo} c={col} />}
    </g>
  );
}

// Espacio sin curso (dirección, biblioteca, comedor, baños, taller)
export function EspacioIso({ x, y, w, d, muro, nombre, techo = 0 }) {
  const t = Math.max(3, w * 0.022);
  const muebles = [];
  if (nombre === 'Biblioteca') {
    for (let i = 0; i < 3; i++) muebles.push(<Caja key={i} x={x + w * 0.15} y={y + d * (0.2 + i * 0.25)} w={w * 0.7} d={d * 0.08} h={muro * 0.45} c={PALETA.estante} />);
  } else if (nombre === 'Comedor') {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) muebles.push(<Caja key={`${i}${j}`} x={x + w * (0.12 + i * 0.45)} y={y + d * (0.2 + j * 0.4)} w={w * 0.32} d={d * 0.18} h={muro * 0.25} c={PALETA.maderaClara} />);
  } else if (nombre === 'Dirección') {
    muebles.push(<Caja key="e" x={x + w * 0.25} y={y + d * 0.3} w={w * 0.5} d={d * 0.2} h={muro * 0.3} c={PALETA.azul} />);
  } else if (nombre === 'Baños') {
    for (let i = 0; i < 3; i++) muebles.push(<Caja key={i} x={x + w * (0.12 + i * 0.28)} y={y + d * 0.08} w={w * 0.2} d={d * 0.4} h={muro * 0.6} c="#BFD9E6" />);
  }
  return (
    <g>
      <Piso x={x} y={y} w={w} d={d} c="#EFE8DA" />
      <Caja x={x - t} y={y} w={t} d={d} h={muro} c="#E5DCCB" />
      <Caja x={x - t} y={y - t} w={w + t} d={t} h={muro} c="#EEE6D6" />
      {muebles}
      {techo < 1 && <Cubierta x={x} y={y} w={w} d={d} muro={muro} t={t} techo={techo}
        c={{ base: '#D9CFC2', claro: '#ECE5DB' }} />}
    </g>
  );
}

export function ArbolIso({ x, y, r }) {
  const [cx, cy] = P(x, y, r * 2.1);
  const [sx, sy] = P(x, y, 0);
  return (
    <g>
      <ellipse cx={sx} cy={sy} rx={r * 1.2} ry={r * 0.6} fill="rgba(40,60,20,.18)" />
      <Caja x={x - r * 0.15} y={y - r * 0.15} w={r * 0.3} d={r * 0.3} h={r * 1.4} c="#8A5A35" />
      <circle cx={cx} cy={cy} r={r} fill="#5DAA4E" />
      <circle cx={cx - r * 0.3} cy={cy - r * 0.3} r={r * 0.55} fill="#7CC165" />
    </g>
  );
}
