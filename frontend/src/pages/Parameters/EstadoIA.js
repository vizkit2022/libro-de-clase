/**
 * Estado de las funciones con IA.
 *
 * Se comprueba con una petición real al modelo, no mirando una variable: una
 * clave puede estar configurada y ser inválida, o apuntar a un modelo que ya
 * fue retirado, y desde afuera las tres cosas se ven igual.
 */
import React, { useState } from 'react';
import axios from 'axios';

export default function EstadoIA() {
  const [estado, setEstado] = useState(null);
  const [probando, setProbando] = useState(false);
  const [error, setError] = useState('');

  const probar = async () => {
    setProbando(true);
    setError('');
    try {
      const { data } = await axios.get('/api/ia/estado');
      setEstado(data);
    } catch (e) {
      setError(e.response?.data?.error
        || `No pudimos consultar el estado (error ${e.response?.status || 'de red'}).`);
    } finally {
      setProbando(false);
    }
  };

  const color = !estado ? '#6B5446' : estado.ok ? '#1F5E43'
    : estado.configurada ? '#7A4B00' : '#9A3412';
  const fondo = !estado ? '#F3F0EC' : estado.ok ? '#DDF0E6'
    : estado.configurada ? '#FFF0C7' : '#FDE2D7';

  return (
    <div className="card" style={{ gridColumn: '1/-1' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#2B1B14' }}>
          ✨ Funciones con IA
        </h3>
        {estado && (
          <span style={{ background: fondo, color, fontSize: 11.5, fontWeight: 700,
                         padding: '3px 10px', borderRadius: 999 }}>
            {estado.ok ? 'Operativa'
              : estado.configurada ? 'Configurada, con problema' : 'No configurada'}
          </span>
        )}
        <button type="button" className="btn btn-secondary btn-sm"
                onClick={probar} disabled={probando}
                style={{ marginLeft: 'auto' }}>
          {probando ? 'Probando…' : estado ? 'Volver a probar' : 'Probar ahora'}
        </button>
      </div>

      <p style={{ fontSize: 13, color: '#6B5446', margin: '0 0 14px', lineHeight: 1.6 }}>
        La prueba envía una petición mínima al modelo. Tener saldo en la cuenta de
        Anthropic y tener la clave configurada en el servidor son cosas distintas:
        esto comprueba la segunda.
      </p>

      {error && (
        <div style={{ background: '#FDE2D7', border: '1px solid #F8C4AE', color: '#9A3412',
                      borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
          {error}
        </div>
      )}

      {estado && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
                        gap: 10, marginBottom: 14 }}>
            {[
              ['Modelo', estado.modelo],
              ['Modelo de imágenes', estado.modelo_vision],
              ['Respuesta', estado.latencia_ms != null ? `${estado.latencia_ms} ms` : '—'],
            ].map(([k, v]) => (
              <div key={k} style={{ background: '#F7F6F4', border: '1px solid #ECE8E3',
                                    borderRadius: 10, padding: '10px 13px' }}>
                <span style={{ display: 'block', fontSize: 10.5, textTransform: 'uppercase',
                               letterSpacing: '.06em', color: '#6B5446', fontWeight: 700 }}>{k}</span>
                <b style={{ fontSize: 13, color: '#2B1B14', wordBreak: 'break-all' }}>{v || '—'}</b>
              </div>
            ))}
          </div>

          {estado.error && (
            <div style={{ background: fondo, border: `1px solid ${color}33`, color,
                          borderRadius: 10, padding: '11px 14px', fontSize: 13,
                          lineHeight: 1.6, marginBottom: 14 }}>
              {estado.error}
            </div>
          )}

          <div style={{ border: '1px solid #ECE8E3', borderRadius: 10, overflow: 'hidden' }}>
            {(estado.funciones || []).map((f, i) => (
              <div key={f.clave} style={{
                padding: '11px 14px', fontSize: 13,
                borderTop: i ? '1px solid #F3F0EC' : 'none',
              }}>
                <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
                  <b style={{ color: '#2B1B14' }}>{f.nombre}</b>
                  <span style={{ fontSize: 11.5, color: '#6B5446' }}>· {f.donde}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700,
                                 padding: '2px 9px', borderRadius: 999,
                                 background: estado.ok ? '#DDF0E6' : '#F3F0EC',
                                 color: estado.ok ? '#1F5E43' : '#6B5446' }}>
                    {estado.ok ? 'Disponible' : 'No disponible'}
                  </span>
                </div>
                {!estado.ok && (
                  <p style={{ margin: '4px 0 0', fontSize: 12.2, color: '#6B5446', lineHeight: 1.55 }}>
                    {f.sin_ia}
                  </p>
                )}
              </div>
            ))}
          </div>

          {!estado.configurada && (
            <p style={{ fontSize: 12.2, color: '#6B5446', marginTop: 12, lineHeight: 1.6 }}>
              Para activarla hay que agregar la variable <code>ANTHROPIC_API_KEY</code> en
              el servicio de Railway donde corre la plataforma, y volver a desplegar.
            </p>
          )}
        </>
      )}
    </div>
  );
}
