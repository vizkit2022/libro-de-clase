from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from models import db, Annotation
from datetime import date

annotations_bp = Blueprint('annotations', __name__)

@annotations_bp.route('/', methods=['GET'])
@jwt_required()
def get_annotations():
    claims = get_jwt()
    school_id = claims.get('school_id')
    student_id = request.args.get('student_id', type=int)
    course_id = request.args.get('course_id', type=int)
    annotation_type = request.args.get('type')

    query = Annotation.query.join(
        __import__('models').User, Annotation.student_id == __import__('models').User.id
    ).filter(__import__('models').User.school_id == school_id)

    if student_id:
        query = query.filter(Annotation.student_id == student_id)
    if course_id:
        query = query.filter(Annotation.course_id == course_id)
    if annotation_type:
        query = query.filter(Annotation.annotation_type == annotation_type)

    annotations = query.order_by(Annotation.date.desc()).all()
    return jsonify([a.to_dict() for a in annotations]), 200

@annotations_bp.route('/', methods=['POST'])
@jwt_required()
def create_annotation():
    claims = get_jwt()
    if claims.get('role') not in ['admin', 'directivo', 'profesor']:
        return jsonify({'error': 'Sin permisos'}), 403
    creator_id = int(claims['sub'])
    data = request.get_json()

    annotation = Annotation(
        student_id=data['student_id'],
        course_id=data['course_id'],
        annotation_type=data.get('annotation_type', 'neutral'),
        title=data['title'],
        description=data['description'],
        date=date.fromisoformat(data['date']) if data.get('date') else date.today(),
        created_by=creator_id
    )
    db.session.add(annotation)
    db.session.commit()
    return jsonify(annotation.to_dict()), 201

@annotations_bp.route('/<int:annotation_id>', methods=['PUT'])
@jwt_required()
def update_annotation(annotation_id):
    claims = get_jwt()
    annotation = Annotation.query.get_or_404(annotation_id)
    data = request.get_json()
    for field in ['annotation_type', 'title', 'description']:
        if field in data:
            setattr(annotation, field, data[field])
    if data.get('date'):
        annotation.date = date.fromisoformat(data['date'])
    db.session.commit()
    return jsonify(annotation.to_dict()), 200

@annotations_bp.route('/<int:annotation_id>', methods=['DELETE'])
@jwt_required()
def delete_annotation(annotation_id):
    claims = get_jwt()
    if claims.get('role') not in ['admin', 'directivo', 'profesor']:
        return jsonify({'error': 'Sin permisos'}), 403
    annotation = Annotation.query.get_or_404(annotation_id)
    db.session.delete(annotation)
    db.session.commit()
    return jsonify({'message': 'Anotación eliminada'}), 200
