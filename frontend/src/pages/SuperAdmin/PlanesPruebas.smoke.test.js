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

describe('Tramos de precio', () => {
  const TRAMOS = [
    { id: 10, nombre: '1 a 3 usuarios', monto: null, monto_uf: 0.7, usuarios_min: 1, usuarios_max: 3, frecuencia: 'mensual', dias_prueba: 30, activo: true, predeterminado: true },
    { id: 11, nombre: '4 a 10 usuarios', monto: null, monto_uf: 1.3, usuarios_min: 4, usuarios_max: 10, frecuencia: 'mensual', dias_prueba: 30, activo: true, predeterminado: false },
  ];

  beforeEach(() => {
    axios.get.mockImplementation((url) => {
      if (url.endsWith('/planes')) return Promise.resolve({ data: TRAMOS });
      if (url === '/api/uf') return Promise.resolve({ data: { valor: 40000 } });
      return Promise.resolve({ data: PRUEBAS });
    });
    axios.put.mockResolvedValue({ data: {} });
  });

  test('muestra pesos y UF por usuario, y guarda la escala completa', async () => {
    montar();
    const uf = await screen.findByLabelText('UF al mes, tramo 2');
    expect(await screen.findByText('$52.000')).toBeTruthy();
    expect(screen.getByText('0,13')).toBeTruthy();
    expect(screen.getByText('Más de 10')).toBeTruthy();

    fireEvent.change(uf, { target: { value: '1.5' } });
    fireEvent.change(screen.getByLabelText('Usuarios hasta, tramo 1'), { target: { value: '5' } });
    expect(within(screen.getAllByRole('row')[2]).getByText('6')).toBeTruthy();   // el siguiente parte donde termina este
    fireEvent.click(screen.getByRole('button', { name: 'Guardar tramos' }));
    await waitFor(() => expect(axios.put).toHaveBeenCalledWith('/api/super-admin/tramos', {
      dias_prueba: 30,
      tramos: [{ id: 10, usuarios_hasta: 5, monto_uf: 0.7 }, { id: 11, usuarios_hasta: 10, monto_uf: 1.5 }],
    }));
  });

  test('no guarda un tramo sin valor', async () => {
    montar();
    const uf = await screen.findByLabelText('UF al mes, tramo 2');
    fireEvent.change(uf, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar tramos' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(axios.put).not.toHaveBeenCalled();
  });
});

describe('Ajuste mensual', () => {
  const AJUSTES = {
    automatico: false, dias_aviso: 10, mp_configurado: true, correo_configurado: true,
    previsto: [{ school_id: 1, colegio: 'Colegio Previsto', usuarios: 4, monto_actual: 28000, monto_nuevo: 52000, tramo: '4 a 10 usuarios' }],
    ajustes: [{ id: 9, school_id: 2, colegio: 'Colegio Avisado', estado: 'avisado', usuarios: 12, monto_anterior: 52000, monto_nuevo: 100000, aplicar_desde: '2026-11-15' }],
  };

  beforeEach(() => {
    axios.get.mockImplementation((url) => {
      if (url === '/api/super-admin/ajustes') return Promise.resolve({ data: AJUSTES });
      if (url.endsWith('/planes')) return Promise.resolve({ data: PLANES });
      return Promise.resolve({ data: PRUEBAS });
    });
    axios.post.mockResolvedValue({ data: { detenido: null, revisados: 2, avisados: 1, aplicados: 0, revision: 0, errores: [] } });
  });

  test('muestra lo previsto y pide confirmar antes de revisar', async () => {
    montar();
    expect(await screen.findByText('Colegio Previsto')).toBeTruthy();
    expect(screen.getByText('Colegio Avisado')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar ahora' }));
    expect(axios.post).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Revisar' }));
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/super-admin/ajustes/revisar'));
  });

  test('sin Mercado Pago no se puede revisar', async () => {
    axios.get.mockImplementation((url) => Promise.resolve({
      data: url === '/api/super-admin/ajustes' ? { ...AJUSTES, mp_configurado: false } : (url.endsWith('/planes') ? PLANES : PRUEBAS),
    }));
    montar();
    expect(await screen.findByText('Falta configurar Mercado Pago.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Revisar ahora' })).toBeDisabled();
  });
});
