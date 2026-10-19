"""Matrícula: quién está en cada curso.

Los alumnos se identifican por nombre y apellido normalizados, que es lo que
pidió el colegio. Eso tiene un costo: dos homónimos se confunden entre sí y
cualquier diferencia de tilde o espacio crearía un duplicado. Por eso la
comparación ignora tildes, mayúsculas y espacios de más, y la importación
siempre pasa por una vista previa antes de tocar la base.
"""
import io
import re
import unicodedata
from datetime import date, datetime
from functools import wraps

from flask import Blueprint, request, jsonify, send_file, Response
from flask_jwt_extended import jwt_required, get_jwt

from models import (db, User, Course, Enrollment, StudentProfile, StudentHistory,
                    log_student_event)
from routes.access import ensure_year_open, year_is_closed

matricula_bp = Blueprint('matricula', __name__)

COLUMNAS = ['TIPO', 'nombre', 'apellido', 'rut', 'email', 'nivel', 'letra', 'año']


READ_ROLES = ('admin', 'directivo', 'profesor')
WRITE_ROLES = ('admin', 'directivo')

ESTADOS = {
    'activo': 'Activo', 'por_confirmar': 'Por confirmar', 'retirado': 'Retirado',
    'trasladado': 'Trasladado', 'no_continua': 'No continúa', 'egresado': 'Egresado',
}


def school_required(f):
    """Exige colegio. Lectura (GET): admin/directivo/profesor; escritura: admin/directivo."""
    @wraps(f)
    def decorated(*args, **kwargs):
        claims = get_jwt()
        if not claims.get('school_id'):
            return jsonify({'error': 'Sin colegio asignado'}), 403
        roles = READ_ROLES if request.method == 'GET' else WRITE_ROLES
        if claims.get('role') not in roles:
            return jsonify({'error': 'Sin permisos'}), 403
        return f(*args, **kwargs)
    return decorated


def _uid():
    try:
        return int(get_jwt().get('sub') or 0) or None
    except (TypeError, ValueError):
        return None


def _body():
    d = request.get_json(silent=True)
    return d if isinstance(d, dict) else {}


class _FechaInvalida(Exception):
    pass


@matricula_bp.errorhandler(_FechaInvalida)
def _fecha_invalida(err):
    db.session.rollback()
    return jsonify({'error': str(err)}), 400


def _fecha(valor, campo='fecha'):
    """'2026-10-19' / '19-10-2026' / '19/10/2026' → date; vacío → hoy."""
    if valor in (None, ''):
        return date.today()
    s = str(valor).strip()[:10]
    try:
        return date.fromisoformat(s)
    except ValueError:
        for fmt in ('%d-%m-%Y', '%d/%m/%Y'):
            try:
                return datetime.strptime(s, fmt).date()
            except ValueError:
                pass
    raise _FechaInvalida(f'Fecha inválida en {campo}: {valor}')


def _motivo(d):
    m = d.get('motivo')
    return str(m).strip() or None if m is not None else None


def _estado(e):
    return e.status or ('activo' if e.is_active else 'retirado')


def _enrollment_del_colegio(eid, sid):
    e = Enrollment.query.get_or_404(eid)
    curso = Course.query.filter_by(id=e.course_id, school_id=sid).first_or_404()
    return e, curso


def _otra_activa(e):
    """Otra matrícula activa del mismo alumno en el mismo año (o None)."""
    return Enrollment.query.filter(
        Enrollment.student_id == e.student_id, Enrollment.year == e.year,
        Enrollment.status == 'activo', Enrollment.id != e.id).first()


def _profile(student_id, crear=False):
    p = StudentProfile.query.filter_by(student_id=student_id).first()
    if not p and crear:
        p = StudentProfile(student_id=student_id, status='matriculado', id_type='RUN')
        db.session.add(p)
    return p


def _perfil_reincorporado(student_id):
    """Al volver a matricular a un retirado su ficha vuelve a 'matriculado'."""
    p = _profile(student_id)
    if p and p.status == 'retirado':
        p.status = 'matriculado'
        p.withdrawal_date = None
        p.withdrawal_reason = None


def _fmt(d):
    return d.strftime('%d-%m-%Y') if d else ''


def _sid():
    return get_jwt().get('school_id')


def _year():
    from datetime import date
    return request.args.get('year', date.today().year, type=int)


def clave_nombre(nombre, apellido):
    """Clave de comparación: sin tildes, sin mayúsculas, sin espacios de más.

    'José  Pérez Soto' y 'jose perez  soto' son la misma persona.
    """
    texto = f'{nombre or ""} {apellido or ""}'.strip().lower()
    texto = unicodedata.normalize('NFKD', texto).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', texto).strip()


def limpiar_rut(rut):
    if not rut:
        return None
    r = re.sub(r'[^0-9kK]', '', str(rut)).upper()
    return r or None


# ── Cursos y sus alumnos ──────────────────────────────────────────────

@matricula_bp.route('/cursos', methods=['GET'])
@jwt_required()
@school_required
def listar_cursos():
    """Cursos del año con cuántos alumnos tiene cada uno."""
    sid, year = _sid(), _year()
    cursos = Course.query.filter_by(school_id=sid, year=year, is_active=True)\
        .order_by(Course.level, Course.letter).all()

    conteo = {}
    for cid, st, n in (db.session.query(Enrollment.course_id, Enrollment.status,
                                        db.func.count(Enrollment.id))
                       .filter(Enrollment.year == year)
                       .group_by(Enrollment.course_id, Enrollment.status).all()):
        conteo[(cid, st)] = n

    def contar(cid, *estados):
        return sum(conteo.get((cid, e), 0) for e in estados)

    cerrado = year_is_closed(sid, year)
    return jsonify([{
        'id': c.id, 'nombre': c.name, 'nivel': c.level, 'letra': c.letter,
        'year': c.year, 'alumnos': contar(c.id, 'activo'),
        'por_confirmar': contar(c.id, 'por_confirmar'),
        'retirados': contar(c.id, 'retirado', 'trasladado', 'no_continua'),
        'cerrado': cerrado,
        'profesor_jefe': (f'{c.head_teacher.first_name} {c.head_teacher.last_name}'
                          if c.head_teacher else None),
    } for c in cursos]), 200


@matricula_bp.route('/cursos/<int:curso_id>/alumnos', methods=['GET'])
@jwt_required()
@school_required
def alumnos_del_curso(curso_id):
    """Todos los alumnos del curso, con su estado (activos y por confirmar primero)."""
    sid = _sid()
    curso = Course.query.filter_by(id=curso_id, school_id=sid).first_or_404()
    filas = Enrollment.query.filter_by(course_id=curso_id).all()
    origenes = {}
    ids_origen = [e.promoted_from_id for e in filas if e.promoted_from_id]
    if ids_origen:
        for o in Enrollment.query.filter(Enrollment.id.in_(ids_origen)).all():
            oc = Course.query.get(o.course_id)
            origenes[o.id] = oc.name if oc else None
    alumnos = []
    for e in filas:
        if not e.student:
            continue
        estado = _estado(e)
        alumnos.append({
            'enrollment_id': e.id, 'id': e.student.id,
            'nombre': e.student.first_name, 'apellido': e.student.last_name,
            'rut': e.student.rut, 'email': e.student.email,
            'activo': e.student.is_active,
            'estado': estado,
            'fecha_matricula': e.enrollment_date.isoformat() if e.enrollment_date else None,
            'fecha_retiro': e.withdrawal_date.isoformat() if e.withdrawal_date else None,
            'motivo_retiro': e.withdrawal_reason,
            'confirmado_at': e.confirmed_at.isoformat() if e.confirmed_at else None,
            'promovido_desde': origenes.get(e.promoted_from_id),
        })
    alumnos.sort(key=lambda a: (0 if a['estado'] in ('activo', 'por_confirmar') else 1,
                                clave_nombre(a['apellido'], a['nombre'])))
    return jsonify({
        'curso': {'id': curso.id, 'nombre': curso.name, 'year': curso.year,
                  'cerrado': year_is_closed(sid, curso.year)},
        'alumnos': alumnos,
    }), 200


# ── Alta y retiro manual ──────────────────────────────────────────────

def _correo_interno(nombre, apellido, sid):
    """Correo técnico para alumnos sin cuenta: el modelo User lo exige único.

    No sirve para iniciar sesión; el alumno queda inactivo.
    """
    base = clave_nombre(nombre, apellido).replace(' ', '.') or 'alumno'
    correo = f'{base}@alumno.local'
    i = 1
    while User.query.filter_by(email=correo).first():
        i += 1
        correo = f'{base}{i}@alumno.local'
    return correo


@matricula_bp.route('/cursos/<int:curso_id>/alumnos', methods=['POST'])
@jwt_required()
@school_required
def matricular(curso_id):
    """Matricula un alumno: lo reutiliza si ya existe, o lo crea.

    Body: nombre, apellido, rut?, email?, fecha? (fecha de matrícula, por defecto hoy).
    """
    sid = _sid()
    curso = Course.query.filter_by(id=curso_id, school_id=sid).first_or_404()
    ensure_year_open(sid, curso.year)
    d = _body()
    nombre = (d.get('nombre') or '').strip()
    apellido = (d.get('apellido') or '').strip()
    if not nombre or not apellido:
        return jsonify({'error': 'El nombre y el apellido son obligatorios'}), 400
    fecha = _fecha(d.get('fecha'))

    alumno = _buscar_alumno(sid, nombre, apellido)
    creado = False
    if not alumno:
        alumno = User(
            school_id=sid, first_name=nombre, last_name=apellido,
            rut=limpiar_rut(d.get('rut')),
            email=(d.get('email') or '').strip() or _correo_interno(nombre, apellido, sid),
            role='alumno', is_active=False)       # registro, sin acceso
        alumno.set_password('sin-acceso')
        db.session.add(alumno)
        db.session.flush()
        creado = True

    ya = Enrollment.query.filter_by(
        student_id=alumno.id, course_id=curso.id,
        year=curso.year, status='activo').first()
    if ya:
        return jsonify({'error': f'{nombre} {apellido} ya está en {curso.name}'}), 409

    # Un alumno no puede estar en dos cursos el mismo año
    previas = Enrollment.query.filter(
        Enrollment.student_id == alumno.id, Enrollment.year == curso.year,
        Enrollment.course_id != curso.id,
        Enrollment.status.in_(('activo', 'por_confirmar'))).all()
    movido_de = None
    for p in previas:
        otro = Course.query.get(p.course_id)
        movido_de = otro.name if otro else None
        p.status = 'trasladado'
        p.is_active = False
        p.withdrawal_date = fecha
        log_student_event(alumno.id, 'cambio_curso',
                          f'Cambio de curso: de {movido_de or "—"} a {curso.name}',
                          sid, year=curso.year, course_id=curso.id,
                          from_course_id=p.course_id, user_id=_uid())

    # Si ya tuvo una matrícula en este curso (retirado, por confirmar…), se reutiliza
    e = Enrollment.query.filter_by(student_id=alumno.id, course_id=curso.id,
                                   year=curso.year).order_by(Enrollment.id.desc()).first()
    if e:
        e.status = 'activo'
        e.is_active = True
        e.enrollment_date = fecha
        e.withdrawal_date = None
        e.withdrawal_reason = None
        if e.confirmed_at is None and e.promoted_from_id:
            e.confirmed_at = datetime.utcnow()
    else:
        e = Enrollment(student_id=alumno.id, course_id=curso.id, year=curso.year,
                       is_active=True, status='activo', enrollment_date=fecha)
        db.session.add(e)
    _perfil_reincorporado(alumno.id)
    db.session.flush()
    log_student_event(alumno.id, 'matricula',
                      f'Matriculado en {curso.name} ({curso.year}) el {_fmt(fecha)}',
                      sid, year=curso.year, course_id=curso.id, user_id=_uid())
    db.session.commit()
    return jsonify({'ok': True, 'creado': creado, 'movido_de': movido_de,
                    'enrollment_id': e.id,
                    'alumno': {'id': alumno.id, 'nombre': nombre, 'apellido': apellido}}), 201


@matricula_bp.route('/enrollments/<int:eid>', methods=['DELETE'])
@jwt_required()
@school_required
def retirar(eid):
    """Retira del curso sin borrar al alumno ni su historial.

    Body opcional: {"fecha": "2026-10-19", "motivo": "Cambio de colegio"}.
    """
    sid = _sid()
    e, curso = _enrollment_del_colegio(eid, sid)
    ensure_year_open(sid, e.year if e.year is not None else curso.year)
    d = _body()
    fecha = _fecha(d.get('fecha'))
    motivo = _motivo(d)
    antes = _estado(e)
    e.status = 'retirado'
    e.is_active = False
    e.withdrawal_date = fecha
    if motivo is not None or antes != 'retirado':
        e.withdrawal_reason = motivo

    # La ficha queda 'retirado' si no le queda otra matrícula activa ese año
    if not _otra_activa(e):
        p = _profile(e.student_id, crear=True)
        p.status = 'retirado'
        p.withdrawal_date = fecha
        if motivo is not None:
            p.withdrawal_reason = motivo
    if antes != 'retirado':
        log_student_event(
            e.student_id, 'retiro',
            f'Retirado de {curso.name} el {_fmt(fecha)}' + (f'. Motivo: {motivo}' if motivo else ''),
            sid, year=e.year, course_id=curso.id, user_id=_uid(),
            details={'motivo': motivo, 'fecha': fecha.isoformat()})
    db.session.commit()
    return jsonify({'ok': True, 'curso': curso.name, 'estado': e.status,
                    'fecha_retiro': fecha.isoformat(), 'motivo_retiro': e.withdrawal_reason}), 200


@matricula_bp.route('/enrollments/<int:eid>/cambiar-curso', methods=['POST'])
@jwt_required()
@school_required
def cambiar_curso(eid):
    """Traslada al alumno a otro curso del mismo año.

    Body: {"course_id": 7, "fecha": "2026-10-19", "motivo": opcional}.
    """
    sid = _sid()
    e, origen = _enrollment_del_colegio(eid, sid)
    d = _body()
    try:
        destino_id = int(d.get('course_id'))
    except (TypeError, ValueError):
        return jsonify({'error': 'Indica el curso de destino (course_id)'}), 400
    destino = Course.query.filter_by(id=destino_id, school_id=sid).first()
    if not destino:
        return jsonify({'error': 'Curso de destino no encontrado'}), 404
    year = e.year if e.year is not None else origen.year
    ensure_year_open(sid, year)
    if destino.id == origen.id:
        return jsonify({'error': 'El alumno ya está en ese curso'}), 400
    if destino.year != year:
        return jsonify({'error': f'El curso de destino debe ser del año {year}'}), 400
    estado = _estado(e)
    if estado not in ('activo', 'por_confirmar'):
        return jsonify({'error': 'Solo se puede cambiar de curso una matrícula activa o por confirmar'}), 400
    fecha = _fecha(d.get('fecha'))
    motivo = _motivo(d)

    if estado == 'por_confirmar':
        # Aún no empieza el año: se cambia el curso de la misma matrícula
        e.course_id = destino.id
        nueva = e
    else:
        e.status = 'trasladado'
        e.is_active = False
        e.withdrawal_date = fecha
        e.withdrawal_reason = motivo
        nueva = Enrollment.query.filter_by(student_id=e.student_id, course_id=destino.id,
                                           year=year).order_by(Enrollment.id.desc()).first()
        if nueva:
            nueva.status = 'activo'
            nueva.is_active = True
            nueva.enrollment_date = fecha
            nueva.withdrawal_date = None
            nueva.withdrawal_reason = None
        else:
            nueva = Enrollment(student_id=e.student_id, course_id=destino.id, year=year,
                               status='activo', is_active=True, enrollment_date=fecha)
            db.session.add(nueva)
    db.session.flush()
    log_student_event(
        e.student_id, 'cambio_curso',
        f'Cambio de curso: de {origen.name} a {destino.name} el {_fmt(fecha)}'
        + (f'. Motivo: {motivo}' if motivo else ''),
        sid, year=year, course_id=destino.id, from_course_id=origen.id, user_id=_uid(),
        details={'motivo': motivo, 'fecha': fecha.isoformat()})
    db.session.commit()
    return jsonify({'ok': True, 'desde': origen.name, 'hacia': destino.name,
                    'enrollment_id': nueva.id, 'estado': nueva.status}), 200


@matricula_bp.route('/enrollments/<int:eid>/reincorporar', methods=['POST'])
@jwt_required()
@school_required
def reincorporar(eid):
    """Vuelve a dejar activa una matrícula retirada (o 'no continúa')."""
    sid = _sid()
    e, curso = _enrollment_del_colegio(eid, sid)
    ensure_year_open(sid, e.year if e.year is not None else curso.year)
    if _estado(e) not in ('retirado', 'no_continua'):
        return jsonify({'error': 'Solo se puede reincorporar una matrícula retirada o que no continúa'}), 400
    otra = _otra_activa(e)
    if otra:
        oc = Course.query.get(otra.course_id)
        return jsonify({'error': f'El alumno ya tiene matrícula activa en {oc.name if oc else "otro curso"}'}), 409
    fecha = _fecha(_body().get('fecha'))
    e.status = 'activo'
    e.is_active = True
    e.withdrawal_date = None
    e.withdrawal_reason = None
    if not e.enrollment_date:
        e.enrollment_date = fecha
    if e.promoted_from_id and not e.confirmed_at:
        e.confirmed_at = datetime.utcnow()
    _perfil_reincorporado(e.student_id)
    log_student_event(e.student_id, 'reincorporacion',
                      f'Reincorporado a {curso.name} el {_fmt(fecha)}',
                      sid, year=e.year, course_id=curso.id, user_id=_uid())
    db.session.commit()
    return jsonify({'ok': True, 'curso': curso.name, 'estado': e.status}), 200


def _curso_repite(e, sid):
    """Curso del año de `e` con el mismo nivel que tenía el alumno el año anterior."""
    from routes.anios import pick_course, course_rank
    origen = Enrollment.query.get(e.promoted_from_id) if e.promoted_from_id else None
    oc = Course.query.get(origen.course_id) if origen else None
    if not oc:
        return None, None
    candidatos = Course.query.filter_by(school_id=sid, year=e.year, is_active=True).all()
    mismos = [c for c in candidatos if (c.level or '') == (oc.level or '') and c.level]
    if not mismos:
        r = course_rank(oc)
        mismos = [c for c in candidatos if r is not None and course_rank(c) == r]
    return pick_course(mismos, oc.letter), oc


def _confirmar(e, curso, sid, fecha):
    e.status = 'activo'
    e.is_active = True
    e.enrollment_date = fecha
    e.confirmed_at = datetime.utcnow()
    log_student_event(e.student_id, 'confirmacion',
                      f'Matrícula confirmada en {curso.name} ({e.year}) el {_fmt(fecha)}',
                      sid, year=e.year, course_id=curso.id, user_id=_uid())


@matricula_bp.route('/enrollments/<int:eid>/confirmar', methods=['POST'])
@jwt_required()
@school_required
def confirmar(eid):
    """Resuelve una matrícula 'por confirmar' (alumno promovido desde el año anterior).

    Body: {"accion": "confirmar"|"repite"|"no_continua", "fecha": opcional, "motivo": opcional}.
    """
    sid = _sid()
    e, curso = _enrollment_del_colegio(eid, sid)
    ensure_year_open(sid, e.year if e.year is not None else curso.year)
    if _estado(e) != 'por_confirmar':
        return jsonify({'error': 'Esta matrícula no está por confirmar'}), 400
    d = _body()
    accion = (d.get('accion') or 'confirmar').strip().lower()
    fecha = _fecha(d.get('fecha'))
    motivo = _motivo(d)

    if accion == 'confirmar':
        _confirmar(e, curso, sid, fecha)
    elif accion == 'repite':
        destino, anterior = _curso_repite(e, sid)
        if not anterior:
            return jsonify({'error': 'No se sabe en qué curso estaba el alumno el año anterior'}), 400
        if not destino:
            return jsonify({'error': f'No existe un curso de {anterior.level or anterior.name} en {e.year}'}), 400
        e.course_id = destino.id
        e.status = 'activo'
        e.is_active = True
        e.enrollment_date = fecha
        e.confirmed_at = datetime.utcnow()
        log_student_event(e.student_id, 'repite',
                          f'Repite {anterior.level or anterior.name}: queda en {destino.name} ({e.year})'
                          + (f'. Motivo: {motivo}' if motivo else ''),
                          sid, year=e.year, course_id=destino.id, from_course_id=curso.id,
                          user_id=_uid())
        curso = destino
    elif accion == 'no_continua':
        e.status = 'no_continua'
        e.is_active = False
        e.withdrawal_date = fecha
        e.withdrawal_reason = motivo
        e.confirmed_at = datetime.utcnow()
        log_student_event(e.student_id, 'no_continua',
                          f'No continúa en {e.year} (informado el {_fmt(fecha)})'
                          + (f'. Motivo: {motivo}' if motivo else ''),
                          sid, year=e.year, course_id=curso.id, user_id=_uid(),
                          details={'motivo': motivo, 'fecha': fecha.isoformat()})
    else:
        return jsonify({'error': 'Acción inválida (confirmar | repite | no_continua)'}), 400
    db.session.commit()
    return jsonify({'ok': True, 'enrollment_id': e.id, 'estado': e.status,
                    'curso': {'id': curso.id, 'nombre': curso.name}}), 200


@matricula_bp.route('/cursos/<int:curso_id>/confirmar-todos', methods=['POST'])
@jwt_required()
@school_required
def confirmar_todos(curso_id):
    sid = _sid()
    curso = Course.query.filter_by(id=curso_id, school_id=sid).first_or_404()
    ensure_year_open(sid, curso.year)
    fecha = _fecha(_body().get('fecha'))
    filas = Enrollment.query.filter_by(course_id=curso.id, status='por_confirmar').all()
    for e in filas:
        _confirmar(e, curso, sid, fecha)
    db.session.commit()
    return jsonify({'ok': True, 'confirmados': len(filas)}), 200


# ── Historial y ficha PDF del alumno ──────────────────────────────────

def _alumno_del_colegio(student_id, sid):
    return User.query.filter_by(id=student_id, school_id=sid, role='alumno').first_or_404()


@matricula_bp.route('/alumnos/<int:student_id>/historial', methods=['GET'])
@jwt_required()
@school_required
def historial(student_id):
    sid = _sid()
    alumno = _alumno_del_colegio(student_id, sid)
    eventos = StudentHistory.query.filter_by(student_id=alumno.id)\
        .filter((StudentHistory.school_id == sid) | (StudentHistory.school_id.is_(None)))\
        .order_by(StudentHistory.created_at.desc(), StudentHistory.id.desc()).all()
    return jsonify({
        'alumno': {'id': alumno.id, 'nombre': f'{alumno.first_name} {alumno.last_name}'.strip(),
                   'rut': alumno.rut},
        'eventos': [{
            'id': h.id,
            'fecha': h.created_at.isoformat() if h.created_at else None,
            'evento': h.event,
            'descripcion': h.description,
            'detalles': h.get_details(),
            'year': h.year,
            'curso': h.course.name if h.course else None,
            'curso_origen': h.from_course.name if h.from_course else None,
            'usuario': (f'{h.actor.first_name} {h.actor.last_name}'.strip() if h.actor else None),
        } for h in eventos],
    }), 200


def _slug(texto):
    t = unicodedata.normalize('NFKD', str(texto or '')).encode('ascii', 'ignore').decode()
    t = re.sub(r'[^A-Za-z0-9]+', '_', t).strip('_')
    return t or 'sin_dato'


@matricula_bp.route('/alumnos/<int:student_id>/ficha.pdf', methods=['GET'])
@jwt_required()
@school_required
def ficha_pdf(student_id):
    """Ficha de matrícula oficial en PDF (servicios/ficha_matricula_pdf.py)."""
    sid = _sid()
    alumno = _alumno_del_colegio(student_id, sid)
    year = request.args.get('year', type=int)
    q = Enrollment.query.join(Course, Enrollment.course_id == Course.id)\
        .filter(Enrollment.student_id == alumno.id, Course.school_id == sid)
    if year:
        q = q.filter(Enrollment.year == year)
    matriculas = q.order_by(Enrollment.id.desc()).all()
    e = next((m for m in matriculas if _estado(m) == 'activo'), None) \
        or (matriculas[0] if matriculas else None)
    if not year:
        year = e.year if e and e.year else date.today().year
    try:
        from servicios.ficha_matricula_pdf import build_ficha_pdf
    except ImportError:
        return jsonify({'error': 'La ficha de matrícula en PDF aún no está disponible'}), 503
    try:
        pdf = build_ficha_pdf(alumno.id, year)
    except Exception as ex:  # noqa: BLE001
        db.session.rollback()
        print(f'[ficha.pdf] error al generar la ficha del alumno {alumno.id}: {ex!r}')
        return jsonify({'error': 'No se pudo generar la ficha de matrícula en PDF'}), 500
    curso = e.course.name if e and e.course else 'sin_curso'
    nombre = f'ficha_matricula_{_slug(curso)}_{_slug(alumno.last_name)}.pdf'
    return Response(pdf, mimetype='application/pdf', headers={
        'Content-Disposition': f'attachment; filename="{nombre}"',
        'Content-Length': str(len(pdf)),
        'Cache-Control': 'private, no-store',
    })


def _buscar_alumno(sid, nombre, apellido):
    """Busca por nombre y apellido normalizados, como pidió el colegio."""
    objetivo = clave_nombre(nombre, apellido)
    for u in User.query.filter_by(school_id=sid, role='alumno').all():
        if clave_nombre(u.first_name, u.last_name) == objetivo:
            return u
    return None


# ── Importación desde planilla ────────────────────────────────────────

def _leer_planilla(archivo):
    """Devuelve (filas, error). Acepta .xlsx, .xls y .csv."""
    nombre = (archivo.filename or '').lower()
    datos = archivo.read()

    if nombre.endswith(('.xlsx', '.xlsm', '.xls')):
        try:
            from openpyxl import load_workbook
            wb = load_workbook(io.BytesIO(datos), data_only=True)
            hoja = wb.active
            filas = [[('' if c is None else str(c).strip()) for c in fila]
                     for fila in hoja.iter_rows(values_only=True)]
        except Exception as e:
            return None, f'No se pudo leer el Excel: {e}'
    else:
        import csv
        for codif in ('utf-8-sig', 'latin-1'):
            try:
                texto = datos.decode(codif)
                break
            except UnicodeDecodeError:
                continue
        else:
            return None, 'No se pudo interpretar el archivo'
        # Detectar si separa por coma o punto y coma
        muestra = texto[:2000]
        sep = ';' if muestra.count(';') > muestra.count(',') else ','
        filas = [[c.strip() for c in f] for f in csv.reader(io.StringIO(texto), delimiter=sep)]

    filas = [f for f in filas if any(c for c in f)]
    return filas, None


@matricula_bp.route('/importar/previsualizar', methods=['POST'])
@jwt_required()
@school_required
def previsualizar():
    """Lee la planilla y dice qué pasaría, sin tocar nada.

    Clasifica cada fila en: nueva, ya en el curso, cambio de curso, o error.
    """
    sid, year = _sid(), _year()
    archivo = request.files.get('archivo')
    if not archivo:
        return jsonify({'error': 'No se envió ningún archivo'}), 400

    filas, error = _leer_planilla(archivo)
    if error:
        return jsonify({'error': error}), 400
    if not filas:
        return jsonify({'error': 'La planilla está vacía'}), 400

    # Mapear los encabezados, tolerando mayúsculas y tildes
    cabecera = [clave_nombre(c, '') for c in filas[0]]
    def col(*nombres):
        for n in nombres:
            if n in cabecera:
                return cabecera.index(n)
        return None

    i_tipo = col('tipo')
    i_nom, i_ape = col('nombre', 'nombres'), col('apellido', 'apellidos')
    i_rut, i_mail = col('rut'), col('email', 'correo')
    i_niv, i_let = col('nivel', 'curso'), col('letra')

    if i_nom is None or i_ape is None:
        return jsonify({
            'error': 'La planilla debe tener columnas "nombre" y "apellido".',
            'encabezados_leidos': filas[0],
        }), 400
    if i_niv is None:
        return jsonify({'error': 'Falta la columna "nivel" (o "curso")'}), 400

    cursos = {}
    for c in Course.query.filter_by(school_id=sid, year=year, is_active=True).all():
        cursos[clave_nombre(c.name, '')] = c
        if c.level and c.letter:
            cursos[clave_nombre(f'{c.level} {c.letter}', '')] = c

    # Alumnos existentes y en qué curso están
    existentes = {}
    for u in User.query.filter_by(school_id=sid, role='alumno').all():
        existentes[clave_nombre(u.first_name, u.last_name)] = u
    matriculados = {}
    for e in Enrollment.query.filter_by(year=year, status='activo').all():
        matriculados[e.student_id] = e.course_id

    items, vistos = [], {}
    for n, fila in enumerate(filas[1:], start=2):
        def celda(i):
            return (fila[i].strip() if i is not None and i < len(fila) else '')

        if i_tipo is not None and celda(i_tipo).lower().startswith('curso'):
            continue              # filas de encabezado de curso: se ignoran

        nombre, apellido = celda(i_nom), celda(i_ape)
        if not nombre and not apellido:
            continue

        nivel, letra = celda(i_niv), celda(i_let)
        destino = cursos.get(clave_nombre(f'{nivel} {letra}'.strip(), '')) \
            or cursos.get(clave_nombre(nivel, ''))

        item = {
            'fila': n, 'nombre': nombre, 'apellido': apellido,
            'rut': limpiar_rut(celda(i_rut)), 'email': celda(i_mail),
            'curso_texto': f'{nivel} {letra}'.strip(),
            'curso_id': destino.id if destino else None,
            'curso_nombre': destino.name if destino else None,
        }

        if not nombre or not apellido:
            item.update(estado='error', detalle='Falta el nombre o el apellido')
        elif not destino:
            item.update(estado='error',
                        detalle=f'No existe el curso "{item["curso_texto"]}" en {year}')
        else:
            clave = clave_nombre(nombre, apellido)
            if clave in vistos:
                item.update(estado='error',
                            detalle=f'Repetido en la planilla (fila {vistos[clave]})')
            else:
                vistos[clave] = n
                alumno = existentes.get(clave)
                if not alumno:
                    item.update(estado='nuevo', detalle='Se crea y se matricula')
                else:
                    item['alumno_id'] = alumno.id
                    actual = matriculados.get(alumno.id)
                    if actual == destino.id:
                        item.update(estado='sin_cambio',
                                    detalle=f'Ya está en {destino.name}')
                    elif actual:
                        otro = Course.query.get(actual)
                        item.update(estado='cambio_curso',
                                    desde=otro.name if otro else '—',
                                    detalle=f'Cambia de {otro.name if otro else "—"} '
                                            f'a {destino.name}')
                    else:
                        item.update(estado='rematricula',
                                    detalle=f'Ya existe, se matricula en {destino.name}')
        items.append(item)

    resumen = {}
    for it in items:
        resumen[it['estado']] = resumen.get(it['estado'], 0) + 1

    return jsonify({
        'year': year, 'total': len(items), 'resumen': resumen, 'items': items,
        'cursos_disponibles': sorted({c.name for c in cursos.values()}),
    }), 200


@matricula_bp.route('/importar/aplicar', methods=['POST'])
@jwt_required()
@school_required
def aplicar():
    """Aplica solo las filas que el usuario aprobó en la vista previa."""
    sid, year = _sid(), _year()
    d = request.get_json() or {}
    items = d.get('items')
    if not isinstance(items, list):
        return jsonify({'error': 'Falta la lista de filas a aplicar'}), 400

    ensure_year_open(sid, year)
    cursos_validos = {c.id: c for c in Course.query.filter_by(school_id=sid, year=year).all()}
    validos = set(cursos_validos)
    hecho = {'creados': 0, 'matriculados': 0, 'movidos': 0, 'omitidos': 0}
    hoy = date.today()

    for it in items:
        curso_id = it.get('curso_id')
        nombre = (it.get('nombre') or '').strip()
        apellido = (it.get('apellido') or '').strip()
        if curso_id not in validos or not nombre or not apellido:
            hecho['omitidos'] += 1
            continue
        curso = cursos_validos[curso_id]

        alumno = _buscar_alumno(sid, nombre, apellido)
        if not alumno:
            alumno = User(
                school_id=sid, first_name=nombre, last_name=apellido,
                rut=limpiar_rut(it.get('rut')),
                email=(it.get('email') or '').strip() or _correo_interno(nombre, apellido, sid),
                role='alumno', is_active=False)
            alumno.set_password('sin-acceso')
            db.session.add(alumno)
            db.session.flush()
            hecho['creados'] += 1

        ya = Enrollment.query.filter_by(student_id=alumno.id, course_id=curso_id,
                                        year=year, status='activo').first()
        if ya:
            hecho['omitidos'] += 1
            continue

        previas = Enrollment.query.filter_by(
            student_id=alumno.id, year=year, status='activo').all()
        for p in previas:
            p.status = 'trasladado'
            p.is_active = False
            p.withdrawal_date = hoy
            hecho['movidos'] += 1
            log_student_event(alumno.id, 'cambio_curso',
                              f'Cambio de curso por importación de planilla: a {curso.name}',
                              sid, year=year, course_id=curso_id, from_course_id=p.course_id,
                              user_id=_uid())

        db.session.add(Enrollment(student_id=alumno.id, course_id=curso_id, year=year,
                                  is_active=True, status='activo', enrollment_date=hoy))
        log_student_event(alumno.id, 'matricula',
                          f'Matriculado en {curso.name} ({year}) por importación de planilla',
                          sid, year=year, course_id=curso_id, user_id=_uid())
        hecho['matriculados'] += 1

    db.session.commit()
    return jsonify({'ok': True, 'year': year, **hecho}), 200


@matricula_bp.route('/plantilla.xlsx', methods=['GET'])
@jwt_required()
@school_required
def plantilla():
    """Planilla de ejemplo con los cursos reales del colegio."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment

    sid, year = _sid(), _year()
    cursos = Course.query.filter_by(school_id=sid, year=year, is_active=True)\
        .order_by(Course.level, Course.letter).all()

    wb = Workbook()
    h = wb.active
    h.title = 'Matrícula'
    cab = ['nombre', 'apellido', 'rut', 'email', 'nivel', 'letra']
    h.append(cab)
    for i, _ in enumerate(cab, start=1):
        c = h.cell(row=1, column=i)
        c.font = Font(bold=True, color='FFFFFF')
        c.fill = PatternFill('solid', fgColor='3B4FD8')
        c.alignment = Alignment(horizontal='center')

    ejemplo = cursos[0] if cursos else None
    h.append(['María José', 'González Rojas', '21.345.678-9', '',
              ejemplo.level if ejemplo else '7° Básico',
              ejemplo.letter if ejemplo else 'A'])
    h.append(['Pedro', 'Muñoz Silva', '21.987.654-3', '',
              ejemplo.level if ejemplo else '7° Básico',
              ejemplo.letter if ejemplo else 'A'])

    for col, ancho in zip('ABCDEF', (20, 26, 15, 26, 16, 8)):
        h.column_dimensions[col].width = ancho

    ref = wb.create_sheet('Cursos disponibles')
    ref.append(['nivel', 'letra', 'nombre del curso'])
    for c in ref[1]:
        c.font = Font(bold=True)
    for c in cursos:
        ref.append([c.level, c.letter, c.name])
    for col, ancho in zip('ABC', (18, 8, 24)):
        ref.column_dimensions[col].width = ancho

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return send_file(buf, as_attachment=True,
                     download_name=f'Plantilla_matricula_{year}.xlsx',
                     mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
