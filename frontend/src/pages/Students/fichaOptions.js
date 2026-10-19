// Listas de opciones para la ficha completa del alumno

export const ID_TYPES = ['RUN', 'IPE', 'Pasaporte', 'Otro'];

export const REGIONES_CHILE = [
  'Arica y Parinacota',
  'Tarapacá',
  'Antofagasta',
  'Atacama',
  'Coquimbo',
  'Valparaíso',
  'Metropolitana de Santiago',
  "Libertador General Bernardo O'Higgins",
  'Maule',
  'Ñuble',
  'Biobío',
  'La Araucanía',
  'Los Ríos',
  'Los Lagos',
  'Aysén del General Carlos Ibáñez del Campo',
  'Magallanes y de la Antártica Chilena',
];

export const COMUNAS_RM = [
  'Alhué', 'Buin', 'Calera de Tango', 'Cerrillos', 'Cerro Navia', 'Colina', 'Conchalí', 'Curacaví',
  'El Bosque', 'El Monte', 'Estación Central', 'Huechuraba', 'Independencia', 'Isla de Maipo',
  'La Cisterna', 'La Florida', 'La Granja', 'La Pintana', 'La Reina', 'Lampa', 'Las Condes',
  'Lo Barnechea', 'Lo Espejo', 'Lo Prado', 'Macul', 'Maipú', 'María Pinto', 'Melipilla', 'Ñuñoa',
  'Padre Hurtado', 'Paine', 'Pedro Aguirre Cerda', 'Peñaflor', 'Peñalolén', 'Pirque', 'Providencia',
  'Pudahuel', 'Puente Alto', 'Quilicura', 'Quinta Normal', 'Recoleta', 'Renca', 'San Bernardo',
  'San Joaquín', 'San José de Maipo', 'San Miguel', 'San Pedro', 'San Ramón', 'Santiago', 'Talagante',
  'Tiltil', 'Vitacura',
];

export const NACIONALIDADES = [
  'Chile', 'Argentina', 'Bolivia', 'Brasil', 'Colombia', 'Cuba', 'Ecuador', 'Haití', 'México',
  'Paraguay', 'Perú', 'República Dominicana', 'Uruguay', 'Venezuela', 'España', 'Estados Unidos',
  'China', 'Otro',
];

export const NIVELES_ESTUDIO = [
  'Educación Básica incompleta',
  'Educación Básica',
  'Educación Media incompleta',
  'Educación Media',
  'Técnico',
  'Técnico Profesional',
  'Universitaria incompleta',
  'Universitaria',
  'Postgrado',
];

export const PARENTESCOS = ['Madre', 'Padre', 'Abuelo/a', 'Tío/a', 'Hermano/a', 'Tutor legal', 'Otro'];

export const ESTADOS_CIVILES = ['Soltero/a', 'Casado/a', 'Conviviente civil', 'Divorciado/a', 'Separado/a', 'Viudo/a'];

export const SEXOS = ['Femenino', 'Masculino'];
export const GENEROS = ['Femenino', 'Masculino', 'Otro'];

export const VIVE_CON = ['Padre/Madre', 'Madre', 'Padre', 'Abuelos', 'Otro familiar', 'Tutor', 'Otro'];

export const TIPOS_ADMISION = [
  { value: 'nuevo', label: 'Alumno nuevo' },
  { value: 'antiguo', label: 'Alumno antiguo' },
];

export const ESTADOS_MATRICULA = [
  { value: 'matriculado', label: 'Matriculado' },
  { value: 'prematriculado', label: 'Prematriculado' },
  { value: 'retirado', label: 'Retirado' },
  { value: 'egresado', label: 'Egresado' },
];

export const PRIORIDAD = ['Prioritario', 'Preferente', 'Ninguno'];

export const GRUPOS_SANGUINEOS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'No sabe'];

export const PREVISIONES = ['Fonasa A', 'Fonasa B', 'Fonasa C', 'Fonasa D', 'Fonasa', 'Isapre', 'Capredena', 'Dipreca', 'Particular', 'Sin previsión'];

export const CATEGORIAS_DOCUMENTO = [
  'Certificado de nacimiento',
  'Informe de notas',
  'Informe médico',
  'Informe psicológico/PIE',
  'Certificado de alumno regular',
  'Documento de identidad',
  'Autorización firmada',
  'Otro',
];

export const DOC_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'heic'];
export const DOC_MAX_BYTES = 10 * 1024 * 1024;

export const AUTH_STATUSES = [
  { value: 'pendiente', label: 'Pendiente', bg: '#fef3c7', color: '#92400e', icon: '⏳' },
  { value: 'autorizado', label: 'Autorizado', bg: '#dcfce7', color: '#166534', icon: '✓' },
  { value: 'rechazado', label: 'Rechazado', bg: '#fee2e2', color: '#991b1b', icon: '✕' },
];

export const STATUS_CHIP = {
  matriculado: { label: 'Matriculado', color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
  prematriculado: { label: 'Prematriculado', color: '#b45309', bg: '#fffbeb', border: '#fcd34d' },
  retirado: { label: 'Retirado', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
  egresado: { label: 'Egresado', color: '#475569', bg: '#f8fafc', border: '#cbd5e1' },
};

export const FICHA_SECTIONS = [
  { key: 'personal', icon: '🪪', label: 'Datos Personales' },
  { key: 'familia', icon: '🏡', label: 'Apoderados y Hogar' },
  { key: 'medico', icon: '🩺', label: 'Antecedentes Médicos' },
  { key: 'permisos', icon: '✅', label: 'Permisos' },
  { key: 'archivos', icon: '📁', label: 'Archivos y Documentos' },
];
