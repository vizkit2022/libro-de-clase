import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { buildCurriculumUrl, LEVEL_GROUP_LABELS, LEVEL_GROUP_COLORS } from '../../utils/curriculumMapping';

export default function SubjectCurriculumPage() {
  const { courseId, courseSubjectId } = useParams();
  const { school } = useAuth();
  const primary = school?.primary_color || '#2563EB';
  const iframeRef = useRef(null);

  const [course, setCourse] = useState(null);
  const [courseSubject, setCourseSubject] = useState(null);
  const [curriculumInfo, setCurriculumInfo] = useState(null);
  const [iframeState, setIframeState] = useState('loading'); // loading | ok | blocked
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    axios.get(`/api/courses/${courseId}`)
      .then(({ data }) => {
        setCourse(data);
        const cs = data.subjects?.find(s => String(s.id) === String(courseSubjectId));
        setCourseSubject(cs);

        if (cs?.subject?.name && data.level) {
          const info = buildCurriculumUrl(cs.subject.name, data.level);
          setCurriculumInfo(info);
        }
      })
      .catch(() => {});
  }, [courseId, courseSubjectId]);

  // Detectar si el iframe fue bloqueado (X-Frame-Options)
  useEffect(() => {
    if (!curriculumInfo) return;
    const timer = setTimeout(() => {
      // Si pasaron 8 segundos y aún está "loading", probablemente está bloqueado
      setIframeState(prev => prev === 'loading' ? 'blocked' : prev);
    }, 8000);
    return () => clearTimeout(timer);
  }, [curriculumInfo]);

  const handleIframeLoad = () => {
    try {
      // Si el iframe cargó correctamente (sin bloqueo), el contentDocument existe
      const doc = iframeRef.current?.contentDocument || iframeRef.current?.contentWindow?.document;
      if (doc && doc.title !== '') {
        setIframeState('ok');
      } else {
        setIframeState('blocked');
      }
    } catch {
      // Error de cross-origin = bloqueado por X-Frame-Options
      setIframeState('blocked');
    }
  };

  const handleIframeError = () => setIframeState('blocked');

  if (!course || !courseSubject) {
    return <div className="loading-container"><div className="spinner" /></div>;
  }

  const subject = courseSubject.subject;
  const teacher = courseSubject.teacher;
  const subjectColor = subject?.color || primary;
  const levelGroup = curriculumInfo?.group;
  const groupColor = levelGroup ? LEVEL_GROUP_COLORS[levelGroup] : primary;
  const groupLabel = levelGroup ? LEVEL_GROUP_LABELS[levelGroup] : '';

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b', marginBottom: 20 }}>
        <Link to="/courses" style={{ color: primary, textDecoration: 'none', fontWeight: 600 }}>Cursos</Link>
        <span>›</span>
        <Link to={`/courses/${courseId}`} style={{ color: primary, textDecoration: 'none', fontWeight: 600 }}>
          {course.name}
        </Link>
        <span>›</span>
        <span style={{ color: '#0f172a', fontWeight: 600 }}>{subject?.name}</span>
      </div>

      {/* Header de la asignatura */}
      <div className="card" style={{
        marginBottom: 20,
        background: `linear-gradient(135deg, ${subjectColor}18, ${subjectColor}08)`,
        border: `1.5px solid ${subjectColor}40`
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
          {/* Ícono color */}
          <div style={{
            width: 60, height: 60, borderRadius: 14,
            background: subjectColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, flexShrink: 0,
            boxShadow: `0 4px 12px ${subjectColor}40`
          }}>
            {getSubjectEmoji(subject?.name)}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                {subject?.name}
              </h1>
              {subject?.code && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 8px',
                  background: subjectColor, color: '#fff', borderRadius: 5
                }}>
                  {subject.code}
                </span>
              )}
            </div>
            <p style={{ color: '#64748b', fontSize: 14, margin: '4px 0' }}>
              📚 {course.name} · {course.level} · {course.year}
            </p>
            {teacher && (
              <p style={{ color: '#64748b', fontSize: 13, margin: '2px 0' }}>
                👨‍🏫 {teacher.first_name} {teacher.last_name}
              </p>
            )}
          </div>

          {/* Metadatos */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{
              background: '#fff', borderRadius: 10, padding: '10px 16px',
              border: '1px solid #e2e8f0', textAlign: 'center'
            }}>
              <p style={{ fontSize: 20, fontWeight: 800, color: subjectColor, margin: 0 }}>
                {courseSubject.hours_per_week}
              </p>
              <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>hrs/sem</p>
            </div>
            {groupLabel && (
              <div style={{
                background: '#fff', borderRadius: 10, padding: '10px 16px',
                border: `1.5px solid ${groupColor}40`, textAlign: 'center'
              }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: groupColor, margin: 0 }}>
                  {groupLabel}
                </p>
                <p style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 0' }}>nivel escolar</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Panel del currículo */}
      {curriculumInfo ? (
        <div>
          {/* Barra de acción */}
          <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', margin: 0 }}>
                  📋 Plan y Programa — Ministerio de Educación de Chile
                </p>
                <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>
                  Objetivos de aprendizaje oficiales para {subject?.name} · {course.level}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 12 }}
                  onClick={() => { setIframeState('loading'); setIframeKey(k => k + 1); }}
                >
                  🔄 Recargar
                </button>
                <a
                  href={curriculumInfo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                  style={{ background: primary, fontSize: 12, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  🌐 Abrir en sitio oficial
                </a>
              </div>
            </div>
          </div>

          {/* Iframe del currículo */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', minHeight: 600 }}>
            {/* Estado: cargando */}
            {iframeState === 'loading' && (
              <div style={{
                position: 'absolute', zIndex: 2,
                width: '100%', padding: '40px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 12, background: '#fff',
                flexDirection: 'column'
              }}>
                <div className="spinner" style={{ borderTopColor: primary }} />
                <p style={{ color: '#64748b', fontSize: 13 }}>Cargando currículo oficial...</p>
              </div>
            )}

            {/* Estado: bloqueado → fallback */}
            {iframeState === 'blocked' && (
              <BlockedFallback
                url={curriculumInfo.url}
                subjectName={subject?.name}
                courseLevel={course.level}
                primary={primary}
                subjectColor={subjectColor}
              />
            )}

            {/* Iframe siempre presente (puede quedar oculto si está bloqueado) */}
            <iframe
              key={iframeKey}
              ref={iframeRef}
              src={curriculumInfo.url}
              onLoad={handleIframeLoad}
              onError={handleIframeError}
              title={`Currículo ${subject?.name} ${course.level}`}
              style={{
                width: '100%',
                height: iframeState === 'blocked' ? 0 : '80vh',
                minHeight: iframeState === 'blocked' ? 0 : 600,
                border: 'none',
                display: 'block',
                opacity: iframeState === 'loading' ? 0 : 1,
                transition: 'opacity 0.3s'
              }}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
          </div>
        </div>
      ) : (
        /* Asignatura no mapeada */
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📖</div>
          <h3 style={{ color: '#0f172a', marginBottom: 8 }}>Currículo no disponible</h3>
          <p style={{ color: '#64748b', maxWidth: 400, margin: '0 auto 20px' }}>
            No se encontró el plan y programa del Ministerio para <strong>{subject?.name}</strong> en el nivel <strong>{course.level}</strong>.
            Puedes buscarlo directamente en el sitio oficial.
          </p>
          <a
            href="https://www.curriculumnacional.cl"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            style={{ background: primary, textDecoration: 'none', display: 'inline-block' }}
          >
            🌐 Ir a Currículum Nacional
          </a>
        </div>
      )}
    </div>
  );
}

// ── Componente fallback cuando el iframe está bloqueado ────────────────────
function BlockedFallback({ url, subjectName, courseLevel, primary, subjectColor }) {
  // OAs de ejemplo según la asignatura y nivel (conocimiento base del sistema)
  const staticOAs = getStaticObjectives(subjectName, courseLevel);

  return (
    <div style={{ padding: '32px 28px' }}>
      {/* Aviso */}
      <div style={{
        background: '#fffbeb', border: '1px solid #fde68a',
        borderRadius: 10, padding: '12px 16px', marginBottom: 24,
        display: 'flex', alignItems: 'flex-start', gap: 10
      }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>ℹ️</span>
        <div>
          <p style={{ fontWeight: 600, color: '#92400e', fontSize: 13, margin: 0 }}>
            El sitio del Ministerio no permite mostrarse dentro de la aplicación
          </p>
          <p style={{ color: '#78350f', fontSize: 12, margin: '4px 0 0' }}>
            Usa el botón "Abrir en sitio oficial" para ver el contenido completo en una nueva pestaña.
          </p>
        </div>
      </div>

      {/* Botón principal */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          padding: '14px 0',
          background: primary,
          color: '#fff',
          borderRadius: 10,
          fontWeight: 700, fontSize: 15,
          textDecoration: 'none',
          marginBottom: 28,
          boxShadow: `0 4px 14px ${primary}40`,
          transition: 'opacity 0.15s'
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        🌐 Ver Plan y Programa oficial en Currículum Nacional
        <span style={{ fontSize: 11, opacity: 0.8 }}>(abre nueva pestaña)</span>
      </a>

      {/* URL visible */}
      <div style={{
        background: '#f8fafc', border: '1px solid #e2e8f0',
        borderRadius: 8, padding: '8px 14px', marginBottom: 28,
        fontSize: 12, color: '#64748b', wordBreak: 'break-all'
      }}>
        🔗 {url}
      </div>

      {/* Objetivos de aprendizaje estáticos (si están disponibles) */}
      {staticOAs && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 4, height: 20, background: subjectColor, borderRadius: 2 }} />
            <h3 style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', margin: 0 }}>
              Objetivos de Aprendizaje — Referencia
            </h3>
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 10,
              background: '#f1f5f9', color: '#64748b', fontWeight: 600
            }}>
              Resumen orientativo
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {staticOAs.map((oa, i) => (
              <div key={i} style={{
                border: '1px solid #e2e8f0', borderRadius: 10,
                padding: '14px 16px',
                borderLeft: `3px solid ${subjectColor}`
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 800, color: subjectColor,
                    background: `${subjectColor}15`,
                    padding: '2px 7px', borderRadius: 5, flexShrink: 0, marginTop: 1
                  }}>
                    OA {oa.num}
                  </span>
                  <p style={{ fontSize: 13, color: '#374151', margin: 0, lineHeight: 1.5 }}>
                    {oa.text}
                  </p>
                </div>
                {oa.axis && (
                  <p style={{ fontSize: 11, color: '#94a3b8', margin: '6px 0 0 0' }}>
                    Eje: {oa.axis}
                  </p>
                )}
              </div>
            ))}
          </div>

          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 16, textAlign: 'center' }}>
            * Resumen orientativo. Para los objetivos completos y actualizados, consulta el{' '}
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: primary }}>
              sitio oficial del Ministerio de Educación
            </a>.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Emoji por asignatura ───────────────────────────────────────────────────
function getSubjectEmoji(name) {
  if (!name) return '📖';
  const lower = name.toLowerCase();
  if (lower.includes('matem')) return '🔢';
  if (lower.includes('lenguaje') || lower.includes('comunicac')) return '📝';
  if (lower.includes('historia') || lower.includes('geograf')) return '🌍';
  if (lower.includes('ciencias')) return '🔬';
  if (lower.includes('ingl')) return '🇬🇧';
  if (lower.includes('fís') || lower.includes('fis') || lower.includes('educación f')) return '⚽';
  if (lower.includes('artes vis')) return '🎨';
  if (lower.includes('música') || lower.includes('musica')) return '🎵';
  if (lower.includes('tecnol')) return '💻';
  if (lower.includes('orient')) return '🧭';
  if (lower.includes('religi')) return '✝️';
  if (lower.includes('filosof')) return '💭';
  return '📚';
}

// ── Objetivos de aprendizaje de referencia ────────────────────────────────
// Resumen orientativo de OAs del currículo chileno 2012/2018
function getStaticObjectives(subjectName, courseLevel) {
  if (!subjectName || !courseLevel) return null;
  const sLow = subjectName.toLowerCase();
  const lLow = courseLevel.toLowerCase();

  // Matemática 5° Básico
  if (sLow.includes('matem') && lLow.includes('5')) {
    return [
      { num: 1,  text: 'Representar y describir números naturales hasta 1.000.000 y fracciones simples.', axis: 'Números y Operaciones' },
      { num: 2,  text: 'Aplicar estrategias de cálculo mental y propiedades de las operaciones para multiplicar y dividir.', axis: 'Números y Operaciones' },
      { num: 3,  text: 'Resolver problemas de suma, resta, multiplicación y división de números naturales.', axis: 'Números y Operaciones' },
      { num: 4,  text: 'Comparar y ordenar fracciones de igual denominador y representarlas en la recta numérica.', axis: 'Números y Operaciones' },
      { num: 7,  text: 'Aplicar el concepto de porcentaje para resolver problemas cotidianos.', axis: 'Números y Operaciones' },
      { num: 14, text: 'Calcular el perímetro y el área de figuras geométricas simples usando cuadrículas y fórmulas.', axis: 'Geometría' },
      { num: 20, text: 'Leer y representar datos en tablas y gráficos de barra y circular.', axis: 'Datos y Probabilidades' },
    ];
  }

  // Matemática 6° Básico
  if (sLow.includes('matem') && lLow.includes('6')) {
    return [
      { num: 1,  text: 'Representar y operar con números enteros positivos y negativos en contextos cotidianos.', axis: 'Números y Operaciones' },
      { num: 2,  text: 'Calcular potencias y raíces cuadradas exactas de números naturales.', axis: 'Números y Operaciones' },
      { num: 3,  text: 'Resolver problemas que involucren fracciones y números decimales.', axis: 'Números y Operaciones' },
      { num: 11, text: 'Identificar y clasificar triángulos y cuadriláteros según sus ángulos y lados.', axis: 'Geometría' },
      { num: 14, text: 'Calcular el volumen de prismas rectangulares usando unidades cúbicas.', axis: 'Geometría' },
      { num: 18, text: 'Calcular la probabilidad de un evento simple.', axis: 'Datos y Probabilidades' },
    ];
  }

  // Lenguaje 5° Básico
  if ((sLow.includes('lenguaje') || sLow.includes('comunicac')) && lLow.includes('5')) {
    return [
      { num: 1,  text: 'Leer textos literarios y no literarios con fluidez y comprensión.', axis: 'Lectura' },
      { num: 2,  text: 'Analizar textos aplicando estrategias de comprensión lectora (inferir, sintetizar, evaluar).', axis: 'Lectura' },
      { num: 3,  text: 'Leer y comprender textos no literarios para obtener información y formarse una opinión.', axis: 'Lectura' },
      { num: 7,  text: 'Escribir textos narrativos, descriptivos, expositivos y argumentativos con coherencia y cohesión.', axis: 'Escritura' },
      { num: 11, text: 'Aplicar estrategias para planificar, revisar y editar sus escritos.', axis: 'Escritura' },
      { num: 18, text: 'Participar en conversaciones y debates respetando turnos y usando un vocabulario variado.', axis: 'Comunicación oral' },
      { num: 22, text: 'Comprender el propósito y los elementos de textos publicitarios y medios de comunicación.', axis: 'Comunicación oral' },
    ];
  }

  // Historia 5° Básico
  if ((sLow.includes('historia') || sLow.includes('geograf')) && lLow.includes('5')) {
    return [
      { num: 1,  text: 'Ubicar temporal y espacialmente las grandes civilizaciones de la Antigüedad (Mesopotamia, Egipto, Grecia, Roma).', axis: 'Historia' },
      { num: 2,  text: 'Explicar la organización política, económica y social de las civilizaciones antiguas y su legado.', axis: 'Historia' },
      { num: 4,  text: 'Identificar características del feudalismo y la vida en la Edad Media.', axis: 'Historia' },
      { num: 7,  text: 'Describir la organización del espacio geográfico americano y sus grandes unidades de relieve.', axis: 'Geografía' },
      { num: 10, text: 'Comprender los procesos de conquista y colonización española en América.', axis: 'Historia' },
    ];
  }

  // Ciencias Naturales 5° Básico
  if (sLow.includes('ciencias') && lLow.includes('5')) {
    return [
      { num: 1,  text: 'Investigar y explicar los sistemas del cuerpo humano (digestivo, circulatorio, respiratorio) y su interacción.', axis: 'Biología' },
      { num: 2,  text: 'Caracterizar los cambios que experimenta el cuerpo durante la pubertad.', axis: 'Biología' },
      { num: 3,  text: 'Explicar el ciclo del agua en la naturaleza y su importancia para los seres vivos.', axis: 'Ciencias de la Tierra' },
      { num: 5,  text: 'Investigar los efectos de la fuerza gravitacional y el movimiento en situaciones cotidianas.', axis: 'Física' },
      { num: 7,  text: 'Identificar propiedades físicas y químicas de la materia mediante experimentos sencillos.', axis: 'Química' },
    ];
  }

  // Inglés 5° Básico
  if (sLow.includes('ingl') && lLow.includes('5')) {
    return [
      { num: 1,  text: 'Escuchar y comprender textos orales sencillos sobre temas conocidos usando estrategias de comprensión.', axis: 'Comprensión auditiva' },
      { num: 3,  text: 'Leer y comprender textos breves con vocabulario familiar y estructuras simples.', axis: 'Lectura' },
      { num: 6,  text: 'Escribir oraciones y párrafos cortos sobre temas cotidianos con vocabulario básico.', axis: 'Escritura' },
      { num: 9,  text: 'Interactuar oralmente en situaciones simples sobre temas del entorno.', axis: 'Comunicación oral' },
    ];
  }

  // Matemática 7° Básico
  if (sLow.includes('matem') && lLow.includes('7')) {
    return [
      { num: 1,  text: 'Representar y operar con números enteros, fracciones y decimales en contextos cotidianos.', axis: 'Números y Operaciones' },
      { num: 3,  text: 'Resolver ecuaciones de primer grado con una incógnita.', axis: 'Álgebra' },
      { num: 6,  text: 'Calcular porcentajes y proporciones en situaciones cotidianas.', axis: 'Números y Operaciones' },
      { num: 11, text: 'Identificar figuras geométricas planas y calcular su área y perímetro.', axis: 'Geometría' },
      { num: 16, text: 'Calcular medidas de tendencia central (media, mediana, moda) de un conjunto de datos.', axis: 'Datos y Probabilidades' },
    ];
  }

  // Matemática 1° Medio
  if (sLow.includes('matem') && (lLow.includes('1° med') || lLow.includes('1 med'))) {
    return [
      { num: 1,  text: 'Representar y operar con números reales, potencias y raíces en contextos algebraicos.', axis: 'Números y Álgebra' },
      { num: 3,  text: 'Resolver sistemas de ecuaciones de primer grado con dos incógnitas.', axis: 'Álgebra' },
      { num: 6,  text: 'Aplicar razones trigonométricas en triángulos rectángulos para resolver problemas.', axis: 'Geometría' },
      { num: 10, text: 'Calcular la probabilidad de eventos simples y compuestos.', axis: 'Datos y Probabilidades' },
      { num: 13, text: 'Interpretar y analizar funciones lineales y cuadráticas en contextos cotidianos.', axis: 'Funciones' },
    ];
  }

  return null; // No hay datos estáticos para esta combinación
}
