"""Plan del colegio y cobro con Mercado Pago (la API de Mercado Pago va simulada)."""
import hashlib
import hmac
from datetime import date, timedelta

import pytest

from conftest import login


PRE1 = {
    'id': 'pre1', 'preapproval_plan_id': 'plan123', 'status': 'authorized',
    'payer_email': 'pagador@colegio.cl', 'next_payment_date': '2026-12-25T10:00:00.000-03:00',
    'auto_recurring': {'frequency': 12, 'transaction_amount': 499900, 'currency_id': 'CLP'},
}


class FalsoMP:
    """Reemplaza servicios.mercadopago._request y guarda lo que se llamó."""

    def __init__(self):
        self.llamadas = []
        self.preapprovals = {}
        self.cobros = {}

    def __call__(self, metodo, ruta, cuerpo=None):
        self.llamadas.append((metodo, ruta, cuerpo))
        if ruta == '/preapproval_plan' and metodo == 'POST':
            return {'id': 'plan123', 'init_point': 'https://mp.test/checkout?plan=plan123'}
        if ruta.startswith('/preapproval_plan/'):
            return {'id': ruta.split('/')[-1], 'init_point': 'https://mp.test/checkout?plan=plan123'}
        if ruta.startswith('/preapproval/search'):
            return {'results': [{'id': k} for k in self.preapprovals]}
        if ruta.startswith('/preapproval/') and metodo == 'GET':
            return self.preapprovals[ruta.split('/')[-1]]
        if ruta.startswith('/preapproval/') and metodo == 'PUT':
            return {}
        if ruta.startswith('/authorized_payments/'):
            return self.cobros[ruta.split('/')[-1]]
        raise AssertionError(f'llamada inesperada {metodo} {ruta}')


@pytest.fixture
def falso_mp(monkeypatch):
    from servicios import mercadopago
    f = FalsoMP()
    monkeypatch.setenv('MP_ACCESS_TOKEN', 'TEST-token')
    monkeypatch.delenv('MP_WEBHOOK_SECRET', raising=False)
    monkeypatch.setattr(mercadopago, '_request', f)
    return f


@pytest.fixture(scope='module')
def sa(client):
    return login(client, 'superadmin@sistema.cl', 'super123')


def _definir(client, sa, ids, **extra):
    fin = (date.today() + timedelta(days=extra.pop('dias', 30) - 1)).isoformat()
    body = {'nombre': 'Plan Colegio', 'monto': 49990, 'frecuencia': 'mensual',
            'trial_ends_at': fin, **extra}
    return client.put(f"/api/payments/schools/{ids['school']}/plan", headers=sa, json=body)


def test_super_admin_define_plan_y_se_crea_en_mp(client, sa, ids, falso_mp):
    r = _definir(client, sa, ids)
    assert r.status_code == 200, r.get_data(as_text=True)
    d = r.get_json()
    assert d['plan']['monto'] == 49990 and d['plan']['dias_prueba'] == 30
    assert d['estado'] == 'prueba'
    assert d['mp_plan_id'] == 'plan123'
    metodo, ruta, cuerpo = falso_mp.llamadas[0]
    assert (metodo, ruta) == ('POST', '/preapproval_plan')
    assert cuerpo['auto_recurring']['transaction_amount'] == 49990
    assert cuerpo['auto_recurring']['currency_id'] == 'CLP'
    assert cuerpo['auto_recurring']['free_trial'] == {'frequency': 30, 'frequency_type': 'days'}
    assert cuerpo['back_url'].startswith('https://')


def test_alargar_prueba_actualiza_el_plan(client, sa, ids, falso_mp):
    r = _definir(client, sa, ids, dias=60, frecuencia='anual', monto=499900)
    assert r.status_code == 200
    metodo, ruta, cuerpo = falso_mp.llamadas[0]
    assert (metodo, ruta) == ('PUT', '/preapproval_plan/plan123')
    assert cuerpo['auto_recurring']['frequency'] == 12
    assert cuerpo['auto_recurring']['free_trial']['frequency'] == 60


def test_validaciones_del_plan(client, sa, ids, falso_mp):
    assert _definir(client, sa, ids, monto=0).status_code == 400
    assert _definir(client, sa, ids, frecuencia='semanal').status_code == 400
    assert _definir(client, sa, ids, dias=400).status_code == 400


def test_solo_super_admin_define_el_plan(client, headers, ids, falso_mp):
    r = client.put(f"/api/payments/schools/{ids['school']}/plan", headers=headers['admin'],
                   json={'monto': 1})
    assert r.status_code == 403


def test_admin_ve_su_plan_y_obtiene_link(client, headers, falso_mp):
    r = client.get('/api/payments/plan', headers=headers['admin'])
    assert r.status_code == 200
    assert r.get_json()['plan']['nombre'] == 'Plan Colegio'
    assert client.get('/api/payments/plan', headers=headers['profesor']).status_code == 403
    # Solo el admin se suscribe; el directivo ve pero no paga
    assert client.post('/api/payments/plan/suscribir', headers=headers['directivo']).status_code == 403
    r = client.post('/api/payments/plan/suscribir', headers=headers['admin'])
    assert r.status_code == 200, r.get_data(as_text=True)
    assert r.get_json()['init_point'].startswith('https://mp.test/')
    # Antes de entregar el link se recalculan los días de prueba
    assert falso_mp.llamadas[-1][0] == 'PUT'


def test_webhook_suscripcion_y_cobros(client, headers, ids, falso_mp):
    falso_mp.preapprovals['pre1'] = PRE1
    r = client.post('/api/payments/mp-webhook', json={'type': 'subscription_preapproval',
                                                      'data': {'id': 'pre1'}})
    assert r.status_code == 200
    d = client.get('/api/payments/plan', headers=headers['admin']).get_json()
    assert d['estado'] == 'suscrito_en_prueba'
    assert d['suscripcion']['status'] == 'authorized'
    # Ya suscrito: no se puede pedir otro link
    assert client.post('/api/payments/plan/suscribir', headers=headers['admin']).status_code == 409

    falso_mp.cobros['cob1'] = {
        'id': 'cob1', 'preapproval_id': 'pre1', 'status': 'processed',
        'transaction_amount': 499900, 'currency_id': 'CLP',
        'debit_date': '2026-12-25T10:00:00.000-03:00',
        'payment': {'id': 999, 'status': 'approved', 'status_detail': 'accredited'},
    }
    r = client.post('/api/payments/mp-webhook?type=subscription_authorized_payment&data.id=cob1')
    assert r.status_code == 200
    d = client.get('/api/payments/plan', headers=headers['admin']).get_json()
    assert d['pagos'][0]['payment_status'] == 'approved'
    assert d['pagos'][0]['amount'] == 499900
    assert d['vigente_hasta'] is not None

    # Un aviso repetido no duplica el pago
    client.post('/api/payments/mp-webhook?type=subscription_authorized_payment&data.id=cob1')
    d = client.get('/api/payments/plan', headers=headers['admin']).get_json()
    assert len(d['pagos']) == 1


def test_estado_vencido_y_pago_pendiente(app, ids):
    from models import db, School, SubscriptionPayment, Subscription
    from servicios.mercadopago import estado_plan
    with app.app_context():
        s = School.query.get(ids['school'])
        s.trial_ends_at = date.today() - timedelta(days=1)
        sub = Subscription.query.filter_by(mp_subscription_id='pre1').first()
        assert estado_plan(s) == 'activo'
        db.session.add(SubscriptionPayment(school_id=s.id, subscription_id=sub.id,
                                           mp_authorized_payment_id='cob2', status='recycling',
                                           payment_status='rejected'))
        db.session.flush()
        assert estado_plan(s) == 'pago_pendiente'
        sub.status = 'cancelled'
        db.session.flush()
        assert estado_plan(s) == 'vencido'
        db.session.rollback()


def test_firma_del_webhook(client, monkeypatch, falso_mp):
    falso_mp.preapprovals['pre1'] = PRE1
    monkeypatch.setenv('MP_WEBHOOK_SECRET', 'secreto')
    r = client.post('/api/payments/mp-webhook?type=subscription_preapproval&data.id=pre1',
                    headers={'x-signature': 'ts=1,v1=malo', 'x-request-id': 'req1'})
    assert r.status_code == 401
    v1 = hmac.new(b'secreto', b'id:pre1;request-id:req1;ts:1;', hashlib.sha256).hexdigest()
    r = client.post('/api/payments/mp-webhook?type=subscription_preapproval&data.id=pre1',
                    headers={'x-signature': f'ts=1,v1={v1}', 'x-request-id': 'req1'})
    assert r.status_code == 200


def test_verificar_al_volver_del_checkout(client, headers, falso_mp):
    falso_mp.preapprovals['pre1'] = PRE1
    r = client.post('/api/payments/plan/verificar', headers=headers['admin'],
                    json={'preapproval_id': 'pre1'})
    assert r.status_code == 200
    assert r.get_json()['suscripcion']['mp_subscription_id'] == 'pre1'
