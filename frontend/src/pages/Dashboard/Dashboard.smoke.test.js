/**
 * Humo del panel.
 *
 * Lo que más importa acá es que no se caiga cuando falta información: un
 * colegio recién creado no tiene cursos, ni carga académica, ni resumen, y
 * el panel igual tiene que abrir.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';

import DashboardPage from './DashboardPage';
import { AuthContext } from '../../context/AuthContext';

jest.mock('axios');

const RESUMEN = { total_students: 157, total_teachers: 13, total_courses: 6 };
const CURSOS = [
  { id: 1, name: '7° Básico A', student_count: 28,
    head_teacher: { first_name: 'M.', last_name: 'Fuentes' } },
  { id: 2, name: '7° Básico B', student_count: 26, head_teacher: null },
];
const CARGA = {
  resumen: { total_demanda: 144, total_asignado: 122, cobertura_pct: 84.7 },
  por_asignatura: [
    { asignatura: 'Lengua y Literatura', horas_demanda: 90, horas_asignadas: 72,
      horas_faltantes: 18, cobertura_pct: 80 },
    { asignatura: 'Taller de Lenguaje', horas_demanda: 24, horas_asignadas: 24,
      horas_faltantes: 0, cobertura_pct: 100 },
  ],
  alertas: [{ tipo: 'disponibilidad', docente: 'F. Chávez',
              mensaje: 'F. Chávez: 6 h de disponibilidad (máx. 3)' }],
};

function montar(rol = 'admin') {
  const auth = {
    user: { id: 1, role: rol, first_name: 'Víctor', last_name: 'Espinoza' },
    school: { id: 2, name: 'Colegio Franz Liszt', primary_color: '#3b4fd8' },
    loading: false, login: jest.fn(), logout: jest.fn(),
  };
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter><DashboardPage /></MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('Panel', () => {
  let errores;
  beforeEach(() => {
    errores = [];
    jest.spyOn(console, 'error').mockImplementation((...a) => errores.push(a.join(' ')));
  });
  afterEach(() => jest.restoreAllMocks());

  const sinFallos = () =>
    expect(errores.filter(e => /not defined|is not a function|Cannot read/.test(e)))
      .toEqual([]);

  test('muestra los indicadores y la cobertura', async () => {
    axios.get.mockImplementation(url =>
      Promise.resolve({
        data: url.includes('/summary') ? RESUMEN
            : url.includes('/courses') ? CURSOS
            : CARGA,
      }));

    montar();
    expect(await screen.findByText('157')).toBeTruthy();
    expect(screen.getByText('13')).toBeTruthy();
    expect(screen.getByText('Lengua y Literatura')).toBeTruthy();
    expect(screen.getByText('72/90')).toBeTruthy();
    expect(screen.getByText(/6 h de disponibilidad/)).toBeTruthy();
    sinFallos();
  });

  test('abre igual en un colegio sin datos', async () => {
    axios.get.mockImplementation(url =>
      Promise.resolve({
        data: url.includes('/summary')
          ? { total_students: 0, total_teachers: 0, total_courses: 0 }
          : url.includes('/courses') ? []
          : { resumen: { total_demanda: 0 }, por_asignatura: [], alertas: [] },
      }));

    montar();
    await waitFor(() => expect(screen.getByText(/Buen/)).toBeTruthy());
    expect(screen.getByText(/Todavía no hay cursos creados/)).toBeTruthy();
    expect(screen.getByText(/No hay descuadres/)).toBeTruthy();
    sinFallos();
  });

  test('abre aunque las peticiones fallen', async () => {
    // Pasa con un backend viejo o un endpoint caído: el panel no puede
    // quedarse en blanco por eso.
    axios.get.mockRejectedValue(new Error('500'));

    montar();
    await waitFor(() => expect(screen.getByText(/Buen/)).toBeTruthy());
    expect(screen.getByText('Colegio Franz Liszt', { exact: false })).toBeTruthy();
    sinFallos();
  });

  test('el docente no ve lo que es de dirección', async () => {
    axios.get.mockImplementation(url =>
      Promise.resolve({ data: url.includes('/summary') ? RESUMEN : CURSOS }));

    montar('profesor');
    expect(await screen.findByText('Mis cursos')).toBeTruthy();
    expect(screen.queryByText(/Carga académica/)).toBeNull();
    expect(screen.queryByText('Requiere tu atención')).toBeNull();
    sinFallos();
  });
});
