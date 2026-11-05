import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';

import PlanesPruebasPage from './PlanesPruebasPage';

jest.mock('axios');

const PLANES = [
  { id: 1, nombre: 'Plan Base', monto: 49990, frecuencia: 'mensual', dias_prueba: 30, descripcion: '', activo: true, predeterminado: true },
  { id: 2, nombre: 'Plan Anual', monto: null, frecuencia: 'anual', dias_prueba: 15, descripcion: '', activo: true, predeterminado: false },
  { id: 3, nombre: 'Plan Viejo', monto: 1000, frecuencia: 'mensual', dias_prueba: 30, descripcion: '', activo: false, predeterminado: false },
];
const PRUEBAS = {
  pruebas: [{
    school_id: 8, nombre: 'Escuela de Prueba', admin_email: 'admin@ejemplo.invalid', creado: '2026-10-20',
    plan_nombre: 'Plan Base', trial_ends_at: '2026-11-19', dias_restantes: 14, estado: 'activa', alumnos: 120, ultimo_acceso: null,
  }],
  totales: { activa: 1, por_vencer: 0, vencida: 2, suscrito: 3 },
};

const montar = () => render(<MemoryRouter><PlanesPruebasPage /></MemoryRouter>);

describe('Planes y pruebas', () => {
  beforeEach(() => {
    axios.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith('/planes') ? PLANES : PRUEBAS }));
    axios.post.mockResolvedValue({ data: { trial_ends_at: '2026-11-26' } });
    axios.put.mockResolvedValue({ data: {} });
    axios.delete.mockResolvedValue({ data: {} });
  });

  test('lista el catálogo, los totales y la tabla', async () => {
    montar();
    expect(await screen.findByText('Plan Anual')).toBeTruthy();
    expect(screen.getByText('Valor por definir')).toBeTruthy();
    expect(screen.getByText('Inactivo')).toBeTruthy();
    expect(await screen.findByText('Escuela de Prueba')).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /Vencidas/ })).getByText('2')).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /Todas/ })).getByText('6')).toBeTruthy();
  });

  test('crear plan valida los días y envía la forma del contrato', async () => {
    montar();
    await screen.findByText('Plan Anual');
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo plan' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Plan Nuevo' } });
    fireEvent.change(screen.getByLabelText('Días de prueba'), { target: { value: '400' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(/entre 1 y 365/)).toBeTruthy();
    expect(axios.post).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Días de prueba'), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText('Monto (CLP)'), { target: { value: '30000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/super-admin/planes', {
      nombre: 'Plan Nuevo', monto: 30000, frecuencia: 'mensual', dias_prueba: 45, descripcion: '', predeterminado: false,
    }));
  });

  test('predeterminado y desactivar', async () => {
    montar();
    await screen.findByText('Plan Anual');
    fireEvent.click(screen.getByRole('button', { name: 'Hacer predeterminado' }));
    await waitFor(() => expect(axios.put).toHaveBeenCalledWith('/api/super-admin/planes/2', { predeterminado: true }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desactivar' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(axios.delete).toHaveBeenCalledWith('/api/super-admin/planes/2'));
  });

  test('los filtros consultan por estado', async () => {
    montar();
    await screen.findByText('Escuela de Prueba');
    fireEvent.click(screen.getByRole('button', { name: /Por vencer/ }));
    await waitFor(() => expect(axios.get).toHaveBeenCalledWith('/api/super-admin/pruebas', { params: { estado: 'por_vencer' } }));
  });

  test('prórroga por días, por fecha y aplicar plan', async () => {
    montar();
    await screen.findByText('Escuela de Prueba');
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar' }));
    const d = await screen.findByRole('dialog');
    fireEvent.click(within(d).getByRole('button', { name: '+7 días' }));
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/super-admin/schools/8/prueba', { dias: 7 }));
    expect(await within(d).findByText(/Prueba extendida hasta/)).toBeTruthy();

    await waitFor(() => expect(within(d).getByRole('button', { name: '+7 días' })).toBeEnabled());
    fireEvent.change(within(d).getByLabelText('O hasta una fecha'), { target: { value: '2027-01-15' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Aplicar fecha' }));
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/super-admin/schools/8/prueba', { trial_ends_at: '2027-01-15' }));

    await waitFor(() => expect(within(d).getByRole('button', { name: '+7 días' })).toBeEnabled());
    const select = within(d).getByLabelText('Plan del catálogo');
    expect(within(select).queryByText(/Plan Viejo/)).toBeNull();   // inactivo
    expect(within(select).getByText(/Plan Anual/)).toBeDisabled();   // sin monto
    fireEvent.change(select, { target: { value: '1' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Aplicar plan' }));
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/super-admin/schools/8/aplicar-plan', { plan_id: 1 }));
  });

  test('un error de carga se muestra sin romper la página', async () => {
    axios.get.mockRejectedValue({ response: { status: 500, data: { error: 'Servidor caído' } } });
    montar();
    expect((await screen.findAllByText('Servidor caído')).length).toBeGreaterThan(0);
  });
});
