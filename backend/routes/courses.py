from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from models import db, Course, Enrollment, CourseSubject, User, StudentGuardian
from datetime import date

courses_bp = Blueprint('courses', __name__)

@courses_bp.route('/', methods=['GET'])
@jwt_required()
def get_courses():
    claims = get_jwt()
    school_id = claims.get('school_id')
    year = request.args.get('year', date.today().year, type=int)
    query = Course.query.filter_by(school_id=school_id, is_active=True)
    if year:
        query = query.filter_by(year=year)
    # Si es profesor, solo sus cursos
    if claims.get('role') == 'profesor':
        teacher_id = int(claims['sub'])
        query = query.filter_by(head_teacher_id=teacher_id)
    courses = query.order_by(Course.level, Course.letter).all()
    return jsonify([c.to_dict() for c in courses]), 200

@courses_bp.route('/<int:course_id>', methods=['GET'])
@jwt_required()
def get_course(course_id):
    claims = get_jwt()
    course = Course.query.filter_by(id=course_id, school_id=claims.get('school_id')).first_or_404()
    data = course.to_dict()
    data['students'] = [e.to_dict() for e in course.enrollments if e.is_active]
    data['subjects'] = [cs.to_dict() for cs in course.course_subjects]
    return jsonify(data), 200

@courses_bp.route('/', methods=['POST'])
@jwt_required()
def create_course():
    claims = get_jwt()
    if claims.get('role') not in ['admin', 'directivo']:
        return jsonify({'error': 'Sin permisos'}), 403
    school_id = claims.get('school_id')
    data = request.get_json()
    course = Course(
        school_id=school_id, name=data['name'],
        level=data.get('level'), letter=data.get('letter'),
        year=data.get('year', date.today().year),
        head_teacher_id=data.get('head_teacher_id'),
        description=data.get('description')
    )
    db.session.add(course)
    db.session.commit()
    return jsonify(course.to_dict()), 201

@courses_bp.route('/<int:course_id>', methods=['PUT'])
@jwt_required()
def update_course(course_id):
    claims = get_jwt()
    if claims.get('role') not in ['admin', 'directivo']:
        return jsonify({'error': 'Sin permisos'}), 403
    course = Course.query.filter_by(id=course_id, school_id=claims.get('school_id')).first_or_404()
    data = request.get_json()
    for field in ['name', 'level', 'letter', 'year', 'head_teacher_id', 'description', 'is_active']:
        if field in data:
            setattr(course, field, data[field])
    db.session.commit()
    return jsonify(course.to_dict()), 200

# Matricular alumno
@courses_bp.route('/<int:course_id>/enroll', methods=['POST'])
@jwt_required()
def enroll_student(course_id):
    claims = get_jwt()
    if claims.get('role') not in ['admin', 'directivo']:
        return jsonify({'error': 'Sin permisos'}), 403
    data = request.get_json()
    existing = Enrollment.query.filter_by(
        student_id=data['student_id'], course_id=course_id,
        year=data.get('year', date.today().year)
    ).first()
    if existing:
        existing.is_active = True
        db.session.commit()
        return jsonify(existing.to_dict()), 200
    enrollment = Enrollment(
        student_id=data['student_id'], course_id=course_id,
        year=data.get('year', date.today().year)
    )
    db.session.add(enrollment)
    db.session.commit()
    return jsonify(enrollment.to_dict()), 201

# Agregar asignatura al curso
@courses_bp.route('/<int:course_id>/subjects', methods=['POST'])
@jwt_required()
def add_subject(course_id):
    claims = get_jwt()
    if claims.get('role') not in ['admin', 'directivo']:
        return jsonify({'error': 'Sin permisos'}), 403
    data = request.get_json()
    cs = CourseSubject(
        course_id=course_id, subject_id=data['subject_id'],
        teacher_id=data.get('teacher_id'),
        hours_per_week=data.get('hours_per_week', 2)
    )
    db.session.add(cs)
    db.session.commit()
    return jsonify(cs.to_dict()), 201

# Apoderados del curso
@courses_bp.route('/<int:course_id>/guardians', methods=['GET'])
@jwt_required()
def get_guardians(course_id):
    claims = get_jwt()
    enrollments = Enrollment.query.filter_by(course_id=course_id, is_active=True).all()
    guardians = []
    for e in enrollments:
        sgs = StudentGuardian.query.filter_by(student_id=e.student_id).all()
        for sg in sgs:
            guardians.append({
                'student': e.student.to_dict() if e.student else None,
                'guardian': sg.guardian.to_dict() if sg.guardian else None,
                'relationship': sg.relationship
            })
    return jsonify(guardians), 200
