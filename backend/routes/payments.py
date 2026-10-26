"""Plan del colegio y su cobro con Mercado Pago (ver servicios/mercadopago.py).

  Super admin   GET/PUT /api/payments/schools/<id>/plan   define nombre, monto,
                frecuencia y fin de prueba; se sincroniza el plan en Mercado Pago.
  Colegio       GET /api/payments/plan                    lo que ve el admin
                POST /api/payments/plan/suscribir         link de suscripción
                POST /api/payments/plan/verificar         al volver de Mercado Pago
  Mercado Pago  POST /api/payments/mp-webhook             avisos de suscripción y cobros
"""
import logging
from datetime import date, datetime, timedelta
from functools import wraps

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt

from models import db, School, Subscription, SubscriptionPayment
from servicios import mercadopago as mp

logger = logging.getLogger(__name__)
payments_bp = Blueprint('payments', __name__)

FRECUENCIAS = tuple(mp.FRECUENCIAS)


def require_super_admin(fn):
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        if get_jwt().get('role') != 'super_admin':
            return jsonify({'error': 'Acceso denegado'}), 403
        return fn(*args, **kwargs)
    return wrapper


def require_colegio(roles=('admin', 'directivo')):
    def deco(fn):
        @wraps(fn)
        @jwt_required()
        def wrapper(*args, **kwargs):
            claims = get_jwt()
            if claims.get('role') not in roles or not claims.get('school_id'):
                return jsonify({'error': 'Sin permisos'}), 403
            return fn(*args, **kwargs)
        return wrapper
    return deco


def _error_mp(e):
    db.session.rollback()
    return jsonify({'error': str(e)}), (e.status if e.status in (400, 404, 503) else 502)


def plan_payload(school, para_super_admin=False):
    estado = mp.actualizar_estado(school)
    db.session.commit()
    sub = mp.suscripcion_vigente(school) or Subscription.query.filter_by(school_id=school.id)\
        .order_by(Subscription.created_at.desc()).first()
    pagos = SubscriptionPayment.query.filter_by(school_id=school.id)\
        .order_by(SubscriptionPayment.created_at.desc()).limit(24).all()
    data = {
        'colegio': {'id': school.id, 'nombre': school.name},
        'plan': {
            'nombre': school.plan_nombre, 'monto': school.plan_monto,
            'frecuencia': school.plan_frecuencia or 'mensual',
            'trial_ends_at': school.trial_ends_at.isoformat() if school.trial_ends_at else None,
            'dias_prueba': mp.dias_de_prueba(school),
        },
        'estado': estado,
        'suscripcion': sub.to_dict() if sub else None,
        'pagos': [p.to_dict() for p in pagos],
        'mp_configurado': mp.configurado(),
        'vigente_hasta': (school.subscription_expires_at.isoformat()
                          if school.subscription_expires_at else None),
    }
    if para_super_admin:
        data['mp_plan_id'] = school.mp_plan_id
        data['init_point'] = school.mp_init_point
    return data


# ── Colegio ──────────────────────────────────────────────────────────────────

@payments_bp.route('/plan', methods=['GET'])
@require_colegio()
def ver_plan():
    school = School.query.get_or_404(get_jwt()['school_id'])
    return jsonify(plan_payload(school)), 200


@payments_bp.route('/plan/suscribir', methods=['POST'])
@require_colegio(roles=('admin',))
def suscribir():
    """Actualiza la prueba restante en el plan de Mercado Pago y entrega el link."""
    school = School.query.get_or_404(get_jwt()['school_id'])
    if not school.plan_monto:
        return jsonify({'error': 'Tu colegio aún no tiene un plan asignado. '
                                 'Escríbenos para activarlo.'}), 400
    if mp.suscripcion_vigente(school):
        return jsonify({'error': 'El colegio ya tiene una suscripción activa'}), 409
    try:
        url = mp.sincronizar_plan(school)
    except mp.MercadoPagoError as e:
        return _error_mp(e)
    db.session.commit()
    return jsonify({'init_point': url}), 200


@payments_bp.route('/plan/verificar', methods=['POST'])
@require_colegio()
def verificar():
    """Al volver del checkout: registra la suscripción sin esperar el webhook."""
    school = School.query.get_or_404(get_jwt()['school_id'])
    pid = ((request.get_json(silent=True) or {}).get('preapproval_id') or '').strip()
    try:
        if pid:
            sub = mp.procesar_preapproval(pid)
            if sub is not None and sub.school_id != school.id:
                return jsonify({'error': 'Esa suscripción es de otro colegio'}), 403
        elif school.mp_plan_id:
            mp.refrescar_desde_mp(school)
    except mp.MercadoPagoError as e:
        return _error_mp(e)
    return jsonify(plan_payload(school)), 200


# ── Super admin ──────────────────────────────────────────────────────────────

@payments_bp.route('/schools/<int:school_id>/plan', methods=['GET'])
@require_super_admin
def ver_plan_colegio(school_id):
    return jsonify(plan_payload(School.query.get_or_404(school_id), True)), 200


@payments_bp.route('/schools/<int:school_id>/plan', methods=['PUT'])
@require_super_admin
def definir_plan(school_id):
    school = School.query.get_or_404(school_id)
    d = request.get_json(silent=True) or {}
    try:
        monto = int(d.get('monto') or 0)
    except (TypeError, ValueError):
        monto = 0
    if monto <= 0:
        return jsonify({'error': 'Indica el monto del plan en pesos'}), 400
    frecuencia = d.get('frecuencia') or 'mensual'
    if frecuencia not in FRECUENCIAS:
        return jsonify({'error': 'La frecuencia debe ser mensual o anual'}), 400
    fin = None
    if d.get('trial_ends_at'):
        try:
            fin = date.fromisoformat(str(d['trial_ends_at'])[:10])
        except ValueError:
            return jsonify({'error': 'Fecha de fin de prueba no válida'}), 400
        if (fin - date.today()).days + 1 > mp.MAX_PRUEBA_DIAS:
            return jsonify({'error': 'Mercado Pago permite hasta 365 días de prueba'}), 400

    prueba_cambio = fin != school.trial_ends_at
    school.plan_nombre = (str(d.get('nombre') or '').strip() or 'Plan')[:100]
    school.plan_monto = monto
    school.plan_frecuencia = frecuencia
    school.trial_ends_at = fin
    avisos = []
    if mp.configurado():
        try:
            mp.sincronizar_plan(school)
        except mp.MercadoPagoError as e:
            avisos.append(f'El plan se guardó, pero no se pudo actualizar en Mercado Pago: {e}')
        if prueba_cambio:
            aviso = mp.postergar_cobro(school)
            if aviso:
                avisos.append(aviso)
        if mp.suscripcion_vigente(school):
            avisos.append('El colegio ya está suscrito: el nuevo monto rige para nuevas '
                          'suscripciones. La actual mantiene el monto con que se suscribió.')
    else:
        avisos.append('Mercado Pago no está configurado: el plan quedó guardado y se '
                      'publicará cuando se configure MP_ACCESS_TOKEN.')
    db.session.commit()
    data = plan_payload(school, True)
    data['avisos'] = avisos
    return jsonify(data), 200


@payments_bp.route('/schools/<int:school_id>/plan/refrescar', methods=['POST'])
@require_super_admin
def refrescar_plan(school_id):
    school = School.query.get_or_404(school_id)
    try:
        mp.refrescar_desde_mp(school)
    except mp.MercadoPagoError as e:
        return _error_mp(e)
    return jsonify(plan_payload(school, True)), 200


@payments_bp.route('/subscriptions/<int:sub_id>/cancel', methods=['POST'])
@require_super_admin
def cancel_subscription(sub_id):
    sub = Subscription.query.get_or_404(sub_id)
    if mp.configurado() and sub.mp_subscription_id and not sub.mp_subscription_id.startswith('SIM-'):
        try:
            mp._request('PUT', f'/preapproval/{sub.mp_subscription_id}', {'status': 'cancelled'})
        except mp.MercadoPagoError as e:
            return _error_mp(e)
    sub.status = 'cancelled'
    sub.end_date = datetime.utcnow()
    school = sub.school
    if school:
        mp.actualizar_estado(school)
    db.session.commit()
    return jsonify({'message': 'Suscripción cancelada', 'subscription': sub.to_dict()}), 200


@payments_bp.route('/subscriptions/school/<int:school_id>', methods=['GET'])
@jwt_required()
def get_school_subscription(school_id):
    claims = get_jwt()
    if claims.get('role') != 'super_admin' and claims.get('school_id') != school_id:
        return jsonify({'error': 'Acceso denegado'}), 403
    if claims.get('role') not in ('super_admin', 'admin', 'directivo'):
        return jsonify({'error': 'Acceso denegado'}), 403
    sub = Subscription.query.filter_by(school_id=school_id).order_by(Subscription.created_at.desc()).first()
    school = School.query.get(school_id)
    return jsonify({
        'school': school.to_dict() if school else None,
        'subscription': sub.to_dict() if sub else None,
    }), 200


@payments_bp.route('/subscriptions/<int:school_id>/simulate-payment', methods=['POST'])
@require_super_admin
def simulate_payment(school_id):
    """Simula una suscripción pagada. Solo sin Mercado Pago configurado (desarrollo)."""
    if mp.configurado():
        return jsonify({'error': 'La simulación solo está disponible en modo desarrollo'}), 403
    school = School.query.get_or_404(school_id)
    d = request.get_json(silent=True) or {}
    months = int(d.get('months') or 1)
    sub = mp.suscripcion_vigente(school)
    if not sub:
        sub = Subscription(school_id=school.id, plan_type='monthly',
                           amount=school.plan_monto or 0, currency='CLP',
                           mp_subscription_id=f'SIM-{school.id}-{int(datetime.utcnow().timestamp())}',
                           mp_payer_email=d.get('payer_email', 'simulado@test.cl'))
        db.session.add(sub)
    sub.status = 'authorized'
    sub.start_date = datetime.utcnow()
    sub.next_payment_date = datetime.utcnow() + timedelta(days=30 * months)
    school.subscription_expires_at = datetime.utcnow() + timedelta(days=30 * months)
    db.session.flush()
    if school.plan_monto:
        mp.actualizar_estado(school)
    else:
        school.plan, school.plan_status = 'paid', 'active'
    db.session.commit()
    return jsonify({'message': f'Pago simulado por {months} mes(es)',
                    'school': school.to_dict(), 'subscription': sub.to_dict()}), 200


# ── Webhook de Mercado Pago ──────────────────────────────────────────────────

@payments_bp.route('/mp-webhook', methods=['POST'])
def mp_webhook():
    body = request.get_json(silent=True) or {}
    tipo = body.get('type') or request.args.get('type') or request.args.get('topic') or ''
    data_id = (request.args.get('data.id') or (body.get('data') or {}).get('id')
               or request.args.get('id') or '')
    if not mp.firma_valida(request.headers, data_id):
        logger.warning('Webhook MP con firma inválida (type=%s id=%s)', tipo, data_id)
        return jsonify({'error': 'Firma inválida'}), 401
    logger.info('Webhook MP: type=%s id=%s', tipo, data_id)
    if not data_id or not mp.configurado():
        return jsonify({'status': 'ignorado'}), 200
    try:
        if tipo in ('subscription_preapproval', 'preapproval'):
            mp.procesar_preapproval(data_id)
        elif tipo == 'subscription_authorized_payment':
            mp.procesar_cobro(data_id)
    except mp.MercadoPagoError as e:
        db.session.rollback()
        logger.error('Webhook MP %s %s: %s', tipo, data_id, e)
        # 404: el recurso no existe (p. ej. la simulación del panel de Mercado Pago)
        return jsonify({'error': str(e)}), (200 if e.status == 404 else 500)
    return jsonify({'status': 'ok'}), 200
