"""Llena el colegio demo "Colegio San Patricio" con datos inventados.

Agrega cursos de Pre-kínder a II Medio, alumnos, notas de los dos
semestres, informe de personalidad, casos de convivencia y anotaciones,
para que el panel (mapa del colegio en 3D) y los módulos se vean con vida.
Cada curso tiene un "perfil" distinto, así el mapa muestra verdes,
amarillos, naranjos y rojos.

No importa app.py (que corre migraciones y seeds al cargar): solo usa los
modelos. Los alumnos y docentes nuevos no pueden iniciar sesión.
Si los cursos demo ya existen no hace nada.

    cd backend
    python3 scripts/demo_san_patricio.py                       # vista previa
    DATABASE_URL=postgresql://... python3 scripts/demo_san_patricio.py --aplicar
"""
import argparse
import os
import random
import sys
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

NOMBRE_COLEGIO = 'Colegio San Patricio'
DOMINIO = '@ejemplo.invalid'

# (nombre, nivel, letra, calidad 0-1, alumnos). La calidad mueve notas,
# personalidad y convivencia del curso; el 5° Básico A ya existe.
CURSOS = [
    ('Pre-kínder', 'Pre-kínder', None, 0.92, 18),
    ('Kínder', 'Kínder', None, 0.86, 20),
    ('1° Básico A', '1° Básico', 'A', 0.74, 24),
    ('2° Básico A', '2° Básico', 'A', 0.96, 25),
    ('3° Básico A', '3° Básico', 'A', 0.52, 26),
    ('4° Básico A', '4° Básico', 'A', 0.68, 27),
    ('5° Básico A', '5° Básico', 'A', 0.80, 22),
    ('6° Básico A', '6° Básico', 'A', 0.33, 28),
    ('7° Básico A', '7° Básico', 'A', 0.60, 27),
    ('8° Básico A', '8° Básico', 'A', 0.84, 26),
    ('I Medio A', 'I Medio', 'A', 0.22, 29),
    ('II Medio A', 'II Medio', 'A', 0.70, 28),
]

DOCENTES = [('Carolina', 'Vidal Araya'), ('Rodrigo', 'Pizarro Leiva'), ('Paula', 'Sepúlveda Godoy'),
            ('Andrés', 'Tapia Olivares'), ('Gabriela', 'Muñoz Ibarra'), ('Felipe', 'Cáceres Rojas'),
            ('Daniela', 'Henríquez Soto'), ('Ignacio', 'Bustos Lagos'), ('Javiera', 'Poblete Fuentes'),
            ('Cristián', 'Navarrete Mena')]

NOMBRES_F = ('Antonia', 'Florencia', 'Isidora', 'Josefa', 'Trinidad', 'Emilia', 'Martina', 'Agustina',
             'Sofía', 'Catalina', 'Maite', 'Amanda', 'Renata', 'Julieta', 'Fernanda', 'Constanza')
NOMBRES_M = ('Benjamín', 'Vicente', 'Tomás', 'Joaquín', 'Maximiliano', 'Lucas', 'Gaspar', 'Clemente',
             'Agustín', 'Matías', 'Cristóbal', 'Felipe', 'Diego', 'Bastián', 'Martín', 'Alonso')
APELLIDOS = ('Araya', 'Bustos', 'Cáceres', 'Donoso', 'Escobar', 'Figueroa', 'Godoy', 'Henríquez',
             'Ibarra', 'Jofré', 'Leiva', 'Maturana', 'Navarrete', 'Olivares', 'Poblete', 'Quiroz',
             'Rojas', 'Sepúlveda', 'Torres', 'Valenzuela', 'Muñoz', 'Contreras', 'Silva', 'Fuentes')

CASOS = [
    ('Falta Leve', 'baja', 'Uso de celular en clases', 'Entrevista Estudiante'),
    ('Falta Leve', 'baja', 'Atrasos reiterados', 'Entrevista Apoderado'),
    ('Falta Grave', 'media', 'Conflicto entre compañeros en el recreo', 'Mediación'),
    ('Falta Grave', 'media', 'Lenguaje ofensivo hacia un compañero', 'Entrevista Estudiante'),
    ('Falta Grave', 'alta', 'Daño a material del colegio', 'Entrevista Apoderado'),
    ('Falta Gravísima', 'alta', 'Agresión física en el patio', 'Derivación a Dupla Psicosocial'),
]
ANOTACIONES_NEG = [('Atraso', 'Llegó atrasado a la primera hora.'),
                   ('No trae materiales', 'No trajo los materiales solicitados para la clase.'),
                   ('Interrumpe la clase', 'Conversa e interrumpe reiteradamente la clase.'),
                   ('Tarea no presentada', 'No presentó la tarea en la fecha indicada.')]
ANOTACIONES_POS = [('Participación destacada', 'Participó activamente y ayudó a sus compañeros.'),
                   ('Responsabilidad', 'Cumplió con todas sus tareas de la semana.'),
                   ('Compañerismo', 'Apoyó a un compañero que lo necesitaba.'),
                   ('Liderazgo positivo', 'Organizó a su grupo de trabajo con respeto.')]


def crear_app():
    from flask import Flask
    from models import db
    app = Flask(__name__)
    url = os.environ.get('DATABASE_URL')
    if url:
        url = url.replace('postgres://', 'postgresql://', 1)
    else:
        url = 'sqlite:///' + os.path.join(os.path.expanduser('~'), '.colegio_app', 'colegio.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = url
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)
    return app


def valor_personalidad(azar, nivel):
    """S / G / AV / N según el nivel 0-1 del alumno (más alto, más S)."""
    r = azar.random()
    s = 0.02 + nivel * 0.62
    g = s + 0.12 + (1 - abs(nivel - 0.55)) * 0.25
    av = g + 0.10 + (1 - nivel) * 0.22
    return 'S' if r < s else 'G' if r < g else 'AV' if r < av else 'N'


def sembrar(school, year, azar):
    from models import (db, User, Course, Enrollment, Subject, CourseSubject, Period, Grade,
                        Annotation, ConvivenciaCase, AcademicYear, PersonalidadRespuesta,
                        ensure_personalidad_pauta, PersonalidadCriterio, CLAVE_INUTILIZABLE)
    sid = school.id
    resumen = {}

    if not AcademicYear.query.filter_by(school_id=sid, year=year).first():
        db.session.add(AcademicYear(school_id=sid, year=year, status='abierto'))

    periodos = {}
    for n, (ini, fin) in {1: (date(year, 3, 1), date(year, 7, 15)),
                          2: (date(year, 8, 1), date(year, 12, 15))}.items():
        p = Period.query.filter_by(school_id=sid, year=year, number=n).first()
        if p is None:
            p = Period(school_id=sid, name=f'{n}° Semestre {year}', period_type='semestral',
                       year=year, number=n, start_date=ini, end_date=fin, is_active=(n == 2))
            db.session.add(p)
        periodos[n] = p

    materias = Subject.query.filter_by(school_id=sid, is_active=True).order_by(Subject.id).all()
    if not materias:
        raise SystemExit('El colegio no tiene asignaturas')

    docentes = User.query.filter_by(school_id=sid, role='profesor').order_by(User.id).all()
    nuevos_docentes = []
    for i, (nombre, apellido) in enumerate(DOCENTES):
        u = User(school_id=sid, email=f'docente.demo.{sid}.{i}{DOMINIO}', first_name=nombre,
                 last_name=apellido, role='profesor', is_active=True, password_hash=CLAVE_INUTILIZABLE)
        nuevos_docentes.append(u)
    db.session.add_all(nuevos_docentes)
    db.session.flush()
    docentes = docentes + nuevos_docentes
    jefe_de = iter(nuevos_docentes + docentes)

    ensure_personalidad_pauta(sid)
    db.session.flush()
    criterios = PersonalidadCriterio.query.filter_by(school_id=sid, is_active=True).all()

    hoy = date.today()
    ahora = datetime.utcnow()
    filas_notas, filas_pers = [], []
    correlativo = User.query.filter(User.email.like(f'alumno.demo.{sid}.%')).count()
    n_caso = (db.session.query(db.func.max(ConvivenciaCase.case_number))
              .filter_by(school_id=sid, year=year).scalar() or 0)

    for nombre, nivel, letra, calidad, total in CURSOS:
        curso = Course.query.filter_by(school_id=sid, name=nombre, year=year).first()
        if curso is None:
            curso = Course(school_id=sid, name=nombre, level=nivel, letter=letra, year=year,
                           is_active=True, head_teacher_id=next(jefe_de).id)
            db.session.add(curso)
            db.session.flush()
        cs_curso = CourseSubject.query.filter_by(course_id=curso.id).all()
        if not cs_curso:
            cs_curso = [CourseSubject(course_id=curso.id, subject_id=m.id,
                                      teacher_id=docentes[(j + len(resumen)) % len(docentes)].id,
                                      hours_per_week=4 if j < 2 else 2)
                        for j, m in enumerate(materias)]
            db.session.add_all(cs_curso)
            db.session.flush()

        ya = [e.student for e in Enrollment.query.filter_by(course_id=curso.id).all() if e.student]
        alumnos = list(ya)
        while len(alumnos) < total:
            correlativo += 1
            nombres = NOMBRES_F if correlativo % 2 else NOMBRES_M
            u = User(school_id=sid, email=f'alumno.demo.{sid}.{correlativo}{DOMINIO}',
                     first_name=azar.choice(nombres),
                     last_name=f'{azar.choice(APELLIDOS)} {azar.choice(APELLIDOS)}',
                     role='alumno', is_active=True, password_hash=CLAVE_INUTILIZABLE)
            db.session.add(u)
            db.session.flush()
            db.session.add(Enrollment(student_id=u.id, course_id=curso.id, year=year, status='activo',
                                      is_active=True, enrollment_date=date(year, 3, 1)))
            alumnos.append(u)

        con_notas = {g.student_id for g in Grade.query.join(CourseSubject)
                     .filter(CourseSubject.course_id == curso.id).all()}
        malos = []
        for a in alumnos:
            # Nivel del alumno: la calidad del curso más una variación propia
            nivel_al = max(0.0, min(1.0, calidad + azar.gauss(0, 0.16)))
            if nivel_al < 0.4:
                malos.append(a)
            if a.id not in con_notas:
                base = 3.2 + nivel_al * 3.6
                for cs in cs_curso:
                    for sem, cuantas in ((1, 3), (2, 2)):
                        for n in range(cuantas):
                            filas_notas.append({
                                'student_id': a.id, 'course_subject_id': cs.id,
                                'period_id': periodos[sem].id,
                                'value': round(min(7.0, max(1.5, base + azar.uniform(-0.8, 0.8))), 1),
                                'description': f'Evaluación {n + 1}', 'grade_type': 'nota',
                                'created_by': cs.teacher_id, 'created_at': ahora,
                                'is_published': True, 'published_at': ahora})
            for sem in (1, 2):
                nivel_sem = max(0.0, min(1.0, nivel_al + (0.04 if sem == 2 else 0) + azar.gauss(0, 0.05)))
                for c in criterios:
                    filas_pers.append({'school_id': sid, 'student_id': a.id, 'criterio_id': c.id,
                                       'year': year, 'semestre': sem,
                                       'valor': valor_personalidad(azar, nivel_sem),
                                       'updated_at': ahora})

        # Convivencia: más casos y anotaciones negativas cuanto más baja la calidad
        n_casos = round((1 - calidad) * 7 + azar.uniform(-0.5, 0.5))
        for _ in range(max(0, n_casos)):
            tip, crit, titulo, proc = azar.choice(CASOS if calidad < 0.5 else CASOS[:4])
            alumno = azar.choice(malos or alumnos)
            cerrado = azar.random() < 0.45
            n_caso += 1
            db.session.add(ConvivenciaCase(
                school_id=sid, case_number=n_caso, year=year, student_id=alumno.id, course_id=curso.id,
                title=titulo, date=hoy - timedelta(days=azar.randint(3, 200)), procedure=proc,
                typification=tip, criticality=crit, motive=titulo + '.',
                status='cerrado' if cerrado else 'abierto',
                estado='cerrado' if cerrado else azar.choice(['recepcion', 'entrevista', 'seguimiento'])))
        for _ in range(round((1 - calidad) * 30)):
            t, d = azar.choice(ANOTACIONES_NEG)
            db.session.add(Annotation(student_id=azar.choice(malos or alumnos).id, course_id=curso.id,
                                      annotation_type='negativa', title=t, description=d,
                                      date=hoy - timedelta(days=azar.randint(1, 200)),
                                      created_by=curso.head_teacher_id))
        for _ in range(round(calidad * 7)):
            t, d = azar.choice(ANOTACIONES_POS)
            db.session.add(Annotation(student_id=azar.choice(alumnos).id, course_id=curso.id,
                                      annotation_type='positiva', title=t, description=d,
                                      date=hoy - timedelta(days=azar.randint(1, 200)),
                                      created_by=curso.head_teacher_id))
        resumen[nombre] = (len(alumnos), max(0, n_casos))

    # Personalidad: no pisar respuestas que ya existan
    existentes = {(r.student_id, r.criterio_id, r.semestre) for r in
                  PersonalidadRespuesta.query.filter_by(school_id=sid, year=year).all()}
    filas_pers = [f for f in filas_pers
                  if (f['student_id'], f['criterio_id'], f['semestre']) not in existentes]
    if filas_notas:
        db.session.execute(Grade.__table__.insert(), filas_notas)
    if filas_pers:
        db.session.execute(PersonalidadRespuesta.__table__.insert(), filas_pers)
    return resumen, len(filas_notas), len(filas_pers), len(nuevos_docentes)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--year', type=int, default=date.today().year)
    ap.add_argument('--aplicar', action='store_true', help='graba (sin esto solo es vista previa)')
    args = ap.parse_args()

    app = crear_app()
    from models import db, School, Course
    with app.app_context():
        school = School.query.filter_by(name=NOMBRE_COLEGIO).first()
        if school is None:
            raise SystemExit(f'No existe "{NOMBRE_COLEGIO}"')
        if Course.query.filter_by(school_id=school.id, name='Pre-kínder', year=args.year).first():
            print('Los cursos demo ya están cargados. No hago nada.')
            return
        azar = random.Random(f'san-patricio-{args.year}')
        resumen, notas, pers, docentes = sembrar(school, args.year, azar)
        print(f'{NOMBRE_COLEGIO} (id {school.id}), año {args.year}')
        for nombre, (alumnos, casos) in resumen.items():
            print(f'  {nombre:<14} {alumnos:>3} alumnos  {casos} casos')
        print(f'  docentes nuevos: {docentes} · notas: {notas} · respuestas de personalidad: {pers}')
        if args.aplicar:
            db.session.commit()
            print('Grabado.')
        else:
            db.session.rollback()
            print('Vista previa: no se grabó nada (usa --aplicar).')


if __name__ == '__main__':
    main()
