"""Resumen de notas por curso y alumno (criterio Notas del mapa del colegio)."""
from conftest import create_user


def test_nota_a_puntaje_deja_el_4_en_50():
    from routes.grades import nota_a_puntaje
    assert nota_a_puntaje(None) is None
    assert nota_a_puntaje(1.0) == 0
    assert nota_a_puntaje(4.0) == 50
    assert nota_a_puntaje(5.5) == 75
    assert nota_a_puntaje(7.0) == 100
    assert nota_a_puntaje(2.5) == 25


def test_promedia_por_asignatura_y_por_curso(app, client, headers):
    from models import db, Course, CourseSubject, Subject, Enrollment, Grade, Period
    sid = create_user(app, first_name='Tomasa', last_name='Notas')
    with app.app_context():
        cs = CourseSubject.query.first()
        curso = Course.query.get(cs.course_id)
        otra = Subject(school_id=curso.school_id, name='Asignatura extra de prueba')
        db.session.add(otra)
        db.session.flush()
        cs2 = CourseSubject(course_id=curso.id, subject_id=otra.id)
        db.session.add(cs2)
        db.session.add(Enrollment(student_id=sid, course_id=curso.id, year=curso.year, is_active=True))
        db.session.flush()
        per = Period.query.filter_by(school_id=curso.school_id).first()
        # Asignatura 1: 6,0 y 7,0 (promedio 6,5); asignatura 2: 4,5 → alumno 5,5
        for csid, v in ((cs.id, 6.0), (cs.id, 7.0), (cs2.id, 4.5)):
            db.session.add(Grade(student_id=sid, course_subject_id=csid, period_id=per.id,
                                 value=v, grade_type='nota'))
        db.session.commit()
        curso_id, year = curso.id, curso.year

    r = client.get(f'/api/grades/resumen?year={year}', headers=headers['admin'])
    assert r.status_code == 200
    curso = next(c for c in r.get_json()['cursos'] if c['id'] == curso_id)
    alumno = next(a for a in curso['alumnos'] if a['id'] == sid)
    assert alumno['nota'] == 5.5
    assert alumno['puntaje'] == 75
    assert curso['evaluados'] >= 1
    assert curso['nota'] is not None


def test_consumidores_no_ven_el_resumen(client, headers):
    for rol in ('apoderado', 'alumno'):
        assert client.get('/api/grades/resumen', headers=headers[rol]).status_code == 403
