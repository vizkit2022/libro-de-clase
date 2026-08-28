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
    logo_url = db.Column(db.String(500))
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
