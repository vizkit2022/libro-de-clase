import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { calcAge, fmtDate } from './fichaShared';
import { FICHA_SECTIONS, STATUS_CHIP } from './fichaOptions';
import PersonalSection from './sections/PersonalSection';
import FamilySection from './sections/FamilySection';
import MedicalSection from './sections/MedicalSection';
import PermissionsSection from './sections/PermissionsSection';
import DocumentsSection from './sections/DocumentsSection';
import FichaPrintView from './FichaPrintView';
import HistorialTimeline from '../../components/UI/HistorialTimeline';
import descargarArchivo from '../CargaAcademica/descargar';
import { useUserPhoto } from '../../components/UserAvatar/UserAvatar';
import './StudentFichaPage.css';

// Variables CSS derivadas del color primario del colegio
function themeVars(primary) {
  const hex = /^#[0-9a-f]{6}$/i.test(primary || '') ? primary : '#2563EB';
  return {
    '--fp': hex,
    '--fp-soft': `${hex}22`,
    '--fp-tint': `${hex}0f`,
    '--fp-ring': `${hex}33`,
  };
}

function Silhouette() {
  return (
    <svg viewBox="0 0 200 200" className="fs-silhouette" aria-hidden="true">
      <rect width="200" height="200" fill="#b9b6e8" />
      <ellipse cx="100" cy="84" rx="40" ry="50" fill="#dcdaf7" />
      <path d="M22 200c4-44 36-68 78-68s74 24 78 68z" fill="#dcdaf7" />
    </svg>
  );
}

// La foto se descarga una sola vez a nivel de página (useUserPhoto: axios + Bearer → blob URL,
// revocada al desmontar). Sin foto, 404 o error → silueta.
function StudentPhoto({ student, photoUrl, className }) {
  const [err, setErr] = useState(false);
  useEffect(() => { setErr(false); }, [photoUrl]);
  if (photoUrl && !err) {
    return (
      <img className={className} src={photoUrl}
        alt={`Foto de ${student.first_name} ${student.last_name}`} onError={() => setErr(true)} />
    );
  }
  return <div className={className}><Silhouette /></div>;
}

// Símbolo de sexo tolerante a valores importados ('F', 'M', 'Mujer', 'Hombre', …)
function sexSymbol(gender) {
  const g = String(gender || '').trim().toLowerCase();
  if (!g) return '';
  if (g.startsWith('f') || g.startsWith('mujer')) return '♀';
  if (g.startsWith('m') || g.startsWith('h') || g.startsWith('var')) return '♂';
  return '';
}

const STATUS_ICON = { matriculado: '✓', prematriculado: '⏳', retirado: '✕', egresado: '🎓' };

// Datos derivados del encabezado (compartidos con la vista imprimible)
function headerInfo(ficha) {
  const { student = {}, summary = {}, profile = {}, family = [] } = ficha;
  const age = summary.age ?? calcAge(student.birth_date);
  const status = profile.status || summary.status || 'matriculado';
  // Apoderado titular: se toma de la familia cargada (refleja ediciones recientes) y,
  // si no está, del resumen del backend.
  const titular = family.find(m => m.guardian_role === 'titular');
  const guardian = titular
    ? {
      name: titular.full_name || `${titular.first_name || ''} ${titular.last_name || ''}`.trim(),
      rut: titular.rut,
      phone: titular.phone || titular.work_phone,
    }
    : summary.guardian || null;
  return { age, status, guardian, sexIcon: sexSymbol(student.gender), average: summary.average };
}

function HeaderItem({ icon, label, value }) {
  return (
    <div className="fh-item">
      <span className="fh-item-icon" aria-hidden="true">{icon}</span>
      <div>
        <span className="fh-item-label">{label}</span>
        <span className="fh-item-value">{value || '—'}</span>
      </div>
    </div>
  );
}

function FichaHeader({ ficha, photoUrl }) {
  const { student, summary = {}, profile = {} } = ficha;
  const { age, status, guardian, sexIcon, average: avg } = headerInfo(ficha);
  const chip = STATUS_CHIP[status] || STATUS_CHIP.matriculado;
  const avgColor = avg == null ? '#94a3b8' : avg >= 6 ? '#16a34a' : avg >= 5 ? '#2563eb' : avg >= 4 ? '#d97706' : '#dc2626';
  return (
    <div className="fh">
      <StudentPhoto student={student} photoUrl={photoUrl} className="fh-mini-photo" />
      <div className="fh-main">
        <h1 className="fh-name"><strong>{student.first_name}</strong> {student.last_name}</h1>
        {profile.social_name && <p className="fh-social">Nombre social: {profile.social_name}</p>}
        <div className="fh-badges">
          {summary.course_name && <span className="fb">{summary.course_name}</span>}
          {(age != null || student.birth_date) && (
            <span className="fb">
              {sexIcon && <span aria-label={student.gender}>{sexIcon} </span>}
              {age != null ? `${age} años` : ''}{student.birth_date ? ` (${fmtDate(student.birth_date)})` : ''}
            </span>
          )}
          <span className="fb fb-status" style={{ color: chip.color, background: chip.bg, borderColor: chip.border }}>{STATUS_ICON[status] || '✓'} {chip.label}</span>
        </div>
        <div className="fh-data">
          <HeaderItem icon="🪪" label={profile.id_type && profile.id_type !== 'RUN' ? profile.id_type : 'RUN'} value={student.rut} />
          <HeaderItem icon="📍" label="Dirección" value={student.address} />
          <HeaderItem icon="🪪" label="RUN Apoderado" value={guardian?.rut} />
          <HeaderItem icon="📞" label="Fono Apoderado" value={guardian?.phone} />
        </div>
      </div>
      <div className="fh-avg">
        <span className="fh-avg-icon" aria-hidden="true">🎓</span>
        <span className="fh-avg-label">Prom. Notas</span>
        <span className="fh-avg-value" style={{ color: avgColor }}>
          {avg == null ? '—' : Number(avg).toFixed(1)}
        </span>
      </div>
    </div>
  );
}

// Historial y ficha oficial en PDF: solo para el personal del colegio
const ROLES_STAFF = ['admin', 'directivo', 'profesor'];
const HISTORIAL_SECTION = { key: 'historial', icon: '🕘', label: 'Historial' };

function DownloadMenu({ sectionLabel, onPrint, onPdf, pdfYear }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const pick = (scope) => { setOpen(false); onPrint(scope); };
  return (
    <div className="fdl" ref={ref}>
      <button type="button" className="fdl-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        ⬇️ Descargar <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="fdl-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => pick('all')}>
            <strong>📄 Ficha completa</strong>
            <small>PDF / imprimir · las 5 secciones</small>
          </button>
          {sectionLabel && (
            <button type="button" role="menuitem" onClick={() => pick('section')}>
              <strong>📑 Sección actual</strong>
              <small>{sectionLabel}</small>
            </button>
          )}
          {onPdf && (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onPdf(); }}>
              <strong>🏫 Ficha de matrícula oficial (PDF)</strong>
              <small>Formato del colegio · año {pdfYear}</small>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ErrorScreen({ icon, title, text, primary, children }) {
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="illustration-area">
        <div className="illustration">{icon}</div>
        <h3>{title}</h3>
        <p>{text}</p>
        <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
          {children}
          <Link to="/" className="btn btn-secondary" style={{ color: primary }}>Ir al inicio</Link>
        </div>
      </div>
    </div>
  );
}

export default function StudentFichaPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { school, user, anio } = useAuth();
  const esStaff = ROLES_STAFF.includes(user?.role);
  const pdfYear = anio || new Date().getFullYear();
  const sections = esStaff ? [...FICHA_SECTIONS, HISTORIAL_SECTION] : FICHA_SECTIONS;
  const primary = school?.primary_color || '#2563EB';

  const [ficha, setFicha] = useState(null);
  const [error, setError] = useState(null); // 403 | 404 | 'other'
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const section = sections.some(s => s.key === searchParams.get('s')) ? searchParams.get('s') : 'personal';
  // El historial no tiene vista imprimible: ahí no se ofrece "Sección actual"
  const sectionLabel = section === 'historial' ? ''
    : (FICHA_SECTIONS.find(s => s.key === section) || {}).label || '';
  // Alcance de la vista imprimible: 'all' por defecto (Ctrl+P imprime la ficha completa)
  const [printScope, setPrintScope] = useState('all');
  const [printRequest, setPrintRequest] = useState(0);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), type === 'error' ? 5000 : 3500);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`/api/students/${id}/ficha`);
      setFicha({
        ...data,
        profile: data.profile || {},
        medical: data.medical || {},
        family: data.family || [],
        authorizations: data.authorizations || [],
        documents: data.documents || [],
        summary: data.summary || {},
        permissions: data.permissions || { can_edit: false },
      });
      setError(null);
    } catch (err) {
      const st = err?.response?.status;
      setError(st === 403 ? 403 : st === 404 ? 404 : 'other');
    }
  }, [id]);

  useEffect(() => {
    setFicha(null);
    setError(null);
    load();
  }, [load]);

  const studentUserId = ficha?.student?.id;
  const { url: photoUrl } = useUserPhoto(studentUserId, !!(studentUserId && ficha?.student?.has_photo));

  // Mientras la ficha está montada, la impresión muestra solo la vista imprimible
  useEffect(() => {
    document.body.classList.add('ficha-printing');
    const reset = () => setPrintScope('all');
    window.addEventListener('afterprint', reset);
    return () => {
      document.body.classList.remove('ficha-printing');
      window.removeEventListener('afterprint', reset);
    };
  }, []);

  // Tras renderizar el alcance pedido se abre el diálogo de impresión
  useEffect(() => {
    if (!printRequest) return undefined;
    const t = setTimeout(() => window.print(), 150);
    return () => clearTimeout(t);
  }, [printRequest]);

  const requestPrint = (scope) => {
    setPrintScope(scope === 'section' ? section : 'all');
    setPrintRequest(n => n + 1);
  };

  const downloadPdf = async () => {
    const apellido = String(ficha?.student?.last_name || 'alumno').split(' ')[0];
    const curso = String(ficha?.summary?.course_name || '').replace(/[^\w]+/g, '');
    showToast('Generando la ficha de matrícula…', 'info');
    try {
      await descargarArchivo(`/api/matricula/alumnos/${id}/ficha.pdf?year=${pdfYear}`,
        `ficha_matricula_${curso}_${apellido}.pdf`);
      setToast(null);
    } catch (e) {
      showToast(e.message || 'No se pudo descargar la ficha de matrícula', 'error');
    }
  };

  const applyFicha = useCallback((data) => setFicha(f => ({ ...f, ...data })), []);
  const applyMedical = useCallback((medical) => setFicha(f => ({ ...f, medical: medical || {} })), []);

  const goSection = (key) => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      p.set('s', key);
      return p;
    }, { replace: true });
  };

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(`/students/${id}/life`);
  };

  const style = themeVars(primary);

  if (error === 403) {
    return (
      <div style={style}>
        <ErrorScreen icon="🔒" title="No tienes acceso a esta ficha" primary={primary}
          text={user?.role === 'apoderado'
            ? 'Solo puedes ver la ficha de los alumnos vinculados a tu cuenta de apoderado.'
            : 'Tu perfil no tiene permiso para ver la ficha de este alumno.'}>
          <button type="button" className="btn btn-secondary" onClick={goBack}>← Volver</button>
        </ErrorScreen>
      </div>
    );
  }
  if (error === 404) {
    return (
      <div style={style}>
        <ErrorScreen icon="🔎" title="Alumno no encontrado" primary={primary}
          text="El alumno no existe o no pertenece a tu colegio.">
          <button type="button" className="btn btn-secondary" onClick={goBack}>← Volver</button>
        </ErrorScreen>
      </div>
    );
  }
  if (error === 'other') {
    return (
      <div style={style}>
        <ErrorScreen icon="⚠️" title="No se pudo cargar la ficha" primary={primary}
          text="Revisa tu conexión e inténtalo nuevamente.">
          <button type="button" className="btn btn-primary" style={{ background: primary }} onClick={() => { setError(null); load(); }}>Reintentar</button>
        </ErrorScreen>
      </div>
    );
  }
  if (!ficha) return <div className="loading-container"><div className="spinner" /></div>;

  const canEdit = ficha.permissions?.can_edit === true;
  const sectionProps = {
    ficha, canEdit, studentId: id, showToast, applyFicha, applyMedical, reload: load,
  };

  return (
    <div className="ficha" style={style}>
      <div className="ficha-screen">
      <div className="ficha-topbar">
        <button type="button" className="ficha-back" onClick={goBack}>← Volver</button>
        <div className="ficha-topbar-actions">
          <Link to={`/students/${id}/life`} className="btn btn-secondary btn-sm">📋 Hoja de vida</Link>
          <DownloadMenu sectionLabel={sectionLabel} onPrint={requestPrint}
            onPdf={esStaff ? downloadPdf : null} pdfYear={pdfYear} />
        </div>
      </div>

      <div className="ficha-layout">
        <aside className="fs">
          <StudentPhoto student={ficha.student} photoUrl={photoUrl} className="fs-photo" />
          <nav className="fs-nav" aria-label="Secciones de la ficha">
            {sections.map(s => (
              <button key={s.key} type="button" className={`fs-item${section === s.key ? ' active' : ''}`}
                aria-current={section === s.key ? 'page' : undefined} onClick={() => goSection(s.key)}>
                <span className="fs-icon" aria-hidden="true">{s.icon}</span>
                <span>{s.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <div className="ficha-panel">
          <FichaHeader ficha={ficha} photoUrl={photoUrl} />
          <div className="ficha-body">
            {!canEdit && (
              <div className="ficha-readonly" role="note">
                👁️ <span><strong>Solo lectura.</strong> Puedes revisar la ficha y descargar documentos, pero no modificarla. Para actualizar datos, contacta a la administración del colegio.</span>
              </div>
            )}
            {section === 'personal' && <PersonalSection {...sectionProps} />}
            {section === 'familia' && <FamilySection {...sectionProps} />}
            {section === 'medico' && <MedicalSection {...sectionProps} />}
            {section === 'permisos' && <PermissionsSection {...sectionProps} />}
            {section === 'archivos' && <DocumentsSection {...sectionProps} />}
            {section === 'historial' && esStaff && (
              <section className="fc">
                <div className="fc-head">
                  <h3 className="fc-title"><span className="fc-icon" aria-hidden="true">🕘</span> Historial</h3>
                  <span className="fc-count">Matrículas, retiros, cambios de curso y ediciones de la ficha</span>
                </div>
                <HistorialTimeline studentId={id} />
              </section>
            )}
          </div>
        </div>
      </div>
      </div>

      <FichaPrintView ficha={ficha} scope={printScope} school={school} photoUrl={photoUrl} header={headerInfo(ficha)} />

      {toast && (
        <div className="toast-container" role="status" aria-live="polite">
          <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  );
}
