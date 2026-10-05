from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

db = SQLAlchemy()

class School(db.Model):
    __tablename__ = 'schools'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    rut = db.Column(db.String(20), unique=True)
    address = db.Column(db.String(300))
    phone = db.Column(db.String(20))
    email = db.Column(db.String(100))
    website = db.Column(db.String(200))
    rector = db.Column(db.String(200))
    # Bajada institucional: sostenedor, congregación o red a la que pertenece.
    # Sale bajo el nombre del colegio en los informes.
    subtitulo = db.Column(db.String(200))
    logo_url = db.Column(db.Text)   # data URL base64: no cabe en VARCHAR
    primary_color = db.Column(db.String(7), default='#2563EB')
    secondary_color = db.Column(db.String(7), default='#1E40AF')
    accent_color = db.Column(db.String(7), default='#3B82F6')
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    # Plan: free | paid
    plan = db.Column(db.String(20), default='free')
    # Estado del plan: active | inactive | trial | expired
    plan_status = db.Column(db.String(20), default='active')
    subscription_expires_at = db.Column(db.DateTime, nullable=True)

    users = db.relationship('User', backref='school', lazy=True)
    courses = db.relationship('Course', backref='school', lazy=True)
    periods = db.relationship('Period', backref='school', lazy=True)
    subjects = db.relationship('Subject', backref='school', lazy=True)
    subscriptions = db.relationship('Subscription', backref='school', lazy=True)

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'rut': self.rut,
            'address': self.address, 'phone': self.phone, 'email': self.email,
            'website': self.website, 'rector': self.rector,
            'subtitulo': self.subtitulo,
            'logo_url': self.logo_url, 'primary_color': self.primary_color,
            'secondary_color': self.secondary_color, 'accent_color': self.accent_color,
            'is_active': self.is_active,
            'plan': self.plan, 'plan_status': self.plan_status,
            'subscription_expires_at': self.subscription_expires_at.isoformat() if self.subscription_expires_at else None,
            'user_count': len(self.users) if self.users else 0,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    # nullable=True para que super_admin no necesite school
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    first_name = db.Column(db.String(100), nullable=False)
    last_name = db.Column(db.String(100), nullable=False)
    rut = db.Column(db.String(20))
    phone = db.Column(db.String(20))
    address = db.Column(db.String(300))
    birth_date = db.Column(db.Date)
    gender = db.Column(db.String(10))
    avatar_url = db.Column(db.String(500))
    photo = db.Column(db.Text)         # base64 data URL de la foto de perfil
    # Roles: super_admin, admin, directivo, profesor, apoderado, alumno
    role = db.Column(db.String(20), nullable=False, default='alumno')
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password, method='pbkdf2:sha256')

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'id': self.id, 'school_id': self.school_id,
            'email': self.email, 'first_name': self.first_name,
            'last_name': self.last_name, 'full_name': f"{self.first_name} {self.last_name}",
            'rut': self.rut, 'phone': self.phone, 'address': self.address,
            'birth_date': self.birth_date.isoformat() if self.birth_date else None,
            'gender': self.gender, 'avatar_url': self.avatar_url,
            'has_photo': bool(self.photo),
            'role': self.role, 'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class Period(db.Model):
    __tablename__ = 'periods'
    id = db.Column(db.Integer, primary_key=True)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    # Tipos: anual, semestral, trimestral, mensual
    period_type = db.Column(db.String(20), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    number = db.Column(db.Integer, default=1)
    start_date = db.Column(db.Date)
    end_date = db.Column(db.Date)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'school_id': self.school_id, 'name': self.name,
            'period_type': self.period_type, 'year': self.year, 'number': self.number,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'is_active': self.is_active
        }


class Subject(db.Model):
    __tablename__ = 'subjects'
    id = db.Column(db.Integer, primary_key=True)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    code = db.Column(db.String(20))
    ministry_code = db.Column(db.String(20))
    description = db.Column(db.Text)
    color = db.Column(db.String(7), default='#6366F1')
    is_active = db.Column(db.Boolean, default=True)

    def to_dict(self):
        return {
            'id': self.id, 'school_id': self.school_id, 'name': self.name,
            'code': self.code, 'ministry_code': self.ministry_code,
            'description': self.description, 'color': self.color, 'is_active': self.is_active
        }


class Course(db.Model):
    __tablename__ = 'courses'
    id = db.Column(db.Integer, primary_key=True)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    level = db.Column(db.String(50))
    letter = db.Column(db.String(5))
    year = db.Column(db.Integer)
    head_teacher_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    description = db.Column(db.Text)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    head_teacher = db.relationship('User', foreign_keys=[head_teacher_id])
    enrollments = db.relationship('Enrollment', backref='course', lazy=True)
    course_subjects = db.relationship('CourseSubject', backref='course', lazy=True)

    def to_dict(self):
        return {
            'id': self.id, 'school_id': self.school_id, 'name': self.name,
            'level': self.level, 'letter': self.letter, 'year': self.year,
            'head_teacher_id': self.head_teacher_id,
            'head_teacher': self.head_teacher.to_dict() if self.head_teacher else None,
            'description': self.description, 'is_active': self.is_active,
            'student_count': len(self.enrollments)
        }


class Enrollment(db.Model):
    __tablename__ = 'enrollments'
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey('courses.id'), nullable=False)
    year = db.Column(db.Integer)
    is_active = db.Column(db.Boolean, default=True)
    enrolled_at = db.Column(db.DateTime, default=datetime.utcnow)

    student = db.relationship('User', foreign_keys=[student_id])

    def to_dict(self):
        return {
            'id': self.id, 'student_id': self.student_id, 'course_id': self.course_id,
            'year': self.year, 'is_active': self.is_active,
            'student': self.student.to_dict() if self.student else None
        }


class CourseSubject(db.Model):
    __tablename__ = 'course_subjects'
    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('courses.id'), nullable=False)
    subject_id = db.Column(db.Integer, db.ForeignKey('subjects.id'), nullable=False)
    teacher_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    hours_per_week = db.Column(db.Integer, default=2)

    subject = db.relationship('Subject', foreign_keys=[subject_id])
    teacher = db.relationship('User', foreign_keys=[teacher_id])

    def to_dict(self):
        return {
            'id': self.id, 'course_id': self.course_id, 'subject_id': self.subject_id,
            'teacher_id': self.teacher_id,
            'subject': self.subject.to_dict() if self.subject else None,
            'teacher': self.teacher.to_dict() if self.teacher else None,
            'hours_per_week': self.hours_per_week
        }


class StudentGuardian(db.Model):
    __tablename__ = 'student_guardians'
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    guardian_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    relationship = db.Column(db.String(50))

    student = db.relationship('User', foreign_keys=[student_id])
    guardian = db.relationship('User', foreign_keys=[guardian_id])


class Grade(db.Model):
    __tablename__ = 'grades'
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    course_subject_id = db.Column(db.Integer, db.ForeignKey('course_subjects.id'), nullable=False)
    period_id = db.Column(db.Integer, db.ForeignKey('periods.id'), nullable=False)
    value = db.Column(db.Float, nullable=False)
    description = db.Column(db.String(200))
    grade_type = db.Column(db.String(50), default='nota')
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    student = db.relationship('User', foreign_keys=[student_id])
    course_subject = db.relationship('CourseSubject', foreign_keys=[course_subject_id])
    period = db.relationship('Period', foreign_keys=[period_id])

    def to_dict(self):
        return {
            'id': self.id, 'student_id': self.student_id,
            'course_subject_id': self.course_subject_id,
            'period_id': self.period_id, 'value': self.value,
            'description': self.description, 'grade_type': self.grade_type,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'student': self.student.to_dict() if self.student else None,
            'subject_name': self.course_subject.subject.name if self.course_subject and self.course_subject.subject else None,
            'period_name': self.period.name if self.period else None
        }


class Annotation(db.Model):
    __tablename__ = 'annotations'
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey('courses.id'), nullable=False)
    # tipos: positiva, negativa, neutral, academica
    annotation_type = db.Column(db.String(20), nullable=False, default='neutral')
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=False)
    date = db.Column(db.Date, default=datetime.utcnow)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    student = db.relationship('User', foreign_keys=[student_id])
    creator = db.relationship('User', foreign_keys=[created_by])
    course = db.relationship('Course', foreign_keys=[course_id])

    def to_dict(self):
        return {
            'id': self.id, 'student_id': self.student_id, 'course_id': self.course_id,
            'annotation_type': self.annotation_type, 'title': self.title,
            'description': self.description,
            'date': self.date.isoformat() if self.date else None,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'student': self.student.to_dict() if self.student else None,
            'creator_name': f"{self.creator.first_name} {self.creator.last_name}" if self.creator else None
        }


class Subscription(db.Model):
    """Suscripción mensual de un colegio al plan de pago."""
    __tablename__ = 'subscriptions'
    id = db.Column(db.Integer, primary_key=True)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=False)
    # Tipo de plan: monthly | annual
    plan_type = db.Column(db.String(20), default='monthly')
    amount = db.Column(db.Float, default=29990.0)   # en CLP
    currency = db.Column(db.String(10), default='CLP')
    # Estado: pending | authorized | active | paused | cancelled | expired
    status = db.Column(db.String(20), default='pending')
    # IDs de Mercado Pago
    mp_subscription_id = db.Column(db.String(200))   # preapproval id
    mp_payment_id = db.Column(db.String(200))          # pago individual
    mp_payer_email = db.Column(db.String(200))
    # Fechas
    start_date = db.Column(db.DateTime, nullable=True)
    next_payment_date = db.Column(db.DateTime, nullable=True)
    end_date = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'school_id': self.school_id,
            'school_name': self.school.name if self.school else None,
            'plan_type': self.plan_type,
            'amount': self.amount,
            'currency': self.currency,
            'status': self.status,
            'mp_subscription_id': self.mp_subscription_id,
            'mp_payer_email': self.mp_payer_email,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'next_payment_date': self.next_payment_date.isoformat() if self.next_payment_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


# ══════════════════════════════════════════════════════════════
#  MÓDULO CONVIVENCIA ESCOLAR
# ══════════════════════════════════════════════════════════════

CONVIVENCIA_PROCEDURES = [
    'Entrevista Estudiante',
    'Atención psicológica',
    'Seguimiento de caso',
    'Entrevista Apoderado/a',
    'Visita domiciliaria',
    'Otro',
]

CONVIVENCIA_TYPIFICATIONS = [
    'Falta Leve',
    'Falta Grave',
    'Falta Gravísima',
    'Desregulación Emocional',
    'Víctima',
    'No corresponde',
    'Otro',
]

CONVIVENCIA_PROTOCOL_STEPS = [
    'Detección de la Situación',
    'Indagación Interna de los Hechos',
    'Comunicación con la Familia',
    'Derivación o Denuncia',
    'Medidas de Apoyo',
    'Cierre del Caso',
]


class ConvivenciaCase(db.Model):
    __tablename__ = 'convivencia_cases'
    id = db.Column(db.Integer, primary_key=True)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=False)
    # Número correlativo por colegio y año
    case_number = db.Column(db.Integer, default=1)
    year = db.Column(db.Integer, default=2026)
    # Alumno involucrado (puede quedar sin asignar)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    course_id = db.Column(db.Integer, db.ForeignKey('courses.id'), nullable=True)
    # Profesional responsable
    professional_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    # Datos del caso
    title = db.Column(db.String(300), nullable=False)
    date = db.Column(db.Date, nullable=False)
    procedure = db.Column(db.String(100))        # Entrevista Estudiante, etc.
    typification = db.Column(db.String(100))     # Falta Leve, Falta Grave, etc.
    motive = db.Column(db.Text)                  # Motivo / Descripción
    agreements = db.Column(db.Text)              # Acuerdos y compromisos
    # Estado y criticidad
    status = db.Column(db.String(20), default='abierto')    # abierto | cerrado
    criticality = db.Column(db.String(10), default='media') # baja | media | alta
    # Auditoría
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    student = db.relationship('User', foreign_keys=[student_id])
    professional = db.relationship('User', foreign_keys=[professional_id])
    # ── Anexo-based fields ─────────────────────────────────────────────
    # Estado del flujo de Convivencia Escolar
    estado = db.Column(db.String(30), default='recepcion')
    # recepcion | entrevista | seguimiento | intervencion_grupal | apelacion | cerrado

    # Datos de cada Anexo almacenados como JSON
    anx1_data = db.Column(db.Text)  # Recepción
    anx2_data = db.Column(db.Text)  # Entrevista Apoderado
    anx3_data = db.Column(db.Text)  # Seguimiento Individual
    anx4_data = db.Column(db.Text)  # Intervención Grupal
    anx5_data = db.Column(db.Text)  # Apelación

    creator = db.relationship('User', foreign_keys=[created_by])
    course = db.relationship('Course', foreign_keys=[course_id])
    steps = db.relationship('ConvivenciaCaseStep', backref='case', lazy=True,
                            order_by='ConvivenciaCaseStep.step_number')
    bitacora = db.relationship('ConvivenciaBitacora', backref='case', lazy=True,
                               cascade='all, delete-orphan',
                               order_by='ConvivenciaBitacora.fecha')

    def to_dict(self):
        import json as _json
        def _parse(s):
            if not s: return None
            try: return _json.loads(s)
            except: return None
        return {
            'id': self.id,
            'school_id': self.school_id,
            'case_number': self.case_number,
            'year': self.year,
            'student_id': self.student_id,
            'student': self.student.to_dict() if self.student else None,
            'course_id': self.course_id,
            'course_name': self.course.name if self.course else None,
            'professional_id': self.professional_id,
            'professional': self.professional.to_dict() if self.professional else None,
            'title': self.title,
            'date': self.date.isoformat() if self.date else None,
            'procedure': self.procedure,
            'typification': self.typification,
            'motive': self.motive,
            'agreements': self.agreements,
            'status': self.status,
            'criticality': self.criticality,
            'estado': self.estado or 'recepcion',
            'anx1_data': _parse(self.anx1_data),
            'anx2_data': _parse(self.anx2_data),
            'anx3_data': _parse(self.anx3_data),
            'anx4_data': _parse(self.anx4_data),
            'anx5_data': _parse(self.anx5_data),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'steps': [s.to_dict() for s in self.steps],
            'steps_completed': sum(1 for s in self.steps if s.status == 'completed'),
            'steps_total': len(self.steps),
            'bitacora': [b.to_dict() for b in self.bitacora],
        }


class ConvivenciaCaseStep(db.Model):
    __tablename__ = 'convivencia_case_steps'
    id = db.Column(db.Integer, primary_key=True)
    case_id = db.Column(db.Integer, db.ForeignKey('convivencia_cases.id'), nullable=False)
    step_number = db.Column(db.Integer, nullable=False)
    name = db.Column(db.String(200), nullable=False)
    status = db.Column(db.String(20), default='pending')  # pending | in_progress | completed
    notes = db.Column(db.Text)
    completed_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'case_id': self.case_id,
            'step_number': self.step_number,
            'name': self.name,
            'status': self.status,
            'notes': self.notes,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
        }


class ConvivenciaBitacora(db.Model):
    __tablename__ = 'convivencia_bitacora'
    id = db.Column(db.Integer, primary_key=True)
    case_id = db.Column(db.Integer, db.ForeignKey('convivencia_cases.id'), nullable=False)
    fecha = db.Column(db.Date, nullable=True)
    tipo_accion = db.Column(db.String(200))
    observaciones = db.Column(db.Text)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'case_id': self.case_id,
            'fecha': self.fecha.isoformat() if self.fecha else None,
            'tipo_accion': self.tipo_accion,
            'observaciones': self.observaciones,
            'created_by_id': self.created_by_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


# ══════════════════════════════════════════════════════════════════════
#  CARGA ACADÉMICA
# ══════════════════════════════════════════════════════════════════════

# Tabla Legal MINEDUC — proporción 65/35, Arts. 69 y 80, DFL N°1/1996
# jornada_semanal (horas cronológicas) -> (horas_pedagogicas, recreo_min, no_lectivas_min)
# Invariante: jornada*60 == horas_pedagogicas*45 + recreo_min + no_lectivas_min
TABLA_LEGAL_MINEDUC = {
    44: (38, 180, 750), 43: (37, 176, 739), 42: (36, 172, 728), 41: (35, 168, 717),
    40: (35, 164, 661), 39: (34, 160, 650), 38: (33, 155, 640), 37: (32, 151, 629),
    36: (31, 147, 618), 35: (30, 143, 607), 34: (29, 139, 596), 33: (29, 135, 540),
    32: (28, 131, 529), 31: (27, 127, 518), 30: (26, 123, 507), 29: (25, 119, 496),
    28: (24, 115, 485), 27: (23, 110, 475), 26: (22, 106, 464), 25: (22, 102, 408),
    24: (21, 98, 397),  23: (20, 94, 386),  22: (19, 90, 375),  21: (18, 86, 364),
    20: (17, 82, 353),  19: (16, 78, 342),  18: (16, 74, 286),  17: (15, 70, 275),
    16: (14, 65, 265),  15: (13, 61, 254),  14: (12, 57, 243),  13: (11, 53, 232),
    12: (10, 49, 221),  11: (10, 45, 165),  10: (9, 41, 154),   9:  (8, 37, 143),
    8:  (7, 33, 132),   7:  (6, 29, 121),   6:  (5, 25, 110),   5:  (4, 20, 100),
    4:  (3, 16, 89),    3:  (3, 12, 33),    2:  (2, 8, 22),     1:  (1, 4, 11),
}

# Tipos de fila en la carga lectiva
CARGA_TIPOS = [
    'asignatura',        # ramo real, consume demanda
    'jefe_departamento',
    'disponibilidad',    # regla: máximo 3 h/semana
    'toma_contacto',
    'orientacion',
    'jefatura',
    'otro',
]

# Actividades no lectivas por defecto (minutos)
ACTIVIDADES_NO_LECTIVAS_DEFAULT = [
    {'actividad': 'Consejo de profesores',   'minutos': 60},
    {'actividad': 'Reunión de departamento', 'minutos': 60},
    {'actividad': 'Reunión de ciclo',        'minutos': 60},
    {'actividad': 'Trabajo de jefatura',     'minutos': 120},
    {'actividad': 'Atención de apoderados',  'minutos': 90},
]

MAX_HORAS_DISPONIBILIDAD = 3


def tabla_legal_lookup(jornada):
    """Devuelve dict con los valores legales de una jornada semanal."""
    row = TABLA_LEGAL_MINEDUC.get(int(jornada or 0))
    if not row:
        return None
    ped, recreo_min, no_lect_min = row
    return {
        'jornada': int(jornada),
        'horas_pedagogicas': ped,
        'lectivas_cronologicas_min': ped * 45,
        'recreo_min': recreo_min,
        'no_lectivas_min': no_lect_min,
    }


class CargaDocente(db.Model):
    """Docente dentro del módulo de Carga Académica (no requiere login)."""
    __tablename__ = 'carga_docentes'
    id = db.Column(db.Integer, primary_key=True)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=False)
    year = db.Column(db.Integer, nullable=False, default=2027)
    nombre = db.Column(db.String(200), nullable=False)
    rut = db.Column(db.String(20))
    # Vínculo opcional a un usuario del sistema
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    departamento = db.Column(db.String(120))
    nivel = db.Column(db.String(20), default='Media')   # Básica | Media
    horas_contrato = db.Column(db.Integer, default=44)  # jornada semanal cronológica
    no_lectivas_json = db.Column(db.Text)               # [{actividad, minutos}]
    # Líneas informativas al pie del informe: [{etiqueta, valor}]. Van después
    # de la permanencia y NO entran en ningún total — son texto libre
    adicionales_json = db.Column(db.Text)
    orden = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    asignaciones = db.relationship('CargaAsignacion', backref='docente', lazy=True,
                                   cascade='all, delete-orphan',
                                   order_by='CargaAsignacion.orden')

    def no_lectivas(self):
        import json as _j
        if not self.no_lectivas_json:
            return [dict(a) for a in ACTIVIDADES_NO_LECTIVAS_DEFAULT]
        try:
            return _j.loads(self.no_lectivas_json)
        except Exception:
            return []

    def adicionales(self):
        import json as _j
        if not self.adicionales_json:
            return []
        try:
            return _j.loads(self.adicionales_json)
        except Exception:
            return []

    def to_dict(self, with_asignaciones=True):
        legal = tabla_legal_lookup(self.horas_contrato) or {}
        acts = self.no_lectivas()
        total_act_min = sum(int(a.get('minutos') or 0) for a in acts)
        asigs = sorted(self.asignaciones, key=lambda a: (a.orden or 0, a.id))
        total_lectivas = sum(int(a.horas or 0) for a in asigs)
        disponibilidad = sum(int(a.horas or 0) for a in asigs if a.tipo == 'disponibilidad')
        horas_ped = legal.get('horas_pedagogicas', 0)
        no_lect_min = legal.get('no_lectivas_min', 0)
        d = {
            'id': self.id,
            'school_id': self.school_id,
            'year': self.year,
            'nombre': self.nombre,
            'rut': self.rut,
            'user_id': self.user_id,
            'departamento': self.departamento,
            'nivel': self.nivel,
            'horas_contrato': self.horas_contrato,
            'orden': self.orden,
            # Derivados de la Tabla Legal
            'horas_pedagogicas': horas_ped,
            'recreo_min': legal.get('recreo_min', 0),
            'no_lectivas_min': no_lect_min,
            'lectivas_cronologicas_min': legal.get('lectivas_cronologicas_min', 0),
            # Estado de la carga
            'no_lectivas': acts,
            'adicionales': self.adicionales(),
            'total_actividades_min': total_act_min,
            'permanencia_min': no_lect_min - total_act_min,
            'total_lectivas': total_lectivas,
            'diferencia': total_lectivas - horas_ped,
            'disponibilidad': disponibilidad,
            'completo': (total_lectivas == horas_ped) and horas_ped > 0,
            'excede_disponibilidad': disponibilidad > MAX_HORAS_DISPONIBILIDAD,
            'excede_no_lectivas': total_act_min > no_lect_min,
        }
        if with_asignaciones:
            d['asignaciones'] = [a.to_dict() for a in asigs]
        return d


class CargaDemanda(db.Model):
    """Demanda de horas: cuántas horas necesita una asignatura en un nivel."""
    __tablename__ = 'carga_demanda'
    id = db.Column(db.Integer, primary_key=True)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=False)
    year = db.Column(db.Integer, nullable=False, default=2027)
    departamento = db.Column(db.String(120))
    # FK al catálogo global de asignaturas del colegio
    subject_id = db.Column(db.Integer, db.ForeignKey('subjects.id'), nullable=True)
    # Etiqueta: espejo del nombre de la Subject, o texto libre si aún no existe
    asignatura = db.Column(db.String(200), nullable=False)
    nivel = db.Column(db.String(40), nullable=False)      # 7° Básico | I Medio | ...
    # por_letra=True  -> se dicta en cada letra (A,B,C): total = horas_por_grupo * n_letras
    # por_letra=False -> grupo único por nivel (electivos): total = horas_por_grupo
    por_letra = db.Column(db.Boolean, default=True)
    letras = db.Column(db.String(40), default='A,B,C')
    horas_por_grupo = db.Column(db.Integer, default=0)
    orden = db.Column(db.Integer, default=0)

    subject = db.relationship('Subject', foreign_keys=[subject_id])

    def nombre(self):
        """Nombre vigente: manda el catálogo si está enlazado."""
        return self.subject.name if self.subject else (self.asignatura or '')

    def n_letras(self):
        if not self.por_letra:
            return 1
        return len([x for x in (self.letras or '').split(',') if x.strip()]) or 1

    def horas_totales(self):
        return int(self.horas_por_grupo or 0) * self.n_letras()

    def to_dict(self):
        return {
            'id': self.id,
            'school_id': self.school_id,
            'year': self.year,
            'departamento': self.departamento,
            'subject_id': self.subject_id,
            'asignatura': self.nombre(),
            'en_catalogo': self.subject_id is not None,
            'nivel': self.nivel,
            'por_letra': bool(self.por_letra),
            'letras': self.letras,
            'horas_por_grupo': self.horas_por_grupo,
            'n_letras': self.n_letras(),
            'horas_totales': self.horas_totales(),
            'orden': self.orden,
        }


class CargaAsignacion(db.Model):
    """Una fila de horas lectivas asignadas a un docente."""
    __tablename__ = 'carga_asignaciones'
    id = db.Column(db.Integer, primary_key=True)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=False)
    year = db.Column(db.Integer, nullable=False, default=2027)
    docente_id = db.Column(db.Integer, db.ForeignKey('carga_docentes.id'), nullable=False)
    tipo = db.Column(db.String(30), default='asignatura')
    # Si tipo == 'asignatura' debería apuntar a una fila de demanda
    demanda_id = db.Column(db.Integer, db.ForeignKey('carga_demanda.id'), nullable=True)
    asignatura_libre = db.Column(db.String(200))   # usado cuando no hay demanda_id
    letras = db.Column(db.String(40))              # "A,B,C" — qué letras cubre este docente
    horas = db.Column(db.Integer, default=0)
    orden = db.Column(db.Integer, default=0)

    demanda = db.relationship('CargaDemanda', foreign_keys=[demanda_id])

    def nombre_asignatura(self):
        if self.demanda:
            return self.demanda.nombre()
        return self.asignatura_libre or ''

    def nombre_cursos(self):
        """Texto tipo 'I Medio A, B, C' para el informe."""
        if self.demanda:
            nivel = self.demanda.nivel
            if self.letras:
                return f"{nivel} {self.letras.replace(',', ', ')}"
            return nivel
        return self.letras or ''

    def to_dict(self):
        return {
            'id': self.id,
            'school_id': self.school_id,
            'year': self.year,
            'docente_id': self.docente_id,
            'tipo': self.tipo,
            'demanda_id': self.demanda_id,
            'asignatura_libre': self.asignatura_libre,
            'asignatura': self.nombre_asignatura(),
            'nivel': self.demanda.nivel if self.demanda else None,
            'letras': self.letras,
            'cursos_texto': self.nombre_cursos(),
            'horas': self.horas,
            'orden': self.orden,
        }


# Actividades que ocupan horas lectivas pero no son una asignatura.
# Van en la tabla HORAS LECTIVAS del informe, bajo los ramos.
ACTIVIDADES_LECTIVAS_DEFAULT = [
    {'nombre': 'Disponibilidad',               'tipo': 'disponibilidad'},
    {'nombre': 'Toma de contacto',             'tipo': 'toma_contacto'},
    {'nombre': 'Orientación / Consejo de curso', 'tipo': 'orientacion'},
    {'nombre': 'Trabajo de Jefatura',          'tipo': 'jefatura'},
    {'nombre': 'Jefe de Departamento',         'tipo': 'jefe_departamento'},
]


class ActividadNoLectiva(db.Model):
    """Catálogo de actividades del colegio, lectivas y no lectivas."""
    __tablename__ = 'carga_actividades_nl'
    id = db.Column(db.Integer, primary_key=True)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=False)
    nombre = db.Column(db.String(200), nullable=False)
    # lectiva   -> ocupa horas de aula (Disponibilidad, Jefatura, ...)
    # no_lectiva-> ocupa tiempo administrativo (Consejo de profesores, ...)
    ambito = db.Column(db.String(20), default='no_lectiva')
    # Para las lectivas: tipo canónico, del que dependen reglas como el
    # máximo de 3 h de disponibilidad
    tipo = db.Column(db.String(30))
    minutos_default = db.Column(db.Integer, default=60)
    is_active = db.Column(db.Boolean, default=True)
    orden = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {
            'id': self.id, 'school_id': self.school_id, 'nombre': self.nombre,
            'ambito': self.ambito or 'no_lectiva', 'tipo': self.tipo,
            'minutos_default': self.minutos_default, 'is_active': self.is_active,
            'orden': self.orden,
        }


# ── Horario semanal ───────────────────────────────────────────────────

DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']

# Estructura por defecto de la jornada, tomada del horario de Educación Media.
# tipo: clase | recreo | almuerzo | contacto | reunion
BLOQUES_DEFAULT = [
    {'orden': 0,  'etiqueta': '0',  'inicio': '08:00', 'fin': '08:10', 'tipo': 'contacto'},
    {'orden': 1,  'etiqueta': '1',  'inicio': '08:10', 'fin': '08:55', 'tipo': 'clase'},
    {'orden': 2,  'etiqueta': '2',  'inicio': '08:55', 'fin': '09:40', 'tipo': 'clase'},
    {'orden': 3,  'etiqueta': '',   'inicio': '09:40', 'fin': '10:00', 'tipo': 'recreo'},
    {'orden': 4,  'etiqueta': '3',  'inicio': '10:00', 'fin': '10:45', 'tipo': 'clase'},
    {'orden': 5,  'etiqueta': '4',  'inicio': '10:45', 'fin': '11:30', 'tipo': 'clase'},
    {'orden': 6,  'etiqueta': '',   'inicio': '11:30', 'fin': '11:50', 'tipo': 'recreo'},
    {'orden': 7,  'etiqueta': '5',  'inicio': '11:50', 'fin': '12:35', 'tipo': 'clase'},
    {'orden': 8,  'etiqueta': '6',  'inicio': '12:35', 'fin': '13:20', 'tipo': 'clase'},
    {'orden': 9,  'etiqueta': '7',  'inicio': '13:20', 'fin': '14:05', 'tipo': 'clase'},
    {'orden': 10, 'etiqueta': '8',  'inicio': '14:05', 'fin': '14:50', 'tipo': 'clase'},
    {'orden': 11, 'etiqueta': '9',  'inicio': '14:50', 'fin': '15:35', 'tipo': 'clase'},
    {'orden': 12, 'etiqueta': '10', 'inicio': '15:35', 'fin': '16:20', 'tipo': 'clase'},
]


class HorarioBloque(db.Model):
    """Bloque horario del colegio (una fila de la grilla semanal)."""
    __tablename__ = 'carga_horario_bloques'
    id = db.Column(db.Integer, primary_key=True)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    orden = db.Column(db.Integer, default=0)
    etiqueta = db.Column(db.String(10))               # "1", "2", "" para recreos
    inicio = db.Column(db.String(5))                  # "08:10"
    fin = db.Column(db.String(5))                     # "08:55"
    tipo = db.Column(db.String(20), default='clase')  # clase|recreo|almuerzo|contacto|reunion

    def to_dict(self):
        return {
            'id': self.id, 'school_id': self.school_id, 'year': self.year,
            'orden': self.orden, 'etiqueta': self.etiqueta,
            'inicio': self.inicio, 'fin': self.fin, 'tipo': self.tipo,
        }


class HorarioCelda(db.Model):
    """Qué hace un docente en un bloque y día concretos."""
    __tablename__ = 'carga_horario_celdas'
    id = db.Column(db.Integer, primary_key=True)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    docente_id = db.Column(db.Integer, db.ForeignKey('carga_docentes.id'), nullable=False)
    bloque_id = db.Column(db.Integer, db.ForeignKey('carga_horario_bloques.id'), nullable=False)
    dia = db.Column(db.Integer, nullable=False)       # 0=Lunes .. 4=Viernes
    # Qué ocupa la celda: una asignación de la carga, o una etiqueta libre
    asignacion_id = db.Column(db.Integer, db.ForeignKey('carga_asignaciones.id'), nullable=True)
    # Letra concreta del curso: una asignación "8° A,B,C" ocupa celdas distintas
    # para A, para B y para C, porque el docente no puede estar en las tres a la vez
    letra = db.Column(db.String(5))
    etiqueta_libre = db.Column(db.String(120))        # ALMUERZO, PERMANENCIA, CONSEJO...

    asignacion = db.relationship('CargaAsignacion', foreign_keys=[asignacion_id])
    bloque = db.relationship('HorarioBloque', foreign_keys=[bloque_id])

    __table_args__ = (
        db.UniqueConstraint('docente_id', 'bloque_id', 'dia', name='uq_horario_celda'),
    )

    def texto(self):
        if self.asignacion:
            a = self.asignacion
            nombre = a.nombre_asignatura()
            if not nombre:
                nombre = {
                    'disponibilidad': 'DISPONIBILIDAD', 'toma_contacto': 'TOMA DE CONTACTO',
                    'orientacion': 'ORIENTACIÓN', 'jefatura': 'TRABAJO DE JEFATURA',
                    'jefe_departamento': 'JEFE DE DEPARTAMENTO',
                }.get(a.tipo, a.tipo.upper())
            nivel = a.demanda.nivel if a.demanda else ''
            # Si la celda fija una letra se muestra solo ese curso
            cursos = self.letra or (a.letras or '').replace(',', ', ')
            detalle = f"{nivel} {cursos}".strip()
            return f"{nombre}{(' ' + detalle) if detalle else ''}"
        return self.etiqueta_libre or ''

    def to_dict(self):
        return {
            'id': self.id, 'docente_id': self.docente_id, 'bloque_id': self.bloque_id,
            'dia': self.dia, 'asignacion_id': self.asignacion_id,
            'letra': self.letra,
            'etiqueta_libre': self.etiqueta_libre, 'texto': self.texto(),
            'tipo': self.asignacion.tipo if self.asignacion else 'libre',
        }
