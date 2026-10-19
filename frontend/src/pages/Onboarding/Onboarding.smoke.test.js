/**
 * Humo del asistente de puesta en marcha.
 *
 * Existe porque compilar no basta: JavaScript no verifica que un identificador
 * exista hasta que se ejecuta, así que un panel puede estar roto y el build
 * pasar igual. Acá se recorren los ocho pasos uno por uno y se falla si alguno
 * lanza.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';

import OnboardingPage from './OnboardingPage';
import { AuthContext } from '../../context/AuthContext';

jest.mock('axios');

const PASOS = [
  ['colegio', 'Datos del colegio', 'completo'],
  ['periodos', 'Año escolar y períodos', 'completo'],
  ['cursos', 'Cursos', 'completo'],
  ['asignaturas', 'Asignaturas', 'parcial'],
  ['equipo', 'Equipo del colegio', 'pendiente'],
  ['matricula', 'Matrícula de alumnos', 'pendiente'],
  ['carga', 'Carga horaria y jefaturas', 'pendiente'],
  ['accesos', 'Activar y entregar accesos', 'bloqueado'],
];

const ESTADO = {
  year: 2027,
  anios_disponibles: [2026, 2027],
  pasos: PASOS.map(([clave, titulo, estado], i) => ({
    n: i + 1, clave, titulo, estado,
    detalle: `detalle de ${clave}`,
    pendientes: estado === 'parcial' ? ['8° Básico A no tiene ninguna asignatura'] : [],
    bloqueado_por: estado === 'bloqueado' ? 'equipo' : null,
    opcional: clave === 'carga',
  })),
  completos: 3, total: 8, pct: 38,
  docentes_pueden_entrar: false,
  puede_cerrar: false,
  faltan_para_cerrar: ['Equipo del colegio'],
  cerrado_at: null,
};

const CURSOS = [
  { id: 1, name: '7° Básico A', year: 2027, student_count: 0, head_teacher_id: null },
  { id: 2, name: '8° Básico A', year: 2027, student_count: 0, head_teacher_id: 4 },
];
const ACCESOS = {
  total: 2, activas: 1, sin_clave: 2,
  personas: [
    { id: 4, nombre: 'Rocío Herrera', email: 'rh@c.cl', rol: 'profesor',
      is_active: true, clave_entregada_at: null, debe_cambiar_clave: false, ha_entrado: false },
    { id: 5, nombre: 'Marcela Pinto', email: 'mp@c.cl', rol: 'directivo',
      is_active: false, clave_entregada_at: null, debe_cambiar_clave: false, ha_entrado: false },
  ],
};

const AUTH = {
  user: { id: 1, role: 'admin', first_name: 'Víctor', last_name: 'Espinoza' },
  school: { id: 2, name: 'Colegio Franz Liszt', rector: 'Ana Soto', logo_url: null },
  loading: false, login: jest.fn(), logout: jest.fn(), updateSchool: jest.fn(),
};

function respuesta(url) {
  if (url.includes('/onboarding/estado')) return ESTADO;
  if (url.includes('/onboarding/accesos')) return ACCESOS;
  if (url.includes('/api/courses')) return CURSOS;
  if (url.includes('/api/periods')) return [
    { id: 1, name: 'Primer semestre', start_date: '2027-03-01',
      end_date: '2027-07-15', is_active: true }];
  if (url.includes('/subjects/ministry')) return [{ code: 'LEN', name: 'Lenguaje y Comunicación' }];
  if (url.includes('/api/subjects')) return [{ id: 1, name: 'Matemática', ministry_code: 'MAT' }];
  if (url.includes('/api/users')) return [{ id: 4, first_name: 'Rocío', last_name: 'Herrera' }];
  return [];
}

function montar() {
  return render(
    <AuthContext.Provider value={AUTH}>
      <MemoryRouter><OnboardingPage /></MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('Asistente de puesta en marcha', () => {
  let errores;
  beforeEach(() => {
    errores = [];
    jest.spyOn(console, 'error').mockImplementation((...a) => errores.push(a.join(' ')));
    axios.get.mockImplementation(url => Promise.resolve({ data: respuesta(url) }));
    axios.post.mockResolvedValue({ data: { ok: true, claves: [] } });
    axios.put.mockResolvedValue({ data: AUTH.school });
  });
  afterEach(() => jest.restoreAllMocks());

  const sinFallos = () =>
    expect(errores.filter(e => /not defined|is not a function|Cannot read/.test(e)))
      .toEqual([]);

  test('muestra el avance y los ocho pasos', async () => {
    montar();
    expect(await screen.findByText('38%')).toBeTruthy();
    expect(screen.getByText('3 de 8 pasos completos')).toBeTruthy();
    for (const [, titulo] of PASOS) {
      expect(screen.getAllByText(titulo).length).toBeGreaterThan(0);
    }
    sinFallos();
  });

  test('cada uno de los ocho paneles abre sin romperse', async () => {
    montar();
    await screen.findByText('38%');

    for (const [, titulo] of PASOS) {
      // El primero del listado es el botón de la barra lateral
      fireEvent.click(screen.getAllByText(titulo)[0]);
      // El encabezado del panel repite el título del paso
      await waitFor(() => expect(screen.getAllByText(titulo).length).toBeGreaterThan(0));
      sinFallos();
    }
  });

  test('dice si los docentes ya pueden entrar', async () => {
    montar();
    expect(await screen.findByText(/Falta cargar el equipo del colegio/)).toBeTruthy();
    sinFallos();
  });

  test('el paso de asignaturas muestra los cursos sin cubrir', async () => {
    montar();
    await screen.findByText('38%');
    fireEvent.click(screen.getAllByText('Asignaturas')[0]);
    expect(await screen.findByText(/8° Básico A no tiene ninguna asignatura/)).toBeTruthy();
    sinFallos();
  });

  test('el paso de accesos lista la revisión final y deja cerrar forzando', async () => {
    montar();
    await screen.findByText('38%');
    fireEvent.click(screen.getAllByText('Activar y entregar accesos')[0]);

    expect(await screen.findByText('Activar y generar claves ahora')).toBeTruthy();
    const forzar = screen.getByText('Cerrar de todas formas');
    fireEvent.click(forzar);
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
      '/api/onboarding/cerrar?year=2027', { forzar: true }));
    sinFallos();
  });

  test('abre igual si el estado no carga', async () => {
    axios.get.mockRejectedValue({ response: { data: { error: 'caído' } } });
    montar();
    await waitFor(() => expect(screen.getByText(/caído|Sin datos/)).toBeTruthy());
    sinFallos();
  });
});
