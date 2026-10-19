"""
Importador del "Libro de Matrícula" (.xlsx exportado por la plataforma de matrícula).

Las columnas se leen por ÍNDICE (0-based): el archivo trae nombres de columna repetidos
(id_comuna, id_etnia, lugar_de_trabajo, observaciones) y con entidades HTML.

Flujo en dos fases por fila, para no depender de SAVEPOINT (pysqlite / Postgres):
  1. parse_row(): conversión y validación pura en Python. Un error aquí descarta solo esa fila.
  2. apply_row(): escritura en la sesión. Todo el archivo va en una única transacción;
     dry_run hace rollback al final.
"""
import html
import json
import re
import unicodedata
from datetime import date, datetime
from io import BytesIO

from sqlalchemy import func

from models import (db, User, Course, Enrollment, StudentProfile, StudentMedical,
                    StudentFamilyMember, AuthorizationTemplate, StudentAuthorization,
                    ensure_authorization_templates)
from routes.students import (FichaError, coerce, parse_bool, parse_date, normalize_rut,
                             rut_is_valid, set_guardian_role, grant_guardian_access,
                             get_or_create_profile, get_or_create_medical)

STUDENT_DEFAULT_PASSWORD = 'Alumno2026!'

# ── Mapa de columnas (índice → campo) ───────────────────────────────────────
COL_RUT, COL_NOMBRE, COL_APELLIDOS, COL_CURSO = 5, 2, 3, 7
COL_RUT_APODERADO_ALT = 6       # rut_apoderado (duplicado de rut_appoderado, col 57)
COL_VIVE_CON, COL_CONT_EMERGENCIA = 12, 30

# (índice, campo, tipo). Para un mismo campo, el primer índice con dato gana (fallbacks).
USER_COLS = [
    (2, 'first_name', 'text'), (3, 'last_name', 'text'), (4, 'gender', 'sex'),
    (19, 'birth_date', 'date'), (22, 'address', 'text'), (35, 'email', 'email'),
    (39, 'phone', 'phone'), (8, 'phone', 'phone'),
]

PROFILE_COLS = [
    (0, 'matricula_number', 'text'), (1, 'enrollment_date', 'date'), (9, 'course_change', 'text'),
    (10, 'withdrawal_date', 'date'), (11, 'list_order', 'int'), (12, 'lives_with', 'text'),
    (13, 'nationality', 'nationality'), (14, 'comuna', 'text'), (15, 'city', 'text'),
    (16, 'ethnicity', 'text'), (17, 'siblings_count', 'int'), (18, 'emergency_phone', 'phone'),
    (21, 'religion', 'text'), (23, 'lunch_benefit', 'bool'), (154, 'lunch_benefit', 'bool'),
    (155, 'lunch_benefit', 'bool'), (24, 'has_sibling_in_school', 'bool'),
    (25, 'staff_child', 'bool'), (26, 'previous_school', 'text'), (27, 'baptized', 'bool'),
    (28, 'withdrawal_reason', 'text'), (29, 'emergency_email', 'email'),
    (30, 'emergency_contact_name', 'text'), (31, 'interests', 'text'),
    (32, 'repeated_courses', 'text'), (166, 'repeated_courses', 'text'), (34, 'region', 'text'),
    (38, 'gender_other', 'text'), (41, 'household_size', 'int'),
    (42, 'admission_type', 'admission'), (43, 'status', 'status'), (46, 'pie', 'bool'),
    (156, 'pie', 'bool'), (47, 'social_name', 'text'), (49, 'sige_data', 'text'),
    (50, 'priority_status', 'priority'), (52, 'nee', 'text'), (56, 'observations', 'text'),
    (165, 'observations', 'text'), (157, 'pie_type', 'text'), (161, 'pie_diagnosis', 'text'),
    (171, 'judicial_restriction', 'bool'), (177, 'pickup_with', 'text'),
    (178, 'emergency_phone_2', 'phone'), (180, 'has_commitment_letter', 'bool'),
    (170, 'has_commitment_letter', 'bool'),
]

MEDICAL_COLS = [
    (183, 'contraindications', 'text'), (184, 'allergies', 'text'), (169, 'allergies', 'text'),
    (185, 'chronic_diseases', 'text'), (181, 'special_care', 'text'), (176, 'special_care', 'text'),
    (168, 'special_care', 'text'), (182, 'medications', 'text'), (186, 'blood_type', 'text'),
    (187, 'health_provider', 'text'), (188, 'notes', 'text'), (190, 'height_cm', 'height'),
    (191, 'clothing_size', 'text'), (192, 'weight_kg', 'float'), (194, 'specialists', 'text'),
    (195, 'covid_vaccination', 'text'), (196, 'waist_cm', 'float'),
]
COL_PROBLEMAS = 189

# Autorizaciones: key de plantilla → columnas (primera con dato gana)
AUTH_COLS = [
    # autoriza_actividades (162) antes que permiso_actividades (54): en el sistema de origen
    # la col. 54 viene en 0 por defecto aunque no se haya respondido.
    ('fotos', [55]), ('actividades', [162, 54]), ('redes_sociales', [163]),
    ('religion', [167]), ('reglamento', [173, 172]), ('uniforme', [174]),
    ('carta_compromiso', [170, 180]), ('traslado_jornada', [175]),
]

# Encabezados "ancla" (comparados con norm_key tras html.unescape, por prefijo): si alguno
# no coincide, las columnas están corridas y el mapeo por índice importaría datos en
# campos equivocados. Celdas de encabezado vacías no se validan.
ANCHOR_HEADERS = {
    2: 'nombre', 5: 'rut', 19: 'fecha_nacimiento', 55: 'permiso_fotos', 57: 'rut_appoderado',
    83: 'rut_madre', 107: 'rut_padre', 131: 'rut_tut_eco', 162: 'autoriza_actividades',
    171: 'prohibicion judicial', 173: 'tomo conocimiento y acepto integramente',
    175: 'tomo conocimiento que, por el bienestar', 177: 'el / la estudiante se retira',
    178: 'telefono de emergencia 2', 183: 'c_medicas', 189: 'problemas', 196: 'p_cintura',
}

# Bloques de familia: offsets absolutos por campo
FAMILY_BLOCKS = {
    'madre': {
        'rut': 83, 'first_name': 84, 'last_name': 85, 'address': 86, 'birth_date': 87,
        'nationality': 88, 'phone': 89, 'education_level': 90, 'profession': 91, 'email': 92,
        'is_household_head': 93, 'sex': 95, 'marital_status': 96, 'relationship': 97,
        'religion': 98, 'work_phone': 99, 'occupation': 100, 'workplace': [102, 101],
        'chronic': 104,
    },
    'padre': {
        'rut': 107, 'first_name': 108, 'last_name': 109, 'address': 110, 'birth_date': 111,
        'nationality': 112, 'phone': 113, 'education_level': 114, 'profession': 115, 'email': 116,
        'is_household_head': 117, 'sex': 119, 'marital_status': 120, 'relationship': 121,
        'religion': 122, 'work_phone': 123, 'occupation': 124, 'workplace': [126, 125],
        'chronic': 128,
    },
    'apoderado': {
        'rut': 57, 'first_name': 58, 'last_name': 59, 'address': 60, 'birth_date': 61,
        'nationality': 62, 'phone': 63, 'education_level': 64, 'profession': 65, 'email': 66,
        'is_household_head': 68, 'workplace': [70], 'sex': 71, 'marital_status': 72,
        'relationship': 73, 'religion': 74, 'work_phone': 75, 'chronic': 77, 'can_pickup': 78,
    },
    'tut_eco': {
        'rut': 131, 'first_name': 132, 'last_name': 133, 'address': 134, 'birth_date': 135,
        'nationality': 136, 'phone': 137, 'education_level': 138, 'profession': 139, 'email': 140,
        'is_household_head': 142, 'sex': 144, 'marital_status': 145, 'relationship': 146,
        'religion': 147, 'work_phone': 148, 'workplace': [150], 'chronic': 151,
    },
}
FAMILY_FIELD_KINDS = {
    'rut': 'rut', 'birth_date': 'date', 'nationality': 'nationality', 'phone': 'phone',
    'work_phone': 'phone', 'email': 'email', 'is_household_head': 'bool', 'can_pickup': 'bool',
    'sex': 'sex',
}
BLOCK_ORDER = ('madre', 'padre', 'apoderado', 'tut_eco')


def _mapped_indices():
    idx = {COL_RUT, COL_NOMBRE, COL_APELLIDOS, COL_CURSO, COL_RUT_APODERADO_ALT, COL_PROBLEMAS}
    for cols in (USER_COLS, PROFILE_COLS, MEDICAL_COLS):
        idx.update(c[0] for c in cols)
    for _k, cols in AUTH_COLS:
        idx.update(cols)
    for block in FAMILY_BLOCKS.values():
        for v in block.values():
            idx.update(v if isinstance(v, list) else [v])
    return idx


MAPPED_INDICES = _mapped_indices()


# ── Normalizadores ───────────────────────────────────────────────────────────

def strip_accents(s):
    return ''.join(ch for ch in unicodedata.normalize('NFKD', s) if not unicodedata.combining(ch))


def norm_key(s):
    """minúsculas, sin tildes, espacios colapsados."""
    return re.sub(r'\s+', ' ', strip_accents(str(s or '')).lower()).strip()


def normalize_course_name(name):
    s = norm_key(name).replace('º', '°').replace('basica', 'basico')
    s = re.sub(r'\s*°\s*', '° ', s)
    return re.sub(r'\s+', ' ', s).strip()


def clean(v):
    """Valor de celda → None | str (strip) | int | float | date."""
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    if isinstance(v, float):
        return int(v) if v.is_integer() else v
    if isinstance(v, int):
        return v
    s = str(v).strip()
    return s or None


def as_text(v):
    v = clean(v)
    if v is None:
        return None
    if isinstance(v, date):
        return v.isoformat()
    return str(v)


def convert(v, kind, field, warnings):
    """Convierte una celda ya limpia según `kind`. None si no hay dato utilizable."""
    if v is None:
        return None
    if kind == 'text':
        return as_text(v)
    if kind == 'phone':
        return as_text(v)
    if kind == 'email':
        s = as_text(v).lower()
        if '@' not in s:
            warnings.append(f'Email inválido en {field}: {s}')
            return None
        return s
    if kind == 'date':
        try:
            return parse_date(v, field)
        except FichaError:
            warnings.append(f'Fecha inválida en {field}: {v}')
            return None
    if kind == 'int':
        try:
            return int(float(str(v).replace(',', '.')))
        except ValueError:
            warnings.append(f'Número inválido en {field}: {v}')
            return None
    if kind in ('float', 'height'):
        try:
            f = float(str(v).replace(',', '.'))
        except ValueError:
            warnings.append(f'Número inválido en {field}: {v}')
            return None
        if kind == 'height' and 0 < f < 3:   # vino en metros
            f = round(f * 100, 1)
        return f
    if kind == 'bool':
        b = parse_bool(v)
        if b is None:
            warnings.append(f'Valor Sí/No no reconocido en {field}: {v}')
        return b
    if kind == 'nationality':
        s = as_text(v)
        return None if s.lower() in ('false', 'true', '0') else s
    if kind == 'sex':
        k = norm_key(v)
        if k in ('femenino', 'f', 'mujer'):
            return 'Femenino'
        if k in ('masculino', 'm', 'hombre'):
            return 'Masculino'
        warnings.append(f'Sexo no reconocido: {v}')
        return None
    if kind == 'admission':
        k = norm_key(v)
        if k in ('nuevo', 'antiguo'):
            return k
        warnings.append(f'Tipo de admisión no reconocido: {v}')
        return None
    if kind == 'status':
        k = norm_key(v)
        if k in ('matriculado', 'prematriculado', 'retirado', 'egresado'):
            return k
        warnings.append(f'Estado de matrícula no reconocido: {v}')
        return None
    if kind == 'priority':
        k = norm_key(v)
        mapping = {'prioritario': 'Prioritario', 'preferente': 'Preferente', 'ninguno': 'Ninguno'}
        if k in mapping:
            return mapping[k]
        warnings.append(f'Prioritario/Preferente no reconocido: {v}')
        return None
    if kind == 'rut':
        return normalize_rut(v)
    return v


def map_relationship(raw, block):
    """Parentesco del Excel → valor del SPEC. Devuelve (relationship, relationship_other)."""
    if block == 'madre':
        return 'Madre', None
    if block == 'padre':
        return 'Padre', None
    k = norm_key(raw)
    if k in ('madre', 'mama'):
        return 'Madre', None
    if k in ('padre', 'papa'):
        return 'Padre', None
    if k.startswith('abuel'):
        return 'Abuelo/a', None
    if k.startswith('tio') or k.startswith('tia'):
        return 'Tío/a', None
    if k.startswith('herman'):
        return 'Hermano/a', None
    if k.startswith('tutor'):
        return 'Tutor legal', None
    other = as_text(raw)
    if other and not other.isdigit():
        return 'Otro', other
    return 'Otro', None


def parse_problems(v):
    """' P.VISUALES, P.AUDITIVOS' → flags + resto."""
    out = {'problem_visual': False, 'problem_auditory': False,
           'problem_cardiac': False, 'problem_spine': False, 'other_problems': None}
    s = as_text(v)
    if not s:
        return None
    others = []
    for token in re.split(r'[,;/|\n]+', s):
        t = strip_accents(token).upper().strip()
        if not t or t in ('NO', 'NINGUNO', 'NINGUNA'):
            continue
        if 'VISUAL' in t:
            out['problem_visual'] = True
        elif 'AUDIT' in t:
            out['problem_auditory'] = True
        elif 'CARD' in t:
            out['problem_cardiac'] = True
        elif 'COLUMNA' in t:
            out['problem_spine'] = True
        else:
            others.append(token.strip())
    if others:
        out['other_problems'] = ', '.join(others)
    return out


# ── Fase 1: parseo de fila ──────────────────────────────────────────────────

def _fill(target, cols, row, warnings, header):
    for idx, field, kind in cols:
        if target.get(field) is not None:
            continue
        val = convert(clean(row[idx]), kind, header[idx] or field, warnings)
        if val is not None:
            target[field] = val


def parse_row(row, header, extra_keys):
    warnings = []
    rut_raw = clean(row[COL_RUT])
    rut = normalize_rut(rut_raw)
    if not rut:
        raise FichaError(f'RUT del alumno faltante o inválido ({rut_raw})' if rut_raw else 'Falta el RUT del alumno')
    if not rut_is_valid(rut):
        warnings.append(f'RUT {rut} con dígito verificador inválido')

    user = {}
    _fill(user, USER_COLS, row, warnings, header)
    if not user.get('first_name') or not user.get('last_name'):
        raise FichaError('Faltan nombres o apellidos del alumno')

    profile = {}
    _fill(profile, PROFILE_COLS, row, warnings, header)
    medical = {}
    _fill(medical, MEDICAL_COLS, row, warnings, header)
    problems = parse_problems(row[COL_PROBLEMAS])

    auths = {}
    for key, cols in AUTH_COLS:
        for idx in cols:
            v = clean(row[idx])
            if v is None:
                continue
            b = parse_bool(v)
            if b is None:
                warnings.append(f'Autorización "{key}" con valor no reconocido: {v}')
                continue
            auths[key] = b
            break

    # Familia: agrupar bloques por RUT (deduplicación dentro del alumno)
    persons, order = {}, []
    for block in BLOCK_ORDER:
        spec = FAMILY_BLOCKS[block]
        data = {}
        for field, idx in spec.items():
            idxs = idx if isinstance(idx, list) else [idx]
            for i in idxs:
                v = clean(row[i])
                if v is None:
                    continue
                if field in ('relationship', 'chronic'):
                    v = as_text(v)
                else:
                    v = convert(v, FAMILY_FIELD_KINDS.get(field, 'text'), header[i] or field, warnings)
                if v is not None:
                    data[field] = v
                    break
        if block == 'apoderado' and not data.get('rut'):
            alt = normalize_rut(clean(row[COL_RUT_APODERADO_ALT]))
            if alt:
                data['rut'] = alt
        if not data.get('rut') and not data.get('first_name'):
            continue
        if not data.get('first_name'):
            warnings.append(f'Bloque {block}: RUT {data.get("rut")} sin nombre, se omite')
            continue
        rel, rel_other = map_relationship(data.pop('relationship', None), block)
        chronic = data.pop('chronic', None)
        if chronic and norm_key(chronic) not in ('no', 'ninguna', 'ninguno'):
            data['notes'] = f'Enfermedad crónica: {chronic}'
        pkey = data['rut'].replace('.', '') if data.get('rut') else f'sinrut:{rel}:{norm_key(data["first_name"])}'
        if pkey not in persons:
            persons[pkey] = {'data': {}, 'roles': [], 'relationship': None, 'relationship_other': None}
            order.append(pkey)
        p = persons[pkey]
        for k, v in data.items():
            p['data'].setdefault(k, v)          # el primer bloque manda; los demás completan
        p['roles'].append(block)
        if p['relationship'] is None or block in ('madre', 'padre'):
            p['relationship'], p['relationship_other'] = rel, rel_other

    family = [persons[k] for k in order]
    for p in family:
        rel = p['relationship']
        if rel in ('Madre', 'Padre') and rel.lower() not in p['roles'] and \
                any(rel.lower() in q['roles'] for q in family if q is not p):
            warnings.append(f'{p["data"].get("first_name")} figura como {rel} con un RUT distinto '
                            f'al del bloque {rel.lower()}; se registra como miembro aparte')
    titular =next((p for p in family if 'apoderado' in p['roles']), None)
    if not titular:
        warnings.append('Sin apoderado titular en el archivo')
    suplente = next((p for p in family if p is not titular and
                     ({'madre', 'padre'} & set(p['roles']))), None)
    vive = norm_key(profile.get('lives_with'))
    cont = norm_key(as_text(row[COL_CONT_EMERGENCIA]))
    for p in family:
        p['data']['is_economic_tutor'] = 'tut_eco' in p['roles']
        p['guardian_role'] = 'titular' if p is titular else 'suplente' if p is suplente else None
        if p['relationship'] in ('Madre', 'Padre') and vive:
            p['data']['lives_with_student'] = norm_key(p['relationship']) in vive
        if (p['relationship'] == 'Madre' and cont in ('mama', 'madre')) or \
                (p['relationship'] == 'Padre' and cont in ('papa', 'padre')):
            p['data']['is_emergency_contact'] = True

    extra = {}
    for i, v in enumerate(row):
        if i in MAPPED_INDICES:
            continue
        v = clean(v)
        if v is None:
            continue
        extra[extra_keys[i]] = v.isoformat() if isinstance(v, date) else v

    return {
        'rut': rut, 'user': user, 'profile': profile, 'medical': medical, 'problems': problems,
        'auths': auths, 'family': family, 'extra': extra, 'warnings': warnings,
        'course_name': as_text(row[COL_CURSO]),
    }


# ── Fase 2: escritura ───────────────────────────────────────────────────────

def _set_nonempty(obj, values):
    for field, val in values.items():
        if val is None or val == '':
            continue
        setattr(obj, field, coerce(type(obj), field, val))


def _email_taken(email, exclude_id=None):
    q = User.query.filter(func.lower(User.email) == email.lower())
    if exclude_id:
        q = q.filter(User.id != exclude_id)
    return q.first() is not None


def _student_email(parsed, school_id, exclude_id=None):
    email = parsed['user'].get('email')
    if email and not _email_taken(email, exclude_id):
        return email, None
    warn = f'El email {email} ya está en uso; se usa uno generado' if email else None
    base = re.sub(r'[^0-9k]', '', parsed['rut'].lower())
    candidate = f'alumno.{base}@sincorreo.{school_id}.local'
    n = 2
    while _email_taken(candidate, exclude_id):
        candidate = f'alumno.{base}.{n}@sincorreo.{school_id}.local'
        n += 1
    return candidate, warn


class CourseResolver:
    def __init__(self, school_id, course_id=None):
        self.school_id = school_id
        self.fixed = None
        self.cache = {}
        self.created = set()
        if course_id:
            try:
                cid = int(course_id)
            except (TypeError, ValueError):
                raise FichaError('course_id inválido')
            self.fixed = Course.query.filter_by(id=cid, school_id=school_id).first()
            if not self.fixed:
                raise FichaError('Curso no encontrado', 400)
        else:
            for c in Course.query.filter_by(school_id=school_id).order_by(Course.id).all():
                self.cache.setdefault(normalize_course_name(c.name), c)

    def get(self, name):
        if self.fixed:
            return self.fixed
        if not name:
            return None
        key = normalize_course_name(name)
        course = self.cache.get(key)
        if not course:
            m = re.match(r'^(.*?)\s+([A-Za-z])$', name.strip())
            course = Course(school_id=self.school_id, name=name.strip()[:100],
                            level=(m.group(1).strip() if m else name.strip())[:50],
                            letter=(m.group(2).upper() if m else None),
                            year=date.today().year, is_active=True)
            db.session.add(course)
            db.session.flush()
            self.cache[key] = course
            self.created.add(course.id)
        return course


def apply_row(parsed, ctx):
    school_id = ctx['school_id']
    warnings = parsed['warnings']
    rkey = parsed['rut'].replace('.', '')
    student = ctx['students'].get(rkey)
    action = 'actualizar' if student else 'crear'

    udata = dict(parsed['user'])
    udata['rut'] = parsed['rut']
    if student:
        email = udata.pop('email', None)
        if email and email != (student.email or '').lower():
            if _email_taken(email, student.id):
                warnings.append(f'El email {email} ya está en uso por otro usuario; no se cambia')
            else:
                student.email = email
        _set_nonempty(student, udata)
    else:
        email, warn = _student_email(parsed, school_id)
        if warn:
            warnings.append(warn)
        udata.pop('email', None)
        student = User(school_id=school_id, email=email, role='alumno', is_active=True,
                       first_name='-', last_name='-')
        _set_nonempty(student, udata)
        student.set_password(STUDENT_DEFAULT_PASSWORD)
        db.session.add(student)
        db.session.flush()
        ctx['students'][rkey] = student
    sid = student.id

    # Perfil + extra
    profile = get_or_create_profile(sid)
    _set_nonempty(profile, parsed['profile'])
    if profile.id is None and not parsed['profile'].get('status'):
        profile.status = 'matriculado'
    if profile.id is None and profile.id_type is None:
        profile.id_type = 'RUN'
    if parsed['extra']:
        extra = profile.get_extra()
        extra.update(parsed['extra'])
        profile.extra = json.dumps(extra, ensure_ascii=False, default=str)

    # Médico
    if parsed['medical'] or parsed['problems']:
        medical = get_or_create_medical(sid)
        _set_nonempty(medical, parsed['medical'])
        probs = parsed['problems'] or {}
        for f in ('problem_visual', 'problem_auditory', 'problem_cardiac', 'problem_spine'):
            if probs.get(f):
                setattr(medical, f, True)
        if probs.get('other_problems'):
            medical.other_problems = probs['other_problems']

    # Familia (upsert por RUT normalizado dentro del alumno)
    existing = StudentFamilyMember.query.filter_by(student_id=sid).all()
    by_rut = {m.rut.replace('.', ''): m for m in existing if normalize_rut(m.rut)}
    by_name = {(m.relationship, norm_key(m.first_name)): m for m in existing}
    members = []
    for p in parsed['family']:
        d = p['data']
        member = None
        if d.get('rut'):
            member = by_rut.get(d['rut'].replace('.', ''))
        else:
            member = by_name.get((p['relationship'], norm_key(d.get('first_name'))))
        if not member:
            member = StudentFamilyMember(student_id=sid, id_type='RUN')
            db.session.add(member)
            if d.get('rut'):
                by_rut[d['rut'].replace('.', '')] = member
        member.relationship = p['relationship']
        if p['relationship_other']:
            member.relationship_other = coerce(StudentFamilyMember, 'relationship_other', p['relationship_other'])
        _set_nonempty(member, d)
        for flag in ('is_economic_tutor', 'lives_with_student'):
            if flag in d and d[flag] is False:
                setattr(member, flag, False)
        members.append((p, member))
    db.session.flush()
    titular = next((m for p, m in members if p['guardian_role'] == 'titular'), None)
    suplente = next((m for p, m in members if p['guardian_role'] == 'suplente'), None)
    if titular:
        set_guardian_role(sid, titular, 'titular')
    if suplente:
        set_guardian_role(sid, suplente, 'suplente')

    # Autorizaciones (upsert por student_id + template_id)
    signed_at = parsed['profile'].get('enrollment_date')
    n_auth = 0
    for key, value in parsed['auths'].items():
        tpl = ctx['templates'].get(key)
        if not tpl:
            continue
        a = StudentAuthorization.query.filter_by(student_id=sid, template_id=tpl.id).first()
        if not a:
            a = StudentAuthorization(student_id=sid, template_id=tpl.id, title=tpl.title,
                                     description=tpl.description, created_by=ctx['user_id'] or None)
            db.session.add(a)
        a.status = 'autorizado' if value else 'rechazado'
        if titular:
            a.signed_by_member_id = titular.id
            a.signed_by_name = coerce(StudentAuthorization, 'signed_by_name', titular.full_name)
            a.signed_by_rut = titular.rut
        if signed_at:
            a.signed_at = signed_at
        n_auth += 1

    # Matrícula en el curso
    course = ctx['courses'].get(parsed['course_name'])
    if course:
        ctx['used_courses'].setdefault(course.id, course)
        enr = Enrollment.query.filter_by(student_id=sid, course_id=course.id).first()
        if not enr:
            db.session.add(Enrollment(student_id=sid, course_id=course.id,
                                      year=course.year or date.today().year, is_active=True))
        elif not enr.is_active:
            enr.is_active = True
    else:
        warnings.append('No se pudo determinar el curso del alumno')

    # Accesos de apoderado (opcional)
    if ctx['create_access']:
        for m in (titular, suplente):
            if m is None or m.user_id:
                continue
            if not m.email:
                warnings.append(f'{m.full_name}: sin email, no se crea acceso de apoderado')
                continue
            try:
                grant_guardian_access(m, student, school_id)
            except FichaError as e:
                warnings.append(f'{m.full_name}: {e.message}')

    db.session.flush()
    return {
        'action': action, 'student_id': sid,
        'name': f'{student.first_name} {student.last_name}',
        'family': len(members), 'authorizations': n_auth,
    }


# ── Entrada principal ───────────────────────────────────────────────────────

def _read_sheet(content):
    try:
        import openpyxl
        wb = openpyxl.load_workbook(BytesIO(content), read_only=True, data_only=True)
        ws = wb.worksheets[0]
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
        wb.close()
    except Exception:
        raise FichaError('No se pudo leer el archivo. Debe ser un Excel .xlsx válido')
    if not rows:
        raise FichaError('El archivo está vacío')
    header = [html.unescape(str(h)).strip() if h is not None else '' for h in rows[0]]
    if len(header) <= COL_RUT or header[COL_RUT].lower() != 'rut' or header[COL_NOMBRE].lower() != 'nombre':
        raise FichaError('El archivo no tiene el formato del Libro de Matrícula (columnas nombre/rut)')
    shifted = [f'{i + 1} (esperado "{exp}", viene "{header[i][:40]}")'
               for i, exp in ANCHOR_HEADERS.items()
               if i < len(header) and header[i] and not norm_key(header[i]).startswith(exp)]
    if shifted:
        raise FichaError('Las columnas del Libro de Matrícula no están en el orden esperado: '
                         + '; '.join(shifted))
    width = max(len(header), max(len(r) for r in rows))
    min_width = max(MAPPED_INDICES) + 1
    width = max(width, min_width)
    header += [''] * (width - len(header))
    data = [(i + 2, r + [None] * (width - len(r))) for i, r in enumerate(rows[1:])]
    # Claves únicas para `extra` (hay nombres de columna repetidos)
    counts = {}
    for h in header:
        counts[h] = counts.get(h, 0) + 1
    extra_keys = [(h if h and counts[h] == 1 else f'{h or "col"}[{i}]') for i, h in enumerate(header)]
    return header, data, extra_keys


def run_import(content, me, course_id=None, dry_run=True, create_guardian_access=False):
    school_id = me['school_id']
    header, data, extra_keys = _read_sheet(content)

    result = {'dry_run': dry_run, 'total_rows': 0, 'created': 0, 'updated': 0, 'skipped': 0,
              'errors': [], 'course': None, 'courses': [], 'rows': []}
    try:
        ensure_authorization_templates(school_id)
        templates = {}
        for t in AuthorizationTemplate.query.filter_by(school_id=school_id) \
                .order_by(AuthorizationTemplate.id).all():
            if t.key and t.key not in templates:
                templates[t.key] = t
        resolver = CourseResolver(school_id, course_id)
        students = {}
        for u in User.query.filter_by(school_id=school_id, role='alumno').all():
            n = normalize_rut(u.rut)
            if n:
                students.setdefault(n.replace('.', ''), u)
        ctx = {'school_id': school_id, 'user_id': me.get('user_id'), 'templates': templates,
               'courses': _LazyCourses(resolver), 'students': students, 'used_courses': {},
               'create_access': create_guardian_access}

        for rownum, row in data:
            if clean(row[COL_RUT]) is None and clean(row[COL_NOMBRE]) is None:
                continue
            result['total_rows'] += 1
            try:
                parsed = parse_row(row, header, extra_keys)
            except FichaError as e:
                result['skipped'] += 1
                result['errors'].append({'row': rownum, 'error': e.message})
                result['rows'].append({
                    'row': rownum, 'rut': as_text(row[COL_RUT]),
                    'name': ' '.join(x for x in [as_text(row[COL_NOMBRE]), as_text(row[COL_APELLIDOS])] if x),
                    'action': 'omitir', 'family': 0, 'authorizations': 0, 'warnings': [e.message]})
                continue
            try:
                info = apply_row(parsed, ctx)
            except FichaError:
                raise
            except Exception as e:  # error inesperado de BD: aborta todo el archivo
                raise FichaError(f'Error al importar la fila {rownum}: {e.__class__.__name__}: {e}', 400)
            result['created' if info['action'] == 'crear' else 'updated'] += 1
            result['rows'].append({
                'row': rownum, 'rut': parsed['rut'], 'name': info['name'], 'action': info['action'],
                'student_id': None if dry_run and info['action'] == 'crear' else info['student_id'],
                'family': info['family'], 'authorizations': info['authorizations'],
                'warnings': parsed['warnings']})

        courses = []
        for c in ctx['used_courses'].values():
            created = c.id in resolver.created
            courses.append({'id': None if (dry_run and created) else c.id, 'name': c.name,
                            'created': created})
        result['courses'] = courses
        result['course'] = courses[0] if courses else (
            {'id': resolver.fixed.id, 'name': resolver.fixed.name, 'created': False} if resolver.fixed else None)

        if dry_run:
            db.session.rollback()
        else:
            db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return result


class _LazyCourses:
    """Adaptador dict-like: nombre de curso del Excel → Course (crea si no existe)."""
    def __init__(self, resolver):
        self.resolver = resolver

    def get(self, name):
        return self.resolver.get(name)
