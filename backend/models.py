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

    def to_dict(self):
        return {
            'id': self.id, 'student_id': self.student_id, 'guardian_id': self.guardian_id,
            'relationship': self.relationship,
            'student': self.student.to_dict() if self.student else None,
            'guardian': self.guardian.to_dict() if self.guardian else None,
        }


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
    # Publicación: el apoderado/alumno solo ve notas publicadas por el profesor
    is_published = db.Column(db.Boolean, default=False, nullable=False)
    published_at = db.Column(db.DateTime)

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
            'is_published': bool(self.is_published),
            'published_at': self.published_at.isoformat() if self.published_at else None,
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


# ── Convivencia Escolar ──────────────────────────────────────────────────────
class ConvivenciaCase(db.Model):
    """Caso de convivencia escolar con 5 etapas (Anexos 1-5)."""
    __tablename__ = 'convivencia_cases'
    id = db.Column(db.Integer, primary_key=True)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=False)
    numero_caso = db.Column(db.String(20))  # CV-2026-001
    # Estado: recepcion | entrevista | seguimiento | intervencion_grupal | apelacion | cerrado
    estado = db.Column(db.String(30), default='recepcion')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    # Apoderado (usuario) vinculado directamente al caso (Anexo 2 / Anexo 5).
    # Le da acceso de solo lectura al caso aunque no sea apoderado de un alumno afectado.
    apoderado_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    # ── ANEXO 1: RECEPCIÓN ─────────────────────────────────────
    fecha_recepcion = db.Column(db.DateTime)
    quien_recibe = db.Column(db.String(200))
    # JSON: [{"nombre": "...", "curso": "...", "student_id": 12}]  (student_id opcional, vincula al alumno)
    afectados = db.Column(db.Text)
    involucrados = db.Column(db.Text)
    descripcion_hechos = db.Column(db.Text)
    # conflicto_cotidiano | maltrato_escolar | acoso_escolar | ciberbullying | otro
    tipificacion = db.Column(db.String(50))
    tipificacion_otro = db.Column(db.String(300))
    # JSON list of strings
    medidas_inmediatas = db.Column(db.Text)

    # ── ANEXO 2: ENTREVISTA APODERADOS ────────────────────────
    entrevista_fecha = db.Column(db.Date)
    entrevista_hora_inicio = db.Column(db.String(10))
    entrevista_hora_termino = db.Column(db.String(10))
    apoderado_nombre = db.Column(db.String(200))
    apoderado_rut = db.Column(db.String(20))
    apoderado_parentesco = db.Column(db.String(80))
    apoderado_telefono = db.Column(db.String(20))
    entrevistador = db.Column(db.String(200))
    entrevistador_cargo = db.Column(db.String(100))
    motivo_citacion = db.Column(db.Text)
    declaracion_descargos = db.Column(db.Text)
    compromiso_familia = db.Column(db.Text)
    compromiso_convivencia = db.Column(db.Text)
    entrevista_proximo_monitoreo = db.Column(db.Date)

    # ── ANEXO 3: SEGUIMIENTO INDIVIDUAL ───────────────────────
    coordinador_cargo = db.Column(db.String(200))
    observaciones_especialistas = db.Column(db.Text)
    seguimiento_proximo_monitoreo = db.Column(db.Date)

    # ── ANEXO 4: INTERVENCIÓN GRUPAL ──────────────────────────
    intervencion_fecha = db.Column(db.Date)
    intervencion_curso = db.Column(db.String(50))
    intervencion_asignatura = db.Column(db.String(150))
    intervencion_profesional = db.Column(db.String(200))
    intervencion_cargo = db.Column(db.String(100))
    intervencion_objetivo = db.Column(db.Text)
    intervencion_contenidos = db.Column(db.Text)
    intervencion_registrado_libro = db.Column(db.Boolean, default=False)
    intervencion_fecha_libro = db.Column(db.Date)
    intervencion_observaciones = db.Column(db.Text)

    # ── ANEXO 5: APELACIÓN ────────────────────────────────────
    apelacion_fecha = db.Column(db.Date)
    apelacion_apoderado = db.Column(db.String(200))
    apelacion_rut = db.Column(db.String(20))
    apelacion_parentesco = db.Column(db.String(80))
    apelacion_medida = db.Column(db.Text)
    apelacion_fundamentos = db.Column(db.Text)
    # JSON list: ["Informes Médicos/Psicológicos", "Cartas de Compromiso", ...]
    apelacion_documentos = db.Column(db.Text)

    bitacora = db.relationship('ConvivenciaBitacora', backref='case', lazy=True,
                               cascade='all, delete-orphan')
    apoderado_user = db.relationship('User', foreign_keys=[apoderado_user_id])

    @staticmethod
    def _safe_json(v):
        import json
        try: return json.loads(v) if v else []
        except Exception: return []

    def linked_student_ids(self):
        """IDs de alumnos vinculados al caso (afectados + involucrados con student_id)."""
        ids = set()
        for entry in self._safe_json(self.afectados) + self._safe_json(self.involucrados):
            if isinstance(entry, dict) and entry.get('student_id'):
                try: ids.add(int(entry['student_id']))
                except (TypeError, ValueError): pass
        return ids

    def is_visible_to_guardian(self, guardian_id, guardian_student_ids):
        """Un apoderado ve el caso si está vinculado directamente o si uno de sus alumnos lo está."""
        if self.apoderado_user_id and int(self.apoderado_user_id) == int(guardian_id):
            return True
        return bool(self.linked_student_ids() & set(guardian_student_ids))

    def to_dict(self):
        safe_json = self._safe_json
        return {
            'id': self.id, 'school_id': self.school_id,
            'numero_caso': self.numero_caso, 'estado': self.estado,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'created_by_id': self.created_by_id,
            'apoderado_user_id': self.apoderado_user_id,
            'apoderado_user': self.apoderado_user.to_dict() if self.apoderado_user else None,
            'linked_student_ids': sorted(self.linked_student_ids()),
            # Anexo 1
            'fecha_recepcion': self.fecha_recepcion.isoformat() if self.fecha_recepcion else None,
            'quien_recibe': self.quien_recibe,
            'afectados': safe_json(self.afectados),
            'involucrados': safe_json(self.involucrados),
            'descripcion_hechos': self.descripcion_hechos,
            'tipificacion': self.tipificacion,
            'tipificacion_otro': self.tipificacion_otro,
            'medidas_inmediatas': safe_json(self.medidas_inmediatas),
            # Anexo 2
            'entrevista_fecha': self.entrevista_fecha.isoformat() if self.entrevista_fecha else None,
            'entrevista_hora_inicio': self.entrevista_hora_inicio,
            'entrevista_hora_termino': self.entrevista_hora_termino,
            'apoderado_nombre': self.apoderado_nombre,
            'apoderado_rut': self.apoderado_rut,
            'apoderado_parentesco': self.apoderado_parentesco,
            'apoderado_telefono': self.apoderado_telefono,
            'entrevistador': self.entrevistador,
            'entrevistador_cargo': self.entrevistador_cargo,
            'motivo_citacion': self.motivo_citacion,
            'declaracion_descargos': self.declaracion_descargos,
            'compromiso_familia': self.compromiso_familia,
            'compromiso_convivencia': self.compromiso_convivencia,
            'entrevista_proximo_monitoreo': self.entrevista_proximo_monitoreo.isoformat() if self.entrevista_proximo_monitoreo else None,
            # Anexo 3
            'coordinador_cargo': self.coordinador_cargo,
            'observaciones_especialistas': self.observaciones_especialistas,
            'seguimiento_proximo_monitoreo': self.seguimiento_proximo_monitoreo.isoformat() if self.seguimiento_proximo_monitoreo else None,
            'bitacora': [b.to_dict() for b in self.bitacora],
            # Anexo 4
            'intervencion_fecha': self.intervencion_fecha.isoformat() if self.intervencion_fecha else None,
            'intervencion_curso': self.intervencion_curso,
            'intervencion_asignatura': self.intervencion_asignatura,
            'intervencion_profesional': self.intervencion_profesional,
            'intervencion_cargo': self.intervencion_cargo,
            'intervencion_objetivo': self.intervencion_objetivo,
            'intervencion_contenidos': self.intervencion_contenidos,
            'intervencion_registrado_libro': self.intervencion_registrado_libro,
            'intervencion_fecha_libro': self.intervencion_fecha_libro.isoformat() if self.intervencion_fecha_libro else None,
            'intervencion_observaciones': self.intervencion_observaciones,
            # Anexo 5
            'apelacion_fecha': self.apelacion_fecha.isoformat() if self.apelacion_fecha else None,
            'apelacion_apoderado': self.apelacion_apoderado,
            'apelacion_rut': self.apelacion_rut,
            'apelacion_parentesco': self.apelacion_parentesco,
            'apelacion_medida': self.apelacion_medida,
            'apelacion_fundamentos': self.apelacion_fundamentos,
            'apelacion_documentos': safe_json(self.apelacion_documentos),
        }


class ConvivenciaBitacora(db.Model):
    """Entradas de bitácora de seguimiento individual (Anexo 3)."""
    __tablename__ = 'convivencia_bitacora'
    id = db.Column(db.Integer, primary_key=True)
    case_id = db.Column(db.Integer, db.ForeignKey('convivencia_cases.id'), nullable=False)
    fecha = db.Column(db.Date)
    tipo_accion = db.Column(db.String(100))  # Entrevista | Observación | Redes | etc.
    observaciones = db.Column(db.Text)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'case_id': self.case_id,
            'fecha': self.fecha.isoformat() if self.fecha else None,
            'tipo_accion': self.tipo_accion,
            'observaciones': self.observaciones,
            'created_by_id': self.created_by_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


# ── Ficha completa del alumno ────────────────────────────────────────────────
from datetime import date as _date


def _ficha_value(v):
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, _date):
        return v.isoformat()
    return v


class _FichaDictMixin:
    """to_dict genérico basado en las columnas de la tabla (excluye binarios)."""
    _exclude_from_dict = ()

    def _columns_dict(self):
        out = {}
        for col in self.__table__.columns:
            if col.key in self._exclude_from_dict:
                continue
            if isinstance(col.type, db.LargeBinary):
                continue
            out[col.key] = _ficha_value(getattr(self, col.key))
        return out

    @classmethod
    def empty_dict(cls, **overrides):
        """Dict con todos los campos en null o en su valor por defecto (para fichas sin registro)."""
        out = {}
        for col in cls.__table__.columns:
            if col.key in cls._exclude_from_dict or isinstance(col.type, db.LargeBinary):
                continue
            val = None
            if col.default is not None and getattr(col.default, 'is_scalar', False):
                val = col.default.arg
            out[col.key] = val
        out.update(overrides)
        return out


class StudentProfile(_FichaDictMixin, db.Model):
    """Datos de matrícula / ficha del alumno (1:1 con users.id del alumno)."""
    __tablename__ = 'student_profiles'
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, unique=True, index=True)
    # Identificación y matrícula
    id_type = db.Column(db.String(20), default='RUN')          # RUN | IPE | Pasaporte | Otro
    matricula_number = db.Column(db.String(50))
    enrollment_date = db.Column(db.Date)
    list_order = db.Column(db.Integer)
    # Identidad
    social_name = db.Column(db.String(200))
    gender_identity = db.Column(db.String(20))                 # Femenino | Masculino | Otro
    gender_other = db.Column(db.String(100))
    nationality = db.Column(db.String(100), default='Chile')
    # Domicilio y procedencia
    region = db.Column(db.String(100))
    comuna = db.Column(db.String(100))
    city = db.Column(db.String(100))
    previous_school = db.Column(db.String(255))
    repeated_courses = db.Column(db.String(255))
    # Admisión / estado
    admission_type = db.Column(db.String(20))                  # nuevo | antiguo
    status = db.Column(db.String(20), default='matriculado')   # matriculado | prematriculado | retirado | egresado
    withdrawal_date = db.Column(db.Date)
    withdrawal_reason = db.Column(db.Text)
    course_change = db.Column(db.String(255))
    # Otros antecedentes
    ethnicity = db.Column(db.String(100))
    religion = db.Column(db.String(100))
    baptized = db.Column(db.Boolean)
    # Hogar
    lives_with = db.Column(db.String(50))
    household_size = db.Column(db.Integer)
    siblings_count = db.Column(db.Integer)
    siblings_in_school = db.Column(db.Integer)
    has_sibling_in_school = db.Column(db.Boolean)
    staff_child = db.Column(db.Boolean)
    # PIE / NEE / beneficios
    pie = db.Column(db.Boolean)
    pie_type = db.Column(db.String(100))
    pie_diagnosis = db.Column(db.Text)
    nee = db.Column(db.String(255))
    priority_status = db.Column(db.String(20))                 # Prioritario | Preferente | Ninguno
    sige_data = db.Column(db.String(255))
    lunch_benefit = db.Column(db.Boolean)
    # Retiro y resguardo
    pickup_with = db.Column(db.Text)
    judicial_restriction = db.Column(db.Boolean)
    judicial_restriction_detail = db.Column(db.Text)
    has_commitment_letter = db.Column(db.Boolean)
    # Emergencia
    emergency_contact_name = db.Column(db.String(255))
    emergency_phone = db.Column(db.String(255))
    emergency_phone_2 = db.Column(db.String(255))
    emergency_email = db.Column(db.String(255))
    # Observaciones
    interests = db.Column(db.Text)
    observations = db.Column(db.Text)
    # Columnas del Excel no mapeadas (JSON)
    extra = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    _exclude_from_dict = ('extra',)

    def get_extra(self):
        import json
        try:
            v = json.loads(self.extra) if self.extra else {}
            return v if isinstance(v, dict) else {}
        except Exception:
            return {}

    def to_dict(self):
        d = self._columns_dict()
        d['extra'] = self.get_extra()
        return d

    @classmethod
    def empty_dict(cls, **overrides):
        d = super().empty_dict(**overrides)
        d.setdefault('extra', {})
        if d.get('extra') is None:
            d['extra'] = {}
        return d


class StudentMedical(_FichaDictMixin, db.Model):
    """Antecedentes médicos del alumno (1:1)."""
    __tablename__ = 'student_medical'
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, unique=True, index=True)
    contraindications = db.Column(db.Text)
    allergies = db.Column(db.Text)
    chronic_diseases = db.Column(db.Text)
    special_care = db.Column(db.Text)
    medications = db.Column(db.Text)
    problem_visual = db.Column(db.Boolean, default=False)
    problem_auditory = db.Column(db.Boolean, default=False)
    problem_cardiac = db.Column(db.Boolean, default=False)
    problem_spine = db.Column(db.Boolean, default=False)
    other_problems = db.Column(db.Text)
    blood_type = db.Column(db.String(20))
    health_provider = db.Column(db.String(255))
    health_insurance = db.Column(db.String(100))
    height_cm = db.Column(db.Float)
    weight_kg = db.Column(db.Float)
    waist_cm = db.Column(db.Float)
    clothing_size = db.Column(db.String(50))
    specialists = db.Column(db.Text)
    covid_vaccination = db.Column(db.String(100))
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return self._columns_dict()


class StudentFamilyMember(_FichaDictMixin, db.Model):
    """Miembro de la familia del alumno (madre, padre, tutor, etc.)."""
    __tablename__ = 'student_family_members'
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    # Parentesco: Madre | Padre | Abuelo/a | Tío/a | Hermano/a | Tutor legal | Otro
    relationship = db.Column(db.String(50))
    relationship_other = db.Column(db.String(100))
    id_type = db.Column(db.String(20), default='RUN')
    rut = db.Column(db.String(20), index=True)
    first_name = db.Column(db.String(150), nullable=False)
    last_name = db.Column(db.String(150))
    birth_date = db.Column(db.Date)
    nationality = db.Column(db.String(100))
    sex = db.Column(db.String(20))
    marital_status = db.Column(db.String(50))
    religion = db.Column(db.String(100))
    phone = db.Column(db.String(100))
    work_phone = db.Column(db.String(100))
    email = db.Column(db.String(150))
    address = db.Column(db.String(300))
    comuna = db.Column(db.String(100))
    education_level = db.Column(db.String(150))
    profession = db.Column(db.String(200))
    occupation = db.Column(db.String(200))
    workplace = db.Column(db.String(200))
    is_household_head = db.Column(db.Boolean)
    lives_with_student = db.Column(db.Boolean)
    can_pickup = db.Column(db.Boolean)
    is_economic_tutor = db.Column(db.Boolean)
    is_emergency_contact = db.Column(db.Boolean)
    guardian_role = db.Column(db.String(20))        # None | titular | suplente
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', foreign_keys=[user_id])

    @property
    def full_name(self):
        return ' '.join(p for p in [self.first_name, self.last_name] if p)

    def to_dict(self):
        d = self._columns_dict()
        d['full_name'] = self.full_name
        d['has_access'] = bool(self.user_id)
        d['user_email'] = self.user.email if self.user else None
        return d


class AuthorizationTemplate(_FichaDictMixin, db.Model):
    """Plantilla de autorización/permiso definida por el colegio."""
    __tablename__ = 'authorization_templates'
    id = db.Column(db.Integer, primary_key=True)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=False, index=True)
    title = db.Column(db.String(300), nullable=False)
    description = db.Column(db.Text)
    is_active = db.Column(db.Boolean, default=True)
    order = db.Column(db.Integer, default=0)
    key = db.Column(db.String(50), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return self._columns_dict()


class StudentAuthorization(_FichaDictMixin, db.Model):
    """Autorización/permiso firmado (o pendiente) para un alumno."""
    __tablename__ = 'student_authorizations'
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    template_id = db.Column(db.Integer, db.ForeignKey('authorization_templates.id'), nullable=True)
    title = db.Column(db.String(300), nullable=False)
    description = db.Column(db.Text)
    status = db.Column(db.String(20), default='pendiente')   # pendiente | autorizado | rechazado
    signed_by_member_id = db.Column(db.Integer, db.ForeignKey('student_family_members.id', ondelete='SET NULL'), nullable=True)
    signed_by_name = db.Column(db.String(200))
    signed_by_rut = db.Column(db.String(20))
    signed_at = db.Column(db.Date)
    signature_image = db.Column(db.Text)                     # data URL base64
    notes = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    template = db.relationship('AuthorizationTemplate', foreign_keys=[template_id])

    def to_dict(self):
        d = self._columns_dict()
        d['has_signature'] = bool(self.signature_image)
        d['template_key'] = self.template.key if self.template else None
        return d


class StudentDocument(_FichaDictMixin, db.Model):
    """Archivo adjunto a la ficha del alumno (contenido en BD: disco efímero en Railway)."""
    __tablename__ = 'student_documents'
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    filename = db.Column(db.String(300), nullable=False)
    title = db.Column(db.String(300))
    category = db.Column(db.String(100), default='Otro')
    description = db.Column(db.Text)
    mime_type = db.Column(db.String(150))
    size_bytes = db.Column(db.Integer)
    content = db.Column(db.LargeBinary)
    uploaded_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    uploader = db.relationship('User', foreign_keys=[uploaded_by])
    _exclude_from_dict = ('content',)

    def to_dict(self):
        d = self._columns_dict()
        d['uploaded_by_name'] = f"{self.uploader.first_name} {self.uploader.last_name}" if self.uploader else None
        return d


DEFAULT_AUTHORIZATION_TEMPLATES = [
    ('fotos', 'Autorizo a mi hijo(a) a ser fotografiado(a) y que estas fotografías puedan ser compartidas en la página web de la escuela y en las redes sociales institucionales'),
    ('actividades', 'Autorizo a mi hijo(a) a participar en actividades extraprogramáticas y salidas pedagógicas'),
    ('redes_sociales', 'Autorizo publicación en Facebook / redes sociales del establecimiento'),
    ('religion', 'Autorizo a mi hijo(a) a participar en clases de religión'),
    ('reglamento', 'Tomo conocimiento y acepto íntegramente las disposiciones internas, Reglamentos y Protocolos, incluido Seguro Escolar y Uniforme'),
    ('uniforme', 'Acepto que en este establecimiento se utiliza uniforme escolar'),
    ('carta_compromiso', 'Carta de Compromiso'),
    ('traslado_jornada', 'Tomo conocimiento que, por el bienestar del alumno(a) y/o situaciones de Convivencia Escolar, se puede proceder al traslado del o la Estudiante al curso de la jornada alterna'),
]


def ensure_authorization_templates(school_id):
    """Crea (idempotente, por `key`) las plantillas de autorización por defecto del colegio.
    No hace commit: el llamador decide. Devuelve la cantidad creada."""
    if not school_id:
        return 0
    existing = {t.key for t in AuthorizationTemplate.query.filter_by(school_id=school_id).all() if t.key}
    created = 0
    for i, (key, title) in enumerate(DEFAULT_AUTHORIZATION_TEMPLATES):
        if key in existing:
            continue
        db.session.add(AuthorizationTemplate(school_id=school_id, key=key, title=title,
                                             description=None, is_active=True, order=i + 1))
        created += 1
    if created:
        db.session.flush()
    return created
