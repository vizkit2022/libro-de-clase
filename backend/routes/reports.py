from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from models import db, Grade, Annotation, Enrollment, Course, User, Period, CourseSubject
from sqlalchemy import func

reports_bp = Blueprint('reports', __name__)

@reports_bp.route('/course/<int:course_id>/grades', methods=['GET'])
@jwt_required()
def course_grades_report(course_id):
    """Informe de notas completo de un curso por período"""
    period_id = request.args.get('period_id', type=int)
    course = Course.query.get_or_404(course_id)
    enrollments = Enrollment.query.filter_by(course_id=course_id, is_active=True).all()

    report = {'course': course.to_dict(), 'students': []}
    for enrollment in enrollments:
        student = enrollment.student
        q = Grade.query.filter_by(student_id=student.id)
        if period_id:
            q = q.filter_by(period_id=period_id)
        grades = q.all()

        by_subject = {}
        for g in grades:
            cs = g.course_subject
            if cs and cs.course_id == course_id:
                subj_id = cs.subject_id
                subj_name = cs.subject.name if cs.subject else '?'
                if subj_id not in by_subject:
                    by_subject[subj_id] = {'subject': subj_name, 'grades': [], 'average': 0}
                by_subject[subj_id]['grades'].append(g.value)

        for subj_id, data in by_subject.items():
            vals = data['grades']
            data['average'] = round(sum(vals) / len(vals), 1) if vals else 0

        all_avgs = [d['average'] for d in by_subject.values() if d['average'] > 0]
        general_avg = round(sum(all_avgs) / len(all_avgs), 1) if all_avgs else 0

        report['students'].append({
            'student': student.to_dict(),
            'subjects': list(by_subject.values()),
            'general_average': general_avg
        })

    report['students'].sort(key=lambda x: x['student']['last_name'])
    return jsonify(report), 200

@reports_bp.route('/student/<int:student_id>/life', methods=['GET'])
@jwt_required()
def student_life_report(student_id):
    """Hoja de vida completa del alumno"""
    student = User.query.get_or_404(student_id)
    grades = Grade.query.filter_by(student_id=student_id).all()
    annotations = Annotation.query.filter_by(student_id=student_id).order_by(Annotation.date.desc()).all()
    enrollments = Enrollment.query.filter_by(student_id=student_id).all()

    return jsonify({
        'student': student.to_dict(),
        'enrollments': [e.to_dict() for e in enrollments],
        'grades': [g.to_dict() for g in grades],
        'annotations': [a.to_dict() for a in annotations],
        'annotations_summary': {
            'positive': len([a for a in annotations if a.annotation_type == 'positiva']),
            'negative': len([a for a in annotations if a.annotation_type == 'negativa']),
            'neutral': len([a for a in annotations if a.annotation_type == 'neutral']),
            'academic': len([a for a in annotations if a.annotation_type == 'academica']),
        }
    }), 200

@reports_bp.route('/school/summary', methods=['GET'])
@jwt_required()
def school_summary():
    """Resumen general del colegio"""
    claims = get_jwt()
    school_id = claims.get('school_id')
    year = request.args.get('year', 2026, type=int)

    total_students = User.query.filter_by(school_id=school_id, role='alumno', is_active=True).count()
    total_teachers = User.query.filter_by(school_id=school_id, role='profesor', is_active=True).count()
    total_courses = Course.query.filter_by(school_id=school_id, year=year, is_active=True).count()
    total_annotations_pos = db.session.query(func.count(Annotation.id)).join(
        User, Annotation.student_id == User.id
    ).filter(User.school_id == school_id, Annotation.annotation_type == 'positiva').scalar()
    total_annotations_neg = db.session.query(func.count(Annotation.id)).join(
        User, Annotation.student_id == User.id
    ).filter(User.school_id == school_id, Annotation.annotation_type == 'negativa').scalar()

    return jsonify({
        'total_students': total_students,
        'total_teachers': total_teachers,
        'total_courses': total_courses,
        'annotations_positive': total_annotations_pos,
        'annotations_negative': total_annotations_neg,
        'year': year
    }), 200
