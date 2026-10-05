import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

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

  const year = new Date().getFullYear() + 1;
  const [tab, setTab] = useState('asignaturas');
  const [data, setData] = useState(null);
  const [demanda, setDemanda] = useState([]);
  const [cat, setCat] = useState(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [nuevoDocente, setNuevoDocente] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      const [d, dm, c] = await Promise.all([
        axios.get(`/api/carga-academica/dashboard?year=${year}`),
        axios.get(`/api/carga-academica/demanda?year=${year}`),
        axios.get('/api/carga-academica/catalogos'),
      ]);
      setData(d.data); setDemanda(dm.data); setCat(c.data);
    } catch { /* módulo aún sin datos */ }
    setLoading(false);
  }, [year]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const seed = async () => {
    setSeeding(true);
    try {
      await axios.post('/api/carga-academica/seed-lenguaje', { year });
      await fetchAll();
    } catch (e) { alert(e.response?.data?.error || 'Error al poblar'); }
    setSeeding(false);
  };

  const crearDocente = async () => {
    const d = nuevoDocente;
    if (!d?.nombre) return;
    const r = await axios.post('/api/carga-academica/docentes', { ...d, year });
    setNuevoDocente(null);
    navigate(`/carga-academica/docentes/${r.data.id}`);
  };

  const descargarDepartamento = (dep) => {
    window.open(`/api/carga-academica/informe-departamento.docx?year=${year}${dep ? `&departamento=${encodeURIComponent(dep)}` : ''}`, '_blank');
  };

  const patchDemanda = async (id, payload) => {
    await axios.put(`/api/carga-academica/demanda/${id}`, payload);
    fetchAll();
  };

  const addDemanda = async () => {
    await axios.post('/api/carga-academica/demanda', {
      year, departamento: departamentos[0] || 'General', asignatura: 'Nueva asignatura',
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

  return (
    <div style={{ maxWidth: 1050, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>📚 Carga Académica {year}</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '3px 0 0' }}>
            Distribución de horas por docente según Tabla Legal MINEDUC
          </p>
        </div>
        {departamentos.map(dep => (
          <button key={dep} onClick={() => descargarDepartamento(dep)} style={{
            padding: '8px 14px', background: `${primary}15`, color: primary, border: 'none',
            borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            📄 Word · {dep}
          </button>
        ))}
        <button onClick={() => setNuevoDocente({ nombre: '', departamento: departamentos[0] || '', nivel: 'Media', horas_contrato: 44 })}
          style={{ padding: '8px 16px', background: primary, color: '#fff', border: 'none',
            borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Docente</button>
      </div>

      {vacio && (
        <div className="card" style={{ textAlign: 'center', padding: 40, marginBottom: 20 }}>
          <p style={{ fontSize: 15, color: '#475569', margin: '0 0 6px', fontWeight: 600 }}>
            Aún no hay carga académica {year}
          </p>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 18px' }}>
            Puedo poblar los 18 cursos (7° a IV Medio, letras A/B/C), la demanda del
            Departamento de Lenguaje y los 6 docentes con su carga 2026 como línea base.
          </p>
          <button onClick={seed} disabled={seeding} style={{ padding: '10px 22px', background: primary,
            color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
            cursor: 'pointer', opacity: seeding ? 0.6 : 1 }}>
            {seeding ? 'Poblando...' : '⚡ Poblar Departamento de Lenguaje'}
          </button>
        </div>
      )}

      {!vacio && (
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
            <StatBox label="Alertas" value={data.alertas.length}
              sub="descuadres y reglas" color={data.alertas.length ? '#dc2626' : '#16a34a'} />
          </div>

          {/* Alertas */}
          {data.alertas.length > 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
              padding: '12px 16px', marginBottom: 18 }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: '#92400e', margin: '0 0 6px',
                textTransform: 'uppercase', letterSpacing: '0.05em' }}>Revisar</p>
              {data.alertas.map((a, i) => (
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
                {data.por_asignatura.map(a => {
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
                    textTransform: 'uppercase', letterSpacing: '0.06em' }}>Detalle por nivel</h3>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['Asignatura', 'Nivel', 'Grupos', 'Demanda', 'Asignado', 'Estado'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11,
                          textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.detalle_demanda.map(d => {
                      const col = d.estado === 'completa' ? '#16a34a'
                        : d.estado === 'sobreasignada' ? '#dc2626' : '#f59e0b';
                      return (
                        <tr key={d.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e293b' }}>{d.asignatura}</td>
                          <td style={{ padding: '8px 12px', color: '#475569' }}>{d.nivel}</td>
                          <td style={{ padding: '8px 12px', color: '#94a3b8', fontSize: 12 }}>
                            {d.por_letra ? `${d.letras} (${d.horas_por_grupo} h c/u)` : `único (${d.horas_por_grupo} h)`}
                          </td>
                          <td style={{ padding: '8px 12px', fontWeight: 700 }}>{d.horas_totales}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 700, color: col }}>{d.horas_asignadas}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px',
                              borderRadius: 20, background: `${col}18`, color: col }}>
                              {d.estado === 'completa' ? '✓ completa'
                                : d.estado === 'sobreasignada' ? `+${-d.horas_faltantes}`
                                : `faltan ${d.horas_faltantes}`}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
                        <input style={inp} defaultValue={d.asignatura}
                          onBlur={e => patchDemanda(d.id, { asignatura: e.target.value })} />
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
