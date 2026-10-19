"""Matrícula con estados: matricular con fecha, retirar, cambiar de curso, reincorporar,
confirmar / repite / no continúa, confirmar todos y listado con todos los estados."""
from datetime import date

import pytest

from conftest import SCHOOL_NAME, create_user
from models import db

Y = 2026
PREV = Y - 1


def _school_id(app):
    from models import School
    with app.app_context():
        return School.query.filter_by(name=SCHOOL_NAME).first().id


def make_course(app, name, level, letter, year=Y, school_id=None):
    from models import Course
    with app.app_context():
        c = Course(school_id=school_id or _school_id(app), name=name, level=level,
                   letter=letter, year=year)
        db.session.add(c)
        db.session.commit()
        return c.id


def enroll(app, student_id, course_id, year=Y, status='activo', promoted_from_id=None):
    from models import Enrollment
    with app.app_context():
        e = Enrollment(student_id=student_id, course_id=course_id, year=year,
                       is_active=(status == 'activo'))
        e.status = status
        e.promoted_from_id = promoted_from_id
        db.session.add(e)
        db.session.commit()
        return e.id


def get_enr(app, eid):
    from models import Enrollment
    with app.app_context():
        e = Enrollment.query.get(eid)
        db.session.expunge(e)
        return e


def active_enrs(app, student_id, year=Y):
    from models import Enrollment
    with app.app_context():
        rows = Enrollment.query.filter_by(student_id=student_id, year=year, is_active=True).all()
        for r in rows:
            db.session.expunge(r)
        return rows


def events(app, student_id, event):
    from models import StudentHistory
    with app.app_context():
        return StudentHistory.query.filter_by(student_id=student_id, event=event).count()


def _err(r):
    return r.get_data(as_text=True)


def _alumnos(client, h, cid):
    r = client.get(f'/api/matricula/cursos/{cid}/alumnos', headers=h)
    assert r.status_code == 200, _err(r)
    return r.get_json()


def _fila(data, student_id, enrollment_id=None):
    for a in data['alumnos']:
        if a['id'] == student_id and (enrollment_id is None or a['enrollment_id'] == enrollment_id):
            return a
    raise AssertionError(f'alumno {student_id} no está en el listado')


@pytest.fixture(scope='module')
def cursos(app):
    from models import School
    with app.app_context():
        otro = School(name='Colegio Ajeno Matrícula', rut='77.777.777-7')
        db.session.add(otro)
        db.session.commit()
        otro_id = otro.id
    return {
        'A': make_course(app, '3° Básico A', '3° Básico', 'A'),
        'B': make_course(app, '3° Básico B', '3° Básico', 'B'),
        'R2A': make_course(app, '2° Básico A', '2° Básico', 'A'),        # destino de "repite"
        'P2A': make_course(app, '2° Básico A', '2° Básico', 'A', year=PREV),
        'PREV3': make_course(app, '3° Básico A', '3° Básico', 'A', year=PREV),
        'otro': make_course(app, '3° Básico A', '3° Básico', 'A', school_id=otro_id),
    }


# ── Permisos ────────────────────────────────────────────────────────────────
@pytest.mark.parametrize('role', ['profesor', 'apoderado', 'alumno'])
def test_escritura_prohibida(client, headers, cursos, role):
    r = client.post(f"/api/matricula/cursos/{cursos['A']}/alumnos", headers=headers[role],
                    json={'nombre': 'No', 'apellido': 'Permitido'})
    assert r.status_code == 403


def test_lectura_profesor_ok(client, headers, cursos):
    assert client.get(f"/api/matricula/cursos/{cursos['A']}/alumnos",
                      headers=headers['profesor']).status_code == 200
    assert client.get(f'/api/matricula/cursos?year={Y}', headers=headers['profesor']).status_code == 200


@pytest.mark.parametrize('role', ['apoderado', 'alumno'])
def test_lectura_prohibida(client, headers, cursos, role):
    assert client.get(f"/api/matricula/cursos/{cursos['A']}/alumnos",
                      headers=headers[role]).status_code == 403


# ── Matricular ──────────────────────────────────────────────────────────────
def test_matricular_con_fecha(client, headers, app, cursos):
    r = client.post(f"/api/matricula/cursos/{cursos['A']}/alumnos", headers=headers['admin'],
                    json={'nombre': 'Fecha', 'apellido': 'Matrícula Uno', 'fecha': '2026-03-04'})
    assert r.status_code == 201, _err(r)
    sid = r.get_json()['alumno']['id']
    e = active_enrs(app, sid)[0]
    assert e.status == 'activo' and e.is_active is True
    assert e.enrollment_date == date(2026, 3, 4)
    fila = _fila(_alumnos(client, headers['admin'], cursos['A']), sid)
    assert fila['estado'] == 'activo'
    assert fila['fecha_matricula'].startswith('2026-03-04')
    assert fila['fecha_retiro'] is None
    assert events(app, sid, 'matricula') == 1


def test_matricular_fecha_por_defecto_hoy(client, headers, app, cursos):
    r = client.post(f"/api/matricula/cursos/{cursos['A']}/alumnos", headers=headers['directivo'],
                    json={'nombre': 'Sin', 'apellido': 'Fecha Matrícula'})
    assert r.status_code == 201, _err(r)
    e = active_enrs(app, r.get_json()['alumno']['id'])[0]
    assert e.enrollment_date == date.today()


def test_enrollment_to_dict_incluye_campos(app, cursos):
    from models import Enrollment
    sid = create_user(app)
    eid = enroll(app, sid, cursos['A'])
    with app.app_context():
        d = Enrollment.query.get(eid).to_dict()
    for k in ('status', 'enrollment_date', 'withdrawal_date', 'withdrawal_reason',
              'confirmed_at', 'promoted_from_id'):
        assert k in d, k


# ── Retirar ─────────────────────────────────────────────────────────────────
def test_retirar_con_fecha_y_motivo(client, headers, app, cursos):
    from models import StudentProfile
    sid = create_user(app, last_name='Zúñiga Retiro')
    eid = enroll(app, sid, cursos['A'])
    r = client.delete(f'/api/matricula/enrollments/{eid}', headers=headers['admin'],
                      json={'fecha': '2026-10-01', 'motivo': 'Cambio de colegio'})
    assert r.status_code == 200, _err(r)
    e = get_enr(app, eid)
    assert e.status == 'retirado' and e.is_active is False
    assert e.withdrawal_date == date(2026, 10, 1)
    assert e.withdrawal_reason == 'Cambio de colegio'
    with app.app_context():
        p = StudentProfile.query.filter_by(student_id=sid).first()
        assert p is not None and p.status == 'retirado'
        assert p.withdrawal_date == date(2026, 10, 1)
        assert p.withdrawal_reason == 'Cambio de colegio'
    assert events(app, sid, 'retiro') == 1

    data = _alumnos(client, headers['admin'], cursos['A'])
    fila = _fila(data, sid)
    assert fila['estado'] == 'retirado'
    assert fila['fecha_retiro'].startswith('2026-10-01')
    assert fila['motivo_retiro'] == 'Cambio de colegio'
    # Los activos van primero
    estados = [a['estado'] for a in data['alumnos']]
    primeros_inactivos = [i for i, s in enumerate(estados) if s not in ('activo', 'por_confirmar')]
    ultimos_activos = [i for i, s in enumerate(estados) if s in ('activo', 'por_confirmar')]
    assert max(ultimos_activos) < min(primeros_inactivos)


def test_retirar_sin_cuerpo(client, headers, app, cursos):
    sid = create_user(app)
    eid = enroll(app, sid, cursos['A'])
    r = client.delete(f'/api/matricula/enrollments/{eid}', headers=headers['admin'])
    assert r.status_code == 200, _err(r)
    assert get_enr(app, eid).status == 'retirado'


def test_retirar_otro_colegio_404(client, headers, app, cursos, other_school_student):
    eid = enroll(app, other_school_student, cursos['otro'])
    r = client.delete(f'/api/matricula/enrollments/{eid}', headers=headers['admin'])
    assert r.status_code == 404
    assert get_enr(app, eid).is_active is True


# ── Cambiar de curso ────────────────────────────────────────────────────────
def test_cambiar_curso(client, headers, app, cursos):
    sid = create_user(app)
    eid = enroll(app, sid, cursos['A'])
    r = client.post(f'/api/matricula/enrollments/{eid}/cambiar-curso', headers=headers['admin'],
                    json={'course_id': cursos['B'], 'fecha': '2026-09-15', 'motivo': 'Reorganización'})
    assert r.status_code == 200, _err(r)
    o = get_enr(app, eid)
    assert o.status == 'trasladado' and o.is_active is False
    assert o.withdrawal_date == date(2026, 9, 15)
    act = active_enrs(app, sid)
    assert len(act) == 1
    assert act[0].course_id == cursos['B'] and act[0].status == 'activo'
    assert act[0].enrollment_date == date(2026, 9, 15)
    from models import StudentHistory
    with app.app_context():
        h = StudentHistory.query.filter_by(student_id=sid, event='cambio_curso').one()
        assert h.from_course_id == cursos['A'] and h.course_id == cursos['B']
    assert _fila(_alumnos(client, headers['admin'], cursos['A']), sid)['estado'] == 'trasladado'
    assert _fila(_alumnos(client, headers['admin'], cursos['B']), sid)['estado'] == 'activo'


def test_cambiar_mismo_curso_400(client, headers, app, cursos):
    sid = create_user(app)
    eid = enroll(app, sid, cursos['A'])
    r = client.post(f'/api/matricula/enrollments/{eid}/cambiar-curso', headers=headers['admin'],
                    json={'course_id': cursos['A']})
    assert r.status_code == 400
    assert get_enr(app, eid).is_active is True


def test_cambiar_a_otro_anio_rechazado(client, headers, app, cursos):
    sid = create_user(app)
    eid = enroll(app, sid, cursos['A'])
    r = client.post(f'/api/matricula/enrollments/{eid}/cambiar-curso', headers=headers['admin'],
                    json={'course_id': cursos['PREV3']})
    assert r.status_code == 400, _err(r)
    assert get_enr(app, eid).is_active is True


def test_cambiar_a_curso_otro_colegio_404(client, headers, app, cursos):
    sid = create_user(app)
    eid = enroll(app, sid, cursos['A'])
    r = client.post(f'/api/matricula/enrollments/{eid}/cambiar-curso', headers=headers['admin'],
                    json={'course_id': cursos['otro']})
    assert r.status_code == 404
    assert get_enr(app, eid).is_active is True


def test_cambiar_curso_profesor_403(client, headers, app, cursos):
    sid = create_user(app)
    eid = enroll(app, sid, cursos['A'])
    r = client.post(f'/api/matricula/enrollments/{eid}/cambiar-curso', headers=headers['profesor'],
                    json={'course_id': cursos['B']})
    assert r.status_code == 403


# ── Reincorporar ────────────────────────────────────────────────────────────
def test_reincorporar(client, headers, app, cursos):
    sid = create_user(app)
    eid = enroll(app, sid, cursos['A'])
    client.delete(f'/api/matricula/enrollments/{eid}', headers=headers['admin'],
                  json={'fecha': '2026-05-01', 'motivo': 'x'})
    r = client.post(f'/api/matricula/enrollments/{eid}/reincorporar', headers=headers['admin'],
                    json={'fecha': '2026-06-01'})
    assert r.status_code == 200, _err(r)
    act = active_enrs(app, sid)
    assert len(act) == 1 and act[0].course_id == cursos['A'] and act[0].status == 'activo'
    assert events(app, sid, 'reincorporacion') == 1


# ── Confirmar / repite / no continúa ────────────────────────────────────────
def _promovido(app, cursos):
    """Alumno de 2° Básico A (2025) promovido a 3° Básico A (2026) por confirmar."""
    sid = create_user(app)
    origen = enroll(app, sid, cursos['P2A'], year=PREV)
    eid = enroll(app, sid, cursos['A'], status='por_confirmar', promoted_from_id=origen)
    return sid, eid


def test_listado_incluye_por_confirmar_y_conteos(client, headers, app, cursos):
    sid, eid = _promovido(app, cursos)
    fila = _fila(_alumnos(client, headers['admin'], cursos['A']), sid, eid)
    assert fila['estado'] == 'por_confirmar'
    assert fila['promovido_desde'] == '2° Básico A'
    data = client.get(f'/api/matricula/cursos?year={Y}', headers=headers['admin']).get_json()
    c = [x for x in data if x['id'] == cursos['A']][0]
    assert c['por_confirmar'] >= 1
    assert c['retirados'] >= 1
    curso = _alumnos(client, headers['admin'], cursos['A'])['curso']
    assert curso['cerrado'] is False and curso['year'] == Y


def test_confirmar(client, headers, app, cursos):
    sid, eid = _promovido(app, cursos)
    r = client.post(f'/api/matricula/enrollments/{eid}/confirmar', headers=headers['admin'],
                    json={'accion': 'confirmar', 'fecha': '2026-02-20'})
    assert r.status_code == 200, _err(r)
    e = get_enr(app, eid)
    assert e.status == 'activo' and e.is_active is True
    assert e.enrollment_date == date(2026, 2, 20)
    assert e.confirmed_at is not None
    assert events(app, sid, 'confirmacion') == 1
    fila = _fila(_alumnos(client, headers['admin'], cursos['A']), sid, eid)
    assert fila['confirmado_at']


def test_confirmar_sin_fecha_usa_hoy(client, headers, app, cursos):
    sid, eid = _promovido(app, cursos)
    r = client.post(f'/api/matricula/enrollments/{eid}/confirmar', headers=headers['admin'],
                    json={'accion': 'confirmar'})
    assert r.status_code == 200, _err(r)
    assert get_enr(app, eid).enrollment_date == date.today()


def test_repite(client, headers, app, cursos):
    sid, eid = _promovido(app, cursos)
    r = client.post(f'/api/matricula/enrollments/{eid}/confirmar', headers=headers['admin'],
                    json={'accion': 'repite', 'fecha': '2026-02-21'})
    assert r.status_code == 200, _err(r)
    act = active_enrs(app, sid)
    assert len(act) == 1
    assert act[0].course_id == cursos['R2A']           # mismo nivel que en 2025, año 2026
    assert act[0].status == 'activo' and act[0].confirmed_at is not None
    assert events(app, sid, 'repite') == 1
    assert not [a for a in _alumnos(client, headers['admin'], cursos['A'])['alumnos']
                if a['id'] == sid and a['estado'] in ('activo', 'por_confirmar')]


def test_no_continua(client, headers, app, cursos):
    sid, eid = _promovido(app, cursos)
    r = client.post(f'/api/matricula/enrollments/{eid}/confirmar', headers=headers['admin'],
                    json={'accion': 'no_continua', 'fecha': '2026-02-22', 'motivo': 'Se cambia de ciudad'})
    assert r.status_code == 200, _err(r)
    e = get_enr(app, eid)
    assert e.status == 'no_continua' and e.is_active is False
    assert e.withdrawal_date == date(2026, 2, 22)
    assert e.withdrawal_reason == 'Se cambia de ciudad'
    assert events(app, sid, 'no_continua') == 1
    assert _fila(_alumnos(client, headers['admin'], cursos['A']), sid, eid)['estado'] == 'no_continua'


def test_reincorporar_no_continua(client, headers, app, cursos):
    sid, eid = _promovido(app, cursos)
    client.post(f'/api/matricula/enrollments/{eid}/confirmar', headers=headers['admin'],
                json={'accion': 'no_continua', 'motivo': 'x'})
    r = client.post(f'/api/matricula/enrollments/{eid}/reincorporar', headers=headers['admin'],
                    json={'fecha': '2026-03-10'})
    assert r.status_code == 200, _err(r)
    assert [e.course_id for e in active_enrs(app, sid)] == [cursos['A']]


def test_confirmar_estado_invalido_400(client, headers, app, cursos):
    sid = create_user(app)
    eid = enroll(app, sid, cursos['A'])                # ya activo
    r = client.post(f'/api/matricula/enrollments/{eid}/confirmar', headers=headers['admin'],
                    json={'accion': 'confirmar'})
    assert r.status_code == 400


def test_confirmar_accion_invalida_400(client, headers, app, cursos):
    sid, eid = _promovido(app, cursos)
    r = client.post(f'/api/matricula/enrollments/{eid}/confirmar', headers=headers['admin'],
                    json={'accion': 'cualquier_cosa'})
    assert r.status_code == 400
    assert get_enr(app, eid).status == 'por_confirmar'


def test_confirmar_profesor_403(client, headers, app, cursos):
    sid, eid = _promovido(app, cursos)
    r = client.post(f'/api/matricula/enrollments/{eid}/confirmar', headers=headers['profesor'],
                    json={'accion': 'confirmar'})
    assert r.status_code == 403


def test_confirmar_todos(client, headers, app, cursos):
    from models import Enrollment
    cid = make_course(app, '4° Básico A', '4° Básico', 'A')
    eids = []
    for _ in range(3):
        sid = create_user(app)
        eids.append(enroll(app, sid, cid, status='por_confirmar'))
    activo = enroll(app, create_user(app), cid)
    r = client.post(f'/api/matricula/cursos/{cid}/confirmar-todos', headers=headers['admin'],
                    json={'fecha': '2026-02-25'})
    assert r.status_code == 200, _err(r)
    assert r.get_json()['confirmados'] == 3
    for eid in eids:
        e = get_enr(app, eid)
        assert e.status == 'activo' and e.is_active is True
        assert e.enrollment_date == date(2026, 2, 25)
    with app.app_context():
        assert Enrollment.query.filter_by(course_id=cid, status='por_confirmar').count() == 0
    assert get_enr(app, activo).status == 'activo'
    # Repetirlo no confirma nada
    r = client.post(f'/api/matricula/cursos/{cid}/confirmar-todos', headers=headers['admin'], json={})
    assert r.status_code == 200 and r.get_json()['confirmados'] == 0


def test_confirmar_todos_otro_colegio_404(client, headers, cursos):
    r = client.post(f"/api/matricula/cursos/{cursos['otro']}/confirmar-todos",
                    headers=headers['admin'], json={})
    assert r.status_code == 404
