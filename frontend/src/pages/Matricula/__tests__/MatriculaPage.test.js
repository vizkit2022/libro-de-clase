import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import MatriculaPage from '../MatriculaPage';

jest.mock('axios', () => {
  const instance = {
    get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn(),
    defaults: { headers: { common: {} }, baseURL: '' },
    interceptors: { request: { use: jest.fn(), eject: jest.fn() }, response: { use: jest.fn(), eject: jest.fn() } },
  };
  instance.create = jest.fn(() => instance);
  return { __esModule: true, default: instance, ...instance };
});

const mockAuth = {};
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => mockAuth }));

const CURSOS = [
  { id: 1, nombre: '1° A', nivel: '1° Básico', letra: 'A', year: 2027, alumnos: 1,
    por_confirmar: 2, retirados: 1, profesor_jefe: 'Marta Valdés' },
  { id: 2, nombre: '1° B', nivel: '1° Básico', letra: 'B', year: 2027, alumnos: 0,
    por_confirmar: 0, retirados: 0, profesor_jefe: null },
];

const ALUMNOS = {
  curso: { id: 1, nombre: '1° A', year: 2027, cerrado: false },
  alumnos: [
    { enrollment_id: 11, id: 101, nombre: 'Ana', apellido: 'Activa', rut: '1-9', estado: 'activo',
      fecha_matricula: '2027-03-01', fecha_retiro: null, motivo_retiro: null, confirmado_at: null, promovido_desde: null },
    { enrollment_id: 12, id: 102, nombre: 'Pablo', apellido: 'Pendiente', rut: '2-7', estado: 'por_confirmar',
      fecha_matricula: null, fecha_retiro: null, motivo_retiro: null, confirmado_at: null, promovido_desde: 'Kinder A' },
    { enrollment_id: 13, id: 103, nombre: 'Rita', apellido: 'Pendiente Dos', rut: '3-5', estado: 'por_confirmar',
      fecha_matricula: null, fecha_retiro: null, motivo_retiro: null, confirmado_at: null, promovido_desde: 'Kinder A' },
    { enrollment_id: 14, id: 104, nombre: 'Raúl', apellido: 'Retirado', rut: '4-3', estado: 'retirado',
      fecha_matricula: '2027-03-01', fecha_retiro: '2027-05-10', motivo_retiro: 'Cambio de colegio',
      confirmado_at: null, promovido_desde: null },
  ],
};

function mockApi(alumnos = ALUMNOS) {
  axios.get.mockImplementation((url) => {
    if (/\/api\/matricula\/cursos\?year=/.test(url)) return Promise.resolve({ data: CURSOS });
    if (/\/api\/matricula\/cursos\/\d+\/alumnos/.test(url)) return Promise.resolve({ data: alumnos });
    if (/historial/.test(url)) {
      return Promise.resolve({ data: { alumno: { id: 101, nombre: 'Ana Activa', rut: '1-9' }, eventos: [
        { id: 1, fecha: '2027-03-01T10:00:00', evento: 'matricula', descripcion: 'Matriculado en 1° A',
          detalles: null, year: 2027, curso: '1° A', curso_origen: null, usuario: 'Ana Admin' },
      ] } });
    }
    return Promise.resolve({ data: {} });
  });
  axios.post.mockImplementation(() => Promise.resolve({ data: { ok: true, confirmados: 2 } }));
  axios.delete.mockImplementation(() => Promise.resolve({ data: { ok: true } }));
}

const renderPage = () => render(<MemoryRouter><MatriculaPage /></MemoryRouter>);
const fila = (texto) => screen.getByText(new RegExp(texto)).closest('tr');

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockAuth, {
    user: { id: 1, role: 'admin', first_name: 'Ana', last_name: 'Admin' },
    school: { id: 1, name: 'Colegio San Patricio', primary_color: '#2563EB' },
    anio: 2027, setAnio: jest.fn(), anios: [], anioCerrado: false, recargarAnios: jest.fn(),
  });
  window.URL.createObjectURL = jest.fn(() => 'blob:mock');
  window.URL.revokeObjectURL = jest.fn();
  mockApi();
});

test('usa el año global y muestra estados y fechas', async () => {
  renderPage();
  await screen.findByText(/Activa, Ana/);
  expect(axios.get).toHaveBeenCalledWith('/api/matricula/cursos?year=2027');
  expect(screen.getByRole('heading', { name: /Matrícula 2027/ })).toBeInTheDocument();
  expect(within(fila('Activa, Ana')).getByText('Activo')).toBeInTheDocument();
  expect(within(fila('Retirado, Raúl')).getByText('Retirado')).toBeInTheDocument();
  expect(within(fila('Retirado, Raúl')).getByText('10-05-2027')).toBeInTheDocument();
  expect(within(fila('Pendiente, Pablo')).getByText('Por confirmar')).toBeInTheDocument();
  expect(screen.getByText(/2 alumnos por confirmar/)).toBeInTheDocument();
});

test('confirmar todos llama al endpoint del curso', async () => {
  const user = userEvent.setup();
  renderPage();
  await screen.findByText(/Activa, Ana/);
  await user.click(screen.getByRole('button', { name: /confirmar todos/i }));
  const dlg = screen.getByRole('dialog');
  await user.click(within(dlg).getByRole('button', { name: /confirmar 2 alumnos/i }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    '/api/matricula/cursos/1/confirmar-todos', expect.objectContaining({ fecha: expect.any(String) })));
});

test.each([
  ['Confirmar', /confirmar matrícula/i, 'confirmar'],
  ['Repite', /confirmar que repite/i, 'repite'],
  ['No continúa', /no continúa/i, 'no_continua'],
])('botón "%s" por fila envía la acción', async (boton, enviar, accion) => {
  const user = userEvent.setup();
  renderPage();
  await screen.findByText(/Pendiente, Pablo/);
  await user.click(within(fila('Pendiente, Pablo')).getByRole('button', { name: new RegExp(`^${boton}$`) }));
  const dlg = screen.getByRole('dialog');
  if (accion === 'no_continua') await user.type(within(dlg).getByLabelText(/motivo/i), 'Se muda');
  await user.click(within(dlg).getAllByRole('button', { name: enviar }).slice(-1)[0]);
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    '/api/matricula/enrollments/12/confirmar', expect.objectContaining({ accion })));
});

test('retirar con fecha y motivo', async () => {
  const user = userEvent.setup();
  renderPage();
  await screen.findByText(/Activa, Ana/);
  await user.click(screen.getByRole('button', { name: /acciones para ana activa/i }));
  await user.click(screen.getByRole('menuitem', { name: /retirar/i }));
  const dlg = screen.getByRole('dialog');
  const fecha = within(dlg).getByLabelText(/fecha de retiro/i);
  await user.clear(fecha);
  await user.type(fecha, '2027-06-01');
  await user.type(within(dlg).getByLabelText(/motivo/i), 'Cambio de colegio');
  await user.click(within(dlg).getByRole('button', { name: /retirar alumno/i }));
  await waitFor(() => expect(axios.delete).toHaveBeenCalledWith('/api/matricula/enrollments/11',
    { data: { fecha: '2027-06-01', motivo: 'Cambio de colegio' } }));
});

test('cambiar de curso elige destino del mismo año', async () => {
  const user = userEvent.setup();
  renderPage();
  await screen.findByText(/Activa, Ana/);
  await user.click(screen.getByRole('button', { name: /acciones para ana activa/i }));
  await user.click(screen.getByRole('menuitem', { name: /cambiar de curso/i }));
  const dlg = screen.getByRole('dialog');
  await user.selectOptions(within(dlg).getByLabelText(/curso de destino/i), '2');
  await user.click(within(dlg).getByRole('button', { name: /^cambiar de curso$/i }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    '/api/matricula/enrollments/11/cambiar-curso', expect.objectContaining({ course_id: 2 })));
});

test('reincorporar un retirado', async () => {
  const user = userEvent.setup();
  renderPage();
  await screen.findByText(/Retirado, Raúl/);
  await user.click(screen.getByRole('button', { name: /acciones para raúl retirado/i }));
  expect(screen.queryByRole('menuitem', { name: /^.*retirar$/i })).toBeNull();
  await user.click(screen.getByRole('menuitem', { name: /reincorporar/i }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^reincorporar$/i }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    '/api/matricula/enrollments/14/reincorporar', expect.objectContaining({ fecha: expect.any(String) })));
});

test('historial abre la línea de tiempo', async () => {
  const user = userEvent.setup();
  renderPage();
  await screen.findByText(/Activa, Ana/);
  await user.click(screen.getByRole('button', { name: /acciones para ana activa/i }));
  await user.click(screen.getByRole('menuitem', { name: /historial/i }));
  expect(await screen.findByText('Matriculado en 1° A')).toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledWith('/api/matricula/alumnos/101/historial');
});

test('descargar ficha PDF pide el endpoint con el año', async () => {
  const user = userEvent.setup();
  renderPage();
  await screen.findByText(/Activa, Ana/);
  await user.click(screen.getByRole('button', { name: /acciones para ana activa/i }));
  await user.click(screen.getByRole('menuitem', { name: /descargar ficha/i }));
  await waitFor(() => expect(axios.get).toHaveBeenCalledWith(
    '/api/matricula/alumnos/101/ficha.pdf?year=2027', expect.objectContaining({ responseType: 'blob' })));
});

test('año cerrado: banner y sin acciones de escritura', async () => {
  const user = userEvent.setup();
  mockAuth.anioCerrado = true;
  mockApi({ ...ALUMNOS, curso: { ...ALUMNOS.curso, cerrado: true } });
  renderPage();
  await screen.findByText(/Activa, Ana/);
  expect(screen.getByText(/Año cerrado — solo lectura/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /confirmar todos/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /^Repite$/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /agregar alumno/i })).toBeNull();
  await user.click(screen.getByRole('button', { name: /acciones para ana activa/i }));
  expect(screen.getByRole('menuitem', { name: /descargar ficha/i })).toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: /retirar/i })).toBeNull();
  expect(screen.queryByRole('menuitem', { name: /cambiar de curso/i })).toBeNull();
});

test('profesor solo lee', async () => {
  mockAuth.user = { id: 3, role: 'profesor', first_name: 'Marta', last_name: 'Valdés' };
  renderPage();
  await screen.findByText(/Activa, Ana/);
  expect(screen.queryByRole('button', { name: /confirmar todos/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /agregar alumno/i })).toBeNull();
});
