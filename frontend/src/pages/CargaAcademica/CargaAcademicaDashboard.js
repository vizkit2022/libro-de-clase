import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import descargarArchivo from './descargar';

const fmtHM = (min) => {
  const m = Math.round(min || 0);
  const s = m < 0 ? '-' : '';
  const a = Math.abs(m);
  return `${s}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
};

const inp = {
  width: '100%', padding: '6px 9px', border: '1px solid #e2e8f0',
  borderRadius: 6, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit',
};

function Bar({ pct, color, height = 10 }) {
  return (
    <div style={{ flex: 1, height, background: '#e2e8f0', borderRadius: height / 2,
      overflow: 'hidden', minWidth: 60 }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color,
        borderRadius: height / 2, transition: 'width .4s' }} />
    </div>
  );
}

function StatBox({ label, value, sub, color }) {
  return (
    <div style={{ border: `1px solid ${color}35`, borderRadius: 12, padding: '14px 18px',
      background: `${color}0A`, flex: 1, minWidth: 140 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color, margin: '0 0 4px',
        textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', margin: 0, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>{sub}</p>}
    </div>
  );
}

export default function CargaAcademicaDashboard() {
  const { school } = useAuth();
  const primary = school?.primary_color || '#2563EB';
  const navigate = useNavigate();

  const [year, setYear] = useState(null);
  const [procesos, setProcesos] = useState([]);
  const [sugerido, setSugerido] = useState(new Date().getFullYear());
  const [tab, setTab] = useState('asignaturas');
  const [data, setData] = useState(null);
  const [demanda, setDemanda] = useState([]);
  const [cat, setCat] = useState(null);
  const [asignaturas, setAsignaturas] = useState([]);
  const [cobertura, setCobertura] = useState([]);
  const [abiertas, setAbiertas] = useState({});   // acordeón: asignatura y nivel
  const [sugerencia, setSugerencia] = useState(null);   // propuesta a revisar
  const [promptOpen, setPromptOpen] = useState(false);
  const [instrucciones, setInstrucciones] = useState('');
  const [rotar, setRotar] = useState(true);
  const [modoSug, setModoSug] = useState('completar');
  const [pensando, setPensando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [nuevoDocente, setNuevoDocente] = useState(null);
  const [showProceso, setShowProceso] = useState(false);
  const [busy, setBusy] = useState(false);
  // true mientras se traen los datos del año elegido: sin esto se alcanzaba a
  // renderizar la demanda del año anterior junto a un dashboard aún en null
  const [cargandoAnio, setCargandoAnio] = useState(true);

  // Carga la lista de años con datos y fija el año activo
  const fetchProcesos = useCallback(async () => {
    const r = await axios.get('/api/carga-academica/procesos');
    setProcesos(r.data.procesos);
    setSugerido(r.data.sugerido);
    setYear(prev => {
      if (prev !== null) return prev;
      const abierto = r.data.procesos.find(p => !p.cerrado);
      return abierto ? abierto.year : (r.data.procesos[0]?.year ?? r.data.sugerido);
    });
    return r.data;
  }, []);

  const fetchAll = useCallback(async () => {
    if (year === null) return;
    setCargandoAnio(true);
    try {
      const [d, dm, c, asg] = await Promise.all([
        axios.get(`/api/carga-academica/dashboard?year=${year}`),
        axios.get(`/api/carga-academica/demanda?year=${year}`),
        axios.get('/api/carga-academica/catalogos'),
        axios.get('/api/carga-academica/asignaturas'),
      ]);
      setData(d.data); setDemanda(dm.data); setCat(c.data); setAsignaturas(asg.data);
      // Apoyo: si no está, el resto del dashboard igual funciona
      try {
        const cob = await axios.get(`/api/carga-academica/demanda/cobertura?year=${year}`);
        setCobertura(Array.isArray(cob.data) ? cob.data : []);
      } catch { setCobertura([]); }
    } catch {
      // Año sin datos o error de red: se parte de cero, nunca con lo anterior
      setData(null); setDemanda([]);
    }
    setCargandoAnio(false);
    setLoading(false);
  }, [year]);

  useEffect(() => { fetchProcesos().finally(() => setLoading(false)); }, [fetchProcesos]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const recargar = async () => { await fetchProcesos(); await fetchAll(); };

  // Al cambiar de año hay que soltar TODO lo del año anterior
  const cambiarAnio = (y) => {
    setYear(y);
    setData(null);
    setDemanda([]);
    setCargandoAnio(true);
  };

  const seed = async () => {
    setSeeding(true);
    try {
      await axios.post('/api/carga-academica/seed-lenguaje', { year });
      await recargar();
    } catch (e) { alert(e.response?.data?.error || 'Error al poblar'); }
    setSeeding(false);
  };

  // ── Acciones de proceso ──────────────────────────────────────────
  const accion = async (fn, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    try { await fn(); await recargar(); }
    catch (e) { alert(e.response?.data?.error || 'Error'); }
    setBusy(false);
  };

  const iniciarProceso = (destino, origen, copiarDist, reemplazar = false) => accion(async () => {
    await axios.post('/api/carga-academica/procesos/iniciar', {
      year_origen: origen, year_destino: destino,
      copiar_distribucion: copiarDist, reemplazar,
    });
    setYear(destino);
  });

  const moverAnio = (desde, hasta) => accion(async () => {
    const ocupado = procesos.some(p => p.year === hasta);
    if (ocupado && !window.confirm(
      `El año ${hasta} ya tiene datos y se van a borrar para recibir el proceso ${desde}. ¿Seguir?`)) return;
    if (!ocupado && !window.confirm(`¿Mover todo el proceso ${desde} al año ${hasta}?`)) return;
    await axios.post('/api/carga-academica/procesos/mover',
      { desde, hasta, reemplazar: ocupado });
    setYear(hasta);
  });

  // Abrir un año cualquiera, exista o no en la lista
  const abrirOtroAnio = () => {
    const v = window.prompt('¿Qué año querés abrir?', String(sugerido));
    const n = Number(v);
    if (!n || n < 2000 || n > 2100) return;
    cambiarAnio(n); setShowProceso(false);
  };

  const reiniciarDist = () => accion(
    () => axios.post(`/api/carga-academica/procesos/${year}/reiniciar-distribucion`),
    `¿Borrar la distribución ${year}? Se conservan docentes y demanda para repartir de nuevo.`);

  const copiarDist = (origen) => accion(
    () => axios.post(`/api/carga-academica/procesos/${year}/copiar-distribucion`, { year_origen: origen }),
    `¿Traer la distribución de ${origen} como punto de partida para ${year}?`);

  const crearDocente = async () => {
    const d = nuevoDocente;
    if (!d?.nombre) return;
    const r = await axios.post('/api/carga-academica/docentes', { ...d, year });
    setNuevoDocente(null);
    navigate(`/carga-academica/docentes/${r.data.id}`);
  };

  const pedirSugerencia = async () => {
    setPensando(true);
    try {
      const r = await axios.post(`/api/carga-academica/procesos/${year}/sugerir`,
        { instrucciones, rotar_niveles: rotar, modo: modoSug });
      setSugerencia(r.data);
      setPromptOpen(false);
    } catch (e) {
      alert(e.response?.data?.error || 'No se pudo generar la sugerencia');
    }
    setPensando(false);
  };

  const aplicarSugerencia = () => accion(async () => {
    await axios.post(`/api/carga-academica/procesos/${year}/aplicar-sugerencia`,
      { propuesta: sugerencia.propuesta, modo: sugerencia.modo });
    setSugerencia(null);
  }, sugerencia?.modo === 'rehacer'
    ? `¿Rehacer el reparto de ${year}? Se borran todas las asignaturas actuales y se reemplazan por esta propuesta. Los cargos como jefatura se conservan.`
    : `¿Agregar estas ${sugerencia?.resumen?.filas_nuevas || 0} filas a ${year}? Lo que ya asignaste no se toca.`);

  const publicar = () => accion(async () => {
    const r = await axios.post(`/api/carga-academica/procesos/${year}/publicar`, {});
    const d = r.data;
    let msg = `Publicado: ${d.total_publicadas} filas en el libro de clases`;
    if (d.usuarios_creados) msg += `\n${d.usuarios_creados} docentes creados como usuario inactivo`;
    if (d.cursos_no_encontrados?.length) msg += `\nSin curso: ${d.cursos_no_encontrados.join(', ')}`;
    if (d.omitidas_sin_catalogo) msg += `\n${d.omitidas_sin_catalogo} filas omitidas por no estar en el catálogo`;
    alert(msg);
  }, `¿Publicar la carga ${year} al libro de clases?\n\nSe crea una fila por curso real (curso × asignatura × docente × horas) y los docentes sin usuario se crean como profesor inactivo.`);

  const descargarHorariosDep = async (dep) => {
    try {
      await descargarArchivo(
        `/api/carga-academica/horarios-departamento.pdf?year=${year}${dep ? `&departamento=${encodeURIComponent(dep)}` : ''}`,
        `Horarios_${(dep || 'Todos').replace(/ /g, '_')}_${year}.pdf`);
    } catch (e) { alert(e.message || 'No se pudo descargar'); }
  };

  const descargarDepartamentoPdf = async (dep) => {
    try {
      await descargarArchivo(
        `/api/carga-academica/informe-departamento.pdf?year=${year}${dep ? `&departamento=${encodeURIComponent(dep)}` : ''}`,
        `Carga_Horaria_${(dep || 'Todos').replace(/ /g, '_')}_${year}.pdf`);
    } catch (e) { alert(e.message || 'No se pudo descargar'); }
  };

  const descargarDepartamento = async (dep) => {
    try {
      await descargarArchivo(
        `/api/carga-academica/informe-departamento.docx?year=${year}${dep ? `&departamento=${encodeURIComponent(dep)}` : ''}`,
        `Carga_Horaria_${(dep || 'Todos').replace(/ /g, '_')}_${year}.docx`);
    } catch (e) { alert(e.message || 'No se pudo descargar'); }
  };

  const patchDemanda = async (id, payload) => {
    await axios.put(`/api/carga-academica/demanda/${id}`, payload);
    fetchAll();
  };

  // Selector de asignatura: elige del catálogo o crea una nueva al vuelo
  const onPickAsignatura = async (filaId, valor) => {
    if (valor === '__nueva__') {
      const nombre = window.prompt('Nombre de la nueva asignatura:');
      if (!nombre || !nombre.trim()) return;
      try {
        const r = await axios.post('/api/carga-academica/asignaturas', { name: nombre.trim() });
        const lista = await axios.get('/api/carga-academica/asignaturas');
        setAsignaturas(lista.data);
        await patchDemanda(filaId, { subject_id: r.data.id });
      } catch (e) { alert(e.response?.data?.error || 'No se pudo crear la asignatura'); }
      return;
    }
    await patchDemanda(filaId, { subject_id: valor ? Number(valor) : null });
  };

  const addDemanda = async () => {
    await axios.post('/api/carga-academica/demanda', {
      year, departamento: departamentos[0] || 'General',
      subject_id: asignaturas[0]?.id || null,
      asignatura: asignaturas[0]?.name || 'Nueva asignatura',
      nivel: cat?.niveles?.[0] || 'I Medio', por_letra: true, letras: 'A,B,C',
      horas_por_grupo: 0, orden: demanda.length,
    });
    fetchAll();
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>;

  const r = data?.resumen || {};
  const docentes = data?.docentes || [];
  const departamentos = [...new Set(demanda.map(d => d.departamento).filter(Boolean))];
  const vacio = !demanda.length && !docentes.length;
  const alertas = data?.alertas || [];
  const procActivo = procesos.find(p => p.year === year);
  const otrosAnios = procesos.filter(p => p.year !== year && p.filas_asignacion > 0).map(p => p.year);
  const anioBase = procesos.filter(p => p.year < year).map(p => p.year).sort((a, b) => b - a)[0];
  const seccProc = {
    fontSize: 11, fontWeight: 700, color: '#64748b', margin: '0 0 6px',
    textTransform: 'uppercase', letterSpacing: '0.04em',
  };
  const btnProc = {
    padding: '6px 13px', borderRadius: 8, fontSize: 12.5, cursor: busy ? 'default' : 'pointer',
    border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600,
    opacity: busy ? 0.5 : 1,
  };

  return (
    <div style={{ maxWidth: 1050, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
            📚 Carga Académica {year}
            {procActivo?.cerrado && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                background: '#d1fae5', color: '#065f46', marginLeft: 10,
                verticalAlign: 'middle' }}>✓ cerrado</span>
            )}
            {procActivo && !procActivo.cerrado && !procActivo.en_blanco && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                background: '#fef3c7', color: '#92400e', marginLeft: 10,
                verticalAlign: 'middle' }}>en proceso</span>
            )}
          </h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '3px 0 0' }}>
            Distribución de horas por docente según Tabla Legal MINEDUC
          </p>
        </div>
        {departamentos.map(dep => (
          <React.Fragment key={dep}>
            <button onClick={() => descargarDepartamento(dep)} style={{
              padding: '8px 14px', background: `${primary}15`, color: primary, border: 'none',
              borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              📄 Word · {dep}
            </button>
            <button onClick={() => descargarDepartamentoPdf(dep)} style={{
              padding: '8px 14px', background: '#fee2e2', color: '#991b1b', border: 'none',
              borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              📕 PDF · {dep}
            </button>
            <button onClick={() => descargarHorariosDep(dep)} style={{
              padding: '8px 14px', background: '#fef3c7', color: '#92400e', border: 'none',
              borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              🗓 Horarios PDF
            </button>
          </React.Fragment>
        ))}
        <button onClick={() => setPromptOpen(true)} disabled={busy || vacio}
          title="Propone un reparto completo respetando las jornadas y la demanda"
          style={{ padding: '8px 16px',
            background: 'linear-gradient(135deg,#7c3aed,#2563eb)', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
            cursor: 'pointer', opacity: busy || vacio ? 0.5 : 1 }}>
          ✨ Sugerir reparto
        </button>
        <button onClick={() => setNuevoDocente({ nombre: '', departamento: departamentos[0] || '', nivel: 'Media', horas_contrato: 44 })}
          style={{ padding: '8px 16px', background: primary, color: '#fff', border: 'none',
            borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Docente</button>
        <button onClick={() => setShowProceso(v => !v)} title="Gestionar el proceso del año"
          style={{ padding: '8px 12px', background: showProceso ? '#e2e8f0' : '#f1f5f9',
            border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, cursor: 'pointer',
            fontWeight: 600, color: '#475569' }}>⚙️</button>
      </div>

      {/* Selector de año */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        {procesos.map(p => {
          const sel = p.year === year;
          const col = p.cerrado ? '#16a34a' : p.en_blanco ? '#94a3b8' : '#f59e0b';
          return (
            <button key={p.year} onClick={() => cambiarAnio(p.year)}
              style={{
                padding: '7px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                border: `1px solid ${sel ? primary : '#e2e8f0'}`,
                background: sel ? `${primary}10` : '#fff',
                boxShadow: sel ? `0 0 0 2px ${primary}22` : 'none',
              }}>
              <span style={{ fontSize: 14, fontWeight: 800,
                color: sel ? primary : '#0f172a' }}>{p.year}</span>
              <span style={{ fontSize: 11, color: col, fontWeight: 700, marginLeft: 8 }}>
                {p.cerrado ? '✓ cerrado' : p.en_blanco ? 'sin repartir' : `${p.cobertura_pct}%`}
              </span>
            </button>
          );
        })}
        {!procesos.some(p => p.year === sugerido) && (
          <button onClick={() => cambiarAnio(sugerido)} style={{
            padding: '7px 14px', borderRadius: 10, cursor: 'pointer',
            border: `1px dashed ${primary}`, background: '#fff', color: primary,
            fontSize: 13, fontWeight: 700 }}>+ Abrir {sugerido}</button>
        )}
        <button onClick={abrirOtroAnio} title="Abrir cualquier otro año" style={{
          padding: '7px 12px', borderRadius: 10, cursor: 'pointer',
          border: '1px dashed #cbd5e1', background: '#fff', color: '#64748b',
          fontSize: 13, fontWeight: 600 }}>+ Otro año…</button>
      </div>

      {/* Aviso: el año está completo igual que el anterior, probablemente por un
          seed repetido. Ofrece vaciarlo para armarlo de verdad. */}
      {!showProceso && procActivo?.cerrado && anioBase && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10,
          padding: '12px 16px', marginBottom: 18, display: 'flex', alignItems: 'center',
          gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#1e3a8a', margin: 0 }}>
              El proceso {year} ya viene repartido al 100%
            </p>
            <p style={{ fontSize: 12, color: '#1d4ed8', margin: '3px 0 0' }}>
              Si querés armar {year} de cero manteniendo docentes, jornadas y demanda,
              vaciá el reparto. El histórico de {anioBase} no se toca.
            </p>
          </div>
          <button disabled={busy} onClick={reiniciarDist} style={{
            padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none',
            borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            opacity: busy ? 0.6 : 1, whiteSpace: 'nowrap' }}>
            ↺ Vaciar reparto de {year}
          </button>
        </div>
      )}

      {/* Panel de gestión del proceso */}
      {showProceso && (
        <div className="card" style={{ marginBottom: 18, background: '#f8fafc' }}>
          <h3 style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', margin: '0 0 4px',
            textTransform: 'uppercase', letterSpacing: '0.06em' }}>Proceso {year}</h3>
          <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 14px' }}>
            {procActivo
              ? `${procActivo.docentes} docentes · ${procActivo.total_asignado} de ${procActivo.total_demanda} h repartidas`
              : 'Este año todavía no existe.'}
          </p>

          {/* Empezar de nuevo */}
          <p style={seccProc}>Empezar de nuevo</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <button disabled={busy || !procActivo} onClick={reiniciarDist}
              style={{ ...btnProc, borderColor: '#bfdbfe', background: '#eff6ff',
                color: '#1d4ed8', fontWeight: 700 }}
              title="Conserva docentes, jornadas y demanda. Solo borra el reparto.">
              ↺ Vaciar el reparto de {year} y partir de cero
            </button>
            {anioBase && (
              <button disabled={busy} onClick={() => iniciarProceso(year, anioBase, false, true)}
                style={btnProc}
                title={`Borra ${year} y lo reconstruye con los docentes y la demanda de ${anioBase}`}>
                ⟳ Rehacer {year} desde {anioBase}
              </button>
            )}
          </div>

          {/* Traer de otro año */}
          {otrosAnios.length > 0 && (
            <>
              <p style={seccProc}>Traer el reparto de otro año</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                {otrosAnios.map(o => (
                  <button key={`cp${o}`} disabled={busy || !procActivo}
                    onClick={() => copiarDist(o)} style={btnProc}
                    title={!procActivo ? 'Primero abrí el año' : `Copia la distribución de ${o}`}>
                    ⬇ Traer distribución de {o}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Reetiquetar */}
          <p style={seccProc}>Cambiar de año</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {[year - 1, year + 1].map(h => {
              const ocupado = procesos.some(p => p.year === h);
              return (
                <button key={`mv${h}`} disabled={busy || !procActivo}
                  onClick={() => moverAnio(year, h)} style={btnProc}
                  title={ocupado
                    ? `${h} ya tiene datos: se borrarán para recibir este proceso`
                    : `Reetiqueta el proceso ${year} como ${h}`}>
                  ↔ Mover a {h}{ocupado ? ' (reemplaza)' : ''}
                </button>
              );
            })}
          </div>

          {/* Destructivo */}
          <p style={seccProc}>Eliminar</p>
          <button disabled={busy || !procActivo} onClick={() => accion(
            () => axios.delete(`/api/carga-academica/procesos/${year}`).then(() => setYear(null)),
            `¿Eliminar por completo el proceso ${year}? Borra docentes, demanda, reparto y horarios.`
          )} style={{ ...btnProc, color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}>
            🗑 Eliminar proceso {year}
          </button>
        </div>
      )}

      {cargandoAnio && (
        <div className="card" style={{ display: 'flex', justifyContent: 'center',
          padding: 50, marginBottom: 20 }}>
          <div className="spinner" />
        </div>
      )}

      {!cargandoAnio && vacio && (
        <div className="card" style={{ padding: 32, marginBottom: 20 }}>
          <p style={{ fontSize: 16, color: '#0f172a', margin: '0 0 4px', fontWeight: 700,
            textAlign: 'center' }}>Abrir el proceso {year}</p>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 22px', textAlign: 'center' }}>
            {anioBase
              ? `Se arrastran los docentes de ${anioBase} manteniendo su jornada contratada, y la demanda de horas por asignatura.`
              : 'Aún no hay ningún año cargado en el módulo.'}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: anioBase ? '1fr 1fr' : '1fr',
            gap: 14, maxWidth: 680, margin: '0 auto' }}>
            {anioBase && (
              <>
                <div style={{ border: `2px solid ${primary}`, borderRadius: 12, padding: 18,
                  background: `${primary}08` }}>
                  <p style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>
                    Partir en blanco
                  </p>
                  <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 14px', lineHeight: 1.5 }}>
                    Trae docentes y demanda de {anioBase}, pero deja la distribución vacía
                    para repartir de cero con las reglas nuevas.
                  </p>
                  <button disabled={busy} onClick={() => iniciarProceso(year, anioBase, false)}
                    style={{ width: '100%', padding: '9px 0', background: primary, color: '#fff',
                      border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
                      cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                    Iniciar {year} en blanco
                  </button>
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 18 }}>
                  <p style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>
                    Partir desde {anioBase}
                  </p>
                  <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 14px', lineHeight: 1.5 }}>
                    Copia también la distribución de {anioBase} como borrador, para irla
                    ajustando y mover docentes de nivel.
                  </p>
                  <button disabled={busy} onClick={() => iniciarProceso(year, anioBase, true)}
                    style={{ width: '100%', padding: '9px 0', background: '#f1f5f9', color: '#374151',
                      border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 700,
                      cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                    Copiar carga {anioBase} → {year}
                  </button>
                </div>
              </>
            )}
          </div>

          <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 24, paddingTop: 18,
            textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 10px' }}>
              {anioBase
                ? `¿Falta el histórico? Carga el Departamento de Lenguaje en ${year}.`
                : `Carga el histórico del Departamento de Lenguaje (Word 2026) en ${year}.`}
            </p>
            <button onClick={seed} disabled={seeding} style={{ padding: '8px 18px',
              background: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8,
              fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: seeding ? 0.6 : 1 }}>
              {seeding ? 'Poblando...' : `⚡ Poblar histórico de Lenguaje en ${year}`}
            </button>
          </div>
        </div>
      )}

      {!cargandoAnio && !vacio && (
        <>
          {/* Resumen */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
            <StatBox label="Cobertura total" value={`${r.cobertura_pct}%`}
              sub={`${r.total_asignado} de ${r.total_demanda} h asignadas`}
              color={r.cobertura_pct >= 100 ? '#16a34a' : '#f59e0b'} />
            <StatBox label="Horas sin asignar" value={r.total_faltante}
              sub="de la demanda definida" color={r.total_faltante === 0 ? '#16a34a' : '#dc2626'} />
            <StatBox label="Docentes cuadrados" value={`${r.docentes_completos}/${r.docentes_total}`}
              sub="carga = jornada legal"
              color={r.docentes_completos === r.docentes_total ? '#16a34a' : '#f59e0b'} />
            <StatBox label="Alertas" value={alertas.length}
              sub="descuadres y reglas" color={alertas.length ? '#dc2626' : '#16a34a'} />
          </div>

          {/* Alertas */}
          {alertas.length > 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
              padding: '12px 16px', marginBottom: 18 }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: '#92400e', margin: '0 0 6px',
                textTransform: 'uppercase', letterSpacing: '0.05em' }}>Revisar</p>
              {alertas.map((a, i) => (
                <p key={i} style={{ fontSize: 13, color: '#92400e', margin: '3px 0' }}>• {a.mensaje}</p>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div className="tabs" style={{ marginBottom: 16 }}>
            {[
              ['asignaturas', '📊 Por Asignatura'],
              ['docentes',    '👤 Por Docente'],
              ['demanda',     '⚙️ Demanda de horas'],
            ].map(([k, label]) => (
              <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}
                style={tab === k ? { background: primary, color: '#fff' } : {}}>{label}</button>
            ))}
          </div>

          {/* ── TAB: POR ASIGNATURA ── */}
          {tab === 'asignaturas' && (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', margin: '0 0 16px',
                  textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cobertura por asignatura</h3>
                {(data?.por_asignatura || []).map(a => {
                  const full = a.horas_faltantes === 0;
                  const over = a.horas_faltantes < 0;
                  const color = over ? '#dc2626' : full ? '#16a34a' : '#f59e0b';
                  return (
                    <div key={a.asignatura} style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between',
                        alignItems: 'baseline', marginBottom: 5 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{a.asignatura}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color }}>
                          {a.horas_asignadas} / {a.horas_demanda} h
                          {over ? ` · sobrecarga ${-a.horas_faltantes}` : full ? ' ✓' : ` · faltan ${a.horas_faltantes}`}
                        </span>
                      </div>
                      <Bar pct={a.cobertura_pct} color={color} />
                    </div>
                  );
                })}
              </div>

              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid #f1f5f9' }}>
                  <h3 style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', margin: 0,
                    textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Detalle: asignatura › nivel › curso
                  </h3>
                </div>

                {/* Acordeón de tres niveles */}
                {(() => {
                  const filas = cobertura.length ? cobertura : (data?.detalle_demanda || []);
                  const porAsig = {};
                  filas.forEach(f => { (porAsig[f.asignatura] ||= []).push(f); });

                  return Object.entries(porAsig).map(([asig, niveles]) => {
                    const dem = niveles.reduce((n, x) => n + x.horas_totales, 0);
                    const asi = niveles.reduce((n, x) => n + x.horas_asignadas, 0);
                    const col = asi === dem ? '#16a34a' : asi > dem ? '#dc2626' : '#f59e0b';
                    const open = !!abiertas[asig];
                    return (
                      <div key={asig} style={{ borderTop: '1px solid #f1f5f9' }}>
                        {/* Nivel 1: asignatura */}
                        <div onClick={() => setAbiertas(a => ({ ...a, [asig]: !a[asig] }))}
                          style={{ display: 'flex', alignItems: 'center', gap: 10,
                            padding: '11px 18px', cursor: 'pointer', userSelect: 'none',
                            background: open ? '#f8fafc' : '#fff' }}>
                          <span style={{ color: '#94a3b8', fontSize: 11, width: 12 }}>
                            {open ? '▼' : '▶'}
                          </span>
                          <span style={{ flex: 1, fontWeight: 700, fontSize: 13.5,
                            color: '#0f172a' }}>{asig}</span>
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>
                            {niveles.length} {niveles.length === 1 ? 'nivel' : 'niveles'}
                          </span>
                          <span style={{ fontSize: 12.5, fontWeight: 800, color: col,
                            minWidth: 86, textAlign: 'right' }}>
                            {asi} / {dem} h
                          </span>
                        </div>

                        {open && niveles.map(n => {
                          const clave = `${asig}|${n.nivel}`;
                          const abierto = !!abiertas[clave];
                          const cn = n.horas_asignadas === n.horas_totales ? '#16a34a'
                            : n.horas_asignadas > n.horas_totales ? '#dc2626' : '#f59e0b';
                          const detalle = n.por_letra_detalle;
                          return (
                            <div key={n.id} style={{ borderTop: '1px solid #f8fafc' }}>
                              {/* Nivel 2: nivel */}
                              <div onClick={() => setAbiertas(a => ({ ...a, [clave]: !a[clave] }))}
                                style={{ display: 'flex', alignItems: 'center', gap: 10,
                                  padding: '8px 18px 8px 42px', cursor: detalle ? 'pointer' : 'default',
                                  background: abierto ? '#f1f5f9' : 'transparent' }}>
                                <span style={{ color: '#cbd5e1', fontSize: 10, width: 12 }}>
                                  {detalle ? (abierto ? '▼' : '▶') : '·'}
                                </span>
                                <span style={{ flex: 1, fontSize: 13, color: '#334155' }}>{n.nivel}</span>
                                <span style={{ fontSize: 11.5, color: '#94a3b8' }}>
                                  {n.por_letra
                                    ? `${(n.letras_demanda || n.letras?.split(',') || []).join(', ')} · ${n.horas_por_grupo} h c/u`
                                    : `grupo único · ${n.horas_por_grupo} h`}
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: cn,
                                  minWidth: 86, textAlign: 'right' }}>
                                  {n.horas_asignadas} / {n.horas_totales} h
                                </span>
                              </div>

                              {/* Nivel 3: curso */}
                              {abierto && detalle && (
                                <div style={{ padding: '4px 18px 12px 66px', background: '#fafbfc' }}>
                                  {n.por_letra ? (
                                    (n.letras_demanda || []).map(L => {
                                      const quienes = detalle[L] || [];
                                      const cc = quienes.length > 1 ? '#dc2626'
                                        : quienes.length === 1 ? '#16a34a' : '#94a3b8';
                                      return (
                                        <div key={L} style={{ display: 'flex', alignItems: 'center',
                                          gap: 10, padding: '5px 0',
                                          borderBottom: '1px solid #f1f5f9' }}>
                                          <span style={{ fontSize: 12, fontWeight: 800,
                                            color: '#0f172a', minWidth: 92 }}>
                                            {n.nivel} {L}
                                          </span>
                                          <span style={{ flex: 1, fontSize: 12.5, color: cc,
                                            fontWeight: quienes.length === 1 ? 500 : 700 }}>
                                            {quienes.length === 0 ? 'sin docente asignado'
                                              : quienes.length > 1
                                                ? `⚠ ${quienes.map(q => q.docente).join(' + ')}`
                                                : quienes[0].docente}
                                          </span>
                                          <span style={{ fontSize: 12, color: '#64748b',
                                            fontWeight: 700 }}>
                                            {quienes.length ? `${n.horas_por_grupo} h` : '—'}
                                          </span>
                                        </div>
                                      );
                                    })
                                  ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10,
                                      padding: '5px 0' }}>
                                      <span style={{ fontSize: 12, fontWeight: 800,
                                        color: '#0f172a', minWidth: 92 }}>grupo único</span>
                                      <span style={{ flex: 1, fontSize: 12.5,
                                        color: n.asignados?.length ? '#16a34a' : '#94a3b8' }}>
                                        {n.asignados?.length
                                          ? n.asignados.map(a => a.docente).join(', ')
                                          : 'sin docente asignado'}
                                      </span>
                                      <span style={{ fontSize: 12, color: '#64748b',
                                        fontWeight: 700 }}>{n.horas_por_grupo} h</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  });
                })()}
              </div>
            </>
          )}

          {/* ── TAB: POR DOCENTE ── */}
          {tab === 'docentes' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Docente', 'Depto.', 'Jornada', 'En aula', 'Asignadas', 'Dif.', 'Dispon.', 'No lectivas', 'Estado'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11,
                        textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {docentes.map(d => {
                    const ok = d.completo && !d.excede_disponibilidad && !d.excede_no_lectivas;
                    const col = ok ? '#16a34a' : '#dc2626';
                    return (
                      <tr key={d.id} onClick={() => navigate(`/carga-academica/docentes/${d.id}`)}
                        style={{ borderTop: '1px solid #f1f5f9', cursor: 'pointer' }}>
                        <td style={{ padding: '9px 10px', fontWeight: 700, color: '#0f172a' }}>{d.nombre}</td>
                        <td style={{ padding: '9px 10px', color: '#64748b', fontSize: 12 }}>{d.departamento || '—'}</td>
                        <td style={{ padding: '9px 10px', color: '#475569' }}>{d.horas_contrato} h</td>
                        <td style={{ padding: '9px 10px', color: '#475569' }}>{d.horas_pedagogicas}</td>
                        <td style={{ padding: '9px 10px', fontWeight: 700 }}>{d.total_lectivas}</td>
                        <td style={{ padding: '9px 10px', fontWeight: 800,
                          color: d.diferencia === 0 ? '#16a34a' : '#dc2626' }}>
                          {d.diferencia === 0 ? '0' : (d.diferencia > 0 ? `+${d.diferencia}` : d.diferencia)}
                        </td>
                        <td style={{ padding: '9px 10px', fontWeight: 700,
                          color: d.excede_disponibilidad ? '#dc2626' : '#64748b' }}>
                          {d.disponibilidad}{d.excede_disponibilidad ? ' ⚠' : ''}
                        </td>
                        <td style={{ padding: '9px 10px', color: '#64748b', fontSize: 12 }}>
                          {fmtHM(d.total_actividades_min)} / {fmtHM(d.no_lectivas_min)}
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px',
                            borderRadius: 20, background: `${col}18`, color: col }}>
                            {ok ? '✓ cuadrado' : 'revisar'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── TAB: DEMANDA ── */}
          {tab === 'demanda' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 18px', borderBottom: '1px solid #f1f5f9',
                display: 'flex', alignItems: 'center', gap: 10 }}>
                <h3 style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', margin: 0, flex: 1,
                  textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Horas que necesita cada asignatura por nivel
                </h3>
                <button onClick={addDemanda} style={{ background: `${primary}15`, color: primary,
                  border: 'none', padding: '5px 12px', borderRadius: 6, fontSize: 12,
                  cursor: 'pointer', fontWeight: 700 }}>+ Fila</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Departamento', 'Asignatura', 'Nivel', 'Modalidad', 'Letras', 'Hrs/grupo', 'Total', ''].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11,
                        textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {demanda.map(d => (
                    <tr key={d.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '4px 6px', width: 120 }}>
                        <input style={inp} defaultValue={d.departamento || ''}
                          onBlur={e => patchDemanda(d.id, { departamento: e.target.value })} />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <select
                          style={{ ...inp, borderColor: d.en_catalogo ? '#e2e8f0' : '#fbbf24' }}
                          value={d.subject_id || ''}
                          title={d.en_catalogo ? '' : 'Esta fila no está enlazada al catálogo'}
                          onChange={e => onPickAsignatura(d.id, e.target.value)}>
                          {!d.en_catalogo && (
                            <option value="">⚠ {d.asignatura} (fuera del catálogo)</option>
                          )}
                          {asignaturas.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                          <option value="__nueva__">+ Crear nueva asignatura…</option>
                        </select>
                      </td>
                      <td style={{ padding: '4px 6px', width: 115 }}>
                        <select style={inp} value={d.nivel}
                          onChange={e => patchDemanda(d.id, { nivel: e.target.value })}>
                          {(cat?.niveles || []).map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '4px 6px', width: 125 }}>
                        <select style={inp} value={d.por_letra ? '1' : '0'}
                          onChange={e => patchDemanda(d.id, { por_letra: e.target.value === '1' })}>
                          <option value="1">Por letra</option>
                          <option value="0">Grupo único</option>
                        </select>
                      </td>
                      <td style={{ padding: '4px 6px', width: 85 }}>
                        <input style={inp} disabled={!d.por_letra} defaultValue={d.letras || ''}
                          placeholder={d.por_letra ? 'A,B,C' : '—'}
                          onBlur={e => patchDemanda(d.id, { letras: e.target.value })} />
                      </td>
                      <td style={{ padding: '4px 6px', width: 80 }}>
                        <input type="number" min={0} style={{ ...inp, textAlign: 'center' }}
                          defaultValue={d.horas_por_grupo}
                          onBlur={e => patchDemanda(d.id, { horas_por_grupo: Number(e.target.value) || 0 })} />
                      </td>
                      <td style={{ padding: '4px 10px', fontWeight: 800, color: '#0f172a' }}>{d.horas_totales}</td>
                      <td style={{ padding: '4px', width: 36, textAlign: 'center' }}>
                        <button onClick={async () => {
                          if (!window.confirm(`¿Eliminar "${d.asignatura} · ${d.nivel}"?`)) return;
                          await axios.delete(`/api/carga-academica/demanda/${d.id}`);
                          fetchAll();
                        }} style={{ background: '#fee2e2', border: 'none', borderRadius: 5,
                          cursor: 'pointer', color: '#dc2626', fontSize: 11, padding: '4px 7px' }}>✕</button>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                    <td colSpan={6} style={{ padding: '9px 12px', fontWeight: 800 }}>Demanda total</td>
                    <td style={{ padding: '9px 10px', fontWeight: 900, fontSize: 15 }}>{r.total_demanda}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Prompt de la sugerencia */}
      {promptOpen && (
        <div onClick={() => !pensando && setPromptOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff',
            borderRadius: 16, width: 540, maxWidth: '95vw', padding: 24 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800 }}>
              ✨ Sugerir reparto {year}
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
              Respeta las jornadas, no pasa de {cat?.max_disponibilidad || 3} h de
              disponibilidad y no deja un curso con dos profesores. Primero vas a ver
              la propuesta.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              {[
                ['completar', 'Completar lo que falta',
                 'Respeta todo lo que ya asignaste y solo reparte los cursos sin docente. Las horas de disponibilidad sí se pueden ocupar.'],
                ['rehacer', 'Rehacer todo el reparto',
                 'Borra las asignaturas actuales y arma la distribución de cero. Los cargos como jefatura se conservan.'],
              ].map(([k, titulo, desc]) => (
                <label key={k} style={{ display: 'flex', gap: 10, padding: '10px 12px',
                  border: `1px solid ${modoSug === k ? primary : '#e2e8f0'}`,
                  background: modoSug === k ? `${primary}0A` : '#fff',
                  borderRadius: 10, cursor: 'pointer' }}>
                  <input type="radio" name="modoSug" checked={modoSug === k}
                    onChange={() => setModoSug(k)} style={{ marginTop: 3 }} />
                  <span>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 700,
                      color: k === 'rehacer' ? '#b45309' : '#0f172a' }}>
                      {titulo}{k === 'completar' ? ' · recomendado' : ''}
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: '#64748b',
                      lineHeight: 1.45, marginTop: 2 }}>{desc}</span>
                  </span>
                </label>
              ))}
            </div>

            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b',
              textTransform: 'uppercase', marginBottom: 6 }}>
              Qué tener en cuenta <span style={{ fontWeight: 400 }}>(opcional)</span>
            </label>
            <textarea rows={5} value={instrucciones}
              onChange={e => setInstrucciones(e.target.value)}
              placeholder={'Por ejemplo:\n· Karla prefiere básica, no darle IV Medio\n· Los electivos de III Medio para Dominique\n· Francisca sigue con Taller PAES'}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0',
                borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
                boxSizing: 'border-box', lineHeight: 1.5 }} />

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14,
              fontSize: 13, color: '#334155', cursor: 'pointer' }}>
              <input type="checkbox" checked={rotar} onChange={e => setRotar(e.target.checked)} />
              Mover de niveles a los docentes respecto del año anterior
            </label>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
              <button disabled={pensando} onClick={() => setPromptOpen(false)} style={{
                padding: '9px 18px', background: '#f1f5f9', border: 'none', borderRadius: 8,
                fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#475569' }}>
                Cancelar
              </button>
              <button disabled={pensando} onClick={pedirSugerencia} style={{
                padding: '9px 20px', background: 'linear-gradient(135deg,#7c3aed,#2563eb)',
                color: '#fff', border: 'none', borderRadius: 8, fontSize: 13,
                fontWeight: 700, cursor: 'pointer', opacity: pensando ? 0.6 : 1 }}>
                {pensando ? 'Calculando…' : 'Proponer reparto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vista previa de la propuesta */}
      {sugerencia && (
        <div onClick={() => setSugerencia(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff',
            borderRadius: 16, width: 760, maxWidth: '96vw', maxHeight: '88vh',
            display: 'flex', flexDirection: 'column' }}>

            <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, flex: 1 }}>
                  Propuesta de reparto {year}
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px',
                    borderRadius: 20, marginLeft: 10, verticalAlign: 'middle',
                    background: sugerencia.modo === 'rehacer' ? '#fef3c7' : '#dcfce7',
                    color: sugerencia.modo === 'rehacer' ? '#92400e' : '#15803d' }}>
                    {sugerencia.modo === 'rehacer' ? 'rehace todo' : 'solo completa'}
                  </span>
                </h2>
                <button onClick={() => setSugerencia(null)} style={{ background: 'none',
                  border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
                {[
                  ['Horas repartidas', `${sugerencia.resumen.total_propuesto} / ${sugerencia.resumen.total_demanda}`,
                    sugerencia.resumen.sin_repartir === 0 ? '#16a34a' : '#dc2626'],
                  ['Docentes cuadrados', `${sugerencia.resumen.docentes_cuadrados} / ${sugerencia.resumen.docentes}`,
                    sugerencia.resumen.docentes_cuadrados === sugerencia.resumen.docentes ? '#16a34a' : '#f59e0b'],
                  ['Se agregan', `${sugerencia.resumen.filas_nuevas} filas · ${sugerencia.resumen.horas_nuevas} h`, '#2563eb'],
                ].map(([l, v, c]) => (
                  <div key={l}>
                    <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: '#94a3b8',
                      textTransform: 'uppercase' }}>{l}</p>
                    <p style={{ margin: 0, fontSize: 18, fontWeight: 900, color: c }}>{v}</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ overflowY: 'auto', padding: '16px 22px', flex: 1 }}>
              {(sugerencia.preferencias?.notas || []).length > 0 && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe',
                  borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: '#1e3a8a',
                    textTransform: 'uppercase', margin: '0 0 5px' }}>Qué se consideró</p>
                  {sugerencia.preferencias.notas.map((n, i) => (
                    <p key={i} style={{ fontSize: 12.5, color: '#1d4ed8', margin: '2px 0' }}>· {n}</p>
                  ))}
                </div>
              )}

              {sugerencia.advertencias.length > 0 && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a',
                  borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: '#92400e',
                    textTransform: 'uppercase', margin: '0 0 5px' }}>Revisar</p>
                  {sugerencia.advertencias.map((a, i) => (
                    <p key={i} style={{ fontSize: 12.5, color: '#92400e', margin: '3px 0',
                      lineHeight: 1.5 }}>· {a}</p>
                  ))}
                </div>
              )}

              {sugerencia.propuesta.map(p => {
                const ok = p.horas_asignadas === p.horas_pedagogicas;
                return (
                  <div key={p.docente_id} style={{ border: '1px solid #e2e8f0',
                    borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 14px', background: '#f8fafc' }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5, flex: 1 }}>{p.docente}</span>
                      <span style={{ fontSize: 11.5, color: '#94a3b8' }}>
                        jornada {p.horas_contrato} h
                      </span>
                      <span style={{ fontSize: 12.5, fontWeight: 800,
                        color: ok ? '#16a34a' : '#dc2626' }}>
                        {p.horas_asignadas} / {p.horas_pedagogicas} h {ok ? '✓' : ''}
                      </span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                      <tbody>
                        {p.filas.map((f, i) => (
                          <tr key={i} style={{ borderTop: '1px solid #f1f5f9',
                            background: f.existente ? '#fafafa' : '#f0f9ff' }}>
                            <td style={{ padding: '5px 14px',
                              color: f.existente ? '#94a3b8' : '#0f172a',
                              fontWeight: f.existente ? 400 : 600 }}>
                              {!f.existente && <span style={{ color: '#2563eb', marginRight: 5,
                                fontWeight: 800 }}>+</span>}
                              {f.asignatura}
                            </td>
                            <td style={{ padding: '5px 10px', width: 170,
                              color: f.existente ? '#cbd5e1' : '#64748b' }}>
                              {f.nivel
                                ? `${f.nivel}${f.letras ? ' ' + f.letras.replace(/,/g, ', ') : ''}`
                                : (f.letras || '')}
                            </td>
                            <td style={{ padding: '5px 14px', textAlign: 'right', width: 54,
                              fontWeight: 700, color: f.existente ? '#94a3b8' : '#0f172a' }}>
                              {f.horas} h
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>

            <div style={{ padding: '14px 22px', borderTop: '1px solid #e2e8f0',
              display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setSugerencia(null); setPromptOpen(true); }}
                style={{ padding: '9px 18px', background: '#f1f5f9', border: 'none',
                  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  color: '#475569' }}>Ajustar instrucciones</button>
              <button disabled={busy} onClick={aplicarSugerencia} style={{
                padding: '9px 20px',
                background: sugerencia.modo === 'rehacer' ? '#d97706' : '#16a34a',
                color: '#fff', border: 'none',
                borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                opacity: busy ? 0.6 : 1 }}>
                {sugerencia.modo === 'rehacer'
                  ? `Rehacer ${year}`
                  : `Agregar ${sugerencia.resumen.filas_nuevas} filas`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nuevo docente */}
      {nuevoDocente && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setNuevoDocente(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16,
            width: 420, maxWidth: '92vw', padding: 24 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 18px' }}>Nuevo docente</h2>
            {[
              ['nombre', 'Nombre completo', 'text'],
              ['departamento', 'Departamento', 'text'],
            ].map(([k, label, type]) => (
              <div key={k} style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b',
                  textTransform: 'uppercase', marginBottom: 4 }}>{label}</label>
                <input type={type} style={inp} value={nuevoDocente[k] || ''}
                  onChange={e => setNuevoDocente({ ...nuevoDocente, [k]: e.target.value })} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b',
                  textTransform: 'uppercase', marginBottom: 4 }}>Nivel</label>
                <select style={inp} value={nuevoDocente.nivel}
                  onChange={e => setNuevoDocente({ ...nuevoDocente, nivel: e.target.value })}>
                  <option value="Media">Media</option>
                  <option value="Básica">Básica</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b',
                  textTransform: 'uppercase', marginBottom: 4 }}>Horas contrato</label>
                <select style={inp} value={nuevoDocente.horas_contrato}
                  onChange={e => setNuevoDocente({ ...nuevoDocente, horas_contrato: Number(e.target.value) })}>
                  {(cat?.tabla_legal || []).map(t => (
                    <option key={t.jornada} value={t.jornada}>
                      {t.jornada} h → {t.horas_pedagogicas} aula
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setNuevoDocente(null)} style={{ padding: '8px 16px',
                background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer',
                fontSize: 13, fontWeight: 600, color: '#475569' }}>Cancelar</button>
              <button onClick={crearDocente} style={{ padding: '8px 18px', background: primary,
                color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer',
                fontSize: 13, fontWeight: 700 }}>Crear y distribuir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
