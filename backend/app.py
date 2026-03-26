import os
from flask import Flask, send_from_directory
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from models import db, School, User, Period, Subject, Course, Enrollment, CourseSubject, Grade, Annotation, Subscription
from datetime import datetime, date

# Path to the built React frontend (relative to this file)
FRONTEND_BUILD = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'build')


def create_app():
    app = Flask(
        __name__,
        static_folder=FRONTEND_BUILD,
        static_url_path='/'
    )

    # ── Database ──────────────────────────────────────────────────────────────
    database_url = os.environ.get('DATABASE_URL')
    if database_url:
        # Railway Postgres URLs still use "postgres://" in some cases; SQLAlchemy needs "postgresql://"
        if database_url.startswith('postgres://'):
            database_url = database_url.replace('postgres://', 'postgresql://', 1)
        app.config['SQLALCHEMY_DATABASE_URI'] = database_url
    else:
        # Local SQLite fallback
        db_dir = os.path.join(os.path.expanduser('~'), '.colegio_app')
        os.makedirs(db_dir, exist_ok=True)
        app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{os.path.join(db_dir, "colegio.db")}'

    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    # ── Security ──────────────────────────────────────────────────────────────
    app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'colegio-secret-key-2024-change-in-production')
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = False

    # ── CORS ──────────────────────────────────────────────────────────────────
    allowed_origins = os.environ.get('CORS_ORIGINS', 'http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000').split(',')
    db.init_app(app)
    JWTManager(app)
    CORS(app, origins=allowed_origins + ['*'])

    # ── Blueprints ────────────────────────────────────────────────────────────
    from routes.auth import auth_bp
    from routes.users import users_bp
    from routes.schools import schools_bp
    from routes.periods import periods_bp
    from routes.courses import courses_bp
    from routes.subjects import subjects_bp
    from routes.grades import grades_bp
    from routes.annotations import annotations_bp
    from routes.reports import reports_bp
    from routes.ocr import ocr_bp
    from routes.super_admin import super_admin_bp
    from routes.payments import payments_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(users_bp, url_prefix='/api/users')
    app.register_blueprint(schools_bp, url_prefix='/api/schools')
    app.register_blueprint(periods_bp, url_prefix='/api/periods')
    app.register_blueprint(courses_bp, url_prefix='/api/courses')
    app.register_blueprint(subjects_bp, url_prefix='/api/subjects')
    app.register_blueprint(grades_bp, url_prefix='/api/grades')
    app.register_blueprint(annotations_bp, url_prefix='/api/annotations')
    app.register_blueprint(reports_bp, url_prefix='/api/reports')
    app.register_blueprint(ocr_bp, url_prefix='/api/ocr')
    app.register_blueprint(super_admin_bp, url_prefix='/api/super-admin')
    app.register_blueprint(payments_bp, url_prefix='/api/payments')

    # ── Serve React (SPA catch-all) ───────────────────────────────────────────
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_react(path):
        """Sirve la app React para cualquier ruta que no sea /api/..."""
        build_index = os.path.join(FRONTEND_BUILD, 'index.html')
        if path and path.startswith('api/'):
            # No redirigir rutas de la API (retornar 404 si no encontró blueprint)
            from flask import abort
            abort(404)
        # Si el archivo existe en build/, servir como estático
        target = os.path.join(FRONTEND_BUILD, path)
        if path and os.path.exists(target) and os.path.isfile(target):
            return send_from_directory(FRONTEND_BUILD, path)
        # Fallback: siempre entregar index.html (React Router)
        if os.path.exists(build_index):
            return send_from_directory(FRONTEND_BUILD, 'index.html')
        return {'error': 'Frontend no compilado. Ejecuta: cd frontend && npm run build'}, 503

    with app.app_context():
        db.create_all()
        run_migrations()
        seed_data()

    return app


def run_migrations():
    """
    Aplica migraciones manuales para bases de datos existentes.
    db.create_all() solo crea tablas nuevas, no modifica columnas existentes.
    """
    is_postgres = 'postgresql' in (db.engine.url.drivername or '')
    is_sqlite   = 'sqlite'     in (db.engine.url.drivername or '')

    with db.engine.connect() as conn:
        from sqlalchemy import text

        if is_postgres:
            # 1. Hacer school_id nullable en users (para rol super_admin)
            try:
                conn.execute(text(
                    "ALTER TABLE users ALTER COLUMN school_id DROP NOT NULL"
                ))
                conn.commit()
                print("✅ Migración: users.school_id ahora es nullable")
            except Exception:
                conn.rollback()   # ya era nullable → ignorar

            # 2. Agregar columnas de plan a schools si no existen
            for col, definition in [
                ('plan',                    "VARCHAR(20) DEFAULT 'free'"),
                ('plan_status',             "VARCHAR(20) DEFAULT 'active'"),
                ('subscription_expires_at', 'TIMESTAMP'),
            ]:
                try:
                    conn.execute(text(
                        f"ALTER TABLE schools ADD COLUMN {col} {definition}"
                    ))
                    conn.commit()
                    print(f"✅ Migración: columna schools.{col} agregada")
                except Exception:
                    conn.rollback()   # ya existía → ignorar

        elif is_sqlite:
            # SQLite tiene ALTER TABLE limitado; solo agregar columnas
            for col, definition in [
                ('plan',                    "VARCHAR(20) DEFAULT 'free'"),
                ('plan_status',             "VARCHAR(20) DEFAULT 'active'"),
                ('subscription_expires_at', 'DATETIME'),
            ]:
                try:
                    conn.execute(text(
                        f"ALTER TABLE schools ADD COLUMN {col} {definition}"
                    ))
                    conn.commit()
                except Exception:
                    conn.rollback()   # ya existía


def seed_data():
    """Crea datos de ejemplo si la BD está vacía"""
    if School.query.count() > 0:
        # Asegurar que exista el super_admin aunque haya datos
        if not User.query.filter_by(role='super_admin').first():
            sa = User(school_id=None, email='superadmin@sistema.cl',
                      first_name='Super', last_name='Administrador',
                      role='super_admin')
            sa.set_password('super123')
            db.session.add(sa)
            db.session.commit()
            print("✅ Super Admin creado: superadmin@sistema.cl / super123")
        return

    print("🌱 Creando datos de ejemplo...")

    # ── Super Admin (sin colegio) ───────────────────────────────────────────
    super_admin = User(school_id=None, email='superadmin@sistema.cl',
                       first_name='Super', last_name='Administrador',
                       role='super_admin')
    super_admin.set_password('super123')
    db.session.add(super_admin)

    # Colegio demo
    school = School(
        name='Colegio San Patricio',
        rut='12.345.678-9',
        address='Av. Principal 1234, Santiago',
        phone='+56 2 2345 6789',
        email='contacto@sanpatricio.cl',
        rector='Carmen González Muñoz',
        primary_color='#2563EB',
        secondary_color='#1E40AF',
        accent_color='#3B82F6'
    )
    db.session.add(school)
    db.session.flush()

    # Admin
    admin = User(school_id=school.id, email='admin@sanpatricio.cl',
                 first_name='Carlos', last_name='Administrador', rut='11.111.111-1',
                 role='admin', phone='+56 9 1111 1111')
    admin.set_password('admin123')
    db.session.add(admin)

    # Directivo
    directivo = User(school_id=school.id, email='directivo@sanpatricio.cl',
                     first_name='Carmen', last_name='González', rut='22.222.222-2',
                     role='directivo', phone='+56 9 2222 2222')
    directivo.set_password('dir123')
    db.session.add(directivo)

    # Profesores
    prof1 = User(school_id=school.id, email='mvaldes@sanpatricio.cl',
                 first_name='María', last_name='Valdés Rojas', rut='33.333.333-3',
                 role='profesor', phone='+56 9 3333 3333')
    prof1.set_password('prof123')
    db.session.add(prof1)

    prof2 = User(school_id=school.id, email='jmorales@sanpatricio.cl',
                 first_name='Jorge', last_name='Morales Pérez', rut='44.444.444-4',
                 role='profesor', phone='+56 9 4444 4444')
    prof2.set_password('prof123')
    db.session.add(prof2)

    db.session.flush()

    # Alumnos
    alumnos_data = [
        ('Pedro', 'Alvarado Soto', '55.555.555-5', 'pedro.alvarado@gmail.com'),
        ('Valentina', 'Bravo Castro', '66.666.666-6', 'vale.bravo@gmail.com'),
        ('Diego', 'Contreras Díaz', '77.777.777-7', 'diego.c@gmail.com'),
        ('Camila', 'Espinoza Fuentes', '88.888.888-8', 'cami.esp@gmail.com'),
        ('Matías', 'González Herrera', '99.999.999-9', 'matias.g@gmail.com'),
        ('Sofía', 'Ibáñez Jara', '10.101.010-1', 'sofia.ij@gmail.com'),
    ]
    alumnos = []
    for fn, ln, rut, email in alumnos_data:
        a = User(school_id=school.id, email=email, first_name=fn, last_name=ln,
                 rut=rut, role='alumno')
        a.set_password('alumno123')
        db.session.add(a)
        alumnos.append(a)

    db.session.flush()

    # Asignaturas
    subjects_data = [
        ('Lenguaje y Comunicación', 'LEN', 'LEN', '#EF4444'),
        ('Matemática', 'MAT', 'MAT', '#3B82F6'),
        ('Historia, Geografía y Cs. Sociales', 'HIS', 'HIS', '#F59E0B'),
        ('Ciencias Naturales', 'CNA', 'CNA', '#10B981'),
        ('Inglés', 'ING', 'ING', '#8B5CF6'),
        ('Educación Física y Salud', 'EDF', 'EDF', '#EC4899'),
    ]
    subjects = []
    for name, code, min_code, color in subjects_data:
        s = Subject(school_id=school.id, name=name, code=code, ministry_code=min_code, color=color)
        db.session.add(s)
        subjects.append(s)

    db.session.flush()

    # Períodos 2026 - semestral
    p1 = Period(school_id=school.id, name='1er Semestre 2026', period_type='semestral',
                year=2026, number=1, start_date=date(2026, 3, 1), end_date=date(2026, 7, 15), is_active=True)
    p2 = Period(school_id=school.id, name='2do Semestre 2026', period_type='semestral',
                year=2026, number=2, start_date=date(2026, 8, 1), end_date=date(2026, 12, 15), is_active=False)
    db.session.add_all([p1, p2])
    db.session.flush()

    # Curso 5°A
    curso = Course(school_id=school.id, name='5° Básico A', level='5° Básico',
                   letter='A', year=2026, head_teacher_id=prof1.id)
    db.session.add(curso)
    db.session.flush()

    # Matricular alumnos
    for alumno in alumnos:
        e = Enrollment(student_id=alumno.id, course_id=curso.id, year=2026)
        db.session.add(e)

    # Asignaturas del curso con profesores
    for i, subject in enumerate(subjects):
        teacher = prof1 if i % 2 == 0 else prof2
        cs = CourseSubject(course_id=curso.id, subject_id=subject.id,
                           teacher_id=teacher.id, hours_per_week=4 if i < 2 else 2)
        db.session.add(cs)

    db.session.flush()

    # Notas de ejemplo
    import random
    random.seed(42)
    course_subjects = CourseSubject.query.filter_by(course_id=curso.id).all()
    for alumno in alumnos:
        for cs in course_subjects:
            for _ in range(3):
                nota = round(random.uniform(4.5, 7.0), 1)
                g = Grade(student_id=alumno.id, course_subject_id=cs.id,
                          period_id=p1.id, value=nota, grade_type='nota', created_by=prof1.id)
                db.session.add(g)

    # Anotaciones de ejemplo
    ann_data = [
        (alumnos[0].id, 'positiva', 'Participación destacada', 'Excelente participación en clase'),
        (alumnos[1].id, 'positiva', 'Premio al mérito', 'Obtuvo el mejor promedio del mes'),
        (alumnos[2].id, 'negativa', 'Atraso reiterado', 'Llegó tarde 3 veces esta semana'),
        (alumnos[3].id, 'academica', 'Tarea pendiente', 'No presentó tarea de matemática'),
        (alumnos[4].id, 'positiva', 'Ayuda a compañeros', 'Apoya constantemente a sus pares'),
    ]
    for sid, atype, title, desc in ann_data:
        ann = Annotation(student_id=sid, course_id=curso.id, annotation_type=atype,
                         title=title, description=desc, date=date.today(), created_by=prof1.id)
        db.session.add(ann)

    db.session.commit()
    print("✅ Datos de ejemplo creados!")
    print("\n📋 Accesos de prueba:")
    print("  Super Admin: superadmin@sistema.cl / super123")
    print("  Admin:       admin@sanpatricio.cl / admin123")
    print("  Directivo:   directivo@sanpatricio.cl / dir123")
    print("  Profesor:    mvaldes@sanpatricio.cl / prof123")
    print("  Alumno:      pedro.alvarado@gmail.com / alumno123")


# Objeto para gunicorn
application = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5008))
    print(f"\n🚀 API corriendo en http://localhost:{port}")
    application.run(debug=True, port=port, host='0.0.0.0')
