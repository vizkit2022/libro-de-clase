#!/bin/bash

# ══════════════════════════════════════════════════════
#   SISTEMA LIBRO DE CLASE — Script de inicio para Mac
# ══════════════════════════════════════════════════════

cd "$(dirname "$0")"
PROYECTO="$(pwd)"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   Sistema Libro de Clase             ║"
echo "║   Iniciando servicios...             ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── Verificar Python 3 ───────────────────────────────
if ! command -v python3 &>/dev/null; then
  echo "❌  Python 3 no está instalado."
  echo "    Descárgalo en: https://www.python.org/downloads/"
  read -p "Presiona Enter para salir..."
  exit 1
fi
echo "✓  Python 3: $(python3 --version)"

# ── Verificar Node / npm ─────────────────────────────
if ! command -v node &>/dev/null; then
  echo "❌  Node.js no está instalado."
  echo "    Descárgalo en: https://nodejs.org  (versión LTS)"
  read -p "Presiona Enter para salir..."
  exit 1
fi
echo "✓  Node.js: $(node --version)"
echo "✓  npm: $(npm --version)"
echo ""

# ── Matar procesos anteriores ─────────────────────────
echo "🔄  Limpiando procesos anteriores..."
for PORT in 5008 3000; do
  PIDS=$(lsof -ti:$PORT 2>/dev/null)
  if [ -n "$PIDS" ]; then
    echo "   Liberando puerto $PORT..."
    echo $PIDS | xargs kill -9 2>/dev/null
  fi
done
pkill -f "python3 app.py" 2>/dev/null
pkill -f "react-scripts" 2>/dev/null
sleep 2
echo "✓  Puertos libres"
echo ""

# ── Instalar dependencias Python ─────────────────────
echo "📦  Instalando dependencias Python..."
cd "$PROYECTO/backend"
pip3 install -r requirements.txt -q --break-system-packages 2>/dev/null || pip3 install -r requirements.txt -q
echo "✓  Dependencias Python listas"

# Limpiar base de datos para regenerar con hashes correctos
rm -f ~/.colegio_app/colegio.db 2>/dev/null
echo "✓  Base de datos lista para regenerar"
echo ""

# ── Instalar dependencias Node ───────────────────────
cd "$PROYECTO/frontend"
echo "📦  Instalando dependencias Node..."
rm -rf node_modules package-lock.json 2>/dev/null
npm install --legacy-peer-deps --silent
echo "✓  Dependencias Node listas"
echo ""

# ── Cargar variables de entorno del backend ──────────
if [ -f "$PROYECTO/backend/.env" ]; then
  export $(grep -v '^#' "$PROYECTO/backend/.env" | grep -v '^$' | xargs) 2>/dev/null
fi

# Verificar API key de Anthropic
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "⚠️   Función 'Libro Digital' desactivada (sin API key de Anthropic)"
  echo "    → Configura ANTHROPIC_API_KEY en backend/.env para activarla"
  echo ""
else
  echo "✓  API Anthropic configurada (función Libro Digital activa)"
fi

# ── Iniciar Backend Flask (output visible) ────────────
echo "🚀  Iniciando Backend en puerto 5008..."
cd "$PROYECTO/backend"

# Mostrar salida de Flask directamente para ver errores
python3 app.py &
BACKEND_PID=$!

echo "   Esperando que Flask arranque..."
for i in $(seq 1 15); do
  sleep 1
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    http://localhost:5008/api/auth/login \
    -X POST -H "Content-Type: application/json" \
    -d '{"email":"admin@sanpatricio.cl","password":"admin123"}' 2>/dev/null)
  if [ "$HTTP_CODE" = "200" ]; then
    echo "✓  Backend corriendo en http://localhost:5008"
    break
  fi
  printf "."
done
echo ""

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  http://localhost:5008/api/auth/login \
  -X POST -H "Content-Type: application/json" \
  -d '{"email":"admin@sanpatricio.cl","password":"admin123"}' 2>/dev/null)

if [ "$HTTP_CODE" != "200" ]; then
  echo ""
  echo "❌  Backend no pudo iniciar."
  echo "    Revisa los mensajes de error de arriba (en rojo)."
  echo ""
  read -p "Presiona Enter para salir..."
  kill $BACKEND_PID 2>/dev/null
  exit 1
fi
echo ""

# ── Iniciar Frontend React ────────────────────────────
echo "🚀  Iniciando Frontend en puerto 3000..."
cd "$PROYECTO/frontend"
BROWSER=none HOST=localhost DANGEROUSLY_DISABLE_HOST_CHECK=true ./node_modules/.bin/react-scripts start > /tmp/frontend_mac.log 2>&1 &
FRONTEND_PID=$!

echo "⏳  Compilando React (30-40 segundos)..."
for i in $(seq 1 50); do
  sleep 1
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null | grep -q "200"; then
    break
  fi
  printf "."
done
echo ""

HTTP_FRONT=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null)
if [ "$HTTP_FRONT" != "200" ]; then
  echo "❌  Frontend no respondió. Log:"
  cat /tmp/frontend_mac.log | tail -20
  read -p "Presiona Enter para salir..."
  exit 1
fi

echo "✓  Frontend corriendo en http://localhost:3000"
echo ""
echo "╔══════════════════════════════════════╗"
echo "║   ✅  Sistema listo!                 ║"
echo "║                                      ║"
echo "║   http://localhost:3000              ║"
echo "║                                      ║"
echo "║   admin@sanpatricio.cl / admin123    ║"
echo "║   mvaldes@sanpatricio.cl / prof123   ║"
echo "╠══════════════════════════════════════╣"
if [ -z "$ANTHROPIC_API_KEY" ]; then
echo "║   📷 Libro Digital: DESACTIVADO      ║"
echo "║   → Agrega tu API key en backend/.env║"
else
echo "║   📷 Libro Digital: ACTIVO ✅        ║"
fi
echo "╚══════════════════════════════════════╝"
echo ""

open http://localhost:3000

echo "  [No cierres esta ventana]  [Ctrl+C para detener]"
echo ""

wait $FRONTEND_PID
