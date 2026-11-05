"""Tramos por usuarios: catálogo, cálculo del monto y colegios existentes intactos."""
import uuid

import pytest

from conftest import login
from models import db, PlanCatalogo, School, User
from routes import sitio
from servicios import tramos

UF = 40000.0


@pytest.fixture(autouse=True)
def uf_fija(monkeypatch):
    sitio._UF_CACHE.update({'dia': None, 'valor': None, 'fecha': None})
    monkeypatch.setattr(sitio, '_UF_FUENTES', (('fija', lambda: (UF, '2026-11-05')),))


@pytest.fixture
def sa(client):
    return login(client, 'superadmin@sistema.cl', 'super123')


def nuevo_colegio(client):
    correo = f'c{uuid.uuid4().hex[:8]}@ejemplo.cl'
    r = client.post('/api/registro', json={'nombre': 'Ana', 'apellido': 'Rojas', 'email': correo,
                                           'password': 'clave-larga-1'})
    h = {'Authorization': f"Bearer {r.get_json()['access_token']}"}
    r = client.post('/api/registro/colegio', headers=h, json={'nombre': 'Colegio Tramos'})
    return {'Authorization': f"Bearer {r.get_json()['access_token']}"}, r.get_json()['school']['id']


def sumar_usuarios(app, school_id, n, dominio='ejemplo.cl', rol='profesor'):
    with app.app_context():
        for _ in range(n):
            u = User(school_id=school_id, email=f'd{uuid.uuid4().hex[:10]}@{dominio}',
                     first_name='D', last_name='E', role=rol, is_active=True)
            u.set_password('x' * 8)
            db.session.add(u)
        db.session.commit()


def test_siembra_los_cinco_tramos_sin_superponerse(app):
    with app.app_context():
        filas = PlanCatalogo.query.filter(PlanCatalogo.monto_uf.isnot(None))\
            .order_by(PlanCatalogo.usuarios_min).all()
        assert [(p.usuarios_min, p.usuarios_max, p.monto_uf) for p in filas] == [
            (1, 3, 0.7), (4, 10, 1.3), (11, 20, 2.5), (21, 30, 4.0), (31, 40, 6.0)]
        assert PlanCatalogo.vigente().dias_prueba == 30


@pytest.mark.parametrize('n,uf', [(1, 0.7), (3, 0.7), (4, 1.3), (10, 1.3), (11, 2.5), (20, 2.5),
                                  (21, 4.0), (30, 4.0), (31, 6.0), (40, 6.0)])
def test_limites_de_cada_tramo(app, n, uf):
    with app.app_context():
        assert PlanCatalogo.tramo_para(n).monto_uf == uf


def test_colegio_nuevo_paga_su_tramo_y_sube_con_sus_usuarios(client, app):
    h, sid = nuevo_colegio(client)
    plan = client.get('/api/payments/plan', headers=h).get_json()
    assert plan['plan']['monto'] == 28000 and plan['plan']['uf'] == 0.7
    assert plan['tramo']['usuarios'] == 1

    sumar_usuarios(app, sid, 3)
    plan = client.get('/api/payments/plan', headers=h).get_json()
    assert plan['plan']['monto'] == 52000 and plan['tramo']['usuarios'] == 4


def test_alumnos_apoderados_y_datos_de_ejemplo_no_cuentan(client, app):
    h, sid = nuevo_colegio(client)
    sumar_usuarios(app, sid, 5, rol='alumno')
    sumar_usuarios(app, sid, 5, rol='apoderado')
    sumar_usuarios(app, sid, 5, dominio='ejemplo.invalid')
    assert client.get('/api/payments/plan', headers=h).get_json()['tramo']['usuarios'] == 1


def test_mas_de_40_usuarios_pasa_a_plan_especial(client, app):
    h, sid = nuevo_colegio(client)
    sumar_usuarios(app, sid, 40)
    d = client.get('/api/payments/plan', headers=h).get_json()
    assert d['tramo']['sobre_limite'] is True and d['plan']['monto'] is None
    assert client.post('/api/payments/plan/suscribir', headers=h).status_code == 400


def test_sin_uf_no_se_puede_suscribir(client, app, monkeypatch):
    h, _ = nuevo_colegio(client)
    def falla():
        raise ValueError('sin servicio')
    monkeypatch.setattr(sitio, '_UF_FUENTES', (('rota', falla),))
    assert client.post('/api/payments/plan/suscribir', headers=h).status_code == 503


def test_colegio_antiguo_no_cambia(client, app, sa):
    with app.app_context():
        s = School.query.filter_by(name='Colegio San Patricio').first()
        s.plan_monto, s.plan_nombre = 99000, 'Plan acordado'
        db.session.commit()
    h = login(client, 'admin@sanpatricio.cl', 'admin123')
    d = client.get('/api/payments/plan', headers=h).get_json()
    assert d['plan']['monto'] == 99000 and d['plan']['nombre'] == 'Plan acordado'
    assert d['tramo'] is None


def test_super_admin_fija_un_tramo_y_vuelve_a_automatico(client, app, sa):
    h, sid = nuevo_colegio(client)
    with app.app_context():
        plan_id = PlanCatalogo.tramo_para(35).id
    ruta = f'/api/super-admin/schools/{sid}/aplicar-plan'
    d = client.post(ruta, headers=sa, json={'plan_id': plan_id}).get_json()
    assert d['plan']['monto'] == 240000 and d['tramo'] is None

    d = client.post(ruta, headers=sa, json={'automatico': True}).get_json()
    assert d['plan']['monto'] == 28000 and d['tramo']['usuarios'] == 1


@pytest.mark.parametrize('campos', [
    {'monto_uf': 1.0},                                               # faltan los usuarios
    {'monto_uf': 1.0, 'usuarios_min': 50, 'usuarios_max': 45},       # al revés
    {'monto_uf': 1.0, 'usuarios_min': 35, 'usuarios_max': 45},       # se superpone
    {'monto_uf': 0, 'usuarios_min': 41, 'usuarios_max': 50},
    {'monto_uf': 1.0, 'usuarios_min': 41, 'usuarios_max': 50, 'monto': 1000},  # dos precios
    {'monto_uf': 1.0, 'usuarios_min': 41, 'usuarios_max': 50, 'frecuencia': 'anual'},
])
def test_valida_tramos(client, sa, campos):
    r = client.post('/api/super-admin/planes', headers=sa, json={'nombre': 'Otro', **campos})
    assert r.status_code == 400


def test_crea_un_tramo_nuevo(client, sa, app):
    r = client.post('/api/super-admin/planes', headers=sa, json={
        'nombre': '41 a 50 usuarios', 'monto_uf': 8, 'usuarios_min': 41, 'usuarios_max': 50})
    assert r.status_code == 201
    with app.app_context():
        assert PlanCatalogo.tramo_para(45).monto_uf == 8
