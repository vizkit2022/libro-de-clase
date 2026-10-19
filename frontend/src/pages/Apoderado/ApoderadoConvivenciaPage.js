import React from 'react';
import { useAuth } from '../../context/AuthContext';
import CasosReadOnlyList from '../Convivencia/CasoReadOnly';

/**
 * Portal del apoderado — Convivencia Escolar (solo lectura).
 * El backend devuelve únicamente los casos vinculados a sus alumnos
 * o a él/ella como apoderado.
 */
export default function ApoderadoConvivenciaPage() {
  const { user } = useAuth();
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">🤝 Convivencia Escolar</h1>
          <p className="page-subtitle">
            Hola, {user?.first_name}. Aquí puedes ver el seguimiento de los casos de convivencia asociados a tus alumnos o a ti como apoderado/a. Esta vista es solo de lectura.
          </p>
        </div>
      </div>
      <CasosReadOnlyList emptyText="No hay casos de convivencia asociados a tus alumnos ni a ti como apoderado/a." />
    </div>
  );
}
