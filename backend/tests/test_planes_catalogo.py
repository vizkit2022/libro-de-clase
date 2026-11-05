"""Catálogo de planes, tabla de pruebas, prórrogas y aplicar plan (Mercado Pago simulado)."""
import uuid
from datetime import date, timedelta

import pytest

from conftest import login
from models import db, PlanCatalogo, School
from routes import registro as registro_mod
from test_plan_mp import FalsoMP


@pytest.fixture(autouse=True)
def sin_limite():
    registro_mod._INTENTOS.clear()


@pytest.fixture(scope='module')
def sa(client):
    return login(client, 'superadmin@sistema.cl', 'super123')


@pytest.fixture
def falso_mp(monkeypatch):
    from servicios import mercadopago
    f = FalsoMP()
    monkeypatch.setenv('MP_ACCESS_TOKEN', 'TEST-token')
    monkeypatch.setattr(mercadopago, '_request', f)
    return f


def colegio(client):
    r = client.post('/api/registro', json={'nombre': 'Ana', 'apellido': 'Prueba',
                                           'email': f'p.{uuid.uuid4().hex[:10]}@example.com',
                                           'password': 'una-clave-larga'})
    d = client.post('/api/registro/colegio', json={'nombre': 'Colegio Catálogo'},
                    headers={'Authorization': f"Bearer {r.get_json()['access_token']}"}).get_json()
    return {'Authorization': f"Bearer {d['access_token']}"}, d['school']['id'], d['user']['email']


def crear(client, sa, **campos):
    cuerpo = {'nombre': f'Plan {uuid.uuid4().hex[:6]}', 'monto': 49990, 'frecuencia': 'mensual',
              'dias_prueba': 30, **campos}
    return client.post('/api/super-admin/planes', headers=sa, json=cuerpo)


def vigente_al_final(client, sa):
    """Deja el plan sembrado como predeterminado para no contaminar otras pruebas."""
    base = next(p for p in client.get('/api/super-admin/planes', headers=sa).get_json()
                if p['usuarios_min'] == 1)
    client.put(f"/api/super-admin/planes/{base['id']}", headers=sa, json={'predeterminado': True, 'activo': True})


def test_siembra_un_tramo_predeterminado_sin_monto_fijo(client, sa):
    planes = client.get('/api/super-admin/planes', headers=sa).get_json()
    base = [p for p in planes if p['predeterminado']]
    assert len(base) == 1 and base[0]['nombre'] == '1 a 3 usuarios' and base[0]['monto_uf'] == 0.7
    assert base[0]['monto'] is None and base[0]['dias_prueba'] == 30 and base[0]['activo'] is True


def test_siembra_no_duplica(app):
    import app as app_module
    with app.app_context():
        antes = PlanCatalogo.query.count()
        app_module.seed_planes_catalogo()
        assert PlanCatalogo.query.count() == antes


@pytest.mark.parametrize('metodo,ruta', [
    ('get', '/api/super-admin/planes'), ('post', '/api/super-admin/planes'),
    ('put', '/api/super-admin/planes/1'), ('delete', '/api/super-admin/planes/1'),
    ('get', '/api/super-admin/pruebas'), ('post', '/api/super-admin/schools/1/prueba'),
    ('post', '/api/super-admin/schools/1/aplicar-plan'),
])
def test_solo_super_admin(client, headers, metodo, ruta):
    assert getattr(client, metodo)(ruta, json={}).status_code == 401
    assert getattr(client, metodo)(ruta, headers=headers['admin'], json={}).status_code == 403


@pytest.mark.parametrize('campos', [
    {'nombre': ''}, {'nombre': 'x' * 101}, {'monto': -5}, {'monto': 0}, {'monto': 'mucho'},
    {'monto': True}, {'monto': 10.5}, {'frecuencia': 'semanal'}, {'dias_prueba': 0},
    {'dias_prueba': 366}, {'dias_prueba': 'x'},
])
def test_valida_campos(client, sa, campos):
    assert crear(client, sa, **campos).status_code == 400


def test_monto_puede_quedar_por_definir(client, sa):
    r = crear(client, sa, monto=None)
    assert r.status_code == 201 and r.get_json()['monto'] is None


def test_marcar_predeterminado_desmarca_el_resto(client, sa):
    a = crear(client, sa, predeterminado=True, dias_prueba=45).get_json()
    assert a['predeterminado'] is True
    b = crear(client, sa).get_json()
    assert client.put(f"/api/super-admin/planes/{b['id']}", headers=sa, json={'predeterminado': True}).status_code == 200
    marcados = [p for p in client.get('/api/super-admin/planes', headers=sa).get_json() if p['predeterminado']]
    assert [p['id'] for p in marcados] == [b['id']]
    vigente_al_final(client, sa)


def test_predeterminado_define_dias_y_plan_del_colegio_nuevo(client, sa):
    plan = crear(client, sa, predeterminado=True, dias_prueba=45, monto=30000, frecuencia='anual').get_json()
    assert client.get('/api/registro/config').get_json()['dias_prueba'] == 45
    r = client.post('/api/registro', json={'nombre': 'A', 'apellido': 'B',
                                           'email': f'x.{uuid.uuid4().hex[:8]}@example.com',
                                           'password': 'una-clave-larga'})
    d = client.post('/api/registro/colegio', json={'nombre': 'C'},
                    headers={'Authorization': f"Bearer {r.get_json()['access_token']}"}).get_json()
    assert d['prueba']['dias'] == 45
    s = d['school']
    assert (s['plan_nombre'], s['plan_monto'], s['plan_frecuencia']) == (plan['nombre'], 30000, 'anual')
    assert s['trial_ends_at'] == (date.today() + timedelta(days=44)).isoformat()
    vigente_al_final(client, sa)


def test_delete_desactiva_y_no_borra(client, sa, app):
    p = crear(client, sa).get_json()
    r = client.delete(f"/api/super-admin/planes/{p['id']}", headers=sa)
    assert r.status_code == 200 and r.get_json()['activo'] is False
    with app.app_context():
        assert db.session.get(PlanCatalogo, p['id']) is not None


def test_no_se_puede_quedar_sin_predeterminado(client, sa):
    base = next(p for p in client.get('/api/super-admin/planes', headers=sa).get_json() if p['predeterminado'])
    assert client.delete(f"/api/super-admin/planes/{base['id']}", headers=sa).status_code == 409
    assert client.put(f"/api/super-admin/planes/{base['id']}", headers=sa, json={'activo': False}).status_code == 400
    assert client.put(f"/api/super-admin/planes/{base['id']}", headers=sa, json={'predeterminado': False}).status_code == 400


def test_editar_catalogo_no_cambia_a_colegios_existentes(client, sa, app):
    p = crear(client, sa).get_json()
    _, sid, _ = colegio(client)
    client.post(f'/api/super-admin/schools/{sid}/aplicar-plan', headers=sa, json={'plan_id': p['id']})
    client.put(f"/api/super-admin/planes/{p['id']}", headers=sa, json={'monto': 1})
    with app.app_context():
        assert db.session.get(School, sid).plan_monto == 49990


# ── Prórroga ─────────────────────────────────────────────────────────────────

def test_prorroga_suma_a_lo_que_queda(client, sa):
    _, sid, _ = colegio(client)
    r = client.post(f'/api/super-admin/schools/{sid}/prueba', headers=sa, json={'dias': 15})
    assert r.status_code == 200, r.get_data(as_text=True)
    assert r.get_json()['plan']['trial_ends_at'] == (date.today() + timedelta(days=44)).isoformat()
    assert r.get_json()['avisos']


def test_prorroga_con_fecha(client, sa):
    _, sid, _ = colegio(client)
    fin = (date.today() + timedelta(days=90)).isoformat()
    r = client.post(f'/api/super-admin/schools/{sid}/prueba', headers=sa, json={'trial_ends_at': fin})
    assert r.get_json()['plan']['trial_ends_at'] == fin


@pytest.mark.parametrize('cuerpo', [
    {}, {'dias': 0}, {'dias': 366}, {'dias': 'x'}, {'dias': True}, {'trial_ends_at': 'mañana'},
    {'trial_ends_at': '2000-01-01'}, {'trial_ends_at': '2999-01-01'},
])
def test_prorroga_valida(client, sa, cuerpo):
    _, sid, _ = colegio(client)
    assert client.post(f'/api/super-admin/schools/{sid}/prueba', headers=sa, json=cuerpo).status_code == 400


def test_prorroga_sincroniza_mercado_pago_si_hay_monto(client, sa, app, falso_mp):
    _, sid, _ = colegio(client)
    with app.app_context():
        s = db.session.get(School, sid)
        s.plan_automatico = False       # plan acordado a mano: no sigue a los tramos
        s.plan_monto, s.plan_nombre, s.plan_frecuencia = 49990, 'Plan X', 'anual'
        db.session.commit()
    r = client.post(f'/api/super-admin/schools/{sid}/prueba', headers=sa, json={'dias': 7})
    assert r.status_code == 200
    metodo, ruta, cuerpo = falso_mp.llamadas[0]
    assert (metodo, ruta) == ('POST', '/preapproval_plan')
    assert cuerpo['auto_recurring']['free_trial']['frequency'] == 37
    assert cuerpo['auto_recurring']['frequency'] == 12        # conserva el plan
    d = r.get_json()
    assert d['plan']['nombre'] == 'Plan X' and d['plan']['monto'] == 49990 and d['mp_plan_id'] == 'plan123'


def test_prorroga_sin_monto_no_llama_a_mercado_pago(client, sa, falso_mp):
    _, sid, _ = colegio(client)
    assert client.post(f'/api/super-admin/schools/{sid}/prueba', headers=sa, json={'dias': 7}).status_code == 200
    assert falso_mp.llamadas == []


# ── Aplicar plan ─────────────────────────────────────────────────────────────

def test_aplicar_plan_copia_y_sincroniza(client, sa, falso_mp):
    plan = crear(client, sa, monto=70000, frecuencia='anual').get_json()
    _, sid, _ = colegio(client)
    r = client.post(f'/api/super-admin/schools/{sid}/aplicar-plan', headers=sa, json={'plan_id': plan['id']})
    assert r.status_code == 200, r.get_data(as_text=True)
    d = r.get_json()
    assert d['plan']['nombre'] == plan['nombre'] and d['plan']['monto'] == 70000
    assert d['plan']['frecuencia'] == 'anual'
    assert d['plan']['trial_ends_at'] == (date.today() + timedelta(days=29)).isoformat()   # no toca la prueba
    assert falso_mp.llamadas and d['estado'] == 'prueba'


def test_aplicar_plan_rechaza_invalidos(client, sa):
    _, sid, _ = colegio(client)
    ruta = f'/api/super-admin/schools/{sid}/aplicar-plan'
    assert client.post(ruta, headers=sa, json={'plan_id': 999999}).status_code == 404
    assert client.post(ruta, headers=sa, json={}).status_code == 404
    sin_monto = crear(client, sa, monto=None).get_json()
    assert client.post(ruta, headers=sa, json={'plan_id': sin_monto['id']}).status_code == 400
    inactivo = crear(client, sa).get_json()
    client.delete(f"/api/super-admin/planes/{inactivo['id']}", headers=sa)
    assert client.post(ruta, headers=sa, json={'plan_id': inactivo['id']}).status_code == 400


# ── Tabla de pruebas ─────────────────────────────────────────────────────────

def test_tabla_de_pruebas(client, sa, app):
    from models import Subscription
    h_a, activa, email = colegio(client)
    _, por_vencer, _ = colegio(client)
    _, vencida, _ = colegio(client)
    _, pagada, _ = colegio(client)
    with app.app_context():
        db.session.get(School, por_vencer).trial_ends_at = date.today() + timedelta(days=3)
        db.session.get(School, vencida).trial_ends_at = date.today() - timedelta(days=3)
        db.session.add(Subscription(school_id=pagada, status='authorized', amount=1, currency='CLP',
                                    mp_subscription_id=f'SUB-{uuid.uuid4().hex}'))
        db.session.commit()
    client.post('/api/autoonboarding/demo', headers=h_a)

    d = client.get('/api/super-admin/pruebas', headers=sa).get_json()
    assert set(d) == {'pruebas', 'totales'}
    por_id = {f['school_id']: f for f in d['pruebas']}
    assert por_id[activa]['estado'] == 'activa' and por_id[activa]['alumnos'] == 30
    assert por_id[activa]['admin_email'] == email and por_id[activa]['dias_restantes'] == 30
    assert por_id[activa]['ultimo_acceso'] and por_id[activa]['plan_nombre']
    assert set(por_id[activa]) == {'school_id', 'nombre', 'admin_email', 'creado', 'plan_nombre', 'trial_ends_at',
                                   'usuarios', 'dias_restantes', 'estado', 'alumnos', 'ultimo_acceso'}
    assert por_id[por_vencer]['estado'] == 'por_vencer' and por_id[por_vencer]['dias_restantes'] == 4
    assert por_id[vencida]['estado'] == 'vencida' and por_id[vencida]['dias_restantes'] == 0
    assert por_id[pagada]['estado'] == 'suscrito'
    # El colegio del seed no se registró solo: no aparece
    with app.app_context():
        antiguos = {s.id for s in School.query.filter(School.origen.is_(None)).all()}
    assert not antiguos & set(por_id)

    filtrada = client.get('/api/super-admin/pruebas?estado=vencida', headers=sa).get_json()
    assert {f['estado'] for f in filtrada['pruebas']} == {'vencida'}
    assert vencida in {f['school_id'] for f in filtrada['pruebas']}
    # Los totales no dependen del filtro
    assert filtrada['totales'] == d['totales'] and d['totales']['vencida'] >= 1
    assert sum(d['totales'].values()) == len(d['pruebas'])
    assert client.get('/api/super-admin/pruebas?estado=otra', headers=sa).status_code == 400
