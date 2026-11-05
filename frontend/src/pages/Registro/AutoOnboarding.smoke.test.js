import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import axios from 'axios';

import AutoOnboardingPage from './AutoOnboardingPage';
import { AuthContext } from '../../context/AuthContext';

jest.mock('axios');

const PREVIA = {
  columnas_detectadas: { curso: 'Curso', rut: 'Rut alumno', nombres: 'Nombre' },
  columnas_faltantes: ['email_apoderado'],
  cursos: [{ nombre: '1° Básico A', alumnos: 2 }, { nombre: '2° Básico A', alumnos: 1 }],
  total_alumnos: 3, total_docentes: 1, total_apoderados: 2,
  muestra: [{ curso: '1° Básico A', nombres: 'Alumno Ficticio' }],
  errores: [{ fila: 7, motivo: 'El RUT no es válido' }],
  se_puede_aplicar: true,
};
const RESUMEN = {
  cursos: 2, alumnos: 3, docentes: 1, apoderados: 2, asignaturas: 0,
  promedio_general: null, asistencia: null, anotaciones: 0,
  por_curso: [{ nombre: '1° Básico A', alumnos: 2, promedio: null }],
  tiene_demo: false, prueba: { dias_restantes: 30, termina: '2026-12-04', vencida: false },
};
const VACIO = { ...RESUMEN, cursos: 0, alumnos: 0, por_curso: [] };

function montar(extra = {}) {
  const valor = {
    user: { role: 'admin', school_id: 9 }, school: { id: 9, name: 'Escuela de Prueba', origen: 'autoregistro' },
    refrescarSesion: jest.fn(), recargarAnios: jest.fn(), ...extra,
  };
  render(
    <AuthContext.Provider value={valor}>
      <MemoryRouter initialEntries={['/bienvenida/datos']}>
        <Routes>
          <Route path="/bienvenida/datos" element={<AutoOnboardingPage />} />
          <Route path="/bienvenida" element={<p>pantalla de bienvenida</p>} />
          <Route path="/dashboard" element={<p>panel</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
  return valor;
}

const excel = () => new File(['x'], 'matricula.xlsx', {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

describe('Carga de datos del colegio nuevo', () => {
  beforeEach(() => {
    axios.get.mockImplementation(() => Promise.resolve({ data: VACIO }));
  });

  test('sin colegio vuelve a la bienvenida', () => {
    montar({ user: { role: 'admin', school_id: null }, school: null });
    expect(screen.getByText('pantalla de bienvenida')).toBeTruthy();
  });

  test('muestra los dos caminos y se puede saltar', async () => {
    montar();
    expect(screen.getByRole('heading', { name: 'Sube tu Excel' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Explora con datos de ejemplo' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Saltar por ahora' })).toHaveAttribute('href', '/dashboard');
    await waitFor(() => expect(axios.get).toHaveBeenCalledWith('/api/autoonboarding/resumen'));
  });

  test('rechaza lo que no es planilla sin llamar al servidor', () => {
    montar();
    fireEvent.change(screen.getByLabelText('Archivo Excel'), {
      target: { files: [new File(['x'], 'foto.png', { type: 'image/png' })] } });
    expect(screen.getByRole('alert').textContent).toMatch(/no es una planilla/);
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('el Excel antiguo (.xls) recibe una indicación útil', () => {
    montar();
    fireEvent.change(screen.getByLabelText('Archivo Excel'), {
      target: { files: [new File(['x'], 'matricula.xls')] } });
    expect(screen.getByRole('alert').textContent).toMatch(/Guárdalo como \.xlsx/);
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('una planilla solo de docentes habla de docentes', async () => {
    axios.post.mockResolvedValue({ data: { ...PREVIA, total_alumnos: 0, total_docentes: 4, cursos: [],
      columnas_detectadas: { docente_nombres: 'Nombre' }, columnas_faltantes: [], muestra: [], errores: [] } });
    montar();
    fireEvent.change(screen.getByLabelText('Archivo Excel'), { target: { files: [excel()] } });
    expect(await screen.findByRole('button', { name: 'Cargar 4 docentes a mi colegio' })).toBeEnabled();
    expect(screen.getByText('Nombres del docente')).toBeTruthy();
  });

  test('archivo → vista previa → aplicar → cifras y panel', async () => {
    axios.post.mockImplementation((url) => Promise.resolve({ data: url.endsWith('/previsualizar') ? PREVIA : {
      cursos_creados: 2, alumnos_creados: 3, alumnos_actualizados: 0, docentes_creados: 1, apoderados_creados: 2,
      omitidos: [{ fila: 7, motivo: 'El RUT no es válido' }], resumen: RESUMEN,
    } }));
    const auth = montar();
    fireEvent.change(screen.getByLabelText('Archivo Excel'), { target: { files: [excel()] } });

    expect(await screen.findByText('matricula.xlsx')).toBeTruthy();
    const [url, cuerpo] = axios.post.mock.calls[0];
    expect(url).toBe('/api/autoonboarding/previsualizar');
    expect(cuerpo.get('archivo').name).toBe('matricula.xlsx');
    expect(screen.getByText(/tu columna «Rut alumno»/)).toBeTruthy();
    expect(screen.getByText(/El RUT no es válido/)).toBeTruthy();
    expect(screen.getByText('Alumno Ficticio')).toBeTruthy();
    expect(screen.getByText(/Correo del apoderado/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cargar 3 alumnos a mi colegio' }));
    expect(await screen.findByRole('group', { name: 'alumnos: 3' })).toBeTruthy();
    expect(axios.post.mock.calls[1][0]).toBe('/api/autoonboarding/aplicar');
    expect(auth.refrescarSesion).toHaveBeenCalled();
    expect(screen.getByText('Alumnos por curso')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ir a mi panel' }));
    expect(screen.getByText('panel')).toBeTruthy();
  });

  test('un archivo que no se puede aplicar lo dice y no deja seguir', async () => {
    axios.post.mockResolvedValue({ data: { ...PREVIA, total_alumnos: 0, total_docentes: 0, cursos: [], se_puede_aplicar: false } });
    montar();
    fireEvent.change(screen.getByLabelText('Archivo Excel'), { target: { files: [excel()] } });
    expect(await screen.findByText(/todavía no podemos cargar nada/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cargar a mi colegio' })).toBeDisabled();
  });

  test('un error del servidor al leer queda en español y en el mismo paso', async () => {
    axios.post.mockRejectedValue({ response: { status: 400, data: { error: 'No se pudo leer el archivo' } } });
    montar();
    fireEvent.change(screen.getByLabelText('Archivo Excel'), { target: { files: [excel()] } });
    expect(await screen.findByText('No se pudo leer el archivo')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Sube tu Excel' })).toBeTruthy();
  });

  test('las cifras animadas nunca muestran decimales a medio camino', async () => {
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      setTimeout(() => cb(performance.now() + 450), 0);
      return 1;
    });
    axios.post.mockResolvedValue({ data: {} });
    axios.get.mockResolvedValue({ data: { ...RESUMEN, alumnos: 187, tiene_demo: true } });
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Cargar datos de ejemplo' }));
    const cifra = await screen.findByRole('group', { name: 'alumnos: 187' });
    await waitFor(() => expect(cifra.querySelector('b').textContent).not.toBe('0'));
    expect(cifra.querySelector('b').textContent).toMatch(/^\d+$/);
    window.requestAnimationFrame.mockRestore();
  });

  test('datos de ejemplo: carga, trae el resumen y avisa que son ficticios', async () => {
    axios.post.mockResolvedValue({ data: { ok: true, resumen: { ...RESUMEN, tiene_demo: true, promedio_general: 5.8, asistencia: 91 } } });
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Cargar datos de ejemplo' }));
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/autoonboarding/demo'));
    expect(await screen.findByRole('group', { name: 'promedio general: 5,8' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'asistencia: 91%' })).toBeTruthy();
    expect(screen.getByText(/Son datos ficticios/)).toBeTruthy();
  });
});
