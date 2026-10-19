/**
 * Humo de Convivencia.
 *
 * Verifica que la ficha del caso permita asignar desde ahí mismo —que es lo
 * que antes obligaba a irse a otra pantalla— y que el panel sin casos ofrezca
 * una salida en vez de tres "Sin datos".
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import axios from 'axios';

import ConvivenciaCasoDetail from './ConvivenciaCasoDetail';
import ConvivenciaDashboard from './ConvivenciaDashboard';
import { AuthContext } from '../../context/AuthContext';

jest.mock('axios');

const CASO = {
  id: 7, case_number: 14, year: 2026, title: 'Conflicto en el recreo',
  date: '2026-10-02', estado: 'seguimiento', status: 'abierto', criticality: 'media',
  professional_id: null, student_id: null, course_id: null, typification: null,
  student: null, course_name: null, professional: null,
  anx1_data: {}, anx2_data: {}, anx3_data: {}, anx4_data: {}, anx5_data: {},
  bitacora: [], asignaciones: [], steps: [],
};

const PROFES = [{ id: 4, first_name: 'María', last_name: 'Valdés' }];
const ALUMNOS = [{ id: 20, first_name: 'Pedro', last_name: 'Muñoz' }];
const CURSOS = [{ id: 3, name: '7° Básico A' }];

const AUTH = {
  user: { id: 1, role: 'admin', first_name: 'Víctor', last_name: 'Espinoza' },
  school: { id: 2, name: 'Colegio Franz Liszt', primary_color: '#3b4fd8' },
  loading: false, login: jest.fn(), logout: jest.fn(),
};

function envolver(ui, ruta, patron) {
  return render(
    <AuthContext.Provider value={AUTH}>
      <MemoryRouter initialEntries={[ruta]}>
        <Routes><Route path={patron} element={ui} /></Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('Convivencia', () => {
  let errores;
  beforeEach(() => {
    errores = [];
    jest.spyOn(console, 'error').mockImplementation((...a) => errores.push(a.join(' ')));
    axios.put.mockResolvedValue({ data: {} });
    axios.post.mockResolvedValue({ data: {} });
  });
  afterEach(() => jest.restoreAllMocks());

  const sinFallos = () =>
    expect(errores.filter(e => /not defined|is not a function|Cannot read/.test(e)))
      .toEqual([]);

  test('el caso se puede asignar desde su ficha', async () => {
    axios.get.mockImplementation(url => Promise.resolve({
      data: url.includes('/cases/') ? CASO
          : url.includes('role=profesor') ? PROFES
          : url.includes('role=alumno') ? ALUMNOS
          : url.includes('/courses') ? CURSOS
          : [],
    }));

    envolver(<ConvivenciaCasoDetail />, '/convivencia/casos/7',
      '/convivencia/casos/:id');

    expect(await screen.findByText('Conflicto en el recreo')).toBeTruthy();
    expect(screen.getByText('Datos del caso')).toBeTruthy();

    // Asignar profesional guarda al momento, sin botón intermedio
    const selects = screen.getAllByRole('combobox');
    const profesional = selects[0];
    await waitFor(() => expect(profesional.options.length).toBeGreaterThan(1));
    fireEvent.change(profesional, { target: { value: '4' } });

    await waitFor(() => expect(axios.put).toHaveBeenCalledWith(
      '/api/convivencia/cases/7', { professional_id: 4 }));
    sinFallos();
  });

  test('la ficha abre aunque los catálogos fallen', async () => {
    axios.get.mockImplementation(url =>
      url.includes('/cases/')
        ? Promise.resolve({ data: CASO })
        : Promise.reject(new Error('500')));

    envolver(<ConvivenciaCasoDetail />, '/convivencia/casos/7',
      '/convivencia/casos/:id');

    expect(await screen.findByText('Conflicto en el recreo')).toBeTruthy();
    sinFallos();
  });

  test('el panel sin casos ofrece registrar el primero', async () => {
    axios.get.mockResolvedValue({
      data: {
        total: 0, open: 0, closed: 0, by_month: {}, by_procedure: [],
        by_typification: [], by_professional: [], by_criticality: {},
      },
    });

    envolver(<ConvivenciaDashboard />, '/convivencia', '/convivencia');

    expect(await screen.findByText(/Todavía no hay casos registrados/)).toBeTruthy();
    expect(screen.getByText('Registrar el primer caso')).toBeTruthy();
    expect(screen.queryByText('Sin datos')).toBeNull();
    sinFallos();
  });
});
