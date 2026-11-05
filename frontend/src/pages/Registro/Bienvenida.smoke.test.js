import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import axios from 'axios';

import BienvenidaPage from './BienvenidaPage';
import { AuthContext } from '../../context/AuthContext';

jest.mock('axios');

function montar(extra = {}) {
  const valor = {
    user: { first_name: 'Ana', role: 'admin', school_id: null }, school: null,
    logout: jest.fn(), iniciarSesion: jest.fn(), refrescarSesion: jest.fn(), ...extra,
  };
  render(
    <AuthContext.Provider value={valor}>
      <MemoryRouter initialEntries={['/bienvenida']}>
        <Routes>
          <Route path="/bienvenida" element={<BienvenidaPage />} />
          <Route path="/bienvenida/datos" element={<p>pantalla de datos</p>} />
          <Route path="/dashboard" element={<p>panel</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
  return valor;
}

describe('Bienvenida', () => {
  beforeEach(() => {
    axios.get.mockResolvedValue({ data: { google_client_id: null, dias_prueba: 30 } });
    // Sin la animación de avance: el test no debe esperar sus pausas
    window.matchMedia = (q) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} });
  });

  test('saluda por el nombre y explica los tres pasos', async () => {
    montar();
    expect(screen.getByText(/Hola, Ana\./)).toBeTruthy();
    expect(screen.getByText('Creas tu colegio')).toBeTruthy();
    expect(screen.getByText('Traes tus datos')).toBeTruthy();
    expect(await screen.findByText(/Tienes 30 días/)).toBeTruthy();
  });

  test('exige el nombre del colegio', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Crear mi colegio' }));
    expect(screen.getByText(/Escribe el nombre de tu colegio/)).toBeTruthy();
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('crea el colegio, guarda el token nuevo y sigue a los datos', async () => {
    const respuesta = { access_token: 'nuevo', user: { school_id: 9 }, school: { id: 9 }, prueba: { dias: 30, termina: '2026-12-04' } };
    axios.post.mockResolvedValue({ data: respuesta });
    const auth = montar();
    fireEvent.change(screen.getByLabelText('Nombre del colegio'), { target: { value: 'Escuela de Prueba' } });
    fireEvent.change(screen.getByLabelText(/Comuna/), { target: { value: 'Talca' } });
    fireEvent.click(screen.getByLabelText('101 a 300'));
    fireEvent.click(screen.getByRole('button', { name: 'Crear mi colegio' }));
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/registro/colegio', {
      nombre: 'Escuela de Prueba', comuna: 'Talca', cantidad_alumnos_aprox: 300,
    }));
    await waitFor(() => expect(auth.iniciarSesion).toHaveBeenCalledWith(respuesta));
    expect(await screen.findByText('pantalla de datos')).toBeTruthy();
  });

  test('si falla, vuelve al formulario con el mensaje', async () => {
    axios.post.mockRejectedValue({ response: { status: 500, data: { error: 'Algo pasó' } } });
    montar();
    fireEvent.change(screen.getByLabelText('Nombre del colegio'), { target: { value: 'Escuela' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear mi colegio' }));
    expect(await screen.findByText('Algo pasó')).toBeTruthy();
    expect(screen.getByLabelText('Nombre del colegio')).toHaveValue('Escuela');
  });

  test('quien ya tiene colegio no se queda aquí', () => {
    montar({ school: { id: 1 }, user: { first_name: 'Ana', role: 'admin', school_id: 1 } });
    expect(screen.getByText('panel')).toBeTruthy();
  });
});
