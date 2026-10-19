import axios from 'axios';

/**
 * Descarga un archivo protegido por JWT.
 *
 * No sirve window.open(): es una navegación del browser y no lleva el header
 * Authorization que axios guarda en sus defaults, así que el backend responde
 * "Missing Authorization Header". Hay que pedirlo con axios y disparar la
 * descarga desde un blob en memoria.
 */
export default async function descargarArchivo(url, nombreSugerido) {
  const r = await axios.get(url, { responseType: 'blob' });

  // Si el backend devolvió un error JSON, llega como blob igual
  if (r.data.type && r.data.type.includes('application/json')) {
    const txt = await r.data.text();
    let msg = 'No se pudo generar el archivo';
    try { msg = JSON.parse(txt).error || msg; } catch { /* texto plano */ }
    throw new Error(msg);
  }

  // El nombre real viene en Content-Disposition cuando el servidor lo manda
  let nombre = nombreSugerido;
  const cd = r.headers['content-disposition'];
  if (cd) {
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
    if (m) nombre = decodeURIComponent(m[1]);
  }

  const blobUrl = URL.createObjectURL(r.data);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
}
