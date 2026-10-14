from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from models import db, Subject

subjects_bp = Blueprint('subjects', __name__)

# Asignaturas del ministerio de educación Chile
MINISTRY_SUBJECTS = [
    {'code': 'LEN', 'name': 'Lenguaje y Comunicación'},
    {'code': 'MAT', 'name': 'Matemática'},
    {'code': 'HIS', 'name': 'Historia, Geografía y Cs. Sociales'},
    {'code': 'CNA', 'name': 'Ciencias Naturales'},
    {'code': 'ING', 'name': 'Inglés'},
    {'code': 'ART', 'name': 'Artes Visuales'},
    {'code': 'MUS', 'name': 'Música'},
    {'code': 'EDF', 'name': 'Educación Física y Salud'},
    {'code': 'TEC', 'name': 'Tecnología'},
    {'code': 'ORI', 'name': 'Orientación'},
    {'code': 'REL', 'name': 'Religión'},
    {'code': 'FIL', 'name': 'Filosofía'},
    {'code': 'QUI', 'name': 'Química'},
    {'code': 'FIS', 'name': 'Física'},
    {'code': 'BIO', 'name': 'Biología'},
]

@subjects_bp.route('/ministry', methods=['GET'])
@jwt_required()
def get_ministry_subjects():
    return jsonify(MINISTRY_SUBJECTS), 200

@subjects_bp.route('/', methods=['GET'])
@jwt_required()
def get_subjects():
    claims = get_jwt()
    school_id = claims.get('school_id')
    subjects = Subject.query.filter_by(school_id=school_id, is_active=True).order_by(Subject.name).all()
    return jsonify([s.to_dict() for s in subjects]), 200

@subjects_bp.route('/', methods=['POST'])
@jwt_required()
def create_subject():
    claims = get_jwt()
    if claims.get('role') not in ['admin', 'directivo']:
        return jsonify({'error': 'Sin permisos'}), 403
    school_id = claims.get('school_id')
    data = request.get_json()
    subject = Subject(
        school_id=school_id, name=data['name'],
        code=data.get('code'), ministry_code=data.get('ministry_code'),
        description=data.get('description'), color=data.get('color', '#6366F1')
    )
    db.session.add(subject)
    db.session.commit()
    return jsonify(subject.to_dict()), 201

@subjects_bp.route('/<int:subject_id>', methods=['PUT'])
@jwt_required()
def update_subject(subject_id):
    claims = get_jwt()
    if claims.get('role') not in ['admin', 'directivo']:
        return jsonify({'error': 'Sin permisos'}), 403
    subject = Subject.query.filter_by(id=subject_id, school_id=claims.get('school_id')).first_or_404()
    data = request.get_json()
    for field in ['name', 'code', 'ministry_code', 'description', 'color', 'is_active']:
        if field in data:
            setattr(subject, field, data[field])
    db.session.commit()
    return jsonify(subject.to_dict()), 200

@subjects_bp.route('/<int:subject_id>', methods=['DELETE'])
@jwt_required()
def delete_subject(subject_id):
    claims = get_jwt()
    if claims.get('role') not in ['admin', 'directivo']:
        return jsonify({'error': 'Sin permisos'}), 403
    subject = Subject.query.filter_by(id=subject_id, school_id=claims.get('school_id')).first_or_404()
    subject.is_active = False
    db.session.commit()
    return jsonify({'message': 'Asignatura desactivada'}), 200


# ── Asignar una asignatura a varios cursos de una vez ─────────────────

@subjects_bp.route('/<int:subject_id>/cursos', methods=['POST'])
@jwt_required()
def asignar_a_cursos(subject_id):
    """Pone la asignatura en todos los cursos de un año, sin repetir.

    Con trece asignaturas y ocho cursos son más de cien altas una por una.
    El `simular` existe para que la pantalla pueda decir cuántas va a crear
    antes de crear nada: una acción masiva sin número por delante es una
    invitación a equivocarse.
    """
    from datetime import date
    from models import Course, CourseSubject

    claims = get_jwt()
    if claims.get('role') not in ['admin', 'directivo']:
        return jsonify({'error': 'Sin permisos'}), 403

    sid = claims.get('school_id')
    asignatura = Subject.query.filter_by(id=subject_id, school_id=sid).first_or_404()
    datos = request.get_json() or {}
    simular = bool(datos.get('simular'))
    year = datos.get('year') or date.today().year
    horas = datos.get('hours_per_week')
    horas = int(horas) if isinstance(horas, (int, float, str)) and str(horas).strip() else 2
    if not 1 <= horas <= 45:
        return jsonify({'error': 'Las horas semanales deben ir entre 1 y 45'}), 400

    cursos = Course.query.filter_by(school_id=sid, year=year, is_active=True)\
        .order_by(Course.level, Course.letter, Course.name).all()
    if not cursos:
        return jsonify({'error': f'No hay cursos en {year}'}), 404

    # Filtro opcional por nivel: no todas las asignaturas van en todos los
    # niveles (Química en 1° básico, por ejemplo).
    niveles = datos.get('niveles')
    if isinstance(niveles, list) and niveles:
        cursos = [c for c in cursos if (c.level or c.name) in niveles]
        if not cursos:
            return jsonify({'error': 'Ningún curso coincide con esos niveles'}), 404

    ya_tienen = {cs.course_id for cs in CourseSubject.query.filter(
        CourseSubject.subject_id == subject_id,
        CourseSubject.course_id.in_([c.id for c in cursos])).all()}

    faltan = [c for c in cursos if c.id not in ya_tienen]

    if simular:
        return jsonify({
            'simulado': True, 'year': year, 'horas': horas,
            'por_crear': len(faltan), 'ya_tenian': len(ya_tienen),
            'cursos': [c.name for c in faltan],
        }), 200

    for c in faltan:
        db.session.add(CourseSubject(course_id=c.id, subject_id=subject_id,
                                     hours_per_week=horas))
    db.session.commit()

    return jsonify({
        'ok': True, 'year': year, 'horas': horas,
        'asignatura': asignatura.name,
        'creados': len(faltan), 'ya_tenian': len(ya_tienen),
        'cursos': [c.name for c in faltan],
    }), 201


@subjects_bp.route('/cursos-disponibles', methods=['GET'])
@jwt_required()
def cursos_disponibles():
    """Años con cursos y cuántos hay en cada uno.

    La pantalla lo necesita para no ofrecer «asignar a todos los cursos» de
    un año que no tiene ninguno.
    """
    from datetime import date
    from models import Course

    sid = get_jwt().get('school_id')
    cursos = Course.query.filter_by(school_id=sid, is_active=True).all()
    por_year = {}
    for c in cursos:
        por_year.setdefault(c.year, []).append(c)

    hoy = date.today().year
    return jsonify({
        'sugerido': hoy if hoy in por_year else (max(por_year) if por_year else hoy),
        'anios': [{'year': y, 'cursos': len(v),
                   'niveles': sorted({(c.level or c.name) for c in v})}
                  for y, v in sorted(por_year.items(), reverse=True)],
    }), 200
