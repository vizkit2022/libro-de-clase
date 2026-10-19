/**
 * Selector de año académico en la barra lateral.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import Layout from './Layout';
import { AuthContext } from '../../context/AuthContext';

jest.mock('axios', () => {
  const instance = {
    get: jest.fn(() => Promise.resolve({ data: {} })), post: jest.fn(), put: jest.fn(),
    patch: jest.fn(), delete: jest.fn(),
    defaults: { headers: { common: {} }, baseURL: '' },
    interceptors: { request: { use: jest.fn(), eject: jest.fn() }, response: { use: jest.fn(), eject: jest.fn() } },
  };
  instance.create = jest.fn(() => instance);
  return { __esModule: true, default: instance, ...instance };
});

const ANIOS = [
  { year: 2027, estado: 'abierto', cursos: 3, alumnos_activos: 0, por_confirmar: 40 },
  { year: 2026, estado: 'cerrado', cursos: 3, alumnos_activos: 60, por_confirmar: 0 },
];

function montar(rol, extra = {}) {
  const setAnio = jest.fn();
  const auth = {
    user: { id: 1, role: rol, first_name: 'Ana', last_name: 'Admin', email: 'a@x.cl', has_photo: false },
    school: { id: 2, name: 'Colegio San Patricio', primary_color: '#3b4fd8' },
    loading: false, login: jest.fn(), logout: jest.fn(),
    anio: 2026, setAnio, anios: ANIOS, recargarAnios: jest.fn(),
    anioInfo: ANIOS[1], anioCerrado: true,
    ...extra,
  };
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route path="dashboard" element={<p>contenido del panel</p>} />
            <Route path="anios" element={<p>pantalla de años</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return { setAnio };
}

const botonAnio = () => screen.getByRole('button', { name: /año acad/i });

test('admin ve el año actual con candado y puede cambiarlo', async () => {
  const user = userEvent.setup();
  const { setAnio } = montar('admin');
  const btn = botonAnio();
  expect(btn).toHaveTextContent('2026');
  expect(within(btn).getByLabelText(/cerrado/i)).toBeInTheDocument();

  await user.click(btn);
  const lista = screen.getByRole('listbox', { name: /año académico/i });
  const opciones = within(lista).getAllByRole('option');
  expect(opciones.map(o => o.textContent)).toEqual(
    expect.arrayContaining([expect.stringContaining('2027'), expect.stringContaining('2026')]));
  await user.click(within(lista).getByRole('option', { name: /2027/ }));
  expect(setAnio).toHaveBeenCalledWith(2027);
});

test('"Gestionar años…" lleva a /anios', async () => {
  const user = userEvent.setup();
  montar('directivo');
  await user.click(botonAnio());
  await user.click(screen.getByRole('button', { name: /gestionar años/i }));
  expect(screen.getByText('pantalla de años')).toBeInTheDocument();
});

test('profesor ve el selector pero no la gestión', async () => {
  const user = userEvent.setup();
  montar('profesor');
  await user.click(botonAnio());
  expect(screen.getByRole('listbox')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /gestionar años/i })).toBeNull();
});

test.each(['apoderado', 'alumno'])('%s no ve el selector', (rol) => {
  montar(rol);
  expect(screen.queryByRole('button', { name: /año acad/i })).toBeNull();
});

test('sin lista de años igual muestra el año en uso', () => {
  montar('admin', { anios: [], anio: 2026, anioInfo: null, anioCerrado: false });
  expect(botonAnio()).toHaveTextContent('2026');
});
