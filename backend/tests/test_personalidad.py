"""Informe de personalidad: pauta, respuestas por semestre, permisos y PDF."""
import re

import pytest

from conftest import create_user

pytest.importorskip('reportlab')


def _curso(app, ids):
    from models import Course
    with app.app_context():
        c = Course.query.get(ids['course'])
        return {'id': c.id, 'year': c.year}


@pytest.fixture(scope='module')
def alumno(app, ids):
    from models import db, Enrollment, Course
    sid = create_user(app, first_name='Emma Luz', last_name='Ávalos Pérez')
    with app.app_context():
        c = Course.query.get(ids['course'])
        db.session.add(Enrollment(student_id=sid, course_id=c.id, year=c.year, is_active=True))
        db.session.commit()
    return sid


def test_pauta_base_se_carga_con_23_criterios(client, headers):
    r = client.get('/api/personalidad/pauta', headers=headers['admin'])
    assert r.status_code == 200
    areas = r.get_json()['areas']
    assert [a['nombre'] for a in areas][0] == 'Relaciones Interpersonales'
    crit = [c for a in areas for c in a['criterios']]
    assert len(crit) == 23
    assert [c['numero'] for c in crit] == list(range(1, 24))


def test_consumidores_no_entran(client, headers):
    for rol in ('apoderado', 'alumno'):
        assert client.get('/api/personalidad/pauta', headers=headers[rol]).status_code == 403


def test_profesor_no_cambia_la_pauta(client, headers):
    r = client.post('/api/personalidad/criterios', headers=headers['profesor'],
                    json={'area_id': 1, 'texto': 'x'})
    assert r.status_code == 403


def test_agregar_desactivar_y_mover_criterios(client, headers):
    h = headers['admin']
    areas = client.get('/api/personalidad/pauta', headers=h).get_json()['areas']
    area = areas[0]
    r = client.post('/api/personalidad/criterios', headers=h,
                    json={'area_id': area['id'], 'texto': 'Colabora con sus compañeros.'})
    assert r.status_code == 201
    nuevo = r.get_json()['areas'][0]['criterios'][-1]
    assert nuevo['texto'] == 'Colabora con sus compañeros.'

    # Moverlo hacia arriba lo deja penúltimo
    r = client.post(f"/api/personalidad/criterios/{nuevo['id']}/mover", headers=h, json={'dir': -1})
    assert r.get_json()['areas'][0]['criterios'][-2]['id'] == nuevo['id']

    # Desactivar el primero: deja de salir en la pauta activa y la numeración se corre
    primero = area['criterios'][0]
    client.put(f"/api/personalidad/criterios/{primero['id']}", headers=h, json={'is_active': False})
    activos = client.get('/api/personalidad/pauta', headers=h).get_json()['areas']
    ids_activos = [c['id'] for a in activos for c in a['criterios']]
    assert primero['id'] not in ids_activos
    assert len(ids_activos) == 23
    todos = client.get('/api/personalidad/pauta?todos=1', headers=h).get_json()['areas']
    assert any(c['id'] == primero['id'] and c['numero'] is None
               for a in todos for c in a['criterios'])

    # Se deja como estaba para los otros tests
    client.put(f"/api/personalidad/criterios/{primero['id']}", headers=h, json={'is_active': True})
    client.put(f"/api/personalidad/criterios/{nuevo['id']}", headers=h, json={'is_active': False})


def test_llenar_semestre_y_ver_avance(client, headers, app, ids, alumno):
    h = headers['admin']
    c = _curso(app, ids)
    r = client.get(f"/api/personalidad/cursos/{c['id']}/alumnos/{alumno}", headers=h)
    assert r.status_code == 200
    d = r.get_json()
    crit = [x['id'] for a in d['areas'] for x in a['criterios']]
    assert d['respuestas'] == {'1': {}, '2': {}}

    respuestas = {str(cid): 'S' for cid in crit}
    respuestas[str(crit[0])] = 'G'
    r = client.put(f"/api/personalidad/cursos/{c['id']}/alumnos/{alumno}", headers=h,
                   json={'semestre': 1, 'respuestas': respuestas, 'observacion': 'Muy buen semestre.'})
    assert r.status_code == 200, r.get_data(as_text=True)
    d = r.get_json()
    assert d['respuestas']['1'][str(crit[0])] == 'G'
    assert d['observaciones']['1'] == 'Muy buen semestre.'

    det = client.get(f"/api/personalidad/cursos/{c['id']}", headers=h).get_json()
    fila = next(a for a in det['alumnos'] if a['id'] == alumno)
    assert fila['avance'] == {'1': 23, '2': 0}

    lista = client.get(f"/api/personalidad/cursos?year={c['year']}", headers=h).get_json()
    assert any(x['id'] == c['id'] and x['completos']['1'] >= 1 for x in lista['cursos'])


def test_valor_invalido_y_semestre_invalido(client, headers, app, ids, alumno):
    h = headers['admin']
    c = _curso(app, ids)
    url = f"/api/personalidad/cursos/{c['id']}/alumnos/{alumno}"
    assert client.put(url, headers=h, json={'semestre': 3, 'respuestas': {}}).status_code == 400
    crit = client.get(url, headers=h).get_json()['areas'][0]['criterios'][0]['id']
    r = client.put(url, headers=h, json={'semestre': 2, 'respuestas': {str(crit): 'X'}})
    assert r.status_code == 400


def test_profesor_ajeno_no_ve_el_curso(client, headers, app, ids):
    from models import db, Course
    with app.app_context():
        otro = Course(school_id=ids['school'], name='Curso ajeno', level='9', letter='Z',
                      year=2026, is_active=True)
        db.session.add(otro)
        db.session.commit()
        cid = otro.id
    r = client.get(f'/api/personalidad/cursos/{cid}', headers=headers['profesor'])
    assert r.status_code == 403


def test_pdf_alumno_y_curso(client, headers, app, ids, alumno):
    h = headers['admin']
    c = _curso(app, ids)
    r = client.get(f"/api/personalidad/cursos/{c['id']}/alumnos/{alumno}/informe.pdf", headers=h)
    assert r.status_code == 200, r.get_data(as_text=True)
    assert r.data.startswith(b'%PDF')
    assert 'informe_personalidad_' in r.headers['Content-Disposition']
    r = client.get(f"/api/personalidad/cursos/{c['id']}/informe.pdf", headers=h)
    assert r.status_code == 200
    assert len(re.findall(rb'/Type\s*/Page(?![s\w])', r.data)) >= 2


def test_importar_pdf_ida_y_vuelta(client, headers, app, ids, alumno):
    """Un PDF generado por la plataforma se vuelve a leer igual: vista previa y luego aplicar."""
    import io
    h = headers['admin']
    c = _curso(app, ids)
    url = f"/api/personalidad/cursos/{c['id']}/alumnos/{alumno}"
    crit = [x['id'] for a in client.get(url, headers=h).get_json()['areas'] for x in a['criterios']]
    client.put(url, headers=h, json={'semestre': 2, 'respuestas': {str(i): 'AV' for i in crit},
                                     'observacion': 'Avanza bien.'})
    pdf = client.get(url + '/informe.pdf', headers=h).data

    # Se borra el 2do semestre y se recupera desde el PDF
    client.put(url, headers=h, json={'semestre': 2, 'respuestas': {str(i): '' for i in crit},
                                     'observacion': ''})

    def subir(ruta, **form):
        data = {'archivos': (io.BytesIO(pdf), 'informe.pdf'), **form}
        return client.post(ruta, headers=h, data=data, content_type='multipart/form-data')

    r = subir('/api/personalidad/importar/previsualizar')
    assert r.status_code == 200, r.get_data(as_text=True)
    v = r.get_json()
    fila = v['archivos'][0]['alumnos'][0]
    assert fila['estado'] == 'ok' and fila['student_id'] == alumno
    assert fila['semestres'] == {'1': 23, '2': 23}
    assert v['criterios_sin_match'] == []
    # La vista previa no toca la base
    assert client.get(url, headers=h).get_json()['respuestas']['2'] == {}

    r = subir('/api/personalidad/importar/aplicar')
    assert r.status_code == 200, r.get_data(as_text=True)
    assert r.get_json()['resultado']['creadas'] == 23
    d = client.get(url, headers=h).get_json()
    assert set(d['respuestas']['2'].values()) == {'AV'}
    assert d['observaciones']['2'] == 'Avanza bien.'


def test_importar_solo_admin_y_solo_pdf(client, headers):
    import io
    r = client.post('/api/personalidad/importar/previsualizar', headers=headers['profesor'],
                    data={'archivos': (io.BytesIO(b'x'), 'a.pdf')}, content_type='multipart/form-data')
    assert r.status_code == 403
    r = client.post('/api/personalidad/importar/previsualizar', headers=headers['admin'],
                    data={'archivos': (io.BytesIO(b'x'), 'a.txt')}, content_type='multipart/form-data')
    assert r.status_code == 400
