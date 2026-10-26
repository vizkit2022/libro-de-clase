/**
 * Humo del marco de la plataforma.
 *
 * El Layout envuelve a todas las pantallas internas, así que un error acá
 * las rompe todas a la vez. Verifica que arme el menú según el rol, que
 * marque la ruta activa y que no lance al montar.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import Layout from './Layout';
import { AuthContext } from '../../context/AuthContext';

jest.mock('axios');

function montar(rol, ruta = '/dashboard') {
  const auth = {
    user: { id: 1, role: rol, first_name: 'Víctor', last_name: 'Espinoza',
            email: 'v@kolevia.cl', has_photo: false },
    school: { id: 2, name: 'Colegio Franz Liszt', primary_color: '#3b4fd8' },
    loading: false, login: jest.fn(), logout: jest.fn(),
  };
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route path="dashboard" element={<p>contenido del panel</p>} />
            <Route path="matricula" element={<p>contenido de matrícula</p>} />
            <Route path="convivencia" element={<p>contenido de convivencia</p>} />
            <Route path="courses/:id" element={<p>detalle de curso</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('Layout', () => {
  let errores;
  beforeEach(() => {
    errores = [];
    jest.spyOn(console, 'error').mockImplementation((...a) => errores.push(a.join(' ')));
  });
  afterEach(() => jest.restoreAllMocks());

  test('arma el menú agrupado y muestra el contenido', () => {
    montar('admin');
    expect(screen.getByText('Recreo Edu')).toBeTruthy();
    expect(screen.getByText('Colegio Franz Liszt')).toBeTruthy();
    expect(screen.getByText('contenido del panel')).toBeTruthy();
    // Encabezados de sección. "General" aparece dos veces a propósito: como
    // grupo del menú y como ruta en la barra superior.
    ['General', 'Gestión pedagógica', 'Planificación', 'Información']
      .forEach(s => expect(screen.getAllByText(s).length).toBeGreaterThan(0));
    expect(errores.filter(e => /not defined|is not a function|Cannot read/.test(e)))
      .toEqual([]);
  });

  test('cada rol ve solo lo suyo', () => {
    const { unmount } = montar('profesor');
    expect(screen.getByText('Mis cursos')).toBeTruthy();
    expect(screen.queryByText('Matrícula')).toBeNull();      // es de dirección
    unmount();

    montar('apoderado');
    expect(screen.getByText('Mis alumnos')).toBeTruthy();
    expect(screen.queryByText('Calificaciones')).toBeNull();
  });

  test('el título de la barra sigue a la ruta, también con parámetros', () => {
    const { unmount } = montar('admin', '/matricula');
    expect(screen.getByRole('heading', { name: 'Matrícula' })).toBeTruthy();
    unmount();

    montar('admin', '/courses/7');
    expect(screen.getByRole('heading', { name: 'Cursos' })).toBeTruthy();
    expect(screen.getByText('detalle de curso')).toBeTruthy();
  });

  test('marca como activa la ruta en la que se está', () => {
    montar('admin', '/convivencia');
    const activo = document.querySelector('.kv-it.on');
    expect(activo).toBeTruthy();
    expect(activo.textContent).toContain('Convivencia');
  });
});
