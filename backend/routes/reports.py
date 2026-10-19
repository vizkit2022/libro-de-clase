from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from models import db, Grade, Annotation, Enrollment, Course, User, Period, CourseSubject
from sqlalchemy import func
from routes.access import current_claims, can_view_student, only_published, is_staff, forbidden

reports_bp = Blueprint('reports', __name__)

@reports_bp.route('/course/<int:course_id>/grades', methods=['GET'])
@jwt_required()
def course_grades_report(course_id):
    """Informe de notas completo de un curso por período (solo equipo docente)"""
    me = current_claims()
    if not is_staff(me['role']):
        return forbidden()
    period_id = request.args.get('period_id', type=int)
    course = Course.query.filter_by(id=course_id, school_id=me['school_id']).first_or_404()
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
    """Hoja de vida completa del alumno.
    Apoderado: solo sus alumnos vinculados y solo notas publicadas. Alumno: solo él mismo."""
    me = current_claims()
    if not can_view_student(me, student_id):
        return forbidden()
    student = User.query.filter_by(id=student_id, school_id=me['school_id']).first_or_404()
    grades_q = Grade.query.filter_by(student_id=student_id)
    if only_published(me):
        grades_q = grades_q.filter(Grade.is_published == True)
    grades = grades_q.all()
    annotations = Annotation.query.filter_by(student_id=student_id).order_by(Annotation.date.desc()).all()
    enrollments = Enrollment.query.filter_by(student_id=student_id).all()

    enrollments_data = []
    for e in enrollments:
        d = e.to_dict()
        d['course_name'] = e.course.name if e.course else None
        enrollments_data.append(d)

    return jsonify({
        'student': student.to_dict(),
        'read_only': not is_staff(me['role']),
        'only_published': only_published(me),
        'enrollments': enrollments_data,
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
    if claims.get('role') not in ('admin', 'directivo', 'profesor', 'super_admin'):
        return forbidden()
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
