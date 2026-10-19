"""Puesta en marcha de un colegio.

El avance no se guarda en ninguna parte: se calcula mirando los datos reales
cada vez que se pide. Eso evita el problema clásico de los asistentes, que es
quedar marcados como completos cuando alguien borró después lo que se había
cargado. Lo único que se guarda en la base es qué año se está configurando y
cuándo el colegio dio el proceso por cerrado, porque eso no se puede deducir.

El paso 5 (equipo) es el punto de corte: con el equipo cargado un docente ya
puede entrar y ver sus cursos, aunque falten alumnos y carga horaria.
"""
import io
import re
import secrets
import unicodedata
from datetime import date, datetime
from functools import wraps

from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt

from models import (db, School, User, Course, Period, Subject, CourseSubject,
                    Enrollment, ROLES_FACTURABLES)

onboarding_bp = Blueprint('onboarding', __name__)

# Roles que el asistente carga como "equipo del colegio"
ROLES_EQUIPO = ('admin', 'directivo', 'profesor')
# Sin ambigüedades a mano: nada de I/l/1 ni O/0 en una clave que alguien
# va a leer desde un papel y teclear.
ALFABETO_CLAVE = 'abcdefghijkmnpqrstuvwxyz23456789'


def school_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not get_jwt().get('school_id'):
            return jsonify({'error': 'Sin colegio asignado'}), 403
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if get_jwt().get('role') not in ('admin', 'directivo', 'super_admin'):
            return jsonify({'error': 'Acceso denegado'}), 403
        return f(*args, **kwargs)
    return decorated


def _sid():
    return get_jwt().get('school_id')


def _normalizar(texto):
    """Sin tildes, sin mayúsculas, sin espacios de más."""
    t = unicodedata.normalize('NFKD', str(texto or '').strip().lower())
    return re.sub(r'\s+', ' ', t.encode('ascii', 'ignore').decode()).strip()


def _year_de(colegio):
    """Año que se está configurando.

    Si el colegio nunca eligió uno, se asume el año en curso cuando ya tiene
    cursos creados, y el siguiente cuando parte de cero: nadie configura
    desde cero un año que ya empezó.
    """
    if colegio.onboarding_year:
        return colegio.onboarding_year
    hoy = date.today().year
    if Course.query.filter_by(school_id=colegio.id, year=hoy, is_active=True).count():
        return hoy
    return hoy + 1


# ── Estado de los ocho pasos ──────────────────────────────────────────

def _calcular(colegio, year):
    """Devuelve la lista de pasos con su estado, calculada de los datos."""
    sid = colegio.id

    cursos = Course.query.filter_by(school_id=sid, year=year, is_active=True).all()
    periodos = Period.query.filter_by(school_id=sid, year=year).all()
    asignaturas = Subject.query.filter_by(school_id=sid, is_active=True).all()
    equipo = User.query.filter(User.school_id == sid,
                               User.role.in_(ROLES_EQUIPO)).all()
    docentes = [u for u in equipo if u.role == 'profesor']

    ids_cursos = [c.id for c in cursos]
    alumnos = (Enrollment.query.filter(Enrollment.course_id.in_(ids_cursos),
                                       Enrollment.year == year).count()
               if ids_cursos else 0)
    cs = (CourseSubject.query.filter(CourseSubject.course_id.in_(ids_cursos)).all()
          if ids_cursos else [])

    pasos = []

    def paso(n, clave, titulo, listo, detalle, pendientes=None,
             bloqueado_por=None, opcional=False, empezado=False):
        # «parcial» es distinto de «pendiente»: el primero significa que hay
        # avance a medias, el segundo que no se ha tocado. Inferirlo de la
        # lista de pendientes sería un error, porque un paso sin empezar
        # también tiene pendientes.
        pasos.append({
            'n': n, 'clave': clave, 'titulo': titulo,
            'estado': ('bloqueado' if bloqueado_por else
                       'completo' if listo else
                       'parcial' if empezado else 'pendiente'),
            'detalle': detalle,
            'pendientes': pendientes or [],
            'bloqueado_por': bloqueado_por,
            'opcional': opcional,
        })

    # 1. Datos del colegio
    faltan_datos = [etiqueta for campo, etiqueta in
                    (('name', 'nombre'), ('rector', 'rector o director'),
                     ('logo_url', 'logo'))
                    if not getattr(colegio, campo)]
    paso(1, 'colegio', 'Datos del colegio', not faltan_datos,
         'Completo' if not faltan_datos else 'Falta ' + ', '.join(faltan_datos),
         ['Falta cargar el ' + f for f in faltan_datos],
         empezado=len(faltan_datos) < 3)

    # 2. Año escolar y períodos
    paso(2, 'periodos', 'Año escolar y períodos', len(periodos) > 0,
         f'{len(periodos)} período{"s" if len(periodos) != 1 else ""} en {year}'
         if periodos else 'Sin períodos definidos',
         [] if periodos else [f'El año {year} no tiene períodos: las notas no '
                              'tendrían dónde guardarse'])

    # 3. Cursos
    paso(3, 'cursos', 'Cursos', len(cursos) > 0,
         f'{len(cursos)} curso{"s" if len(cursos) != 1 else ""} en {year}'
         if cursos else 'Sin cursos creados',
         [] if cursos else ['Sin cursos no se puede matricular ni repartir horas'])

    # 4. Asignaturas, y qué cursos quedaron sin ninguna
    cursos_con_asig = {x.course_id for x in cs}
    sin_asig = [c for c in cursos if c.id not in cursos_con_asig]
    paso(4, 'asignaturas', 'Asignaturas',
         bool(asignaturas) and not sin_asig,
         (f'{len(asignaturas)} asignaturas, {len(sin_asig)} curso(s) sin ninguna'
          if sin_asig else f'{len(asignaturas)} asignaturas en todos los cursos')
         if asignaturas else 'Sin asignaturas',
         ([f'{c.name} no tiene ninguna asignatura' for c in sin_asig[:6]]
          if asignaturas else ['El catálogo de asignaturas está vacío']),
         bloqueado_por='cursos' if not cursos else None,
         empezado=bool(asignaturas))

    # 5. Equipo: el punto de corte
    paso(5, 'equipo', 'Equipo del colegio', len(docentes) > 0,
         (f'{len(equipo)} personas: {len(docentes)} docentes y '
          f'{len(equipo) - len(docentes)} en administración')
         if equipo else 'Sin personas cargadas',
         [] if docentes else ['Sin docentes cargados nadie puede entrar a ver '
                              'sus cursos'],
         empezado=bool(equipo))

    # 6. Matrícula
    paso(6, 'matricula', 'Matrícula de alumnos', alumnos > 0,
         f'{alumnos} alumnos matriculados en {year}' if alumnos
         else 'Sin alumnos cargados',
         [] if alumnos else ['Los cursos están vacíos'],
         bloqueado_por='cursos' if not cursos else None)

    # 7. Carga horaria y jefaturas
    sin_jefe = [c for c in cursos if not c.head_teacher_id]
    cs_con_docente = [x for x in cs if x.teacher_id]
    carga_lista = bool(cs) and not sin_jefe and len(cs_con_docente) == len(cs)
    pend7 = []
    if cs and len(cs_con_docente) < len(cs):
        pend7.append(f'{len(cs) - len(cs_con_docente)} asignatura(s) de curso '
                     'sin docente a cargo')
    for c in sin_jefe[:6]:
        pend7.append(f'{c.name} no tiene profesor jefe')
    paso(7, 'carga', 'Carga horaria y jefaturas', carga_lista,
         (f'{len(cs_con_docente)} de {len(cs)} asignaturas con docente'
          if cs else 'Sin carga repartida'),
         pend7, bloqueado_por='cursos' if not cursos else None, opcional=True,
         empezado=bool(cs_con_docente) or bool(cursos) and len(sin_jefe) < len(cursos))

    # 8. Activar y entregar accesos
    sin_activar = [u for u in equipo if not u.is_active]
    sin_clave = [u for u in equipo if u.is_active and not u.clave_entregada_at]
    pend8 = []
    if sin_activar:
        pend8.append(f'{len(sin_activar)} cuenta(s) todavía inactivas')
    if sin_clave:
        pend8.append(f'{len(sin_clave)} persona(s) sin clave entregada')
    paso(8, 'accesos', 'Activar y entregar accesos',
         bool(equipo) and not sin_activar and not sin_clave,
         (f'{len(equipo) - len(sin_activar)} de {len(equipo)} cuentas activas'
          if equipo else 'Sin equipo que activar'),
         pend8, bloqueado_por='equipo' if not equipo else None,
         empezado=bool(equipo) and len(sin_activar) < len(equipo))

    return pasos


@onboarding_bp.route('/estado', methods=['GET'])
@jwt_required()
@school_required
def estado():
    colegio = School.query.get_or_404(_sid())
    year = request.args.get('year', type=int) or _year_de(colegio)
    pasos = _calcular(colegio, year)

    completos = sum(1 for p in pasos if p['estado'] == 'completo')
    # El paso 5 es el que habilita a los docentes
    equipo_ok = next(p['estado'] == 'completo' for p in pasos if p['clave'] == 'equipo')
    # Para cerrar hace falta todo lo no opcional
    faltan_para_cerrar = [p['titulo'] for p in pasos
                          if not p['opcional'] and p['estado'] != 'completo']

    return jsonify({
        'year': year,
        'anios_disponibles': sorted({c.year for c in Course.query
                                     .filter_by(school_id=colegio.id).all()}
                                    | {date.today().year, date.today().year + 1}),
        'pasos': pasos,
        'completos': completos,
        'total': len(pasos),
        'pct': round(completos / len(pasos) * 100),
        'docentes_pueden_entrar': equipo_ok,
        'puede_cerrar': not faltan_para_cerrar,
        'faltan_para_cerrar': faltan_para_cerrar,
        'cerrado_at': (colegio.onboarding_cerrado_at.isoformat()
                       if colegio.onboarding_cerrado_at else None),
    }), 200


@onboarding_bp.route('/year', methods=['PUT'])
@jwt_required()
@school_required
@admin_required
def fijar_year():
    colegio = School.query.get_or_404(_sid())
    year = (request.get_json() or {}).get('year')
    if not isinstance(year, int) or not 2000 < year < 2100:
        return jsonify({'error': 'Año no válido'}), 400
    colegio.onboarding_year = year
    db.session.commit()
    return jsonify({'ok': True, 'year': year}), 200


@onboarding_bp.route('/cerrar', methods=['POST'])
@jwt_required()
@school_required
@admin_required
def cerrar():
    """Da por terminada la puesta en marcha.

    Se permite cerrar con asuntos pendientes solo si el colegio lo pide
    explícitamente: trancarlo por una asignatura sin cubrir deja al colegio
    sin poder usar la plataforma por un detalle.
    """
    colegio = School.query.get_or_404(_sid())
    datos = request.get_json() or {}
    year = request.args.get('year', type=int) or _year_de(colegio)
    pasos = _calcular(colegio, year)
    faltan = [p['titulo'] for p in pasos
              if not p['opcional'] and p['estado'] != 'completo']

    if faltan and not datos.get('forzar'):
        return jsonify({'error': 'Quedan pasos sin completar',
                        'faltan': faltan}), 409

    colegio.onboarding_cerrado_at = datetime.utcnow()
    colegio.onboarding_year = year
    db.session.commit()
    return jsonify({'ok': True, 'cerrado_at': colegio.onboarding_cerrado_at.isoformat(),
                    'con_pendientes': faltan}), 200


@onboarding_bp.route('/reabrir', methods=['POST'])
@jwt_required()
@school_required
@admin_required
def reabrir():
    colegio = School.query.get_or_404(_sid())
    colegio.onboarding_cerrado_at = None
    db.session.commit()
    return jsonify({'ok': True}), 200


# ── Paso 3: copiar los cursos de otro año ─────────────────────────────

@onboarding_bp.route('/cursos/copiar', methods=['POST'])
@jwt_required()
@school_required
@admin_required
def copiar_cursos():
    """Trae la estructura de cursos de otro año.

    No copia alumnos ni profesor jefe: el primero cambia entero y el segundo
    se decide cada año. Tampoco pisa un curso que ya exista con el mismo
    nombre.
    """
    datos = request.get_json() or {}
    sid = _sid()
    destino = datos.get('year_destino')
    origen = datos.get('year_origen')
    if not isinstance(destino, int) or not isinstance(origen, int):
        return jsonify({'error': 'Hay que indicar año de origen y de destino'}), 400
    if origen == destino:
        return jsonify({'error': 'El año de origen y el de destino son el mismo'}), 400

    de_origen = Course.query.filter_by(school_id=sid, year=origen,
                                       is_active=True).all()
    if not de_origen:
        return jsonify({'error': f'El año {origen} no tiene cursos'}), 404

    ya_estan = {_normalizar(c.name) for c in
                Course.query.filter_by(school_id=sid, year=destino).all()}

    creados = []
    for c in de_origen:
        if _normalizar(c.name) in ya_estan:
            continue
        nuevo = Course(school_id=sid, name=c.name, level=c.level, letter=c.letter,
                       year=destino, description=c.description, is_active=True)
        db.session.add(nuevo)
        creados.append(nuevo)
    db.session.commit()

    return jsonify({
        'ok': True, 'year_origen': origen, 'year_destino': destino,
        'creados': len(creados),
        'omitidos': len(de_origen) - len(creados),
        'cursos': [c.to_dict() for c in creados],
    }), 201


# ── Paso 5: el equipo del colegio ─────────────────────────────────────

ENCABEZADOS = {
    'nombre': 'nombre', 'nombres': 'nombre',
    'apellido': 'apellido', 'apellidos': 'apellido',
    'email': 'email', 'correo': 'email', 'mail': 'email',
    'rol': 'rol', 'cargo': 'rol',
    'rut': 'rut',
    'jornada': 'jornada', 'horas': 'jornada', 'jornada contratada': 'jornada',
}

ROLES_TEXTO = {
    'docente': 'profesor', 'profesor': 'profesor', 'profesora': 'profesor',
    'profe': 'profesor', 'educador': 'profesor', 'educadora': 'profesor',
    'admin': 'admin', 'administrador': 'admin', 'administradora': 'admin',
    'administrativo': 'admin', 'secretaria': 'admin',
    'directivo': 'directivo', 'director': 'directivo', 'directora': 'directivo',
    'rector': 'directivo', 'rectora': 'directivo', 'utp': 'directivo',
    'jefe utp': 'directivo', 'inspector': 'directivo',
}


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
        muestra = texto[:2000]
        sep = ';' if muestra.count(';') > muestra.count(',') else ','
        filas = [[c.strip() for c in f]
                 for f in csv.reader(io.StringIO(texto), delimiter=sep)]

    filas = [f for f in filas if any(c for c in f)]
    return filas, None


def _correo_sugerido(nombre, apellido, sid):
    """Correo interno para quien no trae uno.

    Sin tildes ni eñes: una dirección con caracteres no ASCII rebota en
    buena parte de los servidores de correo.
    """
    base = f"{_normalizar(nombre).split(' ')[0]}.{_normalizar(apellido).split(' ')[0]}"
    base = re.sub(r'[^a-z0-9.]', '', base).strip('.') or 'persona'
    correo = f'{base}@docente.local'
    n = 2
    while User.query.filter_by(email=correo).first():
        correo = f'{base}{n}@docente.local'
        n += 1
    return correo


def _analizar_equipo(filas, sid):
    """Convierte las filas de la planilla en items con su diagnóstico."""
    if not filas:
        return [], 'La planilla está vacía'

    cabecera = [_normalizar(c) for c in filas[0]]
    mapa = {}
    for i, c in enumerate(cabecera):
        if c in ENCABEZADOS:
            mapa[ENCABEZADOS[c]] = i
    if 'nombre' not in mapa or 'apellido' not in mapa:
        return [], ('La planilla necesita al menos las columnas «nombre» y '
                    '«apellido». Descarga la plantilla si no estás seguro.')

    existentes = {_normalizar(f'{u.first_name} {u.last_name}'): u
                  for u in User.query.filter(User.school_id == sid,
                                             User.role.in_(ROLES_EQUIPO)).all()}
    correos = {(u.email or '').lower(): u for u in User.query.all()}

    items, vistos = [], set()
    for n, fila in enumerate(filas[1:], start=2):
        def val(clave):
            i = mapa.get(clave)
            return (fila[i].strip() if i is not None and i < len(fila) else '')

        nombre, apellido = val('nombre'), val('apellido')
        if not nombre and not apellido:
            continue

        it = {'fila': n, 'nombre': nombre, 'apellido': apellido,
              'rut': val('rut') or None, 'email': (val('email') or '').lower() or None}

        texto_rol = _normalizar(val('rol'))
        it['rol'] = ROLES_TEXTO.get(texto_rol, 'profesor')
        it['rol_reconocido'] = bool(texto_rol) and texto_rol in ROLES_TEXTO

        jornada = val('jornada').replace(',', '.')
        try:
            it['jornada'] = int(float(jornada)) if jornada else None
        except ValueError:
            it['jornada'] = None

        clave = _normalizar(f'{nombre} {apellido}')
        if not nombre or not apellido:
            it.update(estado='error', detalle='Falta el nombre o el apellido')
        elif clave in vistos:
            it.update(estado='error', detalle='Repetida dentro de la misma planilla')
        elif clave in existentes:
            u = existentes[clave]
            it.update(estado='ya_existe', usuario_id=u.id,
                      detalle=f'Ya está cargada como {u.role}')
        elif it['email'] and it['email'] in correos:
            it.update(estado='error',
                      detalle=f'El correo {it["email"]} ya está en uso por otra persona')
        else:
            if not it['email']:
                it['email'] = _correo_sugerido(nombre, apellido, sid)
                it['email_generado'] = True
            it.update(estado='nuevo', detalle='Se va a crear')
        vistos.add(clave)
        items.append(it)

    return items, None


@onboarding_bp.route('/equipo/previsualizar', methods=['POST'])
@jwt_required()
@school_required
@admin_required
def equipo_previsualizar():
    """Lee la planilla y dice qué pasaría, sin tocar nada."""
    archivo = request.files.get('archivo')
    if not archivo:
        return jsonify({'error': 'No llegó ningún archivo'}), 400

    filas, error = _leer_planilla(archivo)
    if error:
        return jsonify({'error': error}), 400

    items, error = _analizar_equipo(filas, _sid())
    if error:
        return jsonify({'error': error}), 400

    resumen = {}
    for it in items:
        resumen[it['estado']] = resumen.get(it['estado'], 0) + 1
    return jsonify({'total': len(items), 'resumen': resumen, 'items': items}), 200


@onboarding_bp.route('/equipo/aplicar', methods=['POST'])
@jwt_required()
@school_required
@admin_required
def equipo_aplicar():
    """Crea las personas aprobadas en la vista previa.

    Quedan inactivas a propósito: se activan en el paso 8, junto con la
    entrega de claves, para que nadie reciba un acceso antes de que el
    colegio esté listo para avisarle.
    """
    datos = request.get_json() or {}
    items = datos.get('items') or []
    sid = _sid()
    if not isinstance(items, list) or not items:
        return jsonify({'error': 'No hay filas que aplicar'}), 400

    creados, omitidos = [], 0
    for it in items:
        nombre = (it.get('nombre') or '').strip()
        apellido = (it.get('apellido') or '').strip()
        correo = (it.get('email') or '').strip().lower()
        if not nombre or not apellido:
            omitidos += 1
            continue
        if not correo or User.query.filter_by(email=correo).first():
            # Pudo haberse ocupado entre la vista previa y el guardado
            correo = _correo_sugerido(nombre, apellido, sid)

        rol = it.get('rol') if it.get('rol') in ROLES_EQUIPO else 'profesor'
        u = User(school_id=sid, email=correo, first_name=nombre,
                 last_name=apellido, rut=(it.get('rut') or None),
                 role=rol, is_active=False)
        # Sin acceso hasta el paso 8: la clave real se genera al activar.
        u.set_password(secrets.token_urlsafe(24))
        db.session.add(u)
        creados.append(u)

    db.session.commit()
    return jsonify({'ok': True, 'creados': len(creados), 'omitidos': omitidos,
                    'personas': [u.to_dict() for u in creados]}), 201


@onboarding_bp.route('/equipo/plantilla.xlsx', methods=['GET'])
@jwt_required()
@school_required
def equipo_plantilla():
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment

    wb = Workbook()
    h = wb.active
    h.title = 'Equipo'
    cab = ['nombre', 'apellido', 'rut', 'email', 'rol', 'jornada']
    h.append(cab)
    for i, _ in enumerate(cab, start=1):
        c = h.cell(row=1, column=i)
        c.font = Font(bold=True, color='FFFFFF')
        c.fill = PatternFill('solid', fgColor='3B4FD8')
        c.alignment = Alignment(horizontal='center')

    h.append(['Daniela', 'Carreño Soto', '15.234.567-8',
              'dcarreno@colegio.cl', 'Docente', 44])
    h.append(['Fernando', 'Chávez Lagos', '', '', 'Docente', 30])
    h.append(['Marcela', 'Pinto Vera', '', 'mpinto@colegio.cl', 'Directivo', 44])

    for col, ancho in zip('ABCDEF', (18, 24, 15, 28, 14, 10)):
        h.column_dimensions[col].width = ancho

    ayuda = wb.create_sheet('Cómo llenarla')
    for fila in [
        ['Columna', 'Qué va'],
        ['nombre', 'Obligatorio'],
        ['apellido', 'Obligatorio'],
        ['rut', 'Opcional'],
        ['email', 'Opcional. Si va vacío se genera uno interno'],
        ['rol', 'Docente, Directivo o Administrador. Si va vacío, Docente'],
        ['jornada', 'Horas cronológicas de contrato a la semana. Opcional'],
    ]:
        ayuda.append(fila)
    for c in ayuda[1]:
        c.font = Font(bold=True)
    ayuda.column_dimensions['A'].width = 14
    ayuda.column_dimensions['B'].width = 58

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return send_file(buf, as_attachment=True,
                     download_name='Plantilla_equipo.xlsx',
                     mimetype='application/vnd.openxmlformats-officedocument.'
                              'spreadsheetml.sheet')


# ── Paso 8: activar cuentas y entregar claves ─────────────────────────

def _clave_nueva():
    """Diez caracteres sin ambigüedades, en dos grupos para leerla mejor."""
    tomar = lambda n: ''.join(secrets.choice(ALFABETO_CLAVE) for _ in range(n))
    return f'{tomar(4)}-{tomar(5)}'


@onboarding_bp.route('/accesos/activar', methods=['POST'])
@jwt_required()
@school_required
@admin_required
def activar_accesos():
    """Activa las cuentas del equipo y, si se pide, genera sus claves.

    Las claves se devuelven una sola vez y no se guardan en ninguna parte:
    solo su hash. Si el colegio las pierde, se generan otras. Guardar la
    clave en texto para poder reenviarla después sería cómodo y una mala
    idea.
    """
    datos = request.get_json() or {}
    sid = _sid()
    generar = bool(datos.get('generar_claves', True))
    ids = datos.get('user_ids')

    q = User.query.filter(User.school_id == sid, User.role.in_(ROLES_EQUIPO))
    if ids:
        q = q.filter(User.id.in_(ids))
    personas = q.order_by(User.last_name, User.first_name).all()
    if not personas:
        return jsonify({'error': 'No hay personas en el equipo'}), 404

    activadas, claves = 0, []
    ahora = datetime.utcnow()
    for u in personas:
        if not u.is_active:
            u.is_active = True
            activadas += 1
        if generar:
            clave = _clave_nueva()
            u.set_password(clave)
            u.debe_cambiar_clave = True
            u.clave_entregada_at = ahora
            claves.append({'id': u.id, 'nombre': f'{u.first_name} {u.last_name}',
                           'email': u.email, 'rol': u.role, 'clave': clave})
    db.session.commit()

    return jsonify({
        'ok': True, 'activadas': activadas, 'total': len(personas),
        'claves': claves,
        'aviso': ('Las claves se muestran una sola vez. Descárgalas o imprímelas '
                  'antes de cerrar esta ventana; después habrá que generar otras.')
        if claves else None,
    }), 200


@onboarding_bp.route('/accesos', methods=['GET'])
@jwt_required()
@school_required
@admin_required
def listar_accesos():
    """Quién tiene cuenta, quién está activo y a quién le falta su clave."""
    personas = User.query.filter(
        User.school_id == _sid(), User.role.in_(ROLES_EQUIPO)
    ).order_by(User.role, User.last_name).all()
    return jsonify({
        'total': len(personas),
        'activas': sum(1 for u in personas if u.is_active),
        'sin_clave': sum(1 for u in personas if not u.clave_entregada_at),
        'personas': [{
            'id': u.id, 'nombre': f'{u.first_name} {u.last_name}',
            'email': u.email, 'rol': u.role, 'is_active': u.is_active,
            'clave_entregada_at': (u.clave_entregada_at.isoformat()
                                   if u.clave_entregada_at else None),
            'debe_cambiar_clave': bool(u.debe_cambiar_clave),
            'ha_entrado': bool(u.last_login),
        } for u in personas],
    }), 200
