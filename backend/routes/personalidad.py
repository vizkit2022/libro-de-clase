"""Informe de personalidad: pauta por colegio y respuestas por alumno y semestre.

La pauta (áreas y criterios) la administra dirección: se pueden agregar
criterios nuevos o desactivar los que ya no se usan. Desactivar no borra lo
respondido; solo deja de aparecer en el formulario y en el PDF.

El profesor llena el informe desde el curso: ve los cursos donde es profesor
jefe o hace clases. Admin y directivo ven todos.
"""
import re
import unicodedata
from datetime import date
from functools import wraps

from flask import Blueprint, request, jsonify, Response
from flask_jwt_extended import jwt_required, get_jwt
from sqlalchemy import or_

from models import (db, User, Course, Enrollment, CourseSubject, PersonalidadArea,
                    PersonalidadCriterio, PersonalidadRespuesta, PersonalidadObservacion,
                    PERSONALIDAD_ESCALA, PERSONALIDAD_VALORES, ensure_personalidad_pauta)
from routes.access import ensure_course_open

personalidad_bp = Blueprint('personalidad', __name__)

STAFF = ('admin', 'directivo', 'profesor')
GESTION = ('admin', 'directivo')
SEMESTRES = (1, 2)


def staff_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        claims = get_jwt()
        if not claims.get('school_id'):
            return jsonify({'error': 'Sin colegio asignado'}), 403
        if claims.get('role') not in STAFF:
            return jsonify({'error': 'Sin permisos'}), 403
        return f(*args, **kwargs)
    return decorated


def gestion_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if get_jwt().get('role') not in GESTION:
            return jsonify({'error': 'Solo administración y dirección pueden cambiar la pauta'}), 403
        return f(*args, **kwargs)
    return decorated


def _sid():
    return get_jwt().get('school_id')


def _uid():
    try:
        return int(get_jwt().get('sub') or 0) or None
    except (TypeError, ValueError):
        return None


def _body():
    d = request.get_json(silent=True)
    return d if isinstance(d, dict) else {}


def _slug(texto):
    t = unicodedata.normalize('NFKD', str(texto or '')).encode('ascii', 'ignore').decode()
    t = re.sub(r'[^A-Za-z0-9]+', '_', t).strip('_')
    return t or 'sin_dato'


# ── Pauta ────────────────────────────────────────────────────────────────

def pauta(school_id, solo_activos=True):
    """Áreas con sus criterios, en orden. Carga la pauta base la primera vez."""
    if ensure_personalidad_pauta(school_id):
        db.session.commit()
    areas = PersonalidadArea.query.filter_by(school_id=school_id)\
        .order_by(PersonalidadArea.orden, PersonalidadArea.id).all()
    out = []
    for a in areas:
        if solo_activos and not a.is_active:
            continue
        crit = [c for c in a.criterios if c.is_active or not solo_activos]
        if solo_activos and not crit:
            continue
        out.append((a, crit))
    return out


def pauta_dict(school_id, solo_activos=True):
    """Igual que pauta(), serializada. Los criterios activos se numeran en
    orden corrido (1, 2, 3...) como en el informe impreso."""
    n = 0
    areas = []
    for a, crit in pauta(school_id, solo_activos):
        items = []
        for c in crit:
            numero = None
            if c.is_active and a.is_active:
                n += 1
                numero = n
            items.append({'id': c.id, 'texto': c.texto, 'orden': c.orden,
                          'is_active': bool(c.is_active), 'numero': numero})
        areas.append({'id': a.id, 'nombre': a.nombre, 'orden': a.orden,
                      'is_active': bool(a.is_active), 'criterios': items})
    return areas


def _criterios_activos(school_id):
    return [c for _a, crit in pauta(school_id) for c in crit]


@personalidad_bp.route('/pauta', methods=['GET'])
@jwt_required()
@staff_required
def get_pauta():
    todos = request.args.get('todos') in ('1', 'true')
    return jsonify({
        'escala': [{'valor': k, 'nombre': v} for k, v in PERSONALIDAD_ESCALA],
        'areas': pauta_dict(_sid(), solo_activos=not todos),
    }), 200


def _area(aid):
    return PersonalidadArea.query.filter_by(id=aid, school_id=_sid()).first_or_404()


def _criterio(cid):
    return PersonalidadCriterio.query.filter_by(id=cid, school_id=_sid()).first_or_404()


def _mover(obj, hermanos, direccion):
    """Intercambia el orden con el vecino de arriba o abajo."""
    hermanos = sorted(hermanos, key=lambda x: (x.orden or 0, x.id))
    for i, h in enumerate(hermanos):   # normaliza: 1, 2, 3...
        h.orden = i + 1
    i = hermanos.index(obj)
    j = i + (1 if direccion > 0 else -1)
    if 0 <= j < len(hermanos):
        hermanos[i].orden, hermanos[j].orden = hermanos[j].orden, hermanos[i].orden


@personalidad_bp.route('/areas', methods=['POST'])
@jwt_required()
@staff_required
@gestion_required
def crear_area():
    nombre = str(_body().get('nombre') or '').strip()
    if not nombre:
        return jsonify({'error': 'Escribe el nombre del área'}), 400
    sid = _sid()
    ensure_personalidad_pauta(sid)
    ultimo = db.session.query(db.func.max(PersonalidadArea.orden))\
        .filter_by(school_id=sid).scalar() or 0
    db.session.add(PersonalidadArea(school_id=sid, nombre=nombre[:200], orden=ultimo + 1))
    db.session.commit()
    return jsonify({'areas': pauta_dict(sid, solo_activos=False)}), 201


@personalidad_bp.route('/areas/<int:aid>', methods=['PUT'])
@jwt_required()
@staff_required
@gestion_required
def editar_area(aid):
    a = _area(aid)
    d = _body()
    if 'nombre' in d:
        nombre = str(d.get('nombre') or '').strip()
        if not nombre:
            return jsonify({'error': 'El área necesita un nombre'}), 400
        a.nombre = nombre[:200]
    if 'is_active' in d:
        a.is_active = bool(d['is_active'])
    db.session.commit()
    return jsonify({'areas': pauta_dict(_sid(), solo_activos=False)}), 200


@personalidad_bp.route('/areas/<int:aid>/mover', methods=['POST'])
@jwt_required()
@staff_required
@gestion_required
def mover_area(aid):
    a = _area(aid)
    _mover(a, PersonalidadArea.query.filter_by(school_id=_sid()).all(),
           int(_body().get('dir') or 1))
    db.session.commit()
    return jsonify({'areas': pauta_dict(_sid(), solo_activos=False)}), 200


@personalidad_bp.route('/criterios', methods=['POST'])
@jwt_required()
@staff_required
@gestion_required
def crear_criterio():
    d = _body()
    texto = str(d.get('texto') or '').strip()
    if not texto:
        return jsonify({'error': 'Escribe el criterio'}), 400
    try:
        a = _area(int(d.get('area_id')))
    except (TypeError, ValueError):
        return jsonify({'error': 'Elige el área del criterio'}), 400
    ultimo = db.session.query(db.func.max(PersonalidadCriterio.orden))\
        .filter_by(area_id=a.id).scalar() or 0
    db.session.add(PersonalidadCriterio(school_id=a.school_id, area_id=a.id,
                                        texto=texto, orden=ultimo + 1))
    db.session.commit()
    return jsonify({'areas': pauta_dict(_sid(), solo_activos=False)}), 201


@personalidad_bp.route('/criterios/<int:cid>', methods=['PUT'])
@jwt_required()
@staff_required
@gestion_required
def editar_criterio(cid):
    c = _criterio(cid)
    d = _body()
    if 'texto' in d:
        texto = str(d.get('texto') or '').strip()
        if not texto:
            return jsonify({'error': 'El criterio no puede quedar vacío'}), 400
        c.texto = texto
    if 'is_active' in d:
        c.is_active = bool(d['is_active'])
    if d.get('area_id') and int(d['area_id']) != c.area_id:
        destino = _area(int(d['area_id']))
        ultimo = db.session.query(db.func.max(PersonalidadCriterio.orden))\
            .filter_by(area_id=destino.id).scalar() or 0
        c.area_id, c.orden = destino.id, ultimo + 1
    db.session.commit()
    return jsonify({'areas': pauta_dict(_sid(), solo_activos=False)}), 200


@personalidad_bp.route('/criterios/<int:cid>/mover', methods=['POST'])
@jwt_required()
@staff_required
@gestion_required
def mover_criterio(cid):
    c = _criterio(cid)
    _mover(c, PersonalidadCriterio.query.filter_by(area_id=c.area_id).all(),
           int(_body().get('dir') or 1))
    db.session.commit()
    return jsonify({'areas': pauta_dict(_sid(), solo_activos=False)}), 200


# ── Cursos y alumnos ─────────────────────────────────────────────────────

def _cursos_visibles(year):
    claims = get_jwt()
    q = Course.query.filter_by(school_id=claims.get('school_id'), is_active=True)
    if year:
        q = q.filter(Course.year == year)
    if claims.get('role') == 'profesor':
        uid = _uid()
        dicta = db.session.query(CourseSubject.course_id).filter_by(teacher_id=uid)
        q = q.filter(or_(Course.head_teacher_id == uid, Course.id.in_(dicta)))
    return q.order_by(Course.level, Course.letter, Course.name).all()


def _curso(course_id):
    """Curso del colegio que el usuario puede ver (profesor: solo los suyos)."""
    c = Course.query.filter_by(id=course_id, school_id=_sid()).first_or_404()
    if get_jwt().get('role') == 'profesor':
        uid = _uid()
        dicta = CourseSubject.query.filter_by(course_id=c.id, teacher_id=uid).first()
        if c.head_teacher_id != uid and not dicta:
            from flask import abort, make_response
            abort(make_response(jsonify({'error': 'Este curso no está a tu cargo'}), 403))
    return c


def _estado(e):
    return e.status or ('activo' if e.is_active else 'retirado')


def _matriculas(curso):
    """Matrículas del curso (también retirados, que se muestran tachados)."""
    ms = Enrollment.query.filter_by(course_id=curso.id).all()
    if curso.year:
        ms = [m for m in ms if m.year in (None, curso.year)]
    vistos, out = set(), []
    for m in sorted(ms, key=lambda m: (_estado(m) != 'activo', -m.id)):
        if m.student_id in vistos or not m.student:
            continue
        vistos.add(m.student_id)
        out.append(m)
    return sorted(out, key=lambda m: (_estado(m) != 'activo',
                                      _clave(m.student.last_name), _clave(m.student.first_name)))


def _clave(t):
    return unicodedata.normalize('NFKD', (t or '').lower()).encode('ascii', 'ignore').decode()


def _avance(student_ids, year, criterio_ids):
    """{student_id: {1: n, 2: n}} con cuántos criterios activos tiene respondidos."""
    out = {s: {1: 0, 2: 0} for s in student_ids}
    if not student_ids or not criterio_ids:
        return out
    filas = db.session.query(PersonalidadRespuesta.student_id, PersonalidadRespuesta.semestre,
                             db.func.count(PersonalidadRespuesta.id))\
        .filter(PersonalidadRespuesta.student_id.in_(student_ids),
                PersonalidadRespuesta.year == year,
                PersonalidadRespuesta.criterio_id.in_(criterio_ids))\
        .group_by(PersonalidadRespuesta.student_id, PersonalidadRespuesta.semestre).all()
    for s, sem, n in filas:
        if s in out and sem in out[s]:
            out[s][sem] = n
    return out


def _year_de(curso):
    return curso.year or date.today().year


@personalidad_bp.route('/cursos', methods=['GET'])
@jwt_required()
@staff_required
def cursos():
    year = request.args.get('year', date.today().year, type=int)
    crit_ids = [c.id for c in _criterios_activos(_sid())]
    uid = _uid()
    out = []
    for c in _cursos_visibles(year):
        activos = [m.student_id for m in _matriculas(c) if _estado(m) == 'activo']
        av = _avance(activos, _year_de(c), crit_ids)
        total = len(crit_ids)
        out.append({
            'id': c.id, 'nombre': c.name, 'year': c.year,
            'profesor_jefe': (f'{c.head_teacher.first_name} {c.head_teacher.last_name}'.strip()
                              if c.head_teacher else None),
            'soy_jefe': c.head_teacher_id == uid,
            'alumnos': len(activos),
            'completos': {str(s): sum(1 for a in activos if total and av[a][s] >= total)
                          for s in SEMESTRES},
        })
    return jsonify({'cursos': out, 'criterios': len(crit_ids)}), 200


@personalidad_bp.route('/cursos/<int:course_id>', methods=['GET'])
@jwt_required()
@staff_required
def curso_detalle(course_id):
    c = _curso(course_id)
    crit_ids = [x.id for x in _criterios_activos(c.school_id)]
    ms = _matriculas(c)
    av = _avance([m.student_id for m in ms], _year_de(c), crit_ids)
    return jsonify({
        'curso': {'id': c.id, 'nombre': c.name, 'year': _year_de(c),
                  'profesor_jefe': (f'{c.head_teacher.first_name} {c.head_teacher.last_name}'.strip()
                                    if c.head_teacher else None)},
        'criterios': len(crit_ids),
        'alumnos': [{
            'id': m.student_id,
            'nombre': m.student.first_name, 'apellido': m.student.last_name,
            'rut': m.student.rut, 'estado': _estado(m),
            'avance': {str(s): av[m.student_id][s] for s in SEMESTRES},
        } for m in ms],
    }), 200


def _alumno_en_curso(curso, student_id):
    m = next((m for m in _matriculas(curso) if m.student_id == student_id), None)
    if m is None:
        from flask import abort, make_response
        abort(make_response(jsonify({'error': 'El alumno no está en este curso'}), 404))
    return m


def respuestas_de(student_id, year):
    """({semestre: {criterio_id: valor}}, {semestre: observacion})"""
    resp = {s: {} for s in SEMESTRES}
    for r in PersonalidadRespuesta.query.filter_by(student_id=student_id, year=year).all():
        if r.semestre in resp:
            resp[r.semestre][r.criterio_id] = r.valor
    obs = {s: '' for s in SEMESTRES}
    for o in PersonalidadObservacion.query.filter_by(student_id=student_id, year=year).all():
        if o.semestre in obs:
            obs[o.semestre] = o.texto or ''
    return resp, obs


@personalidad_bp.route('/cursos/<int:course_id>/alumnos/<int:student_id>', methods=['GET'])
@jwt_required()
@staff_required
def informe_alumno(course_id, student_id):
    c = _curso(course_id)
    m = _alumno_en_curso(c, student_id)
    year = _year_de(c)
    resp, obs = respuestas_de(student_id, year)
    a = m.student
    return jsonify({
        'curso': {'id': c.id, 'nombre': c.name, 'year': year},
        'alumno': {'id': a.id, 'nombre': a.first_name, 'apellido': a.last_name,
                   'rut': a.rut, 'estado': _estado(m)},
        'escala': [{'valor': k, 'nombre': v} for k, v in PERSONALIDAD_ESCALA],
        'areas': pauta_dict(c.school_id),
        'respuestas': {str(s): {str(k): v for k, v in resp[s].items()} for s in SEMESTRES},
        'observaciones': {str(s): obs[s] for s in SEMESTRES},
    }), 200


@personalidad_bp.route('/cursos/<int:course_id>/alumnos/<int:student_id>', methods=['PUT'])
@jwt_required()
@staff_required
def guardar_informe(course_id, student_id):
    c = _curso(course_id)
    ensure_course_open(c)
    _alumno_en_curso(c, student_id)
    d = _body()
    try:
        semestre = int(d.get('semestre'))
    except (TypeError, ValueError):
        semestre = None
    if semestre not in SEMESTRES:
        return jsonify({'error': 'Indica el semestre (1 o 2)'}), 400
    year = _year_de(c)
    validos = {x.id for x in _criterios_activos(c.school_id)}
    entrantes = d.get('respuestas') if isinstance(d.get('respuestas'), dict) else {}
    nuevas = {}
    for k, v in entrantes.items():
        try:
            cid = int(k)
        except (TypeError, ValueError):
            continue
        if cid not in validos:
            continue
        v = str(v or '').strip().upper()
        if v and v not in PERSONALIDAD_VALORES:
            return jsonify({'error': f'Valor no válido: {v}'}), 400
        nuevas[cid] = v
    uid = _uid()
    existentes = {r.criterio_id: r for r in PersonalidadRespuesta.query.filter_by(
        student_id=student_id, year=year, semestre=semestre).all()}
    for cid, v in nuevas.items():
        r = existentes.get(cid)
        if not v:
            if r:
                db.session.delete(r)
        elif r:
            if r.valor != v:
                r.valor, r.updated_by = v, uid
        else:
            db.session.add(PersonalidadRespuesta(school_id=c.school_id, student_id=student_id,
                                                 criterio_id=cid, year=year, semestre=semestre,
                                                 valor=v, updated_by=uid))
    if 'observacion' in d:
        texto = str(d.get('observacion') or '').strip()
        o = PersonalidadObservacion.query.filter_by(student_id=student_id, year=year,
                                                    semestre=semestre).first()
        if o:
            o.texto, o.updated_by = texto, uid
        elif texto:
            db.session.add(PersonalidadObservacion(school_id=c.school_id, student_id=student_id,
                                                   year=year, semestre=semestre, texto=texto,
                                                   updated_by=uid))
    db.session.commit()
    resp, obs = respuestas_de(student_id, year)
    return jsonify({
        'respuestas': {str(s): {str(k): v for k, v in resp[s].items()} for s in SEMESTRES},
        'observaciones': {str(s): obs[s] for s in SEMESTRES},
    }), 200


# ── PDF ──────────────────────────────────────────────────────────────────

def _pdf_response(pdf, nombre):
    return Response(pdf, mimetype='application/pdf', headers={
        'Content-Disposition': f'attachment; filename="{nombre}"',
        'Content-Length': str(len(pdf)),
        'Cache-Control': 'private, no-store',
    })


@personalidad_bp.route('/cursos/<int:course_id>/alumnos/<int:student_id>/informe.pdf',
                       methods=['GET'])
@jwt_required()
@staff_required
def pdf_alumno(course_id, student_id):
    from servicios.informe_personalidad_pdf import build_informe_personalidad_pdf
    c = _curso(course_id)
    m = _alumno_en_curso(c, student_id)
    try:
        pdf = build_informe_personalidad_pdf(c, [m.student])
    except Exception as ex:  # noqa: BLE001
        db.session.rollback()
        print(f'[personalidad.pdf] error alumno {student_id}: {ex!r}')
        return jsonify({'error': 'No se pudo generar el informe en PDF'}), 500
    return _pdf_response(pdf, f'informe_personalidad_{_slug(c.name)}_{_slug(m.student.last_name)}.pdf')


@personalidad_bp.route('/cursos/<int:course_id>/informe.pdf', methods=['GET'])
@jwt_required()
@staff_required
def pdf_curso(course_id):
    """Un PDF con el informe de cada alumno activo del curso (una página por alumno)."""
    from servicios.informe_personalidad_pdf import build_informe_personalidad_pdf
    c = _curso(course_id)
    alumnos = [m.student for m in _matriculas(c) if _estado(m) == 'activo']
    if not alumnos:
        return jsonify({'error': 'El curso no tiene alumnos activos'}), 400
    try:
        pdf = build_informe_personalidad_pdf(c, alumnos)
    except Exception as ex:  # noqa: BLE001
        db.session.rollback()
        print(f'[personalidad.pdf] error curso {course_id}: {ex!r}')
        return jsonify({'error': 'No se pudo generar el informe en PDF'}), 500
    return _pdf_response(pdf, f'informe_personalidad_{_slug(c.name)}.pdf')


# ── Importación desde PDF (sistema anterior) ─────────────────────────────

def _norm(t):
    t = unicodedata.normalize('NFKD', str(t or '').lower()).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', ' ', t).strip()


def _limpiar_rut(rut):
    r = re.sub(r'[^0-9kK]', '', str(rut or '')).upper().lstrip('0')
    return r or None


def _leer_archivos():
    """[(nombre_archivo, informes)] de los PDF subidos en 'archivos'."""
    from servicios.importar_personalidad_pdf import leer_informes
    archivos = request.files.getlist('archivos') or request.files.getlist('archivo')
    if not archivos:
        return None, 'Sube al menos un PDF'
    out = []
    for f in archivos:
        nombre = f.filename or 'archivo.pdf'
        if not nombre.lower().endswith('.pdf'):
            return None, f'«{nombre}» no es un PDF'
        try:
            out.append((nombre, leer_informes(f.read())))
        except Exception as ex:  # noqa: BLE001
            print(f'[personalidad.importar] no se pudo leer {nombre}: {ex!r}')
            return None, f'No se pudo leer «{nombre}». ¿Es un informe de personalidad?'
    return out, None


def _plan_importacion(school_id, leidos, sobrescribir):
    """Cruza lo leído con la plataforma. Devuelve (vista, operaciones)."""
    alumnos = User.query.filter_by(school_id=school_id, role='alumno').all()
    por_rut = {_limpiar_rut(u.rut): u for u in alumnos if _limpiar_rut(u.rut)}
    por_nombre = {}
    for u in alumnos:
        por_nombre.setdefault(_norm(f'{u.first_name} {u.last_name}'), []).append(u)

    todos = PersonalidadCriterio.query.filter_by(school_id=school_id).all()
    por_texto = {_norm(c.texto): c.id for c in todos}
    por_numero = {c['numero']: c['id'] for a in pauta_dict(school_id) for c in a['criterios']}

    vista, ops, sin_match = [], {}, set()
    for archivo, informes in leidos:
        filas = []
        for inf in informes:
            year = inf.get('anio') or date.today().year
            u = por_rut.get(_limpiar_rut(inf['rut']))
            if u is None:
                cand = por_nombre.get(_norm(inf['nombre'])) or []
                u = cand[0] if len(cand) == 1 else None
            valores = {1: {}, 2: {}}
            for c in inf['criterios']:
                cid = por_texto.get(_norm(c['texto'])) or por_numero.get(c['numero'])
                if not cid:
                    sin_match.add(f"{c['numero']}. {c['texto']}")
                    continue
                for s in SEMESTRES:
                    if c['valores'].get(s):
                        valores[s][cid] = c['valores'][s]
            fila = {
                'pagina': inf.get('pagina'), 'nombre': inf['nombre'], 'rut': inf['rut'],
                'curso_pdf': inf['curso'], 'anio': year,
                'semestres': {str(s): len(valores[s]) for s in SEMESTRES},
            }
            if u is None:
                fila['estado'] = 'no_encontrado'
            elif not (valores[1] or valores[2] or any(inf['observaciones'].values())):
                fila['estado'] = 'sin_datos'
            else:
                ms = Enrollment.query.join(Course, Enrollment.course_id == Course.id)\
                    .filter(Enrollment.student_id == u.id, Course.school_id == school_id,
                            or_(Enrollment.year == year, Course.year == year)).all()
                m = next((m for m in ms if _estado(m) == 'activo'), None) or (ms[0] if ms else None)
                curso = m.course.name if m and m.course else None
                existentes = {s: {r.criterio_id for r in PersonalidadRespuesta.query.filter_by(
                    student_id=u.id, year=year, semestre=s).all()} for s in SEMESTRES}
                choques = sum(1 for s in SEMESTRES for cid in valores[s] if cid in existentes[s])
                fila.update({
                    'estado': 'ok', 'student_id': u.id,
                    'nombre_plataforma': f'{u.first_name} {u.last_name}'.strip(),
                    'curso_plataforma': curso,
                    'curso_distinto': bool(curso) and _norm(curso) != _norm(inf['curso']),
                    'ya_tenia': choques,
                })
                ops[(u.id, year)] = {'valores': valores, 'observaciones': inf['observaciones']}
            filas.append(fila)
        vista.append({'archivo': archivo, 'curso_pdf': informes[0]['curso'] if informes else None,
                      'alumnos': filas})
    resumen = {
        'informes': sum(len(a['alumnos']) for a in vista),
        'listos': len(ops),
        'no_encontrados': sum(1 for a in vista for f in a['alumnos'] if f['estado'] == 'no_encontrado'),
        'sin_datos': sum(1 for a in vista for f in a['alumnos'] if f['estado'] == 'sin_datos'),
        'respuestas': sum(len(o['valores'][s]) for o in ops.values() for s in SEMESTRES),
        'con_respuestas_previas': sum(1 for a in vista for f in a['alumnos'] if f.get('ya_tenia')),
    }
    return {'archivos': vista, 'resumen': resumen, 'criterios_sin_match': sorted(sin_match),
            'sobrescribir': sobrescribir}, ops


def aplicar_importacion(sid, ops, sobrescribir, uid=None):
    """Graba lo planificado por _plan_importacion. Hace commit."""
    creadas = actualizadas = omitidas = 0
    for (student_id, year), op in ops.items():
        for s in SEMESTRES:
            actuales = {r.criterio_id: r for r in PersonalidadRespuesta.query.filter_by(
                student_id=student_id, year=year, semestre=s).all()}
            for cid, v in op['valores'][s].items():
                r = actuales.get(cid)
                if r is None:
                    db.session.add(PersonalidadRespuesta(
                        school_id=sid, student_id=student_id, criterio_id=cid, year=year,
                        semestre=s, valor=v, updated_by=uid))
                    creadas += 1
                elif sobrescribir and r.valor != v:
                    r.valor, r.updated_by = v, uid
                    actualizadas += 1
                elif r.valor != v:
                    omitidas += 1
        for s, texto in op['observaciones'].items():
            if not texto:
                continue
            o = PersonalidadObservacion.query.filter_by(student_id=student_id, year=year,
                                                        semestre=s).first()
            if o is None:
                db.session.add(PersonalidadObservacion(school_id=sid, student_id=student_id,
                                                       year=year, semestre=s,
                                                       texto=texto, updated_by=uid))
            elif sobrescribir or not (o.texto or '').strip():
                o.texto, o.updated_by = texto, uid
    db.session.commit()
    return {'alumnos': len(ops), 'creadas': creadas,
            'actualizadas': actualizadas, 'omitidas': omitidas}


@personalidad_bp.route('/importar/previsualizar', methods=['POST'])
@jwt_required()
@staff_required
@gestion_required
def importar_previsualizar():
    leidos, error = _leer_archivos()
    if error:
        return jsonify({'error': error}), 400
    sobrescribir = request.form.get('sobrescribir') in ('1', 'true')
    vista, _ops = _plan_importacion(_sid(), leidos, sobrescribir)
    return jsonify(vista), 200


@personalidad_bp.route('/importar/aplicar', methods=['POST'])
@jwt_required()
@staff_required
@gestion_required
def importar_aplicar():
    from routes.access import ensure_year_open
    leidos, error = _leer_archivos()
    if error:
        return jsonify({'error': error}), 400
    sid = _sid()
    sobrescribir = request.form.get('sobrescribir') in ('1', 'true')
    vista, ops = _plan_importacion(sid, leidos, sobrescribir)
    for year in {y for _s, y in ops}:
        ensure_year_open(sid, year)
    vista['resultado'] = aplicar_importacion(sid, ops, sobrescribir, _uid())
    return jsonify(vista), 200
