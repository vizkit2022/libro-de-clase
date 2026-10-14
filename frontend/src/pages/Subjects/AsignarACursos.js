/**
 * Asignar una asignatura a varios cursos de una vez.
 *
 * Antes había que entrar a cada curso y agregarla: con trece asignaturas y
 * ocho cursos son más de cien altas a mano.
 *
 * El diálogo consulta primero cuántas filas va a crear y lo muestra antes de
 * crear nada. Una acción masiva sin un número por delante es una invitación
 * a equivocarse, y deshacerla significa entrar curso por curso.
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

export default function AsignarACursos({ asignatura, onCerrar, onListo }) {
  const [anios, setAnios] = useState([]);
  const [year, setYear] = useState(null);
  const [horas, setHoras] = useState(2);
  const [niveles, setNiveles] = useState([]);       // vacío = todos
  const [previa, setPrevia] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get('/api/subjects/cursos-disponibles')
      .then(({ data }) => {
        setAnios(data.anios || []);
        setYear(data.sugerido);
      })
      .catch(e => setError(e.response?.data?.error || 'No pudimos leer los cursos'));
  }, []);

  const simular = useCallback(async () => {
    if (!year) return;
    try {
      const { data } = await axios.post(`/api/subjects/${asignatura.id}/cursos`, {
        simular: true, year, hours_per_week: horas,
        niveles: niveles.length ? niveles : undefined,
      });
      setPrevia(data);
      setError('');
    } catch (e) {
      setPrevia(null);
      setError(e.response?.data?.error || 'No pudimos calcular el resultado');
    }
  }, [asignatura.id, year, horas, niveles]);

  useEffect(() => { simular(); }, [simular]);

  const aplicar = async () => {
    setGuardando(true);
    try {
      const { data } = await axios.post(`/api/subjects/${asignatura.id}/cursos`, {
        year, hours_per_week: horas,
        niveles: niveles.length ? niveles : undefined,
      });
      onListo(data);
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo asignar');
      setGuardando(false);
    }
  };

  const delAnio = anios.find(a => a.year === year);
  const nivelesDisponibles = delAnio?.niveles || [];

  const alternarNivel = n =>
    setNiveles(ns => ns.includes(n) ? ns.filter(x => x !== n) : [...ns, n]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)',
      display: 'grid', placeItems: 'center', zIndex: 1000, padding: 16,
    }} onClick={onCerrar}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, maxWidth: 560, width: '100%',
        maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(15,23,42,.25)',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9' }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
            Asignar «{asignatura.name}» a los cursos
          </h3>
          <p style={{ margin: '5px 0 0', fontSize: 13, color: '#64748b' }}>
            Se agrega a los cursos que todavía no la tienen. Los que ya la tienen
            no se tocan.
          </p>
        </div>

        <div style={{ padding: 24 }}>
          {anios.length === 0 && !error && (
            <p style={{ fontSize: 13, color: '#64748b' }}>Cargando cursos…</p>
          )}

          {anios.length > 0 && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label htmlFor="aac-year" style={{ display: 'block', fontSize: 12.5, fontWeight: 650, color: '#475569', marginBottom: 6 }}>
                    Año
                  </label>
                  <select id="aac-year" value={year ?? ''} onChange={e => setYear(Number(e.target.value))}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #e2e8f0', fontSize: 13.5, fontFamily: 'inherit' }}>
                    {anios.map(a => (
                      <option key={a.year} value={a.year}>
                        {a.year} · {a.cursos} curso{a.cursos === 1 ? '' : 's'}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="aac-horas" style={{ display: 'block', fontSize: 12.5, fontWeight: 650, color: '#475569', marginBottom: 6 }}>
                    Horas semanales
                  </label>
                  <input id="aac-horas" type="number" min="1" max="45" value={horas}
                         onChange={e => setHoras(Number(e.target.value) || 1)}
                         style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #e2e8f0', fontSize: 13.5, fontFamily: 'inherit' }} />
                </div>
              </div>

              {nivelesDisponibles.length > 1 && (
                <div style={{ marginTop: 18 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 650, color: '#475569', margin: '0 0 4px' }}>
                    Niveles
                  </p>
                  <p style={{ fontSize: 11.5, color: '#94a3b8', margin: '0 0 8px' }}>
                    Sin seleccionar ninguno va a todos. Útil cuando la asignatura no
                    corresponde a todos los niveles.
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {nivelesDisponibles.map(n => {
                      const activo = niveles.includes(n);
                      return (
                        <button key={n} type="button" onClick={() => alternarNivel(n)}
                                style={{
                                  border: `1px solid ${activo ? '#3b4fd8' : '#e2e8f0'}`,
                                  background: activo ? '#eef2ff' : '#fff',
                                  color: activo ? '#2a2eb0' : '#475569',
                                  borderRadius: 8, padding: '5px 11px', fontSize: 12.5,
                                  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                }}>
                          {n}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {previa && (
                <div style={{
                  marginTop: 20, borderRadius: 10, padding: '13px 16px', fontSize: 13.3,
                  lineHeight: 1.6,
                  background: previa.por_crear ? '#eef2ff' : '#f1f5f9',
                  border: `1px solid ${previa.por_crear ? '#c7d2fe' : '#e2e8f0'}`,
                  color: previa.por_crear ? '#2a2eb0' : '#475569',
                }}>
                  {previa.por_crear > 0 ? (
                    <>
                      Se va a agregar a <b>{previa.por_crear} curso{previa.por_crear === 1 ? '' : 's'}</b> con {horas} h semanales
                      {previa.ya_tenian > 0 && <> · {previa.ya_tenian} ya la tenían</>}.
                      <div style={{ marginTop: 7, fontSize: 12.2, opacity: .85 }}>
                        {previa.cursos.slice(0, 10).join(' · ')}
                        {previa.cursos.length > 10 && ` y ${previa.cursos.length - 10} más`}
                      </div>
                    </>
                  ) : (
                    <>Todos los cursos seleccionados ya tienen esta asignatura. No hay nada que agregar.</>
                  )}
                </div>
              )}
            </>
          )}

          {error && (
            <div style={{ marginTop: 16, background: '#fee2e2', border: '1px solid #fecaca',
                          color: '#b91c1c', borderRadius: 10, padding: '11px 14px', fontSize: 13 }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9',
                      display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primary" onClick={aplicar}
                  disabled={guardando || !previa || !previa.por_crear}>
            {guardando ? 'Asignando…'
              : previa?.por_crear ? `Asignar a ${previa.por_crear} curso${previa.por_crear === 1 ? '' : 's'}`
              : 'Asignar'}
          </button>
        </div>
      </div>
    </div>
  );
}
