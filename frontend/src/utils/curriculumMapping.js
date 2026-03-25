/**
 * Mapeo de asignaturas y niveles al currículo del Ministerio de Educación de Chile
 * Sitio oficial: https://www.curriculumnacional.cl
 */

// ── Slugs de asignaturas ────────────────────────────────────────────────────
// Mapea fragmentos del nombre de asignatura → slug en la URL del Ministerio
const SUBJECT_SLUG_MAP = [
  { keywords: ['lenguaje', 'comunicaci'],   slug: 'lenguaje-y-comunicacion',           label: 'Lenguaje y Comunicación' },
  { keywords: ['matem'],                     slug: 'matematica',                         label: 'Matemática' },
  { keywords: ['historia', 'geograf', 'social'], slug: 'historia-geografia-y-cs-sociales', label: 'Historia, Geografía y Cs. Sociales' },
  { keywords: ['ciencias nat', 'ciencia nat', 'biolog', 'física', 'quím'], slug: 'ciencias-naturales', label: 'Ciencias Naturales' },
  { keywords: ['ingl'],                      slug: 'ingles',                             label: 'Inglés' },
  { keywords: ['educ. fís', 'ed. fís', 'educación fís', 'educacion fis', 'física y salud', 'fis y salud', 'ef '], slug: 'educacion-fisica-y-salud', label: 'Educación Física y Salud' },
  { keywords: ['artes vis', 'arte vis'],     slug: 'artes-visuales',                    label: 'Artes Visuales' },
  { keywords: ['música', 'musica'],          slug: 'musica',                             label: 'Música' },
  { keywords: ['tecnol'],                    slug: 'tecnologia',                         label: 'Tecnología' },
  { keywords: ['orientac'],                  slug: 'orientacion',                        label: 'Orientación' },
  { keywords: ['religi'],                    slug: 'religion',                           label: 'Religión' },
  { keywords: ['filosof'],                   slug: 'filosofia',                          label: 'Filosofía' },
  { keywords: ['emprendim'],                 slug: 'economia-y-emprendimiento',          label: 'Economía y Emprendimiento' },
  { keywords: ['ciudadan'],                  slug: 'educacion-ciudadana',                label: 'Educación Ciudadana' },
  { keywords: ['artes esc', 'teatro'],       slug: 'artes-escenicas',                   label: 'Artes Escénicas' },
];

// ── Niveles de curso → segmento URL ────────────────────────────────────────
// Mapea el campo "level" del curso a los segmentos de la URL del Ministerio
const LEVEL_MAP = [
  // Básica
  { patterns: ['1° bás', '1 bás', 'primero bás', '1er bás', '1°b'], group: '1o-6o-basico',  grade: '1-basico'  },
  { patterns: ['2° bás', '2 bás', 'segundo bás', '2°b'],             group: '1o-6o-basico',  grade: '2-basico'  },
  { patterns: ['3° bás', '3 bás', 'tercero bás', '3°b'],             group: '1o-6o-basico',  grade: '3-basico'  },
  { patterns: ['4° bás', '4 bás', 'cuarto bás', '4°b'],              group: '1o-6o-basico',  grade: '4-basico'  },
  { patterns: ['5° bás', '5 bás', 'quinto bás', '5°b'],              group: '1o-6o-basico',  grade: '5-basico'  },
  { patterns: ['6° bás', '6 bás', 'sexto bás', '6°b'],               group: '1o-6o-basico',  grade: '6-basico'  },
  { patterns: ['7° bás', '7 bás', 'séptimo bás', '7°b'],             group: '7o-8o-basico',  grade: '7-basico'  },
  { patterns: ['8° bás', '8 bás', 'octavo bás', '8°b'],              group: '7o-8o-basico',  grade: '8-basico'  },
  // Media
  { patterns: ['1° med', '1 med', 'primero med', '1°m'],             group: '1o-4o-medio',   grade: '1-medio'   },
  { patterns: ['2° med', '2 med', 'segundo med', '2°m'],             group: '1o-4o-medio',   grade: '2-medio'   },
  { patterns: ['3° med', '3 med', 'tercero med', '3°m'],             group: '1o-4o-medio',   grade: '3-medio'   },
  { patterns: ['4° med', '4 med', 'cuarto med', '4°m'],              group: '1o-4o-medio',   grade: '4-medio'   },
];

/**
 * Obtiene el slug del currículo para una asignatura por su nombre.
 * @param {string} subjectName - Nombre de la asignatura (ej: "Matemática", "Lenguaje y Comunicación")
 * @returns {{ slug: string, label: string } | null}
 */
export function getSubjectSlug(subjectName) {
  if (!subjectName) return null;
  const lower = subjectName.toLowerCase();
  for (const entry of SUBJECT_SLUG_MAP) {
    if (entry.keywords.some(kw => lower.includes(kw.toLowerCase()))) {
      return { slug: entry.slug, label: entry.label };
    }
  }
  return null;
}

/**
 * Obtiene el segmento de nivel para un curso por su level.
 * @param {string} courseLevel - Ej: "5° Básico", "2° Medio"
 * @returns {{ group: string, grade: string } | null}
 */
export function getCourseLevel(courseLevel) {
  if (!courseLevel) return null;
  const lower = courseLevel.toLowerCase();
  for (const entry of LEVEL_MAP) {
    if (entry.patterns.some(p => lower.includes(p.toLowerCase()))) {
      return { group: entry.group, grade: entry.grade };
    }
  }
  return null;
}

/**
 * Construye la URL completa del currículo para una asignatura en un nivel de curso.
 * @param {string} subjectName - Nombre de la asignatura
 * @param {string} courseLevel - Nivel del curso (ej: "5° Básico")
 * @returns {{ url: string, subjectLabel: string, gradeLabel: string } | null}
 */
export function buildCurriculumUrl(subjectName, courseLevel) {
  const subject = getSubjectSlug(subjectName);
  const level = getCourseLevel(courseLevel);
  if (!subject || !level) return null;

  return {
    url: `https://www.curriculumnacional.cl/curriculum/${level.group}/${subject.slug}/${level.grade}`,
    subjectLabel: subject.label,
    gradeLabel: courseLevel,
    group: level.group,
    grade: level.grade,
    slug: subject.slug,
  };
}

/**
 * Devuelve la URL base de la sección de una asignatura (todos los cursos).
 */
export function buildSubjectIndexUrl(subjectName) {
  const subject = getSubjectSlug(subjectName);
  if (!subject) return null;
  // El grupo depende del nivel, sin nivel usamos el índice general
  return `https://www.curriculumnacional.cl/curriculo/Bases-Curriculares/`;
}

// Etiquetas legibles para grupos de niveles
export const LEVEL_GROUP_LABELS = {
  '1o-6o-basico': '1° a 6° Básico',
  '7o-8o-basico': '7° y 8° Básico',
  '1o-4o-medio':  '1° a 4° Medio',
};

// Colores por grupo de nivel (para UI)
export const LEVEL_GROUP_COLORS = {
  '1o-6o-basico': '#3b82f6',
  '7o-8o-basico': '#8b5cf6',
  '1o-4o-medio':  '#f59e0b',
};
