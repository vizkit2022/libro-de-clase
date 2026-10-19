"""Historial del alumno: eventos generados por cada acción, ficha_editada con antes/después,
orden descendente y permisos."""
import json

import pytest

from conftest import SCHOOL_NAME, create_user
from models import db

Y = 2026


def _school_id(app):
    from models import School
    with app.app_context():
        return School.query.filter_by(name=SCHOOL_NAME).first().id


def make_course(app, name, level, letter, year=Y):
    from models import Course
    with app.app_context():
        c = Course(school_id=_school_id(app), name=name, level=level, letter=letter, year=year)
        db.session.add(c)
        db.session.commit()
        return c.id


def _err(r):
    return r.get_data(as_text=True)


def _historial(client, h, sid):
    r = client.get(f'/api/matricula/alumnos/{sid}/historial', headers=h)
    assert r.status_code == 200, _err(r)
    return r.get_json()


def _detalles(ev):
    d = ev.get('detalles')
    if isinstance(d, str):
        d = json.loads(d) if d else None
    return d


@pytest.fixture(scope='module')
def cursos(app):
    return {'A': make_course(app, '7° Básico A', '7° Básico', 'A'),
            'B': make_course(app, '7° Básico B', '7° Básico', 'B')}


@pytest.fixture(scope='module')
def recorrido(client, headers, app, cursos):
    """Un alumno que pasa por matrícula → cambio de curso → retiro → reincorporación."""
    h = headers['admin']
    r = client.post(f"/api/matricula/cursos/{cursos['A']}/alumnos", headers=h,
                    json={'nombre': 'Historia', 'apellido': 'Completa Uno', 'rut': '22.333.444-5',
                          'fecha': '2026-03-01'})
    assert r.status_code == 201, _err(r)
    sid = r.get_json()['alumno']['id']
    from models import Enrollment
    with app.app_context():
        eid = Enrollment.query.filter_by(student_id=sid, is_active=True).one().id
    r = client.post(f'/api/matricula/enrollments/{eid}/cambiar-curso', headers=h,
                    json={'course_id': cursos['B'], 'fecha': '2026-04-01'})
    assert r.status_code == 200, _err(r)
    with app.app_context():
        eid2 = Enrollment.query.filter_by(student_id=sid, is_active=True).one().id
    r = client.delete(f'/api/matricula/enrollments/{eid2}', headers=h,
                      json={'fecha': '2026-05-01', 'motivo': 'Motivo de prueba'})
    assert r.status_code == 200, _err(r)
    r = client.post(f'/api/matricula/enrollments/{eid2}/reincorporar', headers=h,
                    json={'fecha': '2026-06-01'})
    assert r.status_code == 200, _err(r)
    return sid


def test_estructura(client, headers, recorrido):
    d = _historial(client, headers['admin'], recorrido)
    assert d['alumno']['id'] == recorrido
    assert 'Historia' in d['alumno']['nombre']
    assert 'rut' in d['alumno']
    assert isinstance(d['eventos'], list) and d['eventos']
    for ev in d['eventos']:
        for k in ('id', 'fecha', 'evento', 'descripcion', 'detalles', 'year', 'curso',
                  'curso_origen', 'usuario'):
            assert k in ev, k
        assert ev['descripcion']


def test_eventos_de_cada_accion(client, headers, recorrido):
    evs = [e['evento'] for e in _historial(client, headers['admin'], recorrido)['eventos']]
    for esperado in ('matricula', 'cambio_curso', 'retiro', 'reincorporacion'):
        assert esperado in evs, f'falta {esperado}: {evs}'


def test_orden_descendente(client, headers, recorrido):
    evs = _historial(client, headers['admin'], recorrido)['eventos']
    fechas = [e['fecha'] for e in evs]
    assert fechas == sorted(fechas, reverse=True)
    nombres = [e['evento'] for e in evs]
    # El primero que ocurrió (matrícula) es el último del listado
    assert nombres[-1] == 'matricula'
    assert nombres.index('reincorporacion') < nombres.index('retiro') < nombres.index('cambio_curso')


def test_cambio_curso_trae_cursos_y_usuario(client, headers, recorrido):
    ev = [e for e in _historial(client, headers['admin'], recorrido)['eventos']
          if e['evento'] == 'cambio_curso'][0]
    assert ev['curso'] == '7° Básico B'
    assert ev['curso_origen'] == '7° Básico A'
    assert ev['usuario']            # actor = admin
    assert ev['year'] == Y


def test_ficha_editada_antes_despues(client, headers, app, make_student):
    sid = make_student(address='Dirección Vieja 1')
    r = client.put(f'/api/students/{sid}/profile', headers=headers['admin'],
                   json={'user': {'address': 'Dirección Nueva 2'}})
    assert r.status_code == 200, _err(r)
    evs = [e for e in _historial(client, headers['admin'], sid)['eventos']
           if e['evento'] == 'ficha_editada']
    assert len(evs) == 1
    det = _detalles(evs[0])
    campos = det['campos']
    match = [c for c in campos if c.get('antes') == 'Dirección Vieja 1']
    assert match, campos
    assert match[0]['despues'] == 'Dirección Nueva 2'
    assert match[0]['campo']                 # etiqueta legible
    assert match[0]['campo'] != 'address'


def test_ficha_sin_cambios_no_genera_campos_falsos(client, headers, make_student):
    sid = make_student(address='Igual 123')
    client.put(f'/api/students/{sid}/profile', headers=headers['admin'],
               json={'user': {'address': 'Igual 123'}})
    for ev in _historial(client, headers['admin'], sid)['eventos']:
        if ev['evento'] == 'ficha_editada':
            det = _detalles(ev) or {}
            for c in det.get('campos', []):
                assert c.get('antes') != c.get('despues')


def test_ficha_editada_medica_y_familia(client, headers, make_student):
    sid = make_student()
    h = headers['admin']
    assert client.put(f'/api/students/{sid}/medical', headers=h,
                      json={'allergies': 'Maní'}).status_code == 200
    r = client.post(f'/api/students/{sid}/family', headers=h,
                    json={'first_name': 'Rosa', 'last_name': 'Hist', 'relationship': 'Madre'})
    assert r.status_code == 201, _err(r)
    evs = [e for e in _historial(client, h, sid)['eventos'] if e['evento'] == 'ficha_editada']
    assert len(evs) >= 2


def test_firma_no_guarda_binario(client, headers, make_student):
    from conftest import TINY_PNG_DATA_URL, TINY_PNG_B64
    sid = make_student()
    h = headers['admin']
    r = client.post(f'/api/students/{sid}/authorizations', headers=h,
                    json={'title': 'Uso de imagen', 'status': 'autorizado',
                          'signature_image': TINY_PNG_DATA_URL})
    assert r.status_code == 201, _err(r)
    raw = json.dumps(_historial(client, h, sid))
    assert TINY_PNG_B64 not in raw


def test_log_student_event_helper(app, ids):
    from models import log_student_event, StudentHistory
    sid = create_user(app)
    with app.app_context():
        log_student_event(sid, 'egreso', 'Egresó del colegio', ids['school'], year=Y,
                          details={'k': 'v'}, user_id=None)
        db.session.commit()
        h = StudentHistory.query.filter_by(student_id=sid, event='egreso').one()
        assert h.description == 'Egresó del colegio' and h.year == Y and h.user_id is None


def test_profesor_puede_leer(client, headers, recorrido):
    assert client.get(f'/api/matricula/alumnos/{recorrido}/historial',
                      headers=headers['profesor']).status_code == 200


@pytest.mark.parametrize('role', ['apoderado', 'alumno'])
def test_apoderado_alumno_403(client, headers, ids, role):
    r = client.get(f"/api/matricula/alumnos/{ids['pedro']}/historial", headers=headers[role])
    assert r.status_code == 403


def test_otro_colegio_404(client, headers, other_school_student):
    r = client.get(f'/api/matricula/alumnos/{other_school_student}/historial',
                   headers=headers['admin'])
    assert r.status_code == 404
