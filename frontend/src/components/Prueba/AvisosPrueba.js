import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import Modal, { msgError } from '../UI/Modal';
import { fecha } from '../../pages/Plan/PlanPage';
import { Icono } from '../Layout/iconos';
import './AvisosPrueba.css';

const GESTIONAN = ['admin', 'directivo'];
const DIAS_URGENTE = 7;

// Solo los colegios que llegaron por registro propio: los demás no ven nada de esto.
const esAutoregistro = (school) => school?.origen === 'autoregistro';

function textoDias(dias) {
  if (dias <= 0) return 'Hoy es tu último día de prueba';
  if (dias === 1) return 'Te queda 1 día de prueba';
  return `Te quedan ${dias} días de prueba`;
}

export function FranjaPrueba() {
  const { user, school } = useAuth();
  const prueba = school?.prueba;
  if (!esAutoregistro(school) || !prueba || prueba.suscrito) return null;

  const gestiona = GESTIONAN.includes(user?.role);

  if (prueba.vencida) {
    if (!gestiona && user?.role !== 'profesor') return null;
    return (
      <div className="pv-franja pv-vencida" role="status">
        <Icono nombre="candado" tam={16} />
        <p>
          <b>Tu prueba terminó.</b>{' '}
          {gestiona
            ? 'Tus datos siguen aquí y puedes revisarlos. Para volver a editarlos, suscribe a tu colegio.'
            : 'Puedes revisar la información, pero no modificarla hasta que tu colegio se suscriba.'}
        </p>
        {gestiona && <Link className="pv-btn" to="/plan">Suscribirme</Link>}
      </div>
    );
  }

  if (!gestiona) return null;
  const dias = prueba.dias_restantes ?? 0;
  return (
    <div className={`pv-franja ${dias <= DIAS_URGENTE ? 'pv-urgente' : ''}`} role="status">
      <Icono nombre="reloj" tam={16} />
      <p>
        <b>{textoDias(dias)}.</b>
        {prueba.termina && <> Sigue hasta el {fecha(prueba.termina)}.</>}
      </p>
      <Link className="pv-btn" to="/plan">Ver mi plan</Link>
    </div>
  );
}

export function AvisoDatosEjemplo({ onBorrados }) {
  const { user, school, refrescarSesion, recargarAnios } = useAuth();
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState('');

  if (!esAutoregistro(school) || !school?.tiene_demo || !GESTIONAN.includes(user?.role)) return null;

  // Con la prueba vencida el colegio queda en solo lectura: borrar no está disponible
  const soloLectura = !!school?.prueba?.vencida && !school?.prueba?.suscrito;

  const borrar = async () => {
    setBorrando(true);
    setError('');
    try {
      await axios.delete('/api/autoonboarding/demo');
      await refrescarSesion?.();
      recargarAnios?.();
      setConfirmando(false);
      onBorrados?.();
    } catch (e) {
      setError(msgError(e, 'No pudimos borrar los datos de ejemplo. Inténtalo de nuevo.'));
    }
    setBorrando(false);
  };

  return (
    <div className="pv-franja pv-demo" role="status">
      <Icono nombre="alerta" tam={16} />
      <p><b>Estás viendo datos de ejemplo.</b> Los nombres y las notas son ficticios.</p>
      {!soloLectura && (
        <span className="pv-acciones">
          <Link className="pv-btn" to="/bienvenida/datos">Cargar mis datos</Link>
          <button type="button" className="pv-btn pv-btn-sec" onClick={() => setConfirmando(true)}>Borrar el ejemplo</button>
        </span>
      )}

      {confirmando && (
        <Modal titulo="¿Borrar los datos de ejemplo?" ocupado={borrando} onClose={() => setConfirmando(false)}
          pie={<>
            <button type="button" className="ui-btn" disabled={borrando} onClick={() => setConfirmando(false)}>Cancelar</button>
            <button type="button" className="ui-btn ui-btn-peligro" disabled={borrando} onClick={borrar}>
              {borrando ? 'Borrando…' : 'Sí, borrarlos'}
            </button>
          </>}>
          {error && <div className="ui-aviso ui-aviso-peligro" role="alert">{error}</div>}
          <p className="pv-modal-txt">
            Se quitan los cursos, alumnos, notas y anotaciones del colegio de ejemplo.
            Lo que hayas cargado tú no se toca.
          </p>
        </Modal>
      )}
    </div>
  );
}

// Escucha todas las respuestas: si una escritura choca con la prueba vencida,
// avisa con claridad en vez de dejar un error suelto en la pantalla de turno.
export function AvisoPruebaVencida() {
  const { user, refrescarSesion } = useAuth();
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const respuestas = axios.interceptors?.response;
    if (!respuestas?.use) return undefined;
    const id = respuestas.use(
      r => r,
      (err) => {
        if (err?.response?.status === 402 && err.response.data?.codigo === 'prueba_vencida') {
          setAbierto(true);
          refrescarSesion?.();
        }
        return Promise.reject(err);
      });
    return () => respuestas.eject?.(id);
  }, []);

  if (!abierto) return null;
  const cerrar = () => setAbierto(false);
  const gestiona = GESTIONAN.includes(user?.role);

  return (
    <Modal titulo="Tu prueba terminó" onClose={cerrar}
      pie={<>
        <button type="button" className="ui-btn" onClick={cerrar}>Entendido</button>
        {gestiona && (
          <button type="button" className="ui-btn ui-btn-pri"
            onClick={() => { cerrar(); navigate('/plan'); }}>Ver mi plan</button>
        )}
      </>}>
      <p className="pv-modal-txt">
        {gestiona
          ? 'Tus datos siguen aquí y puedes revisarlos, pero este cambio no se guardó. Suscribe a tu colegio para seguir trabajando.'
          : 'Este cambio no se guardó: el colegio está en modo de solo lectura hasta que se suscriba. Avísale a la dirección.'}
      </p>
    </Modal>
  );
}
