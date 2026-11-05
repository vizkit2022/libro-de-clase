"""Carga inicial por el propio colegio: su Excel o datos de ejemplo.

Las planillas ajenas se reconocen por el nombre de las columnas (con sinónimos, sin
importar mayúsculas ni tildes), con el título donde esté y con una hoja por curso.
La escritura va por student_import.apply_row, el mismo camino del Libro de Matrícula.

Decisiones que conviene tener a la vista:
  - Nada de esta carga da acceso a nadie ni envía correos. Los alumnos quedan sin
    clave, los docentes inactivos (se activan en la puesta en marcha) y el apoderado
    queda como familiar titular en la ficha, sin cuenta.
  - Un correo que ya existe en otra cuenta nunca se vincula ni se modifica: el correo
    es único en toda la plataforma y esa cuenta puede ser de otro colegio.
  - Los datos de ejemplo se registran en DatoEjemplo. Solo se borra lo que está ahí.
"""
import hashlib
import io
import logging
import random
import re
import zipfile
from datetime import date, datetime, timedelta

from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import get_jwt
from sqlalchemy import func

from models import (db, School, User, Course, Subject, CourseSubject, Enrollment, Grade,
                    Annotation, Period, CargaDemanda, StudentFamilyMember, DatoEjemplo,
                    CLAVE_INUTILIZABLE)
from routes.access import year_is_closed, closed_year_message
from routes.onboarding import _leer_planilla, _normalizar, _correo_sugerido
from routes.payments import require_colegio
from routes.student_import import (CourseResolver, apply_row, clean, as_text, normalize_course_name)
from routes.students import FichaError, normalize_rut, rut_is_valid
from routes.subjects import MINISTRY_SUBJECTS
from servicios.prueba import datos_prueba

logger = logging.getLogger(__name__)
autoonboarding_bp = Blueprint('autoonboarding', __name__)

MAX_BYTES = 5 * 1024 * 1024
MAX_DESCOMPRIMIDO = 100 * 1024 * 1024    # un .xlsx es un zip: freno a los zip bomb
MAX_FILAS = 5000
MAX_COLUMNAS = 60
MAX_FILAS_RECORRIDAS = 100000            # filas vacías con formato también cuentan
FILAS_BUSCAR_CABECERA = 12

DOMINIO_EJEMPLO = '@ejemplo.invalid'
EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')

# Filas de ejemplo de la plantilla: si alguien la sube tal cual no se crean
RUTS_PLANTILLA = {'11.111.111-1', '22.222.222-2'}

SINONIMOS_ALUMNO = {
    'curso': ('curso', 'cursos', 'curso actual', 'curso alumno', 'grado', 'nivel y letra'),
    'rut': ('rut', 'run', 'rut alumno', 'run alumno', 'rut estudiante', 'run estudiante',
            'rut del alumno', 'rut del estudiante', 'ipe', 'identificacion'),
    'nombres': ('nombre', 'nombres', 'nombre alumno', 'nombres alumno', 'nombre estudiante',
                'nombres estudiante', 'nombres del alumno', 'nombres del estudiante'),
    'apellidos': ('apellido', 'apellidos', 'apellido alumno', 'apellidos alumno',
                  'apellidos estudiante', 'apellidos del alumno'),
    'apellido_paterno': ('apellido paterno', 'ap paterno', 'paterno', 'primer apellido'),
    'apellido_materno': ('apellido materno', 'ap materno', 'materno', 'segundo apellido'),
    'nombre_completo': ('nombre completo', 'alumno', 'alumna', 'alumno a', 'estudiante',
                        'nombre del alumno', 'nombre del estudiante', 'nombre y apellidos',
                        'nombres y apellidos', 'apellidos y nombres', 'nombre apellido'),
    'email': ('email', 'correo', 'mail', 'e mail', 'correo electronico', 'email alumno',
              'correo alumno', 'email estudiante', 'correo estudiante'),
    'email_apoderado': ('email apoderado', 'correo apoderado', 'mail apoderado',
                        'e mail apoderado', 'email del apoderado', 'correo del apoderado',
                        'correo electronico apoderado', 'correo apoderada', 'email apoderada'),
    'telefono_apoderado': ('telefono apoderado', 'fono apoderado', 'celular apoderado',
                           'telefono del apoderado', 'celular del apoderado', 'telefono',
                           'fono', 'celular', 'movil', 'contacto'),
    'nombre_apoderado': ('apoderado', 'apoderada', 'apoderado a', 'nombre apoderado',
                         'nombre del apoderado', 'nombre apoderada', 'apoderado titular'),
    'rut_apoderado': ('rut apoderado', 'run apoderado', 'rut del apoderado', 'rut apoderada'),
}
SINONIMOS_DOCENTE = {
    'nombres': ('nombre', 'nombres', 'nombre docente', 'nombres docente', 'nombre profesor',
                'nombres profesor'),
    'apellidos': ('apellido', 'apellidos', 'apellidos docente', 'apellidos profesor'),
    'nombre_completo': ('nombre completo', 'docente', 'profesor', 'profesora', 'profesor a',
                        'nombre del docente', 'nombre del profesor', 'nombres y apellidos',
                        'nombre y apellidos', 'apellidos y nombres'),
    'email': ('email', 'correo', 'mail', 'e mail', 'correo electronico', 'email docente',
              'correo docente', 'email profesor', 'correo profesor', 'correo institucional'),
    'asignatura': ('asignatura', 'asignaturas', 'materia', 'ramo', 'subsector', 'disciplina'),
    'curso': ('curso', 'cursos'),
    'rut': ('rut', 'run', 'rut docente', 'rut profesor'),
}


def _indice(sinonimos):
    return {s: campo for campo, lista in sinonimos.items() for s in lista}


INDICE_ALUMNO = _indice(SINONIMOS_ALUMNO)
INDICE_DOCENTE = _indice(SINONIMOS_DOCENTE)
_RE_CURSO_EN_HOJA = re.compile(r'\b\d{1,2}\s*o?\s*[a-z]?\b|kinder|medio|basic')


def _hoja_es_curso(nombre):
    """'1° Básico A' sí; 'Hoja1' o 'Sheet 2' no."""
    n = _normalizar(nombre)
    return not n.startswith(('hoja', 'sheet', 'libro')) and bool(_RE_CURSO_EN_HOJA.search(n))


@autoonboarding_bp.errorhandler(FichaError)
def _error_ficha(err):
    db.session.rollback()
    return jsonify({'error': err.message}), err.status


@autoonboarding_bp.errorhandler(413)
def _error_tamano(_err):
    return jsonify({'error': 'El archivo pesa demasiado. El máximo son 5 MB.'}), 413


def _colegio():
    return db.session.get(School, get_jwt()['school_id'])


def _anio(school):
    return school.onboarding_year or date.today().year


# ── Lectura y validación del archivo ──────────────────────────────────────

def _validar_xlsx(datos):
    if datos[:2] != b'PK':
        raise FichaError('El archivo no es un Excel válido')
    try:
        with zipfile.ZipFile(io.BytesIO(datos)) as z:
            piezas = z.infolist()
            if 'xl/workbook.xml' not in z.namelist():
                raise FichaError('El archivo no es un Excel válido')
            if sum(p.file_size for p in piezas) > MAX_DESCOMPRIMIDO:
                raise FichaError('El Excel es demasiado grande una vez abierto')
            for p in piezas:
                if p.filename.endswith(('.xml', '.rels')):
                    with z.open(p) as f:
                        inicio = f.read(2048)
                    if b'<!DOCTYPE' in inicio or b'<!ENTITY' in inicio:
                        raise FichaError('El archivo no es un Excel válido')
    except zipfile.BadZipFile:
        raise FichaError('El archivo no es un Excel válido')


def _leer_xlsx(datos):
    from openpyxl import load_workbook
    try:
        wb = load_workbook(io.BytesIO(datos), read_only=True, data_only=True)
        hojas = []
        for ws in wb.worksheets:
            filas = []
            for n, fila in enumerate(ws.iter_rows(values_only=True, max_col=MAX_COLUMNAS), start=1):
                if n > MAX_FILAS_RECORRIDAS:
                    break
                if any(c not in (None, '') for c in fila):
                    filas.append((n, list(fila)))
                    if len(filas) > MAX_FILAS:
                        raise FichaError(f'La hoja «{ws.title}» tiene más de {MAX_FILAS} filas')
            hojas.append((ws.title, filas))
        wb.close()
        return hojas
    except FichaError:
        raise
    except Exception:
        raise FichaError('No pudimos leer el Excel. Revisa que no esté dañado ni con clave.')


def leer_archivo():
    """Valida tamaño y tipo. Devuelve [(nombre de hoja, [(n° de fila, celdas)])]."""
    archivo = request.files.get('archivo')
    if not archivo or not archivo.filename:
        raise FichaError('No llegó ningún archivo')
    nombre = archivo.filename.lower()
    datos = archivo.read(MAX_BYTES + 1)
    if len(datos) > MAX_BYTES:
        raise FichaError('El archivo pesa demasiado. El máximo son 5 MB.', 413)
    if not datos:
        raise FichaError('El archivo está vacío')

    if nombre.endswith(('.xlsx', '.xlsm')):
        _validar_xlsx(datos)
        return _leer_xlsx(datos)
    if nombre.endswith('.xls'):
        raise FichaError('Ese formato de Excel es muy antiguo. Guárdalo como .xlsx y vuelve a subirlo.')
    if nombre.endswith('.csv'):
        if b'\x00' in datos[:4096]:
            raise FichaError('El archivo no es un CSV válido')
        archivo.stream.seek(0)
        filas, error = _leer_planilla(archivo)
        if error:
            raise FichaError(error)
        if len(filas) > MAX_FILAS:
            raise FichaError(f'El archivo tiene más de {MAX_FILAS} filas')
        return [('Alumnos', [(n, f[:MAX_COLUMNAS]) for n, f in enumerate(filas, start=1)])]
    raise FichaError('Sube un archivo Excel (.xlsx) o CSV')


# ── Reconocer planillas ───────────────────────────────────────────────────

def _clave_encabezado(texto):
    # Sin puntos, para que 'R.U.T.' sea 'rut' y 'Ap. Paterno' sea 'ap paterno'
    limpio = _normalizar(texto).replace('.', '')
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]', ' ', limpio)).strip()


def _mapear(cabecera, indice):
    """{campo: (posición, encabezado original)}; si se repite, gana el primero."""
    mapa = {}
    for i, celda in enumerate(cabecera):
        campo = indice.get(_clave_encabezado(celda)) if celda not in (None, '') else None
        if campo and campo not in mapa:
            mapa[campo] = (i, str(celda).strip())
    return mapa


def _tipo_de_hoja(nombre, mapa_a, mapa_d):
    n = _normalizar(nombre)
    if any(p in n for p in ('instruc', 'ayuda', 'como llenar', 'leeme')):
        return None
    if any(p in n for p in ('docente', 'profesor', 'equipo', 'funcionario')):
        return 'docente'
    if any(p in n for p in ('alumno', 'estudiante', 'matricula', 'nomina')):
        return 'alumno'
    if 'email_apoderado' in mapa_a or 'nombre_apoderado' in mapa_a:
        return 'alumno'
    if 'asignatura' in mapa_d:
        return 'docente'
    if 'curso' in mapa_a or (_hoja_es_curso(nombre) and mapa_a):
        return 'alumno'
    return None


def _ubicar_cabecera(filas):
    """La fila con más columnas reconocidas: las planillas suelen partir con un título."""
    mejor = (0, None)
    for pos, (_n, celdas) in enumerate(filas[:FILAS_BUSCAR_CABECERA]):
        aciertos = max(len(_mapear(celdas, INDICE_ALUMNO)), len(_mapear(celdas, INDICE_DOCENTE)))
        if aciertos > mejor[0]:
            mejor = (aciertos, pos)
    return mejor[1]


def _partir_nombre(completo):
    """'Soto Pérez, Ana María' o 'Ana María Soto Pérez' → (nombres, apellidos)."""
    completo = re.sub(r'\s+', ' ', completo).strip()
    if ',' in completo:
        apellidos, nombres = [p.strip() for p in completo.split(',', 1)]
        return nombres, apellidos
    partes = completo.split(' ')
    if len(partes) < 2:
        return completo, ''
    corte = -2 if len(partes) >= 3 else -1
    return ' '.join(partes[:corte]), ' '.join(partes[corte:])


def _clave_sin_rut(curso, nombres, apellidos):
    """Identifica a un alumno sin RUT. Sus dígitos sirven para el correo interno."""
    base = f'{normalize_course_name(curso)}|{_normalizar(nombres)}|{_normalizar(apellidos)}'
    return 'sinrut' + hashlib.sha1(base.encode()).hexdigest()


def analizar(hojas):
    """Convierte las hojas en alumnos y docentes con su diagnóstico. No escribe."""
    r = {'alumnos': [], 'docentes': [], 'errores': [],
         'columnas_detectadas': {}, 'hay_alumnos': False, 'hay_docentes': False}
    vistos_alumnos, vistos_docentes = set(), {}

    def error(hoja, fila, motivo, aviso=False):
        r['errores'].append({'fila': fila, 'motivo': f'Hoja {hoja}: {motivo}', 'aviso': aviso})

    for nombre, filas in hojas:
        pos = _ubicar_cabecera(filas)
        if pos is None:
            continue
        cabecera = filas[pos][1]
        mapa_a, mapa_d = _mapear(cabecera, INDICE_ALUMNO), _mapear(cabecera, INDICE_DOCENTE)
        tipo = _tipo_de_hoja(nombre, mapa_a, mapa_d)
        if tipo is None:
            continue
        mapa = mapa_a if tipo == 'alumno' else mapa_d
        prefijo = '' if tipo == 'alumno' else 'docente_'
        for campo, (_i, encabezado) in mapa.items():
            r['columnas_detectadas'].setdefault(prefijo + campo, encabezado)
        r['hay_alumnos' if tipo == 'alumno' else 'hay_docentes'] = True
        curso_de_hoja = nombre.strip() if (tipo == 'alumno' and 'curso' not in mapa
                                           and _hoja_es_curso(nombre)) else None
        if curso_de_hoja:
            r['columnas_detectadas'].setdefault('curso', f'Nombre de la hoja «{nombre}»')

        for n, celdas in filas[pos + 1:]:
            def val(campo):
                entrada = mapa.get(campo)
                if not entrada or entrada[0] >= len(celdas):
                    return None
                return as_text(celdas[entrada[0]])

            nombres, apellidos = val('nombres'), val('apellidos')
            if not apellidos and (val('apellido_paterno') or val('apellido_materno')):
                apellidos = ' '.join(p for p in (val('apellido_paterno'), val('apellido_materno')) if p)
            if val('nombre_completo') and not (nombres and apellidos):
                nombres, apellidos = _partir_nombre(val('nombre_completo'))
            rut_crudo = clean(celdas[mapa['rut'][0]]) if 'rut' in mapa and mapa['rut'][0] < len(celdas) else None
            if not nombres and not apellidos and rut_crudo is None:
                continue
            if tipo == 'alumno':
                _analizar_alumno(r, nombre, n, val, nombres, apellidos, rut_crudo,
                                 curso_de_hoja, vistos_alumnos, error)
            else:
                _analizar_docente(r, nombre, n, val, nombres, apellidos, rut_crudo,
                                  vistos_docentes, error)
    return r


def _analizar_alumno(r, hoja, n, val, nombres, apellidos, rut_crudo, curso_de_hoja, vistos, error):
    rut = normalize_rut(rut_crudo)
    if rut in RUTS_PLANTILLA:
        return error(hoja, n, 'es una fila de ejemplo de la plantilla; se ignora')
    if not nombres or not apellidos:
        return error(hoja, n, 'falta el nombre o el apellido del alumno')
    curso = val('curso') or curso_de_hoja
    if not curso:
        return error(hoja, n, f'{nombres} {apellidos} no tiene curso')
    if rut_crudo is not None and not rut:
        return error(hoja, n, f'el RUT «{rut_crudo}» no se entiende')
    if rut and not rut_is_valid(rut):
        return error(hoja, n, f'el RUT {rut} tiene el dígito verificador incorrecto')
    clave = _clave_sin_rut(curso, nombres, apellidos)
    identidad = rut.replace('.', '') if rut else clave
    if identidad in vistos:
        return error(hoja, n, f'{nombres} {apellidos} está repetido en el archivo')
    vistos.add(identidad)

    correo_apod = (val('email_apoderado') or '').lower() or None
    if correo_apod and not (EMAIL_RE.match(correo_apod) and len(correo_apod) <= 150):
        error(hoja, n, f'el correo de apoderado «{correo_apod}» no es válido; '
                       'el alumno se carga sin él', aviso=True)
        correo_apod = None
    correo = (val('email') or '').lower() or None
    if correo and not (EMAIL_RE.match(correo) and len(correo) <= 120):
        correo = None
    r['alumnos'].append({
        'fila': n, 'curso': curso.strip()[:100], 'rut': rut, 'clave': clave,
        'nombres': nombres[:100], 'apellidos': apellidos[:100], 'email': correo,
        'email_apoderado': correo_apod,
        'telefono_apoderado': (val('telefono_apoderado') or None),
        'nombre_apoderado': (val('nombre_apoderado') or None),
        'rut_apoderado': normalize_rut(val('rut_apoderado')),
    })


def _analizar_docente(r, hoja, n, val, nombres, apellidos, rut_crudo, vistos, error):
    correo = (val('email') or '').lower() or None
    if correo and correo.endswith(DOMINIO_EJEMPLO):
        return error(hoja, n, 'es una fila de ejemplo de la plantilla; se ignora')
    if not nombres or not apellidos:
        return error(hoja, n, 'falta el nombre o el apellido del docente')
    if correo and not (EMAIL_RE.match(correo) and len(correo) <= 120):
        error(hoja, n, f'el correo «{correo}» no es válido; se carga sin él', aviso=True)
        correo = None
    identidad = correo or _normalizar(f'{nombres} {apellidos}')
    # Una fila por asignatura es lo normal: la misma persona se junta, no es un error
    docente = vistos.get(identidad)
    if docente is None:
        docente = {'fila': n, 'nombres': nombres[:100], 'apellidos': apellidos[:100],
                   'email': correo, 'rut': normalize_rut(rut_crudo), 'asignaciones': []}
        vistos[identidad] = docente
        r['docentes'].append(docente)
    if val('asignatura'):
        cursos = [c.strip() for c in re.split(r'[,;/]', val('curso') or '') if c.strip()]
        docente['asignaciones'].append((val('asignatura').strip()[:200], cursos))


def _clave_apoderado(a):
    if a.get('email_apoderado') or a.get('rut_apoderado'):
        return a.get('email_apoderado') or a['rut_apoderado'].replace('.', '')
    if a.get('telefono_apoderado') or a.get('nombre_apoderado'):
        return f"{_normalizar(a.get('nombre_apoderado'))}|{a.get('telefono_apoderado') or ''}"
    return None


def _vista_previa(a):
    cursos = {}
    for al in a['alumnos']:
        clave = normalize_course_name(al['curso'])
        cursos.setdefault(clave, {'nombre': al['curso'], 'alumnos': 0})['alumnos'] += 1

    faltantes = []
    detectadas = a['columnas_detectadas']
    if a['hay_alumnos'] or not a['hay_docentes']:
        if 'curso' not in detectadas:
            faltantes.append('curso')
        if 'nombre_completo' not in detectadas:
            if 'nombres' not in detectadas:
                faltantes.append('nombres')
            if 'apellidos' not in detectadas and 'apellido_paterno' not in detectadas:
                faltantes.append('apellidos')
    total = len(a['alumnos']) + len(a['docentes'])
    return {
        'columnas_detectadas': detectadas,
        'columnas_faltantes': faltantes,
        'cursos': sorted(cursos.values(), key=lambda c: c['nombre']),
        'total_alumnos': len(a['alumnos']),
        'total_docentes': len(a['docentes']),
        'total_apoderados': len({k for k in map(_clave_apoderado, a['alumnos']) if k}),
        'muestra': [{c: al[c] for c in ('fila', 'curso', 'rut', 'nombres', 'apellidos',
                                        'email_apoderado', 'telefono_apoderado')}
                    for al in a['alumnos'][:8]],
        'errores': [{'fila': e['fila'], 'motivo': e['motivo']} for e in a['errores']],
        'se_puede_aplicar': total > 0,
    }


# ── Rutas de planilla ─────────────────────────────────────────────────────

@autoonboarding_bp.route('/plantilla.xlsx', methods=['GET'])
@require_colegio()
def plantilla():
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment

    wb = Workbook()
    alumnos = wb.active
    alumnos.title = 'Alumnos'
    docentes = wb.create_sheet('Docentes')
    for hoja, cabecera, filas, anchos in (
        (alumnos, ['Curso', 'RUT', 'Nombres', 'Apellidos', 'Email apoderado', 'Teléfono apoderado'],
         [['1° Básico A', '11.111.111-1', 'Ana María', 'Ejemplo Soto', 'apoderada@ejemplo.invalid', '+56 9 1234 5678'],
          ['1° Básico A', '22.222.222-2', 'Diego', 'Ejemplo Rojas', '', '']],
         (16, 16, 22, 24, 30, 22)),
        (docentes, ['Nombres', 'Apellidos', 'Email', 'Asignatura', 'Curso'],
         [['Daniela', 'Ejemplo Carreño', 'daniela@ejemplo.invalid', 'Matemática', '1° Básico A']],
         (20, 24, 30, 24, 16)),
    ):
        hoja.append(cabecera)
        for i in range(1, len(cabecera) + 1):
            c = hoja.cell(row=1, column=i)
            c.font = Font(bold=True, color='FFFFFF')
            c.fill = PatternFill('solid', fgColor='3B4FD8')
            c.alignment = Alignment(horizontal='center')
        for fila in filas:
            hoja.append(fila)
        for letra, ancho in zip('ABCDEF', anchos):
            hoja.column_dimensions[letra].width = ancho

    ayuda = wb.create_sheet('Instrucciones')
    for fila in [
        ['Cómo llenar esta planilla'],
        ['Las filas de ejemplo se ignoran al subir el archivo: puedes borrarlas o reemplazarlas.'],
        ['Hoja Alumnos: Curso, Nombres y Apellidos son obligatorios. Con el RUT, volver a subir el archivo actualiza en vez de duplicar.'],
        ['Hoja Docentes: Nombres y Apellidos son obligatorios. Repite a la persona en otra fila por cada asignatura.'],
        ['¿Ya tienes tu propio Excel? Súbelo tal cual: reconocemos las columnas por su nombre y te mostramos una vista previa antes de cargar nada.'],
        ['No se envía ningún correo ni se da acceso a nadie al cargar esta planilla.'],
    ]:
        ayuda.append(fila)
    ayuda['A1'].font = Font(bold=True)
    ayuda.column_dimensions['A'].width = 120

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return send_file(buf, as_attachment=True, download_name='Plantilla_Recreo_Edu.xlsx',
                     mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


@autoonboarding_bp.route('/previsualizar', methods=['POST'])
@require_colegio()
def previsualizar():
    """Lee el archivo y dice qué pasaría, sin escribir nada."""
    return jsonify(_vista_previa(analizar(leer_archivo()))), 200


def _alumno_parseado(al, clave=None):
    familia = []
    if _clave_apoderado(al):
        familia.append({
            'data': {k: v for k, v in (('first_name', al['nombre_apoderado'] or 'Apoderado'),
                                       ('email', al['email_apoderado']), ('phone', al['telefono_apoderado']),
                                       ('rut', al['rut_apoderado'])) if v},
            'roles': ['apoderado'], 'relationship': 'Otro', 'relationship_other': 'Apoderado',
            'guardian_role': 'titular',
        })
    usuario = {'first_name': al['nombres'], 'last_name': al['apellidos']}
    if al['email']:
        usuario['email'] = al['email']
    return {'rut': al['rut'], 'clave': clave, 'user': usuario, 'profile': {}, 'medical': {},
            'problems': None, 'auths': {}, 'family': familia, 'extra': {}, 'warnings': [],
            'course_name': al['curso']}


def _aplicar_alumnos(a, school, resolver, resultado):
    sid = school.id
    estudiantes = {}
    for u in User.query.filter_by(school_id=sid, role='alumno').all():
        n = normalize_rut(u.rut)
        if n:
            estudiantes.setdefault(n.replace('.', ''), u)
        else:
            for e in Enrollment.query.filter_by(student_id=u.id).all():
                if e.course:
                    estudiantes.setdefault(_clave_sin_rut(e.course.name, u.first_name, u.last_name), u)
    ctx = {'school_id': sid, 'user_id': int(get_jwt().get('sub') or 0), 'templates': {},
           'courses': _CursosPorNombre(resolver), 'students': estudiantes, 'used_courses': {},
           'create_access': False, 'sin_clave': True, 'fuente': 'planilla de carga inicial'}
    for al in a['alumnos']:
        clave = None
        if not al['rut']:
            clave = al['clave']
        elif al['rut'].replace('.', '') not in estudiantes and al['clave'] in estudiantes:
            clave = al['clave']      # estaba cargado sin RUT: se completa, no se duplica
        info = apply_row(_alumno_parseado(al, clave), ctx)
        resultado['alumnos_creados' if info['action'] == 'crear' else 'alumnos_actualizados'] += 1
        # Cambió de curso en el archivo: no puede quedar activo en dos cursos del año
        curso = resolver.get(al['curso'])
        for otra in Enrollment.query.filter(
                Enrollment.student_id == info['student_id'], Enrollment.year == curso.year,
                Enrollment.course_id != curso.id, Enrollment.status == 'activo').all():
            otra.status = 'trasladado'
            otra.withdrawal_date = date.today()
    return {k for k in map(_clave_apoderado, a['alumnos']) if k}


class _CursosPorNombre:
    def __init__(self, resolver):
        self.resolver = resolver

    def get(self, nombre):
        return self.resolver.get(nombre)


def _aplicar_docentes(a, school, resolver, resultado):
    sid = school.id
    del_colegio = {_normalizar(f'{u.first_name} {u.last_name}'): u for u in User.query.filter(
        User.school_id == sid, User.role.in_(('admin', 'directivo', 'profesor'))).all()}
    asignaturas = {_normalizar(s.name): s for s in Subject.query.filter_by(school_id=sid).all()}

    for d in a['docentes']:
        persona = None
        if d['email']:
            existente = User.query.filter(func.lower(User.email) == d['email']).first()
            if existente:
                if existente.school_id != sid or existente.role not in ('admin', 'directivo', 'profesor'):
                    # Mensaje genérico a propósito: no revela si es de otro colegio
                    resultado['omitidos'].append({
                        'fila': d['fila'],
                        'motivo': f'Docentes: el correo {d["email"]} ya está en uso en otra cuenta'})
                    continue
                persona = existente
        persona = persona or del_colegio.get(_normalizar(f"{d['nombres']} {d['apellidos']}"))
        if persona is None:
            persona = User(school_id=sid, first_name=d['nombres'], last_name=d['apellidos'],
                           email=d['email'] or _correo_sugerido(d['nombres'], d['apellidos'], sid),
                           rut=d['rut'], role='profesor', is_active=False,
                           password_hash=CLAVE_INUTILIZABLE)
            db.session.add(persona)
            db.session.flush()
            del_colegio[_normalizar(f"{d['nombres']} {d['apellidos']}")] = persona
            resultado['docentes_creados'] += 1

        for nombre_asig, cursos in d['asignaciones']:
            clave = _normalizar(nombre_asig)
            materia = asignaturas.get(clave)
            if materia is None:
                materia = Subject(school_id=sid, name=nombre_asig, is_active=True)
                db.session.add(materia)
                db.session.flush()
                asignaturas[clave] = materia
            for nombre_curso in cursos:
                curso = resolver.get(nombre_curso[:100])
                cs = CourseSubject.query.filter_by(course_id=curso.id, subject_id=materia.id).first()
                if cs is None:
                    db.session.add(CourseSubject(course_id=curso.id, subject_id=materia.id,
                                                 teacher_id=persona.id))
                elif not cs.teacher_id:     # no se le quita la asignatura a quien ya la tiene
                    cs.teacher_id = persona.id
                db.session.flush()


@autoonboarding_bp.route('/aplicar', methods=['POST'])
@require_colegio()
def aplicar():
    """Una sola transacción: o entra el archivo completo, o nada. Nunca envía correos."""
    a = analizar(leer_archivo())
    if not a['alumnos'] and not a['docentes']:
        return jsonify({'error': 'No encontramos alumnos ni docentes para cargar en ese archivo',
                        'errores': [{'fila': e['fila'], 'motivo': e['motivo']} for e in a['errores']]}), 400

    school = School.query.filter_by(id=get_jwt()['school_id']).with_for_update().first()
    resultado = {'cursos_creados': 0, 'alumnos_creados': 0, 'alumnos_actualizados': 0,
                 'docentes_creados': 0, 'apoderados_creados': 0,
                 'omitidos': [{'fila': e['fila'], 'motivo': e['motivo']}
                              for e in a['errores'] if not e['aviso']]}
    try:
        # Quien sube su planilla ya terminó de explorar. Si el ejemplo se queda, los
        # alumnos reales caerían en los cursos ficticios del mismo nombre.
        if school.tiene_demo:
            _borrar_demo(school)
        anio = _anio(school)
        if year_is_closed(school.id, anio):
            raise FichaError(closed_year_message(anio), 409)
        resolver = CourseResolver(school.id, year=anio)
        previos = _claves_apoderados(school.id)
        vistos = _aplicar_alumnos(a, school, resolver, resultado)
        _aplicar_docentes(a, school, resolver, resultado)
        resultado['cursos_creados'] = len(resolver.created)
        resultado['apoderados_creados'] = len(vistos - previos)
        db.session.commit()
    except FichaError:
        db.session.rollback()
        raise
    except Exception:
        db.session.rollback()
        logger.exception('Carga inicial falló en el colegio %s', get_jwt().get('school_id'))
        return jsonify({'error': 'No pudimos cargar el archivo. No se guardó nada.'}), 500

    resultado['resumen'] = _resumen(_colegio())
    return jsonify(resultado), 200


def _titulares(school_id):
    return StudentFamilyMember.query.join(User, StudentFamilyMember.student_id == User.id).filter(
        User.school_id == school_id, StudentFamilyMember.guardian_role == 'titular').all()


def _claves_apoderados(school_id):
    return {k for k in (_clave_apoderado({
        'email_apoderado': (m.email or '').lower() or None,
        'rut_apoderado': m.rut,
        'telefono_apoderado': m.phone,
        'nombre_apoderado': None if m.first_name == 'Apoderado' else m.first_name,
    }) for m in _titulares(school_id)) if k}


# ── Resumen ───────────────────────────────────────────────────────────────

def _resumen(school):
    sid, anio = school.id, _anio(school)
    cursos = Course.query.filter_by(school_id=sid, year=anio, is_active=True)\
        .order_by(Course.level, Course.letter, Course.name).all()
    ids = [c.id for c in cursos]

    alumnos_por_curso, promedio_por_curso, promedio_general, anotaciones = {}, {}, None, 0
    alumnos = 0
    if ids:
        alumnos_por_curso = dict(db.session.query(Enrollment.course_id, func.count(Enrollment.id))
                                 .filter(Enrollment.course_id.in_(ids), Enrollment.status == 'activo')
                                 .group_by(Enrollment.course_id).all())
        alumnos = db.session.query(func.count(func.distinct(Enrollment.student_id))).filter(
            Enrollment.course_id.in_(ids), Enrollment.status == 'activo').scalar() or 0
        notas = db.session.query(Grade.value, CourseSubject.course_id)\
            .join(CourseSubject, Grade.course_subject_id == CourseSubject.id)\
            .filter(CourseSubject.course_id.in_(ids))
        promedio_por_curso = dict(db.session.query(CourseSubject.course_id, func.avg(Grade.value))
                                  .join(Grade, Grade.course_subject_id == CourseSubject.id)
                                  .filter(CourseSubject.course_id.in_(ids))
                                  .group_by(CourseSubject.course_id).all())
        general = notas.with_entities(func.avg(Grade.value)).scalar()
        promedio_general = round(float(general), 1) if general is not None else None
        anotaciones = Annotation.query.filter(Annotation.course_id.in_(ids)).count()

    # Apoderados: titulares de las fichas más cuentas de apoderado sin ficha asociada
    claves = _claves_apoderados(sid)
    con_ficha = {m.user_id for m in _titulares(sid) if m.user_id}
    cuentas = User.query.filter_by(school_id=sid, role='apoderado').all()

    return {
        'cursos': len(cursos),
        'alumnos': alumnos,
        'docentes': User.query.filter_by(school_id=sid, role='profesor').count(),
        'apoderados': len(claves) + sum(1 for u in cuentas if u.id not in con_ficha),
        'asignaturas': Subject.query.filter_by(school_id=sid, is_active=True).count(),
        'promedio_general': promedio_general,
        'asistencia': None,      # la plataforma aún no registra asistencia
        'anotaciones': anotaciones,
        'por_curso': [{'nombre': c.name, 'alumnos': alumnos_por_curso.get(c.id, 0),
                       'promedio': (round(float(promedio_por_curso[c.id]), 1)
                                    if promedio_por_curso.get(c.id) is not None else None)}
                      for c in cursos],
        'tiene_demo': bool(school.tiene_demo),
        'prueba': {k: v for k, v in datos_prueba(school).items() if k != 'suscrito'},
    }


@autoonboarding_bp.route('/resumen', methods=['GET'])
@require_colegio()
def resumen():
    return jsonify(_resumen(_colegio())), 200


# ── Datos de ejemplo ──────────────────────────────────────────────────────

NOMBRES_F = ('Antonia', 'Florencia', 'Isidora', 'Josefa', 'Trinidad', 'Emilia', 'Martina', 'Agustina')
NOMBRES_M = ('Benjamín', 'Vicente', 'Tomás', 'Joaquín', 'Maximiliano', 'Lucas', 'Gaspar', 'Clemente')
APELLIDOS = ('Araya', 'Bustos', 'Cáceres', 'Donoso', 'Escobar', 'Figueroa', 'Godoy', 'Henríquez',
             'Ibarra', 'Jofré', 'Leiva', 'Maturana', 'Navarrete', 'Olivares', 'Poblete', 'Quiroz')
CURSOS_DEMO = (('1° Básico A', '1° Básico', 'A'), ('4° Básico A', '4° Básico', 'A'),
               ('7° Básico A', '7° Básico', 'A'))
ASIGNATURAS_DEMO = ('LEN', 'MAT', 'HIS', 'CNA', 'ING')
COLOR_ASIGNATURA = {'LEN': '#EF4444', 'MAT': '#3B82F6', 'HIS': '#F59E0B', 'CNA': '#10B981', 'ING': '#8B5CF6'}
ALUMNOS_POR_CURSO = 10
ANOTACIONES_DEMO = (
    ('positiva', 'Participación destacada', 'Participó activamente y ayudó a sus compañeros en clase.'),
    ('positiva', 'Mejora sostenida', 'Ha mejorado de manera notoria su trabajo durante el semestre.'),
    ('negativa', 'Atraso', 'Llegó atrasado a la primera hora de clases.'),
    ('academica', 'Tarea pendiente', 'No presentó la tarea de la semana; se acuerda nueva fecha.'),
)


def _ids_marcados(school_id, tabla):
    return [f.registro_id for f in DatoEjemplo.query.filter_by(school_id=school_id, tabla=tabla).all()]


@autoonboarding_bp.route('/demo', methods=['POST'])
@require_colegio()
def cargar_demo():
    school = School.query.filter_by(id=get_jwt()['school_id']).with_for_update().first()
    if school.tiene_demo:          # doble clic: no se duplica
        db.session.rollback()
        return jsonify({'ok': True, 'resumen': _resumen(school)}), 200

    sid = school.id
    if User.query.filter_by(school_id=sid, role='alumno').count():
        db.session.rollback()
        return jsonify({'error': 'Tu colegio ya tiene alumnos: los datos de ejemplo son '
                                 'solo para colegios que parten de cero.'}), 409
    anio = _anio(school)
    if year_is_closed(sid, anio):
        db.session.rollback()
        return jsonify({'error': closed_year_message(anio)}), 409

    try:
        _sembrar_demo(school, anio)
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception('Datos de ejemplo fallaron en el colegio %s', sid)
        return jsonify({'error': 'No pudimos cargar los datos de ejemplo'}), 500
    return jsonify({'ok': True, 'resumen': _resumen(school)}), 201


def _sembrar_demo(school, anio):
    sid = school.id
    azar = random.Random(sid)
    marcas = []

    periodo = Period.query.filter_by(school_id=sid, year=anio).order_by(Period.number).first()
    if periodo is None:
        periodo = Period(school_id=sid, name=f'Semestre 1 {anio}', period_type='semestral', year=anio,
                         number=1, is_active=True, start_date=date(anio, 3, 1), end_date=date(anio, 7, 31))
        db.session.add(periodo)
        db.session.flush()
        marcas.append(('periods', periodo.id))

    def persona(rol, correo, nombre, apellido):
        return User(school_id=sid, email=f'{correo}{DOMINIO_EJEMPLO}', first_name=nombre,
                    last_name=apellido, role=rol, is_active=True,
                    password_hash=CLAVE_INUTILIZABLE)

    # Una sola tanda por tipo: es lo que la mantiene rápida
    docentes = [persona('profesor', f'docente.{sid}.{i}', nombre, apellido) for i, (nombre, apellido) in
                enumerate((('Carolina', 'Vidal Araya'), ('Rodrigo', 'Pizarro Leiva'),
                           ('Paula', 'Sepúlveda Godoy'), ('Andrés', 'Tapia Olivares'),
                           ('Gabriela', 'Muñoz Ibarra')))]
    db.session.add_all(docentes)
    catalogo = {m['code']: m['name'] for m in MINISTRY_SUBJECTS}
    materias = [Subject(school_id=sid, name=catalogo[c], code=c, ministry_code=c,
                        color=COLOR_ASIGNATURA[c], is_active=True) for c in ASIGNATURAS_DEMO]
    db.session.add_all(materias)
    cursos = [Course(school_id=sid, name=n, level=nivel, letter=letra, year=anio, is_active=True)
              for n, nivel, letra in CURSOS_DEMO]
    db.session.add_all(cursos)

    alumnos, correlativo = [], 0
    for _curso in cursos:
        for _ in range(ALUMNOS_POR_CURSO):
            correlativo += 1
            nombres = NOMBRES_F if correlativo % 2 else NOMBRES_M
            alumnos.append(persona('alumno', f'alumno.{sid}.{correlativo}', azar.choice(nombres),
                                   f'{azar.choice(APELLIDOS)} {azar.choice(APELLIDOS)}'))
    db.session.add_all(alumnos)
    db.session.flush()

    marcas += [('users', u.id) for u in docentes + alumnos]
    marcas += [('subjects', m.id) for m in materias] + [('courses', c.id) for c in cursos]
    db.session.add_all([DatoEjemplo(school_id=sid, tabla=t, registro_id=i) for t, i in marcas])

    por_curso = []
    for i, curso in enumerate(cursos):
        curso.head_teacher_id = docentes[i].id
        por_curso.append([CourseSubject(course_id=curso.id, subject_id=m.id, hours_per_week=4,
                                        teacher_id=docentes[j].id) for j, m in enumerate(materias)])
        db.session.add_all(por_curso[-1])
    db.session.flush()

    hoy, ahora = date.today(), datetime.utcnow()
    filas_notas = []
    for i, curso in enumerate(cursos):
        grupo = alumnos[i * ALUMNOS_POR_CURSO:(i + 1) * ALUMNOS_POR_CURSO]
        base_curso = azar.uniform(5.2, 6.2)
        for alumno in grupo:
            db.session.add(Enrollment(student_id=alumno.id, course_id=curso.id, year=anio,
                                      status='activo', is_active=True, enrollment_date=hoy))
            db.session.add(StudentFamilyMember(
                student_id=alumno.id, relationship='Madre', id_type='RUN',
                first_name=azar.choice(NOMBRES_F), last_name=alumno.last_name.split(' ')[0],
                email=f'apoderado.{alumno.id}{DOMINIO_EJEMPLO}', guardian_role='titular'))
            base = base_curso + azar.uniform(-0.8, 0.8)
            for cs in por_curso[i]:
                for n in range(3):
                    filas_notas.append({
                        'student_id': alumno.id, 'course_subject_id': cs.id, 'period_id': periodo.id,
                        'value': round(min(7.0, max(2.5, base + azar.uniform(-0.7, 0.7))), 1),
                        'description': f'Evaluación {n + 1}', 'grade_type': 'nota',
                        'created_by': cs.teacher_id, 'created_at': ahora,
                        'is_published': True, 'published_at': ahora})
        for tipo, titulo, texto in ANOTACIONES_DEMO:
            db.session.add(Annotation(student_id=azar.choice(grupo).id, course_id=curso.id,
                                      annotation_type=tipo, title=titulo, description=texto,
                                      date=hoy - timedelta(days=azar.randint(1, 30)),
                                      created_by=docentes[i].id))
    db.session.execute(Grade.__table__.insert(), filas_notas)
    school.tiene_demo = True
    db.session.flush()


def _borrar_filas(tabla, ids):
    """Borra filas con lo que depende de ellas: las referencias opcionales quedan en
    NULL y las obligatorias se borran. Mira las llaves foráneas del modelo, así una
    tabla nueva queda cubierta sin tocar este código."""
    ids = list(ids)
    if not ids:
        return
    for hija in db.metadata.sorted_tables:
        for fk in hija.foreign_keys:
            if fk.column.table is not tabla:
                continue
            if fk.parent.nullable:
                db.session.execute(hija.update().where(fk.parent.in_(ids)).values({fk.parent.name: None}))
            else:
                pk = list(hija.primary_key.columns)[0]
                filas = db.session.execute(db.select(pk).where(fk.parent.in_(ids))).scalars().all()
                _borrar_filas(hija, filas)
    pk = list(tabla.primary_key.columns)[0]
    db.session.execute(tabla.delete().where(pk.in_(ids)))


def _borrar_demo(school):
    """Quita los datos de ejemplo y conserva lo que el colegio haya cargado encima.
    No hace commit."""
    sid = school.id
    db.session.flush()

    # La marca manda, y además deben seguir siendo de este colegio y con correo de
    # ejemplo: si alguien le cambió el correo, esa persona ya es del colegio.
    marcados = _ids_marcados(sid, 'users')
    usuarios = {u.id for u in User.query.filter(User.id.in_(marcados), User.school_id == sid,
                                                User.email.like(f'%{DOMINIO_EJEMPLO}')).all()} if marcados else set()
    cursos = set(_ids_marcados(sid, 'courses'))
    cursos = {c.id for c in Course.query.filter(Course.id.in_(cursos), Course.school_id == sid).all()} if cursos else set()

    # Un curso con un alumno real se queda, con todas sus asignaturas
    if cursos:
        de_reales = set()
        for filas in (
            db.session.query(Enrollment.course_id, Enrollment.student_id).filter(Enrollment.course_id.in_(cursos)),
            db.session.query(Annotation.course_id, Annotation.student_id).filter(Annotation.course_id.in_(cursos)),
            db.session.query(CourseSubject.course_id, Grade.student_id)
                .join(Grade, Grade.course_subject_id == CourseSubject.id)
                .filter(CourseSubject.course_id.in_(cursos)),
        ):
            de_reales |= {curso for curso, alumno in filas.all() if alumno not in usuarios}
        cursos -= de_reales

    materias = set(_ids_marcados(sid, 'subjects'))
    if materias:
        materias = {s.id for s in Subject.query.filter(Subject.id.in_(materias), Subject.school_id == sid).all()}
        en_uso = {cs.subject_id for cs in CourseSubject.query.filter(CourseSubject.subject_id.in_(materias)).all()
                  if cs.course_id not in cursos}
        en_uso |= {d.subject_id for d in CargaDemanda.query.filter(CargaDemanda.subject_id.in_(materias)).all()}
        materias -= en_uso

    _borrar_filas(User.__table__, usuarios)
    _borrar_filas(Course.__table__, cursos)
    _borrar_filas(Subject.__table__, materias)

    # Un período creado para el ejemplo se queda si quedaron notas reales en él
    for pid in _ids_marcados(sid, 'periods'):
        if not Grade.query.filter_by(period_id=pid).first():
            _borrar_filas(Period.__table__, [pid])

    DatoEjemplo.query.filter_by(school_id=sid).delete()
    school.tiene_demo = False
    db.session.flush()
    db.session.expire_all()


@autoonboarding_bp.route('/demo', methods=['DELETE'])
@require_colegio()
def borrar_demo():
    school = School.query.filter_by(id=get_jwt()['school_id']).with_for_update().first()
    try:
        _borrar_demo(school)
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception('Borrar datos de ejemplo falló en el colegio %s', get_jwt().get('school_id'))
        return jsonify({'error': 'No pudimos borrar los datos de ejemplo'}), 500
    return jsonify({'ok': True, 'resumen': _resumen(_colegio())}), 200
