#!/bin/bash
# ==========================================
# Script de inicio - Libro de Clases Digital
# ==========================================

echo ""
echo "╔════════════════════════════════════════╗"
echo "║   📚 Libro de Clases Digital           ║"
echo "║   Sistema de Gestión Escolar           ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Verificar Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 no encontrado. Instálalo desde python.org"
    exit 1
fi

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no encontrado. Instálalo desde nodejs.org"
    exit 1
fi

# Directorio del proyecto
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Instalar dependencias Python
echo "📦 Instalando dependencias del backend..."
cd "$DIR/backend"
pip3 install -r requirements.txt -q

# Instalar dependencias Node.js
echo "📦 Instalando dependencias del frontend..."
cd "$DIR/frontend"
npm install --silent

echo ""
echo "🚀 Iniciando servidores..."
echo ""

# Iniciar backend en background
cd "$DIR/backend"
python3 app.py &
BACKEND_PID=$!
echo "✅ Backend iniciado (PID: $BACKEND_PID) → http://localhost:5000"

# Esperar que el backend arranque
sleep 2

# Iniciar frontend
cd "$DIR/frontend"
echo "✅ Frontend iniciando → http://localhost:3000"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Accesos de prueba:"
echo "   Admin:     admin@sanpatricio.cl / admin123"
echo "   Directivo: directivo@sanpatricio.cl / dir123"
echo "   Profesor:  mvaldes@sanpatricio.cl / prof123"
echo "   Alumno:    pedro.alvarado@gmail.com / alumno123"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 Abre http://localhost:3000 en tu navegador"
echo ""
echo "Presiona Ctrl+C para detener"
echo ""

npm start

# Limpiar al cerrar
kill $BACKEND_PID 2>/dev/null
