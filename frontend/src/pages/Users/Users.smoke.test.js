/**
 * Humo de la ficha de usuario.
 *
 * Cubre lo que se reportó roto: el correo que no se guardaba, y los controles
 * de contraseña (ver, generar, copiar) que se agregaron después.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';

import UsersPage from './UsersPage';
import { AuthContext } from '../../context/AuthContext';

jest.mock('axios');

const USUARIOS = [
  { id: 7, first_name: 'Darinka', last_name: 'Alfaro', role: 'profesor',
    email: 'profe.138978087@franzliszt.cl', rut: '13897808-7', phone: '',
    address: '', gender: '', birth_date: null, is_active: true, has_photo: false },
];

const AUTH = {
  user: { id: 1, role: 'admin', first_name: 'Víctor', last_name: 'Espinoza' },
  school: { id: 2, name: 'Colegio Franz Liszt', primary_color: '#3b4fd8' },
  loading: false, login: jest.fn(), logout: jest.fn(), updateSchool: jest.fn(),
};

function montar() {
  return render(
    <AuthContext.Provider value={AUTH}>
      <MemoryRouter><UsersPage /></MemoryRouter>
    </AuthContext.Provider>
  );
}

async function abrirFicha() {
  montar();
  await screen.findByText('Darinka Alfaro');
  // La ficha se abre con el botón de editar, no haciendo clic en la fila
  fireEvent.click(screen.getByTitle('Editar'));
  return await screen.findByText(/Nueva contraseña/);
}

describe('Ficha de usuario', () => {
  let errores;
  beforeEach(() => {
    errores = [];
    jest.spyOn(console, 'error').mockImplementation((...a) => errores.push(a.join(' ')));
    axios.get.mockImplementation(url =>
      Promise.resolve({ data: url.includes('/api/users') && !url.includes('/courses')
        ? USUARIOS : [] }));
    axios.put.mockResolvedValue({ data: USUARIOS[0] });
    axios.post.mockResolvedValue({ data: USUARIOS[0] });
    Object.defineProperty(window, 'crypto', {
      value: { getRandomValues: a => { for (let i = 0; i < a.length; i++) a[i] = i * 7 + 3; return a; } },
      configurable: true,
    });
  });
  afterEach(() => jest.restoreAllMocks());

  const sinFallos = () =>
    expect(errores.filter(e => /not defined|is not a function|Cannot read/.test(e)))
      .toEqual([]);

  test('la contraseña arranca oculta y el ojo la muestra', async () => {
    await abrirFicha();

    const campo = document.querySelector('input[autocomplete="new-password"]');
    expect(campo.type).toBe('password');

    fireEvent.click(screen.getByLabelText('Ver la contraseña'));
    await waitFor(() => expect(
      document.querySelector('input[autocomplete="new-password"]').type).toBe('text'));

    fireEvent.click(screen.getByLabelText('Ocultar la contraseña'));
    await waitFor(() => expect(
      document.querySelector('input[autocomplete="new-password"]').type).toBe('password'));
    sinFallos();
  });

  test('explica que la contraseña actual no se puede ver', async () => {
    await abrirFicha();
    expect(screen.getByText(/no se puede ver/)).toBeTruthy();
    expect(screen.getByText(/huella cifrada/)).toBeTruthy();
    sinFallos();
  });

  test('generar escribe una clave y la deja visible', async () => {
    await abrirFicha();
    fireEvent.click(screen.getByText('Generar'));

    await waitFor(() => {
      const campo = document.querySelector('input[autocomplete="new-password"]');
      expect(campo.value.length).toBe(10);
      expect(campo.type).toBe('text');       // de nada sirve si no se lee
      // Sin caracteres que se confundan al dictarla
      expect(/[l1IO0]/.test(campo.value)).toBe(false);
    });
    sinFallos();
  });

  test('el correo editado viaja en el guardado', async () => {
    await abrirFicha();

    const correo = screen.getByDisplayValue('profe.138978087@franzliszt.cl');
    fireEvent.change(correo, { target: { value: 'dalfaro@franzliszt.cl' } });
    fireEvent.click(screen.getByText('Actualizar'));

    await waitFor(() => {
      const [url, cuerpo] = axios.put.mock.calls.find(c => c[0] === '/api/users/7');
      expect(url).toBe('/api/users/7');
      expect(cuerpo.email).toBe('dalfaro@franzliszt.cl');
    });
    sinFallos();
  });
});
