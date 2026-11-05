"""Registro con clave y con Google, creación del colegio y aislamiento entre colegios."""
import json
import uuid
from datetime import date, timedelta

import pytest

from conftest import login, SCHOOL_NAME
from models import db, School, User, AuditLog, Course, Grade, Annotation, CourseSubject, Period
from routes import registro as registro_mod

CLAVE = 'una-clave-de-prueba'


@pytest.fixture(autouse=True)
def sin_limite():
    registro_mod._INTENTOS.clear()
    yield
    registro_mod._INTENTOS.clear()


def correo():
    return f'persona.{uuid.uuid4().hex[:10]}@example.com'


def registrar(client, email=None, clave=CLAVE):
    return client.post('/api/registro', json={'nombre': 'Ana', 'apellido': 'Prueba',
                                              'email': email or correo(), 'password': clave})


def bearer(token):
    return {'Authorization': f'Bearer {token}'}


def cuenta_con_colegio(client, nombre='Colegio Nuevo'):
    """Devuelve (headers, school_id) de un admin autoregistrado con su colegio."""
    r = registrar(client)
    assert r.status_code == 201, r.get_data(as_text=True)
    r2 = client.post('/api/registro/colegio', headers=bearer(r.get_json()['access_token']),
                     json={'nombre': nombre})
    assert r2.status_code == 201, r2.get_data(as_text=True)
    d = r2.get_json()
    return bearer(d['access_token']), d['school']['id']


@pytest.fixture
def google(monkeypatch):
    """Simula a Google: sin red. Guarda el token y la audiencia pedidos."""
    from google.oauth2 import id_token
    estado = {'info': {}, 'llamadas': []}

    def verificar(credential, _request, audience, **_kw):
        estado['llamadas'].append((credential, audience))
        if credential == 'invalida':
            raise ValueError('firma inválida')
        return estado['info']
    monkeypatch.setenv('GOOGLE_CLIENT_ID', 'cliente-de-prueba')
    monkeypatch.setattr(id_token, 'verify_oauth2_token', verificar)
    return estado


def info_google(email, sub=None, **extra):
    return {'email': email, 'sub': sub or uuid.uuid4().hex, 'email_verified': True,
            'given_name': 'Gabi', 'family_name': 'Google', **extra}


# ── Configuración ────────────────────────────────────────────────────────────

def test_config_sin_google(client, monkeypatch):
    monkeypatch.delenv('GOOGLE_CLIENT_ID', raising=False)
    r = client.get('/api/registro/config')
    assert r.get_json() == {'google_client_id': None, 'dias_prueba': 30}


def test_config_con_google(client, monkeypatch):
    monkeypatch.setenv('GOOGLE_CLIENT_ID', 'abc')
    assert client.get('/api/registro/config').get_json()['google_client_id'] == 'abc'


# ── Registro con clave ───────────────────────────────────────────────────────

def test_registro_crea_admin_sin_colegio(client, app):
    email = correo()
    r = registrar(client, email.upper())
    assert r.status_code == 201
    d = r.get_json()
    assert d['school'] is None and d['access_token']
    assert d['user']['role'] == 'admin' and d['user']['school_id'] is None
    assert d['user']['email'] == email
    assert 'password_hash' not in json.dumps(d)
    assert CLAVE not in json.dumps(d)
    with app.app_context():
        u = User.query.filter_by(email=email).first()
        assert u.origen_registro == 'password' and not u.email_verificado
    # Y entra por el login normal, también con school_id NULL
    assert client.post('/api/auth/login', json={'email': email, 'password': CLAVE}).status_code == 200


def test_me_con_school_id_null(client):
    token = registrar(client).get_json()['access_token']
    r = client.get('/api/auth/me', headers=bearer(token))
    assert r.status_code == 200 and r.get_json()['school'] is None


@pytest.mark.parametrize('cuerpo', [
    {'nombre': '', 'apellido': 'B', 'email': 'a@example.com', 'password': CLAVE},
    {'nombre': 'A', 'apellido': 'B', 'email': 'no-es-correo', 'password': CLAVE},
    {'nombre': 'A', 'apellido': 'B', 'email': 'a@example.com', 'password': 'corta'},
    {'nombre': 'A' * 101, 'apellido': 'B', 'email': 'a@example.com', 'password': CLAVE},
    {'nombre': 5, 'apellido': [], 'email': {}, 'password': 8},
])
def test_registro_valida(client, cuerpo):
    assert client.post('/api/registro', json=cuerpo).status_code == 400


def test_registro_correo_existente_409_sin_distinguir_mayusculas(client):
    assert registrar(client, 'ADMIN@sanpatricio.cl').status_code == 409


def test_el_registro_no_guarda_la_clave_en_la_auditoria(client, app):
    email = correo()
    registrar(client, email)
    with app.app_context():
        filas = AuditLog.query.filter_by(endpoint='registro.registrar').all()
        assert filas and all(CLAVE not in (f.details or '') for f in filas)


def test_limite_de_intentos(client):
    for _ in range(10):
        registrar(client, 'mal-correo')
    r = registrar(client)
    assert r.status_code == 429 and 'error' in r.get_json()


def test_limite_no_se_salta_cambiando_el_primer_x_forwarded_for(client):
    for i in range(10):
        client.post('/api/registro', json={}, headers={'X-Forwarded-For': f'1.2.3.{i}, 9.9.9.9'})
    r = client.post('/api/registro', json={}, headers={'X-Forwarded-For': '8.8.8.8, 9.9.9.9'})
    assert r.status_code == 429


# ── Google ───────────────────────────────────────────────────────────────────

def test_google_sin_client_id_503(client, monkeypatch):
    monkeypatch.delenv('GOOGLE_CLIENT_ID', raising=False)
    assert client.post('/api/registro/google', json={'credential': 'x'}).status_code == 503


def test_google_token_invalido_401(client, google):
    assert client.post('/api/registro/google', json={'credential': 'invalida'}).status_code == 401


def test_google_verifica_contra_nuestra_audiencia(client, google):
    google['info'] = info_google(correo())
    client.post('/api/registro/google', json={'credential': 'tok'})
    assert google['llamadas'] == [('tok', 'cliente-de-prueba')]


def test_google_rechaza_correo_sin_verificar(client, google):
    google['info'] = info_google(correo(), email_verified=False)
    assert client.post('/api/registro/google', json={'credential': 'tok'}).status_code == 401


def test_google_cuenta_nueva(client, google, app):
    email = correo()
    google['info'] = info_google(email)
    r = client.post('/api/registro/google', json={'credential': 'tok'})
    assert r.status_code == 200
    d = r.get_json()
    assert d['nuevo'] is True and d['school'] is None and d['user']['role'] == 'admin'
    assert d['user']['email_verificado'] is True and d['user']['origen_registro'] == 'google'
    # Sin clave utilizable
    assert client.post('/api/auth/login', json={'email': email, 'password': ''}).status_code == 400
    assert client.post('/api/auth/login', json={'email': email, 'password': '!'}).status_code == 401
    # La segunda vez es un login
    r2 = client.post('/api/registro/google', json={'credential': 'tok'})
    assert r2.get_json()['nuevo'] is False


def test_google_no_guarda_la_credencial_en_la_auditoria(client, google, app):
    google['info'] = info_google(correo())
    secreto = 'eyJ.credencial-secreta.firma'
    client.post('/api/registro/google', json={'credential': secreto})
    with app.app_context():
        assert all(secreto not in (f.details or '') for f in AuditLog.query.all())


def test_presecuestro_invalida_clave_y_tokens_del_intruso(client, google, app):
    email = correo()
    intruso = registrar(client, email).get_json()['access_token']
    assert client.get('/api/auth/me', headers=bearer(intruso)).status_code == 200

    google['info'] = info_google(email)
    r = client.post('/api/registro/google', json={'credential': 'tok'})
    assert r.status_code == 200 and r.get_json()['nuevo'] is False
    assert r.get_json()['user']['email_verificado'] is True

    # La clave del intruso ya no sirve, ni su sesión abierta
    assert client.post('/api/auth/login', json={'email': email, 'password': CLAVE}).status_code == 401
    r2 = client.get('/api/auth/me', headers=bearer(intruso))
    assert r2.status_code == 401 and r2.get_json()['codigo'] == 'sesion_invalidada'
    # La sesión del dueño sí funciona
    assert client.get('/api/auth/me', headers=bearer(r.get_json()['access_token'])).status_code == 200


def test_cuenta_antigua_conserva_su_clave_al_vincular_google(client, google, app):
    from conftest import create_user
    email = correo()
    create_user(app, role='profesor', email=email, password='clave-antigua')
    google['info'] = info_google(email)
    assert client.post('/api/registro/google', json={'credential': 'tok'}).status_code == 200
    assert client.post('/api/auth/login', json={'email': email, 'password': 'clave-antigua'}).status_code == 200


def test_google_cuenta_inactiva_no_entra(client, google, app):
    from conftest import create_user
    email = correo()
    create_user(app, role='profesor', email=email, is_active=False)
    google['info'] = info_google(email)
    assert client.post('/api/registro/google', json={'credential': 'tok'}).status_code == 403
    with app.app_context():
        assert User.query.filter_by(email=email).first().google_sub is None


def test_google_no_abre_el_super_admin(client, google):
    google['info'] = info_google('superadmin@sistema.cl')
    assert client.post('/api/registro/google', json={'credential': 'tok'}).status_code == 403


def test_google_otro_sub_para_la_misma_cuenta_409(client, google):
    email = correo()
    google['info'] = info_google(email, sub='sub-uno')
    client.post('/api/registro/google', json={'credential': 'tok'})
    google['info'] = info_google(email, sub='sub-dos')
    assert client.post('/api/registro/google', json={'credential': 'tok'}).status_code == 409


# ── Crear el colegio ─────────────────────────────────────────────────────────

def test_crear_colegio(client, app):
    token = registrar(client).get_json()['access_token']
    r = client.post('/api/registro/colegio', headers=bearer(token), json={
        'nombre': 'Colegio Las Araucarias', 'comuna': 'Temuco', 'telefono': '+56 9 1111 2222',
        'tipo': 'Particular', 'cantidad_alumnos_aprox': 120})
    assert r.status_code == 201, r.get_data(as_text=True)
    d = r.get_json()
    termina = date.today() + timedelta(days=29)
    assert d['prueba'] == {'dias': 30, 'termina': termina.isoformat()}
    s = d['school']
    assert s['origen'] == 'autoregistro' and s['rut'] is None and s['plan_status'] == 'trial'
    assert s['plan_nombre'] == '1 a 3 usuarios' and s['plan_automatico'] is True and s['comuna'] == 'Temuco'
    assert s['prueba'] == {'dias_restantes': 30, 'termina': termina.isoformat(),
                           'vencida': False, 'suscrito': False}
    assert d['user']['school_id'] == s['id']
    # El token nuevo trae el colegio, y queda inicializado como cualquier otro
    h = bearer(d['access_token'])
    me = client.get('/api/auth/me', headers=h).get_json()
    assert me['school']['id'] == s['id'] and me['school']['prueba']['dias_restantes'] == 30
    assert len(client.get('/api/periods/', headers=h).get_json()) == 2
    with app.app_context():
        from models import AuthorizationTemplate
        assert AuthorizationTemplate.query.filter_by(school_id=s['id']).count() > 0
    # El asistente existente mira este año, el de los períodos
    assert client.get('/api/onboarding/estado', headers=h).get_json()['year'] == date.today().year


def test_crear_colegio_dos_veces_409(client):
    token = registrar(client).get_json()['access_token']
    h = bearer(token)
    assert client.post('/api/registro/colegio', headers=h, json={'nombre': 'Uno'}).status_code == 201
    # Con el token viejo (sin colegio en los claims) también
    assert client.post('/api/registro/colegio', headers=h, json={'nombre': 'Dos'}).status_code == 409


def test_crear_colegio_exige_sesion_nombre_y_rol(client, headers):
    assert client.post('/api/registro/colegio', json={'nombre': 'X'}).status_code == 401
    token = registrar(client).get_json()['access_token']
    assert client.post('/api/registro/colegio', headers=bearer(token), json={}).status_code == 400
    assert client.post('/api/registro/colegio', headers=headers['profesor'], json={'nombre': 'X'}).status_code == 403
    assert client.post('/api/registro/colegio', headers=headers['admin'], json={'nombre': 'X'}).status_code == 409


@pytest.mark.parametrize('ruta', [
    '/api/users/', '/api/courses/', '/api/subjects/', '/api/periods/', '/api/grades/',
    '/api/annotations/', '/api/anios', '/api/onboarding/estado', '/api/payments/plan',
    '/api/reports/school/summary', '/api/matricula/cursos', '/api/convivencia/cases',
    '/api/carga-academica/docentes', '/api/auditoria/', '/api/schools/',
    '/api/autoonboarding/resumen', '/api/personalidad/areas',
])
def test_admin_sin_colegio_recibe_403_limpio(client, ruta):
    token = registrar(client).get_json()['access_token']
    r = client.get(ruta, headers=bearer(token))
    assert r.status_code == 403, f'{ruta} → {r.status_code}'
    assert r.is_json and r.get_json().get('error')


def test_admin_sin_colegio_no_puede_escribir(client):
    token = registrar(client).get_json()['access_token']
    r = client.post('/api/courses/', headers=bearer(token), json={'name': 'X'})
    assert r.status_code == 403


# ── Un admin solo opera sobre su colegio ─────────────────────────────────────

@pytest.fixture(scope='module')
def real(app):
    """Datos del colegio del seed, que hace de colegio ajeno."""
    with app.app_context():
        s = School.query.filter_by(name=SCHOOL_NAME).first()
        nota = Grade.query.first()
        cs = CourseSubject.query.first()
        return {'school': s.id, 'nombre': s.name, 'grade': nota.id, 'cs': cs.id,
                'student': nota.student_id, 'period': nota.period_id,
                'annotation': Annotation.query.first().id,
                'course': Course.query.filter_by(school_id=s.id).first().id}


def test_no_ve_ni_edita_otro_colegio(client, real, app):
    h, _sid = cuenta_con_colegio(client)
    sid = real['school']
    assert len(client.get('/api/schools/?all=1', headers=h).get_json()) == 1
    assert client.get(f'/api/schools/{sid}', headers=h).status_code == 403
    assert client.put(f'/api/schools/{sid}', headers=h, json={'name': 'Hackeado'}).status_code == 403
    assert client.post(f'/api/schools/{sid}/upload-logo', headers=h, data={}).status_code == 403
    with app.app_context():
        assert db.session.get(School, sid).name == real['nombre']


def test_el_propio_colegio_se_sigue_editando(client, headers, real):
    r = client.put(f"/api/schools/{real['school']}", headers=headers['admin'], json={'rector': 'R. Prueba'})
    assert r.status_code == 200
    assert client.get(f"/api/schools/{real['school']}", headers=headers['profesor']).status_code == 200


def test_no_crea_colegios_por_la_ruta_antigua(client):
    h, _sid = cuenta_con_colegio(client)
    assert client.post('/api/schools/', headers=h, json={'name': 'Otro'}).status_code == 403


def test_no_toca_notas_ni_anotaciones_ajenas(client, real, app):
    h, _sid = cuenta_con_colegio(client)
    assert client.put(f"/api/grades/{real['grade']}", headers=h, json={'value': 1.0}).status_code == 404
    assert client.delete(f"/api/grades/{real['grade']}", headers=h).status_code == 404
    assert client.get(f"/api/grades/summary/student/{real['student']}", headers=h).status_code == 404
    assert client.put(f"/api/annotations/{real['annotation']}", headers=h, json={'title': 'x'}).status_code == 404
    assert client.delete(f"/api/annotations/{real['annotation']}", headers=h).status_code == 404
    assert client.post('/api/grades/', headers=h, json={
        'student_id': real['student'], 'course_subject_id': real['cs'],
        'period_id': real['period'], 'value': 7.0}).status_code == 404
    assert client.post('/api/grades/bulk', headers=h, json={
        'course_subject_id': real['cs'], 'period_id': real['period'],
        'grades': [{'student_id': real['student'], 'value': 1.0}]}).status_code == 404
    assert client.post('/api/annotations/', headers=h, json={
        'student_id': real['student'], 'course_id': real['course'],
        'title': 'x', 'description': 'y'}).status_code == 404
    with app.app_context():
        assert db.session.get(Grade, real['grade']) is not None
        assert db.session.get(Annotation, real['annotation']) is not None


def test_no_se_trae_alumnos_de_otro_colegio(client, real):
    """Matricular a un alumno ajeno en un curso propio dejaría leer sus datos."""
    h, _sid = cuenta_con_colegio(client)
    curso = client.post('/api/courses/', headers=h, json={'name': 'Propio'}).get_json()
    r = client.post(f"/api/courses/{curso['id']}/enroll", headers=h, json={'student_id': real['student']})
    assert r.status_code == 404
    r = client.post('/api/courses/', headers=h, json={'name': 'Otro', 'head_teacher_id': real['student']})
    assert r.status_code == 404
    r = client.post('/api/convivencia/cases', headers=h, json={
        'student_id': real['student'], 'title': 't', 'date': date.today().isoformat()})
    assert r.status_code == 404


def test_admin_no_puede_crearse_super_admin(client, app):
    h, _sid = cuenta_con_colegio(client)
    email = correo()
    r = client.post('/api/users/', headers=h, json={'email': email, 'first_name': 'A', 'last_name': 'B',
                                                    'password': CLAVE, 'role': 'super_admin'})
    assert r.status_code == 400
    me = client.get('/api/auth/me', headers=h).get_json()['user']
    assert client.put(f"/api/users/{me['id']}", headers=h, json={'role': 'super_admin'}).status_code == 400
    with app.app_context():
        assert db.session.get(User, me['id']).role == 'admin'


def test_login_de_colegio_antiguo_no_cambia(client, app):
    r = client.post('/api/auth/login', json={'email': 'admin@sanpatricio.cl', 'password': 'admin123'})
    d = r.get_json()
    assert r.status_code == 200
    assert d['school']['origen'] is None and d['school']['prueba'] is None
    assert d['school']['tiene_demo'] is False
    assert d['user']['origen_registro'] is None
    from flask_jwt_extended import decode_token
    with app.app_context():
        assert 'sin_verificar' not in decode_token(d['access_token'])
