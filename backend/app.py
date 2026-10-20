import os
from flask import Flask, send_from_directory
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from models import db, School, User, Period, Subject, Course, Enrollment, CourseSubject, Grade, Annotation, Subscription, StudentGuardian, ConvivenciaCase, ConvivenciaCaseStep
from datetime import datetime, date

# Path to the built React frontend (relative to this file)
FRONTEND_BUILD = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'build')


def create_app():
    # static_folder=None para que Flask no registre rutas estáticas propias
    # (el catch-all serve_react se encarga de servir el build de React)
    app = Flask(__name__, static_folder=None)

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
    # Subidas (documentos de la ficha del alumno, importación de matrícula): máx 25 MB por request
    app.config['MAX_CONTENT_LENGTH'] = 25 * 1024 * 1024

    # ── Security ──────────────────────────────────────────────────────────────
    app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'colegio-secret-key-2024-change-in-production')
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = False
    # Por defecto el JWT viaja en el header Authorization. Solo algunas rutas
    # (p.ej. GET /api/users/<id>/photo, usada en <img src>) aceptan además
    # ?token=<jwt> vía jwt_required(locations=[...]).
    app.config['JWT_TOKEN_LOCATION'] = ['headers']
    app.config['JWT_QUERY_STRING_NAME'] = 'token'

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
    from routes.students import students_bp
    from routes.convivencia import convivencia_bp
    from routes.carga_academica import carga_bp
    from routes.sitio import sitio_bp
    from routes.matricula import matricula_bp
    from routes.onboarding import onboarding_bp
    from routes.ia_estado import ia_bp
    from routes.anios import anios_bp
    from routes.auditoria import auditoria_bp

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
    app.register_blueprint(students_bp, url_prefix='/api/students')
    app.register_blueprint(convivencia_bp, url_prefix='/api/convivencia')
    app.register_blueprint(carga_bp, url_prefix='/api/carga-academica')
    # Sin prefijo: define /inicio y /api/leads. Va antes del catch-all de React.
    app.register_blueprint(matricula_bp, url_prefix='/api/matricula')
    app.register_blueprint(onboarding_bp, url_prefix='/api/onboarding')
    app.register_blueprint(ia_bp, url_prefix='/api/ia')
    app.register_blueprint(anios_bp, url_prefix='/api/anios')
    app.register_blueprint(auditoria_bp, url_prefix='/api/auditoria')
    app.register_blueprint(sitio_bp)

    # ── Auditoría: registra cambios y descargas de cada request ──────────────
    from servicios.auditoria import instalar as instalar_auditoria
    instalar_auditoria(app)

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
        db.create_all()  # crea tablas nuevas (no altera columnas existentes)
        run_migrations()
        seed_data()
        seed_authorization_templates()

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

            # 3. Publicación de notas
            for table, col, definition in [
                ('grades',            'is_published',      'BOOLEAN NOT NULL DEFAULT FALSE'),
                ('grades',            'published_at',      'TIMESTAMP'),
            ]:
                try:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {definition}"))
                    conn.commit()
                    print(f"✅ Migración: columna {table}.{col} agregada")
                except Exception:
                    conn.rollback()   # ya existía → ignorar

        elif is_sqlite:
            # SQLite tiene ALTER TABLE limitado; solo agregar columnas
            for table, col, definition in [
                ('schools',           'plan',                    "VARCHAR(20) DEFAULT 'free'"),
                ('schools',           'plan_status',             "VARCHAR(20) DEFAULT 'active'"),
                ('schools',           'subscription_expires_at', 'DATETIME'),
                ('grades',            'is_published',            'BOOLEAN NOT NULL DEFAULT 0'),
                ('grades',            'published_at',            'DATETIME'),
            ]:
                try:
                    conn.execute(text(
                        f"ALTER TABLE {table} ADD COLUMN {col} {definition}"
                    ))
                    conn.commit()
                except Exception:
                    conn.rollback()   # ya existía

        # 3. Agregar columnas Anexo a convivencia_cases
        if is_postgres:
            for col, definition in [
                ('estado',     "VARCHAR(30) DEFAULT 'recepcion'"),
                ('anx1_data',  'TEXT'),
                ('anx2_data',  'TEXT'),
                ('anx3_data',  'TEXT'),
                ('anx4_data',  'TEXT'),
                ('anx5_data',  'TEXT'),
            ]:
                try:
                    conn.execute(text(
                        f"ALTER TABLE convivencia_cases ADD COLUMN {col} {definition}"
                    ))
                    conn.commit()
                    print(f"✅ Migración: convivencia_cases.{col} agregada")
                except Exception:
                    conn.rollback()
        elif is_sqlite:
            for col, definition in [
                ('estado',     "VARCHAR(30) DEFAULT 'recepcion'"),
                ('anx1_data',  'TEXT'),
                ('anx2_data',  'TEXT'),
                ('anx3_data',  'TEXT'),
                ('anx4_data',  'TEXT'),
                ('anx5_data',  'TEXT'),
            ]:
                try:
                    conn.execute(text(
                        f"ALTER TABLE convivencia_cases ADD COLUMN {col} {definition}"
                    ))
                    conn.commit()
                except Exception:
                    conn.rollback()

        # 4. Agregar subject_id a carga_demanda (enlace al catálogo de asignaturas)
        for col, definition in [('subject_id', 'INTEGER')]:
            try:
                conn.execute(text(
                    f"ALTER TABLE carga_demanda ADD COLUMN {col} {definition}"
                ))
                conn.commit()
                print(f"✅ Migración: carga_demanda.{col} agregada")
            except Exception:
                conn.rollback()

        # 4b. schools.logo_url a TEXT: el logo se guarda como data URL base64
        #     y no cabe en el VARCHAR(500) original
        if is_postgres:
            try:
                conn.execute(text("ALTER TABLE schools ALTER COLUMN logo_url TYPE TEXT"))
                conn.commit()
                print("✅ Migración: schools.logo_url ahora es TEXT")
            except Exception:
                conn.rollback()

        # 4c. Ámbito y tipo en el catálogo de actividades, para distinguir
        #     las lectivas (Disponibilidad, Jefatura) de las no lectivas
        for col, definition in [('ambito', "VARCHAR(20) DEFAULT 'no_lectiva'"),
                                ('tipo', 'VARCHAR(30)')]:
            try:
                conn.execute(text(
                    f"ALTER TABLE carga_actividades_nl ADD COLUMN {col} {definition}"))
                conn.commit()
                print(f"✅ Migración: carga_actividades_nl.{col} agregada")
            except Exception:
                conn.rollback()

        # 4d. Líneas adicionales al pie del informe de carga
        try:
            conn.execute(text(
                "ALTER TABLE carga_docentes ADD COLUMN adicionales_json TEXT"))
            conn.commit()
            print("✅ Migración: carga_docentes.adicionales_json agregada")
        except Exception:
            conn.rollback()

        # 4e. Bajada institucional del colegio
        try:
            conn.execute(text(
                "ALTER TABLE schools ADD COLUMN subtitulo VARCHAR(200)"))
            conn.commit()
            print("✅ Migración: schools.subtitulo agregada")
        except Exception:
            conn.rollback()

        # 5. Agregar letra a carga_horario_celdas
        try:
            conn.execute(text("ALTER TABLE carga_horario_celdas ADD COLUMN letra VARCHAR(5)"))
            conn.commit()
            print("✅ Migración: carga_horario_celdas.letra agregada")
        except Exception:
            conn.rollback()

        # 6. Columnas de la puesta en marcha
        for tabla, col, definicion in [
            ('schools', 'onboarding_year',       'INTEGER'),
            ('schools', 'onboarding_cerrado_at', 'TIMESTAMP'),
            ('users',   'debe_cambiar_clave',    'BOOLEAN DEFAULT FALSE'),
            ('users',   'clave_entregada_at',    'TIMESTAMP'),
        ]:
            try:
                conn.execute(text(
                    f"ALTER TABLE {tabla} ADD COLUMN {col} {definicion}"))
                conn.commit()
                print(f"✅ Migración: {tabla}.{col} agregada")
            except Exception:
                conn.rollback()   # ya existía → ignorar

        # 7. Teléfonos: VARCHAR(20) no alcanza para «+56 2 2345 6789 anexo 102»
        #    y PostgreSQL rechaza el guardado con un 500 sin explicación.
        if is_postgres:
            for tabla in ('schools', 'users'):
                try:
                    conn.execute(text(
                        f"ALTER TABLE {tabla} ALTER COLUMN phone TYPE VARCHAR(50)"))
                    conn.commit()
                    print(f"✅ Migración: {tabla}.phone ampliado a 50")
                except Exception:
                    conn.rollback()

        # 8. Estados de matrícula (años académicos). Las columnas se agregan SIN
        #    default para poder distinguir las filas antiguas (status NULL) y
        #    rellenarlas una sola vez; las nuevas reciben el default del modelo.
        for col, definicion in [
            ('status',            'VARCHAR(20)'),
            ('enrollment_date',   'DATE'),
            ('withdrawal_date',   'DATE'),
            ('withdrawal_reason', 'TEXT'),
            ('confirmed_at',      'TIMESTAMP'),
            ('promoted_from_id',  'INTEGER'),
        ]:
            try:
                conn.execute(text(f"ALTER TABLE enrollments ADD COLUMN {col} {definicion}"))
                conn.commit()
                print(f"✅ Migración: enrollments.{col} agregada")
            except Exception:
                conn.rollback()   # ya existía → ignorar

        # 8b. Backfill (solo filas sin estado → re-ejecutar no cambia nada)
        activo_sql = "COALESCE(is_active, TRUE)"
        for sql in (
            # Fecha de matrícula: la de la ficha, o el día en que se creó la matrícula
            "UPDATE enrollments SET enrollment_date = COALESCE("
            " (SELECT sp.enrollment_date FROM student_profiles sp"
            "  WHERE sp.student_id = enrollments.student_id), DATE(enrolled_at))"
            " WHERE status IS NULL AND enrollment_date IS NULL",
            # Fecha y motivo de retiro de la ficha para las matrículas inactivas
            "UPDATE enrollments SET"
            " withdrawal_date = (SELECT sp.withdrawal_date FROM student_profiles sp"
            "  WHERE sp.student_id = enrollments.student_id),"
            " withdrawal_reason = (SELECT sp.withdrawal_reason FROM student_profiles sp"
            "  WHERE sp.student_id = enrollments.student_id)"
            f" WHERE status IS NULL AND NOT {activo_sql} AND withdrawal_date IS NULL",
            # Estado: activo / trasladado («Cambiado a …») / retirado
            "UPDATE enrollments SET status = CASE"
            f" WHEN {activo_sql} THEN 'activo'"
            " WHEN EXISTS (SELECT 1 FROM student_profiles sp"
            "  WHERE sp.student_id = enrollments.student_id"
            "  AND LOWER(sp.course_change) LIKE 'cambiado a%') THEN 'trasladado'"
            " ELSE 'retirado' END"
            " WHERE status IS NULL",
        ):
            try:
                r = conn.execute(text(sql))
                conn.commit()
                if r.rowcount:
                    print(f"✅ Migración: backfill de matrículas ({r.rowcount} filas)")
            except Exception as e:
                conn.rollback()
                print(f"⚠️  Backfill de matrículas falló: {e}")

        # La tabla convivencia_bitacora se crea automáticamente por db.create_all()
        # academic_years y student_history también (db.create_all()).
        # audit_logs (auditoría) también: db.create_all() crea la tabla y sus índices.


def _ensure_all_default_periods():
    """Crea Semestre 1 y 2 del año actual en todos los colegios que no los tengan."""
    from datetime import date as date_cls
    year = datetime.utcnow().year
    schools = School.query.all()
    created = 0
    for s in schools:
        if Period.query.filter_by(school_id=s.id, year=year).count() == 0:
            db.session.add_all([
                Period(school_id=s.id, name=f'Semestre 1 {year}', period_type='semestral',
                       year=year, number=1, is_active=True,
                       start_date=date_cls(year, 3, 1), end_date=date_cls(year, 7, 31)),
                Period(school_id=s.id, name=f'Semestre 2 {year}', period_type='semestral',
                       year=year, number=2, is_active=True,
                       start_date=date_cls(year, 8, 1), end_date=date_cls(year, 12, 31)),
            ])
            created += 1
    if created:
        db.session.commit()
        print(f"✅ Períodos creados en {created} colegios")


def seed_authorization_templates():
    """Plantillas de autorización por defecto para cada colegio (idempotente)."""
    from models import ensure_authorization_templates
    try:
        created = 0
        for school in School.query.all():
            created += ensure_authorization_templates(school.id)
        db.session.commit()
        if created:
            print(f"✅ Plantillas de autorización creadas: {created}")
    except Exception as e:
        db.session.rollback()
        print(f"⚠️  No se pudieron crear las plantillas de autorización: {e}")


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
        # Asegurar períodos en todos los colegios existentes
        try:
            _ensure_all_default_periods()
        except Exception as e:
            print(f"[warn] ensure periods: {e}")
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

    # Apoderado de ejemplo (vinculado a Pedro y Valentina)
    apoderado = User(school_id=school.id, email='apoderado@sanpatricio.cl',
                     first_name='Rosa', last_name='Soto Vera', rut='12.121.212-1',
                     role='apoderado', phone='+56 9 5555 5555')
    apoderado.set_password('apod123')
    db.session.add(apoderado)
    db.session.flush()
    db.session.add(StudentGuardian(student_id=alumnos[0].id, guardian_id=apoderado.id, relationship='madre'))
    db.session.add(StudentGuardian(student_id=alumnos[1].id, guardian_id=apoderado.id, relationship='tía'))

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
        e = Enrollment(student_id=alumno.id, course_id=curso.id, year=2026,
                       status='activo', is_active=True, enrollment_date=date(2026, 3, 1))
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
            for i in range(3):
                nota = round(random.uniform(4.5, 7.0), 1)
                # Las 2 primeras notas quedan publicadas; la 3ra queda pendiente de publicar
                g = Grade(student_id=alumno.id, course_subject_id=cs.id,
                          period_id=p1.id, value=nota, grade_type='nota', created_by=prof1.id,
                          is_published=(i < 2), published_at=datetime.utcnow() if i < 2 else None)
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
    print("  Apoderado:   apoderado@sanpatricio.cl / apod123")
    print("  Alumno:      pedro.alvarado@gmail.com / alumno123")


# Objeto para gunicorn
application = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5008))
    print(f"\n🚀 API corriendo en http://localhost:{port}")
    application.run(debug=True, port=port, host='0.0.0.0')
