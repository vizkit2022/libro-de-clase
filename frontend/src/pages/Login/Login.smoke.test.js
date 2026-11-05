/**
 * Humo del ingreso: las opciones nuevas (registro y Google) no pueden estorbar
 * al que ya tiene cuenta, que sigue entrando igual.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';

import LoginPage from './LoginPage';
import { AuthContext } from '../../context/AuthContext';

jest.mock('axios');

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

function montar(auth = {}) {
  const valor = { user: null, school: null, login: jest.fn(), iniciarSesion: jest.fn(), ...auth };
  render(
    <AuthContext.Provider value={valor}>
      <MemoryRouter><LoginPage /></MemoryRouter>
    </AuthContext.Provider>
  );
  return valor;
}

describe('Ingreso', () => {
  beforeEach(() => { mockNavigate.mockReset(); delete window.google; });

  test('los días del enlace salen de la configuración y sin client_id no hay Google', async () => {
    axios.get.mockResolvedValue({ data: { google_client_id: null, dias_prueba: 21 } });
    montar();
    expect(await screen.findByRole('link', { name: 'Regístrate y prueba 21 días' })).toHaveAttribute('href', '/registro');
    expect(screen.queryByTestId('boton-google')).toBeNull();
  });

  test('si la configuración falla, entra igual y no promete días', async () => {
    axios.get.mockRejectedValue(new Error('caído'));
    const auth = montar();
    expect(await screen.findByRole('link', { name: 'Regístrate y prueba gratis' })).toBeTruthy();
    auth.login.mockResolvedValue({});
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'a@b.cl' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'clave1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    await waitFor(() => expect(auth.login).toHaveBeenCalledWith('a@b.cl', 'clave1234'));
  });

  test('con client_id dibuja Google y su credencial abre la sesión', async () => {
    const google = { initialize: jest.fn(), renderButton: jest.fn() };
    window.google = { accounts: { id: google } };
    axios.get.mockResolvedValue({ data: { google_client_id: 'cid-prueba', dias_prueba: 30 } });
    const respuesta = { access_token: 't', user: { role: 'admin', school_id: null }, school: null, nuevo: true };
    axios.post.mockResolvedValue({ data: respuesta });
    const auth = montar();

    await waitFor(() => expect(google.renderButton).toHaveBeenCalled());
    expect(google.initialize.mock.calls[0][0].client_id).toBe('cid-prueba');
    google.initialize.mock.calls[0][0].callback({ credential: 'id-token' });
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/registro/google', { credential: 'id-token' }));
    await waitFor(() => expect(auth.iniciarSesion).toHaveBeenCalledWith(respuesta));
  });

  test('cada sesión va a su lugar: sin colegio a la bienvenida, con colegio al panel', () => {
    axios.get.mockResolvedValue({ data: {} });
    montar({ user: { role: 'admin', school_id: null }, school: null });
    expect(mockNavigate).toHaveBeenCalledWith('/bienvenida');
    mockNavigate.mockReset();
    montar({ user: { role: 'admin', school_id: 3 }, school: { id: 3 } });
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    mockNavigate.mockReset();
    montar({ user: { role: 'super_admin', school_id: null }, school: null });
    expect(mockNavigate).toHaveBeenCalledWith('/super-admin');
  });
});
