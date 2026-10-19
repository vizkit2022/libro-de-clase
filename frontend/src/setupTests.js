// Configuración global de Jest (CRA la carga automáticamente)
import '@testing-library/jest-dom';

// jsdom no implementa estas APIs; la ficha las usa para fotos/documentos (blob → object URL)
if (!window.URL.createObjectURL) window.URL.createObjectURL = jest.fn(() => 'blob:mock');
if (!window.URL.revokeObjectURL) window.URL.revokeObjectURL = jest.fn();
if (!window.matchMedia) {
  window.matchMedia = (q) => ({
    matches: false, media: q, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  });
}
