"""
Ficha completa del alumno: datos personales, antecedentes médicos, familia/apoderados,
autorizaciones (con foto de firma) y documentos adjuntos.

Permisos:
  - VER: admin, directivo, profesor (cualquier alumno del colegio); apoderado → solo sus
    alumnos vinculados; alumno → solo él mismo.
  - EDITAR (POST/PUT/DELETE, importación, plantillas): solo FICHA_EDIT_ROLES.
"""
import json
import mimetypes
import os
from datetime import date, datetime
from urllib.parse import quote

from flask import Blueprint, request, jsonify, Response
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from models import (db, User, Enrollment, Grade, StudentGuardian,
                    StudentProfile, StudentMedical, StudentFamilyMember,
                    AuthorizationTemplate, StudentAuthorization, StudentDocument,
                    ensure_authorization_templates, log_student_event)
from routes.access import current_claims, can_view_student, only_published

students_bp = Blueprint('students', __name__)

FICHA_EDIT_ROLES = ('admin', 'directivo')
FICHA_VIEW_ROLES = ('admin', 'directivo', 'profesor', 'apoderado', 'alumno')

AUTH_STATUSES = ('pendiente', 'autorizado', 'rechazado')
GUARDIAN_ROLES = ('titular', 'suplente')
DOCUMENT_CATEGORIES = (
    'Certificado de nacimiento', 'Informe de notas', 'Informe médico', 'Informe psicológico/PIE',
    'Certificado de alumno regular', 'Documento de identidad', 'Autorización firmada', 'Otro',
)
ALLOWED_DOC_EXTENSIONS = {'pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'doc', 'docx',
                          'xls', 'xlsx', 'txt', 'heic'}
MAX_DOC_BYTES = 10 * 1024 * 1024
MAX_SIGNATURE_CHARS = int(1.5 * 1024 * 1024)
DEFAULT_GUARDIAN_PASSWORD = 'Apoderado2026!'

USER_EDITABLE = ('first_name', 'last_name', 'rut', 'birth_date', 'gender', 'address', 'phone', 'email')
PROFILE_READONLY = ('id', 'student_id', 'created_at', 'updated_at')
MEDICAL_READONLY = ('id', 'student_id', 'created_at', 'updated_at')
FAMILY_READONLY = ('id', 'student_id', 'user_id', 'created_at', 'updated_at')


class FichaError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


@students_bp.errorhandler(FichaError)
def _handle_ficha_error(err):
    db.session.rollback()
    return jsonify({'error': err.message}), err.status


@students_bp.errorhandler(413)
def _handle_too_large(_err):
    return jsonify({'error': 'El archivo excede el tamaño máximo permitido'}), 413


# ── Helpers genéricos ───────────────────────────────────────────────────────

def _column(model, field):
    return model.__table__.columns.get(field)


def parse_date(value, field='fecha'):
    if value in (None, ''):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    s = str(value).strip()
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        for fmt in ('%d-%m-%Y', '%d/%m/%Y'):
            try:
                return datetime.strptime(s[:10], fmt).date()
            except ValueError:
                pass
    raise FichaError(f'Fecha inválida en {field}: {value}')


TRUE_VALUES = {'si', 'sí', '1', 'true', 'yes', 's', 'x'}
FALSE_VALUES = {'no', '0', 'false', 'n'}


def parse_bool(value):
    if value is None or value == '':
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    s = str(value).strip().lower()
    if s in TRUE_VALUES:
        return True
    if s in FALSE_VALUES:
        return False
    return None


def coerce(model, field, value):
    """Convierte un valor al tipo de la columna y trunca strings a su largo."""
    col = _column(model, field)
    if col is None or value is None:
        return value
    t = col.type
    if isinstance(t, db.Boolean):
        if isinstance(value, str) and value.strip() == '':
            return None
        b = parse_bool(value)
        if b is None:
            raise FichaError(f'Valor inválido en {field}')
        return b
    if isinstance(t, db.Date):
        return parse_date(value, field)
    if isinstance(t, db.Integer):
        if isinstance(value, str) and value.strip() == '':
            return None
        try:
            return int(float(value))
        except (TypeError, ValueError):
            raise FichaError(f'Número inválido en {field}')
    if isinstance(t, db.Float):
        if isinstance(value, str) and value.strip() == '':
            return None
        try:
            return float(str(value).replace(',', '.'))
        except (TypeError, ValueError):
            raise FichaError(f'Número inválido en {field}')
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=False)
    value = str(value)
    length = getattr(t, 'length', None)
    if length and len(value) > length:
        value = value[:length]
    return value


def _apply(obj, data, allowed):
    for field in allowed:
        if field in data:
            setattr(obj, field, coerce(type(obj), field, data[field]))


def _editable_fields(model, readonly):
    return [c.key for c in model.__table__.columns
            if c.key not in readonly and not isinstance(c.type, db.LargeBinary)]


def normalize_rut(value):
    """'123456789' / '12.345.678-9' / '12345678-k' → '12.345.678-9' (DV en mayúscula)."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    s = str(value).strip().upper().replace('.', '').replace(' ', '').replace('‐', '-')
    if not s or s in ('FALSE', 'NONE'):
        return None
    if '-' in s:
        body, dv = s.rsplit('-', 1)
    else:
        body, dv = s[:-1], s[-1:]
    if not body.isdigit() or len(dv) != 1 or not (dv.isdigit() or dv == 'K'):
        return None
    return f'{int(body):,}'.replace(',', '.') + f'-{dv}'


def rut_is_valid(rut):
    n = normalize_rut(rut)
    if not n:
        return False
    body, dv = n.replace('.', '').split('-')
    total, factor = 0, 2
    for ch in reversed(body):
        total += int(ch) * factor
        factor = 2 if factor == 7 else factor + 1
    r = 11 - (total % 11)
    expected = '0' if r == 11 else 'K' if r == 10 else str(r)
    return expected == dv


# ── Historial de cambios en la ficha ────────────────────────────────────────

FIELD_LABELS = {
    # Usuario
    'first_name': 'Nombres', 'last_name': 'Apellidos', 'rut': 'N° identificación',
    'birth_date': 'Fecha de nacimiento', 'gender': 'Sexo', 'address': 'Dirección',
    'phone': 'Teléfono', 'email': 'Correo',
    # Perfil
    'id_type': 'Tipo de identificación', 'matricula_number': 'N° de matrícula',
    'enrollment_date': 'Fecha de matrícula', 'list_order': 'N° de lista',
    'social_name': 'Nombre social', 'gender_identity': 'Identidad de género',
    'gender_other': 'Identidad de género (otra)', 'nationality': 'Nacionalidad',
    'region': 'Región', 'comuna': 'Comuna', 'city': 'Ciudad',
    'previous_school': 'Colegio de procedencia', 'repeated_courses': 'Cursos repetidos',
    'admission_type': 'Tipo de admisión', 'status': 'Estado',
    'withdrawal_date': 'Fecha de retiro', 'withdrawal_reason': 'Motivo de retiro',
    'course_change': 'Cambio de curso', 'ethnicity': 'Etnia', 'religion': 'Religión',
    'baptized': 'Bautizado', 'lives_with': 'Vive con', 'household_size': 'N° de personas en el hogar',
    'siblings_count': 'N° de hermanos', 'siblings_in_school': 'Hermanos en el colegio',
    'has_sibling_in_school': 'Tiene hermanos en el colegio', 'staff_child': 'Hijo de funcionario',
    'pie': 'PIE', 'pie_type': 'Tipo de PIE', 'pie_diagnosis': 'Diagnóstico PIE', 'nee': 'NEE',
    'priority_status': 'Prioridad', 'sige_data': 'Datos SIGE', 'lunch_benefit': 'Beneficio de alimentación',
    'pickup_with': 'Retiro con', 'judicial_restriction': 'Prohibición judicial',
    'judicial_restriction_detail': 'Detalle prohibición judicial',
    'has_commitment_letter': 'Carta de compromiso',
    'emergency_contact_name': 'Contacto de emergencia', 'emergency_phone': 'Teléfono de emergencia 1',
    'emergency_phone_2': 'Teléfono de emergencia 2', 'emergency_email': 'Correo de emergencia',
    'interests': 'Intereses', 'observations': 'Observaciones', 'extra': 'Otros datos',
    # Salud
    'contraindications': 'Contraindicaciones', 'allergies': 'Alergias',
    'chronic_diseases': 'Enfermedades crónicas', 'special_care': 'Cuidados especiales',
    'medications': 'Medicamentos', 'problem_visual': 'Problemas visuales',
    'problem_auditory': 'Problemas auditivos', 'problem_cardiac': 'Problemas cardíacos',
    'problem_spine': 'Problemas de columna', 'other_problems': 'Otros problemas',
    'blood_type': 'Grupo sanguíneo', 'health_provider': 'Previsión de salud',
    'health_insurance': 'Seguro de salud', 'height_cm': 'Estatura (cm)', 'weight_kg': 'Peso (kg)',
    'waist_cm': 'Cintura (cm)', 'clothing_size': 'Talla', 'specialists': 'Especialistas',
    'covid_vaccination': 'Vacunación COVID', 'notes': 'Notas',
    # Familia
    'relationship': 'Parentesco', 'relationship_other': 'Parentesco (otro)', 'sex': 'Sexo',
    'marital_status': 'Estado civil', 'work_phone': 'Teléfono laboral',
    'education_level': 'Estudios', 'profession': 'Profesión', 'occupation': 'Ocupación',
    'workplace': 'Lugar de trabajo', 'is_household_head': 'Jefe de hogar',
    'lives_with_student': 'Vive con el alumno', 'can_pickup': 'Puede retirar',
    'is_economic_tutor': 'Tutor económico', 'is_emergency_contact': 'Contacto de emergencia',
    'guardian_role': 'Rol de apoderado',
    # Autorizaciones / documentos
    'title': 'Título', 'description': 'Descripción', 'signed_by_name': 'Firmado por',
    'signed_by_rut': 'RUT de quien firma', 'signed_at': 'Fecha de firma',
    'signature_image': 'Firma', 'filename': 'Archivo', 'category': 'Categoría',
    'template_id': 'Plantilla', 'signed_by_member_id': 'Firmante',
}
_HISTORY_SKIP = {'id', 'student_id', 'created_at', 'updated_at', 'created_by', 'uploaded_by',
                 'user_id', 'content', 'mime_type', 'size_bytes', 'template_id',
                 'signed_by_member_id'}


def _fmt_value(field, v):
    if v is None or v == '':
        return None
    if field == 'signature_image':
        return 'Firma registrada'
    if isinstance(v, bool):
        return 'Sí' if v else 'No'
    if isinstance(v, datetime):
        return v.strftime('%d-%m-%Y %H:%M')
    if isinstance(v, date):
        return v.strftime('%d-%m-%Y')
    if field == 'extra':
        return 'Actualizado'
    v = str(v)
    return v if len(v) <= 300 else v[:297] + '…'


def _snapshot(obj, fields=None):
    """Valores actuales del objeto (sin binarios) para comparar después."""
    if obj is None:
        return {}
    if fields is None:
        fields = [c.key for c in obj.__table__.columns
                  if c.key not in _HISTORY_SKIP and not isinstance(c.type, db.LargeBinary)]
    return {f: getattr(obj, f, None) for f in fields}


def _diff(before, after, prefix=''):
    campos = []
    for f in after:
        a, b = before.get(f), after.get(f)
        if f == 'signature_image':
            if (a or None) != (b or None):
                campos.append({'campo': 'Firma', 'antes': None,
                               'despues': 'Firma actualizada' if b else 'Firma eliminada'})
            continue
        fa, fb = _fmt_value(f, a), _fmt_value(f, b)
        if f == 'extra':
            fa, fb = (a or None), (b or None)
            if fa == fb:
                continue
            campos.append({'campo': prefix + FIELD_LABELS['extra'], 'antes': None, 'despues': 'Actualizado'})
            continue
        if fa != fb:
            campos.append({'campo': prefix + FIELD_LABELS.get(f, f.replace('_', ' ').capitalize()),
                           'antes': fa, 'despues': fb})
    return campos


def log_ficha_change(me, sid, seccion, campos, description=None):
    """Registra 'ficha_editada' si hubo cambios. No hace commit."""
    if not campos and not description:
        return
    if not description:
        nombres = ', '.join(c['campo'] for c in campos[:6])
        if len(campos) > 6:
            nombres += f' y {len(campos) - 6} más'
        description = f'Ficha editada — {seccion}: {nombres}'
    log_student_event(sid, 'ficha_editada', description, me.get('school_id'),
                      details={'seccion': seccion, 'campos': campos or []},
                      user_id=me.get('user_id') or None)


# ── Carga del alumno + permisos ─────────────────────────────────────────────

def load_student(sid, edit=False):
    """Devuelve (claims, student). Lanza FichaError 404/403 según corresponda."""
    me = current_claims()
    student = None
    if me['school_id']:
        student = User.query.filter_by(id=sid, school_id=me['school_id'], role='alumno').first()
    if not student:
        raise FichaError('Alumno no encontrado', 404)
    if edit:
        if me['role'] not in FICHA_EDIT_ROLES:
            raise FichaError('Sin permisos para editar la ficha', 403)
    elif me['role'] not in FICHA_VIEW_ROLES or not can_view_student(me, sid):
        raise FichaError('Sin permisos', 403)
    return me, student


def _require_edit_role():
    me = current_claims()
    if me['role'] not in FICHA_EDIT_ROLES or not me['school_id']:
        raise FichaError('Sin permisos', 403)
    return me


def _member_or_404(sid, mid):
    m = StudentFamilyMember.query.filter_by(id=mid, student_id=sid).first()
    if not m:
        raise FichaError('Miembro de la familia no encontrado', 404)
    return m


def _json_body():
    data = request.get_json(silent=True)
    if data is None:
        data = {}
    if not isinstance(data, dict):
        raise FichaError('Cuerpo JSON inválido')
    return data


def _to_int(value, field):
    try:
        return int(value)
    except (TypeError, ValueError):
        raise FichaError(f'{field} inválido')


# ── Serialización de la ficha ───────────────────────────────────────────────

def _family(sid):
    return StudentFamilyMember.query.filter_by(student_id=sid) \
        .order_by(StudentFamilyMember.id).all()


def _member_summary(m):
    if not m:
        return None
    return {'member_id': m.id, 'name': m.full_name, 'rut': m.rut,
            'phone': m.phone, 'relationship': m.relationship}


def _age(birth):
    if not birth:
        return None
    today = date.today()
    return today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))


def _documents(sid):
    return StudentDocument.query.filter_by(student_id=sid) \
        .order_by(StudentDocument.created_at.desc(), StudentDocument.id.desc()).all()


def build_ficha(me, student):
    sid = student.id
    profile = StudentProfile.query.filter_by(student_id=sid).first()
    medical = StudentMedical.query.filter_by(student_id=sid).first()
    family = _family(sid)
    auths = StudentAuthorization.query.filter_by(student_id=sid).order_by(StudentAuthorization.id).all()

    enrollment = Enrollment.query.filter_by(student_id=sid, is_active=True) \
        .order_by(Enrollment.enrolled_at.desc(), Enrollment.id.desc()).first()
    course = enrollment.course if enrollment else None

    q = db.session.query(func.avg(Grade.value)).filter(Grade.student_id == sid)
    if only_published(me):
        q = q.filter(Grade.is_published == True)  # noqa: E712
    avg = q.scalar()

    titular = next((m for m in family if m.guardian_role == 'titular'), None)
    suplente = next((m for m in family if m.guardian_role == 'suplente'), None)

    profile_d = profile.to_dict() if profile else StudentProfile.empty_dict(student_id=sid)
    return {
        'student': student.to_dict(),
        'profile': profile_d,
        'medical': medical.to_dict() if medical else StudentMedical.empty_dict(student_id=sid),
        'family': [m.to_dict() for m in family],
        'authorizations': [a.to_dict() for a in auths],
        'documents': [d.to_dict() for d in _documents(sid)],
        'summary': {
            'course_id': course.id if course else None,
            'course_name': course.name if course else None,
            'age': _age(student.birth_date),
            'status': profile_d.get('status') or 'matriculado',
            'average': round(float(avg), 1) if avg is not None else None,
            'guardian': _member_summary(titular),
            'substitute': _member_summary(suplente),
        },
        'permissions': {'can_edit': me['role'] in FICHA_EDIT_ROLES},
    }


# ── Ficha / perfil / médico ─────────────────────────────────────────────────

@students_bp.route('/<int:sid>/ficha', methods=['GET'])
@jwt_required()
def get_ficha(sid):
    me, student = load_student(sid)
    return jsonify(build_ficha(me, student)), 200


def get_or_create_profile(sid):
    p = StudentProfile.query.filter_by(student_id=sid).first()
    if not p:
        p = StudentProfile(student_id=sid)
        db.session.add(p)
    return p


def get_or_create_medical(sid):
    m = StudentMedical.query.filter_by(student_id=sid).first()
    if not m:
        m = StudentMedical(student_id=sid, problem_visual=False, problem_auditory=False,
                           problem_cardiac=False, problem_spine=False)
        db.session.add(m)
    return m


def _apply_user_fields(student, udata):
    for field in USER_EDITABLE:
        if field not in udata:
            continue
        val = udata[field]
        if field == 'birth_date':
            student.birth_date = parse_date(val, 'fecha de nacimiento')
        elif field in ('first_name', 'last_name'):
            if not val or not str(val).strip():
                raise FichaError('Nombres y apellidos son obligatorios')
            setattr(student, field, coerce(User, field, str(val).strip()))
        elif field == 'email':
            email = (val or '').strip().lower()
            if not email:
                raise FichaError('El email no puede quedar vacío')
            other = User.query.filter(func.lower(User.email) == email, User.id != student.id).first()
            if other:
                raise FichaError('El email ya está registrado por otro usuario')
            student.email = coerce(User, 'email', email)
        else:
            if isinstance(val, str):
                val = val.strip()
            if field == 'rut' and val:
                val = normalize_rut(val) or val
            setattr(student, field, coerce(User, field, val if val != '' else None))


@students_bp.route('/<int:sid>/profile', methods=['PUT'])
@jwt_required()
def update_profile(sid):
    me, student = load_student(sid, edit=True)
    data = _json_body()
    udata = data.get('user') or {}
    pdata = data.get('profile') or {}
    if not isinstance(udata, dict) or not isinstance(pdata, dict):
        raise FichaError('Formato inválido: se espera {"user": {...}, "profile": {...}}')
    u_before = _snapshot(student, USER_EDITABLE)
    existing_profile = StudentProfile.query.filter_by(student_id=sid).first()
    p_before = _snapshot(existing_profile)
    _apply_user_fields(student, udata)
    profile = None
    if pdata:
        profile = get_or_create_profile(sid)
        fields = [f for f in _editable_fields(StudentProfile, PROFILE_READONLY) if f != 'extra']
        _apply(profile, pdata, fields)
        if 'extra' in pdata:
            extra = pdata['extra']
            if extra is not None and not isinstance(extra, dict):
                raise FichaError('extra debe ser un objeto')
            profile.extra = json.dumps(extra, ensure_ascii=False) if extra else None
    campos = _diff(u_before, _snapshot(student, USER_EDITABLE))
    if profile is not None:
        campos += _diff(p_before, _snapshot(profile))
    log_ficha_change(me, sid, 'Datos del alumno', campos)
    db.session.commit()
    return jsonify(build_ficha(me, student)), 200


@students_bp.route('/<int:sid>/medical', methods=['PUT'])
@jwt_required()
def update_medical(sid):
    me, _student = load_student(sid, edit=True)
    data = _json_body()
    before = _snapshot(StudentMedical.query.filter_by(student_id=sid).first())
    medical = get_or_create_medical(sid)
    if not before:
        before = {k: (False if k.startswith('problem_') else None) for k in _snapshot(medical)}
    _apply(medical, data, _editable_fields(StudentMedical, MEDICAL_READONLY))
    for f in ('problem_visual', 'problem_auditory', 'problem_cardiac', 'problem_spine'):
        if getattr(medical, f) is None:
            setattr(medical, f, False)
    log_ficha_change(me, sid, 'Salud', _diff(before, _snapshot(medical)))
    db.session.commit()
    return jsonify(medical.to_dict()), 200


# ── Familia ────────────────────────────────────────────────────────────────

def set_guardian_role(sid, member, role):
    """Asigna titular/suplente a `member` quitándoselo a quien lo tuviera (máx 1 c/u)."""
    if role not in (None,) + GUARDIAN_ROLES:
        raise FichaError('guardian_role inválido (titular | suplente | null)')
    if role:
        for other in StudentFamilyMember.query.filter_by(student_id=sid, guardian_role=role).all():
            if other is not member:
                other.guardian_role = None
    member.guardian_role = role


def _apply_member(member, data):
    fields = [f for f in _editable_fields(StudentFamilyMember, FAMILY_READONLY) if f != 'guardian_role']
    data = dict(data)
    if data.get('rut'):
        data['rut'] = normalize_rut(data['rut']) or str(data['rut']).strip()
    if data.get('email'):
        data['email'] = str(data['email']).strip().lower()
    if isinstance(data.get('first_name'), str):
        data['first_name'] = data['first_name'].strip()
    _apply(member, data, fields)
    if not member.first_name or not str(member.first_name).strip():
        raise FichaError('El nombre del miembro de la familia es obligatorio')


@students_bp.route('/<int:sid>/family', methods=['GET'])
@jwt_required()
def list_family(sid):
    load_student(sid)
    return jsonify([m.to_dict() for m in _family(sid)]), 200


@students_bp.route('/<int:sid>/family', methods=['POST'])
@jwt_required()
def create_family_member(sid):
    me, _student = load_student(sid, edit=True)
    data = _json_body()
    if not data.get('first_name') or not str(data.get('first_name')).strip():
        raise FichaError('El nombre (first_name) es obligatorio')
    member = StudentFamilyMember(student_id=sid, id_type='RUN')
    _apply_member(member, data)
    db.session.add(member)
    db.session.flush()
    if 'guardian_role' in data:
        set_guardian_role(sid, member, data.get('guardian_role') or None)
    campos = [c for c in _diff({}, _snapshot(member)) if c['despues'] is not None]
    log_ficha_change(me, sid, 'Familia', campos,
                     f'Familiar agregado: {member.full_name} ({member.relationship or "sin parentesco"})')
    db.session.commit()
    return jsonify(member.to_dict()), 201


@students_bp.route('/<int:sid>/family/<int:mid>', methods=['PUT'])
@jwt_required()
def update_family_member(sid, mid):
    me, _student = load_student(sid, edit=True)
    member = _member_or_404(sid, mid)
    before = _snapshot(member)
    data = _json_body()
    _apply_member(member, data)
    if 'guardian_role' in data:
        set_guardian_role(sid, member, data.get('guardian_role') or None)
    campos = _diff(before, _snapshot(member), prefix=f'{member.full_name} · ')
    log_ficha_change(me, sid, 'Familia', campos)
    db.session.commit()
    return jsonify(member.to_dict()), 200


@students_bp.route('/<int:sid>/family/<int:mid>', methods=['DELETE'])
@jwt_required()
def delete_family_member(sid, mid):
    me, _student = load_student(sid, edit=True)
    member = _member_or_404(sid, mid)
    log_ficha_change(me, sid, 'Familia', [],
                     f'Familiar eliminado: {member.full_name} ({member.relationship or "sin parentesco"})')
    StudentAuthorization.query.filter_by(signed_by_member_id=member.id) \
        .update({'signed_by_member_id': None}, synchronize_session=False)
    db.session.delete(member)
    db.session.commit()
    return jsonify({'message': 'Miembro eliminado'}), 200


@students_bp.route('/<int:sid>/guardians', methods=['PUT'])
@jwt_required()
def set_guardians(sid):
    me, _student = load_student(sid, edit=True)
    data = _json_body()
    t_id = data.get('titular_member_id')
    s_id = data.get('suplente_member_id')
    t_id = _to_int(t_id, 'titular_member_id') if t_id not in (None, '') else None
    s_id = _to_int(s_id, 'suplente_member_id') if s_id not in (None, '') else None
    if t_id and s_id and t_id == s_id:
        raise FichaError('El apoderado titular y el suplente deben ser personas distintas')
    family = _family(sid)
    by_id = {m.id: m for m in family}
    roles_before = {r: next((m.full_name for m in family if m.guardian_role == r), None)
                    for r in GUARDIAN_ROLES}
    for mid in (t_id, s_id):
        if mid and mid not in by_id:
            raise FichaError('El miembro indicado no pertenece a la familia del alumno')
    for key, role, mid in (('titular_member_id', 'titular', t_id), ('suplente_member_id', 'suplente', s_id)):
        if key not in data:
            continue
        for m in family:
            if m.guardian_role == role:
                m.guardian_role = None
        if mid:
            by_id[mid].guardian_role = role
    labels = {'titular': 'Apoderado titular', 'suplente': 'Apoderado suplente'}
    campos = []
    for r in GUARDIAN_ROLES:
        after = next((m.full_name for m in family if m.guardian_role == r), None)
        if after != roles_before[r]:
            campos.append({'campo': labels[r], 'antes': roles_before[r], 'despues': after})
    log_ficha_change(me, sid, 'Apoderados', campos)
    db.session.commit()
    return jsonify([m.to_dict() for m in _family(sid)]), 200


def grant_guardian_access(member, student, school_id, password=None):
    """Crea o vincula la cuenta de apoderado del miembro. Devuelve (user, created).
    No hace commit."""
    email = (member.email or '').strip().lower()
    if not email:
        raise FichaError('El miembro no tiene email registrado')
    user = User.query.filter(func.lower(User.email) == email).first()
    created = False
    if user:
        if user.role != 'apoderado' or user.school_id != school_id:
            raise FichaError('El email ya pertenece a otro usuario que no es apoderado de este colegio')
    else:
        user = User(school_id=school_id, email=coerce(User, 'email', email),
                    first_name=coerce(User, 'first_name', member.first_name or 'Apoderado'),
                    last_name=coerce(User, 'last_name', member.last_name or ''),
                    rut=member.rut, phone=coerce(User, 'phone', member.phone),
                    address=coerce(User, 'address', member.address),
                    role='apoderado', is_active=True)
        user.set_password(password or DEFAULT_GUARDIAN_PASSWORD)
        db.session.add(user)
        db.session.flush()
        created = True
    if not StudentGuardian.query.filter_by(student_id=student.id, guardian_id=user.id).first():
        db.session.add(StudentGuardian(student_id=student.id, guardian_id=user.id,
                                       relationship=member.relationship))
    member.user_id = user.id
    member.user = user
    return user, created


@students_bp.route('/<int:sid>/family/<int:mid>/access', methods=['POST'])
@jwt_required()
def create_member_access(sid, mid):
    me, student = load_student(sid, edit=True)
    member = _member_or_404(sid, mid)
    data = _json_body()
    user, created = grant_guardian_access(member, student, me['school_id'], data.get('password'))
    db.session.commit()
    return jsonify({'member': member.to_dict(), 'user': user.to_dict(), 'created': created}), 200


# ── Plantillas de autorización ─────────────────────────────────────────────

TEMPLATE_FIELDS = ('title', 'description', 'is_active', 'order', 'key')


@students_bp.route('/authorization-templates', methods=['GET'])
@jwt_required()
def list_templates():
    me = current_claims()
    if not me['school_id']:
        raise FichaError('Sin permisos', 403)
    if ensure_authorization_templates(me['school_id']):
        db.session.commit()
    q = AuthorizationTemplate.query.filter_by(school_id=me['school_id'])
    include_inactive = request.args.get('all') in ('1', 'true') and me['role'] in FICHA_EDIT_ROLES
    if not include_inactive:
        q = q.filter(AuthorizationTemplate.is_active == True)  # noqa: E712
    rows = q.order_by(AuthorizationTemplate.order, AuthorizationTemplate.id).all()
    return jsonify([t.to_dict() for t in rows]), 200


@students_bp.route('/authorization-templates', methods=['POST'])
@jwt_required()
def create_template():
    me = _require_edit_role()
    data = _json_body()
    if not data.get('title') or not str(data['title']).strip():
        raise FichaError('El título es obligatorio')
    t = AuthorizationTemplate(school_id=me['school_id'], is_active=True)
    _apply(t, data, TEMPLATE_FIELDS)
    t.title = t.title.strip()
    if t.order is None:
        max_order = db.session.query(func.max(AuthorizationTemplate.order)) \
            .filter(AuthorizationTemplate.school_id == me['school_id']).scalar() or 0
        t.order = max_order + 1
    if t.is_active is None:
        t.is_active = True
    db.session.add(t)
    db.session.commit()
    return jsonify(t.to_dict()), 201


def _template_or_404(me, tid):
    t = AuthorizationTemplate.query.filter_by(id=tid, school_id=me['school_id']).first()
    if not t:
        raise FichaError('Plantilla no encontrada', 404)
    return t


@students_bp.route('/authorization-templates/<int:tid>', methods=['PUT'])
@jwt_required()
def update_template(tid):
    me = _require_edit_role()
    t = _template_or_404(me, tid)
    data = _json_body()
    if 'title' in data and (not data['title'] or not str(data['title']).strip()):
        raise FichaError('El título es obligatorio')
    _apply(t, data, TEMPLATE_FIELDS)
    db.session.commit()
    return jsonify(t.to_dict()), 200


@students_bp.route('/authorization-templates/<int:tid>', methods=['DELETE'])
@jwt_required()
def delete_template(tid):
    me = _require_edit_role()
    t = _template_or_404(me, tid)
    if t.key:
        # Plantilla base (usada por la importación): se desactiva para que el seed no la recree.
        t.is_active = False
        db.session.commit()
        return jsonify({'message': 'Plantilla desactivada', 'deactivated': True}), 200
    StudentAuthorization.query.filter_by(template_id=t.id) \
        .update({'template_id': None}, synchronize_session=False)
    db.session.delete(t)
    db.session.commit()
    return jsonify({'message': 'Plantilla eliminada', 'deactivated': False}), 200


# ── Autorizaciones del alumno ──────────────────────────────────────────────

def _validate_signature(value):
    if value is None or value == '':
        return None
    if not isinstance(value, str) or not value.startswith('data:image/'):
        raise FichaError('La firma debe ser una imagen (data URL data:image/...)')
    if len(value) > MAX_SIGNATURE_CHARS:
        raise FichaError('La imagen de la firma es demasiado grande (máx 1,5 MB)')
    return value


def _apply_authorization(sid, a, data, me):
    if 'template_id' in data:
        tid = data.get('template_id')
        if tid:
            t = _template_or_404(me, _to_int(tid, 'template_id'))
            a.template_id = t.id
            if not data.get('title'):
                a.title = t.title
            if 'description' not in data:
                a.description = t.description
        else:
            a.template_id = None
    if data.get('title') is not None:
        if not str(data['title']).strip():
            raise FichaError('El título es obligatorio')
        a.title = coerce(StudentAuthorization, 'title', str(data['title']).strip())
    if 'description' in data:
        a.description = data.get('description')
    if 'status' in data:
        status = data.get('status') or 'pendiente'
        if status not in AUTH_STATUSES:
            raise FichaError('Estado inválido (pendiente | autorizado | rechazado)')
        a.status = status
    if 'signed_by_member_id' in data:
        mid = data.get('signed_by_member_id')
        if mid:
            member = StudentFamilyMember.query.filter_by(
                id=_to_int(mid, 'signed_by_member_id'), student_id=sid).first()
            if not member:
                raise FichaError('El firmante no pertenece a la familia del alumno')
            a.signed_by_member_id = member.id
            if not data.get('signed_by_name'):
                a.signed_by_name = coerce(StudentAuthorization, 'signed_by_name', member.full_name)
            if not data.get('signed_by_rut'):
                a.signed_by_rut = member.rut
        else:
            a.signed_by_member_id = None
    if 'signed_by_name' in data and data.get('signed_by_name') is not None:
        a.signed_by_name = coerce(StudentAuthorization, 'signed_by_name',
                                  str(data['signed_by_name']).strip()) or None
    if 'signed_by_rut' in data and data.get('signed_by_rut') is not None:
        r = str(data['signed_by_rut']).strip()
        a.signed_by_rut = (normalize_rut(r) or coerce(StudentAuthorization, 'signed_by_rut', r)) if r else None
    if 'signed_at' in data:
        a.signed_at = parse_date(data.get('signed_at'), 'fecha de firma')
    if 'signature_image' in data:
        a.signature_image = _validate_signature(data.get('signature_image'))
    if 'notes' in data:
        a.notes = data.get('notes')


@students_bp.route('/<int:sid>/authorizations', methods=['GET'])
@jwt_required()
def list_authorizations(sid):
    load_student(sid)
    rows = StudentAuthorization.query.filter_by(student_id=sid).order_by(StudentAuthorization.id).all()
    return jsonify([a.to_dict() for a in rows]), 200


@students_bp.route('/<int:sid>/authorizations', methods=['POST'])
@jwt_required()
def create_authorization(sid):
    me, _student = load_student(sid, edit=True)
    data = _json_body()
    a = StudentAuthorization(student_id=sid, status='pendiente', created_by=me['user_id'] or None)
    _apply_authorization(sid, a, data, me)
    if not a.title:
        raise FichaError('Debe indicar una plantilla (template_id) o un título')
    db.session.add(a)
    campos = [c for c in _diff({}, _snapshot(a)) if c['despues'] is not None]
    log_ficha_change(me, sid, 'Autorizaciones', campos,
                     f'Autorización agregada: {a.title} ({a.status or "pendiente"})')
    db.session.commit()
    return jsonify(a.to_dict()), 201


def _authorization_or_404(sid, aid):
    a = StudentAuthorization.query.filter_by(id=aid, student_id=sid).first()
    if not a:
        raise FichaError('Autorización no encontrada', 404)
    return a


@students_bp.route('/<int:sid>/authorizations/<int:aid>', methods=['PUT'])
@jwt_required()
def update_authorization(sid, aid):
    me, _student = load_student(sid, edit=True)
    a = _authorization_or_404(sid, aid)
    before = _snapshot(a)
    _apply_authorization(sid, a, _json_body(), me)
    if not a.title:
        raise FichaError('El título es obligatorio')
    campos = _diff(before, _snapshot(a))
    if campos:
        log_ficha_change(me, sid, 'Autorizaciones', campos,
                         f'Autorización editada: {a.title} — ' + ', '.join(c['campo'] for c in campos))
    db.session.commit()
    return jsonify(a.to_dict()), 200


@students_bp.route('/<int:sid>/authorizations/<int:aid>', methods=['DELETE'])
@jwt_required()
def delete_authorization(sid, aid):
    me, _student = load_student(sid, edit=True)
    a = _authorization_or_404(sid, aid)
    log_ficha_change(me, sid, 'Autorizaciones', [], f'Autorización eliminada: {a.title}')
    db.session.delete(a)
    db.session.commit()
    return jsonify({'message': 'Autorización eliminada'}), 200


# ── Documentos ─────────────────────────────────────────────────────────────

def _read_upload(fs):
    filename = os.path.basename((fs.filename or '').replace('\\', '/')).strip()
    if not filename:
        raise FichaError('Debe adjuntar un archivo')
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if ext not in ALLOWED_DOC_EXTENSIONS:
        raise FichaError('Tipo de archivo no permitido. Formatos: ' + ', '.join(sorted(ALLOWED_DOC_EXTENSIONS)))
    content = fs.read(MAX_DOC_BYTES + 1)
    if len(content) > MAX_DOC_BYTES:
        raise FichaError('El archivo excede el máximo de 10 MB', 413)
    if not content:
        raise FichaError('El archivo está vacío')
    mime = fs.mimetype if fs.mimetype and fs.mimetype != 'application/octet-stream' else None
    mime = mime or mimetypes.guess_type(filename)[0] or 'application/octet-stream'
    return filename, content, mime


def _category(value):
    if value in (None, ''):
        return 'Otro'
    if value not in DOCUMENT_CATEGORIES:
        raise FichaError('Categoría de documento inválida')
    return value


def _document_or_404(sid, did):
    d = StudentDocument.query.filter_by(id=did, student_id=sid).first()
    if not d:
        raise FichaError('Documento no encontrado', 404)
    return d


@students_bp.route('/<int:sid>/documents', methods=['GET'])
@jwt_required()
def list_documents(sid):
    load_student(sid)
    return jsonify([d.to_dict() for d in _documents(sid)]), 200


@students_bp.route('/<int:sid>/documents', methods=['POST'])
@jwt_required()
def upload_document(sid):
    me, _student = load_student(sid, edit=True)
    fs = request.files.get('file')
    if not fs:
        raise FichaError('Debe adjuntar un archivo (campo "file")')
    filename, content, mime = _read_upload(fs)
    title = (request.form.get('title') or '').strip() or filename
    doc = StudentDocument(
        student_id=sid, filename=coerce(StudentDocument, 'filename', filename),
        title=coerce(StudentDocument, 'title', title),
        category=_category(request.form.get('category')),
        description=request.form.get('description') or None,
        mime_type=coerce(StudentDocument, 'mime_type', mime), size_bytes=len(content),
        content=content, uploaded_by=me['user_id'] or None)
    db.session.add(doc)
    log_ficha_change(me, sid, 'Documentos', [{'campo': 'Documento', 'antes': None, 'despues': doc.title}],
                     f'Documento subido: {doc.title} ({doc.category})')
    db.session.commit()
    return jsonify(doc.to_dict()), 201


@students_bp.route('/<int:sid>/documents/<int:did>', methods=['PUT'])
@jwt_required()
def update_document(sid, did):
    me, _student = load_student(sid, edit=True)
    doc = _document_or_404(sid, did)
    before = _snapshot(doc, ('filename', 'title', 'category', 'description'))
    if request.mimetype and request.mimetype.startswith('multipart/'):
        data = request.form.to_dict()
        fs = request.files.get('file')
    else:
        data = _json_body()
        fs = None
    if fs and fs.filename:
        old_filename = doc.filename
        filename, content, mime = _read_upload(fs)
        doc.filename = coerce(StudentDocument, 'filename', filename)
        doc.content = content
        doc.mime_type = coerce(StudentDocument, 'mime_type', mime)
        doc.size_bytes = len(content)
        doc.uploaded_by = me['user_id'] or None
        if not data.get('title') and (not doc.title or doc.title == old_filename):
            doc.title = doc.filename
    if 'title' in data:
        doc.title = coerce(StudentDocument, 'title', (data.get('title') or '').strip() or doc.filename)
    if 'category' in data:
        doc.category = _category(data.get('category'))
    if 'description' in data:
        doc.description = data.get('description') or None
    doc.updated_at = datetime.utcnow()
    campos = _diff(before, _snapshot(doc, ('filename', 'title', 'category', 'description')))
    if campos:
        log_ficha_change(me, sid, 'Documentos', campos,
                         f'Documento editado: {doc.title} — ' + ', '.join(c['campo'] for c in campos))
    db.session.commit()
    return jsonify(doc.to_dict()), 200


@students_bp.route('/<int:sid>/documents/<int:did>', methods=['DELETE'])
@jwt_required()
def delete_document(sid, did):
    me, _student = load_student(sid, edit=True)
    doc = _document_or_404(sid, did)
    log_ficha_change(me, sid, 'Documentos', [], f'Documento eliminado: {doc.title or doc.filename}')
    db.session.delete(doc)
    db.session.commit()
    return jsonify({'message': 'Documento eliminado'}), 200


@students_bp.route('/<int:sid>/documents/<int:did>/download', methods=['GET'])
@jwt_required()
def download_document(sid, did):
    load_student(sid)
    doc = _document_or_404(sid, did)
    disposition = 'inline' if request.args.get('inline') in ('1', 'true') else 'attachment'
    content = doc.content or b''
    return Response(content, mimetype=doc.mime_type or 'application/octet-stream', headers={
        'Content-Disposition': f"{disposition}; filename*=UTF-8''{quote(doc.filename or 'archivo')}",
        'Content-Length': str(len(content)),
        'Cache-Control': 'private, no-store',
    })


# ── Importación del Libro de Matrícula ─────────────────────────────────────

@students_bp.route('/import', methods=['POST'])
@jwt_required()
def import_matricula():
    me = _require_edit_role()
    from routes.student_import import run_import
    fs = request.files.get('file')
    if not fs or not fs.filename:
        raise FichaError('Debe adjuntar el archivo .xlsx (campo "file")')
    if not fs.filename.lower().endswith(('.xlsx', '.xlsm')):
        raise FichaError('El archivo debe ser .xlsx')
    dry_run = (request.form.get('dry_run') or 'true').strip().lower() != 'false'
    create_access = (request.form.get('create_guardian_access') or 'false').strip().lower() == 'true'
    course_id = request.form.get('course_id') or None
    year = request.form.get('year') or request.args.get('year')
    try:
        year = int(year) if year not in (None, '') else None
    except (TypeError, ValueError):
        raise FichaError('year inválido')
    result = run_import(fs.read(), me, course_id=course_id, dry_run=dry_run,
                        create_guardian_access=create_access, year=year)
    return jsonify(result), 200
