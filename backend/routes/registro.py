"""Registro propio: cuenta con clave o con Google, y creación del colegio.

  GET  /api/registro/config    público: client_id de Google y días de prueba
  POST /api/registro           público: cuenta con correo y clave
  POST /api/registro/google    público: entra o se registra con Google
  POST /api/registro/colegio   JWT: el admin recién registrado crea su colegio

Variable de entorno:
  GOOGLE_CLIENT_ID   Client ID de Google Identity Services. Sin ella no hay botón.

Pre-secuestro de cuentas: como la clave no pasa por una verificación de correo,
alguien podría registrar el correo de otra persona antes que ella. Si después el
dueño real entra con Google, se invalida esa clave y los tokens ya emitidos con
ella (servicios/prueba.py), para que el intruso no conserve el acceso.
"""
import os
import re
import threading
import time
from collections import defaultdict, deque
from datetime import date, datetime, timedelta
from functools import wraps

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from models import (db, School, User, PlanCatalogo, CLAVE_INUTILIZABLE,
                    ensure_authorization_templates)
from routes.auth import emitir_token, school_payload
from routes.super_admin import _create_default_periods
from servicios.auditoria import registrar_login

registro_bp = Blueprint('registro', __name__)

EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
DIAS_PRUEBA_POR_DEFECTO = 30
CLAVE_MIN, CLAVE_MAX = 8, 200


# ── Límite de intentos por IP ─────────────────────────────────────────────
# En memoria: se cuenta por proceso (con 2 workers el tope real es hasta el doble)
# y se reinicia al desplegar. Alcanza para frenar el abuso automatizado.
VENTANA_SEGUNDOS = 600
_INTENTOS = defaultdict(deque)
_CANDADO = threading.Lock()


def ip_para_limite():
    """IP del cliente detrás del proxy.

    No sirve el primer valor de X-Forwarded-For (el que usa la auditoría): lo escribe
    el propio cliente, y cambiándolo se saltaría el límite. El último lo agrega el proxy.
    """
    real = (request.headers.get('X-Real-IP') or '').strip()
    if real:
        return real[:64]
    xff = request.headers.get('X-Forwarded-For', '')
    if xff:
        return xff.split(',')[-1].strip()[:64]
    return (request.remote_addr or '')[:64]


def limitar_intentos(tope):
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            ahora = time.monotonic()
            clave = (fn.__name__, ip_para_limite())
            with _CANDADO:
                # Limpieza de paso, para que el diccionario no crezca sin fin
                if len(_INTENTOS) > 10000:
                    _INTENTOS.clear()
                cola = _INTENTOS[clave]
                while cola and ahora - cola[0] > VENTANA_SEGUNDOS:
                    cola.popleft()
                if len(cola) >= tope:
                    return jsonify({'error': 'Demasiados intentos. Espera unos minutos '
                                             'y vuelve a probar.'}), 429
                cola.append(ahora)
            return fn(*args, **kwargs)
        return wrapper
    return deco


# ── Utilidades ────────────────────────────────────────────────────────────

def _cuerpo():
    d = request.get_json(silent=True)
    return d if isinstance(d, dict) else {}


def _texto(valor):
    return valor.strip() if isinstance(valor, str) else ''


def _buscar_por_correo(email):
    # Hay correos antiguos guardados con mayúsculas: se compara sin distinguirlas
    return User.query.filter(func.lower(User.email) == email).order_by(User.id).first()


def _dias_prueba():
    plan = PlanCatalogo.vigente()
    return plan.dias_prueba if plan else DIAS_PRUEBA_POR_DEFECTO


def _google_client_id():
    return (os.environ.get('GOOGLE_CLIENT_ID') or '').strip() or None


def _respuesta_sesion(user, **extra):
    school = db.session.get(School, user.school_id) if user.school_id else None
    return {'access_token': emitir_token(user), 'user': user.to_dict(),
            'school': school_payload(school), **extra}


# ── Públicos ──────────────────────────────────────────────────────────────

@registro_bp.route('/config', methods=['GET'])
def config():
    return jsonify({'google_client_id': _google_client_id(),
                    'dias_prueba': _dias_prueba()}), 200


@registro_bp.route('', methods=['POST'])
@limitar_intentos(10)
def registrar():
    d = _cuerpo()
    nombre, apellido = _texto(d.get('nombre')), _texto(d.get('apellido'))
    email = _texto(d.get('email')).lower()
    clave = d.get('password') if isinstance(d.get('password'), str) else ''

    if not nombre or not apellido:
        return jsonify({'error': 'Cuéntanos tu nombre y apellido'}), 400
    if len(nombre) > 100 or len(apellido) > 100:
        return jsonify({'error': 'El nombre o el apellido es demasiado largo'}), 400
    if not EMAIL_RE.match(email) or len(email) > 120:
        return jsonify({'error': 'El correo no parece válido'}), 400
    if len(clave) < CLAVE_MIN:
        return jsonify({'error': f'La clave debe tener al menos {CLAVE_MIN} caracteres'}), 400
    if len(clave) > CLAVE_MAX:
        return jsonify({'error': f'La clave puede tener hasta {CLAVE_MAX} caracteres'}), 400

    ya_existe = {'error': 'Ese correo ya tiene una cuenta. Ingresa con él o usa Google.'}
    if _buscar_por_correo(email):
        return jsonify(ya_existe), 409

    user = User(school_id=None, email=email, first_name=nombre, last_name=apellido,
                role='admin', is_active=True, email_verificado=False,
                origen_registro='password', last_login=datetime.utcnow())
    user.set_password(clave)
    db.session.add(user)
    try:
        db.session.commit()
    except IntegrityError:          # dos registros simultáneos con el mismo correo
        db.session.rollback()
        return jsonify(ya_existe), 409
    registrar_login(user, email=email, ok=True, status_code=201)
    return jsonify(_respuesta_sesion(user)), 201


def verificar_token_google(credential, client_id):
    """Firma, emisor, vencimiento y audiencia. Lanza si el token no sirve."""
    from google.oauth2 import id_token
    from google.auth.transport import requests as google_requests
    return id_token.verify_oauth2_token(credential, google_requests.Request(), client_id,
                                        clock_skew_in_seconds=10)


@registro_bp.route('/google', methods=['POST'])
@limitar_intentos(30)     # también es un login: un colegio entero puede compartir IP
def registrar_google():
    client_id = _google_client_id()
    if not client_id:
        return jsonify({'error': 'El ingreso con Google no está disponible'}), 503
    credential = _texto(_cuerpo().get('credential'))
    if not credential:
        return jsonify({'error': 'Falta la credencial de Google'}), 400

    try:
        from google.auth.exceptions import TransportError
    except ImportError:
        return jsonify({'error': 'El ingreso con Google no está disponible'}), 503
    try:
        info = verificar_token_google(credential, client_id)
    except TransportError:
        return jsonify({'error': 'No pudimos conectarnos con Google. Vuelve a probar.'}), 503
    except Exception:
        registrar_login(ok=False, motivo='Credencial de Google inválida', status_code=401)
        return jsonify({'error': 'Google no validó tu ingreso. Vuelve a intentarlo.'}), 401

    email = _texto(info.get('email')).lower()
    sub = _texto(info.get('sub'))
    # Google puede entregar correos sin comprobar (cuentas con correo ajeno)
    if not sub or not email or info.get('email_verified') not in (True, 'true'):
        registrar_login(email=email, ok=False, motivo='Correo de Google sin verificar',
                        status_code=401)
        return jsonify({'error': 'Tu correo de Google no está verificado'}), 401
    if len(email) > 120:
        return jsonify({'error': 'El correo es demasiado largo'}), 400

    user = User.query.filter_by(google_sub=sub).first() or _buscar_por_correo(email)
    nuevo = user is None

    if user is not None:
        # El super admin tiene acceso a todos los colegios: entra solo con su clave
        if user.role == 'super_admin':
            registrar_login(user, email=email, ok=False, motivo='Super admin con Google',
                            status_code=403)
            return jsonify({'error': 'Esta cuenta debe ingresar con su clave'}), 403
        if not user.is_active:
            registrar_login(user, email=email, ok=False, motivo='Cuenta desactivada',
                            status_code=403)
            return jsonify({'error': 'Tu cuenta está desactivada. Habla con tu colegio.'}), 403
        if user.google_sub and user.google_sub != sub:
            registrar_login(user, email=email, ok=False, motivo='Otra cuenta de Google',
                            status_code=409)
            return jsonify({'error': 'Esa cuenta ya está vinculada a otra cuenta de Google'}), 409
        if not user.google_sub:
            # Alguien pudo crear la cuenta antes que el dueño del correo: con clave
            # propia, o como admin de un colegio autoregistrado. Los colegios creados
            # por el super admin conservan la clave: ahí no hay registro abierto.
            colegio = db.session.get(School, user.school_id) if user.school_id else None
            if not user.email_verificado and (
                    user.origen_registro == 'password'
                    or (colegio and colegio.origen == 'autoregistro')):
                user.password_hash = CLAVE_INUTILIZABLE
            user.google_sub = sub
            user.email_verificado = True
    else:
        user = User(school_id=None, email=email,
                    first_name=(_texto(info.get('given_name')) or email.split('@')[0])[:100],
                    last_name=(_texto(info.get('family_name')) or '-')[:100],
                    role='admin', is_active=True, email_verificado=True,
                    google_sub=sub, origen_registro='google',
                    password_hash=CLAVE_INUTILIZABLE)
        db.session.add(user)

    user.last_login = datetime.utcnow()
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({'error': 'No pudimos completar tu ingreso. Vuelve a intentarlo.'}), 409
    registrar_login(user, email=email, ok=True)
    return jsonify(_respuesta_sesion(user, nuevo=nuevo)), 200


# ── Bienvenida ────────────────────────────────────────────────────────────

@registro_bp.route('/colegio', methods=['POST'])
@jwt_required()
def crear_colegio():
    # Bloquea la fila: dos clics seguidos no deben dejar un colegio huérfano.
    # Se mira la base y no el token, que puede ser anterior a la creación.
    user = User.query.filter_by(id=int(get_jwt_identity())).with_for_update().first()
    if not user or user.role != 'admin' or not user.is_active:
        db.session.rollback()
        return jsonify({'error': 'Sin permisos'}), 403
    if user.school_id:
        db.session.rollback()
        return jsonify({'error': 'Tu cuenta ya tiene un colegio'}), 409

    d = _cuerpo()
    nombre, comuna = _texto(d.get('nombre')), _texto(d.get('comuna'))
    telefono, tipo = _texto(d.get('telefono')), _texto(d.get('tipo'))
    if not nombre:
        return jsonify({'error': 'Cuéntanos cómo se llama tu colegio'}), 400
    for valor, tope, etiqueta in ((nombre, 200, 'El nombre del colegio'), (comuna, 100, 'La comuna'),
                                  (telefono, 50, 'El teléfono'), (tipo, 50, 'El tipo de colegio')):
        if len(valor) > tope:
            return jsonify({'error': f'{etiqueta} es demasiado largo'}), 400
    cantidad = d.get('cantidad_alumnos_aprox')
    if cantidad in (None, ''):
        cantidad = None
    else:
        try:
            cantidad = int(cantidad)
        except (TypeError, ValueError):
            return jsonify({'error': 'La cantidad de alumnos debe ser un número'}), 400
        if isinstance(d.get('cantidad_alumnos_aprox'), bool) or not 0 <= cantidad <= 100000:
            return jsonify({'error': 'La cantidad de alumnos no parece correcta'}), 400

    plan = PlanCatalogo.vigente()
    dias = plan.dias_prueba if plan else DIAS_PRUEBA_POR_DEFECTO
    hoy = date.today()
    school = School(
        name=nombre, rut=None, phone=telefono or None, comuna=comuna or None,
        tipo_establecimiento=tipo or None, cantidad_alumnos_aprox=cantidad,
        origen='autoregistro', tiene_demo=False, is_active=True,
        # Sin monto no hay nada que cobrar todavía; mercadopago.actualizar_estado
        # lo pasa a 'paid' cuando el plan tenga precio
        plan='paid' if plan and plan.monto else 'free', plan_status='trial',
        trial_ends_at=hoy + timedelta(days=dias - 1),
        plan_nombre=plan.nombre if plan else None,
        plan_monto=plan.monto if plan else None,
        plan_frecuencia=plan.frecuencia if plan else 'mensual',
        # Sin esto, _year_de asume el año siguiente para un colegio sin cursos, y los
        # períodos recién creados son de este año
        onboarding_year=hoy.year,
    )
    db.session.add(school)
    db.session.flush()
    user.school_id = school.id
    _create_default_periods(school.id)
    ensure_authorization_templates(school.id)
    db.session.commit()

    return jsonify(_respuesta_sesion(
        user, prueba={'dias': dias, 'termina': school.trial_ends_at.isoformat()})), 201
