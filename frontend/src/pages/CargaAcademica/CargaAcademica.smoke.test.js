/**
 * Humo: monta las pantallas de Carga Académica contra respuestas falsas de la
 * API y falla si el render lanza.
 *
 * Existe porque un `npm run build` que compila no garantiza que la página
 * cargue: una constante que falta compila igual y revienta recién al
 * renderizar, dejando la pantalla en blanco.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import axios from 'axios';

import CargaDocenteDetail from './CargaDocenteDetail';
import CargaAcademicaDashboard from './CargaAcademicaDashboard';
import { AuthContext } from '../../context/AuthContext';

jest.mock('axios');

const DOCENTE = {
  id: 8, year: 2027, nombre: 'Daniela Villanueva', departamento: 'Lenguaje',
  nivel: 'Media', horas_contrato: 44, horas_pedagogicas: 38,
  recreo_min: 180, no_lectivas_min: 750, lectivas_cronologicas_min: 1710,
  no_lectivas: [{ actividad: 'Consejo de profesores', minutos: 60 }],
  adicionales: [{ etiqueta: 'Recreo', valor: '20 min' }],
  total_actividades_min: 60, permanencia_min: 690, total_lectivas: 38,
  diferencia: 0, disponibilidad: 0, completo: true,
  excede_disponibilidad: false, excede_no_lectivas: false,
  asignaciones: [
    { id: 1, tipo: 'asignatura', demanda_id: 7, asignatura: 'Lengua y Literatura',
      nivel: 'III Medio', letras: 'A,C', cursos_texto: 'III Medio A, C', horas: 6 },
    { id: 2, tipo: 'disponibilidad', demanda_id: null, asignatura: '',
      asignatura_libre: 'Disponibilidad', letras: null, cursos_texto: '', horas: 2 },
  ],
};

const DEMANDA = [{
  id: 7, asignatura: 'Lengua y Literatura', nivel: 'III Medio', departamento: 'Lenguaje',
  por_letra: true, letras: 'A,B,C', n_letras: 3, horas_por_grupo: 3,
  horas_totales: 9, subject_id: 4, en_catalogo: true, year: 2027,
}];

const COBERTURA = [{
  id: 7, asignatura: 'Lengua y Literatura', nivel: 'III Medio', departamento: 'Lenguaje',
  por_letra: true, letras_demanda: ['A', 'B', 'C'], horas_por_grupo: 3,
  horas_totales: 9, horas_asignadas: 9, horas_faltantes: 0, estado: 'completa',
  asignados: [
    { asignacion_id: 1, docente_id: 8, docente: 'Daniela Villanueva', letras: 'A,C', horas: 6 },
    { asignacion_id: 5, docente_id: 9, docente: 'Daniela Carreño', letras: 'B', horas: 3 },
  ],
  por_letra_detalle: {
    A: [{ docente_id: 8, docente: 'Daniela Villanueva', horas: 3 }],
    B: [{ docente_id: 9, docente: 'Daniela Carreño', horas: 3 }],
    C: [{ docente_id: 8, docente: 'Daniela Villanueva', horas: 3 }],
  },
  letras_libres: [], letras_en_conflicto: [],
}];

const CATALOGOS = {
  niveles: ['7° Básico', 'III Medio'], tipos: ['asignatura'], max_disponibilidad: 3,
  actividades_default: [], tabla_legal: [{ jornada: 44, horas_pedagogicas: 38 }],
};

const DASHBOARD = {
  year: 2027,
  resumen: { total_demanda: 144, total_asignado: 144, total_faltante: 0,
    cobertura_pct: 100, docentes_total: 6, docentes_completos: 6 },
  por_asignatura: [{ asignatura: 'Lengua y Literatura', departamento: 'Lenguaje',
    horas_demanda: 90, horas_asignadas: 90, horas_faltantes: 0, cobertura_pct: 100 }],
  detalle_demanda: [{ ...DEMANDA[0], horas_asignadas: 9, horas_faltantes: 0,
    cobertura_pct: 100, estado: 'completa' }],
  docentes: [{ ...DOCENTE, asignaciones: undefined }],
  alertas: [{ tipo: 'disponibilidad', docente: 'Francisca Chávez', mensaje: '6 h de disponibilidad' }],
};

const PROCESOS = {
  procesos: [
    { year: 2027, docentes: 6, docentes_completos: 6, filas_demanda: 15,
      filas_asignacion: 39, total_demanda: 144, total_asignado: 144,
      cobertura_pct: 100, en_blanco: false, cerrado: true },
    { year: 2026, docentes: 6, docentes_completos: 6, filas_demanda: 15,
      filas_asignacion: 39, total_demanda: 144, total_asignado: 144,
      cobertura_pct: 100, en_blanco: false, cerrado: true },
  ],
  sugerido: 2028,
};

const ACTIVIDADES_NL = [{ id: 1, nombre: 'Consejo de profesores', minutos_default: 60,
  ambito: 'no_lectiva', tipo: null }];
const ACTIVIDADES_L = [{ id: 6, nombre: 'Disponibilidad', minutos_default: 60,
  ambito: 'lectiva', tipo: 'disponibilidad' }];

const REFERENCIA = {
  year_origen: 2026, encontrado: true, horas_contrato: 44, horas_pedagogicas: 38,
  total_lectivas: 38, disponibilidad: 0, cambio_jornada: false,
  asignaciones: [{ id: 99, tipo: 'asignatura', asignatura: 'Lengua y Literatura',
    cursos_texto: 'III Medio A, C', horas: 6 }],
};

const HORARIO = {
  docente: { id: 8, nombre: 'Daniela Villanueva', year: 2027,
    horas_contrato: 44, horas_pedagogicas: 38 },
  dias: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
  bloques: [
    { id: 1, orden: 0, etiqueta: '0', inicio: '08:00', fin: '08:10', tipo: 'contacto' },
    { id: 2, orden: 1, etiqueta: '1', inicio: '08:10', fin: '08:55', tipo: 'clase' },
    { id: 3, orden: 2, etiqueta: '', inicio: '09:40', fin: '10:00', tipo: 'recreo' },
  ],
  celdas: [{ id: 1, docente_id: 8, bloque_id: 2, dia: 0, asignacion_id: 1,
    letra: 'A', etiqueta_libre: null, texto: 'Lengua y Literatura III Medio A',
    tipo: 'asignatura' }],
  asignaciones: DOCENTE.asignaciones,
  bloques_puestos: 1, bloques_faltantes: 37,
};

function responder(url) {
  if (url.includes('/horario')) return HORARIO;
  if (url.includes('/referencia')) return REFERENCIA;
  if (url.includes('/actividades?ambito=lectiva')) return ACTIVIDADES_L;
  if (url.includes('/actividades')) return ACTIVIDADES_NL;
  if (url.includes('/docentes/')) return DOCENTE;
  if (url.includes('/demanda/cobertura')) return COBERTURA;
  if (url.includes('/demanda')) return DEMANDA;
  if (url.includes('/catalogos')) return CATALOGOS;
  if (url.includes('/asignaturas')) return [{ id: 4, name: 'Lengua y Literatura' }];
  if (url.includes('/dashboard')) return DASHBOARD;
  if (url.includes('/procesos')) return PROCESOS;
  return {};
}

const AUTH = {
  user: { id: 1, role: 'admin', first_name: 'A', last_name: 'B' },
  school: { id: 2, name: 'Colegio Alberto Pérez', primary_color: '#2563EB' },
  loading: false, login: jest.fn(), logout: jest.fn(),
};

function envolver(ui, ruta, patron) {
  return render(
    <AuthContext.Provider value={AUTH}>
      <MemoryRouter initialEntries={[ruta]}>
        <Routes><Route path={patron} element={ui} /></Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('Carga Académica monta sin lanzar', () => {
  let errores;

  beforeEach(() => {
    axios.get.mockImplementation(url => Promise.resolve({ data: responder(url) }));
    axios.put.mockResolvedValue({ data: {} });
    axios.post.mockResolvedValue({ data: {} });
    axios.delete.mockResolvedValue({ data: {} });
    errores = [];
    jest.spyOn(console, 'error').mockImplementation((...a) => errores.push(a.join(' ')));
  });

  afterEach(() => { jest.restoreAllMocks(); });

  test('la ficha del docente renderiza sus datos', async () => {
    envolver(<CargaDocenteDetail />, '/carga-academica/docentes/8',
      '/carga-academica/docentes/:id');

    expect(await screen.findByText('Daniela Villanueva')).toBeTruthy();
    // Horas pedagógicas derivadas de la Tabla Legal (aparecen en varios lugares)
    expect((await screen.findAllByText('38')).length).toBeGreaterThan(0);
    // Las horas no lectivas se muestran como h:mm
    expect((await screen.findAllByText('12:30')).length).toBeGreaterThan(0);
    // Línea libre del pie
    await waitFor(() => expect(screen.getByDisplayValue('20 min')).toBeTruthy());
    expect(errores.filter(e => /not defined|is not a function|Cannot read/.test(e))).toEqual([]);
  });

  test('la ficha carga aunque falle el endpoint de cobertura', async () => {
    // Pasa durante un deploy a medias: frontend nuevo contra backend viejo.
    // La cobertura es información de apoyo y no debe tumbar la pantalla.
    axios.get.mockImplementation(url => (
      url.includes('/demanda/cobertura')
        ? Promise.reject(new Error('404'))
        : Promise.resolve({ data: responder(url) })
    ));

    envolver(<CargaDocenteDetail />, '/carga-academica/docentes/8',
      '/carga-academica/docentes/:id');

    expect(await screen.findByText('Daniela Villanueva')).toBeTruthy();
    expect(errores.filter(e => /not defined|is not a function|Cannot read/.test(e))).toEqual([]);
  });

  test('el dashboard renderiza el selector de años', async () => {
    envolver(<CargaAcademicaDashboard />, '/carga-academica', '/carga-academica');

    expect(await screen.findByText('2026')).toBeTruthy();
    expect(await screen.findByText('2027')).toBeTruthy();
    expect(errores.filter(e => /not defined|is not a function|Cannot read/.test(e))).toEqual([]);
  });
});
