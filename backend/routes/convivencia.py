from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from models import (db, ConvivenciaCase, ConvivenciaCaseStep, User, Course,
                    CONVIVENCIA_PROTOCOL_STEPS)
from datetime import date, datetime
from sqlalchemy import extract, func

convivencia_bp = Blueprint('convivencia', __name__)


def school_required(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        claims = get_jwt()
        if not claims.get('school_id'):
            return jsonify({'error': 'Sin colegio asignado'}), 403
        return f(*args, **kwargs)
    return decorated


# ── Catálogos ──────────────────────────────────────────────────────────

@convivencia_bp.route('/catalogs', methods=['GET'])
@jwt_required()
def get_catalogs():
    from models import CONVIVENCIA_PROCEDURES, CONVIVENCIA_TYPIFICATIONS, CONVIVENCIA_PROTOCOL_STEPS
    return jsonify({
        'procedures': CONVIVENCIA_PROCEDURES,
        'typifications': CONVIVENCIA_TYPIFICATIONS,
        'protocol_steps': CONVIVENCIA_PROTOCOL_STEPS,
    }), 200


# ── Dashboard ──────────────────────────────────────────────────────────

@convivencia_bp.route('/dashboard', methods=['GET'])
@jwt_required()
@school_required
def get_dashboard():
    claims = get_jwt()
    school_id = claims.get('school_id')
    year = request.args.get('year', date.today().year, type=int)

    cases = ConvivenciaCase.query.filter_by(school_id=school_id, year=year).all()

    # Por mes
    by_month = {m: 0 for m in range(1, 13)}
    for c in cases:
        if c.date:
            by_month[c.date.month] += 1

    # Por procedimiento
    by_procedure = {}
    for c in cases:
        p = c.procedure or 'Sin procedimiento'
        by_procedure[p] = by_procedure.get(p, 0) + 1

    # Por profesional
    by_professional = {}
    for c in cases:
        name = (f"{c.professional.first_name} {c.professional.last_name}"
                if c.professional else 'Sin asignar')
        by_professional[name] = by_professional.get(name, 0) + 1

    # Por tipificación
    by_typification = {}
    for c in cases:
        t = c.typification or 'Sin tipificación'
        by_typification[t] = by_typification.get(t, 0) + 1

    # Por estado
    open_cases = sum(1 for c in cases if c.status == 'abierto')
    closed_cases = sum(1 for c in cases if c.status == 'cerrado')

    return jsonify({
        'year': year,
        'total': len(cases),
        'open': open_cases,
        'closed': closed_cases,
        'by_month': [{'month': m, 'count': by_month[m]} for m in range(1, 13)],
        'by_procedure': [{'name': k, 'count': v} for k, v in by_procedure.items()],
        'by_professional': [{'name': k, 'count': v} for k, v in by_professional.items()],
        'by_typification': [{'name': k, 'count': v} for k, v in by_typification.items()],
    }), 200


# ── Casos ──────────────────────────────────────────────────────────────

@convivencia_bp.route('/cases', methods=['GET'])
@jwt_required()
@school_required
def get_cases():
    claims = get_jwt()
    school_id = claims.get('school_id')
    year = request.args.get('year', date.today().year, type=int)
    status_filter = request.args.get('status')  # abierto | cerrado | all
    student_id = request.args.get('student_id', type=int)

    query = ConvivenciaCase.query.filter_by(school_id=school_id, year=year)
    if status_filter and status_filter != 'all':
        query = query.filter_by(status=status_filter)
    if student_id:
        query = query.filter_by(student_id=student_id)

    cases = query.order_by(ConvivenciaCase.date.desc()).all()
    return jsonify([c.to_dict() for c in cases]), 200


@convivencia_bp.route('/cases/<int:case_id>', methods=['GET'])
@jwt_required()
@school_required
def get_case(case_id):
    claims = get_jwt()
    case = ConvivenciaCase.query.filter_by(
        id=case_id, school_id=claims.get('school_id')
    ).first_or_404()
    return jsonify(case.to_dict()), 200


@convivencia_bp.route('/cases', methods=['POST'])
@jwt_required()
@school_required
def create_case():
    claims = get_jwt()
    school_id = claims.get('school_id')
    user_id = int(claims.get('sub', 0))
    data = request.get_json()

    # Número correlativo
    year = data.get('year', date.today().year)
    last = (ConvivenciaCase.query
            .filter_by(school_id=school_id, year=year)
            .order_by(ConvivenciaCase.case_number.desc())
            .first())
    next_number = (last.case_number + 1) if last else 1

    case = ConvivenciaCase(
        school_id=school_id,
        case_number=next_number,
        year=year,
        student_id=data.get('student_id') or None,
        course_id=data.get('course_id') or None,
        professional_id=data.get('professional_id') or None,
        title=data['title'],
        date=date.fromisoformat(data['date']),
        procedure=data.get('procedure'),
        typification=data.get('typification'),
        motive=data.get('motive'),
        agreements=data.get('agreements'),
        status=data.get('status', 'abierto'),
        criticality=data.get('criticality', 'media'),
        created_by=user_id,
    )
    db.session.add(case)
    db.session.flush()  # get case.id

    # Crear pasos del protocolo automáticamente
    for i, step_name in enumerate(CONVIVENCIA_PROTOCOL_STEPS, start=1):
        step = ConvivenciaCaseStep(
            case_id=case.id,
            step_number=i,
            name=step_name,
            status='pending',
        )
        db.session.add(step)

    db.session.commit()
    return jsonify(case.to_dict()), 201


@convivencia_bp.route('/cases/<int:case_id>', methods=['PUT'])
@jwt_required()
@school_required
def update_case(case_id):
    claims = get_jwt()
    case = ConvivenciaCase.query.filter_by(
        id=case_id, school_id=claims.get('school_id')
    ).first_or_404()
    data = request.get_json()

    for field in ['title', 'procedure', 'typification', 'motive',
                  'agreements', 'status', 'criticality',
                  'professional_id', 'student_id', 'course_id']:
        if field in data:
            setattr(case, field, data[field] or None if field.endswith('_id') else data[field])
    if 'date' in data and data['date']:
        case.date = date.fromisoformat(data['date'])

    db.session.commit()
    return jsonify(case.to_dict()), 200


# ── Pasos del protocolo ────────────────────────────────────────────────

@convivencia_bp.route('/cases/<int:case_id>/steps/<int:step_id>', methods=['PUT'])
@jwt_required()
@school_required
def update_step(case_id, step_id):
    claims = get_jwt()
    case = ConvivenciaCase.query.filter_by(
        id=case_id, school_id=claims.get('school_id')
    ).first_or_404()
    step = ConvivenciaCaseStep.query.filter_by(id=step_id, case_id=case_id).first_or_404()

    data = request.get_json()
    if 'status' in data:
        step.status = data['status']
        if data['status'] == 'completed' and not step.completed_at:
            step.completed_at = datetime.utcnow()
        elif data['status'] != 'completed':
            step.completed_at = None
    if 'notes' in data:
        step.notes = data['notes']

    db.session.commit()
    return jsonify(step.to_dict()), 200


# ── Extracción de caso desde imagen (IA) ───────────────────────────────

@convivencia_bp.route('/extract-from-image', methods=['POST'])
@jwt_required()
@school_required
def extract_from_image():
    import anthropic, base64, os, json as json_lib
    from models import CONVIVENCIA_PROCEDURES, CONVIVENCIA_TYPIFICATIONS

    file = request.files.get('image')
    if not file:
        return jsonify({'error': 'No se envió imagen'}), 400

    mime = file.content_type or 'image/jpeg'
    img_data = base64.standard_b64encode(file.read()).decode('utf-8')

    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        return jsonify({'error': 'ANTHROPIC_API_KEY no configurada'}), 500

    client = anthropic.Anthropic(api_key=api_key)

    prompt = f"""Eres un asistente de convivencia escolar chileno. Analiza la imagen adjunta y extrae la información del caso de convivencia.

Devuelve SOLO un JSON con estos campos (deja vacío si no aparece en la imagen):
{{
  "title": "título breve del caso",
  "date": "YYYY-MM-DD o vacío",
  "typification": "uno de: {', '.join(CONVIVENCIA_TYPIFICATIONS)} o vacío",
  "procedure": "uno de: {', '.join(CONVIVENCIA_PROCEDURES)} o vacío",
  "criticality": "alta, media o baja",
  "motive": "descripción del motivo o situación",
  "agreements": "acuerdos o compromisos si los hay",
  "student_name": "nombre del estudiante si aparece",
  "professional_name": "nombre del profesional si aparece"
}}

Responde SOLO con el JSON, sin markdown ni explicaciones."""

    try:
        msg = client.messages.create(
            model='claude-haiku-4-5-20251001',
            max_tokens=1024,
            messages=[{
                'role': 'user',
                'content': [
                    {'type': 'image', 'source': {'type': 'base64', 'media_type': mime, 'data': img_data}},
                    {'type': 'text', 'text': prompt}
                ]
            }]
        )
        raw = msg.content[0].text.strip()
        # Limpiar posible markdown
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
        result = json_lib.loads(raw)
        return jsonify(result), 200
    except json_lib.JSONDecodeError:
        return jsonify({'error': 'No se pudo interpretar la respuesta del modelo', 'raw': raw}), 422
    except Exception as e:
        return jsonify({'error': str(e)}), 500
