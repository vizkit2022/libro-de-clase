"""Bloqueo por prueba vencida. Lo central: los colegios antiguos no cambian."""
import sqlite3
import uuid
from datetime import date, datetime, timedelta

import pytest

from conftest import login, SCHOOL_NAME
from models import db, School, Subscription, User
from routes import registro as registro_mod


@pytest.fixture(autouse=True)
def sin_limite():
    registro_mod._INTENTOS.clear()


def nuevo(client):
    r = client.post('/api/registro', json={'nombre': 'Ana', 'apellido': 'Prueba',
                                           'email': f'p.{uuid.uuid4().hex[:10]}@example.com',
                                           'password': 'una-clave-larga'})
    d = client.post('/api/registro/colegio', json={'nombre': 'Colegio'},
                    headers={'Authorization': f"Bearer {r.get_json()['access_token']}"}).get_json()
    return {'Authorization': f"Bearer {d['access_token']}"}, d['school']['id'], d['user']['email']


def vencer(app, sid, dias=1):
    with app.app_context():
        s = db.session.get(School, sid)
        s.trial_ends_at = date.today() - timedelta(days=dias)
        db.session.commit()


def test_durante_la_prueba_se_escribe(client):
    h, _, _ = nuevo(client)
    assert client.post('/api/courses/', headers=h, json={'name': '1° A'}).status_code == 201


def test_ultimo_dia_de_prueba_aun_se_escribe(client, app):
    h, sid, _ = nuevo(client)
    with app.app_context():
        db.session.get(School, sid).trial_ends_at = date.today()
        db.session.commit()
    assert client.post('/api/courses/', headers=h, json={'name': '1° A'}).status_code == 201


@pytest.mark.parametrize('metodo,ruta', [
    ('post', '/api/courses/'), ('put', '/api/courses/1'), ('delete', '/api/subjects/1'),
    ('post', '/api/grades/'), ('patch', '/api/courses/1'), ('post', '/api/autoonboarding/demo'),
])
def test_vencida_bloquea_escritura_con_402(client, app, metodo, ruta):
    h, sid, _ = nuevo(client)
    vencer(app, sid)
    r = getattr(client, metodo)(ruta, headers=h, json={})
    assert r.status_code == 402
    assert r.get_json()['codigo'] == 'prueba_vencida' and r.get_json()['error']


def test_vencida_deja_leer_entrar_y_pagar(client, app):
    h, sid, email = nuevo(client)
    vencer(app, sid)
    assert client.get('/api/courses/', headers=h).status_code == 200
    assert client.get('/api/autoonboarding/resumen', headers=h).get_json()['prueba']['vencida'] is True
    # auth
    r = client.post('/api/auth/login', json={'email': email, 'password': 'una-clave-larga'})
    assert r.status_code == 200
    p = r.get_json()['school']['prueba']
    assert p['vencida'] is True and p['dias_restantes'] == 0 and p['suscrito'] is False
    assert client.get('/api/auth/me', headers=h).get_json()['school']['prueba']['vencida'] is True
    assert client.post('/api/auth/change-password', headers=h, json={
        'current_password': 'una-clave-larga', 'new_password': 'otra-clave-larga'}).status_code == 200
    # pagos: no es 402 (acá responde que Mercado Pago no está configurado)
    assert client.post('/api/payments/plan/suscribir', headers=h).status_code == 503
    assert client.post('/api/payments/plan/verificar', headers=h, json={}).status_code == 200


def test_super_admin_no_se_bloquea(client, app):
    _, sid, _ = nuevo(client)
    vencer(app, sid)
    sa = login(client, 'superadmin@sistema.cl', 'super123')
    assert client.post(f'/api/super-admin/schools/{sid}/prueba', headers=sa, json={'dias': 7}).status_code == 200


def test_otros_roles_del_colegio_tambien_quedan_en_lectura(client, app):
    from conftest import create_user
    h, sid, _ = nuevo(client)
    create_user(app, role='profesor', school_id=sid, email='docente.v@example.com', password='clave-docente')
    hp = login(client, 'docente.v@example.com', 'clave-docente')
    vencer(app, sid)
    assert client.post('/api/annotations/', headers=hp, json={}).status_code == 402
    assert client.get('/api/courses/', headers=hp).status_code == 200


def test_suscripcion_vigente_libera(client, app):
    h, sid, _ = nuevo(client)
    vencer(app, sid)
    with app.app_context():
        db.session.add(Subscription(school_id=sid, status='authorized', amount=1000, currency='CLP',
                                    mp_subscription_id=f'SUB-{uuid.uuid4().hex}'))
        db.session.commit()
    assert client.post('/api/courses/', headers=h, json={'name': 'Pagado'}).status_code == 201
    p = client.get('/api/auth/me', headers=h).get_json()['school']['prueba']
    assert p == {'dias_restantes': 0, 'termina': p['termina'], 'vencida': False, 'suscrito': True}


def test_suscripcion_cancelada_no_libera(client, app):
    h, sid, _ = nuevo(client)
    vencer(app, sid)
    with app.app_context():
        db.session.add(Subscription(school_id=sid, status='cancelled', amount=1000, currency='CLP',
                                    mp_subscription_id=f'SUB-{uuid.uuid4().hex}'))
        db.session.commit()
    assert client.post('/api/courses/', headers=h, json={'name': 'X'}).status_code == 402


def test_plazo_pagado_libera_hasta_su_fecha(client, app):
    h, sid, _ = nuevo(client)
    vencer(app, sid)
    with app.app_context():
        db.session.get(School, sid).subscription_expires_at = datetime.utcnow() + timedelta(days=3)
        db.session.commit()
    assert client.post('/api/courses/', headers=h, json={'name': 'X'}).status_code == 201
    with app.app_context():
        db.session.get(School, sid).subscription_expires_at = datetime.utcnow() - timedelta(days=1)
        db.session.commit()
    assert client.post('/api/courses/', headers=h, json={'name': 'Y'}).status_code == 402


def test_prorroga_libera(client, app):
    h, sid, _ = nuevo(client)
    vencer(app, sid, dias=10)
    sa = login(client, 'superadmin@sistema.cl', 'super123')
    r = client.post(f'/api/super-admin/schools/{sid}/prueba', headers=sa, json={'dias': 7})
    # Desde hoy, no desde la fecha vencida: 7 días contando hoy
    assert r.get_json()['plan']['trial_ends_at'] == (date.today() + timedelta(days=6)).isoformat()
    assert client.post('/api/courses/', headers=h, json={'name': 'X'}).status_code == 201


# ── Los colegios existentes no cambian ───────────────────────────────────────

@pytest.fixture
def colegio_antiguo(app):
    """El colegio del seed, con origen NULL, con prueba vencida hace un año y sin pago."""
    with app.app_context():
        s = School.query.filter_by(name=SCHOOL_NAME).first()
        guardado = s.trial_ends_at, s.origen
        s.trial_ends_at = date.today() - timedelta(days=365)
        db.session.commit()
        assert s.origen is None
        sid = s.id
    yield sid
    with app.app_context():
        db.session.get(School, sid).trial_ends_at = guardado[0]
        db.session.commit()


def test_origen_null_nunca_se_bloquea(client, headers, colegio_antiguo):
    r = client.post('/api/courses/', headers=headers['admin'], json={'name': 'Curso de colegio antiguo'})
    assert r.status_code == 201
    cid = r.get_json()['id']
    assert client.put(f'/api/courses/{cid}', headers=headers['directivo'], json={'letter': 'B'}).status_code == 200
    assert client.put('/api/annotations/999999', headers=headers['profesor'], json={}).status_code == 404
    assert client.delete('/api/subjects/999999', headers=headers['admin']).status_code == 404


def test_origen_null_sin_datos_de_prueba_en_la_sesion(client, colegio_antiguo):
    d = client.post('/api/auth/login', json={'email': 'admin@sanpatricio.cl', 'password': 'admin123'}).get_json()
    assert d['school']['prueba'] is None and d['school']['origen'] is None


def test_migracion_sobre_base_antigua(tmp_path, app, capsys):
    """Una base anterior gana las columnas sin alterar sus filas, y migrar dos veces da igual."""
    import app as app_module
    from sqlalchemy import create_engine, inspect, text
    ruta = tmp_path / 'antigua.db'
    con = sqlite3.connect(ruta)
    con.executescript("""
        CREATE TABLE schools (id INTEGER PRIMARY KEY, name VARCHAR(200) NOT NULL, rut VARCHAR(20),
            plan VARCHAR(20), plan_status VARCHAR(20), trial_ends_at DATE);
        CREATE TABLE users (id INTEGER PRIMARY KEY, school_id INTEGER, email VARCHAR(120),
            password_hash VARCHAR(256), first_name VARCHAR(100), last_name VARCHAR(100), role VARCHAR(20));
        INSERT INTO schools VALUES (1, 'Colegio Real', NULL, 'paid', 'active', '2020-01-01');
        INSERT INTO users VALUES (1, 1, 'real@example.com', 'hash-original', 'R', 'E', 'admin');
    """)
    con.commit()
    con.close()

    from flask import Flask
    from flask_sqlalchemy import SQLAlchemy
    otra = Flask('migracion')
    otra.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{ruta}'
    db_local = SQLAlchemy(otra)
    with otra.app_context():
        # run_migrations usa models.db: se le entrega el motor de la base antigua
        original = app_module.db
        app_module.db = db_local
        try:
            app_module.run_migrations()
            app_module.run_migrations()
        finally:
            app_module.db = original

    con = sqlite3.connect(ruta)
    columnas_s = {c[1] for c in con.execute('PRAGMA table_info(schools)')}
    columnas_u = {c[1] for c in con.execute('PRAGMA table_info(users)')}
    assert {'origen', 'tiene_demo', 'comuna', 'tipo_establecimiento', 'cantidad_alumnos_aprox'} <= columnas_s
    assert {'email_verificado', 'google_sub', 'origen_registro'} <= columnas_u
    assert con.execute('SELECT origen, tiene_demo, plan, plan_status, trial_ends_at FROM schools').fetchone() == (
        None, 0, 'paid', 'active', '2020-01-01')
    assert con.execute('SELECT origen_registro, email_verificado, google_sub, password_hash FROM users').fetchone() == (
        None, 0, None, 'hash-original')
    assert 'ix_users_google_sub' in {i[1] for i in con.execute('PRAGMA index_list(users)')}
    con.close()
