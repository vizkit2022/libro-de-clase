import React, { useState, useEffect } from 'react';
import './LoginPage.css';

// Las mismas fotos del sitio público: el ingreso se siente parte de Recreo Edu
export const FONDOS = [
  '/inicio/img/aula-1.jpg',
  '/inicio/img/aula-2.jpg',
  '/inicio/img/aula-3.jpg',
];

// Fondo que rota lento, salvo que el sistema pida menos movimiento
export function FotosFondo() {
  const [lamina, setLamina] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const reloj = setInterval(
      () => setLamina(i => (i + 1) % FONDOS.length), 7000);
    return () => clearInterval(reloj);
  }, []);

  return (
    <div className="kv-fotos" aria-hidden="true">
      {FONDOS.map((src, i) => (
        <div key={src} className={`kv-foto ${i === lamina ? 'act' : ''}`}
             style={{ backgroundImage: `url(${src})` }} />
      ))}
      <div className="kv-velo" />
    </div>
  );
}

export function Logo({ className = '', tam = 44 }) {
  return (
    <a href="/" className={`kv-logo ${className}`}>
      <img src="/inicio/img/recreo-isotipo.png" alt="" width={tam} height={tam} />
      <span className="kv-lock">
        <b>Recreo Edu</b>
        <i>Tecnología para educar</i>
      </span>
    </a>
  );
}

export const LogoMovil = () => <Logo className="kv-logo-movil" tam={38} />;

// Panel izquierdo de ingreso y registro: la marca sobre las fotos del sitio.
export default function PanelMarca({ titulo, texto, puntos, pie }) {
  return (
    <aside className="kv-marca">
      <FotosFondo />
      <div className="kv-marca-cont">
        <Logo />
        <div className="kv-pitch">
          <h1>{titulo}</h1>
          <p>{texto}</p>
          <ul>{puntos.map(p => <li key={p}>{p}</li>)}</ul>
        </div>
        <p className="kv-pie">{pie}</p>
      </div>
    </aside>
  );
}

export function Aviso({ children }) {
  if (!children) return null;
  return (
    <div className="kv-error" role="alert">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" /><path d="M12 8v5M12 16.5v.01" />
      </svg>
      <span>{children}</span>
    </div>
  );
}

export function OjoClave({ visible }) {
  return visible ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <path d="M6.6 6.6A18.5 18.5 0 0 0 2 12s3 8 10 8a9.1 9.1 0 0 0 5.4-1.6M2 2l20 20" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
