/**
 * Verifica la landing cargándola en un DOM real.
 *
 * Existe porque un error de JavaScript aborta el bloque <script> entero: el
 * carrusel buscaba flechas que ya no estaban, lanzaba, y el revelado por
 * scroll nunca corría, dejando toda la página bajo el hero en opacidad 0.
 * Compilar o verse bien el hero no alcanzaba para detectarlo.
 *
 *   node backend/landing/verificar.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require(
  path.join(__dirname, '..', '..', 'frontend', 'node_modules', 'jsdom'));

const archivo = process.argv[2] || path.join(__dirname, 'index.html');
const html = fs.readFileSync(archivo, 'utf8');

const errores = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errores.push('jsdomError: ' + (e.detail || e).toString()));
vc.on('error', (...a) => errores.push('console.error: ' + a.join(' ')));

// jsdom no trae IntersectionObserver: se simula disparando de inmediato,
// que es el caso que importa (el contenido tiene que quedar visible).
const shim = `
  window.IntersectionObserver = function (cb) {
    this.observe = function (el) { cb([{ isIntersecting: true, target: el }], this); };
    this.unobserve = function () {};
    this.disconnect = function () {};
  };
`;

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(win) {
    win.eval(shim);
    win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    // jsdom tampoco trae fetch. Se responde la UF para ejercitar el camino
    // bueno de la calculadora, no solo el de error.
    win.fetch = url => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve(
        String(url).includes('/api/uf')
          ? { valor: 39876.54, fecha: '2026-10-14' }
          : {}),
    });
  },
});

setTimeout(() => {
  const doc = dom.window.document;
  const ocultos = [...doc.querySelectorAll('.rev, .rev-g')]
    .filter(el => !el.classList.contains('vis'));

  const secciones = [...doc.querySelectorAll('section[id]')].map(s => s.id);
  const laminas = doc.querySelectorAll('#carru .dia').length;
  const activas = doc.querySelectorAll('#carru .dia.act').length;
  const imgsRotas = [...doc.querySelectorAll('img[src]')]
    .filter(i => !/^(\/inicio\/img\/|data:)/.test(i.getAttribute('src')));

  console.log('secciones:', secciones.join(', '));
  console.log('láminas del carrusel:', laminas, '· activa:', activas);
  console.log('bloques .rev sin revelar:', ocultos.length);
  console.log('imágenes con ruta sospechosa:', imgsRotas.length);
  // La calculadora: con la UF simulada, 20 usuarios tienen que dar
  // 20 × 0,7 = 14 UF al mes y 14 × 39.876,54 = $558.272.
  const texto = id => (doc.getElementById(id) || {}).textContent || '';
  const calc = `${texto('calcUfMes')} · ${texto('calcPesosMes')}`;
  const calcOk = texto('calcUfMes') === '14 UF' &&
                 /558\.272/.test(texto('calcPesosMes')) &&
                 /168 UF/.test(texto('calcUfAnio'));
  console.log('calculadora (20 usuarios):', calc, calcOk ? '✓' : '✗');

  console.log('errores de JavaScript:', errores.length);
  errores.forEach(e => console.log('   ', e));

  const mal = errores.length || ocultos.length || activas !== 1 ||
              imgsRotas.length || !calcOk;
  console.log(mal ? '\nFALLA' : '\nOK');
  process.exit(mal ? 1 : 0);
}, 3200);
