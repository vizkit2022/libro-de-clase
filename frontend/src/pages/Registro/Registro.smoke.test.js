import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';

import RegistroPage from './RegistroPage';
import { AuthContext } from '../../context/AuthContext';

jest.mock('axios');

function montar() {
  const valor = { user: null, school: null, iniciarSesion: jest.fn() };
  render(
    <AuthContext.Provider value={valor}>
      <MemoryRouter><RegistroPage /></MemoryRouter>
    </AuthContext.Provider>
  );
  return valor;
}

function llenar(clave = 'clave-segura') {
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: ' Ana ' } });
  fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Prueba' } });
  fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'Ana@Ejemplo.invalid' } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: clave } });
}

describe('Registro', () => {
  beforeEach(() => {
    axios.get.mockResolvedValue({ data: { google_client_id: null, dias_prueba: 30 } });
  });

  test('promete los días configurados y sin tarjeta', async () => {
    montar();
    expect(await screen.findByRole('heading', { name: 'Prueba 30 días gratis' })).toBeTruthy();
    expect(screen.getByText('Sin tarjeta de crédito')).toBeTruthy();
  });

  test('valida en el navegador y no llama al servidor si falta algo', async () => {
    montar();
    llenar('corta');
    fireEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));
    expect(await screen.findByText('Debe tener al menos 8 caracteres.')).toBeTruthy();
    expect(axios.post).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('aria-invalid', 'true');
  });

  test('crea la cuenta con la forma del contrato y abre la sesión', async () => {
    const respuesta = { access_token: 't', user: { role: 'admin', school_id: null }, school: null };
    axios.post.mockResolvedValue({ data: respuesta });
    const auth = montar();
    llenar();
    fireEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/registro', {
      nombre: 'Ana', apellido: 'Prueba', email: 'ana@ejemplo.invalid', password: 'clave-segura',
    }));
    await waitFor(() => expect(auth.iniciarSesion).toHaveBeenCalledWith(respuesta));
  });

  test('correo repetido: ofrece ingresar', async () => {
    axios.post.mockRejectedValue({ response: { status: 409, data: { error: 'existe' } } });
    montar();
    llenar();
    fireEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));
    expect(await screen.findByRole('link', { name: 'Ingresa aquí' })).toHaveAttribute('href', '/login');
  });

  test('el ojo muestra la clave', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'text');
  });
});
