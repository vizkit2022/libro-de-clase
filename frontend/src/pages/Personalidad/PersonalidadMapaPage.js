import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence, useMotionValue, useSpring } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { msgError } from '../../components/UI/Modal';
import { colorPuntaje, etiquetaPuntaje, UMBRAL_BAJO, UMBRAL_ALTO } from './colores';
import SalaAnimada from './SalaAnimada';
import '../../components/UI/ui.css';
import './Personalidad.css';
import './PersonalidadMapa.css';

// Medidas de cada sala en el modelo 3D (px)
const ANCHO = 132;
const FONDO = 100;
const ALTO = 74;
const PASILLO = 10;
const SALAS_POR_PISO = 4;

// Una sala: caja 3D con techo, frente y costados pintados según el puntaje
function Sala({ curso, puntaje, x, z, piso, i, onAbrir, onHover }) {
  const c = colorPuntaje(puntaje);
  const roja = puntaje !== null && puntaje !== undefined && puntaje < UMBRAL_BAJO;
  return (
    <motion.div
      className="cm-sala"
      style={{ width: ANCHO, height: FONDO, x, z: z + ALTO * 3 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, z }}
      transition={{ delay: piso * 0.25 + i * 0.07, type: 'spring', stiffness: 120, damping: 16 }}
      onClick={() => onAbrir(curso)}
      onPointerEnter={() => onHover(curso)}
      onPointerLeave={() => onHover(null)}
    >
      {/* techo */}
      <motion.div className="cm-cara cm-techo" style={{ width: ANCHO, height: FONDO, z: ALTO }}
        animate={{ backgroundColor: c.claro }} transition={{ duration: 0.6 }}>
        <span>{curso.nombre}</span>
      </motion.div>
      {/* frente (mira al observador) */}
      <motion.div className="cm-cara cm-frente"
        style={{ width: ANCHO, height: ALTO, top: FONDO - ALTO, originY: 1, originX: 0.5, rotateX: -90 }}
        animate={{ backgroundColor: c.base }} transition={{ duration: 0.6 }}>
        <div className="cm-ventanas"><i /><i /><i /></div>
        <b>{curso.nombre}</b>
        <small>{puntaje ?? '—'}</small>
        {roja && (
          <motion.div className="cm-alarma"
            animate={{ opacity: [0, 0.55, 0] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }} />
        )}
      </motion.div>
      {/* costado derecho */}
      <motion.div className="cm-cara cm-costado"
        style={{ width: ALTO, height: FONDO, left: ANCHO, originX: 0, rotateY: -90 }}
        animate={{ backgroundColor: c.oscuro }} transition={{ duration: 0.6 }} />
      {/* costado izquierdo */}
      <motion.div className="cm-cara cm-costado"
        style={{ width: ALTO, height: FONDO, left: 0, originX: 0, rotateY: -90 }}
        animate={{ backgroundColor: c.oscuro }} transition={{ duration: 0.6 }} />
    </motion.div>
  );
}

export default function PersonalidadMapaPage() {
  const { anio } = useAuth();
  const year = anio || new Date().getFullYear();
  const [params, setParams] = useSearchParams();
  const [semestre, setSemestre] = useState(null);
  const [areaSel, setAreaSel] = useState('todas');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [hover, setHover] = useState(null);
  const [abierto, setAbierto] = useState(null);

  useEffect(() => {
    setError('');
    const q = semestre ? `&semestre=${semestre}` : '';
    axios.get(`/api/personalidad/resumen?year=${year}${q}`)
      .then(r => { setDatos(r.data); if (!semestre) setSemestre(r.data.semestre); })
      .catch(e => setError(msgError(e, 'No se pudo cargar el resumen')));
  }, [year, semestre]);

  // ?curso=ID abre directamente la sala de ese curso
  useEffect(() => {
    const id = Number(params.get('curso'));
    if (id && datos) setAbierto(datos.cursos.find(c => c.id === id) || null);
  }, [params, datos]);

  const abrir = (c) => { setAbierto(c); setParams(c ? { curso: c.id } : {}); };

  const puntaje = (c) => (areaSel === 'todas' ? c.puntaje : c.areas[areaSel] ?? null);

  // Pisos: 4 salas por piso, en el orden de los cursos (los menores abajo)
  const pisos = useMemo(() => {
    const out = [];
    (datos?.cursos || []).forEach((c, i) => {
      const p = Math.floor(i / SALAS_POR_PISO);
      (out[p] = out[p] || []).push(c);
    });
    return out;
  }, [datos]);

  const anchoEdificio = Math.min(SALAS_POR_PISO, datos?.cursos.length || 1) * (ANCHO + PASILLO) - PASILLO;

  // Giro del edificio: arrastrar o botones
  const giroBase = useMotionValue(-32);
  const giro = useSpring(giroBase, { stiffness: 90, damping: 18 });
  const arrastre = useRef(null);
  const onDown = (e) => { arrastre.current = { x: e.clientX, g: giroBase.get() }; };
  const onMove = (e) => {
    if (!arrastre.current) return;
    giroBase.set(arrastre.current.g + (e.clientX - arrastre.current.x) * 0.35);
  };
  const onUp = () => { arrastre.current = null; };

  const ranking = useMemo(() => {
    const pt = (c) => (areaSel === 'todas' ? c.puntaje : c.areas[areaSel] ?? null);
    return [...(datos?.cursos || [])].sort((a, b) => (pt(a) ?? 999) - (pt(b) ?? 999));
  }, [datos, areaSel]);
  const nombreArea = areaSel === 'todas' ? 'todas las áreas'
    : datos?.areas.find(a => String(a.id) === areaSel)?.nombre;
  const rojas = (datos?.cursos || []).filter(c => puntaje(c) !== null && puntaje(c) < UMBRAL_BAJO).length;

  return (
    <div className="ip cm">
      <Link to="/personalidad" className="ip-volver">← Informe de personalidad</Link>
      <div className="ip-cab">
        <div>
          <h2>Mapa del colegio</h2>
          <p>Cada sala se pinta según el informe de personalidad de sus alumnos ({nombreArea}).
            Haz clic en una sala para ver la animación del curso.</p>
        </div>
        <div className="cm-filtros">
          <div className="cm-seg">
            {[1, 2].map(s => (
              <button key={s} className={semestre === s ? 'on' : ''} onClick={() => setSemestre(s)}>
                {s}° semestre
              </button>
            ))}
          </div>
          <select value={areaSel} onChange={e => setAreaSel(e.target.value)}>
            <option value="todas">Todas las áreas</option>
            {datos?.areas.map(a => <option key={a.id} value={String(a.id)}>{a.nombre}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="ui-aviso ui-aviso-peligro">{error}</div>}
      {!datos && !error && <p className="ui-vacio">Cargando…</p>}
      {datos && !datos.cursos.length && <p className="ui-vacio">No hay cursos para {year}.</p>}

      {datos && !!datos.cursos.length && (
        <div className="cm-grid">
          <div className="cm-lienzo" onPointerDown={onDown} onPointerMove={onMove}
            onPointerUp={onUp} onPointerLeave={onUp}>
            <div className="cm-giro">
              <button onClick={() => giroBase.set(giroBase.get() - 45)} aria-label="Girar a la izquierda">⟲</button>
              <button onClick={() => giroBase.set(-32)}>Centrar</button>
              <button onClick={() => giroBase.set(giroBase.get() + 45)} aria-label="Girar a la derecha">⟳</button>
            </div>
            <div className="cm-perspectiva" style={{ paddingTop: pisos.length * ALTO * 0.75 }}>
              <motion.div className="cm-mundo"
                style={{ width: anchoEdificio, height: FONDO, rotateX: 58, rotateZ: giro }}>
                {/* patio / suelo */}
                <div className="cm-suelo" style={{ width: anchoEdificio + 120, height: FONDO + 160 }} />
                {pisos.map((sala, p) => sala.map((c, i) => (
                  <Sala key={c.id} curso={c} puntaje={puntaje(c)} piso={p} i={i}
                    x={i * (ANCHO + PASILLO)} z={p * ALTO}
                    onAbrir={abrir} onHover={setHover} />
                )))}
                {/* techo del colegio sobre el último piso */}
                <motion.div className="cm-letrero"
                  style={{ width: anchoEdificio, z: pisos.length * ALTO + 2 }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: pisos.length * 0.3 + 0.4 }} />
              </motion.div>
            </div>

            <AnimatePresence>
              {hover && (
                <motion.div className="cm-tip" key={hover.id}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <b>{hover.nombre}</b>
                  <span>{etiquetaPuntaje(puntaje(hover))} · {puntaje(hover) ?? '—'}/100</span>
                  <small>{hover.evaluados} de {hover.alumnos.length} alumnos evaluados</small>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="cm-leyenda">
              <span><i style={{ background: colorPuntaje(20).base }} /> Bajo {UMBRAL_BAJO}</span>
              <span><i style={{ background: colorPuntaje(62).base }} /> {UMBRAL_BAJO}–{UMBRAL_ALTO - 1}</span>
              <span><i style={{ background: colorPuntaje(90).base }} /> {UMBRAL_ALTO} o más</span>
              <span><i style={{ background: colorPuntaje(null).base }} /> Sin datos</span>
            </div>
          </div>

          <aside className="cm-lado">
            <div className={`cm-alerta ${rojas ? 'roja' : ''}`}>
              <b>{rojas}</b> sala{rojas === 1 ? '' : 's'} en rojo
              <small>{datos.semestre}° semestre {year}</small>
            </div>
            <h4>Cursos, de menor a mayor</h4>
            <ol className="cm-ranking">
              {ranking.map((c, i) => {
                const p = puntaje(c);
                const col = colorPuntaje(p);
                return (
                  <motion.li key={c.id} layout onClick={() => abrir(c)}
                    initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}>
                    <span className="cm-punto" style={{ background: col.base }} />
                    <span className="cm-rk-nom">{c.nombre}</span>
                    <span className="cm-rk-barra">
                      <motion.i style={{ background: col.base }}
                        animate={{ width: `${p ?? 0}%` }} transition={{ duration: 0.6 }} />
                    </span>
                    <b>{p ?? '—'}</b>
                  </motion.li>
                );
              })}
            </ol>
            <p className="cm-nota">Puntaje 0–100: Siempre = 100, Generalmente = 70, A veces = 35,
              Nunca = 0. «No observado» no se cuenta.</p>
          </aside>
        </div>
      )}

      <AnimatePresence>
        {abierto && (
          <SalaAnimada key={abierto.id} curso={abierto} areas={datos.areas} semestre={datos.semestre}
            onCerrar={() => abrir(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
