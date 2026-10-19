"""Años académicos: listado, creación copiando el año anterior, cierre y reapertura.

Un año cerrado queda en solo lectura: no se cambian notas, anotaciones,
matrículas ni asignaturas de sus cursos (ver routes/access.ensure_year_open).
Solo un administrador puede reabrirlo, y queda registrado quién y cuándo.

Crear el año N+1 copia cursos (con profesor jefe), asignaturas por curso,
períodos (fechas +1 año) y promueve a los alumnos activos al nivel siguiente
con la matrícula «por confirmar». Quienes están en el último nivel del colegio
egresan: no se crean en N+1 y se anota el egreso en su historial.
"""
import re
import unicodedata
from datetime import date, datetime

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy.exc import IntegrityError

from models import (db, AcademicYear, Course, CourseSubject, Enrollment, Period, User,
                    log_student_event)
from routes.access import current_claims, forbidden, year_is_closed, closed_year_message

anios_bp = Blueprint('anios', __name__)

READ_ROLES = ('admin', 'directivo', 'profesor')
WRITE_ROLES = ('admin', 'directivo')


# ── Niveles ─────────────────────────────────────────────────────────────

def _sin_tildes(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', s).strip().lower()


def level_rank(level):
    """Orden del nivel: Pre-Kinder 0 < Kinder 1 < 1° Básico 2 … 8° Básico 9 <
    1° Medio 10 … 4° Medio 13. None si no se reconoce."""
    s = _sin_tildes(level)
    if not s:
        return None
    compacto = s.replace('-', '').replace(' ', '')
    if compacto in ('prekinder', 'prekinde', 'nt1', 'prek') or compacto.startswith('prekinder'):
        return 0
    if compacto in ('kinder', 'kinde', 'nt2', 'k') or compacto.startswith('kinder'):
        return 1
    m = re.search(r'(\d+)\s*(?:°|º|o|ro|do|to|vo|no|er)?\.?\s*(?:ano\s+)?(basic|medi|eb|em)', s)
    if m:
        n = int(m.group(1))
        tipo = m.group(2)
        if tipo in ('basic', 'eb') and 1 <= n <= 8:
            return 1 + n
        if tipo in ('medi', 'em') and 1 <= n <= 4:
            return 9 + n
    return None


def course_rank(course):
    r = level_rank(course.level)
    if r is None:
        r = level_rank(re.sub(r'\s+[A-Za-z]$', '', course.name or ''))
    return r


def pick_course(candidates, letter):
    """Curso de destino: misma letra; si no, el único; si hay varios, la 'A'."""
    if not candidates:
        return None
    letter = (letter or '').strip().upper()
    for c in candidates:
        if letter and (c.letter or '').strip().upper() == letter:
            return c
    if len(candidates) == 1:
        return candidates[0]
    for c in candidates:
        if (c.letter or '').strip().upper() == 'A':
            return c
    return sorted(candidates, key=lambda c: ((c.letter or ''), c.id))[0]


# ── Filas de años (creación perezosa) ───────────────────────────────────

def get_or_create_year(school_id, year):
    """Fila AcademicYear del año (la crea 'abierto' si falta). No hace commit."""
    row = AcademicYear.query.filter_by(school_id=school_id, year=year).first()
    if not row:
        row = AcademicYear(school_id=school_id, year=year, status='abierto')
        db.session.add(row)
        db.session.flush()
    return row


def ensure_year_rows(school_id):
    """Crea filas 'abierto' para cada año con cursos y para el año calendario."""
    years = {y for (y,) in db.session.query(Course.year)
             .filter(Course.school_id == school_id, Course.year.isnot(None)).distinct()}
    years.add(date.today().year)
    existing = {r.year for r in AcademicYear.query.filter_by(school_id=school_id).all()}
    faltan = sorted(years - existing)
    if not faltan:
        return
    try:
        for y in faltan:
            db.session.add(AcademicYear(school_id=school_id, year=y, status='abierto'))
        db.session.commit()
    except IntegrityError:
        db.session.rollback()     # otra request las creó en paralelo


def current_year(school_id):
    """Mayor año 'abierto' <= año calendario; si no hay, el año calendario."""
    hoy = date.today().year
    row = AcademicYear.query.filter(
        AcademicYear.school_id == school_id, AcademicYear.status == 'abierto',
        AcademicYear.year <= hoy).order_by(AcademicYear.year.desc()).first()
    return row.year if row else hoy


def _nombre(u):
    return f'{u.first_name} {u.last_name}'.strip() if u else None


def _iso(dt):
    return dt.isoformat() if dt else None


def _year_dict(row, cursos, activos, por_confirmar):
    return {
        'year': row.year,
        'estado': row.status or 'abierto',
        'cursos': cursos,
        'alumnos_activos': activos,
        'por_confirmar': por_confirmar,
        'created_from_year': row.created_from_year,
        'closed_at': _iso(row.closed_at),
        'closed_by_name': _nombre(row.closer),
        'reopened_at': _iso(row.reopened_at),
        'reopened_by_name': _nombre(row.reopener),
    }


def _me_or_error(roles):
    me = current_claims()
    if not me['school_id'] or me['role'] not in roles:
        return me, forbidden()
    return me, None


# ── Endpoints ───────────────────────────────────────────────────────────

@anios_bp.route('', methods=['GET'])
@anios_bp.route('/', methods=['GET'])
@jwt_required()
def listar_anios():
    me, err = _me_or_error(READ_ROLES)
    if err:
        return err
    sid = me['school_id']
    ensure_year_rows(sid)

    cursos = dict(db.session.query(Course.year, db.func.count(Course.id))
                  .filter(Course.school_id == sid, Course.is_active.is_(True))
                  .group_by(Course.year).all())
    conteos = {}
    for y, st, n in (db.session.query(Course.year, Enrollment.status, db.func.count(Enrollment.id))
                     .join(Course, Enrollment.course_id == Course.id)
                     .filter(Course.school_id == sid,
                             Enrollment.status.in_(('activo', 'por_confirmar')))
                     .group_by(Course.year, Enrollment.status).all()):
        conteos[(y, st)] = n

    rows = AcademicYear.query.filter_by(school_id=sid).order_by(AcademicYear.year.desc()).all()
    return jsonify({
        'actual': current_year(sid),
        'anios': [_year_dict(r, cursos.get(r.year, 0), conteos.get((r.year, 'activo'), 0),
                             conteos.get((r.year, 'por_confirmar'), 0)) for r in rows],
    }), 200


def _shift_date(d, years):
    if not d:
        return None
    try:
        return d.replace(year=d.year + years)
    except ValueError:          # 29 de febrero → 28
        return d.replace(year=d.year + years, day=28)


@anios_bp.route('', methods=['POST'])
@anios_bp.route('/', methods=['POST'])
@jwt_required()
def crear_anio():
    me, err = _me_or_error(WRITE_ROLES)
    if err:
        return err
    sid = me['school_id']
    d = request.get_json(silent=True) or {}
    try:
        year = int(d.get('year'))
    except (TypeError, ValueError):
        return jsonify({'error': 'Indica el año a crear (year)'}), 400
    if not 2000 <= year <= 2100:
        return jsonify({'error': 'El año debe estar entre 2000 y 2100'}), 400

    origen = d.get('copiar_de')
    if origen in (None, ''):
        origen = None
    else:
        try:
            origen = int(origen)
        except (TypeError, ValueError):
            return jsonify({'error': 'copiar_de debe ser un año'}), 400
        if origen == year:
            return jsonify({'error': 'No se puede copiar un año sobre sí mismo'}), 400

    copiar = d.get('copiar') if isinstance(d.get('copiar'), dict) else {}
    por_defecto = origen is not None
    flags = {k: bool(copiar.get(k, por_defecto)) and origen is not None
             for k in ('cursos', 'asignaturas', 'periodos', 'alumnos')}
    if flags['alumnos'] and not flags['cursos']:
        return jsonify({'error': 'Para promover alumnos hay que copiar también los cursos'}), 400
    if flags['asignaturas'] and not flags['cursos']:
        return jsonify({'error': 'Para copiar asignaturas hay que copiar también los cursos'}), 400

    if Course.query.filter_by(school_id=sid, year=year).count():
        return jsonify({'error': f'El año {year} ya existe y tiene cursos'}), 409
    if year_is_closed(sid, year):
        return jsonify({'error': closed_year_message(year)}), 409

    fuente = []
    if origen is not None:
        fuente = Course.query.filter_by(school_id=sid, year=origen, is_active=True)\
            .order_by(Course.level, Course.letter, Course.id).all()
        if flags['cursos'] and not fuente:
            return jsonify({'error': f'El año {origen} no tiene cursos para copiar'}), 400

    fila = get_or_create_year(sid, year)
    if origen is not None:
        fila.created_from_year = origen
        get_or_create_year(sid, origen)

    res = {'year': year, 'cursos_creados': 0, 'asignaturas_copiadas': 0,
           'periodos_copiados': 0, 'alumnos_promovidos': 0, 'egresados': 0,
           'sin_curso_destino': [], 'mapa': []}

    # Cursos (+ asignaturas)
    nuevos = {}                   # id curso origen → curso nuevo
    if flags['cursos']:
        for c in fuente:
            n = Course(school_id=sid, name=c.name, level=c.level, letter=c.letter,
                       year=year, head_teacher_id=c.head_teacher_id,
                       description=c.description, is_active=True)
            db.session.add(n)
            nuevos[c.id] = n
        db.session.flush()
        res['cursos_creados'] = len(nuevos)
        if flags['asignaturas']:
            for c in fuente:
                for cs in CourseSubject.query.filter_by(course_id=c.id).all():
                    db.session.add(CourseSubject(course_id=nuevos[c.id].id, subject_id=cs.subject_id,
                                                 teacher_id=cs.teacher_id,
                                                 hours_per_week=cs.hours_per_week))
                    res['asignaturas_copiadas'] += 1

    # Períodos
    if flags['periodos']:
        delta = year - origen
        ya = {(p.period_type, p.number) for p in Period.query.filter_by(school_id=sid, year=year)}
        for p in Period.query.filter_by(school_id=sid, year=origen).order_by(Period.number).all():
            if (p.period_type, p.number) in ya:
                continue
            db.session.add(Period(
                school_id=sid, name=(p.name or '').replace(str(origen), str(year)) or p.name,
                period_type=p.period_type, year=year, number=p.number,
                start_date=_shift_date(p.start_date, delta), end_date=_shift_date(p.end_date, delta),
                is_active=p.is_active))
            res['periodos_copiados'] += 1

    # Mapa de promoción y alumnos
    if flags['cursos']:
        rangos = [r for r in (course_rank(c) for c in fuente) if r is not None]
        maximo = max(rangos) if rangos else None
        por_rango = {}
        for n in nuevos.values():
            r = course_rank(n)
            if r is not None:
                por_rango.setdefault(r, []).append(n)

        destino_de = {}           # id curso origen → (curso destino | None, egresa)
        for c in fuente:
            r = course_rank(c)
            if r is not None and maximo is not None and r == maximo:
                destino_de[c.id] = (None, True)
            elif r is None:
                destino_de[c.id] = (None, False)
            else:
                destino_de[c.id] = (pick_course(por_rango.get(r + 1, []), c.letter), False)
            dest, egresa = destino_de[c.id]
            res['mapa'].append({'desde': c.name, 'hacia': dest.name if dest else None,
                                'egresa': egresa})

        if flags['alumnos']:
            actor = me['user_id'] or None
            for c in fuente:
                dest, egresa = destino_de[c.id]
                matriculas = Enrollment.query.filter_by(course_id=c.id, status='activo').all()
                for e in matriculas:
                    if e.year is not None and e.year != origen:
                        continue
                    alumno = e.student
                    nombre = _nombre(alumno) or f'Alumno {e.student_id}'
                    if egresa:
                        log_student_event(
                            e.student_id, 'egreso',
                            f'Egresa de {c.name} al terminar el año {origen}',
                            sid, year=origen, course_id=c.id, user_id=actor)
                        res['egresados'] += 1
                        continue
                    if not dest:
                        res['sin_curso_destino'].append({'alumno': nombre, 'desde': c.name})
                        continue
                    db.session.add(Enrollment(
                        student_id=e.student_id, course_id=dest.id, year=year,
                        status='por_confirmar', is_active=False, promoted_from_id=e.id))
                    log_student_event(
                        e.student_id, 'promocion',
                        f'Promovido de {c.name} ({origen}) a {dest.name} ({year}), por confirmar',
                        sid, year=year, course_id=dest.id, from_course_id=c.id, user_id=actor)
                    res['alumnos_promovidos'] += 1

    db.session.commit()
    return jsonify(res), 201


def _admin_or_error():
    me = current_claims()
    if not me['school_id'] or me['role'] != 'admin':
        return me, forbidden('Solo un administrador puede cerrar o reabrir un año')
    return me, None


@anios_bp.route('/<int:year>/cerrar', methods=['POST'])
@jwt_required()
def cerrar_anio(year):
    me, err = _admin_or_error()
    if err:
        return err
    row = get_or_create_year(me['school_id'], year)
    if row.status != 'cerrado':
        row.status = 'cerrado'
        row.closed_at = datetime.utcnow()
        row.closed_by = me['user_id'] or None
    db.session.commit()
    return jsonify({'year': row.year, 'estado': row.status, 'closed_at': _iso(row.closed_at),
                    'closed_by_name': _nombre(row.closer)}), 200


@anios_bp.route('/<int:year>/reabrir', methods=['POST'])
@jwt_required()
def reabrir_anio(year):
    me, err = _admin_or_error()
    if err:
        return err
    row = get_or_create_year(me['school_id'], year)
    if row.status != 'abierto':
        row.status = 'abierto'
        row.reopened_at = datetime.utcnow()
        row.reopened_by = me['user_id'] or None
    db.session.commit()
    return jsonify({'year': row.year, 'estado': row.status, 'reopened_at': _iso(row.reopened_at),
                    'reopened_by_name': _nombre(row.reopener)}), 200
