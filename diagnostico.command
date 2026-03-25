#!/bin/bash

cd "$(dirname "$0")"
PROYECTO="$(pwd)"

echo ""
echo "════════════════════════════════════════"
echo "   DIAGNÓSTICO DEL SISTEMA"
echo "════════════════════════════════════════"
echo ""

echo "── Python ──────────────────────────────"
python3 --version
pip3 --version
echo ""

echo "── Paquetes Python instalados ──────────"
cd "$PROYECTO/backend"
pip3 show flask flask-sqlalchemy flask-jwt-extended flask-cors werkzeug 2>/dev/null | grep -E "Name|Version"
echo ""

echo "── Probando importación del backend ────"
python3 -c "
import traceback
import sys
sys.path.insert(0, '.')
try:
    print('  Importando Flask...')
    from flask import Flask
    print('  OK Flask')
    print('  Importando modelos...')
    from models import db, User
    print('  OK modelos')
    print('  Importando app...')
    from app import create_app
    print('  OK app')
    print('  Creando app...')
    app = create_app()
    print('  ✓ Backend sin errores!')
except Exception as e:
    print(f'')
    print(f'  ❌ ERROR: {e}')
    print(f'')
    traceback.print_exc()
"
echo ""

echo "── Puerto 5008 ─────────────────────────"
lsof -i:5008 2>/dev/null && echo "Puerto 5008 en uso" || echo "Puerto 5008 libre"
echo ""

echo "════════════════════════════════════════"
echo "   FIN DIAGNÓSTICO"
echo "════════════════════════════════════════"
echo ""
read -p "Presiona Enter para cerrar..."
