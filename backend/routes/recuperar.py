"""Recuperación de la clave por correo.

  GET  /api/auth/recuperar/disponible   público: si el login debe ofrecerla
  POST /api/auth/recuperar              público: envía el enlace
  POST /api/auth/recuperar/nueva        público: cambia la clave con el enlace

El enlace no se guarda en la base de datos: va firmado, dura una hora y lleva una huella
de la clave actual, así deja de servir apenas se usa. La respuesta al pedirlo es siempre
la misma, para no revelar qué correos tienen cuenta.

Variable de entorno:
  URL_PUBLICA   base del enlace. No se toma del Host de la request, que lo escribe el
                cliente y permitiría mandar a la víctima un enlace hacia otro sitio.
"""
import hashlib
import html
import os
import threading
import time
from collections import defaultdict, deque

from flask import Blueprint, current_app, jsonify, request
from itsdangerous import BadData, URLSafeTimedSerializer
from sqlalchemy import func

from models import db, User
from servicios.correo import correo_configurado, enviar_correo

recuperar_bp = Blueprint('recuperar', __name__)

DURACION_SEGUNDOS = 60 * 60
CLAVE_MIN, CLAVE_MAX = 8, 200
URL_POR_DEFECTO = 'https://kolevia.cl'
# La clave por defecto de app.py está en el repositorio, que es público: con ella
# cualquiera podría fabricar un enlace.
SECRETO_INSEGURO = 'colegio-secret-key-2024-change-in-production'
# Correos sin buzón real, como los de alumnos sin correo propio
DOMINIOS_SIN_BUZON = ('.local', '.invalid')

MENSAJE_ENVIADO = ('Si ese correo tiene una cuenta, te enviamos un enlace para crear una '
                   'clave nueva. Revisa también la carpeta de spam.')
MENSAJE_ENLACE_MALO = ('Este enlace venció o ya se usó. Pide uno nuevo para cambiar tu clave.')


# ── Límite de intentos ────────────────────────────────────────────────────
# En memoria: se cuenta por proceso y se reinicia al desplegar. Alcanza para frenar
# el abuso automatizado y que nadie llene de correos el buzón de otra persona.
_INTENTOS = defaultdict(deque)
_CANDADO = threading.Lock()


def _excede(clave, tope, ventana):
    ahora = time.monotonic()
    with _CANDADO:
        if len(_INTENTOS) > 10000:
            _INTENTOS.clear()
        cola = _INTENTOS[clave]
        while cola and ahora - cola[0] > ventana:
            cola.popleft()
        if len(cola) >= tope:
            return True
        cola.append(ahora)
        return False


def _ip():
    # X-Real-IP lo escribe el proxy. El primer X-Forwarded-For lo escribe el cliente.
    real = (request.headers.get('X-Real-IP') or '').strip()
    if real:
        return real[:64]
    xff = request.headers.get('X-Forwarded-For', '')
    return (xff.split(',')[-1].strip() if xff else (request.remote_addr or ''))[:64]


# ── Enlace ────────────────────────────────────────────────────────────────

def _firmador():
    return URLSafeTimedSerializer(current_app.config['JWT_SECRET_KEY'],
                                  salt='recuperar-clave')


def _huella(user):
    return hashlib.sha256((user.password_hash or '').encode('utf-8')).hexdigest()[:20]


def crear_token(user):
    return _firmador().dumps({'u': user.id, 'h': _huella(user)})


def usuario_del_token(token):
    """El usuario dueño del enlace, o None si venció, ya se usó o fue alterado."""
    if not isinstance(token, str) or not token:
        return None
    try:
        datos = _firmador().loads(token, max_age=DURACION_SEGUNDOS)
        user = db.session.get(User, int(datos['u']))
        if user and user.is_active and _puede_recuperar(user) and datos['h'] == _huella(user):
            return user
    except (BadData, KeyError, TypeError, ValueError):
        pass
    return None


def _puede_recuperar(user):
    # El correo del super admin de fábrica es de un dominio que no controlamos: quien
    # lo registrara tomaría toda la plataforma
    if user.role == 'super_admin':
        return False
    return not (user.email or '').lower().endswith(DOMINIOS_SIN_BUZON)


def disponible():
    return correo_configurado() and current_app.config['JWT_SECRET_KEY'] != SECRETO_INSEGURO


# ── Correo ────────────────────────────────────────────────────────────────

def _contenido(nombre, enlace):
    asunto = 'Crea una clave nueva para Recreo Edu'
    saludo = f'Hola {nombre},' if nombre else 'Hola,'
    texto = (f'{saludo}\n\nPediste cambiar tu clave de Recreo Edu. Abre este enlace para crear '
             f'una nueva:\n\n{enlace}\n\nEl enlace dura 1 hora y sirve una sola vez. Si no lo '
             'pediste, ignora este correo: tu clave no cambia.\n\nRecreo Edu')
    cuerpo = f"""<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:480px;margin:0 auto;padding:24px;line-height:1.5">
  <p style="font-size:18px;font-weight:bold;margin:0 0 20px">Recreo Edu</p>
  <p style="margin:0 0 12px">{html.escape(saludo)}</p>
  <p style="margin:0 0 24px">Pediste cambiar tu clave. Presiona el botón para crear una nueva.</p>
  <p style="margin:0 0 24px"><a href="{html.escape(enlace, quote=True)}" style="background:#3b4fd8;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px;display:inline-block">Crear clave nueva</a></p>
  <p style="margin:0;font-size:14px;color:#4b5563">El enlace dura 1 hora y sirve una sola vez. Si no lo pediste, ignora este correo: tu clave no cambia.</p>
</div>"""
    return asunto, cuerpo, texto


def _despachar(destino, asunto, cuerpo, texto):
    """Fuera de la request: si tardara solo con cuentas reales, delataría cuáles existen."""
    threading.Thread(target=enviar_correo, args=(destino, asunto, cuerpo, texto),
                     daemon=True).start()


# ── Rutas ─────────────────────────────────────────────────────────────────

@recuperar_bp.route('/disponible', methods=['GET'])
def consultar_disponible():
    return jsonify({'disponible': disponible()}), 200


@recuperar_bp.route('', methods=['POST'])
def pedir_enlace():
    if not disponible():
        return jsonify({'error': 'La recuperación por correo no está disponible. '
                                 'Pídele a la dirección de tu colegio que restablezca tu clave.'}), 503
    if _excede(('pedir', _ip()), 5, 600):
        return jsonify({'error': 'Demasiados intentos. Espera unos minutos y vuelve a probar.'}), 429

    d = request.get_json(silent=True)
    email = d.get('email') if isinstance(d, dict) else None
    email = email.strip().lower() if isinstance(email, str) else ''
    if not email:
        return jsonify({'error': 'Escribe tu correo'}), 400

    user = User.query.filter(func.lower(User.email) == email,
                             User.is_active.is_(True)).order_by(User.id).first()
    # El tope por correo no se avisa: la respuesta debe ser igual a la de siempre
    if user and _puede_recuperar(user) and not _excede(('correo', email), 3, 3600):
        base = ((os.environ.get('URL_PUBLICA') or '').strip() or URL_POR_DEFECTO).rstrip('/')
        # Tras el #: el navegador no envía esa parte al servidor ni la deja en sus registros
        enlace = f'{base}/nueva-clave#{crear_token(user)}'
        _despachar(user.email, *_contenido(user.first_name, enlace))
    return jsonify({'message': MENSAJE_ENVIADO}), 200


@recuperar_bp.route('/nueva', methods=['POST'])
def guardar_clave():
    if _excede(('nueva', _ip()), 10, 600):
        return jsonify({'error': 'Demasiados intentos. Espera unos minutos y vuelve a probar.'}), 429

    d = request.get_json(silent=True)
    d = d if isinstance(d, dict) else {}
    clave = d.get('password') if isinstance(d.get('password'), str) else ''
    if len(clave) < CLAVE_MIN:
        return jsonify({'error': f'La clave debe tener al menos {CLAVE_MIN} caracteres'}), 400
    if len(clave) > CLAVE_MAX:
        return jsonify({'error': f'La clave puede tener hasta {CLAVE_MAX} caracteres'}), 400

    user = usuario_del_token(d.get('token'))
    if not user:
        return jsonify({'error': MENSAJE_ENLACE_MALO, 'codigo': 'enlace_invalido'}), 400

    user.set_password(clave)
    user.debe_cambiar_clave = False
    db.session.commit()
    return jsonify({'message': 'Listo. Ya puedes ingresar con tu clave nueva.'}), 200
