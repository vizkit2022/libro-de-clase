import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';

import Layout from '../Layout/Layout';
import { AvisoPruebaVencida } from './AvisosPrueba';
import { AuthContext } from '../../context/AuthContext';

jest.mock('axios');

const usuario = (role = 'admin') => ({ id: 1, role, first_name: 'Ana', last_name: 'Soto', email: 'a@ejemplo.invalid' });
const auto = (extra = {}) => ({ id: 2, name: 'Escuela', origen: 'autoregistro', tiene_demo: false,
  prueba: { dias_restantes: 20, termina: '2026-11-25', vencida: false, suscrito: false }, ...extra });

function montar(school, role = 'admin', extra = {}) {
  const valor = { user: usuario(role), school, logout: jest.fn(), refrescarSesion: jest.fn(), recargarAnios: jest.fn(), ...extra };
  render(
    <AuthContext.Provider value={valor}>
      <MemoryRouter initialEntries={['/dashboard']}><Layout /></MemoryRouter>
    </AuthContext.Provider>
  );
  return valor;
}

describe('Avisos de la prueba en el marco', () => {
  test('un colegio existente no ve nada, aunque traiga datos de prueba', () => {
    montar({ id: 2, name: 'Colegio Antiguo', origen: null, tiene_demo: true,
      prueba: { dias_restantes: 0, vencida: true, suscrito: false } });
    expect(screen.queryByText(/prueba/i)).toBeNull();
    expect(screen.queryByText(/datos de ejemplo/)).toBeNull();
  });

  test('en prueba: días restantes y enlace al plan', () => {
    montar(auto());
    expect(screen.getByText('Te quedan 20 días de prueba.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver mi plan' })).toHaveAttribute('href', '/plan');
  });

  test('singular y último día', () => {
    montar(auto({ prueba: { dias_restantes: 1, vencida: false } }));
    expect(screen.getByText('Te queda 1 día de prueba.')).toBeTruthy();
  });

  test('suscrito: sin franja', () => {
    montar(auto({ prueba: { dias_restantes: 5, vencida: false, suscrito: true } }));
    expect(screen.queryByText(/días de prueba/)).toBeNull();
  });

  test('vencida: solo lectura con llamado a suscribirse', () => {
    montar(auto({ prueba: { dias_restantes: 0, vencida: true, suscrito: false } }));
    expect(screen.getByText('Tu prueba terminó.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Suscribirme' })).toHaveAttribute('href', '/plan');
  });

  test('el apoderado no ve avisos comerciales', () => {
    montar(auto({ tiene_demo: true, prueba: { dias_restantes: 0, vencida: true } }), 'apoderado');
    expect(screen.queryByText('Tu prueba terminó.')).toBeNull();
    expect(screen.queryByText(/datos de ejemplo/)).toBeNull();
  });

  test('datos de ejemplo: se borran con confirmación y se refresca la sesión', async () => {
    axios.delete.mockResolvedValue({ data: {} });
    const auth = montar(auto({ tiene_demo: true }));
    expect(screen.getByText('Estás viendo datos de ejemplo.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Borrar el ejemplo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, borrarlos' }));
    await waitFor(() => expect(axios.delete).toHaveBeenCalledWith('/api/autoonboarding/demo'));
    await waitFor(() => expect(auth.refrescarSesion).toHaveBeenCalled());
  });
});

describe('Respuesta 402 de prueba vencida', () => {
  function montarAviso(role = 'admin') {
    let rechazo;
    axios.interceptors = { response: { use: jest.fn((ok, mal) => { rechazo = mal; return 7; }), eject: jest.fn() } };
    const valor = { user: usuario(role), school: auto(), refrescarSesion: jest.fn() };
    render(
      <AuthContext.Provider value={valor}>
        <MemoryRouter><AvisoPruebaVencida /></MemoryRouter>
      </AuthContext.Provider>
    );
    return { rechazo, valor };
  }

  test('abre el aviso con salida al plan y sigue rechazando la promesa', async () => {
    const { rechazo, valor } = montarAviso();
    const err = { response: { status: 402, data: { error: 'x', codigo: 'prueba_vencida' } } };
    let resultado;
    await act(async () => { resultado = await rechazo(err).catch(e => e); });
    expect(resultado).toBe(err);
    expect(screen.getByRole('dialog', { name: 'Tu prueba terminó' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ver mi plan' })).toBeTruthy();
    expect(valor.refrescarSesion).toHaveBeenCalled();
  });

  test('otros errores pasan de largo', async () => {
    const { rechazo } = montarAviso();
    await act(async () => { await rechazo({ response: { status: 402, data: { codigo: 'otro' } } }).catch(() => {}); });
    await act(async () => { await rechazo({ response: { status: 500, data: {} } }).catch(() => {}); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('un docente no recibe el botón al plan', async () => {
    const { rechazo } = montarAviso('profesor');
    await act(async () => { await rechazo({ response: { status: 402, data: { codigo: 'prueba_vencida' } } }).catch(() => {}); });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ver mi plan' })).toBeNull();
  });
});
