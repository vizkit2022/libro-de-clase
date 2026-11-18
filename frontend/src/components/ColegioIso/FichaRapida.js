import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { colorPuntaje, etiquetaPuntaje } from '../../pages/Personalidad/colores';
import { CRITERIOS } from './criterios';

const nombreCrit = Object.fromEntries(CRITERIOS.map(c => [c.id, c.nombre]));
const coma = (n) => (n == null ? '—' : Number(n).toFixed(1).replace('.', ','));

function Barra({ etiqueta, valor, texto }) {
  const c = colorPuntaje(valor);
  return (
    <div className="fr-barra">
      <span className="fr-barra-et" title={etiqueta}>{etiqueta}</span>
      <span className="fr-barra-pista"><i style={{ width: `${valor ?? 0}%`, background: c.base }} /></span>
      <b>{texto ?? valor ?? '—'}</b>
    </div>
  );
}

// Personalidad: puntaje por área, de la más baja a la más alta
function TemaPersonalidad({ al, areas, curso }) {
  const o = al.origen?.personalidad;
  const filas = Object.entries(o?.areas || {})
    .map(([id, p]) => ({ id, nombre: areas.find(a => String(a.id) === id)?.nombre || `Área ${id}`, p }))
    .sort((a, b) => (a.p ?? 999) - (b.p ?? 999));
  return (
    <>
      {!filas.length && <p className="fr-vacio">Todavía no tiene informe de personalidad este semestre.</p>}
      {filas.map(f => <Barra key={f.id} etiqueta={f.nombre} valor={f.p} />)}
      <Link className="fr-link" to={`/personalidad/cursos/${curso.id}/alumnos/${al.id}`}>Ver informe de personalidad →</Link>
    </>
  );
}

// Notas: promedio por asignatura (4,0 queda en la mitad de la barra)
function TemaNotas({ al }) {
  const o = al.origen?.notas;
  const asig = o?.asignaturas || [];
  return (
    <>
      {o?.nota != null && <p className="fr-dato">Promedio general <b>{coma(o.nota)}</b></p>}
      {!asig.length && <p className="fr-vacio">No tiene notas registradas este año.</p>}
      {asig.map(a => (
        <Barra key={a.nombre} etiqueta={a.nombre} texto={coma(a.nota)}
          valor={a.nota < 4 ? ((a.nota - 1) / 3) * 50 : 50 + ((a.nota - 4) / 3) * 50} />
      ))}
      <Link className="fr-link" to={`/students/${al.id}/life`}>Ver hoja de vida y notas →</Link>
    </>
  );
}

// Convivencia: casos (con lo que resta cada uno) y anotaciones
function TemaConvivencia({ al }) {
  const o = al.origen?.convivencia;
  const casos = o?.detalle_casos || [];
  const an = o?.anotaciones || { negativas: 0, positivas: 0 };
  return (
    <>
      <div className="fr-anot">
        <span className="neg">{an.negativas} anotacion{an.negativas === 1 ? '' : 'es'} negativa{an.negativas === 1 ? '' : 's'}</span>
        <span className="pos">{an.positivas} positiva{an.positivas === 1 ? '' : 's'}</span>
      </div>
      {!casos.length && <p className="fr-vacio">Sin casos de convivencia este año.</p>}
      <ul className="fr-casos">
        {casos.map(c => (
          <li key={c.id}>
            <Link to={`/convivencia/casos/${c.id}`}>
              <b>{c.titulo}</b>
              <small>{c.tipificacion || 'Sin tipificar'} · {c.cerrado ? 'cerrado' : 'abierto'}
                {c.fecha ? ` · ${c.fecha.split('-').reverse().join('-')}` : ''}</small>
            </Link>
            <span className="fr-resta">−{c.resta}</span>
          </li>
        ))}
      </ul>
      <Link className="fr-link" to={`/students/${al.id}/life`}>Ver anotaciones →</Link>
    </>
  );
}

// Tarjeta rápida de un alumno: por qué está en ese color y acceso a cada tema
export default function FichaRapida({ al, curso, areas = [], criterios, onVolver }) {
  const det = al.detalle || {};
  const activos = criterios.filter(id => id in det);
  // Empieza en el tema que más lo baja: esa es la explicación de su color
  const peor = [...activos].sort((a, b) => (det[a] ?? 999) - (det[b] ?? 999))[0];
  const [tema, setTema] = useState(peor || activos[0]);
  const c = colorPuntaje(al.puntaje);

  return (
    <div className="fr">
      <button type="button" className="ci-volver" onClick={onVolver}>← Volver a {curso.nombre}</button>
      <div className="fr-cab">
        <div>
          <h4>{al.nombre} {al.apellido}</h4>
          <p>{curso.nombre} · {etiquetaPuntaje(al.puntaje)}</p>
        </div>
        <span className="ci-nota" style={{ background: c.base }}>{al.puntaje ?? '—'}</span>
      </div>

      {peor && det[peor] != null && activos.length > 1 && (
        <p className="fr-porque">
          Lo que más lo baja: <b>{nombreCrit[peor]}</b> ({det[peor]})
        </p>
      )}

      <div className="fr-tabs" role="tablist">
        {activos.map(id => (
          <button key={id} type="button" role="tab" aria-selected={tema === id}
            className={tema === id ? 'on' : ''} onClick={() => setTema(id)}>
            <i style={{ background: colorPuntaje(det[id]).base }} />
            {nombreCrit[id]} <b>{det[id] ?? '—'}</b>
          </button>
        ))}
      </div>

      <div className="fr-cuerpo">
        {tema === 'personalidad' && <TemaPersonalidad al={al} areas={areas} curso={curso} />}
        {tema === 'notas' && <TemaNotas al={al} />}
        {tema === 'convivencia' && <TemaConvivencia al={al} />}
      </div>

      <Link className="fr-ficha" to={`/students/${al.id}/ficha`}>Abrir ficha del alumno</Link>
    </div>
  );
}
