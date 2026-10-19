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
from functools import wraps

from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt

from models import db, User, Course, Enrollment

matricula_bp = Blueprint('matricula', __name__)

COLUMNAS = ['TIPO', 'nombre', 'apellido', 'rut', 'email', 'nivel', 'letra', 'año']


def school_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not get_jwt().get('school_id'):
            return jsonify({'error': 'Sin colegio asignado'}), 403
        return f(*args, **kwargs)
    return decorated


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

    conteo = dict(
        db.session.query(Enrollment.course_id, db.func.count(Enrollment.id))
        .filter(Enrollment.year == year, Enrollment.is_active.is_(True))
        .group_by(Enrollment.course_id).all())

    return jsonify([{
        'id': c.id, 'nombre': c.name, 'nivel': c.level, 'letra': c.letter,
        'year': c.year, 'alumnos': conteo.get(c.id, 0),
        'profesor_jefe': (f'{c.head_teacher.first_name} {c.head_teacher.last_name}'
                          if c.head_teacher else None),
    } for c in cursos]), 200


@matricula_bp.route('/cursos/<int:curso_id>/alumnos', methods=['GET'])
@jwt_required()
@school_required
def alumnos_del_curso(curso_id):
    sid = _sid()
    curso = Course.query.filter_by(id=curso_id, school_id=sid).first_or_404()
    filas = Enrollment.query.filter_by(course_id=curso_id, is_active=True).all()
    alumnos = []
    for e in filas:
        if not e.student:
            continue
        alumnos.append({
            'enrollment_id': e.id, 'id': e.student.id,
            'nombre': e.student.first_name, 'apellido': e.student.last_name,
            'rut': e.student.rut, 'email': e.student.email,
            'activo': e.student.is_active,
        })
    alumnos.sort(key=lambda a: clave_nombre(a['apellido'], a['nombre']))
    return jsonify({
        'curso': {'id': curso.id, 'nombre': curso.name, 'year': curso.year},
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
    """Matricula un alumno: lo reutiliza si ya existe, o lo crea."""
    sid = _sid()
    curso = Course.query.filter_by(id=curso_id, school_id=sid).first_or_404()
    d = request.get_json() or {}
    nombre = (d.get('nombre') or '').strip()
    apellido = (d.get('apellido') or '').strip()
    if not nombre or not apellido:
        return jsonify({'error': 'El nombre y el apellido son obligatorios'}), 400

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
        year=curso.year, is_active=True).first()
    if ya:
        return jsonify({'error': f'{nombre} {apellido} ya está en {curso.name}'}), 409

    # Un alumno no puede estar en dos cursos el mismo año
    previas = Enrollment.query.filter_by(
        student_id=alumno.id, year=curso.year, is_active=True).all()
    movido_de = None
    for p in previas:
        otro = Course.query.get(p.course_id)
        movido_de = otro.name if otro else None
        p.is_active = False

    db.session.add(Enrollment(student_id=alumno.id, course_id=curso.id,
                              year=curso.year, is_active=True))
    db.session.commit()
    return jsonify({'ok': True, 'creado': creado, 'movido_de': movido_de,
                    'alumno': {'id': alumno.id, 'nombre': nombre, 'apellido': apellido}}), 201


@matricula_bp.route('/enrollments/<int:eid>', methods=['DELETE'])
@jwt_required()
@school_required
def retirar(eid):
    """Retira del curso sin borrar al alumno ni su historial."""
    sid = _sid()
    e = Enrollment.query.get_or_404(eid)
    curso = Course.query.filter_by(id=e.course_id, school_id=sid).first_or_404()
    e.is_active = False
    db.session.commit()
    return jsonify({'ok': True, 'curso': curso.name}), 200


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
    for e in Enrollment.query.filter_by(year=year, is_active=True).all():
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

    validos = {c.id for c in Course.query.filter_by(school_id=sid, year=year).all()}
    hecho = {'creados': 0, 'matriculados': 0, 'movidos': 0, 'omitidos': 0}

    for it in items:
        curso_id = it.get('curso_id')
        nombre = (it.get('nombre') or '').strip()
        apellido = (it.get('apellido') or '').strip()
        if curso_id not in validos or not nombre or not apellido:
            hecho['omitidos'] += 1
            continue

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
                                        year=year, is_active=True).first()
        if ya:
            hecho['omitidos'] += 1
            continue

        previas = Enrollment.query.filter_by(
            student_id=alumno.id, year=year, is_active=True).all()
        for p in previas:
            p.is_active = False
            hecho['movidos'] += 1

        db.session.add(Enrollment(student_id=alumno.id, course_id=curso_id,
                                  year=year, is_active=True))
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
