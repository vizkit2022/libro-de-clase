import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import AniosPage from '../AniosPage';

jest.mock('axios', () => {
  const instance = {
    get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn(),
    defaults: { headers: { common: {} }, baseURL: '' },
    interceptors: { request: { use: jest.fn(), eject: jest.fn() }, response: { use: jest.fn(), eject: jest.fn() } },
  };
  instance.create = jest.fn(() => instance);
  return { __esModule: true, default: instance, ...instance };
});

const mockAuth = {
  user: { id: 1, role: 'admin', first_name: 'Ana', last_name: 'Admin' },
  school: { id: 1, name: 'Colegio San Patricio', primary_color: '#2563EB' },
  anio: 2026, setAnio: jest.fn(), recargarAnios: jest.fn(), anios: [],
};
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => mockAuth }));

const ANIOS = {
  actual: 2026,
  anios: [
    { year: 2026, estado: 'abierto', cursos: 10, alumnos_activos: 264, por_confirmar: 0,
      created_from_year: null, closed_at: null, closed_by_name: null, reopened_at: null },
    { year: 2025, estado: 'cerrado', cursos: 9, alumnos_activos: 250, por_confirmar: 0,
      created_from_year: null, closed_at: '2026-01-05T10:00:00', closed_by_name: 'Ana Admin', reopened_at: null },
  ],
};

const renderPage = () => render(<MemoryRouter><AniosPage /></MemoryRouter>);

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.user = { id: 1, role: 'admin', first_name: 'Ana', last_name: 'Admin' };
  mockAuth.setAnio = jest.fn();
  mockAuth.recargarAnios = jest.fn();
  axios.get.mockImplementation(() => Promise.resolve({ data: ANIOS }));
  axios.post.mockImplementation(() => Promise.resolve({ data: {} }));
});

const fila = (year) => screen.getByText(String(year), { selector: '.an-year' }).closest('tr');

test('lista los años con estado y conteos', async () => {
  renderPage();
  await screen.findByText('2026', { selector: '.an-year' });
  expect(axios.get).toHaveBeenCalledWith('/api/anios');
  expect(within(fila(2026)).getByText('Abierto')).toBeInTheDocument();
  expect(within(fila(2026)).getByText('264')).toBeInTheDocument();
  expect(within(fila(2025)).getByText('Cerrado')).toBeInTheDocument();
  expect(within(fila(2025)).getByText(/Ana Admin/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /crear año 2027/i })).toBeInTheDocument();
});

test('cerrar año pide confirmación y llama al endpoint', async () => {
  const user = userEvent.setup();
  renderPage();
  await screen.findByText('2026', { selector: '.an-year' });
  await user.click(within(fila(2026)).getByRole('button', { name: /cerrar año/i }));
  const dlg = screen.getByRole('dialog');
  expect(dlg).toHaveTextContent(/solo lectura/i);
  await user.click(within(dlg).getByRole('button', { name: /cerrar 2026/i }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/anios/2026/cerrar'));
});

test('reabrir un año cerrado', async () => {
  const user = userEvent.setup();
  renderPage();
  await screen.findByText('2025', { selector: '.an-year' });
  await user.click(within(fila(2025)).getByRole('button', { name: /reabrir/i }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /reabrir 2025/i }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/anios/2025/reabrir'));
});

test('crear año envía las opciones de copia y muestra el resumen', async () => {
  const user = userEvent.setup();
  axios.post.mockImplementation(() => Promise.resolve({ data: {
    year: 2027, cursos_creados: 10, asignaturas_copiadas: 60, periodos_copiados: 2,
    alumnos_promovidos: 250, egresados: 14, sin_curso_destino: [],
    mapa: [{ desde: 'Kinder A', hacia: '1° A' }],
  } }));
  renderPage();
  await user.click(await screen.findByRole('button', { name: /crear año 2027/i }));
  const dlg = screen.getByRole('dialog');
  // Desmarcar períodos
  await user.click(within(dlg).getByRole('checkbox', { name: /períodos/i }));
  await user.click(within(dlg).getByRole('button', { name: /crear año 2027/i }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/anios', {
    year: 2027, copiar_de: 2026,
    copiar: { cursos: true, asignaturas: true, periodos: false, alumnos: true },
  }));
  const res = await screen.findByRole('dialog', { name: /año 2027 creado/i });
  expect(res).toHaveTextContent('250');
  expect(res).toHaveTextContent('Kinder A');
  expect(res).toHaveTextContent(/egresa/i);
});

test('directivo no ve cerrar/reabrir', async () => {
  mockAuth.user = { id: 2, role: 'directivo', first_name: 'Dir', last_name: 'Ector' };
  renderPage();
  await screen.findByText('2026', { selector: '.an-year' });
  expect(screen.queryByRole('button', { name: /cerrar año/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /reabrir/i })).toBeNull();
  expect(screen.getByRole('button', { name: /crear año/i })).toBeInTheDocument();
});
