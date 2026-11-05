"""Ajuste mensual: avisa antes de subir, nunca sube sin aviso y no duplica."""
import uuid
from datetime import date, timedelta

import pytest

from conftest import login
from models import db, AjusteSuscripcion, School, Subscription, User
from servicios import ajuste_suscripciones as ajuste
from servicios import mercadopago as mp

HOY = date(2026, 11, 5)
UF = 40000     # conftest fija este valor: 0,7 UF = $28.000; 1,3 UF = $52.000


@pytest.fixture
def falsos(monkeypatch):
    class F:
        llamadas, correos = [], []
        correo_ok = True
        mp_ok = True
    F.llamadas, F.correos = [], []

    def falso_request(metodo, ruta, cuerpo=None):
        if not F.mp_ok:
            raise mp.MercadoPagoError('MP caído', 502)
        F.llamadas.append((metodo, ruta, cuerpo))
        return {}

    def falso_correo(destino, asunto, cuerpo, texto):
        F.correos.append((destino, asunto, texto))
        return F.correo_ok

    monkeypatch.setenv('MP_ACCESS_TOKEN', 'TEST-token')
    monkeypatch.setenv('RESEND_API_KEY', 're_prueba')
    monkeypatch.delenv('AJUSTE_AVISO_DIAS', raising=False)
    monkeypatch.setattr(mp, '_request', falso_request)
    monkeypatch.setattr(ajuste, 'enviar_correo', falso_correo)
    return F


def colegio_suscrito(app, monto=28000, usuarios=0, automatico=True):
    with app.app_context():
        s = School(name=f'Colegio {uuid.uuid4().hex[:6]}', origen='autoregistro', is_active=True,
                   plan_automatico=automatico, plan_monto=monto, plan_frecuencia='mensual',
                   plan_nombre='1 a 3 usuarios', plan_uf=0.7)
        db.session.add(s)
        db.session.flush()
        for i in range(usuarios + 1):
            u = User(school_id=s.id, email=f'{"admin" if i == 0 else "d"}{uuid.uuid4().hex[:8]}@ejemplo.cl',
                     first_name='A', last_name='B', role='admin' if i == 0 else 'profesor', is_active=True)
            u.set_password('x' * 8)
            db.session.add(u)
        sub = Subscription(school_id=s.id, status='authorized', amount=monto, currency='CLP',
                           mp_subscription_id=f'pre-{uuid.uuid4().hex[:8]}',
                           mp_payer_email='paga@ejemplo.cl')
        db.session.add(sub)
        db.session.commit()
        return s.id, sub.mp_subscription_id


def filas(app, sid):
    with app.app_context():
        return [(a.estado, a.monto_nuevo, a.aplicar_desde)
                for a in AjusteSuscripcion.query.filter_by(school_id=sid).order_by(AjusteSuscripcion.id)]


def test_si_sube_avisa_primero_y_cambia_al_vencer_el_aviso(app, falsos):
    sid, pre = colegio_suscrito(app, usuarios=3)    # 4 usuarios: 1,3 UF
    with app.app_context():
        r = ajuste.revisar(HOY)
        assert r['avisados'] == 1 and falsos.llamadas == []
        assert len(falsos.correos) == 2             # administrador y quien paga
        assert '$28.000 a $52.000' in falsos.correos[0][2]
        assert filas(app, sid) == [('avisado', 52000, HOY + timedelta(days=10))]

        assert ajuste.revisar(HOY + timedelta(days=9))['aplicados'] == 0
        assert falsos.llamadas == []
        assert ajuste.revisar(HOY + timedelta(days=10))['aplicados'] == 1

        assert falsos.llamadas == [('PUT', f'/preapproval/{pre}',
                                    {'auto_recurring': {'transaction_amount': 52000, 'currency_id': 'CLP'}})]
        s = db.session.get(School, sid)
        assert (s.plan_monto, s.plan_nombre, s.plan_uf) == (52000, '4 a 10 usuarios', 1.3)
        assert Subscription.query.filter_by(school_id=sid).first().amount == 52000
    assert filas(app, sid)[0][0] == 'aplicado'


def test_sin_aviso_enviado_no_hay_alza_y_se_reintenta(app, falsos):
    sid, _ = colegio_suscrito(app, usuarios=3)
    falsos.correo_ok = False
    with app.app_context():
        r = ajuste.revisar(HOY)
        assert r['errores'] and r['avisados'] == 0 and falsos.llamadas == []
        assert filas(app, sid) == []
        falsos.correo_ok = True
        assert ajuste.revisar(HOY)['avisados'] >= 1
    falsos.correo_ok = True


def test_si_baja_se_aplica_de_inmediato(app, falsos):
    sid, pre = colegio_suscrito(app, monto=52000)   # 1 usuario pagando el tramo 2
    with app.app_context():
        assert ajuste.revisar(HOY)['aplicados'] >= 1
    assert ('PUT', f'/preapproval/{pre}', {'auto_recurring': {'transaction_amount': 28000, 'currency_id': 'CLP'}}) in falsos.llamadas
    assert filas(app, sid)[0][0] == 'aplicado'


def test_un_solo_ajuste_por_mes(app, falsos):
    sid, _ = colegio_suscrito(app, usuarios=3)
    with app.app_context():
        ajuste.revisar(HOY)
        correos = len(falsos.correos)
        ajuste.revisar(HOY)
    assert len(falsos.correos) == correos and len(filas(app, sid)) == 1


def test_si_baja_durante_el_aviso_cobra_lo_menor(app, falsos):
    sid, _ = colegio_suscrito(app, usuarios=11)     # 12 usuarios: 2,5 UF = $100.000
    with app.app_context():
        ajuste.revisar(HOY)
        assert filas(app, sid)[0][1] == 100000
        for u in User.query.filter_by(school_id=sid, role='profesor').limit(8):
            u.is_active = False
        db.session.commit()                         # quedan 4: 1,3 UF = $52.000
        ajuste.revisar(HOY + timedelta(days=1))
    assert filas(app, sid)[0][1] == 52000


def test_si_vuelve_al_monto_actual_el_aviso_se_cancela(app, falsos):
    sid, _ = colegio_suscrito(app, usuarios=3)
    with app.app_context():
        ajuste.revisar(HOY)
        for u in User.query.filter_by(school_id=sid, role='profesor').all():
            u.is_active = False
        db.session.commit()
        ajuste.revisar(HOY + timedelta(days=11))
    assert filas(app, sid)[0][0] == 'cancelado'


def test_error_de_mercado_pago_queda_pendiente(app, falsos):
    sid, _ = colegio_suscrito(app, usuarios=3)
    with app.app_context():
        ajuste.revisar(HOY)
        falsos.mp_ok = False
        r = ajuste.revisar(HOY + timedelta(days=10))
        assert any('MP caído' in e for e in r['errores'])
        assert filas(app, sid)[0][0] == 'avisado'
        falsos.mp_ok = True
        ajuste.revisar(HOY + timedelta(days=11))
    assert filas(app, sid)[0][0] == 'aplicado'
    falsos.mp_ok = True


def test_sobre_el_ultimo_tramo_no_cambia_nada_y_queda_en_revision(app, falsos):
    sid, pre = colegio_suscrito(app, usuarios=45)
    with app.app_context():
        ajuste.revisar(HOY)
    assert filas(app, sid)[0][0] == 'revision'
    assert not any(pre in c[1] for c in falsos.llamadas)


@pytest.mark.parametrize('cambio', ['automatico', 'pausada', 'simulada', 'anual'])
def test_no_toca_lo_que_no_corresponde(app, falsos, cambio):
    sid, pre = colegio_suscrito(app, usuarios=3)
    with app.app_context():
        s = db.session.get(School, sid)
        sub = Subscription.query.filter_by(school_id=sid).first()
        if cambio == 'automatico':
            s.plan_automatico = False
        elif cambio == 'pausada':
            sub.status = 'paused'
        elif cambio == 'simulada':
            sub.mp_subscription_id = f'SIM-{sid}'
        else:
            s.plan_frecuencia = 'anual'
        db.session.commit()
        ajuste.revisar(HOY)
    assert filas(app, sid) == []
    assert not any(pre in c[1] for c in falsos.llamadas)


@pytest.mark.parametrize('falta', ['MP_ACCESS_TOKEN', 'RESEND_API_KEY'])
def test_sin_mercado_pago_o_correo_no_corre(app, falsos, monkeypatch, falta):
    monkeypatch.delenv(falta)
    sid, _ = colegio_suscrito(app, usuarios=3)
    with app.app_context():
        assert ajuste.revisar(HOY)['detenido']
    assert filas(app, sid) == []


def test_sin_uf_de_hoy_no_corre(app, falsos, monkeypatch):
    from routes import sitio
    sid, _ = colegio_suscrito(app, usuarios=3)
    def falla():
        raise ValueError('sin servicio')
    sitio._UF_CACHE.update({'dia': date(2020, 1, 1), 'valor': 39000.0, 'fecha': '2020-01-01'})
    monkeypatch.setattr(sitio, '_UF_FUENTES', (('rota', falla),))
    with app.app_context():
        assert ajuste.revisar(HOY)['detenido']          # un valor antiguo no sirve para cobrar
    assert filas(app, sid) == []


def test_apagado_por_defecto(monkeypatch):
    monkeypatch.delenv('AJUSTE_AUTOMATICO', raising=False)
    assert ajuste.automatico_activo() is False


def test_la_revision_periodica_sigue_tras_un_error(app, monkeypatch):
    objetivo = {}

    class HiloFalso:
        def __init__(self, target, **_):
            objetivo['ciclo'] = target

        def start(self):
            pass

    pasadas, siestas = [], []

    def revisar_falso():
        pasadas.append(1)
        if len(pasadas) == 1:
            raise RuntimeError('falla pasajera')

    def dormir(segundos):
        siestas.append(segundos)
        if len(siestas) == 3:
            raise SystemExit

    monkeypatch.setenv('AJUSTE_AUTOMATICO', '1')
    monkeypatch.setattr(ajuste.threading, 'Thread', HiloFalso)
    monkeypatch.setattr(ajuste.time, 'sleep', dormir)
    monkeypatch.setattr(ajuste, 'revisar', revisar_falso)
    ajuste.instalar(app)
    with pytest.raises(SystemExit):
        objetivo['ciclo']()
    assert len(pasadas) == 2 and siestas[1:] == [ajuste.SEGUNDOS_ENTRE_REVISIONES] * 2


def test_sin_activar_no_arranca_el_hilo(app, monkeypatch):
    monkeypatch.delenv('AJUSTE_AUTOMATICO', raising=False)
    def prohibido(*a, **k):
        raise AssertionError('no debía crear el hilo')
    monkeypatch.setattr(ajuste.threading, 'Thread', prohibido)
    ajuste.instalar(app)


def test_vista_previa_no_repite_lo_ya_avisado(app, falsos):
    sid, _ = colegio_suscrito(app, usuarios=3)
    with app.app_context():
        assert any(p['school_id'] == sid for p in ajuste.vista_previa())
        ajuste.revisar(HOY)
        assert not any(p['school_id'] == sid for p in ajuste.vista_previa())


# ── Panel y página de plan ────────────────────────────────────────────────

@pytest.fixture
def sa(client):
    return login(client, 'superadmin@sistema.cl', 'super123')


def test_panel_lista_previsto_revisa_y_cancela(client, app, sa, falsos):
    sid, _ = colegio_suscrito(app, usuarios=3)
    d = client.get('/api/super-admin/ajustes', headers=sa).get_json()
    assert d['automatico'] is False and d['mp_configurado'] and d['correo_configurado']
    assert [p for p in d['previsto'] if p['school_id'] == sid][0]['monto_nuevo'] == 52000

    r = client.post('/api/super-admin/ajustes/revisar', headers=sa)
    assert r.status_code == 200 and r.get_json()['avisados'] >= 1
    d = client.get('/api/super-admin/ajustes', headers=sa).get_json()
    fila = [a for a in d['ajustes'] if a['school_id'] == sid][0]
    assert fila['estado'] == 'avisado'

    r = client.post(f"/api/super-admin/ajustes/{fila['id']}/cancelar", headers=sa)
    assert r.status_code == 200 and r.get_json()['estado'] == 'cancelado'
    assert client.post(f"/api/super-admin/ajustes/{fila['id']}/cancelar", headers=sa).status_code == 409


def test_panel_solo_super_admin(client):
    h = login(client, 'admin@sanpatricio.cl', 'admin123')
    assert client.get('/api/super-admin/ajustes', headers=h).status_code in (401, 403)
    assert client.post('/api/super-admin/ajustes/revisar', headers=h).status_code in (401, 403)


def test_el_colegio_ve_el_cambio_avisado(client, app, falsos):
    sid, _ = colegio_suscrito(app, usuarios=3)
    with app.app_context():
        ajuste.revisar(HOY)
        correo = User.query.filter_by(school_id=sid, role='admin').first()
        correo.set_password('clave-del-admin')
        db.session.commit()
        email = correo.email
    h = login(client, email, 'clave-del-admin')
    d = client.get('/api/payments/plan', headers=h).get_json()
    assert d['ajuste']['monto_nuevo'] == 52000
    assert d['ajuste']['aplicar_desde'] == (HOY + timedelta(days=10)).isoformat()
