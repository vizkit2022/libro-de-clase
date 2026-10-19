import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import axios from 'axios';
import StudentFichaPage from '../StudentFichaPage';

// axios 1.x es ESM; usamos una fábrica para no cargar el módulo real
jest.mock('axios', () => {
  const instance = {
    get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn(),
    defaults: { headers: { common: {} }, baseURL: '' },
    interceptors: { request: { use: jest.fn(), eject: jest.fn() }, response: { use: jest.fn(), eject: jest.fn() } },
  };
  instance.create = jest.fn(() => instance);
  return { __esModule: true, default: instance, ...instance };
});

jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 99, role: 'admin', first_name: 'Ana', last_name: 'Admin' },
    school: { id: 1, name: 'Colegio San Patricio', primary_color: '#2563EB' },
    token: 'test-token',
  }),
}));

const FICHA = {
  student: {
    id: 1, first_name: 'Pedro', last_name: 'Alvarado Soto', rut: '21.234.567-8',
    email: 'pedro.alvarado@gmail.com', birth_date: '2012-03-15', gender: 'Masculino',
    address: 'Av. Siempre Viva 742', phone: '+56911111111', has_photo: true, role: 'alumno',
  },
  profile: {
    status: 'matriculado', id_type: 'RUN', nationality: 'Chile', comuna: 'Ñuñoa',
    lives_with: 'Madre', extra: {},
  },
  medical: { blood_type: 'O+', health_insurance: 'Fonasa', allergies: 'Penicilina' },
  family: [
    { id: 11, first_name: 'María', last_name: 'Soto', full_name: 'María Soto', relationship: 'Madre',
      rut: '12.345.678-5', phone: '+56922222222', email: 'maria@example.com',
      is_titular: true, is_suplente: false, has_access: true, user_email: 'maria@example.com' },
  ],
  authorizations: [
    { id: 21, title: 'Autorización de uso de imagen', description: 'Fotos en redes del colegio',
      status: 'autorizado', signed_by_member_id: 11, signed_by_name: 'María Soto',
      signed_by_rut: '12.345.678-5', signed_at: '2026-03-01', has_signature: false, signature_image: null },
    { id: 22, title: 'Salida pedagógica', description: null, status: 'pendiente', has_signature: false },
  ],
  documents: [
    { id: 31, title: 'Certificado de nacimiento', filename: 'certificado.pdf', mime_type: 'application/pdf',
      size_bytes: 20480, category: 'Certificados', description: 'Copia', created_at: '2026-03-02T10:00:00',
      uploaded_by_name: 'Ana Admin' },
  ],
  summary: {
    course_name: '7° Básico A', age: 14, average: 5.8, status: 'matriculado',
    guardian: { rut: '12.345.678-5', phone: '+56922222222', name: 'María Soto' },
  },
  permissions: { can_edit: true, can_view: true },
};

function mockApi(ficha = FICHA) {
  axios.get.mockImplementation((url) => {
    if (/\/ficha$/.test(url)) return Promise.resolve({ data: ficha });
    if (/\/photo/.test(url)) return Promise.resolve({ data: new Blob(['x'], { type: 'image/png' }), headers: { 'content-type': 'image/png' } });
    if (/authorization-templates/.test(url)) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: {} });
  });
}

function renderPage(path = '/students/1/ficha') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/students/:id/ficha" element={<StudentFichaPage />} />
        <Route path="*" element={<div>otra ruta</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

// La vista imprimible (FichaPrintView) siempre está montada y duplica textos:
// las consultas de UI interactiva se limitan al contenedor en pantalla.
const ui = () => within(document.querySelector('.ficha-screen') || document.body);
const nav = () => ui().getByRole('navigation', { name: /secciones de la ficha/i });
const goTo = async (user, label) => user.click(within(nav()).getByRole('button', { name: new RegExp(label, 'i') }));

beforeEach(() => {
  jest.clearAllMocks();
  // CRA usa resetMocks: true → reinstalar implementaciones en cada test
  window.URL.createObjectURL = jest.fn(() => 'blob:mock');
  window.URL.revokeObjectURL = jest.fn();
  mockApi();
});

test('carga la ficha y muestra nombre y encabezado', async () => {
  renderPage();
  const name = await screen.findByRole('heading', { level: 1 });
  expect(name).toHaveTextContent('Pedro');
  expect(name).toHaveTextContent('Alvarado Soto');
  expect(axios.get).toHaveBeenCalledWith('/api/students/1/ficha');
  expect(ui().getByText('7° Básico A')).toBeInTheDocument();
  expect(ui().getByText(/14 años/)).toBeInTheDocument();
  expect(ui().getByText('21.234.567-8')).toBeInTheDocument();
  expect(ui().getByText('Av. Siempre Viva 742')).toBeInTheDocument();
  expect(ui().getByText('5.8')).toBeInTheDocument();
  expect(ui().getByText(/Prom\. Notas/)).toBeInTheDocument();
  // Sección por defecto: Datos Personales
  expect(ui().getByRole('heading', { name: /Datos del Estudiante/ })).toBeInTheDocument();
});

test.each([
  ['Datos Personales', /Datos del Estudiante/],
  ['Apoderados y Hogar', /^\W*Apoderados$/u],
  ['Antecedentes Médicos', /Datos de Salud/],
  ['Permisos', /^\W*Permisos$/u],
  ['Archivos y Documentos', /^\W*Archivos y Documentos$/u],
])('navegar a "%s" muestra su título', async (label, heading) => {
  const user = userEvent.setup();
  renderPage();
  await screen.findByRole('heading', { level: 1 });
  await goTo(user, label);
  const btn = within(nav()).getByRole('button', { name: new RegExp(label, 'i') });
  expect(btn).toHaveAttribute('aria-current', 'page');
  expect(await ui().findByRole('heading', { level: 3, name: heading })).toBeInTheDocument();
});

test('Permisos muestra autorizaciones y control de subida de firma', async () => {
  const user = userEvent.setup();
  renderPage();
  await screen.findByRole('heading', { level: 1 });
  await goTo(user, 'Permisos');
  expect(await ui().findByRole('heading', { level: 3, name: /^\W*Permisos$/u })).toBeInTheDocument();
  expect(ui().getAllByText('Autorización de uso de imagen').length).toBeGreaterThan(0);
  expect(ui().getAllByText('Salida pedagógica').length).toBeGreaterThan(0);
  expect(ui().getByRole('button', { name: /Agregar autorización/ })).toBeInTheDocument();
  // Control de subida de firma por cada autorización
  expect(ui().getAllByRole('button', { name: /Subir imagen/ })).toHaveLength(2);
  const uploads = ui().getAllByLabelText(/Subir imagen de la firma/);
  expect(uploads[0]).toHaveAttribute('type', 'file');
  expect(uploads[0]).toHaveAttribute('accept', 'image/*');
  expect(ui().getAllByText('Sin firma registrada')).toHaveLength(2);
});

test('Documentos muestra zona de subida y documentos con editar/quitar', async () => {
  const user = userEvent.setup();
  renderPage();
  await screen.findByRole('heading', { level: 1 });
  await goTo(user, 'Archivos y Documentos');
  await ui().findByRole('heading', { level: 3, name: /^\W*Archivos y Documentos$/u });
  expect(ui().getByText(/Arrastra un archivo aquí/)).toBeInTheDocument();
  expect(ui().getByRole('button', { name: /Seleccionar archivo/ })).toBeInTheDocument();
  expect(ui().getByLabelText('Seleccionar documento')).toHaveAttribute('type', 'file');
  expect(ui().getByText('1 archivo')).toBeInTheDocument();

  const row = ui().getByText('Certificado de nacimiento').closest('tr');
  expect(row).not.toBeNull();
  expect(within(row).getByText('Certificados')).toBeInTheDocument();
  expect(within(row).getByRole('button', { name: /Editar/ })).toBeInTheDocument();
  expect(within(row).getByRole('button', { name: /Quitar/ })).toBeInTheDocument();
  expect(within(row).getByRole('button', { name: /Ver/ })).toBeInTheDocument();

  await user.click(within(row).getByRole('button', { name: /Editar/ }));
  expect(await screen.findByRole('dialog', { name: /Editar documento/ })).toBeInTheDocument();
});

test('modo solo lectura oculta controles de edición', async () => {
  mockApi({ ...FICHA, permissions: { can_edit: false } });
  const user = userEvent.setup();
  renderPage();
  await screen.findByRole('heading', { level: 1 });
  expect(ui().getByRole('note')).toHaveTextContent(/Solo lectura/);
  await goTo(user, 'Archivos y Documentos');
  await ui().findByText('Certificado de nacimiento');
  expect(ui().queryByText(/Arrastra un archivo aquí/)).not.toBeInTheDocument();
  expect(ui().queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument();
});

test('403 muestra pantalla sin acceso', async () => {
  axios.get.mockImplementation(() => Promise.reject({ response: { status: 403 } }));
  renderPage();
  expect(await screen.findByText('No tienes acceso a esta ficha')).toBeInTheDocument();
});

test('la foto se carga con axios como blob (no <img src> sin token)', async () => {
  renderPage();
  await screen.findByRole('heading', { level: 1 });
  await waitFor(() => expect(axios.get).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/users\/1\/photo$/),
    expect.objectContaining({ responseType: 'blob' }),
  ));
  const imgs = await ui().findAllByRole('img', { name: /Foto de Pedro/ });
  imgs.forEach(img => expect(img).toHaveAttribute('src', 'blob:mock'));
});

test('menú Descargar ofrece ficha completa / sección actual e imprime', async () => {
  jest.useFakeTimers();
  const printSpy = jest.spyOn(window, 'print').mockImplementation(() => {});
  try {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderPage('/students/1/ficha?s=medico');
    await screen.findByRole('heading', { level: 1 });
    const btn = ui().getByRole('button', { name: /Descargar/ });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    await user.click(btn);
    const menu = ui().getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Ficha completa/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /Sección actual.*Antecedentes Médicos/ })).toBeInTheDocument();
    await user.click(within(menu).getByRole('menuitem', { name: /Ficha completa/ }));
    act(() => { jest.advanceTimersByTime(500); });
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(ui().queryByRole('menu')).not.toBeInTheDocument();
  } finally {
    printSpy.mockRestore();
    jest.useRealTimers();
  }
});
