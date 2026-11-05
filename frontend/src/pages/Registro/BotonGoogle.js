import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { msgError } from '../../components/UI/Modal';

// Configuración pública del registro. Si no responde, las pantallas siguen
// funcionando: sin botón de Google y sin prometer una cantidad de días.
export function useConfigRegistro() {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    let vivo = true;
    Promise.resolve(axios.get('/api/registro/config'))
      .then(r => { if (vivo && r?.data) setConfig(r.data); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);
  return config;
}

const URL_SCRIPT = 'https://accounts.google.com/gsi/client';
let promesaScript = null;

// El script de Google se pide solo cuando hay client_id, y una sola vez.
function cargarScriptGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!promesaScript) {
    promesaScript = new Promise((resolver, rechazar) => {
      const s = document.createElement('script');
      s.src = URL_SCRIPT;
      s.async = true;
      s.onload = () => resolver();
      s.onerror = () => { promesaScript = null; rechazar(new Error('sin script')); };
      document.head.appendChild(s);
    });
  }
  return promesaScript;
}

// Separador y "Continuar con Google". Sin client_id no dibuja nada.
export function BloqueGoogle({ clientId, onError }) {
  const { iniciarSesion } = useAuth();
  const caja = useRef(null);
  const [fallo, setFallo] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  // Google guarda el callback del primer initialize: se lee siempre lo último
  const alRecibir = useRef(null);
  alRecibir.current = async ({ credential }) => {
    setOcupado(true);
    onError?.('');
    try {
      const { data } = await axios.post('/api/registro/google', { credential });
      iniciarSesion(data);
    } catch (e) {
      setOcupado(false);
      onError?.(msgError(e, 'No pudimos entrar con Google. Inténtalo de nuevo o usa tu correo.'));
    }
  };

  useEffect(() => {
    if (!clientId) return undefined;
    let vivo = true;
    cargarScriptGoogle().then(() => {
      if (!vivo || !caja.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (r) => alRecibir.current(r),
      });
      window.google.accounts.id.renderButton(caja.current, {
        type: 'standard', theme: 'outline', size: 'large', shape: 'rectangular',
        text: 'continue_with', logo_alignment: 'center', locale: 'es',
        // Google pide el ancho en píxeles y acepta hasta 400
        width: Math.min(caja.current.offsetWidth || 320, 400),
      });
    }).catch(() => { if (vivo) setFallo(true); });
    return () => { vivo = false; };
  }, [clientId]);

  if (!clientId) return null;

  return (
    <>
      <div className="kv-sep"><span>o</span></div>
      {fallo ? (
        <p className="kv-google-nota">Google no está disponible en este momento. Puedes seguir con tu correo.</p>
      ) : (
        <div className="kv-google">
          <div className="kv-google-btn" ref={caja} data-testid="boton-google" />
          {ocupado && <div className="kv-google-ocupado" role="status">Entrando con Google…</div>}
        </div>
      )}
    </>
  );
}
