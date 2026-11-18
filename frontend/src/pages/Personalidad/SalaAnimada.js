import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  motion, AnimatePresence, useMotionValue, useTransform, useAnimationFrame, animate,
} from 'motion/react';
import { colorPuntaje, etiquetaPuntaje, UMBRAL_BAJO } from './colores';

// Duración de cada escena del "video" (segundos)
const DUR_INTRO = 3;
const DUR_AREA = 4.5;
const DUR_RESUMEN = 7;

const PIELES = ['#F3C9A8', '#E0AC86', '#C68863', '#9C6644', '#F6D7BE', '#D9A27A'];
const PELOS = ['#3B2416', '#5A3A22', '#1F1612', '#8A5A2B', '#C08A4A', '#2E2E2E'];

function Contador({ valor }) {
  const mv = useMotionValue(0);
  const txt = useTransform(mv, v => Math.round(v));
  useEffect(() => {
    const c = animate(mv, valor ?? 0, { duration: 1.1, ease: 'easeOut' });
    return () => c.stop();
  }, [valor, mv]);
  if (valor === null || valor === undefined) return <span>—</span>;
  return <motion.span>{txt}</motion.span>;
}

// Un alumno sentado en su banco. Polera y cara cambian según el puntaje.
function Alumno({ a, idx, puntaje, escena, entrando }) {
  const col = colorPuntaje(escena === 'intro' ? null : puntaje);
  const bajo = escena !== 'intro' && puntaje !== null && puntaje !== undefined && puntaje < UMBRAL_BAJO;
  const alto = escena !== 'intro' && puntaje !== null && puntaje !== undefined && puntaje >= 85;
  // Boca: sonrisa, recta o triste
  const boca = escena === 'intro' || puntaje === null || puntaje === undefined
    ? 'M17 29 Q20 31 23 29'
    : puntaje >= 75 ? 'M15.5 27.5 Q20 33 24.5 27.5'
      : puntaje >= UMBRAL_BAJO ? 'M16 29.5 L24 29.5'
        : 'M15.5 31 Q20 26.5 24.5 31';
  const piel = PIELES[a.id % PIELES.length];
  const pelo = PELOS[(a.id * 7) % PELOS.length];
  const iniciales = `${(a.nombre || '?')[0]}${(a.apellido || '')[0] || ''}`;

  return (
    <motion.div
      className="sa-alumno"
      initial={entrando ? { opacity: 0, y: 40, scale: 0.6 } : false}
      animate={{ opacity: 1, y: bajo ? [0, -3, 0] : 0, scale: 1 }}
      transition={{
        opacity: { delay: entrando ? idx * 0.05 : 0, duration: 0.4 },
        scale: { delay: entrando ? idx * 0.05 : 0, type: 'spring', stiffness: 260, damping: 18 },
        y: bajo ? { repeat: Infinity, duration: 1.4, delay: (idx % 5) * 0.1 }
          : { delay: entrando ? idx * 0.05 : 0, type: 'spring', stiffness: 260, damping: 18 },
      }}
      title={`${a.nombre} ${a.apellido} · ${puntaje ?? '—'} · ${etiquetaPuntaje(puntaje)}`}
    >
      <AnimatePresence>
        {(bajo || alto) && (
          <motion.span
            key={bajo ? 'b' : 'a'}
            className={`sa-globo ${bajo ? 'sa-globo-bajo' : 'sa-globo-alto'}`}
            initial={{ opacity: 0, scale: 0, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ delay: 0.3 + (idx % 8) * 0.04, type: 'spring', stiffness: 400, damping: 15 }}
          >
            {bajo ? '!' : '★'}
          </motion.span>
        )}
      </AnimatePresence>
      <svg viewBox="0 0 40 58" className="sa-figura">
        {/* cuerpo / polera */}
        <motion.path d="M6 58 Q6 38 20 37 Q34 38 34 58 Z"
          animate={{ fill: col.base }} transition={{ duration: 0.6, delay: (idx % 10) * 0.04 }} />
        {/* cabeza */}
        <circle cx="20" cy="22" r="12" fill={piel} />
        <path d={`M8 21 Q9 8 20 9 Q31 8 32 21 Q27 14 20 15 Q13 14 8 21 Z`} fill={pelo} />
        <circle cx="15.5" cy="22.5" r="1.6" fill="#2B1B14" />
        <circle cx="24.5" cy="22.5" r="1.6" fill="#2B1B14" />
        <motion.path d={boca} animate={{ d: boca }} transition={{ duration: 0.5 }}
          stroke="#2B1B14" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
      <div className="sa-banco">
        <span>{iniciales}</span>
      </div>
    </motion.div>
  );
}

export default function SalaAnimada({ curso, areas, semestre, onCerrar }) {
  const escenas = useMemo(() => {
    const e = [{ tipo: 'intro', dur: DUR_INTRO }];
    areas.forEach(a => e.push({ tipo: 'area', area: a, dur: DUR_AREA }));
    e.push({ tipo: 'resumen', dur: DUR_RESUMEN });
    let t = 0;
    return e.map(x => { const y = { ...x, inicio: t }; t += x.dur; return y; });
  }, [areas]);
  const total = escenas.reduce((s, e) => s + e.dur, 0);

  const tiempo = useMotionValue(0);
  const [jugando, setJugando] = useState(true);
  const [iEscena, setIEscena] = useState(0);
  const iRef = useRef(0);
  const progreso = useTransform(tiempo, t => `${(t / total) * 100}%`);

  useAnimationFrame((_t, delta) => {
    if (!jugando) return;
    let t = tiempo.get() + delta / 1000;
    if (t >= total) { t = total; setJugando(false); }
    tiempo.set(t);
    const i = escenas.findIndex(e => t >= e.inicio && t < e.inicio + e.dur);
    const ni = i === -1 ? escenas.length - 1 : i;
    if (ni !== iRef.current) { iRef.current = ni; setIEscena(ni); }
  });

  const irA = (i) => {
    tiempo.set(escenas[i].inicio);
    iRef.current = i; setIEscena(i);
    setJugando(true);
  };
  const saltarEnBarra = (ev) => {
    const r = ev.currentTarget.getBoundingClientRect();
    const t = ((ev.clientX - r.left) / r.width) * total;
    const i = escenas.findIndex(e => t >= e.inicio && t < e.inicio + e.dur);
    tiempo.set(t); iRef.current = Math.max(0, i); setIEscena(Math.max(0, i));
  };
  const alternar = () => {
    if (!jugando && tiempo.get() >= total) irA(0);
    else setJugando(j => !j);
  };

  useEffect(() => {
    const k = (e) => {
      if (e.key === 'Escape') onCerrar();
      if (e.key === ' ') { e.preventDefault(); alternar(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const esc = escenas[iEscena];
  const puntajeDe = (a) => {
    if (esc.tipo === 'area') return a.areas[String(esc.area.id)] ?? null;
    return a.puntaje;
  };
  const promedioEscena = esc.tipo === 'area' ? curso.areas[String(esc.area.id)] : curso.puntaje;
  const alumnos = curso.alumnos;
  const cols = Math.max(4, Math.min(8, Math.ceil(Math.sqrt(alumnos.length * 1.8))));
  const filas = [];
  for (let i = 0; i < alumnos.length; i += cols) filas.push(alumnos.slice(i, i + cols));

  const enAtencion = alumnos.filter(a => a.puntaje !== null && a.puntaje < UMBRAL_BAJO);
  const areasOrden = [...areas].sort((x, y) =>
    (curso.areas[String(x.id)] ?? 999) - (curso.areas[String(y.id)] ?? 999));
  const colEsc = colorPuntaje(esc.tipo === 'intro' ? null : promedioEscena);

  return (
    <motion.div className="sa-fondo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onCerrar}>
      <motion.div className="sa-marco" onClick={e => e.stopPropagation()}
        initial={{ scale: 0.92, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 30 }}
        transition={{ type: 'spring', stiffness: 220, damping: 24 }}>

        <div className="sa-escenario">
          {/* Pared con pizarra */}
          <div className="sa-pared">
            <div className="sa-ventana sa-ventana-izq" />
            <div className="sa-pizarra">
              <AnimatePresence mode="wait">
                <motion.div key={iEscena} className="sa-pizarra-txt"
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.35 }}>
                  {esc.tipo === 'intro' && (<>
                    <small>Informe de personalidad · {semestre}° semestre</small>
                    <b>{curso.nombre}</b>
                    <small>{alumnos.length} alumnos · {curso.evaluados} evaluados
                      {curso.profesor_jefe ? ` · Prof. jefe ${curso.profesor_jefe}` : ''}</small>
                  </>)}
                  {esc.tipo === 'area' && (<>
                    <small>Área {iEscena} de {areas.length}</small>
                    <b>{esc.area.nombre}</b>
                    <span className="sa-pizarra-num" style={{ color: colEsc.claro }}>
                      <Contador valor={promedioEscena} /><i>/100</i>
                    </span>
                  </>)}
                  {esc.tipo === 'resumen' && (
                    <div className="sa-resumen">
                      <b>Resumen del curso · <Contador valor={curso.puntaje} />/100</b>
                      {areasOrden.map((a, i) => {
                        const p = curso.areas[String(a.id)];
                        const c = colorPuntaje(p);
                        return (
                          <div key={a.id} className="sa-res-fila">
                            <span>{a.nombre}</span>
                            <div className="sa-res-barra">
                              <motion.i style={{ background: c.base }}
                                initial={{ width: 0 }} animate={{ width: `${p ?? 0}%` }}
                                transition={{ delay: 0.2 + i * 0.12, duration: 0.8, ease: 'easeOut' }} />
                            </div>
                            <em>{p ?? '—'}</em>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="sa-ventana sa-ventana-der" />
          </div>

          {/* Piso en perspectiva con los bancos */}
          <div className="sa-piso-cont">
            <div className="sa-piso">
              {filas.map((fila, fi) => (
                <div key={fi} className="sa-fila" style={{ '--escala': 0.78 + (fi / Math.max(1, filas.length - 1)) * 0.22 }}>
                  {fila.map((a, ci) => (
                    <Alumno key={a.id} a={a} idx={fi * cols + ci} puntaje={puntajeDe(a)}
                      escena={esc.tipo} entrando={iEscena === 0} />
                  ))}
                </div>
              ))}
              {!alumnos.length && <p className="sa-vacio">Este curso no tiene alumnos activos.</p>}
            </div>
          </div>

          {/* Indicador inferior */}
          <AnimatePresence>
            {esc.tipo === 'resumen' && (
              <motion.div className="sa-cartel" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }} transition={{ delay: 0.8 }}>
                {enAtencion.length
                  ? <>⚠️ <b>{enAtencion.length}</b> alumno{enAtencion.length === 1 ? '' : 's'} bajo {UMBRAL_BAJO}: {enAtencion.slice(0, 6).map(a => a.nombre.split(' ')[0]).join(', ')}{enAtencion.length > 6 ? '…' : ''}</>
                  : <>✅ Ningún alumno bajo {UMBRAL_BAJO} puntos</>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Controles de reproducción */}
        <div className="sa-controles">
          <button className="sa-play" onClick={alternar} aria-label={jugando ? 'Pausar' : 'Reproducir'}>
            {jugando ? '❚❚' : '▶'}
          </button>
          <div className="sa-linea">
            <div className="sa-linea-barra" onClick={saltarEnBarra}>
              <motion.span style={{ width: progreso }} />
              {escenas.slice(1).map((e, i) => (
                <i key={i} style={{ left: `${(e.inicio / total) * 100}%` }} />
              ))}
            </div>
            <div className="sa-capitulos">
              {escenas.map((e, i) => (
                <button key={i} className={i === iEscena ? 'on' : ''} onClick={() => irA(i)}>
                  {e.tipo === 'intro' ? 'Inicio' : e.tipo === 'resumen' ? 'Resumen' : e.area.nombre}
                </button>
              ))}
            </div>
          </div>
          <button className="sa-cerrar" onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
