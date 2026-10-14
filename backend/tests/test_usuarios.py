"""Edición de la ficha de un usuario.

Nace de un fallo concreto: el formulario mostraba el correo editable, lo
enviaba, y la ruta lo descartaba sin avisar. El usuario guardaba, veía
«Usuario actualizado» y el correo seguía igual.

    python3 -m pytest backend/tests/test_usuarios.py -q
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ['DATABASE_URL'] = 'sqlite:///:memory:'


@pytest.fixture()
def entorno():
    from app import create_app
    from models import db, School, User
    from flask_jwt_extended import create_access_token

    app = create_app()
    app.config['TESTING'] = True
    with app.app_context():
        colegio = School(name='Colegio de Prueba')
        db.session.add(colegio)
        db.session.commit()

        admin = User(school_id=colegio.id, email='admin@prueba.cl',
                     first_name='Víctor', last_name='Espinoza', role='admin')
        admin.set_password('x')
        profe = User(school_id=colegio.id, email='profe.138978087@franzliszt.cl',
                     first_name='Darinka', last_name='Alfaro', role='profesor')
        profe.set_password('x')
        otra = User(school_id=colegio.id, email='ocupado@franzliszt.cl',
                    first_name='Otra', last_name='Persona', role='profesor')
        otra.set_password('x')
        db.session.add_all([admin, profe, otra])
        db.session.commit()

        tokens = {u.role if u.role != 'profesor' else u.first_name.lower():
                  create_access_token(identity=str(u.id),
                                      additional_claims={'role': u.role,
                                                         'school_id': colegio.id})
                  for u in (admin, profe, otra)}
        ids = {'profe': profe.id, 'otra': otra.id, 'admin': admin.id}

    def cliente(quien):
        c = app.test_client()
        c.environ_base['HTTP_AUTHORIZATION'] = f'Bearer {tokens[quien]}'
        return c

    yield app, cliente, ids

    # La base en memoria sobrevive entre tests del mismo proceso: sin esto,
    # el segundo choca con los correos únicos del primero.
    with app.app_context():
        db.drop_all()


def test_el_admin_puede_cambiar_el_correo(entorno):
    app, cliente, ids = entorno
    from models import User

    r = cliente('admin').put(f'/api/users/{ids["profe"]}',
                             json={'email': 'dalfaro@franzliszt.cl'})
    assert r.status_code == 200, r.get_json()
    assert r.get_json()['email'] == 'dalfaro@franzliszt.cl'

    with app.app_context():
        assert User.query.get(ids['profe']).email == 'dalfaro@franzliszt.cl'


def test_el_correo_se_normaliza(entorno):
    app, cliente, ids = entorno
    r = cliente('admin').put(f'/api/users/{ids["profe"]}',
                             json={'email': '  DAlfaro@FranzLiszt.CL  '})
    assert r.get_json()['email'] == 'dalfaro@franzliszt.cl'


def test_un_correo_tomado_se_rechaza_diciendo_cual(entorno):
    app, cliente, ids = entorno
    from models import User

    r = cliente('admin').put(f'/api/users/{ids["profe"]}',
                             json={'email': 'ocupado@franzliszt.cl'})
    assert r.status_code == 400
    assert 'ocupado@franzliszt.cl' in r.get_json()['error']
    # Y no quedó a medias
    with app.app_context():
        assert User.query.get(ids['profe']).email == 'profe.138978087@franzliszt.cl'


def test_un_correo_con_forma_invalida_se_rechaza(entorno):
    app, cliente, ids = entorno
    for malo in ('sinarroba.cl', 'con espacio@x.cl', 'sin@dominio'):
        r = cliente('admin').put(f'/api/users/{ids["profe"]}', json={'email': malo})
        assert r.status_code == 400, malo


def test_mandar_el_mismo_correo_no_molesta(entorno):
    """Guardar la ficha sin tocar el correo no puede fallar por «ya existe»."""
    app, cliente, ids = entorno
    r = cliente('admin').put(f'/api/users/{ids["profe"]}', json={
        'email': 'profe.138978087@franzliszt.cl', 'phone': '+56 9 1234 5678'})
    assert r.status_code == 200
    assert r.get_json()['phone'] == '+56 9 1234 5678'


def test_un_docente_no_puede_cambiar_el_correo_de_otro(entorno):
    app, cliente, ids = entorno

    ajeno = cliente('otra').put(f'/api/users/{ids["profe"]}',
                                json={'email': 'secuestrado@x.cl'})
    assert ajeno.status_code == 403

    # Pero sí el suyo
    propio = cliente('otra').put(f'/api/users/{ids["otra"]}',
                                 json={'email': 'nuevo@franzliszt.cl'})
    assert propio.status_code == 200


def test_crear_sin_correo_avisa_en_vez_de_reventar(entorno):
    app, cliente, ids = entorno
    r = cliente('admin').post('/api/users/', json={
        'first_name': 'Sin', 'last_name': 'Correo', 'role': 'profesor'})
    assert r.status_code == 400
    assert 'correo' in r.get_json()['error'].lower()


def test_un_telefono_con_anexo_cabe_en_la_ficha(entorno):
    """Mismo problema que en los datos del colegio: VARCHAR(20) no alcanzaba."""
    app, cliente, ids = entorno
    from models import User

    telefono = '+56 2 2345 6789 an. 102'
    r = cliente('admin').put(f'/api/users/{ids["profe"]}', json={'phone': telefono})
    assert r.status_code == 200
    with app.app_context():
        assert User.query.get(ids['profe']).phone == telefono
