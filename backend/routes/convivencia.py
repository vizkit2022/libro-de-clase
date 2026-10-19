"""
Rutas de Convivencia Escolar — Gestión de casos (Anexos 1-5).
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from models import db, ConvivenciaCase, ConvivenciaBitacora, User, StudentGuardian
from datetime import datetime, date
import json
from routes.access import current_claims, guardian_student_ids, is_staff, forbidden

convivencia_bp = Blueprint('convivencia', __name__)

def _school_id():
    return get_jwt().get('school_id')

def _user_id():
    return int(get_jwt().get('sub', 0))

def _require_roles(*roles):
    claims = get_jwt()
    return claims.get('role') in roles

def _next_numero(school_id):
    year = datetime.utcnow().year
    count = ConvivenciaCase.query.filter_by(school_id=school_id).count() + 1
    return f"CV-{year}-{count:03d}"

def _parse_date(v):
    if not v: return None
    try: return date.fromisoformat(v[:10])
    except: return None

def _parse_dt(v):
    if not v: return None
    try: return datetime.fromisoformat(v)
    except: return None

def _json_str(v):
    if v is None: return None
    return json.dumps(v, ensure_ascii=False)

def _normalize_people(entries, school_id):
    """Normaliza afectados/involucrados: valida student_id (debe ser alumno del colegio)
    y completa nombre/curso desde la ficha del alumno si vienen vacíos."""
    out = []
    for e in entries or []:
        if not isinstance(e, dict):
            continue
        item = {'nombre': (e.get('nombre') or '').strip(), 'curso': (e.get('curso') or '').strip()}
        sid = e.get('student_id')
        if sid:
            student = User.query.filter_by(id=int(sid), school_id=school_id, role='alumno').first()
            if student:
                item['student_id'] = student.id
                if not item['nombre']:
                    item['nombre'] = f"{student.first_name} {student.last_name}"
        if item['nombre'] or item['curso'] or item.get('student_id'):
            out.append(item)
    return out

def _validate_apoderado(apoderado_user_id, school_id):
    if not apoderado_user_id:
        return None
    ap = User.query.filter_by(id=int(apoderado_user_id), school_id=school_id, role='apoderado').first()
    return ap.id if ap else None

def _case_for_viewer(case, me):
    """Devuelve el caso si el usuario puede verlo (o None).
    Equipo docente: todo el colegio. Apoderado: casos vinculados a él o a sus alumnos. Alumno: ninguno."""
    if is_staff(me['role']):
        return case
    if me['role'] == 'apoderado':
        if case.is_visible_to_guardian(me['user_id'], guardian_student_ids(me['user_id'])):
            return case
    return None


# ── CRUD Casos ───────────────────────────────────────────────────────────────

@convivencia_bp.route('/', methods=['GET'])
@jwt_required()
def list_cases():
    sid = _school_id()
    me = current_claims()
    if me['role'] == 'alumno':
        return forbidden()
    estado = request.args.get('estado')
    student_id = request.args.get('student_id', type=int)
    q = ConvivenciaCase.query.filter_by(school_id=sid)
    if estado:
        q = q.filter_by(estado=estado)
    cases = q.order_by(ConvivenciaCase.created_at.desc()).all()

    if me['role'] == 'apoderado':
        my_students = guardian_student_ids(me['user_id'])
        cases = [c for c in cases if c.is_visible_to_guardian(me['user_id'], my_students)]
        if student_id and student_id not in my_students:
            return forbidden()

    if student_id:
        cases = [c for c in cases if student_id in c.linked_student_ids()]
    return jsonify([c.to_dict() for c in cases]), 200


@convivencia_bp.route('/', methods=['POST'])
@jwt_required()
def create_case():
    if not _require_roles('admin', 'directivo', 'profesor'):
        return jsonify({'error': 'Sin permisos'}), 403
    sid = _school_id()
    data = request.get_json()
    case = ConvivenciaCase(
        school_id=sid,
        numero_caso=_next_numero(sid),
        estado='recepcion',
        created_by_id=_user_id(),
        # Anexo 1
        fecha_recepcion=_parse_dt(data.get('fecha_recepcion')),
        quien_recibe=data.get('quien_recibe'),
        apoderado_user_id=_validate_apoderado(data.get('apoderado_user_id'), sid),
        afectados=_json_str(_normalize_people(data.get('afectados', []), sid)),
        involucrados=_json_str(_normalize_people(data.get('involucrados', []), sid)),
        descripcion_hechos=data.get('descripcion_hechos'),
        tipificacion=data.get('tipificacion'),
        tipificacion_otro=data.get('tipificacion_otro'),
        medidas_inmediatas=_json_str(data.get('medidas_inmediatas', [])),
    )
    db.session.add(case)
    db.session.commit()
    return jsonify(case.to_dict()), 201


@convivencia_bp.route('/<int:case_id>', methods=['GET'])
@jwt_required()
def get_case(case_id):
    sid = _school_id()
    me = current_claims()
    case = ConvivenciaCase.query.filter_by(id=case_id, school_id=sid).first_or_404()
    if _case_for_viewer(case, me) is None:
        return forbidden()
    return jsonify(case.to_dict()), 200


@convivencia_bp.route('/<int:case_id>', methods=['PUT'])
@jwt_required()
def update_case(case_id):
    if not _require_roles('admin', 'directivo', 'profesor'):
        return jsonify({'error': 'Sin permisos'}), 403
    sid = _school_id()
    case = ConvivenciaCase.query.filter_by(id=case_id, school_id=sid).first_or_404()
    data = request.get_json()

    # Estado
    if 'estado' in data:
        case.estado = data['estado']

    # Anexo 1
    for f in ['quien_recibe', 'descripcion_hechos', 'tipificacion', 'tipificacion_otro']:
        if f in data: setattr(case, f, data[f])
    if 'fecha_recepcion' in data: case.fecha_recepcion = _parse_dt(data['fecha_recepcion'])
    if 'afectados' in data: case.afectados = _json_str(_normalize_people(data['afectados'], sid))
    if 'involucrados' in data: case.involucrados = _json_str(_normalize_people(data['involucrados'], sid))
    if 'medidas_inmediatas' in data: case.medidas_inmediatas = _json_str(data['medidas_inmediatas'])
    if 'apoderado_user_id' in data: case.apoderado_user_id = _validate_apoderado(data['apoderado_user_id'], sid)

    # Anexo 2
    for f in ['apoderado_nombre', 'apoderado_rut', 'apoderado_parentesco', 'apoderado_telefono',
              'entrevistador', 'entrevistador_cargo', 'motivo_citacion', 'declaracion_descargos',
              'compromiso_familia', 'compromiso_convivencia',
              'entrevista_hora_inicio', 'entrevista_hora_termino']:
        if f in data: setattr(case, f, data[f])
    if 'entrevista_fecha' in data: case.entrevista_fecha = _parse_date(data['entrevista_fecha'])
    if 'entrevista_proximo_monitoreo' in data: case.entrevista_proximo_monitoreo = _parse_date(data['entrevista_proximo_monitoreo'])

    # Anexo 3
    for f in ['coordinador_cargo', 'observaciones_especialistas']:
        if f in data: setattr(case, f, data[f])
    if 'seguimiento_proximo_monitoreo' in data: case.seguimiento_proximo_monitoreo = _parse_date(data['seguimiento_proximo_monitoreo'])

    # Anexo 4
    for f in ['intervencion_curso', 'intervencion_asignatura', 'intervencion_profesional',
              'intervencion_cargo', 'intervencion_objetivo', 'intervencion_contenidos',
              'intervencion_observaciones', 'intervencion_registrado_libro']:
        if f in data: setattr(case, f, data[f])
    if 'intervencion_fecha' in data: case.intervencion_fecha = _parse_date(data['intervencion_fecha'])
    if 'intervencion_fecha_libro' in data: case.intervencion_fecha_libro = _parse_date(data['intervencion_fecha_libro'])

    # Anexo 5
    for f in ['apelacion_apoderado', 'apelacion_rut', 'apelacion_parentesco',
              'apelacion_medida', 'apelacion_fundamentos']:
        if f in data: setattr(case, f, data[f])
    if 'apelacion_fecha' in data: case.apelacion_fecha = _parse_date(data['apelacion_fecha'])
    if 'apelacion_documentos' in data: case.apelacion_documentos = _json_str(data['apelacion_documentos'])

    case.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify(case.to_dict()), 200


@convivencia_bp.route('/<int:case_id>/avanzar', methods=['POST'])
@jwt_required()
def avanzar_etapa(case_id):
    """Avanza al siguiente estado del caso."""
    if not _require_roles('admin', 'directivo', 'profesor'):
        return jsonify({'error': 'Sin permisos'}), 403
    sid = _school_id()
    case = ConvivenciaCase.query.filter_by(id=case_id, school_id=sid).first_or_404()
    flujo = ['recepcion', 'entrevista', 'seguimiento', 'intervencion_grupal', 'apelacion', 'cerrado']
    try:
        idx = flujo.index(case.estado)
        if idx < len(flujo) - 1:
            case.estado = flujo[idx + 1]
            case.updated_at = datetime.utcnow()
            db.session.commit()
    except ValueError:
        pass
    return jsonify(case.to_dict()), 200


# ── Listas para vincular alumnos y apoderados a un caso ─────────────────────

@convivencia_bp.route('/alumnos', methods=['GET'])
@jwt_required()
def list_alumnos():
    """Alumnos activos del colegio con su curso actual (para el selector de afectados/involucrados)."""
    if not _require_roles('admin', 'directivo', 'profesor'):
        return forbidden()
    from models import Enrollment
    sid = _school_id()
    alumnos = User.query.filter_by(school_id=sid, role='alumno', is_active=True).order_by(User.last_name, User.first_name).all()
    out = []
    for a in alumnos:
        enr = Enrollment.query.filter_by(student_id=a.id, is_active=True).order_by(Enrollment.year.desc()).first()
        out.append({
            'id': a.id, 'full_name': f"{a.first_name} {a.last_name}",
            'course_id': enr.course_id if enr else None,
            'course_name': enr.course.name if enr and enr.course else None,
        })
    return jsonify(out), 200


@convivencia_bp.route('/apoderados', methods=['GET'])
@jwt_required()
def list_apoderados():
    """Apoderados activos del colegio con sus alumnos (para vincular el caso a un apoderado)."""
    if not _require_roles('admin', 'directivo', 'profesor'):
        return forbidden()
    sid = _school_id()
    apods = User.query.filter_by(school_id=sid, role='apoderado', is_active=True).order_by(User.last_name, User.first_name).all()
    out = []
    for ap in apods:
        rels = StudentGuardian.query.filter_by(guardian_id=ap.id).all()
        out.append({
            'id': ap.id, 'full_name': f"{ap.first_name} {ap.last_name}",
            'rut': ap.rut, 'phone': ap.phone,
            'students': [{'id': r.student_id,
                          'full_name': f"{r.student.first_name} {r.student.last_name}" if r.student else '',
                          'relationship': r.relationship} for r in rels],
        })
    return jsonify(out), 200


# ── Bitácora (Anexo 3) ───────────────────────────────────────────────────────

@convivencia_bp.route('/<int:case_id>/bitacora', methods=['POST'])
@jwt_required()
def add_bitacora(case_id):
    if not _require_roles('admin', 'directivo', 'profesor'):
        return jsonify({'error': 'Sin permisos'}), 403
    sid = _school_id()
    ConvivenciaCase.query.filter_by(id=case_id, school_id=sid).first_or_404()
    data = request.get_json()
    entry = ConvivenciaBitacora(
        case_id=case_id,
        fecha=_parse_date(data.get('fecha')),
        tipo_accion=data.get('tipo_accion'),
        observaciones=data.get('observaciones'),
        created_by_id=_user_id(),
    )
    db.session.add(entry)
    db.session.commit()
    return jsonify(entry.to_dict()), 201


@convivencia_bp.route('/<int:case_id>/bitacora/<int:entry_id>', methods=['DELETE'])
@jwt_required()
def delete_bitacora(case_id, entry_id):
    if not _require_roles('admin', 'directivo'):
        return jsonify({'error': 'Sin permisos'}), 403
    entry = ConvivenciaBitacora.query.filter_by(id=entry_id, case_id=case_id).first_or_404()
    db.session.delete(entry)
    db.session.commit()
    return jsonify({'ok': True}), 200
