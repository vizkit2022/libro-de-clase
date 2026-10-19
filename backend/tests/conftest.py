"""
Fixtures compartidas para los tests de la "ficha completa del alumno".

- DATABASE_URL apunta a un SQLite temporal ANTES de importar `app` (el módulo app.py
  ejecuta `application = create_app()` al importarse: create_all + run_migrations + seed).
- Cada módulo de tests obtiene su propia BD nueva (fixture `app` con scope='module').
"""
import io
import itertools
import os
import sys
import tempfile
import uuid
from datetime import datetime

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
for _p in (BACKEND_DIR, TESTS_DIR):
    if _p not in sys.path:
        sys.path.insert(0, _p)

_BOOT_DIR = tempfile.mkdtemp(prefix='ficha_tests_boot_')
os.environ['DATABASE_URL'] = 'sqlite:///' + os.path.join(_BOOT_DIR, 'boot.db')

import app as app_module  # noqa: E402  (crea `application` sobre boot.db)
from models import db  # noqa: E402

SCHOOL_NAME = 'Colegio San Patricio'

CREDENTIALS = {
    'admin': ('admin@sanpatricio.cl', 'admin123'),
    'directivo': ('directivo@sanpatricio.cl', 'dir123'),
    'profesor': ('mvaldes@sanpatricio.cl', 'prof123'),
    'apoderado': ('apoderado@sanpatricio.cl', 'apod123'),
    'alumno': ('pedro.alvarado@gmail.com', 'alumno123'),
}

# Hash barato para usuarios creados en tests (check_password_hash lee el método del hash).
_FAST_HASH_METHOD = 'pbkdf2:sha256:1000'
_counter = itertools.count(1)


# ── App / client ─────────────────────────────────────────────────────────────
@pytest.fixture(scope='module')
def app(tmp_path_factory):
    db_path = tmp_path_factory.mktemp('db') / 'test.db'
    os.environ['DATABASE_URL'] = 'sqlite:///' + str(db_path)
    application = app_module.create_app()
    application.config['TESTING'] = True
    yield application
    with application.app_context():
        db.session.remove()
        db.engine.dispose()


@pytest.fixture(scope='module')
def client(app):
    return app.test_client()


# ── Auth helpers ─────────────────────────────────────────────────────────────
def login(client, email, password):
    """Devuelve headers {'Authorization': 'Bearer <token>'} (campo access_token)."""
    r = client.post('/api/auth/login', json={'email': email, 'password': password})
    assert r.status_code == 200, f'login {email} → {r.status_code} {r.get_data(as_text=True)}'
    token = r.get_json()['access_token']
    return {'Authorization': f'Bearer {token}'}


@pytest.fixture(scope='module')
def headers(client):
    """headers['admin'] / ['directivo'] / ['profesor'] / ['apoderado'] / ['alumno']."""
    return {role: login(client, *cred) for role, cred in CREDENTIALS.items()}


# ── Datos de la BD ───────────────────────────────────────────────────────────
@pytest.fixture(scope='module')
def ids(app):
    """IDs útiles del seed."""
    from models import User, School, StudentGuardian, Course
    with app.app_context():
        school = School.query.filter_by(name=SCHOOL_NAME).first()
        by_email = {u.email: u.id for u in User.query.all()}
        apod_id = by_email['apoderado@sanpatricio.cl']
        linked = sorted(sg.student_id for sg in StudentGuardian.query.filter_by(guardian_id=apod_id))
        course = Course.query.filter_by(school_id=school.id).first()
        return {
            'school': school.id,
            'admin': by_email['admin@sanpatricio.cl'],
            'directivo': by_email['directivo@sanpatricio.cl'],
            'profesor': by_email['mvaldes@sanpatricio.cl'],
            'apoderado': apod_id,
            'pedro': by_email['pedro.alvarado@gmail.com'],
            'valentina': by_email['vale.bravo@gmail.com'],
            'diego': by_email['diego.c@gmail.com'],  # NO vinculado al apoderado seed
            'linked': linked,
            'course': course.id,
            'course_name': course.name,
        }


def _rut_for(n):
    from excel_fixture import format_rut
    return format_rut(45000000 + n)


def create_user(app, role='alumno', school_id=None, password='alumno123', **fields):
    """Crea un User directamente en la BD y devuelve su id."""
    from models import User, School
    from werkzeug.security import generate_password_hash
    n = next(_counter)
    with app.app_context():
        if school_id is None:
            school_id = School.query.filter_by(name=SCHOOL_NAME).first().id
        u = User(
            school_id=school_id,
            email=fields.pop('email', f'test.{role}.{n}.{uuid.uuid4().hex[:6]}@example.com'),
            first_name=fields.pop('first_name', f'{role.capitalize()}{n}'),
            last_name=fields.pop('last_name', 'Test'),
            rut=fields.pop('rut', _rut_for(n)),
            role=role,
            **fields,
        )
        u.password_hash = generate_password_hash(password, method=_FAST_HASH_METHOD)
        db.session.add(u)
        db.session.commit()
        return u.id


@pytest.fixture
def make_student(app):
    """make_student(**fields) → id de un alumno nuevo del colegio seed (sin ficha)."""
    def _make(**fields):
        return create_user(app, role='alumno', **fields)
    return _make


@pytest.fixture(scope='module')
def other_school_student(app):
    """Alumno perteneciente a OTRO colegio (debe dar 404)."""
    from models import School
    with app.app_context():
        s = School(name='Colegio Otro', rut=f'99.{uuid.uuid4().int % 1000:03d}.111-1')
        db.session.add(s)
        db.session.commit()
        sid = s.id
    return create_user(app, role='alumno', school_id=sid)


def link_guardian(app, student_id, guardian_id, relationship='madre'):
    from models import StudentGuardian
    with app.app_context():
        db.session.add(StudentGuardian(student_id=student_id, guardian_id=guardian_id,
                                       relationship=relationship))
        db.session.commit()


def add_grades(app, student_id, grades):
    """grades: lista de (valor, publicada)."""
    from models import Grade, CourseSubject, Period, School
    with app.app_context():
        school = School.query.filter_by(name=SCHOOL_NAME).first()
        cs = CourseSubject.query.first()
        period = Period.query.filter_by(school_id=school.id).first()
        for value, published in grades:
            db.session.add(Grade(student_id=student_id, course_subject_id=cs.id,
                                 period_id=period.id, value=value, grade_type='nota',
                                 is_published=published,
                                 published_at=datetime.utcnow() if published else None))
        db.session.commit()


# ── Request helpers ──────────────────────────────────────────────────────────
def unwrap(data, key):
    """Algunas respuestas pueden venir envueltas ({'member': {...}}); acepta ambas formas."""
    if isinstance(data, dict) and key in data and isinstance(data[key], (dict, list)):
        return data[key]
    return data


def as_list(data, key):
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get(key), list):
        return data[key]
    raise AssertionError(f'Se esperaba lista (o {{{key!r}: [...]}}), llegó: {data!r}')


def file_tuple(content, filename):
    return (io.BytesIO(content), filename)


# PNG 1x1 válido
TINY_PNG_B64 = ('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
TINY_PNG_DATA_URL = 'data:image/png;base64,' + TINY_PNG_B64
