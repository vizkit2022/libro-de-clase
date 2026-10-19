"""Asignar una asignatura a varios cursos de una vez.

Lo delicado de una acción masiva es que se puede repetir por error, así que
lo central acá es que repetirla no duplique nada y que la simulación diga la
verdad antes de crear.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ['DATABASE_URL'] = 'sqlite:///:memory:'


@pytest.fixture()
def entorno():
    from app import create_app
    from models import db, School, User, Course, Subject
    from flask_jwt_extended import create_access_token

    app = create_app()
    app.config['TESTING'] = True
    with app.app_context():
        colegio = School(name='Colegio de Prueba')
        db.session.add(colegio)
        db.session.commit()

        admin = User(school_id=colegio.id, email='admin@asig.cl', first_name='V',
                     last_name='E', role='admin')
        admin.set_password('x')
        profe = User(school_id=colegio.id, email='profe@asig.cl', first_name='R',
                     last_name='H', role='profesor')
        profe.set_password('x')
        db.session.add_all([admin, profe])

        for n in range(1, 5):
            db.session.add(Course(school_id=colegio.id, name=f'{n}° Básico A',
                                  level=f'{n}° Básico', letter='A', year=2026))
        db.session.add(Course(school_id=colegio.id, name='1° Medio A',
                              level='1° Medio', letter='A', year=2027))
        leng = Subject(school_id=colegio.id, name='Lenguaje')
        quim = Subject(school_id=colegio.id, name='Química')
        db.session.add_all([leng, quim])
        db.session.commit()

        datos = {'leng': leng.id, 'quim': quim.id, 'school': colegio.id}
        toks = {u.role: create_access_token(
            identity=str(u.id),
            additional_claims={'role': u.role, 'school_id': colegio.id})
            for u in (admin, profe)}

    def cliente(rol='admin'):
        c = app.test_client()
        c.environ_base['HTTP_AUTHORIZATION'] = f'Bearer {toks[rol]}'
        return c

    yield app, cliente, datos

    with app.app_context():
        db.drop_all()


def test_simular_no_crea_nada(entorno):
    app, cliente, d = entorno
    from models import CourseSubject

    r = cliente().post(f'/api/subjects/{d["leng"]}/cursos',
                       json={'simular': True, 'year': 2026})
    assert r.status_code == 200
    assert r.get_json()['por_crear'] == 4
    assert r.get_json()['ya_tenian'] == 0

    with app.app_context():
        # Acotado a esta asignatura: el colegio de ejemplo del seed también
        # tiene filas y contarlas todas mediría otra cosa.
        assert CourseSubject.query.filter_by(subject_id=d['leng']).count() == 0


def test_asigna_a_todos_los_cursos_del_anio(entorno):
    app, cliente, d = entorno
    from models import CourseSubject

    r = cliente().post(f'/api/subjects/{d["leng"]}/cursos',
                       json={'year': 2026, 'hours_per_week': 8})
    assert r.status_code == 201
    assert r.get_json()['creados'] == 4

    with app.app_context():
        filas = CourseSubject.query.filter_by(subject_id=d['leng']).all()
        assert len(filas) == 4
        assert all(f.hours_per_week == 8 for f in filas)
        # El curso de 2027 no se tocó
        assert all(f.course.year == 2026 for f in filas)


def test_repetir_la_accion_no_duplica(entorno):
    """Es lo más fácil de hacer por error: apretar dos veces."""
    app, cliente, d = entorno
    from models import CourseSubject

    cliente().post(f'/api/subjects/{d["leng"]}/cursos', json={'year': 2026})
    r = cliente().post(f'/api/subjects/{d["leng"]}/cursos', json={'year': 2026})
    assert r.get_json()['creados'] == 0
    assert r.get_json()['ya_tenian'] == 4

    with app.app_context():
        assert CourseSubject.query.filter_by(subject_id=d['leng']).count() == 4


def test_se_puede_limitar_a_ciertos_niveles(entorno):
    """Química no va en 1° básico."""
    app, cliente, d = entorno
    from models import CourseSubject

    r = cliente().post(f'/api/subjects/{d["quim"]}/cursos',
                       json={'year': 2026, 'niveles': ['3° Básico', '4° Básico']})
    assert r.get_json()['creados'] == 2

    with app.app_context():
        nombres = sorted(f.course.name for f in
                         CourseSubject.query.filter_by(subject_id=d['quim']).all())
        assert nombres == ['3° Básico A', '4° Básico A']


def test_un_anio_sin_cursos_avisa(entorno):
    app, cliente, d = entorno
    r = cliente().post(f'/api/subjects/{d["leng"]}/cursos', json={'year': 2019})
    assert r.status_code == 404
    assert '2019' in r.get_json()['error']


def test_horas_fuera_de_rango_se_rechazan(entorno):
    app, cliente, d = entorno
    for horas in (0, 60):
        r = cliente().post(f'/api/subjects/{d["leng"]}/cursos',
                           json={'year': 2026, 'hours_per_week': horas})
        assert r.status_code == 400


def test_un_docente_no_puede_asignar_masivamente(entorno):
    app, cliente, d = entorno
    r = cliente('profesor').post(f'/api/subjects/{d["leng"]}/cursos', json={'year': 2026})
    assert r.status_code == 403


def test_los_anios_disponibles_traen_sus_niveles(entorno):
    app, cliente, d = entorno
    r = cliente().get('/api/subjects/cursos-disponibles')
    assert r.status_code == 200
    datos = r.get_json()
    por_year = {a['year']: a for a in datos['anios']}
    assert por_year[2026]['cursos'] == 4
    assert por_year[2027]['niveles'] == ['1° Medio']
