import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import descargarArchivo from '../../CargaAcademica/descargar';
import AuditoriaPage from '../AuditoriaPage';

jest.mock('axios', () => {
  const instance = {
    get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn(),
    defaults: { headers: { common: {} }, baseURL: '' },
    interceptors: { request: { use: jest.fn(), eject: jest.fn() }, response: { use: jest.fn(), eject: jest.fn() } },
  };
  instance.create = jest.fn(() => instance);
  return { __esModule: true, default: instance, ...instance };
});
jest.mock('../../CargaAcademica/descargar', () => ({ __esModule: true, default: jest.fn(() => Promise.resolve()) }));

const ITEMS = [
  { id: 2, created_at: '2026-10-19T13:05:00Z', user_id: 1, user_name: 'Carlos Administrador',
    user_email: 'admin@sanpatricio.cl', role: 'admin', event: 'accion', method: 'DELETE',
    path: '/api/matricula/enrollments/9', status_code: 200, ok: true, entity: 'Matrícula', entity_id: 9,
    description: 'Retiró a Rita Retirada de 1° A', ip: '203.0.113.7', user_agent: 'Firefox',
    details: { campos: ['motivo'], valores: { motivo: 'Cambio de ciudad' } } },
  { id: 1, created_at: '2026-10-19T12:00:00Z', user_id: 3, user_name: 'María Valdés Rojas',
    user_email: 'mvaldes@sanpatricio.cl', role: 'profesor', event: 'login_fallido', method: 'POST',
    path: '/api/auth/login', status_code: 401, ok: false, entity: 'Sesión', entity_id: null,
    description: 'Intento fallido de inicio de sesión', ip: '10.0.0.5', user_agent: 'Chrome',
    details: { email: 'mvaldes@sanpatricio.cl', motivo: 'Contraseña incorrecta' } },
];

const LISTA = {
  items: ITEMS, total: 120, page: 1, pages: 3, per_page: 50,
  usuarios: [{ id: 1, nombre: 'Carlos Administrador' }, { id: 3, nombre: 'María Valdés Rojas' }],
  entidades: ['Matrícula', 'Sesión'],
};
const RESUMEN = {
  por_evento: { login: 14, login_fallido: 2, logout: 3, crear: 5, editar: 7, eliminar: 1, descargar: 4, importar: 0, accion: 2 },
  total_7d: 38, errores_7d: 3,
  ultimos_accesos: [{ user_id: 1, nombre: 'Carlos Administrador', role: 'admin', ultimo_login: '2026-10-19T12:58:00Z' }],
};

const renderPage = () => render(<MemoryRouter><AuditoriaPage /></MemoryRouter>);
const ultimaLista = () => {
  const llamadas = axios.get.mock.calls.filter(c => c[0] === '/api/auditoria');
  return llamadas[llamadas.length - 1][1].params;
};

beforeEach(() => {
  jest.clearAllMocks();
  axios.get.mockImplementation((url) => Promise.resolve({
    data: url === '/api/auditoria/resumen' ? RESUMEN : LISTA,
  }));
});

test('muestra la tabla con usuario, evento, descripción, IP y resultado', async () => {
  renderPage();
  const fila = (await screen.findByText('Retiró a Rita Retirada de 1° A')).closest('tr');
  expect(within(fila).getByText('Carlos Administrador')).toBeInTheDocument();
  expect(within(fila).getByText('Administrador')).toBeInTheDocument();
  expect(within(fila).getByText('Acción')).toBeInTheDocument();
  expect(within(fila).getByText('203.0.113.7')).toBeInTheDocument();
  expect(within(fila).getByText('OK')).toBeInTheDocument();

  const fallida = screen.getByText('Intento fallido de inicio de sesión').closest('tr');
  expect(within(fallida).getByText('Inicio fallido')).toBeInTheDocument();
  expect(within(fallida).getByText('Error')).toBeInTheDocument();

  expect(screen.getByText(/120 registros/)).toBeInTheDocument();
  expect(screen.getByText(/Página 1 de 3/)).toBeInTheDocument();
  expect(ultimaLista()).toMatchObject({ page: 1, per_page: 50 });
  // Resumen de 7 días
  expect(await screen.findByText('Inicios de sesión')).toBeInTheDocument();
  expect(screen.getByText('14')).toBeInTheDocument();
});

test('los filtros y la paginación se envían al backend', async () => {
  const user = userEvent.setup();
  renderPage();
  await screen.findByText('Retiró a Rita Retirada de 1° A');

  await user.selectOptions(screen.getByLabelText('Tipo de evento'), 'login_fallido');
  await waitFor(() => expect(ultimaLista()).toMatchObject({ event: 'login_fallido', page: 1 }));

  await user.selectOptions(screen.getByLabelText('Usuario'), '3');
  await waitFor(() => expect(ultimaLista()).toMatchObject({ user_id: '3', event: 'login_fallido' }));

  await user.type(screen.getByLabelText('Desde'), '2026-10-01');
  await waitFor(() => expect(ultimaLista()).toMatchObject({ desde: '2026-10-01' }));

  await user.type(screen.getByLabelText('Buscar'), 'retiró');
  await waitFor(() => expect(ultimaLista()).toMatchObject({ q: 'retiró' }));

  await user.click(screen.getByRole('button', { name: 'Siguiente' }));
  await waitFor(() => expect(ultimaLista()).toMatchObject({ page: 2, q: 'retiró' }));
});

test('al hacer clic en una fila se abre el detalle con los datos clave/valor', async () => {
  const user = userEvent.setup();
  renderPage();
  await user.click(await screen.findByText('Retiró a Rita Retirada de 1° A'));
  const dlg = screen.getByRole('dialog', { name: /detalle del registro/i });
  expect(dlg).toHaveTextContent('DELETE /api/matricula/enrollments/9');
  expect(dlg).toHaveTextContent('Matrícula #9');
  expect(within(dlg).getByText('Campos enviados')).toBeInTheDocument();
  expect(within(dlg).getByText('Cambio de ciudad')).toBeInTheDocument();
  const cerrar = within(dlg).getAllByRole('button', { name: 'Cerrar' });
  await user.click(cerrar[cerrar.length - 1]);
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('exportar descarga el Excel con los filtros aplicados', async () => {
  const user = userEvent.setup();
  renderPage();
  await screen.findByText('Retiró a Rita Retirada de 1° A');
  await user.selectOptions(screen.getByLabelText('Tipo de evento'), 'editar');
  await user.click(screen.getByRole('button', { name: /exportar excel/i }));
  await waitFor(() => expect(descargarArchivo).toHaveBeenCalled());
  const [url, nombre] = descargarArchivo.mock.calls[0];
  expect(url).toMatch(/^\/api\/auditoria\/export\.xlsx\?/);
  expect(url).toContain('event=editar');
  expect(nombre).toMatch(/\.xlsx$/);
});

test('muestra el error del backend (403)', async () => {
  axios.get.mockImplementation((url) => (url === '/api/auditoria'
    ? Promise.reject({ response: { status: 403, data: { error: 'Solo un administrador puede ver el historial' } } })
    : Promise.resolve({ data: RESUMEN })));
  renderPage();
  expect(await screen.findByText('Solo un administrador puede ver el historial')).toBeInTheDocument();
});
