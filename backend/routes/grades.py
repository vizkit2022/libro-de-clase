from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from models import db, Grade, CourseSubject, Enrollment, User
from sqlalchemy import func

grades_bp = Blueprint('grades', __name__)

@grades_bp.route('/', methods=['GET'])
@jwt_required()
def get_grades():
    claims = get_jwt()
    school_id = claims.get('school_id')
    student_id = request.args.get('student_id', type=int)
    course_subject_id = request.args.get('course_subject_id', type=int)
    period_id = request.args.get('period_id', type=int)

    query = Grade.query.join(User, Grade.student_id == User.id).filter(User.school_id == school_id)
    if student_id:
        query = query.filter(Grade.student_id == student_id)
    if course_subject_id:
        query = query.filter(Grade.course_subject_id == course_subject_id)
    if period_id:
        query = query.filter(Grade.period_id == period_id)

    grades = query.order_by(Grade.created_at.desc()).all()
    return jsonify([g.to_dict() for g in grades]), 200

@grades_bp.route('/', methods=['POST'])
@jwt_required()
def create_grade():
    claims = get_jwt()
    if claims.get('role') not in ['admin', 'directivo', 'profesor']:
        return jsonify({'error': 'Sin permisos'}), 403
    data = request.get_json()
    creator_id = int(claims['sub'])

    grade = Grade(
        student_id=data['student_id'],
        course_subject_id=data['course_subject_id'],
        period_id=data['period_id'],
        value=float(data['value']),
        description=data.get('description'),
        grade_type=data.get('grade_type', 'nota'),
        created_by=creator_id
    )
    db.session.add(grade)
    db.session.commit()
    return jsonify(grade.to_dict()), 201

@grades_bp.route('/bulk', methods=['POST'])
@jwt_required()
def create_bulk_grades():
    """Calificar múltiples alumnos a la vez"""
    claims = get_jwt()
    if claims.get('role') not in ['admin', 'directivo', 'profesor']:
        return jsonify({'error': 'Sin permisos'}), 403
    data = request.get_json()
    creator_id = int(claims['sub'])
    grades_list = data.get('grades', [])
    created = []
    for g in grades_list:
        if g.get('value') is not None:
            grade = Grade(
                student_id=g['student_id'],
                course_subject_id=data['course_subject_id'],
                period_id=data['period_id'],
                value=float(g['value']),
                description=g.get('description'),
                grade_type=data.get('grade_type', 'nota'),
                created_by=creator_id
            )
            db.session.add(grade)
            created.append(grade)
    db.session.commit()
    return jsonify({'created': len(created), 'grades': [g.to_dict() for g in created]}), 201

@grades_bp.route('/<int:grade_id>', methods=['PUT'])
@jwt_required()
def update_grade(grade_id):
    claims = get_jwt()
    if claims.get('role') not in ['admin', 'directivo', 'profesor']:
        return jsonify({'error': 'Sin permisos'}), 403
    grade = Grade.query.get_or_404(grade_id)
    data = request.get_json()
    if 'value' in data:
        grade.value = float(data['value'])
    if 'description' in data:
        grade.description = data['description']
    db.session.commit()
    return jsonify(grade.to_dict()), 200

@grades_bp.route('/<int:grade_id>', methods=['DELETE'])
@jwt_required()
def delete_grade(grade_id):
    claims = get_jwt()
    if claims.get('role') not in ['admin', 'directivo', 'profesor']:
        return jsonify({'error': 'Sin permisos'}), 403
    grade = Grade.query.get_or_404(grade_id)
    db.session.delete(grade)
    db.session.commit()
    return jsonify({'message': 'Calificación eliminada'}), 200

@grades_bp.route('/summary/student/<int:student_id>', methods=['GET'])
@jwt_required()
def student_grade_summary(student_id):
    """Resumen de notas por asignatura para un alumno"""
    period_id = request.args.get('period_id', type=int)
    query = Grade.query.filter_by(student_id=student_id)
    if period_id:
        query = query.filter_by(period_id=period_id)
    grades = query.all()

    # Agrupar por asignatura
    by_subject = {}
    for g in grades:
        subj_name = g.course_subject.subject.name if g.course_subject and g.course_subject.subject else 'Sin asignatura'
        subj_id = g.course_subject.subject_id if g.course_subject else 0
        if subj_id not in by_subject:
            by_subject[subj_id] = {'subject_name': subj_name, 'grades': [], 'average': 0}
        by_subject[subj_id]['grades'].append(g.to_dict())

    for subj_id, data in by_subject.items():
        values = [g['value'] for g in data['grades']]
        data['average'] = round(sum(values) / len(values), 1) if values else 0
        data['count'] = len(values)

    return jsonify(list(by_subject.values())), 200
