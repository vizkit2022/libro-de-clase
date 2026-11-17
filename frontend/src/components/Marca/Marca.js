import React from 'react';
import './Marca.css';

// Campana del recreo: el isotipo de recreo.edu. Los colores de la perilla
// cambian según el fondo (cacao sobre claro, blanco sobre cacao).
export function Campana({ tam = 36, claro = false }) {
  return (
    <svg className="rc-campana" width={tam} height={tam} viewBox="0 0 96 96"
         aria-hidden="true" style={{ overflow: 'visible' }}>
      <g className="rc-mece">
        <circle cx="48" cy="12" r="6" fill={claro ? '#FFFFFF' : '#2B1B14'} />
        <path d="M48 16 C31 16 25 31 25 46 L25 61 L16 72 L80 72 L71 61 L71 46 C71 31 65 16 48 16 Z"
              fill="#FFC94A" />
        <circle className="rc-badajo" cx="48" cy="81" r="8" fill="#FF7417" />
      </g>
      <g fill="none" stroke="#FF7417" strokeWidth="5" strokeLinecap="round">
        <path className="rc-onda rc-onda-d" d="M82 24 Q91 34 88 46" />
        <path className="rc-onda rc-onda-i" d="M14 24 Q5 34 8 46" />
      </g>
    </svg>
  );
}

// Logo completo: campana + "recreo.edu" en Fredoka con ".edu" naranja.
// `claro` es para fondos cacao. Con `soloCampana` queda el isotipo.
export default function Marca({ tam = 36, claro = false, soloCampana = false,
                                href = '/', className = '', children }) {
  return (
    <a href={href} className={`rc-marca ${claro ? 'claro' : ''} ${className}`}
       aria-label="recreo.edu">
      <Campana tam={tam} claro={claro} />
      {!soloCampana && (
        <span className="rc-marca-txt" style={{ fontSize: Math.round(tam * 0.66) }}>
          recreo<span>.edu</span>
        </span>
      )}
      {children}
    </a>
  );
}
