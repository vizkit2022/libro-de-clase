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
