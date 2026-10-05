import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import descargarArchivo from './descargar';

const TIPO_LABEL = {
  asignatura:        'Asignatura',
  jefe_departamento: 'Jefe de Departamento',
  disponibilidad:    'Disponibilidad',
  toma_contacto:     'Toma de contacto',
  orientacion:       'Orientación / Consejo de curso',
  jefatura:          'Trabajo de jefatura',
  otro:              'Otro',
};

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

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      border: `1px solid ${color ? color + '40' : '#e2e8f0'}`, borderRadius: 10,
      padding: '12px 16px', background: color ? `${color}0A` : '#fff', flex: 1, minWidth: 130,
    }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: color || '#94a3b8', margin: '0 0 4px',
        textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', margin: 0, lineHeight: 1.1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: '#94a3b8', margin: '3px 0 0' }}>{sub}</p>}
    </div>
  );
}

export default function CargaDocenteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { school } = useAuth();
  const primary = school?.primary_color || '#2563EB';

  const [doc, setDoc] = useState(null);
  const [demanda, setDemanda] = useState([]);
  const [cat, setCat] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [ref, setRef] = useState(null);
  const [showRef, setShowRef] = useState(true);
  const [actividades, setActividades] = useState([]);      // no lectivas
  const [actLectivas, setActLectivas] = useState([]);      // lectivas
  const [vista, setVista] = useState('carga');   // carga | horario
  const [hor, setHor] = useState(null);
  const [sel, setSel] = useState(null);          // celda abierta {bloque_id, dia}

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  const fetchAll = useCallback(async () => {
    try {
      const d = await axios.get(`/api/carga-academica/docentes/${id}`);
      setDoc(d.data);
      const [dm, c] = await Promise.all([
        axios.get(`/api/carga-academica/demanda?year=${d.data.year}`),
        axios.get('/api/carga-academica/catalogos'),
      ]);
      setDemanda(dm.data);
      setCat(c.data);
      try {
        const rf = await axios.get(`/api/carga-academica/docentes/${id}/referencia`);
        setRef(rf.data);
      } catch { setRef(null); }
      try {
        const [anl, al] = await Promise.all([
          axios.get('/api/carga-academica/actividades?ambito=no_lectiva'),
          axios.get('/api/carga-academica/actividades?ambito=lectiva'),
        ]);
        setActividades(anl.data);
        setActLectivas(al.data);
      } catch { setActividades([]); setActLectivas([]); }
    } catch { navigate('/carga-academica'); }
    setLoading(false);
  }, [id, navigate]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Asignaciones ──────────────────────────────────────────────────
  const addFila = async (tipo) => {
    await axios.post(`/api/carga-academica/docentes/${id}/asignaciones`, {
      tipo, horas: 0, orden: (doc.asignaciones?.length || 0),
    });
    fetchAll();
  };

  const patchFila = async (aid, payload) => {
    await axios.put(`/api/carga-academica/asignaciones/${aid}`, payload);
    fetchAll();
  };

  const delFila = async (aid) => {
    await axios.delete(`/api/carga-academica/asignaciones/${aid}`);
    fetchAll();
  };

  // Al elegir una asignatura de la demanda, precargar letras y calcular horas
  const onPickDemanda = (a, demandaId) => {
    const d = demanda.find(x => x.id === Number(demandaId));
    if (!d) return patchFila(a.id, { demanda_id: null, horas: 0, letras: null });
    if (d.por_letra) {
      patchFila(a.id, { demanda_id: d.id, letras: d.letras, horas: d.horas_por_grupo * d.n_letras });
    } else {
      patchFila(a.id, { demanda_id: d.id, letras: null, horas: d.horas_por_grupo });
    }
  };

  // Al cambiar las letras, recalcular horas = horas_por_grupo × n_letras
  const onChangeLetras = (a, letras) => {
    const d = demanda.find(x => x.id === a.demanda_id);
    const n = letras.split(',').filter(x => x.trim()).length;
    const horas = d && d.por_letra ? d.horas_por_grupo * n : a.horas;
    patchFila(a.id, { letras, horas });
  };

  // ── No lectivas ───────────────────────────────────────────────────
  const saveNoLectivas = async (lista) => {
    await axios.put(`/api/carga-academica/docentes/${id}`, { no_lectivas: lista });
    fetchAll();
  };

  const setActividad = (i, campo, val) => {
    const lista = [...doc.no_lectivas];
    lista[i] = { ...lista[i], [campo]: campo === 'minutos' ? Number(val) || 0 : val };
    setDoc({ ...doc, no_lectivas: lista });
  };

  const setJornada = async (jornada) => {
    await axios.put(`/api/carga-academica/docentes/${id}`, { horas_contrato: Number(jornada) });
    fetchAll();
  };

  // ── Horario ───────────────────────────────────────────────────────
  const fetchHorario = useCallback(async () => {
    const r = await axios.get(`/api/carga-academica/docentes/${id}/horario`);
    setHor(r.data);
  }, [id]);

  useEffect(() => { if (vista === 'horario') fetchHorario(); }, [vista, fetchHorario]);

  const setCelda = async (bloque_id, dia, payload) => {
    await axios.put(`/api/carga-academica/docentes/${id}/horario`, { bloque_id, dia, ...payload });
    setSel(null);
    fetchHorario();
  };

  const autocompletar = async () => {
    if (!window.confirm('¿Repartir las horas en la grilla? Se reemplaza lo que haya.')) return;
    const r = await axios.post(`/api/carga-academica/docentes/${id}/horario/autocompletar`, {});
    showToast(r.data.sin_espacio
      ? `${r.data.bloques_puestos} bloques puestos, ${r.data.sin_espacio} sin espacio`
      : `${r.data.bloques_puestos} bloques repartidos`);
    fetchHorario();
  };

  const descargarHorarioPdf = async () => {
    try {
      await descargarArchivo(`/api/carga-academica/docentes/${id}/horario.pdf`,
        `Horario_${(doc?.nombre || 'docente').replace(/ /g, '_')}_${doc?.year}.pdf`);
    } catch (e) { showToast(e.message || 'No se pudo descargar', 'error'); }
  };

  // Cambia qué actividad lectiva es una fila, desde el catálogo
  const onPickLectiva = async (a, valor) => {
    if (valor === '__nueva__') {
      const nombre = window.prompt('Nombre de la nueva actividad lectiva:');
      if (!nombre || !nombre.trim()) return;
      try {
        const r = await axios.post('/api/carga-academica/actividades',
          { nombre: nombre.trim(), ambito: 'lectiva' });
        const lista = await axios.get('/api/carga-academica/actividades?ambito=lectiva');
        setActLectivas(lista.data);
        await patchFila(a.id, { tipo: r.data.tipo || 'otro', asignatura_libre: r.data.nombre });
      } catch (e) { showToast(e.response?.data?.error || 'Error', 'error'); }
      return;
    }
    const act = actLectivas.find(x => String(x.id) === String(valor));
    if (!act) return;
    await patchFila(a.id, { tipo: act.tipo || 'otro', asignatura_libre: act.nombre });
  };

  // Agrega una actividad del catálogo, o crea una nueva al vuelo
  const agregarActividad = async (valor) => {
    if (!valor) return;
    if (valor === '__nueva__') {
      const nombre = window.prompt('Nombre de la nueva actividad no lectiva:');
      if (!nombre || !nombre.trim()) return;
      const min = Number(window.prompt('Minutos por semana:', '60')) || 60;
      try {
        const r = await axios.post('/api/carga-academica/actividades',
          { nombre: nombre.trim(), minutos_default: min });
        const lista = await axios.get('/api/carga-academica/actividades');
        setActividades(lista.data);
        saveNoLectivas([...(doc.no_lectivas || []),
          { actividad: r.data.nombre, minutos: r.data.minutos_default }]);
      } catch (e) { showToast(e.response?.data?.error || 'Error', 'error'); }
      return;
    }
    const a = actividades.find(x => String(x.id) === String(valor));
    if (!a) return;
    saveNoLectivas([...(doc.no_lectivas || []),
      { actividad: a.nombre, minutos: a.minutos_default }]);
  };

  const descargarWord = async () => {
    try {
      await descargarArchivo(`/api/carga-academica/docentes/${id}/informe.docx`,
        `Carga_${(doc?.nombre || 'docente').replace(/ /g, '_')}_${doc?.year}.docx`);
    } catch (e) { showToast(e.message || 'No se pudo descargar', 'error'); }
  };

  const imprimir = () => {
    const i = doc;
    const filas = (i.asignaciones || []).map(a => `
      <tr><td>${a.asignatura || TIPO_LABEL[a.tipo] || a.tipo}</td>
          <td style="text-align:center">${a.cursos_texto || ''}</td>
          <td style="text-align:center">${a.horas}</td></tr>`).join('');
    const acts = (i.no_lectivas || []).map(a => `
      <tr><td>${a.actividad}</td><td style="text-align:center">${fmtHM(a.minutos)}</td></tr>`).join('');
    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Carga Horaria ${i.year} — ${i.nombre}</title><style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:11pt;padding:24px;color:#000}
      h1{font-size:12pt;margin-bottom:1px} .sub{font-size:9pt;color:#444;line-height:1.3}
      .cab{display:flex;align-items:flex-start;gap:10px;margin-bottom:10px}
      .logo{height:52px;width:auto}
      .cajas{width:auto;margin-bottom:12px}
      .cajas td{border:1px solid #999;padding:4px 10px;font-size:10pt}
      .caja{background:#8EA9DB;font-weight:700;white-space:nowrap}
      .dep{font-weight:700;min-width:90px}
      table{width:100%;border-collapse:collapse;margin-bottom:14px}
      td,th{border:1px solid #999;padding:5px 8px;font-size:10pt}
      th{background:#8EA9DB;font-weight:700;text-align:center}
      .lbl{background:#D9D9D9;font-weight:700;width:42%}
      .tot{background:#D9D9D9;font-weight:700}
      @media print{body{padding:10px}}
      </style></head><body>
      <div class="cab">
        ${school?.logo_url ? `<img src="${school.logo_url}" class="logo">` : ''}
        <div>
          <h1>${school?.name || 'Colegio'}</h1>
          <p class="sub">${school?.rector ? school.rector + '<br>' : ''}Coordinación Académica.<br>${i.year}</p>
        </div>
      </div>
      <table class="cajas">
        <tr><td class="caja">CARGA HORARIA ${i.year}</td><td></td></tr>
        <tr><td class="caja">DEPARTAMENTO</td><td class="dep">${i.departamento || ''}</td></tr>
      </table>
      <table>
        <tr><td class="lbl">Docente</td><td>${i.nombre}</td></tr>
        <tr><td class="lbl">Nivel</td><td>${i.nivel || ''}</td></tr>
        <tr><td class="lbl">Horas cronológicas contrato</td><td>${i.horas_contrato}</td></tr>
        <tr><td class="lbl">Horas pedagógicas en el aula</td><td>${i.horas_pedagogicas}</td></tr>
        <tr><td class="lbl">Horas no Lectivas</td><td>${fmtHM(i.no_lectivas_min)}</td></tr>
        <tr><td class="lbl">Recreo</td><td>${fmtHM(i.recreo_min)}</td></tr>
      </table>
      <table><tr><th>ASIGNATURAS</th><th>CURSOS</th><th>CANTIDAD DE HORAS</th></tr>
        ${filas}
        <tr><td class="tot">Total de horas</td><td class="tot"></td><td class="tot" style="text-align:center">${i.total_lectivas}</td></tr>
        <tr><td><b>Diferencia vs. horas pedagógicas en aula</b></td><td></td><td style="text-align:center"><b>${i.diferencia}</b></td></tr>
      </table>
      <table><tr><th>ACTIVIDAD</th><th>TIEMPO (h:mm)</th></tr>
        ${acts}
        <tr><td class="tot">Total actividades registradas</td><td class="tot" style="text-align:center">${fmtHM(i.total_actividades_min)}</td></tr>
        <tr><td>Horas no Lectivas (según Tabla Legal)</td><td style="text-align:center">${fmtHM(i.no_lectivas_min)}</td></tr>
        <tr><td class="tot">Permanencia en horas cronológicas</td><td class="tot" style="text-align:center">${fmtHM(i.permanencia_min)}</td></tr>
        <tr><td>Recreo (según Tabla Legal)</td><td style="text-align:center">${fmtHM(i.recreo_min)}</td></tr>
      </table>
      <script>window.onload=()=>window.print();<\/script></body></html>`);
    w.document.close();
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>;
  if (!doc) return null;

  const okDif = doc.diferencia === 0;
  const jornadas = cat?.tabla_legal?.map(t => t.jornada) || [];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/carga-academica')} style={{
          padding: '7px 14px', background: '#f1f5f9', border: 'none', borderRadius: 8,
          cursor: 'pointer', fontSize: 13, color: '#475569', fontWeight: 600 }}>← Volver</button>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{doc.nombre}</h1>
          <p style={{ fontSize: 12, color: '#64748b', margin: '3px 0 0' }}>
            {doc.departamento} · {doc.nivel} · Carga {doc.year}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={imprimir} style={{ padding: '8px 14px', background: '#f1f5f9',
            border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, cursor: 'pointer',
            fontWeight: 600, color: '#374151' }}>🖨️ Imprimir</button>
          <button onClick={descargarWord} style={{ padding: '8px 14px', background: `${primary}15`,
            border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer',
            fontWeight: 600, color: primary }}>📄 Word</button>
          <button onClick={descargarHorarioPdf} style={{ padding: '8px 14px', background: '#fef3c7',
            border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer',
            fontWeight: 600, color: '#92400e' }}>🗓 Horario PDF</button>
        </div>
      </div>

      {/* Vistas */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {[['carga', '📋 Carga horaria'], ['horario', '🗓 Horario semanal']].map(([k, l]) => (
          <button key={k} className={`tab ${vista === k ? 'active' : ''}`} onClick={() => setVista(k)}
            style={vista === k ? { background: primary, color: '#fff' } : {}}>{l}</button>
        ))}
      </div>

      {vista === 'carga' && (<>
      {/* Resumen de jornada */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px',
          background: '#fff', flex: 1, minWidth: 150 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', margin: '0 0 4px',
            textTransform: 'uppercase', letterSpacing: '0.05em' }}>Horas contrato</p>
          <select value={doc.horas_contrato} onChange={e => setJornada(e.target.value)}
            style={{ fontSize: 22, fontWeight: 900, border: 'none', background: 'transparent',
              color: '#0f172a', cursor: 'pointer', padding: 0, outline: 'none' }}>
            {jornadas.map(j => <option key={j} value={j}>{j}</option>)}
          </select>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>jornada semanal</p>
        </div>
        <StatCard label="En aula (lectivas)" value={doc.horas_pedagogicas}
          sub={`${fmtHM(doc.lectivas_cronologicas_min)} cronológicas`} color={primary} />
        <StatCard label="No lectivas" value={fmtHM(doc.no_lectivas_min)}
          sub="trabajo administrativo" color="#8b5cf6" />
        <StatCard label="Recreo" value={fmtHM(doc.recreo_min)} sub="según Tabla Legal" color="#f59e0b" />
      </div>

      {/* Barra de reparto contrato */}
      <div style={{ display: 'flex', height: 26, borderRadius: 8, overflow: 'hidden',
        marginBottom: 20, border: '1px solid #e2e8f0' }}>
        {[
          { v: doc.lectivas_cronologicas_min, c: primary,   t: 'Aula' },
          { v: doc.recreo_min,                c: '#f59e0b', t: 'Recreo' },
          { v: doc.no_lectivas_min,           c: '#8b5cf6', t: 'No lectivas' },
        ].map(({ v, c, t }) => {
          const total = doc.horas_contrato * 60 || 1;
          return (
            <div key={t} title={`${t}: ${fmtHM(v)}`} style={{
              width: `${v / total * 100}%`, background: c, display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: '#fff',
              fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden' }}>
              {v / total > 0.12 ? `${t} ${fmtHM(v)}` : ''}
            </div>
          );
        })}
      </div>

      {/* Alertas */}
      {(doc.excede_disponibilidad || !okDif || doc.excede_no_lectivas) && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
          padding: '10px 14px', marginBottom: 16 }}>
          {!okDif && <p style={{ fontSize: 13, color: '#991b1b', margin: '2px 0' }}>
            ⚠️ {doc.diferencia > 0 ? 'Sobran' : 'Faltan'} <b>{Math.abs(doc.diferencia)} h</b> respecto
            de las {doc.horas_pedagogicas} horas pedagógicas de su jornada.
          </p>}
          {doc.excede_disponibilidad && <p style={{ fontSize: 13, color: '#991b1b', margin: '2px 0' }}>
            ⚠️ Disponibilidad en <b>{doc.disponibilidad} h</b> — el máximo permitido es {cat?.max_disponibilidad || 3} h semanales.
          </p>}
          {doc.excede_no_lectivas && <p style={{ fontSize: 13, color: '#991b1b', margin: '2px 0' }}>
            ⚠️ Las actividades no lectivas ({fmtHM(doc.total_actividades_min)}) superan
            las {fmtHM(doc.no_lectivas_min)} disponibles.
          </p>}
        </div>
      )}

      {/* Referencia del año anterior */}
      {ref?.encontrado && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, marginBottom: 18,
          overflow: 'hidden', background: '#fafafa' }}>
          <div onClick={() => setShowRef(v => !v)} style={{ display: 'flex', alignItems: 'center',
            gap: 10, padding: '10px 16px', cursor: 'pointer', userSelect: 'none' }}>
            <span style={{ fontSize: 10, background: '#64748b', color: '#fff', padding: '2px 8px',
              borderRadius: 4, fontWeight: 800 }}>{ref.year_origen}</span>
            <span style={{ fontWeight: 700, fontSize: 13, color: '#334155', flex: 1 }}>
              Carga del año anterior
            </span>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              jornada {ref.horas_contrato} h · {ref.total_lectivas} hrs repartidas
              {ref.disponibilidad > 0 && ` · ${ref.disponibilidad} disponibilidad`}
            </span>
            {ref.cambio_jornada && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                background: '#fef3c7', color: '#92400e' }}>jornada cambió</span>
            )}
            <span style={{ color: '#94a3b8', fontSize: 15 }}>{showRef ? '▲' : '▼'}</span>
          </div>
          {showRef && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5,
              background: '#fff', borderTop: '1px solid #e2e8f0' }}>
              <tbody>
                {ref.asignaciones.map(a => (
                  <tr key={a.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 16px', color: '#475569' }}>
                      {a.asignatura || TIPO_LABEL[a.tipo] || a.tipo}
                    </td>
                    <td style={{ padding: '6px 10px', color: '#94a3b8', width: 170 }}>{a.cursos_texto || ''}</td>
                    <td style={{ padding: '6px 16px', textAlign: 'center', width: 70,
                      fontWeight: 700, color: '#475569' }}>{a.horas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* HORAS LECTIVAS */}
      <div className="card" style={{ marginBottom: 18, padding: 0, overflow: 'hidden' }}>
        <div style={{ background: '#8EA9DB', padding: '9px 16px' }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#fff',
            letterSpacing: '0.06em' }}>HORAS LECTIVAS</h3>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 11,
                textTransform: 'uppercase', color: '#64748b' }}>Asignatura</th>
              <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 11,
                textTransform: 'uppercase', color: '#64748b', width: 170 }}>Cursos</th>
              <th style={{ padding: '7px 10px', textAlign: 'center', fontSize: 11,
                textTransform: 'uppercase', color: '#64748b', width: 80 }}>Horas</th>
              <th style={{ width: 38 }} />
            </tr>
          </thead>
          <tbody>
            {(doc.asignaciones || []).map(a => {
              const d = demanda.find(x => x.id === a.demanda_id);
              return (
                <tr key={a.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '5px 8px' }}>
                    {a.tipo === 'asignatura' ? (
                      <select style={inp} value={a.demanda_id || ''}
                        onChange={e => onPickDemanda(a, e.target.value)}>
                        <option value="">— elegir asignatura —</option>
                        {demanda.map(x => (
                          <option key={x.id} value={x.id}>
                            {x.asignatura} · {x.nivel} ({x.horas_totales} h)
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select style={inp}
                        value={(actLectivas.find(x =>
                          x.nombre === a.asignatura_libre ||
                          (!a.asignatura_libre && x.tipo === a.tipo))?.id) || ''}
                        onChange={e => onPickLectiva(a, e.target.value)}>
                        <option value="">
                          {a.asignatura_libre || TIPO_LABEL[a.tipo] || a.tipo}
                        </option>
                        {actLectivas.map(x => (
                          <option key={x.id} value={x.id}>{x.nombre}</option>
                        ))}
                        <option value="__nueva__">+ Crear nueva actividad…</option>
                      </select>
                    )}
                  </td>
                  <td style={{ padding: '5px 8px' }}>
                    {a.tipo === 'asignatura' && d?.por_letra ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {(d.letras || 'A,B,C').split(',').map(L => {
                          const sel = (a.letras || '').split(',').includes(L);
                          return (
                            <button key={L} onClick={() => {
                              const cur = (a.letras || '').split(',').filter(Boolean);
                              const next = sel ? cur.filter(x => x !== L) : [...cur, L].sort();
                              onChangeLetras(a, next.join(','));
                            }} style={{
                              width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
                              border: `1px solid ${sel ? primary : '#e2e8f0'}`,
                              background: sel ? primary : '#fff',
                              color: sel ? '#fff' : '#94a3b8', fontWeight: 700, fontSize: 12,
                            }}>{L}</button>
                          );
                        })}
                      </div>
                    ) : (
                      <input style={inp} placeholder={a.tipo === 'asignatura' ? 'grupo único' : '—'}
                        value={a.letras || ''} onBlur={e => patchFila(a.id, { letras: e.target.value })}
                        onChange={e => setDoc({ ...doc, asignaciones: doc.asignaciones.map(
                          x => x.id === a.id ? { ...x, letras: e.target.value } : x) })} />
                    )}
                  </td>
                  <td style={{ padding: '5px 8px' }}>
                    <input type="number" min={0} style={{ ...inp, textAlign: 'center', fontWeight: 700 }}
                      value={a.horas}
                      onBlur={e => patchFila(a.id, { horas: Number(e.target.value) || 0 })}
                      onChange={e => setDoc({ ...doc, asignaciones: doc.asignaciones.map(
                        x => x.id === a.id ? { ...x, horas: e.target.value } : x) })} />
                  </td>
                  <td style={{ padding: '5px 4px', textAlign: 'center' }}>
                    <button onClick={() => delFila(a.id)} style={{ background: '#fee2e2', border: 'none',
                      borderRadius: 5, cursor: 'pointer', color: '#dc2626', fontSize: 11,
                      padding: '4px 7px' }}>✕</button>
                  </td>
                </tr>
              );
            })}
            {/* Totales */}
            <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
              <td colSpan={2} style={{ padding: '8px 10px', fontWeight: 800, color: '#0f172a' }}>Total de horas</td>
              <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 900, fontSize: 15 }}>{doc.total_lectivas}</td>
              <td />
            </tr>
            <tr style={{ background: okDif ? '#f0fdf4' : '#fef2f2' }}>
              <td colSpan={2} style={{ padding: '8px 10px', fontWeight: 700,
                color: okDif ? '#15803d' : '#991b1b', fontSize: 12 }}>
                Diferencia vs. horas pedagógicas en aula ({doc.horas_pedagogicas})
              </td>
              <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 900,
                color: okDif ? '#15803d' : '#991b1b', fontSize: 15 }}>
                {okDif ? '✓ 0' : doc.diferencia}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
        <div style={{ padding: '10px 14px', display: 'flex', gap: 10, flexWrap: 'wrap',
          alignItems: 'center', borderTop: '1px solid #f1f5f9' }}>
          <button onClick={() => addFila('asignatura')} style={{
            background: `${primary}15`, color: primary, border: `1px solid ${primary}40`,
            padding: '5px 13px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
            fontWeight: 700 }}>+ Asignatura</button>
          <span style={{ color: '#cbd5e1' }}>|</span>
          <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Actividad lectiva:</span>
          <select value="" style={{ ...inp, maxWidth: 260, cursor: 'pointer' }}
            onChange={async e => {
              const v = e.target.value;
              if (!v) return;
              if (v === '__nueva__') {
                const nombre = window.prompt('Nombre de la nueva actividad lectiva:');
                if (!nombre || !nombre.trim()) return;
                const r = await axios.post('/api/carga-academica/actividades',
                  { nombre: nombre.trim(), ambito: 'lectiva' });
                const lista = await axios.get('/api/carga-academica/actividades?ambito=lectiva');
                setActLectivas(lista.data);
                await axios.post(`/api/carga-academica/docentes/${id}/asignaciones`, {
                  tipo: r.data.tipo || 'otro', asignatura_libre: r.data.nombre,
                  horas: 0, orden: (doc.asignaciones?.length || 0),
                });
                return fetchAll();
              }
              const act = actLectivas.find(x => String(x.id) === String(v));
              if (!act) return;
              await axios.post(`/api/carga-academica/docentes/${id}/asignaciones`, {
                tipo: act.tipo || 'otro', asignatura_libre: act.nombre,
                horas: 0, orden: (doc.asignaciones?.length || 0),
              });
              fetchAll();
            }}>
            <option value="">— agregar del catálogo —</option>
            {actLectivas.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            <option value="__nueva__">+ Crear nueva actividad…</option>
          </select>
        </div>
      </div>

      {/* HORAS NO LECTIVAS */}
      <div className="card" style={{ marginBottom: 24, padding: 0, overflow: 'hidden' }}>
        <div style={{ background: '#8b5cf6', padding: '9px 16px' }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#fff',
            letterSpacing: '0.06em' }}>HORAS NO LECTIVAS</h3>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 11,
                textTransform: 'uppercase', color: '#64748b' }}>Actividad</th>
              <th style={{ padding: '7px 10px', textAlign: 'center', fontSize: 11,
                textTransform: 'uppercase', color: '#64748b', width: 120 }}>Minutos</th>
              <th style={{ padding: '7px 10px', textAlign: 'center', fontSize: 11,
                textTransform: 'uppercase', color: '#64748b', width: 80 }}>h:mm</th>
              <th style={{ width: 38 }} />
            </tr>
          </thead>
          <tbody>
            {(doc.no_lectivas || []).map((act, i) => (
              <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: '5px 8px' }}>
                  <input style={inp} value={act.actividad || ''}
                    onChange={e => setActividad(i, 'actividad', e.target.value)}
                    onBlur={() => saveNoLectivas(doc.no_lectivas)} />
                </td>
                <td style={{ padding: '5px 8px' }}>
                  <input type="number" min={0} step={5} style={{ ...inp, textAlign: 'center' }}
                    value={act.minutos ?? 0}
                    onChange={e => setActividad(i, 'minutos', e.target.value)}
                    onBlur={() => saveNoLectivas(doc.no_lectivas)} />
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>
                  {fmtHM(act.minutos)}
                </td>
                <td style={{ padding: '5px 4px', textAlign: 'center' }}>
                  <button onClick={() => saveNoLectivas(doc.no_lectivas.filter((_, j) => j !== i))}
                    style={{ background: '#fee2e2', border: 'none', borderRadius: 5, cursor: 'pointer',
                      color: '#dc2626', fontSize: 11, padding: '4px 7px' }}>✕</button>
                </td>
              </tr>
            ))}
            <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
              <td style={{ padding: '8px 10px', fontWeight: 800 }}>Total actividades registradas</td>
              <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>{doc.total_actividades_min}</td>
              <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 900 }}>{fmtHM(doc.total_actividades_min)}</td>
              <td />
            </tr>
            <tr>
              <td style={{ padding: '7px 10px', color: '#64748b' }}>Horas no Lectivas (según Tabla Legal)</td>
              <td style={{ padding: '7px 10px', textAlign: 'center', color: '#64748b' }}>{doc.no_lectivas_min}</td>
              <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700 }}>{fmtHM(doc.no_lectivas_min)}</td>
              <td />
            </tr>
            <tr style={{ background: doc.permanencia_min >= 0 ? '#f0fdf4' : '#fef2f2' }}>
              <td style={{ padding: '8px 10px', fontWeight: 800,
                color: doc.permanencia_min >= 0 ? '#15803d' : '#991b1b' }}>
                Permanencia en horas cronológicas
              </td>
              <td style={{ padding: '8px 10px', textAlign: 'center' }} />
              <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 900, fontSize: 15,
                color: doc.permanencia_min >= 0 ? '#15803d' : '#991b1b' }}>
                {fmtHM(doc.permanencia_min)}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
        <div style={{ padding: '10px 14px', borderTop: '1px solid #f1f5f9',
          display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Agregar:</span>
          <select value="" onChange={e => agregarActividad(e.target.value)}
            style={{ ...inp, maxWidth: 300, cursor: 'pointer' }}>
            <option value="">— elegir del catálogo —</option>
            {actividades
              .filter(a => !(doc.no_lectivas || []).some(x => x.actividad === a.nombre))
              .map(a => (
                <option key={a.id} value={a.id}>{a.nombre} ({fmtHM(a.minutos_default)})</option>
              ))}
            <option value="__nueva__">+ Crear nueva actividad…</option>
          </select>
        </div>
      </div>
      </>)}

      {/* ── HORARIO SEMANAL ── */}
      {vista === 'horario' && (
        hor ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
              flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <span style={{ fontSize: 13, color: '#475569' }}>
                  <b>{hor.bloques_puestos}</b> bloques puestos de <b>{doc.horas_pedagogicas}</b> horas en aula
                </span>
                {hor.bloques_faltantes !== 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, marginLeft: 10,
                    color: hor.bloques_faltantes > 0 ? '#dc2626' : '#f59e0b' }}>
                    {hor.bloques_faltantes > 0
                      ? `faltan ${hor.bloques_faltantes}`
                      : `sobran ${-hor.bloques_faltantes}`}
                  </span>
                )}
              </div>
              <button onClick={autocompletar} style={{ padding: '7px 14px', background: primary,
                color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
                cursor: 'pointer' }}>⚡ Autocompletar</button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11,
                minWidth: 760 }}>
                <thead>
                  <tr>
                    <th style={{ ...thHor, width: 78 }}>HORA</th>
                    {hor.dias.map(d => <th key={d} style={thHor}>{d.toUpperCase()}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {hor.bloques.map(b => {
                    const noClase = b.tipo === 'recreo' || b.tipo === 'almuerzo';
                    const bg = { recreo: '#e2e8f0', almuerzo: '#f1f5f9',
                      contacto: '#fef9c3' }[b.tipo] || '#fff';
                    return (
                      <tr key={b.id}>
                        <td style={{ ...tdHor, background: bg === '#fff' ? '#f8fafc' : bg,
                          fontWeight: 700, textAlign: 'center', fontSize: 10 }}>
                          {noClase
                            ? <>{b.tipo === 'recreo' ? 'RECREO' : 'ALMUERZO'}<br />{b.inicio}–{b.fin}</>
                            : <>{b.etiqueta}<br /><span style={{ fontWeight: 400, color: '#94a3b8' }}>
                                {b.inicio}–{b.fin}</span></>}
                        </td>
                        {hor.dias.map((_, dia) => {
                          if (noClase) return <td key={dia} style={{ ...tdHor, background: bg }} />;
                          const celda = hor.celdas.find(c => c.bloque_id === b.id && c.dia === dia);
                          const abierta = sel && sel.bloque_id === b.id && sel.dia === dia;
                          return (
                            <td key={dia} style={{ ...tdHor, background: bg, padding: 0,
                              position: 'relative' }}>
                              {abierta ? (
                                <select autoFocus value={celda?.asignacion_id || ''}
                                  onBlur={() => setSel(null)}
                                  onChange={e => {
                                    const v = e.target.value;
                                    if (!v) return setCelda(b.id, dia, {});
                                    const [aid, letra] = v.split('|');
                                    setCelda(b.id, dia, { asignacion_id: Number(aid), letra: letra || null });
                                  }}
                                  style={{ width: '100%', fontSize: 10, padding: 3, border: 'none' }}>
                                  <option value="">— vacío —</option>
                                  {hor.asignaciones.flatMap(a => {
                                    const letras = (a.letras || '').split(',').filter(Boolean);
                                    if (a.tipo === 'asignatura' && letras.length > 1) {
                                      return letras.map(L => (
                                        <option key={`${a.id}|${L}`} value={`${a.id}|${L}`}>
                                          {a.asignatura} · {a.nivel} {L}
                                        </option>
                                      ));
                                    }
                                    return [(
                                      <option key={a.id} value={`${a.id}|`}>
                                        {a.asignatura || TIPO_LABEL[a.tipo]}
                                        {a.cursos_texto ? ` · ${a.cursos_texto}` : ''}
                                      </option>
                                    )];
                                  })}
                                </select>
                              ) : (
                                <div onClick={() => setSel({ bloque_id: b.id, dia })}
                                  style={{ minHeight: 30, padding: '4px 5px', cursor: 'pointer',
                                    fontSize: 9.5, lineHeight: 1.25, color: '#334155' }}>
                                  {celda?.texto || ''}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '12px 0 0' }}>
              Hacé clic en cualquier celda para asignarla. El PDF sale con el botón 🗓 Horario PDF.
            </p>
          </div>
        ) : <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24,
          background: toast.type === 'error' ? '#dc2626' : '#16a34a', color: '#fff',
          padding: '10px 18px', borderRadius: 10, fontWeight: 600, fontSize: 14, zIndex: 9999 }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
