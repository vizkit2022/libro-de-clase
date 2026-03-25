"""
Integración con Mercado Pago para suscripciones mensuales.

Para funcionar necesita las variables de entorno:
  MP_ACCESS_TOKEN   → Tu Access Token (producción o sandbox)
  APP_BASE_URL      → URL base de la app (ej: http://localhost:5008 en local)

Flujo de suscripción:
  1. Frontend llama POST /api/payments/subscriptions/create con school_id
  2. Backend crea una suscripción en MP y devuelve la init_point (URL de pago)
  3. Frontend redirige al usuario a esa URL
  4. Usuario paga en MP y es redirigido de vuelta a la app
  5. MP envía webhook a POST /api/payments/mp-webhook
  6. Backend actualiza el estado de la suscripción y el plan del colegio
"""
import os
import json
import hmac
import hashlib
import logging
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
from models import db, School, Subscription
from datetime import datetime, timedelta
from functools import wraps

logger = logging.getLogger(__name__)
payments_bp = Blueprint('payments', __name__)

# Precio mensual en CLP
MONTHLY_PRICE_CLP = 29990

def get_mp_sdk():
    """Inicializa el SDK de Mercado Pago."""
    try:
        import mercadopago
        access_token = os.environ.get('MP_ACCESS_TOKEN')
        if not access_token:
            return None, 'MP_ACCESS_TOKEN no configurado'
        sdk = mercadopago.SDK(access_token)
        return sdk, None
    except ImportError:
        return None, 'SDK de Mercado Pago no instalado. Ejecuta: pip install mercadopago'


def require_super_admin(fn):
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        claims = get_jwt()
        if claims.get('role') != 'super_admin':
            return jsonify({'error': 'Acceso denegado'}), 403
        return fn(*args, **kwargs)
    return wrapper


# ── Crear suscripción MP ──────────────────────────────────────────────────────
@payments_bp.route('/subscriptions/create', methods=['POST'])
@require_super_admin
def create_subscription():
    """
    Crea una suscripción mensual en Mercado Pago para un colegio.
    Devuelve la URL de checkout (init_point) para redirigir al usuario.
    """
    data = request.get_json()
    school_id = data.get('school_id')
    payer_email = data.get('payer_email', '')

    school = School.query.get(school_id)
    if not school:
        return jsonify({'error': 'Colegio no encontrado'}), 404

    sdk, error = get_mp_sdk()
    if not sdk:
        return jsonify({'error': error}), 503

    base_url = os.environ.get('APP_BASE_URL', 'http://localhost:5008')

    # Crear suscripción (preapproval) en Mercado Pago
    subscription_data = {
        "reason": f"Suscripción mensual - {school.name}",
        "auto_recurring": {
            "frequency": 1,
            "frequency_type": "months",
            "transaction_amount": MONTHLY_PRICE_CLP,
            "currency_id": "CLP",
        },
        "payer_email": payer_email,
        "back_url": f"{base_url}/super-admin/schools/{school_id}",
        "external_reference": str(school_id),
        "status": "pending",
    }

    response = sdk.preapproval().create(subscription_data)
    result = response.get('response', {})

    if response.get('status') not in [200, 201]:
        logger.error(f"Error MP: {result}")
        return jsonify({'error': 'Error al crear suscripción en Mercado Pago', 'details': result}), 502

    # Guardar en BD
    sub = Subscription(
        school_id=school_id,
        plan_type='monthly',
        amount=MONTHLY_PRICE_CLP,
        currency='CLP',
        status='pending',
        mp_subscription_id=result.get('id'),
        mp_payer_email=payer_email,
    )
    db.session.add(sub)
    db.session.commit()

    return jsonify({
        'subscription_id': sub.id,
        'mp_subscription_id': result.get('id'),
        'init_point': result.get('init_point'),    # URL de pago
        'sandbox_init_point': result.get('sandbox_init_point'),
    }), 201


# ── Cancelar suscripción ──────────────────────────────────────────────────────
@payments_bp.route('/subscriptions/<int:sub_id>/cancel', methods=['POST'])
@require_super_admin
def cancel_subscription(sub_id):
    sub = Subscription.query.get_or_404(sub_id)

    sdk, error = get_mp_sdk()
    if sdk and sub.mp_subscription_id:
        try:
            sdk.preapproval().update(sub.mp_subscription_id, {"status": "cancelled"})
        except Exception as e:
            logger.warning(f"No se pudo cancelar en MP: {e}")

    sub.status = 'cancelled'
    sub.end_date = datetime.utcnow()

    # Actualizar plan del colegio
    school = sub.school
    if school:
        school.plan = 'free'
        school.plan_status = 'inactive'
        school.subscription_expires_at = None

    db.session.commit()
    return jsonify({'message': 'Suscripción cancelada', 'subscription': sub.to_dict()}), 200


# ── Estado de suscripción ─────────────────────────────────────────────────────
@payments_bp.route('/subscriptions/school/<int:school_id>', methods=['GET'])
@jwt_required()
def get_school_subscription(school_id):
    claims = get_jwt()
    role = claims.get('role')
    # Solo super_admin o el admin del colegio pueden ver esto
    if role not in ['super_admin', 'admin', 'directivo']:
        return jsonify({'error': 'Acceso denegado'}), 403

    sub = Subscription.query.filter_by(school_id=school_id).order_by(Subscription.created_at.desc()).first()
    school = School.query.get(school_id)

    return jsonify({
        'school': school.to_dict() if school else None,
        'subscription': sub.to_dict() if sub else None,
    }), 200


# ── Webhook de Mercado Pago ───────────────────────────────────────────────────
@payments_bp.route('/mp-webhook', methods=['POST'])
def mp_webhook():
    """
    Recibe notificaciones de Mercado Pago sobre cambios en suscripciones.
    MP envía POST cuando el estado de un preapproval cambia.
    """
    data = request.get_json(silent=True) or {}
    topic = data.get('type') or request.args.get('topic', '')
    resource_id = data.get('data', {}).get('id') or request.args.get('id', '')

    logger.info(f"MP Webhook recibido: topic={topic}, id={resource_id}")

    if topic in ['subscription_preapproval', 'preapproval']:
        sdk, error = get_mp_sdk()
        if not sdk:
            return jsonify({'error': error}), 503

        try:
            response = sdk.preapproval().get(resource_id)
            preapproval = response.get('response', {})
            _process_preapproval(preapproval)
        except Exception as e:
            logger.error(f"Error procesando webhook MP: {e}")
            return jsonify({'error': str(e)}), 500

    return jsonify({'status': 'ok'}), 200


def _process_preapproval(preapproval: dict):
    """Actualiza el estado de la suscripción y el plan del colegio."""
    mp_id = preapproval.get('id')
    mp_status = preapproval.get('status')  # authorized, paused, cancelled, pending
    school_id_str = preapproval.get('external_reference', '')

    sub = Subscription.query.filter_by(mp_subscription_id=mp_id).first()
    if not sub and school_id_str:
        # Crear registro si no existe
        try:
            school_id = int(school_id_str)
            sub = Subscription(
                school_id=school_id,
                plan_type='monthly',
                amount=MONTHLY_PRICE_CLP,
                currency='CLP',
                mp_subscription_id=mp_id,
            )
            db.session.add(sub)
        except (ValueError, TypeError):
            logger.error(f"external_reference inválido: {school_id_str}")
            return

    if sub:
        sub.status = mp_status or 'pending'
        sub.mp_payer_email = preapproval.get('payer_email', sub.mp_payer_email)

        if mp_status == 'authorized':
            sub.start_date = datetime.utcnow()
            sub.next_payment_date = datetime.utcnow() + timedelta(days=30)
            # Activar plan de pago en el colegio
            school = sub.school
            if school:
                school.plan = 'paid'
                school.plan_status = 'active'
                school.subscription_expires_at = datetime.utcnow() + timedelta(days=30)

        elif mp_status in ['cancelled', 'expired']:
            sub.end_date = datetime.utcnow()
            school = sub.school
            if school:
                school.plan = 'free'
                school.plan_status = 'inactive'

        db.session.commit()
        logger.info(f"Suscripción {mp_id} actualizada a estado: {mp_status}")


# ── Simular pago (solo desarrollo) ───────────────────────────────────────────
@payments_bp.route('/subscriptions/<int:school_id>/simulate-payment', methods=['POST'])
@require_super_admin
def simulate_payment(school_id):
    """
    Simula un pago exitoso para desarrollo local (sin necesitar Mercado Pago real).
    Solo disponible cuando MP_ACCESS_TOKEN no está configurado.
    """
    if os.environ.get('MP_ACCESS_TOKEN'):
        return jsonify({'error': 'La simulación solo está disponible en modo desarrollo'}), 403

    school = School.query.get_or_404(school_id)
    data = request.get_json() or {}
    months = data.get('months', 1)

    # Crear o actualizar suscripción simulada
    sub = Subscription.query.filter_by(school_id=school_id, status='authorized').first()
    if not sub:
        sub = Subscription(
            school_id=school_id,
            plan_type='monthly',
            amount=MONTHLY_PRICE_CLP,
            currency='CLP',
            mp_subscription_id=f'SIM-{school_id}-{int(datetime.utcnow().timestamp())}',
            mp_payer_email=data.get('payer_email', 'simulado@test.cl'),
        )
        db.session.add(sub)

    sub.status = 'authorized'
    sub.start_date = datetime.utcnow()
    sub.next_payment_date = datetime.utcnow() + timedelta(days=30 * months)

    school.plan = 'paid'
    school.plan_status = 'active'
    school.subscription_expires_at = datetime.utcnow() + timedelta(days=30 * months)

    db.session.commit()
    return jsonify({
        'message': f'Pago simulado exitosamente por {months} mes(es)',
        'school': school.to_dict(),
        'subscription': sub.to_dict(),
    }), 200
