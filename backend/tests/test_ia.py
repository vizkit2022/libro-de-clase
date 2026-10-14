"""Estado de las funciones con IA.

Nace de una confusión concreta: cargar saldo en la cuenta de Anthropic no es
lo mismo que configurar la clave en el servidor donde corre la plataforma.
El diagnóstico tiene que distinguir esos casos y los demás (clave inválida,
modelo retirado, sin saldo) en vez de decir «error».
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ['DATABASE_URL'] = 'sqlite:///:memory:'


@pytest.fixture()
def entorno(monkeypatch):
    from app import create_app
    from models import db, School, User
    from flask_jwt_extended import create_access_token

    app = create_app()
    app.config['TESTING'] = True
    with app.app_context():
        colegio = School(name='Colegio de Prueba')
        db.session.add(colegio)
        db.session.commit()
        admin = User(school_id=colegio.id, email='admin@ia.cl', first_name='V',
                     last_name='E', role='admin')
        admin.set_password('x')
        profe = User(school_id=colegio.id, email='profe@ia.cl', first_name='R',
                     last_name='H', role='profesor')
        profe.set_password('x')
        db.session.add_all([admin, profe])
        db.session.commit()
        toks = {u.role: create_access_token(
            identity=str(u.id),
            additional_claims={'role': u.role, 'school_id': colegio.id})
            for u in (admin, profe)}

    def cliente(rol='admin'):
        c = app.test_client()
        c.environ_base['HTTP_AUTHORIZATION'] = f'Bearer {toks[rol]}'
        return c

    yield app, cliente

    with app.app_context():
        db.drop_all()


def test_sin_clave_lo_dice_sin_reventar(entorno, monkeypatch):
    app, cliente = entorno
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)

    r = cliente().get('/api/ia/estado')
    assert r.status_code == 200          # no haber IA es información, no un fallo
    d = r.get_json()
    assert d['configurada'] is False and d['ok'] is False
    assert 'ANTHROPIC_API_KEY' in d['error']
    # Y explica que el saldo no basta, que es justo la confusión
    assert 'saldo' in d['error']


def test_lista_que_se_pierde_sin_ia(entorno, monkeypatch):
    app, cliente = entorno
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    d = cliente().get('/api/ia/estado').get_json()
    claves = {f['clave'] for f in d['funciones']}
    assert claves == {'sugerencia_carga', 'convivencia_imagen', 'ocr_anotaciones'}
    assert all(f['sin_ia'] for f in d['funciones'])


def test_un_docente_no_ve_el_diagnostico(entorno):
    app, cliente = entorno
    assert cliente('profesor').get('/api/ia/estado').status_code == 403


def test_con_clave_valida_responde_ok(entorno, monkeypatch):
    app, cliente = entorno
    from servicios import ia

    class Respuesta:
        content = [type('T', (), {'text': 'ok'})()]

    class ClienteFalso:
        class messages:
            @staticmethod
            def create(**kw):
                assert kw['model'] == ia.modelo()
                return Respuesta()

    monkeypatch.setenv('ANTHROPIC_API_KEY', 'sk-ant-falsa')
    monkeypatch.setattr(ia, 'cliente', lambda: ClienteFalso())

    d = cliente().get('/api/ia/estado').get_json()
    assert d['ok'] is True and d['configurada'] is True
    assert d['latencia_ms'] is not None and d['error'] is None


@pytest.mark.parametrize('excepcion,esperado', [
    (Exception('authentication_error: invalid x-api-key'), 'rechaza'),
    (Exception('404 not_found: model'), 'retirado'),
    (Exception('Your credit balance is too low'), 'saldo'),
    (Exception('rate limit exceeded'), 'Límite'),
])
def test_cada_falla_se_explica_distinto(entorno, monkeypatch, excepcion, esperado):
    """Un «error genérico» obliga a entrar al servidor a investigar."""
    app, cliente = entorno
    from servicios import ia

    class ClienteFalso:
        class messages:
            @staticmethod
            def create(**kw):
                raise excepcion

    monkeypatch.setenv('ANTHROPIC_API_KEY', 'sk-ant-falsa')
    monkeypatch.setattr(ia, 'cliente', lambda: ClienteFalso())

    d = cliente().get('/api/ia/estado').get_json()
    assert d['ok'] is False
    assert esperado in d['error'], d['error']


def test_el_modelo_se_puede_cambiar_sin_tocar_codigo(monkeypatch):
    """Anthropic retira modelos con aviso: tiene que bastar una variable."""
    from servicios import ia

    monkeypatch.delenv('ANTHROPIC_MODEL', raising=False)
    monkeypatch.delenv('ANTHROPIC_MODEL_VISION', raising=False)
    assert ia.modelo() == ia.MODELO_POR_DEFECTO
    assert ia.modelo_vision() == ia.MODELO_VISION_POR_DEFECTO

    monkeypatch.setenv('ANTHROPIC_MODEL', 'claude-otro')
    assert ia.modelo() == 'claude-otro'
    # Sin uno específico de visión, hereda el general
    assert ia.modelo_vision() == 'claude-otro'

    monkeypatch.setenv('ANTHROPIC_MODEL_VISION', 'claude-vision')
    assert ia.modelo_vision() == 'claude-vision'


def test_limpiar_json_quita_el_cercado_markdown():
    """El modelo agrega ```json aunque se le pida que no."""
    from servicios import ia
    assert ia.limpiar_json('```json\n{"a": 1}\n```') == '{"a": 1}'
    assert ia.limpiar_json('```\n{"a": 1}\n```') == '{"a": 1}'
    assert ia.limpiar_json('{"a": 1}') == '{"a": 1}'
    assert ia.limpiar_json(None) == ''


def test_la_sugerencia_de_carga_funciona_sin_ia(monkeypatch):
    """El reparto no puede depender de que la IA esté arriba."""
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    from routes.carga_academica import _preferencias_desde_texto

    prefs, motivo = _preferencias_desde_texto(
        'que Fernando quede solo en básica', ['Fernando Chávez'],
        ['Matemática'], ['7° Básico'])
    assert motivo == 'sin_api_key'
    assert prefs['notas'] and 'ANTHROPIC_API_KEY' in prefs['notas'][0]
