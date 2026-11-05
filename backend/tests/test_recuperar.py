"""Recuperación de clave: un enlace por correo, de un solo uso y sin revelar cuentas."""
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from conftest import login
from models import db, User
from routes import recuperar as modulo

PEDIR = '/api/auth/recuperar'
NUEVA = '/api/auth/recuperar/nueva'
CORREO = 'apoderado@sanpatricio.cl'


@pytest.fixture(autouse=True)
def ambiente(app, monkeypatch):
    monkeypatch.setenv('RESEND_API_KEY', 're_prueba')
    monkeypatch.delenv('URL_PUBLICA', raising=False)
    app.config['JWT_SECRET_KEY'] = 'secreto-de-prueba-suficientemente-largo-para-jwt'
    modulo._INTENTOS.clear()


@pytest.fixture
def enviados(monkeypatch):
    lista = []
    monkeypatch.setattr(modulo, '_despachar', lambda *a: lista.append(a))
    return lista


def _token(enviados):
    return enviados[-1][3].split('/nueva-clave#')[1].split()[0]


def test_flujo_completo(client, enviados):
    r = client.post(PEDIR, json={'email': CORREO.upper()})
    assert r.status_code == 200
    assert enviados[-1][0] == CORREO
    assert 'https://kolevia.cl/nueva-clave#' in enviados[-1][3]

    r = client.post(NUEVA, json={'token': _token(enviados), 'password': 'clave-nueva-1'})
    assert r.status_code == 200
    login(client, CORREO, 'clave-nueva-1')
    assert client.post('/api/auth/login',
                       json={'email': CORREO, 'password': 'apod123'}).status_code == 401
    # Se deja como estaba para los demás tests del módulo
    client.post(PEDIR, json={'email': CORREO})
    client.post(NUEVA, json={'token': _token(enviados), 'password': 'apod1234'})


def test_el_enlace_sirve_una_sola_vez(client, enviados):
    client.post(PEDIR, json={'email': CORREO})
    token = _token(enviados)
    assert client.post(NUEVA, json={'token': token, 'password': 'clave-otra-22'}).status_code == 200
    r = client.post(NUEVA, json={'token': token, 'password': 'clave-otra-33'})
    assert r.status_code == 400
    assert r.get_json()['codigo'] == 'enlace_invalido'


def test_enlace_vencido_o_alterado(client, app, enviados):
    client.post(PEDIR, json={'email': CORREO})
    token = _token(enviados)
    assert client.post(NUEVA, json={'token': token + 'x', 'password': 'clave-otra-44'}).status_code == 400
    with patch('itsdangerous.timed.TimestampSigner.get_timestamp',
               return_value=int((datetime.utcnow() + timedelta(hours=2)).timestamp())):
        assert client.post(NUEVA, json={'token': token, 'password': 'clave-otra-44'}).status_code == 400
    assert client.post(NUEVA, json={'password': 'clave-otra-44'}).status_code == 400


def test_la_respuesta_no_revela_si_la_cuenta_existe(client, enviados):
    existe = client.post(PEDIR, json={'email': CORREO})
    no_existe = client.post(PEDIR, json={'email': 'nadie@ejemplo.cl'})
    assert (existe.status_code, existe.get_json()) == (no_existe.status_code, no_existe.get_json())
    assert len(enviados) == 1


def test_cuentas_excluidas_no_reciben_correo(client, app, enviados):
    with app.app_context():
        superadmin = User.query.filter_by(role='super_admin').first().email
        inactivo = User.query.filter_by(email='directivo@sanpatricio.cl').first()
        inactivo.is_active = False
        db.session.commit()
    assert client.post(PEDIR, json={'email': superadmin}).status_code == 200
    assert client.post(PEDIR, json={'email': 'directivo@sanpatricio.cl'}).status_code == 200
    assert enviados == []
    with app.app_context():
        User.query.filter_by(email='directivo@sanpatricio.cl').first().is_active = True
        db.session.commit()


def test_el_token_de_super_admin_no_sirve(client, app):
    with app.app_context(), app.test_request_context():
        token = modulo.crear_token(User.query.filter_by(role='super_admin').first())
    assert client.post(NUEVA, json={'token': token, 'password': 'clave-mala-55'}).status_code == 400


def test_clave_corta(client, enviados):
    client.post(PEDIR, json={'email': CORREO})
    r = client.post(NUEVA, json={'token': _token(enviados), 'password': 'corta'})
    assert r.status_code == 400
    assert 'enlace_invalido' not in str(r.get_json())


def test_el_host_de_la_request_no_cambia_el_enlace(client, enviados):
    client.post(PEDIR, json={'email': CORREO}, headers={'Host': 'sitio-malo.com'})
    assert 'sitio-malo.com' not in enviados[-1][3]


def test_tope_por_correo_sin_avisar(client, enviados):
    for _ in range(4):
        client.environ_base['REMOTE_ADDR'] = f'10.0.0.{_}'
        assert client.post(PEDIR, json={'email': CORREO}).status_code == 200
    client.environ_base.pop('REMOTE_ADDR')
    assert len(enviados) == 3


def test_tope_por_ip(client, enviados):
    codigos = [client.post(PEDIR, json={'email': f'n{i}@ejemplo.cl'}).status_code for i in range(6)]
    assert codigos == [200] * 5 + [429]


def test_sin_proveedor_no_se_ofrece(client, monkeypatch):
    monkeypatch.delenv('RESEND_API_KEY')
    assert client.get(PEDIR + '/disponible').get_json() == {'disponible': False}
    assert client.post(PEDIR, json={'email': CORREO}).status_code == 503


def test_con_el_secreto_publico_no_se_ofrece(client, app):
    app.config['JWT_SECRET_KEY'] = modulo.SECRETO_INSEGURO
    assert client.get(PEDIR + '/disponible').get_json() == {'disponible': False}
    assert client.post(PEDIR, json={'email': CORREO}).status_code == 503


def test_el_token_no_queda_en_la_auditoria(client, app, enviados):
    from models import AuditLog
    client.post(PEDIR, json={'email': CORREO})
    token = _token(enviados)
    client.post(NUEVA, json={'token': token, 'password': 'clave-audit-66'})
    with app.app_context():
        filas = AuditLog.query.filter(AuditLog.path.like('/api/auth/recuperar%')).all()
        assert filas
        for f in filas:
            assert token not in (f.details or '') and 'clave-audit-66' not in (f.details or '')
