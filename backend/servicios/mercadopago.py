"""Cobro del plan de cada colegio con suscripciones de Mercado Pago.

Modelo:
  - El super admin define el plan del colegio: nombre, monto (CLP), frecuencia
    (mensual o anual) y el último día de prueba.
  - Cada colegio tiene su propio preapproval_plan en Mercado Pago. La prueba se
    expresa como free_trial en días, contados desde que el colegio se suscribe;
    por eso el plan se vuelve a sincronizar justo antes de entregar el link de
    pago, con los días que quedan hasta trial_ends_at.
  - El administrador del colegio entra al link (init_point), registra su
    tarjeta y queda suscrito. Mercado Pago cobra solo al terminar la prueba y
    luego en cada período.
  - Los cambios llegan por webhook (subscription_preapproval y
    subscription_authorized_payment). Igual se consultan a la API: el aviso solo
    dice qué cambió, el dato confiable es el que entrega Mercado Pago.

Variables de entorno:
  MP_ACCESS_TOKEN     Access Token de la cuenta que recibe los pagos
  APP_BASE_URL        URL pública de la plataforma (https://...), para volver
  MP_WEBHOOK_SECRET   Clave secreta de las notificaciones (valida x-signature)
"""
import hashlib
import hmac
import json
import logging
import os
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta

from models import db, School, Subscription, SubscriptionPayment

logger = logging.getLogger(__name__)

API = 'https://api.mercadopago.com'
FRECUENCIAS = {'mensual': 1, 'anual': 12}      # meses por cobro
MAX_PRUEBA_DIAS = 365                         # límite de free_trial en Mercado Pago
URL_POR_DEFECTO = 'https://kolevia.cl'


class MercadoPagoError(Exception):
    def __init__(self, mensaje, status=None, detalle=None):
        super().__init__(mensaje)
        self.status = status
        self.detalle = detalle


def configurado():
    return bool(os.environ.get('MP_ACCESS_TOKEN'))


def _request(metodo, ruta, cuerpo=None):
    """Llamada a la API de Mercado Pago. Devuelve el JSON de respuesta."""
    token = os.environ.get('MP_ACCESS_TOKEN')
    if not token:
        raise MercadoPagoError('Mercado Pago no está configurado (falta MP_ACCESS_TOKEN)', 503)
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(API + ruta, data=datos, method=metodo, headers={
        'Authorization': f'Bearer {token}', 'Content-Type': 'application/json',
    })
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        try:
            detalle = json.loads(e.read() or b'{}')
        except ValueError:
            detalle = {}
        logger.warning('Mercado Pago %s %s → %s %s', metodo, ruta, e.code, detalle)
        raise MercadoPagoError(detalle.get('message') or f'Mercado Pago respondió {e.code}',
                               e.code, detalle) from None
    except urllib.error.URLError as e:
        raise MercadoPagoError(f'No se pudo conectar con Mercado Pago: {e.reason}', 502) from None


def base_url():
    """URL de retorno: Mercado Pago exige https, así que en local se usa la pública."""
    url = (os.environ.get('APP_BASE_URL') or '').rstrip('/')
    return url if url.startswith('https://') else URL_POR_DEFECTO


# ── Estado del plan ────────────────────────────────────────────────────────

def suscripcion_vigente(school):
    """Última suscripción autorizada (o pausada) del colegio, si la hay."""
    return Subscription.query.filter(Subscription.school_id == school.id,
                                     Subscription.status.in_(('authorized', 'paused')))\
        .order_by(Subscription.created_at.desc()).first()


def dias_de_prueba(school, hoy=None):
    """Días que quedan de prueba, contando hoy (0 si ya terminó o no hay)."""
    if not school.trial_ends_at:
        return 0
    hoy = hoy or date.today()
    return max(0, (school.trial_ends_at - hoy).days + 1)


def estado_plan(school, hoy=None):
    """sin_plan | prueba | suscrito_en_prueba | activo | pago_pendiente | vencido | pausado"""
    if not school.plan_monto:
        return 'sin_plan'
    hoy = hoy or date.today()
    sub = suscripcion_vigente(school)
    en_prueba = dias_de_prueba(school, hoy) > 0
    if sub and sub.status == 'paused':
        return 'pausado'
    if sub:
        if en_prueba:
            return 'suscrito_en_prueba'
        ultimo = SubscriptionPayment.query.filter_by(school_id=school.id)\
            .order_by(SubscriptionPayment.created_at.desc()).first()
        # recycling = Mercado Pago está reintentando un cobro rechazado
        if ultimo and (ultimo.status == 'recycling'
                       or ultimo.payment_status in ('rejected', 'cancelled')):
            return 'pago_pendiente'
        return 'activo'
    return 'prueba' if en_prueba else 'vencido'


PLAN_STATUS = {   # estado → School.plan_status (lo que ya usa el resto de la plataforma)
    'sin_plan': None, 'prueba': 'trial', 'suscrito_en_prueba': 'trial', 'activo': 'active',
    'pago_pendiente': 'active', 'pausado': 'inactive', 'vencido': 'expired',
}


def actualizar_estado(school):
    """Refleja el estado del plan en School.plan / plan_status. No hace commit."""
    estado = estado_plan(school)
    if estado != 'sin_plan':
        school.plan = 'paid'
        school.plan_status = PLAN_STATUS[estado]
    return estado


# ── Plan en Mercado Pago ───────────────────────────────────────────────────

def _payload_plan(school):
    meses = FRECUENCIAS.get(school.plan_frecuencia or 'mensual', 1)
    dias = min(dias_de_prueba(school), MAX_PRUEBA_DIAS)
    auto = {
        'frequency': meses, 'frequency_type': 'months',
        'transaction_amount': int(school.plan_monto), 'currency_id': 'CLP',
        'free_trial': {'frequency': dias, 'frequency_type': 'days'} if dias else None,
    }
    return {
        'reason': f'Recreo Edu · {school.plan_nombre or "Plan"} · {school.name}'[:250],
        'external_reference': f'school-{school.id}',
        'auto_recurring': auto,
        'back_url': f'{base_url()}/plan',
    }


def sincronizar_plan(school):
    """Crea o actualiza el preapproval_plan del colegio con el monto y los días
    de prueba de hoy. Devuelve el init_point (link de suscripción). No hace commit."""
    if not school.plan_monto:
        raise MercadoPagoError('El colegio no tiene un plan con monto definido', 400)
    payload = _payload_plan(school)
    if school.mp_plan_id:
        try:
            r = _request('PUT', f'/preapproval_plan/{school.mp_plan_id}', payload)
        except MercadoPagoError as e:
            if e.status != 404:
                raise
            school.mp_plan_id = None        # se borró en Mercado Pago: se crea otro
    if not school.mp_plan_id:
        r = _request('POST', '/preapproval_plan', payload)
        school.mp_plan_id = r.get('id')
    school.mp_init_point = r.get('init_point') or school.mp_init_point
    return school.mp_init_point


def postergar_cobro(school):
    """Si el colegio ya está suscrito y se alarga la prueba, mueve el próximo
    cobro al día siguiente del fin de prueba. Devuelve None si resultó, o un
    mensaje explicando por qué no."""
    sub = suscripcion_vigente(school)
    if not sub or not sub.mp_subscription_id or not school.trial_ends_at:
        return None
    inicio = datetime.combine(school.trial_ends_at + timedelta(days=1), datetime.min.time())
    try:
        _request('PUT', f'/preapproval/{sub.mp_subscription_id}', {
            'auto_recurring': {'start_date': inicio.strftime('%Y-%m-%dT%H:%M:%S.000-03:00')}})
        sub.next_payment_date = inicio
        return None
    except MercadoPagoError as e:
        return (f'Mercado Pago no aceptó mover el próximo cobro ({e}). La suscripción '
                'sigue con su fecha original.')


# ── Notificaciones ─────────────────────────────────────────────────────────

def firma_valida(headers, data_id):
    """Valida x-signature (HMAC-SHA256). Sin MP_WEBHOOK_SECRET no se valida."""
    secreto = os.environ.get('MP_WEBHOOK_SECRET')
    if not secreto:
        return True
    partes = dict(p.strip().split('=', 1) for p in (headers.get('x-signature') or '').split(',')
                  if '=' in p)
    ts, v1 = partes.get('ts'), partes.get('v1')
    if not ts or not v1:
        return False
    manifiesto = f'id:{str(data_id).lower()};request-id:{headers.get("x-request-id", "")};ts:{ts};'
    esperado = hmac.new(secreto.encode(), manifiesto.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(esperado, v1)


def _fecha(valor):
    if not valor:
        return None
    try:
        return datetime.fromisoformat(str(valor).replace('Z', '+00:00')).replace(tzinfo=None)
    except ValueError:
        return None


def _colegio_de(preapproval):
    plan_id = preapproval.get('preapproval_plan_id')
    if plan_id:
        s = School.query.filter_by(mp_plan_id=plan_id).first()
        if s:
            return s
    ref = str(preapproval.get('external_reference') or '')
    if ref.startswith('school-') and ref[7:].isdigit():
        return School.query.get(int(ref[7:]))
    return None


def procesar_preapproval(preapproval_id):
    """Trae la suscripción desde Mercado Pago y la registra. Hace commit."""
    p = _request('GET', f'/preapproval/{preapproval_id}')
    school = _colegio_de(p)
    if school is None:
        logger.warning('preapproval %s sin colegio asociado', preapproval_id)
        return None
    sub = Subscription.query.filter_by(mp_subscription_id=p.get('id')).first()
    if sub is None:
        sub = Subscription(school_id=school.id, mp_subscription_id=p.get('id'))
        db.session.add(sub)
    auto = p.get('auto_recurring') or {}
    sub.plan_type = 'annual' if auto.get('frequency') == 12 else 'monthly'
    sub.amount = auto.get('transaction_amount') or school.plan_monto
    sub.currency = auto.get('currency_id') or 'CLP'
    sub.status = p.get('status') or 'pending'
    sub.mp_payer_email = p.get('payer_email') or sub.mp_payer_email
    sub.start_date = sub.start_date or _fecha(p.get('date_created'))
    sub.next_payment_date = _fecha(p.get('next_payment_date')) or sub.next_payment_date
    if sub.status in ('cancelled', 'finished'):
        sub.end_date = sub.end_date or datetime.utcnow()
    db.session.flush()
    actualizar_estado(school)
    db.session.commit()
    return sub


def procesar_cobro(authorized_payment_id):
    """Registra un cobro de la suscripción (authorized_payment). Hace commit."""
    a = _request('GET', f'/authorized_payments/{authorized_payment_id}')
    sub = Subscription.query.filter_by(mp_subscription_id=a.get('preapproval_id')).first()
    if sub is None and a.get('preapproval_id'):
        sub = procesar_preapproval(a['preapproval_id'])
    if sub is None:
        logger.warning('cobro %s sin suscripción conocida', authorized_payment_id)
        return None
    pago = SubscriptionPayment.query.filter_by(mp_authorized_payment_id=str(a.get('id'))).first()
    if pago is None:
        pago = SubscriptionPayment(school_id=sub.school_id, subscription_id=sub.id,
                                   mp_authorized_payment_id=str(a.get('id')))
        db.session.add(pago)
    payment = a.get('payment') or {}
    pago.amount = a.get('transaction_amount')
    pago.currency = a.get('currency_id') or 'CLP'
    pago.status = a.get('status')
    pago.payment_status = payment.get('status')
    pago.status_detail = payment.get('status_detail') or a.get('rejection_code')
    pago.mp_payment_id = str(payment['id']) if payment.get('id') else pago.mp_payment_id
    pago.debit_date = _fecha(a.get('debit_date')) or _fecha(a.get('date_created'))
    school = School.query.get(sub.school_id)
    if pago.payment_status == 'approved' and school:
        meses = 12 if sub.plan_type == 'annual' else 1
        desde = pago.debit_date or datetime.utcnow()
        school.subscription_expires_at = desde + timedelta(days=31 * meses)
        sub.mp_payment_id = pago.mp_payment_id
    db.session.flush()
    if school:
        actualizar_estado(school)
    db.session.commit()
    return pago


def refrescar_desde_mp(school):
    """Busca en Mercado Pago las suscripciones al plan del colegio y las registra
    (sirve si un aviso no llegó). Hace commit. Devuelve cuántas encontró."""
    if not school.mp_plan_id:
        return 0
    r = _request('GET', f'/preapproval/search?preapproval_plan_id={school.mp_plan_id}')
    encontradas = r.get('results') or []
    for p in encontradas:
        procesar_preapproval(p['id'])
    return len(encontradas)
