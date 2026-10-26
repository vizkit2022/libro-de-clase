import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { msgError } from '../../components/UI/Modal';
import { Icono } from '../../components/Layout/iconos';
import '../../components/UI/ui.css';
import './Personalidad.css';

// Pauta del informe de personalidad: áreas y criterios del colegio.
// Desactivar no borra lo respondido: el criterio solo deja de aparecer
// en el formulario y en el PDF, y se puede volver a activar.
export default function PersonalidadPautaPage() {
  const [areas, setAreas] = useState(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState(null);     // { tipo, id, texto }
  const [nuevo, setNuevo] = useState({});             // area_id → texto del criterio nuevo
  const [nuevaArea, setNuevaArea] = useState('');

  useEffect(() => {
    axios.get('/api/personalidad/pauta?todos=1')
      .then(r => setAreas(r.data.areas))
      .catch(e => setError(msgError(e, 'No se pudo cargar la pauta')));
  }, []);

  const enviar = async (fn) => {
    setOcupado(true);
    setError('');
    try {
      const r = await fn();
      setAreas(r.data.areas);
      return true;
    } catch (e) {
      setError(msgError(e));
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const guardarEdicion = async () => {
    const { tipo, id, texto } = editando;
    const ok = await enviar(() => (tipo === 'area'
      ? axios.put(`/api/personalidad/areas/${id}`, { nombre: texto })
      : axios.put(`/api/personalidad/criterios/${id}`, { texto })));
    if (ok) setEditando(null);
  };

  const agregarCriterio = async (areaId) => {
    const texto = (nuevo[areaId] || '').trim();
    if (!texto) return;
    if (await enviar(() => axios.post('/api/personalidad/criterios', { area_id: areaId, texto }))) {
      setNuevo(p => ({ ...p, [areaId]: '' }));
    }
  };

  const agregarArea = async () => {
    if (!nuevaArea.trim()) return;
    if (await enviar(() => axios.post('/api/personalidad/areas', { nombre: nuevaArea.trim() }))) {
      setNuevaArea('');
    }
  };

  const editor = (tipo, id) => editando && editando.tipo === tipo && editando.id === id && (
    <span className="ip-editor">
      <input autoFocus value={editando.texto}
        onChange={e => setEditando({ ...editando, texto: e.target.value })}
        onKeyDown={e => { if (e.key === 'Enter') guardarEdicion(); if (e.key === 'Escape') setEditando(null); }} />
      <button type="button" className="ui-btn ui-btn-sm ui-btn-pri" onClick={guardarEdicion} disabled={ocupado}>Guardar</button>
      <button type="button" className="ui-btn ui-btn-sm" onClick={() => setEditando(null)}>Cancelar</button>
    </span>
  );

  if (!areas) {
    return (
      <div className="ip">
        {error ? <div className="ui-aviso ui-aviso-peligro">{error}</div> : <p className="ui-vacio">Cargando…</p>}
      </div>
    );
  }

  return (
    <div className="ip">
      <Link to="/personalidad" className="ip-volver">← Informe de personalidad</Link>
      <div className="ip-cab">
        <div>
          <h2>Pauta de criterios</h2>
          <p>Lo que se evalúa en el informe de personalidad de todos los cursos.</p>
        </div>
      </div>

      <div className="ui-aviso ui-aviso-info">
        <Icono nombre="alerta" tam={15} />
        <span>Desactivar un criterio no borra lo que ya se respondió: deja de aparecer en el
          formulario y en el PDF, y la numeración se corre. Puedes volver a activarlo cuando quieras.</span>
      </div>
      {error && <div className="ui-aviso ui-aviso-peligro">{error}</div>}

      {areas.map((a, i) => (
        <section key={a.id} className={`ip-caja ip-area${a.is_active ? '' : ' inactiva'}`}>
          <header>
            {editor('area', a.id) || (
              <>
                <h3>{a.nombre}{!a.is_active && <span className="ui-chip ip-chip-gris">Desactivada</span>}</h3>
                <span className="ip-area-acc">
                  <button type="button" className="ui-btn ui-btn-sm ui-btn-icono" title="Subir"
                    disabled={ocupado || i === 0}
                    onClick={() => enviar(() => axios.post(`/api/personalidad/areas/${a.id}/mover`, { dir: -1 }))}>↑</button>
                  <button type="button" className="ui-btn ui-btn-sm ui-btn-icono" title="Bajar"
                    disabled={ocupado || i === areas.length - 1}
                    onClick={() => enviar(() => axios.post(`/api/personalidad/areas/${a.id}/mover`, { dir: 1 }))}>↓</button>
                  <button type="button" className="ui-btn ui-btn-sm"
                    onClick={() => setEditando({ tipo: 'area', id: a.id, texto: a.nombre })}>Renombrar</button>
                  <button type="button" className={`ui-btn ui-btn-sm ${a.is_active ? 'ui-btn-gris' : 'ui-btn-ok'}`}
                    disabled={ocupado}
                    onClick={() => enviar(() => axios.put(`/api/personalidad/areas/${a.id}`, { is_active: !a.is_active }))}>
                    {a.is_active ? 'Desactivar área' : 'Activar área'}
                  </button>
                </span>
              </>
            )}
          </header>

          <ul className="ip-crit">
            {a.criterios.map((c, j) => (
              <li key={c.id} className={c.is_active ? '' : 'inactivo'}>
                <span className="ip-num">{c.numero || '—'}</span>
                {editor('criterio', c.id) || (
                  <>
                    <span className="ip-crit-txt">{c.texto}</span>
                    <span className="ip-crit-acc">
                      <button type="button" className="ui-btn ui-btn-sm ui-btn-icono" title="Subir"
                        disabled={ocupado || j === 0}
                        onClick={() => enviar(() => axios.post(`/api/personalidad/criterios/${c.id}/mover`, { dir: -1 }))}>↑</button>
                      <button type="button" className="ui-btn ui-btn-sm ui-btn-icono" title="Bajar"
                        disabled={ocupado || j === a.criterios.length - 1}
                        onClick={() => enviar(() => axios.post(`/api/personalidad/criterios/${c.id}/mover`, { dir: 1 }))}>↓</button>
                      <button type="button" className="ui-btn ui-btn-sm"
                        onClick={() => setEditando({ tipo: 'criterio', id: c.id, texto: c.texto })}>Editar</button>
                      <button type="button" className={`ui-btn ui-btn-sm ${c.is_active ? 'ui-btn-gris' : 'ui-btn-ok'}`}
                        disabled={ocupado}
                        onClick={() => enviar(() => axios.put(`/api/personalidad/criterios/${c.id}`, { is_active: !c.is_active }))}>
                        {c.is_active ? 'Desactivar' : 'Activar'}
                      </button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>

          <div className="ip-agregar">
            <input placeholder="Nuevo criterio para esta área…" value={nuevo[a.id] || ''}
              onChange={e => setNuevo(p => ({ ...p, [a.id]: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') agregarCriterio(a.id); }} />
            <button type="button" className="ui-btn ui-btn-sm ui-btn-pri"
              disabled={ocupado || !(nuevo[a.id] || '').trim()} onClick={() => agregarCriterio(a.id)}>
              <Icono nombre="mas" tam={13} /> Agregar criterio
            </button>
          </div>
        </section>
      ))}

      <div className="ip-caja ip-agregar ip-agregar-area">
        <input placeholder="Nombre de una nueva área (ej. Hábitos de estudio)" value={nuevaArea}
          onChange={e => setNuevaArea(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') agregarArea(); }} />
        <button type="button" className="ui-btn ui-btn-pri" disabled={ocupado || !nuevaArea.trim()}
          onClick={agregarArea}>
          <Icono nombre="mas" tam={14} /> Agregar área
        </button>
      </div>
    </div>
  );
}
