import React, { useState, useRef } from 'react';

/**
 * Componente de avatar de usuario reutilizable.
 * Muestra la foto de perfil si existe, de lo contrario las iniciales con color.
 *
 * Props:
 *   userId      {number}   - ID del usuario (para construir la URL de la foto)
 *   firstName   {string}
 *   lastName    {string}
 *   hasPhoto    {boolean}  - Si el usuario tiene foto guardada
 *   size        {number}   - Tamaño en px (default: 36)
 *   color       {string}   - Color de fondo para las iniciales (default: azul)
 *   editable    {boolean}  - Si se muestra botón para cambiar foto (default: false)
 *   onPhotoChange {fn}     - Callback cuando se guarda una nueva foto (recibe { photo, hasPhoto })
 *   style       {object}   - Estilos adicionales para el contenedor
 */

const AVATAR_COLORS = [
  '#6366f1','#ec4899','#f59e0b','#10b981',
  '#3b82f6','#ef4444','#8b5cf6','#14b8a6',
];

export function avatarColor(id) {
  return AVATAR_COLORS[(id || 0) % AVATAR_COLORS.length];
}

export function compressImage(file, maxDim = 300, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > h) { if (w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; } }
        else        { if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; } }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function UserAvatar({
  userId,
  firstName = '',
  lastName = '',
  hasPhoto = false,
  size = 36,
  color,
  editable = false,
  onPhotoChange,
  style = {},
}) {
  const [imgError, setImgError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [hovered, setHovered] = useState(false);
  const fileRef = useRef(null);

  const initials = `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
  const bgColor = color || avatarColor(userId);
  const fontSize = Math.round(size * 0.36);
  const showPhoto = hasPhoto && !imgError && userId;
  const API_BASE = process.env.REACT_APP_API_URL || '';
  const photoUrl = showPhoto ? `${API_BASE}/api/users/${userId}/photo?t=${userId}` : null;

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const compressed = await compressImage(file, 300, 0.85);
      if (onPhotoChange) await onPhotoChange(compressed);
      setImgError(false);
    } catch (err) {
      console.error('Error comprimiendo foto:', err);
    } finally {
      setUploading(false);
    }
  };

  const containerStyle = {
    position: 'relative',
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    cursor: editable ? 'pointer' : 'default',
    ...style,
  };

  return (
    <div
      style={containerStyle}
      onMouseEnter={() => editable && setHovered(true)}
      onMouseLeave={() => editable && setHovered(false)}
      onClick={() => editable && fileRef.current?.click()}
    >
      {/* Foto o iniciales */}
      {showPhoto ? (
        <img
          src={photoUrl}
          alt={`${firstName} ${lastName}`}
          onError={() => setImgError(true)}
          style={{
            width: size, height: size,
            borderRadius: '50%',
            objectFit: 'cover',
            display: 'block',
            border: '2px solid #fff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
          }}
        />
      ) : (
        <div style={{
          width: size, height: size,
          borderRadius: '50%',
          background: bgColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontWeight: 700,
          fontSize,
          border: '2px solid #fff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.10)',
          userSelect: 'none',
        }}>
          {uploading ? (
            <div style={{
              width: fontSize, height: fontSize,
              border: '2px solid rgba(255,255,255,0.4)',
              borderTop: '2px solid #fff',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
          ) : initials}
        </div>
      )}

      {/* Overlay editable */}
      {editable && hovered && !uploading && (
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: Math.max(10, size * 0.28), fontWeight: 700,
          cursor: 'pointer',
        }}>
          📷
        </div>
      )}

      {/* Input oculto */}
      {editable && (
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      )}
    </div>
  );
}
