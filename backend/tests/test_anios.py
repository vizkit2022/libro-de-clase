"""Años académicos: listado perezoso, creación del año siguiente (copias y promoción),
cierre / reapertura y bloqueo de escritura en años cerrados."""
from datetime import date

import pytest

from conftest import SCHOOL_NAME, create_user
from models import db

Y = 2026          # año del seed
NEXT = Y + 1


# ── Helpers locales ──────────────────────────────────────────────────────────
def _school_id(app):
    from models import School
    with app.app_context():
        return School.query.filter_by(name=SCHOOL_NAME).first().id


def make_course(app, name, level, letter, year=Y, head_teacher_id=None, school_id=None):
    from models import Course
    with app.app_context():
        c = Course(school_id=school_id or _school_id(app), name=name, level=level, letter=letter,
                   year=year, head_teacher_id=head_teacher_id, description=f'desc {name}')
        db.session.add(c)
        db.session.commit()
        return c.id


def enroll(app, student_id, course_id, year=Y, status='activo'):
    from models import Enrollment
    with app.app_context():
        e = Enrollment(student_id=student_id, course_id=course_id, year=year,
                       is_active=(status == 'activo'))
        e.status = status
        db.session.add(e)
        db.session.commit()
        return e.id


def _err(r):
    return r.get_data(as_text=True)


def _anio(client, h, year):
    r = client.get('/api/anios', headers=h)
    assert r.status_code == 200, _err(r)
    rows = [a for a in r.get_json()['anios'] if a['year'] == year]
    assert rows, f'No aparece el año {year} en /api/anios'
    return rows[0]


# ── Escenario ────────────────────────────────────────────────────────────────
@pytest.fixture(scope='module')
def esc(app, ids):
    """Cursos 2026: Kinder A, Kinder C, 1° Básico A/B, 2°A, 3°A, 4°A, (5°A seed), 6°A."""
    from models import Course, CourseSubject, Subject
    prof = ids['profesor']
    c = {
        'KA': make_course(app, 'Kinder A', 'Kinder', 'A', head_teacher_id=prof),
        'KC': make_course(app, 'Kinder C', 'Kinder', 'C'),
        '1A': make_course(app, '1° Básico A', '1° Básico', 'A'),
        '1B': make_course(app, '1° Básico B', '1° Básico', 'B'),
        '2A': make_course(app, '2° Básico A', '2° Básico', 'A'),
        '3A': make_course(app, '3° Básico A', '3° Básico', 'A'),
        '4A': make_course(app, '4° Básico A', '4° Básico', 'A'),
        '6A': make_course(app, '6° Básico A', '6° Básico', 'A'),
    }
    with app.app_context():
        c['5A'] = Course.query.filter_by(school_id=ids['school'], name='5° Básico A', year=Y).first().id
        subj = Subject.query.filter_by(school_id=ids['school']).order_by(Subject.id).first()
        db.session.add(CourseSubject(course_id=c['KA'], subject_id=subj.id, teacher_id=prof,
                                     hours_per_week=3))
        db.session.commit()
    s = {k: create_user(app, role='alumno', last_name=f'Esc{k}')
         for k in ('kA', 'kC', 'b1B', 's6', 'ret')}
    e = {
        'kA': enroll(app, s['kA'], c['KA']),
        'kC': enroll(app, s['kC'], c['KC']),
        'b1B': enroll(app, s['b1B'], c['1B']),
        's6': enroll(app, s['s6'], c['6A']),
        'ret': enroll(app, s['ret'], c['1A'], status='retirado'),
    }
    return {'courses': c, 'students': s, 'enr': e}


# ── GET /api/anios ───────────────────────────────────────────────────────────
def test_get_anios_crea_filas_perezosas(client, headers, app, esc, ids):
    r = client.get('/api/anios', headers=headers['admin'])
    assert r.status_code == 200, _err(r)
    data = r.get_json()
    assert data['actual'] == Y
    years = [a['year'] for a in data['anios']]
    assert Y in years
    assert years == sorted(years, reverse=True)
    row = [a for a in data['anios'] if a['year'] == Y][0]
    assert row['estado'] == 'abierto'
    assert row['cursos'] >= 9
    assert row['alumnos_activos'] >= 4
    for k in ('por_confirmar', 'created_from_year', 'closed_at', 'closed_by_name', 'reopened_at'):
        assert k in row
    from models import AcademicYear
    with app.app_context():
        assert AcademicYear.query.filter_by(school_id=ids['school'], year=Y).count() == 1
    # Llamarlo dos veces no duplica filas
    client.get('/api/anios', headers=headers['admin'])
    with app.app_context():
        assert AcademicYear.query.filter_by(school_id=ids['school'], year=Y).count() == 1


@pytest.mark.parametrize('role', ['directivo', 'profesor'])
def test_get_anios_lectura_permitida(client, headers, role):
    assert client.get('/api/anios', headers=headers[role]).status_code == 200


@pytest.mark.parametrize('role', ['apoderado', 'alumno'])
def test_get_anios_prohibido(client, headers, role):
    assert client.get('/api/anios', headers=headers[role]).status_code == 403


@pytest.mark.parametrize('role', ['profesor', 'apoderado', 'alumno'])
def test_post_anios_prohibido(client, headers, role):
    r = client.post('/api/anios', headers=headers[role],
                    json={'year': 2040, 'copiar_de': Y, 'copiar': {'cursos': True}})
    assert r.status_code == 403


def test_post_alumnos_requiere_cursos(client, headers):
    r = client.post('/api/anios', headers=headers['admin'],
                    json={'year': 2041, 'copiar_de': Y,
                          'copiar': {'cursos': False, 'asignaturas': False,
                                     'periodos': False, 'alumnos': True}})
    assert r.status_code == 400, _err(r)
    assert 'error' in r.get_json()


# ── POST /api/anios (año siguiente con todo) ─────────────────────────────────
@pytest.fixture(scope='module')
def creado(client, headers, app, esc, ids):
    from models import Course, Period
    with app.app_context():
        n_cursos = Course.query.filter_by(school_id=ids['school'], year=Y, is_active=True).count()
        n_periodos = Period.query.filter_by(school_id=ids['school'], year=Y).count()
    r = client.post('/api/anios', headers=headers['admin'],
                    json={'year': NEXT, 'copiar_de': Y,
                          'copiar': {'cursos': True, 'asignaturas': True,
                                     'periodos': True, 'alumnos': True}})
    assert r.status_code == 201, _err(r)
    return {'resp': r.get_json(), 'n_cursos': n_cursos, 'n_periodos': n_periodos}


def _course_next(app, ids, name):
    from models import Course
    with app.app_context():
        c = Course.query.filter_by(school_id=ids['school'], year=NEXT, name=name).first()
        assert c is not None, f'No se copió el curso {name} a {NEXT}'
        return c.id


def _enr_next(app, student_id):
    from models import Enrollment
    with app.app_context():
        return Enrollment.query.filter_by(student_id=student_id, year=NEXT).all()


def test_crear_respuesta(creado):
    d = creado['resp']
    assert d['year'] == NEXT
    assert d['cursos_creados'] == creado['n_cursos']
    assert d['periodos_copiados'] == creado['n_periodos']
    assert d['asignaturas_copiadas'] >= 7          # 6 del seed (5°A) + 1 de Kinder A
    assert d['alumnos_promovidos'] >= 4
    assert d['egresados'] >= 1
    assert isinstance(d['mapa'], list)
    assert isinstance(d['sin_curso_destino'], list)
    pares = {(m['desde'], m['hacia']) for m in d['mapa']}
    assert ('Kinder A', '1° Básico A') in pares
    assert ('1° Básico B', '2° Básico A') in pares
    assert ('5° Básico A', '6° Básico A') in pares


def test_crear_copia_cursos_y_profesor_jefe(app, ids, creado):
    from models import Course
    with app.app_context():
        orig = Course.query.filter_by(school_id=ids['school'], year=Y, is_active=True).all()
        nuevos = {c.name: c for c in Course.query.filter_by(school_id=ids['school'], year=NEXT).all()}
        assert len(nuevos) == len(orig)
        for o in orig:
            n = nuevos[o.name]
            assert n.id != o.id
            assert (n.level, n.letter, n.head_teacher_id, n.description) == \
                   (o.level, o.letter, o.head_teacher_id, o.description)
        assert nuevos['Kinder A'].head_teacher_id == ids['profesor']


def test_crear_copia_asignaturas_con_profesor(app, ids, creado):
    from models import Course, CourseSubject
    with app.app_context():
        for name in ('5° Básico A', 'Kinder A'):
            o = Course.query.filter_by(school_id=ids['school'], year=Y, name=name).first()
            n = Course.query.filter_by(school_id=ids['school'], year=NEXT, name=name).first()
            a = sorted((cs.subject_id, cs.teacher_id, cs.hours_per_week)
                       for cs in CourseSubject.query.filter_by(course_id=o.id))
            b = sorted((cs.subject_id, cs.teacher_id, cs.hours_per_week)
                       for cs in CourseSubject.query.filter_by(course_id=n.id))
            assert a and a == b


def test_crear_copia_periodos_mas_un_anio(app, ids, creado):
    from models import Period
    with app.app_context():
        orig = sorted(Period.query.filter_by(school_id=ids['school'], year=Y),
                      key=lambda p: (p.number or 0, p.start_date or date.min))
        nuevos = sorted(Period.query.filter_by(school_id=ids['school'], year=NEXT),
                        key=lambda p: (p.number or 0, p.start_date or date.min))
        assert len(nuevos) == len(orig) >= 2
        for o, n in zip(orig, nuevos):
            assert n.period_type == o.period_type
            assert n.number == o.number
            if o.start_date:
                assert n.start_date == o.start_date.replace(year=o.start_date.year + 1)
            if o.end_date:
                assert n.end_date == o.end_date.replace(year=o.end_date.year + 1)


@pytest.mark.parametrize('alumno,destino', [
    ('kA', '1° Básico A'),     # Kinder → 1° Básico, misma letra
    ('kC', '1° Básico A'),     # sin letra C y varios cursos → 'A'
    ('b1B', '2° Básico A'),    # sin letra B y un único curso → ese
])
def test_promocion_mapa(app, ids, esc, creado, alumno, destino):
    from models import Enrollment
    sid = esc['students'][alumno]
    rows = _enr_next(app, sid)
    assert len(rows) == 1, f'{alumno}: {len(rows)} matrículas en {NEXT}'
    e = rows[0]
    assert e.course_id == _course_next(app, ids, destino)
    assert e.status == 'por_confirmar'
    assert e.is_active is False
    assert e.promoted_from_id == esc['enr'][alumno]
    # La matrícula de origen no se toca
    with app.app_context():
        o = Enrollment.query.get(esc['enr'][alumno])
        assert o.status == 'activo' and o.is_active is True


def test_promocion_alumnos_del_seed(app, ids, creado):
    from models import Course, Enrollment
    with app.app_context():
        c5 = Course.query.filter_by(school_id=ids['school'], year=Y, name='5° Básico A').first()
        activos = Enrollment.query.filter_by(course_id=c5.id, is_active=True).all()
        c6n = Course.query.filter_by(school_id=ids['school'], year=NEXT, name='6° Básico A').first()
        for o in activos:
            n = Enrollment.query.filter_by(student_id=o.student_id, year=NEXT).one()
            assert n.course_id == c6n.id and n.promoted_from_id == o.id


def test_ultimo_nivel_egresa(app, esc, creado):
    from models import Enrollment, StudentHistory
    sid = esc['students']['s6']
    assert _enr_next(app, sid) == []
    with app.app_context():
        o = Enrollment.query.get(esc['enr']['s6'])
        assert o.status == 'activo' and o.is_active is True      # la de N no se toca
        assert StudentHistory.query.filter_by(student_id=sid, event='egreso').count() == 1


def test_retirado_no_se_promueve(app, esc, creado):
    assert _enr_next(app, esc['students']['ret']) == []


def test_historial_promocion(app, esc, creado):
    from models import StudentHistory
    with app.app_context():
        h = StudentHistory.query.filter_by(student_id=esc['students']['kA'], event='promocion').all()
        assert len(h) == 1
        assert h[0].year == NEXT
        assert h[0].description


def test_anio_duplicado_409(client, headers, creado):
    r = client.post('/api/anios', headers=headers['admin'],
                    json={'year': NEXT, 'copiar_de': Y, 'copiar': {'cursos': True}})
    assert r.status_code == 409
    assert 'error' in r.get_json()


def test_listado_tras_crear(client, headers, creado):
    data = client.get('/api/anios', headers=headers['admin']).get_json()
    assert data['actual'] == Y            # 2027 es futuro respecto del año calendario
    row = [a for a in data['anios'] if a['year'] == NEXT][0]
    assert row['estado'] == 'abierto'
    assert row['created_from_year'] == Y
    assert row['cursos'] == creado['n_cursos']
    assert row['por_confirmar'] >= 4
    assert row['alumnos_activos'] == 0


def test_crear_solo_cursos(client, headers, app, ids, creado):
    from models import Course, CourseSubject, Enrollment, Period
    r = client.post('/api/anios', headers=headers['directivo'],
                    json={'year': 2029, 'copiar_de': Y,
                          'copiar': {'cursos': True, 'asignaturas': False,
                                     'periodos': False, 'alumnos': False}})
    assert r.status_code == 201, _err(r)
    d = r.get_json()
    assert d['cursos_creados'] == creado['n_cursos']
    assert d['asignaturas_copiadas'] == 0
    assert d['periodos_copiados'] == 0
    assert d['alumnos_promovidos'] == 0
    with app.app_context():
        cids = [c.id for c in Course.query.filter_by(school_id=ids['school'], year=2029)]
        assert len(cids) == creado['n_cursos']
        assert CourseSubject.query.filter(CourseSubject.course_id.in_(cids)).count() == 0
        assert Period.query.filter_by(school_id=ids['school'], year=2029).count() == 0
        assert Enrollment.query.filter_by(year=2029).count() == 0


def test_crear_cursos_y_asignaturas_sin_alumnos(client, headers, app, ids, creado):
    from models import Course, CourseSubject, Enrollment, Period
    r = client.post('/api/anios', headers=headers['admin'],
                    json={'year': 2030, 'copiar_de': Y,
                          'copiar': {'cursos': True, 'asignaturas': True,
                                     'periodos': False, 'alumnos': False}})
    assert r.status_code == 201, _err(r)
    with app.app_context():
        cids = [c.id for c in Course.query.filter_by(school_id=ids['school'], year=2030)]
        assert CourseSubject.query.filter(CourseSubject.course_id.in_(cids)).count() >= 7
        assert Period.query.filter_by(school_id=ids['school'], year=2030).count() == 0
        assert Enrollment.query.filter_by(year=2030).count() == 0


def test_crear_solo_periodos(client, headers, app, ids, creado):
    from models import Course, Period
    r = client.post('/api/anios', headers=headers['admin'],
                    json={'year': 2031, 'copiar_de': Y,
                          'copiar': {'cursos': False, 'asignaturas': False,
                                     'periodos': True, 'alumnos': False}})
    assert r.status_code == 201, _err(r)
    assert r.get_json()['periodos_copiados'] == creado['n_periodos']
    with app.app_context():
        assert Course.query.filter_by(school_id=ids['school'], year=2031).count() == 0
        assert Period.query.filter_by(school_id=ids['school'], year=2031).count() == creado['n_periodos']


# ── Cerrar / reabrir y bloqueo ───────────────────────────────────────────────
@pytest.fixture(scope='module')
def recursos_next(app, ids, esc, creado):
    """Recursos del año NEXT para probar el bloqueo."""
    from models import Course, CourseSubject, Period, Subject, Enrollment
    with app.app_context():
        c1a = Course.query.filter_by(school_id=ids['school'], year=NEXT, name='1° Básico A').first()
        c1b = Course.query.filter_by(school_id=ids['school'], year=NEXT, name='1° Básico B').first()
        cka = Course.query.filter_by(school_id=ids['school'], year=NEXT, name='Kinder A').first()
        cs = CourseSubject.query.filter_by(course_id=cka.id).first()
        period = Period.query.filter_by(school_id=ids['school'], year=NEXT).first()
        usados = {x.subject_id for x in CourseSubject.query.filter_by(course_id=cka.id)}
        libre = Subject.query.filter(Subject.school_id == ids['school'],
                                     ~Subject.id.in_(usados)).first()
        e_kA = Enrollment.query.filter_by(student_id=esc['students']['kA'], year=NEXT).one()
        return {'c1a': c1a.id, 'c1b': c1b.id, 'cka': cka.id, 'cs': cs.id, 'period': period.id,
                'subject_libre': libre.id, 'e_kA': e_kA.id, 'kA': esc['students']['kA'],
                'kC': esc['students']['kC']}


@pytest.mark.parametrize('role', ['directivo', 'profesor', 'apoderado', 'alumno'])
def test_cerrar_solo_admin(client, headers, creado, role):
    assert client.post(f'/api/anios/{NEXT}/cerrar', headers=headers[role]).status_code == 403
    assert client.post(f'/api/anios/{NEXT}/reabrir', headers=headers[role]).status_code == 403


def test_cerrar(client, headers, creado, recursos_next):
    r = client.post(f'/api/anios/{NEXT}/cerrar', headers=headers['admin'])
    assert r.status_code == 200, _err(r)
    d = r.get_json()
    assert d['year'] == NEXT and d['estado'] == 'cerrado' and d['closed_at']
    row = _anio(client, headers['admin'], NEXT)
    assert row['estado'] == 'cerrado'
    assert row['closed_at']
    assert row['closed_by_name']


def _assert_bloqueado(r):
    assert r.status_code == 409, f'{r.status_code} {_err(r)}'
    err = r.get_json().get('error', '')
    assert 'cerrado' in err.lower()
    assert str(NEXT) in err


def test_bloqueo_matricular(client, headers, recursos_next):
    _assert_bloqueado(client.post(f"/api/matricula/cursos/{recursos_next['c1a']}/alumnos",
                                  headers=headers['admin'],
                                  json={'nombre': 'Bloqueado', 'apellido': 'Año Cerrado'}))


def test_bloqueo_retirar(client, headers, recursos_next):
    _assert_bloqueado(client.delete(f"/api/matricula/enrollments/{recursos_next['e_kA']}",
                                    headers=headers['admin'],
                                    json={'fecha': f'{NEXT}-03-10', 'motivo': 'x'}))


def test_bloqueo_cambiar_curso(client, headers, recursos_next):
    _assert_bloqueado(client.post(f"/api/matricula/enrollments/{recursos_next['e_kA']}/cambiar-curso",
                                  headers=headers['admin'],
                                  json={'course_id': recursos_next['c1b'], 'fecha': f'{NEXT}-03-10'}))


def test_bloqueo_confirmar(client, headers, recursos_next):
    _assert_bloqueado(client.post(f"/api/matricula/enrollments/{recursos_next['e_kA']}/confirmar",
                                  headers=headers['admin'], json={'accion': 'confirmar'}))


def test_bloqueo_confirmar_todos(client, headers, recursos_next):
    _assert_bloqueado(client.post(f"/api/matricula/cursos/{recursos_next['c1a']}/confirmar-todos",
                                  headers=headers['admin'], json={}))


def test_bloqueo_nota(client, headers, recursos_next):
    _assert_bloqueado(client.post('/api/grades/', headers=headers['admin'],
                                  json={'student_id': recursos_next['kA'],
                                        'course_subject_id': recursos_next['cs'],
                                        'period_id': recursos_next['period'], 'value': 6.0}))


def test_bloqueo_anotacion(client, headers, recursos_next):
    _assert_bloqueado(client.post('/api/annotations/', headers=headers['admin'],
                                  json={'student_id': recursos_next['kA'],
                                        'course_id': recursos_next['cka'],
                                        'annotation_type': 'positiva', 'title': 'T',
                                        'description': 'D'}))


def test_bloqueo_asignatura_curso(client, headers, recursos_next):
    _assert_bloqueado(client.post(f"/api/courses/{recursos_next['cka']}/subjects",
                                  headers=headers['admin'],
                                  json={'subject_id': recursos_next['subject_libre']}))


def test_ficha_personal_no_se_bloquea(client, headers, recursos_next):
    r = client.put(f"/api/students/{recursos_next['kA']}/profile", headers=headers['admin'],
                   json={'user': {'address': 'Calle Año Cerrado 123'}})
    assert r.status_code == 200, _err(r)


def test_anio_abierto_sigue_editable(client, headers, app, ids, recursos_next):
    from models import Course, CourseSubject, Period
    with app.app_context():
        c5 = Course.query.filter_by(school_id=ids['school'], year=Y, name='5° Básico A').first()
        cs = CourseSubject.query.filter_by(course_id=c5.id).first()
        p = Period.query.filter_by(school_id=ids['school'], year=Y).first()
    r = client.post('/api/grades/', headers=headers['admin'],
                    json={'student_id': ids['pedro'], 'course_subject_id': cs.id,
                          'period_id': p.id, 'value': 6.5})
    assert r.status_code == 201, _err(r)


def test_reabrir_desbloquea(client, headers, app, ids, recursos_next):
    r = client.post(f'/api/anios/{NEXT}/reabrir', headers=headers['admin'])
    assert r.status_code == 200, _err(r)
    d = r.get_json()
    assert d['year'] == NEXT and d['estado'] == 'abierto' and d['reopened_at']
    row = _anio(client, headers['admin'], NEXT)
    assert row['estado'] == 'abierto' and row['reopened_at']

    r = client.post(f"/api/matricula/enrollments/{recursos_next['e_kA']}/confirmar",
                    headers=headers['admin'], json={'accion': 'confirmar', 'fecha': f'{NEXT}-03-01'})
    assert r.status_code == 200, _err(r)
    r = client.post('/api/grades/', headers=headers['admin'],
                    json={'student_id': recursos_next['kA'], 'course_subject_id': recursos_next['cs'],
                          'period_id': recursos_next['period'], 'value': 6.0})
    assert r.status_code == 201, _err(r)
    r = client.post(f"/api/courses/{recursos_next['cka']}/subjects", headers=headers['admin'],
                    json={'subject_id': recursos_next['subject_libre']})
    assert r.status_code == 201, _err(r)

    from models import AcademicYear
    with app.app_context():
        ay = AcademicYear.query.filter_by(school_id=ids['school'], year=NEXT).first()
        assert ay.reopened_by is not None and ay.closed_by is not None
