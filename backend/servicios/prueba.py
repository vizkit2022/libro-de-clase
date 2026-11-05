"""Prueba gratis de los colegios que se registran solos.

Reglas:
  - Solo se bloquea a los colegios con origen='autoregistro'. Los de origen NULL
    (creados por el super admin) nunca: su comportamiento no cambia.
  - Vencida = trial_ends_at ya pasó y no hay suscripción vigente. Quien paga o tiene
    plazo pagado (subscription_expires_at) no se bloquea aunque la prueba termine.
  - Vencida significa solo lectura: los métodos de escritura responden 402.

`instalar(app)` agrega además dos cortes globales, deliberadamente por negación:
  - Un admin sin colegio no llega a ninguna ruta de colegio. Muchas rutas filtran
    por el school_id del token y no se pensaron para que viniera vacío.
  - Si el dueño real de un correo reclamó la cuenta con Google, los tokens emitidos
    antes de eso dejan de valer (ver routes/registro.py).
"""
from datetime import date, datetime

from flask import jsonify, request

from models import db, School, User
from servicios import mercadopago as mp

METODOS_ESCRITURA = ('POST', 'PUT', 'PATCH', 'DELETE')

# No exigen sesión y deben responder aunque el navegador mande un token viejo
_RUTAS_PUBLICAS = ('/api/auth/login', '/api/auth/health', '/api/registro/config',
                   '/api/registro/google', '/api/uf', '/api/leads')
_REGISTRO = '/api/registro'
# Un admin sin colegio solo puede usar su sesión y crear su colegio
_LIBRES_SIN_COLEGIO = ('/api/auth/', _REGISTRO + '/', '/api/uf', '/api/leads')
# Con la prueba vencida hay que poder entrar, pagar y recibir ayuda del super admin
_LIBRES_DE_BLOQUEO = ('/api/auth/', _REGISTRO + '/', '/api/payments/', '/api/super-admin/',
                      '/api/leads')


def suscrito(school):
    if mp.suscripcion_vigente(school):
        return True
    fin = school.subscription_expires_at
    return bool(fin and fin > datetime.utcnow())


def datos_prueba(school, hoy=None):
    """{dias_restantes, termina, vencida, suscrito}. Nunca vencida si no es autoregistro."""
    hoy = hoy or date.today()
    pagado = suscrito(school)
    fin = school.trial_ends_at
    return {
        'dias_restantes': mp.dias_de_prueba(school, hoy),
        'termina': fin.isoformat() if fin else None,
        'vencida': bool(school.origen == 'autoregistro' and fin and fin < hoy and not pagado),
        'suscrito': pagado,
    }


def prueba_vencida(school):
    return datos_prueba(school)['vencida']


def _ruta_en(path, rutas):
    return any(path == r or path.startswith(r if r.endswith('/') else r + '/') for r in rutas)


def _claims_de_la_request():
    """Claims de un JWT válido, o {} si no viene o no sirve (de eso se encarga la ruta)."""
    try:
        from flask_jwt_extended import verify_jwt_in_request, get_jwt
        verify_jwt_in_request(optional=True)
        return get_jwt() or {}
    except Exception:
        return {}


def _corte(path, method):
    """La respuesta con que se corta la request, o None si sigue su curso."""
    if not path.startswith('/api/') or method == 'OPTIONS':
        return None
    if path == _REGISTRO or _ruta_en(path, _RUTAS_PUBLICAS):
        return None
    claims = _claims_de_la_request()
    if not claims:
        return None

    if claims.get('sin_verificar'):
        verificado = db.session.query(User.email_verificado).filter_by(
            id=int(claims.get('sub') or 0)).scalar()
        if verificado:
            return jsonify({'error': 'Tu sesión ya no es válida. Vuelve a ingresar.',
                            'codigo': 'sesion_invalidada'}), 401

    rol, school_id = claims.get('role'), claims.get('school_id')
    if rol == 'admin' and not school_id:
        if _ruta_en(path, _LIBRES_SIN_COLEGIO):
            return None
        return jsonify({'error': 'Primero crea tu colegio',
                        'codigo': 'sin_colegio'}), 403

    if (method in METODOS_ESCRITURA and school_id and rol != 'super_admin'
            and not _ruta_en(path, _LIBRES_DE_BLOQUEO)):
        # Primero solo el origen: a los colegios antiguos les cuesta una consulta mínima
        origen = db.session.query(School.origen).filter_by(id=school_id).scalar()
        if origen == 'autoregistro' and prueba_vencida(db.session.get(School, school_id)):
            return jsonify({
                'error': 'Tu prueba terminó. Tus datos siguen aquí: suscríbete para '
                         'seguir haciendo cambios.',
                'codigo': 'prueba_vencida'}), 402
    return None


def instalar(app):
    @app.before_request
    def _guardia_colegio():
        return _corte(request.path, request.method)
