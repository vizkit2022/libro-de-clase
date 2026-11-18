from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from models import db, Grade, CourseSubject, Enrollment, User, Period
from sqlalchemy import func
from datetime import datetime, date
from routes.access import (current_claims, allowed_student_ids, can_view_student, only_published, forbidden,
                           ensure_course_subject_open, ensure_course_open,
                           ensure_del_colegio, ensure_course_subject_del_colegio)

# Mismas reglas de visibilidad que el informe de personalidad (profesor: solo sus cursos)
from routes.personalidad import staff_required, _cursos_visibles, _matriculas, _estado

grades_bp = Blueprint('grades', __name__)

@grades_bp.route('/', methods=['GET'])
@jwt_required()
def get_grades():
    claims = get_jwt()
    me = current_claims()
    school_id = claims.get('school_id')
    student_id = request.args.get('student_id', type=int)
    course_subject_id = request.args.get('course_subject_id', type=int)
    period_id = request.args.get('period_id', type=int)

    query = Grade.query.join(User, Grade.student_id == User.id).filter(User.school_id == school_id)

    # Apoderado / alumno: solo sus alumnos y solo notas publicadas
    allowed = allowed_student_ids(me)
    if allowed is not None:
        if not allowed:
            return jsonify([]), 200
        query = query.filter(Grade.student_id.in_(allowed))
    if only_published(me):
        query = query.filter(Grade.is_published == True)

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
    sid = claims.get('school_id')
    ensure_del_colegio(User, data.get('student_id'), sid)
    ensure_course_subject_del_colegio(data.get('course_subject_id'), sid)
    ensure_del_colegio(Period, data.get('period_id'), sid)
    ensure_course_subject_open(data.get('course_subject_id'))

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
    sid = claims.get('school_id')
    ensure_course_subject_del_colegio(data.get('course_subject_id'), sid)
    ensure_del_colegio(Period, data.get('period_id'), sid)
    for g in grades_list:
        ensure_del_colegio(User, g.get('student_id'), sid)
    ensure_course_subject_open(data.get('course_subject_id'))
    created = []
    for g in grades_list:
        if g.get('value') is not None:
            published = bool(g.get('is_published', False))
            grade = Grade(
                student_id=g['student_id'],
                course_subject_id=data['course_subject_id'],
                period_id=data['period_id'],
                value=float(g['value']),
                description=g.get('description'),
                grade_type=data.get('grade_type', 'nota'),
                created_by=creator_id,
                is_published=published,
                published_at=datetime.utcnow() if published else None,
            )
            db.session.add(grade)
            created.append(grade)
    db.session.commit()
    return jsonify({'created': len(created), 'grades': [g.to_dict() for g in created]}), 201

def _nota_del_colegio(grade_id, school_id):
    return Grade.query.join(User, Grade.student_id == User.id).filter(
        Grade.id == grade_id, User.school_id == school_id).first_or_404()


@grades_bp.route('/<int:grade_id>', methods=['PUT'])
@jwt_required()
def update_grade(grade_id):
    claims = get_jwt()
    if claims.get('role') not in ['admin', 'directivo', 'profesor']:
        return jsonify({'error': 'Sin permisos'}), 403
    grade = _nota_del_colegio(grade_id, claims.get('school_id'))
    ensure_course_open(grade.course_subject.course if grade.course_subject else None)
    data = request.get_json()
    if 'value' in data:
        grade.value = float(data['value'])
    if 'description' in data:
        grade.description = data['description']
    if 'is_published' in data:
        grade.is_published = bool(data['is_published'])
        grade.published_at = datetime.utcnow() if grade.is_published else None
    db.session.commit()
    return jsonify(grade.to_dict()), 200

@grades_bp.route('/<int:grade_id>', methods=['DELETE'])
@jwt_required()
def delete_grade(grade_id):
    claims = get_jwt()
    if claims.get('role') not in ['admin', 'directivo', 'profesor']:
        return jsonify({'error': 'Sin permisos'}), 403
    grade = _nota_del_colegio(grade_id, claims.get('school_id'))
    ensure_course_open(grade.course_subject.course if grade.course_subject else None)
    db.session.delete(grade)
    db.session.commit()
    return jsonify({'message': 'Calificación eliminada'}), 200

@grades_bp.route('/summary/student/<int:student_id>', methods=['GET'])
@jwt_required()
def student_grade_summary(student_id):
    """Resumen de notas por asignatura para un alumno"""
    me = current_claims()
    if not can_view_student(me, student_id):
        return forbidden()
    if me['school_id']:
        ensure_del_colegio(User, student_id, me['school_id'])
    period_id = request.args.get('period_id', type=int)
    query = Grade.query.filter_by(student_id=student_id)
    if only_published(me):
        query = query.filter(Grade.is_published == True)
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


# ── Publicación de notas ─────────────────────────────────────────────
# Las notas recién ingresadas quedan como "no publicadas": solo las ve el equipo
# docente. Cuando el profesor publica, pasan a ser visibles para apoderados y alumnos.

def _ensure_grades_open(grades):
    """409 si alguna de las notas pertenece a un curso de un año cerrado."""
    vistos = set()
    for g in grades:
        cs = g.course_subject
        if cs and cs.course_id not in vistos:
            vistos.add(cs.course_id)
            ensure_course_open(cs.course)


def _publish_query(data, school_id):
    """Construye la consulta de notas a (des)publicar según los filtros recibidos."""
    q = Grade.query.join(User, Grade.student_id == User.id).filter(User.school_id == school_id)
    grade_ids = data.get('grade_ids')
    if grade_ids:
        return q.filter(Grade.id.in_([int(g) for g in grade_ids]))
    has_filter = False
    for key, col in (('course_subject_id', Grade.course_subject_id),
                     ('period_id', Grade.period_id),
                     ('student_id', Grade.student_id)):
        if data.get(key):
            q = q.filter(col == int(data[key]))
            has_filter = True
    return q if has_filter else None


@grades_bp.route('/publish', methods=['POST'])
@jwt_required()
def publish_grades():
    """Publica notas. Body: { grade_ids: [...] } o { course_subject_id, period_id, student_id } (cualquier combinación)."""
    claims = get_jwt()
    if claims.get('role') not in ['admin', 'directivo', 'profesor']:
        return forbidden()
    data = request.get_json() or {}
    q = _publish_query(data, claims.get('school_id'))
    if q is None:
        return jsonify({'error': 'Indica grade_ids o algún filtro (course_subject_id, period_id, student_id)'}), 400
    now = datetime.utcnow()
    count = 0
    pendientes = q.filter(Grade.is_published == False).all()
    _ensure_grades_open(pendientes)
    for g in pendientes:
        g.is_published = True
        g.published_at = now
        count += 1
    db.session.commit()
    return jsonify({'published': count}), 200


@grades_bp.route('/unpublish', methods=['POST'])
@jwt_required()
def unpublish_grades():
    """Retira la publicación de notas (mismos filtros que /publish)."""
    claims = get_jwt()
    if claims.get('role') not in ['admin', 'directivo', 'profesor']:
        return forbidden()
    data = request.get_json() or {}
    q = _publish_query(data, claims.get('school_id'))
    if q is None:
        return jsonify({'error': 'Indica grade_ids o algún filtro (course_subject_id, period_id, student_id)'}), 400
    count = 0
    publicadas = q.filter(Grade.is_published == True).all()
    _ensure_grades_open(publicadas)
    for g in publicadas:
        g.is_published = False
        g.published_at = None
        count += 1
    db.session.commit()
    return jsonify({'unpublished': count}), 200


# ── Resumen de notas por curso y alumno (mapa del colegio) ───────────────

def nota_a_puntaje(nota):
    """Lleva una nota chilena (1,0 a 7,0) a 0-100, con el 4,0 en 50 y el 7,0
    en 100, para sumarla con los demás criterios del mapa del colegio."""
    if nota is None:
        return None
    n = max(1.0, min(7.0, nota))
    p = (n - 1) / 3 * 50 if n < 4 else 50 + (n - 4) / 3 * 50
    return round(p)


def _promedio(vs):
    vs = [v for v in vs if v is not None]
    return sum(vs) / len(vs) if vs else None


@grades_bp.route('/resumen', methods=['GET'])
@jwt_required()
@staff_required
def resumen_notas():
    """Promedio de notas del año por curso y por alumno.

    El promedio del alumno es el de sus promedios por asignatura; el del
    curso, el de sus alumnos con notas. Cada uno va como nota (1-7) y como
    puntaje 0-100 (ver nota_a_puntaje)."""
    year = request.args.get('year', date.today().year, type=int)
    cursos = _cursos_visibles(year)
    ids = [c.id for c in cursos]
    filas = []
    if ids:
        filas = db.session.query(Grade.student_id, CourseSubject.course_id,
                                 CourseSubject.id, Grade.value)\
            .join(CourseSubject, Grade.course_subject_id == CourseSubject.id)\
            .filter(CourseSubject.course_id.in_(ids)).all()
    # {(curso, alumno): {asignatura: [notas]}}
    notas = {}
    for st, cid, csid, valor in filas:
        if valor is None or not 1 <= valor <= 7:
            continue
        notas.setdefault((cid, st), {}).setdefault(csid, []).append(valor)

    out = []
    for c in cursos:
        alumnos = []
        for m in _matriculas(c):
            if _estado(m) != 'activo':
                continue
            por_asig = notas.get((c.id, m.student_id), {})
            prom = _promedio([_promedio(vs) for vs in por_asig.values()])
            alumnos.append({
                'id': m.student_id, 'nombre': m.student.first_name,
                'apellido': m.student.last_name,
                'nota': round(prom, 1) if prom is not None else None,
                'puntaje': nota_a_puntaje(prom),
            })
        prom_c = _promedio([a['nota'] for a in alumnos])
        out.append({
            'id': c.id, 'nombre': c.name,
            'nota': round(prom_c, 1) if prom_c is not None else None,
            'puntaje': nota_a_puntaje(prom_c),
            'evaluados': sum(1 for a in alumnos if a['nota'] is not None),
            'alumnos': alumnos,
        })
    return jsonify({'year': year, 'cursos': out}), 200
