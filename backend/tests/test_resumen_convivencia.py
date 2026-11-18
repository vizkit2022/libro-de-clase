"""Resumen de convivencia por curso y alumno (criterio Convivencia del mapa)."""
from datetime import date

from conftest import create_user


def test_peso_del_caso_segun_tipificacion_y_estado():
    from models import ConvivenciaCase
    from routes.convivencia import peso_caso
    assert peso_caso(ConvivenciaCase(typification='Falta Leve', status='abierto')) == 10
    assert peso_caso(ConvivenciaCase(typification='Falta Gravísima', status='abierto')) == 40
    # Cerrado resta la mitad; sin tipificación usa la criticidad
    assert peso_caso(ConvivenciaCase(typification='Falta Grave', status='cerrado')) == 12.5
    assert peso_caso(ConvivenciaCase(criticality='alta', status='abierto')) == 35


def test_casos_y_anotaciones_mueven_el_puntaje(app, client, headers):
    from models import db, Course, Enrollment, ConvivenciaCase, Annotation, School
    sid = create_user(app, first_name='Bruno', last_name='Convivencia')
    tranquilo = create_user(app, first_name='Paz', last_name='Tranquila')
    with app.app_context():
        curso = Course.query.filter(Course.year.isnot(None)).first()
        year = curso.year
        for st in (sid, tranquilo):
            db.session.add(Enrollment(student_id=st, course_id=curso.id, year=year, is_active=True))
        school = School.query.get(curso.school_id)
        db.session.add(ConvivenciaCase(school_id=school.id, year=year, student_id=sid,
                                       course_id=curso.id, title='Pelea en recreo',
                                       date=date(year, 5, 2), typification='Falta Grave',
                                       status='abierto'))
        db.session.add(Annotation(student_id=sid, course_id=curso.id, annotation_type='negativa',
                                  title='Atraso', description='x', date=date(year, 5, 3)))
        db.session.add(Annotation(student_id=tranquilo, course_id=curso.id,
                                  annotation_type='positiva', title='Ayuda', description='x',
                                  date=date(year, 5, 3)))
        db.session.commit()
        curso_id = curso.id

    r = client.get(f'/api/convivencia/resumen?year={year}', headers=headers['admin'])
    assert r.status_code == 200
    c = next(c for c in r.get_json()['cursos'] if c['id'] == curso_id)
    por_id = {a['id']: a for a in c['alumnos']}
    assert por_id[sid]['puntaje'] == 100 - 25 - 8
    assert por_id[sid]['casos'] == 1
    caso = por_id[sid]['detalle_casos'][0]
    assert caso['titulo'] == 'Pelea en recreo' and caso['resta'] == 25 and not caso['cerrado']
    assert por_id[sid]['anotaciones'] == {'negativas': 1, 'positivas': 0}
    assert por_id[tranquilo]['anotaciones']['positivas'] == 1
    assert por_id[tranquilo]['puntaje'] == 100      # no pasa de 100
    assert c['puntaje'] is not None


def test_sin_registros_queda_sin_datos(client, headers):
    r = client.get('/api/convivencia/resumen?year=1999', headers=headers['admin'])
    assert r.status_code == 200
    assert all(c['puntaje'] is None for c in r.get_json()['cursos'])


def test_consumidores_no_ven_el_resumen(client, headers):
    for rol in ('apoderado', 'alumno'):
        assert client.get('/api/convivencia/resumen', headers=headers[rol]).status_code == 403
