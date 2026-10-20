"""
Historial de accesos y cambios (auditoría) de toda la plataforma.

- `registrar(...)` inserta una fila en audit_logs con una conexión PROPIA
  (db.engine.begin()), así nunca toca la transacción de la request.
- `instalar(app)` agrega un after_request que registra cada request que
  modifica datos (POST/PUT/PATCH/DELETE bajo /api/) y cada descarga de archivo.
- Registrar nunca debe romper la request: todo va envuelto en try/except.

Los `details` guardan un resumen saneado de la request: nombres de campos,
valores cortos y parámetros de búsqueda. Nunca contraseñas, tokens, firmas,
imágenes, contenido de archivos ni base64.
"""
import json
import re
from datetime import datetime

from flask import request

# ── Saneamiento ─────────────────────────────────────────────────────────────

MAX_VALOR = 200          # caracteres por valor
MAX_DETAILS = 4000       # caracteres del JSON completo
MAX_LISTA = 20           # elementos que se muestran de una lista
OCULTO = '[oculto]'

# Palabras de un nombre de campo cuyo valor jamás se guarda (se compara por
# palabra: «firma» no debe tapar «confirmar», ni «file» a «profile»)
_PALABRAS_SENSIBLES = {
    'password', 'contrasena', 'contraseña', 'clave', 'passwd', 'pwd', 'pass',
    'token', 'secret', 'secreto', 'api', 'apikey', 'authorization', 'auth',
    'signature', 'firma', 'base64', 'b64', 'dataurl', 'data_url',
    'photo', 'foto', 'logo', 'image', 'imagen', 'img',
    'file', 'archivo', 'content', 'contenido', 'pdf', 'blob', 'adjunto',
}
# Fragmentos que delatan un secreto aunque vayan pegados a otra palabra
_FRAGMENTOS_SENSIBLES = ('password', 'contrase', 'token', 'secret', 'base64', 'signature')
_RE_BASE64 = re.compile(r"^[A-Za-z0-9+/=_-]{120,}$")


def _clave_sensible(clave):
    k = str(clave)
    # camelCase → snake_case, luego por palabras
    k = re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', k).lower()
    if any(f in k for f in _FRAGMENTOS_SENSIBLES):
        return True
    return any(p in _PALABRAS_SENSIBLES for p in re.split(r'[^a-z0-9ñ]+', k) if p)


def _recortar(texto, n=MAX_VALOR):
    texto = str(texto)
    return texto if len(texto) <= n else texto[:n] + '…'


def _valor_seguro(v, profundidad=0):
    """Versión corta y sin datos sensibles de un valor de la request."""
    if v is None or isinstance(v, (bool, int, float)):
        return v
    if isinstance(v, str):
        s = v.strip()
        if s.startswith('data:') or (len(s) >= 120 and _RE_BASE64.match(s)):
            return '[archivo omitido]'
        return _recortar(s)
    if isinstance(v, dict):
        if profundidad >= 2:
            return f'[{len(v)} campos]'
        return {str(k): (OCULTO if _clave_sensible(k) else _valor_seguro(x, profundidad + 1))
                for k, x in list(v.items())[:40]}
    if isinstance(v, (list, tuple)):
        if profundidad >= 2 or len(v) > MAX_LISTA:
            return f'[{len(v)} elementos]'
        return [_valor_seguro(x, profundidad + 1) for x in v]
    return _recortar(v)


def sanear(data):
    """Saneamiento público (también lo usan los tests)."""
    return _valor_seguro(data)


def _resumen_request(response=None):
    """details de la request actual: campos, valores, query y archivos."""
    det = {}
    try:
        body = request.get_json(silent=True) if request.is_json else None
    except Exception:
        body = None
    if isinstance(body, dict):
        det['campos'] = sorted(str(k) for k in body.keys())[:60]
        det['valores'] = sanear(body)
    elif isinstance(body, list):
        det['valores'] = f'[{len(body)} elementos]'
    else:
        try:
            if request.form:
                form = {k: request.form.get(k) for k in request.form.keys()}
                det['campos'] = sorted(form.keys())[:60]
                det['valores'] = sanear(form)
            if request.files:
                # Solo nombres: nunca el contenido
                det['archivos'] = [_recortar(f.filename or k, 120)
                                   for k, f in request.files.items(multi=True)][:20]
        except Exception:
            pass
    if request.args:
        det['query'] = sanear({k: request.args.get(k) for k in request.args.keys()})
    if response is not None and response.status_code >= 400:
        try:
            j = response.get_json(silent=True) if response.is_json else None
            if isinstance(j, dict) and (j.get('error') or j.get('msg')):
                det['error'] = _recortar(j.get('error') or j.get('msg'))
        except Exception:
            pass
    return det


def ip_cliente():
    xff = request.headers.get('X-Forwarded-For', '')
    if xff:
        return xff.split(',')[0].strip()[:64]
    return (request.remote_addr or '')[:64]


# ── Escritura independiente ────────────────────────────────────────────────

def _detalles_json(details):
    if not details:
        return None
    try:
        txt = json.dumps(details, ensure_ascii=False, default=str)
    except Exception:
        return None
    if len(txt) > MAX_DETAILS:
        # Demasiado largo: se queda con los nombres de campos
        corto = {k: details[k] for k in ('campos', 'query', 'archivos', 'error', 'motivo')
                 if k in details}
        corto['recortado'] = True
        txt = json.dumps(corto, ensure_ascii=False, default=str)[:MAX_DETAILS]
    return txt


def registrar(event, description, *, school_id=None, user_id=None, user_name=None,
              user_email=None, role=None, entity=None, entity_id=None, status_code=None,
              details=None, method=None, path=None, endpoint=None):
    """Inserta una fila de auditoría en su propia transacción. Nunca lanza."""
    try:
        from models import db, AuditLog
        try:
            ua = request.headers.get('User-Agent', '')
            ip = ip_cliente()
            method = method or request.method
            path = path or request.path
            endpoint = endpoint or request.endpoint
        except RuntimeError:          # fuera de una request
            ua, ip = '', None
        fila = {
            'school_id': school_id, 'user_id': user_id,
            'user_name': _recortar(user_name, 200) if user_name else None,
            'user_email': _recortar(user_email, 200) if user_email else None,
            'role': role, 'event': event, 'method': method,
            'path': _recortar(path, 500) if path else None,
            'endpoint': _recortar(endpoint, 120) if endpoint else None,
            'status_code': status_code, 'entity': entity,
            'entity_id': entity_id if isinstance(entity_id, int) else None,
            'description': _recortar(description, 500) if description else None,
            'details': _detalles_json(details),
            'ip': ip, 'user_agent': (ua or '')[:300] or None,
            'created_at': datetime.utcnow(),
        }
        with db.engine.begin() as conn:     # commit al salir, rollback si falla
            conn.execute(AuditLog.__table__.insert().values(**fila))
    except Exception as e:  # pragma: no cover - la auditoría nunca rompe la request
        print(f'⚠️  Auditoría: no se pudo registrar ({e})')


# ── Contexto legible (nombres de alumno / curso / usuario) ─────────────────

def _consulta(sql, **params):
    """SELECT de una fila con una conexión independiente (no usa db.session)."""
    from models import db
    from sqlalchemy import text
    try:
        with db.engine.connect() as conn:
            return conn.execute(text(sql), params).first()
    except Exception:
        return None


def _nombre_usuario(uid):
    if not uid:
        return None
    r = _consulta('SELECT first_name, last_name, email, school_id, role FROM users WHERE id = :i',
                  i=int(uid))
    return r


def _nombre(r):
    if not r:
        return None
    return ' '.join(p for p in (r[0], r[1]) if p).strip() or None


def _nombre_curso(cid):
    if not cid:
        return None
    r = _consulta('SELECT name FROM courses WHERE id = :i', i=int(cid))
    return r[0] if r else None


def _a_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


class _Contexto(dict):
    """Placeholders de las plantillas; se resuelven solo si la plantilla los usa."""

    def __init__(self, view_args, body, response):
        super().__init__()
        self.va = view_args or {}
        self.body = body if isinstance(body, dict) else {}
        self.response = response
        self._enr = None

    def _matricula(self):
        if self._enr is None:
            eid = _a_int(self.va.get('eid'))
            r = _consulta('SELECT student_id, course_id FROM enrollments WHERE id = :i', i=eid) \
                if eid else None
            self._enr = r or (None, None)
        return self._enr

    def _alumno_id(self):
        for k in ('sid', 'student_id'):
            if self.va.get(k):
                return _a_int(self.va[k])
        if self.va.get('eid'):
            return self._matricula()[0]
        return _a_int(self.body.get('student_id'))

    def _curso_id(self):
        for k in ('course_id', 'curso_id'):
            if self.va.get(k):
                return _a_int(self.va[k])
        if self.va.get('eid'):
            return self._matricula()[1]
        return _a_int(self.body.get('course_id'))

    def __missing__(self, clave):
        valor = ''
        if clave == 'alumno':
            sid = self._alumno_id()
            valor = _nombre(_nombre_usuario(sid)) or (f'el alumno #{sid}' if sid else 'un alumno')
        elif clave in ('curso', 'de_curso', 'en_curso'):
            nombre = _nombre_curso(self._curso_id())
            if clave == 'curso':
                valor = nombre or 'un curso'
            elif nombre:
                valor = (' de ' if clave == 'de_curso' else ' en ') + nombre
        elif clave == 'usuario':
            uid = _a_int(self.va.get('user_id') or self.va.get('uid'))
            valor = _nombre(_nombre_usuario(uid)) or (f'#{uid}' if uid else '')
        elif clave == 'year':
            valor = str(self.va.get('year') or self.body.get('year') or '').strip()
        elif clave == 'nombre_q':
            b = self.body
            nombre = b.get('name') or b.get('nombre') or b.get('title') or ' '.join(
                str(p) for p in (b.get('first_name'), b.get('last_name')) if p)
            valor = f' «{_recortar(nombre, 80)}»' if nombre else ''
        elif clave == 'id_txt':
            eid = entity_id_de(self.va, self.response)
            valor = f' #{eid}' if eid else ''
        self[clave] = valor
        return valor


# ── Tabla de eventos / entidades ───────────────────────────────────────────

EVENTOS = ('login', 'login_fallido', 'logout', 'crear', 'editar', 'eliminar',
           'descargar', 'importar', 'accion')

METODO_EVENTO = {'POST': 'crear', 'PUT': 'editar', 'PATCH': 'editar', 'DELETE': 'eliminar'}

# Último segmento de la ruta → evento (endpoints de acción sin entrada propia)
SEGMENTOS_ACCION = {
    'cerrar', 'reabrir', 'confirmar', 'confirmar-todos', 'publish', 'unpublish', 'publicar',
    'avanzar', 'toggle-active', 'set-plan', 'cambiar-curso', 'reincorporar', 'activar',
    'copiar', 'sugerir', 'aplicar-sugerencia', 'copiar-distribucion', 'reiniciar-distribucion',
    'mover', 'iniciar', 'autocompletar', 'previsualizar', 'cancel', 'simulate-payment',
    'ensure-periods', 'ensure-all-periods', 'transcribe', 'extract-from-image',
}
SEGMENTOS_IMPORTAR = {'importar', 'import'}

# Blueprint → (entidad, sustantivo con artículo para la descripción genérica)
BLUEPRINTS = {
    'auth':            ('Sesión', 'la sesión'),
    'students':        ('Alumno', 'la ficha de un alumno'),
    'matricula':       ('Matrícula', 'una matrícula'),
    'grades':          ('Nota', 'una nota'),
    'annotations':     ('Anotación', 'una anotación'),
    'users':           ('Usuario', 'un usuario'),
    'courses':         ('Curso', 'un curso'),
    'subjects':        ('Asignatura', 'una asignatura'),
    'periods':         ('Período', 'un período'),
    'anios':           ('Año académico', 'un año académico'),
    'convivencia':     ('Caso de convivencia', 'un caso de convivencia'),
    'carga_academica': ('Carga académica', 'un registro de la carga académica'),
    'schools':         ('Colegio', 'los datos del colegio'),
    'onboarding':      ('Puesta en marcha', 'la puesta en marcha'),
    'super_admin':     ('Colegio', 'un colegio'),
    'payments':        ('Suscripción', 'una suscripción'),
    'ocr':             ('Anotación', 'anotaciones escaneadas'),
    'sitio':           ('Solicitud de demo', 'una solicitud de demo'),
    'reports':         ('Reporte', 'un reporte'),
    'ia':              ('IA', 'una consulta de IA'),
}

VERBOS = {
    'crear': 'Creó', 'editar': 'Editó', 'eliminar': 'Eliminó', 'importar': 'Importó',
    'descargar': 'Descargó', 'accion': 'Realizó una acción sobre',
}

# endpoint → (evento | None = según método, entidad | None = la del blueprint, plantilla)
ENDPOINTS = {
    # Sesión
    'auth.logout':                    ('logout', 'Sesión', 'Cerró sesión'),
    'auth.change_password':           ('editar', 'Usuario', 'Cambió su contraseña'),
    # Años académicos
    'anios.crear_anio':               ('crear', None, 'Creó el año académico {year}'),
    'anios.cerrar_anio':              ('accion', None, 'Cerró el año académico {year}'),
    'anios.reabrir_anio':             ('accion', None, 'Reabrió el año académico {year}'),
    # Anotaciones y notas
    'annotations.create_annotation':  ('crear', None, 'Registró una anotación a {alumno}'),
    'annotations.update_annotation':  (None, None, 'Editó una anotación{id_txt}'),
    'annotations.delete_annotation':  (None, None, 'Eliminó una anotación{id_txt}'),
    'grades.create_grade':            ('crear', None, 'Registró una nota a {alumno}'),
    'grades.update_grade':            (None, None, 'Editó una nota{id_txt}'),
    'grades.delete_grade':            (None, None, 'Eliminó una nota{id_txt}'),
    'grades.create_bulk_grades':      ('crear', None, 'Registró notas en bloque'),
    'grades.publish_grades':          ('accion', None, 'Publicó notas'),
    'grades.unpublish_grades':        ('accion', None, 'Despublicó notas'),
    # Cursos
    'courses.create_course':          ('crear', None, 'Creó un curso{nombre_q}'),
    'courses.update_course':          (None, None, 'Editó el curso {curso}'),
    'courses.enroll_student':         ('crear', 'Matrícula', 'Matriculó a {alumno} en {curso}'),
    'courses.add_subject':            ('crear', None, 'Agregó una asignatura a {curso}'),
    'courses.update_course_subject':  (None, None, 'Editó una asignatura de {curso}'),
    'courses.remove_course_subject':  (None, None, 'Quitó una asignatura de {curso}'),
    # Matrícula
    'matricula.matricular':           ('crear', None, 'Matriculó a {alumno} en {curso}'),
    'matricula.confirmar_todos':      ('accion', None, 'Confirmó la matrícula de todo {curso}'),
    'matricula.retirar':              ('accion', None, 'Retiró a {alumno}{de_curso}'),
    'matricula.cambiar_curso':        ('accion', None, 'Cambió de curso a {alumno}{de_curso}'),
    'matricula.confirmar':            ('accion', None, 'Confirmó la matrícula de {alumno}{en_curso}'),
    'matricula.reincorporar':         ('accion', None, 'Reincorporó a {alumno}{en_curso}'),
    'matricula.aplicar':              ('importar', None, 'Importó alumnos a la matrícula'),
    'matricula.previsualizar':        ('accion', None, 'Previsualizó una importación de matrícula'),
    'matricula.ficha_pdf':            ('descargar', None, 'Descargó la ficha de matrícula de {alumno}'),
    'matricula.plantilla':            ('descargar', None, 'Descargó la plantilla de matrícula'),
    # Ficha del alumno
    'students.update_profile':        ('editar', None, 'Editó la ficha de {alumno}'),
    'students.update_medical':        ('editar', None, 'Editó los datos de salud de {alumno}'),
    'students.set_guardians':         ('editar', None, 'Actualizó los apoderados de {alumno}'),
    'students.create_family_member':  ('crear', None, 'Agregó un familiar a la ficha de {alumno}'),
    'students.update_family_member':  ('editar', None, 'Editó un familiar de {alumno}'),
    'students.delete_family_member':  ('eliminar', None, 'Eliminó un familiar de {alumno}'),
    'students.create_member_access':  ('accion', 'Usuario', 'Creó el acceso de un familiar de {alumno}'),
    'students.create_authorization':  ('crear', None, 'Registró una autorización de {alumno}'),
    'students.update_authorization':  ('editar', None, 'Editó una autorización de {alumno}'),
    'students.delete_authorization':  ('eliminar', None, 'Eliminó una autorización de {alumno}'),
    'students.upload_document':       ('crear', None, 'Subió un documento a la ficha de {alumno}'),
    'students.update_document':       ('editar', None, 'Editó un documento de {alumno}'),
    'students.delete_document':       ('eliminar', None, 'Eliminó un documento de {alumno}'),
    'students.download_document':     ('descargar', None, 'Descargó un documento de {alumno}'),
    'students.create_template':       ('crear', 'Plantilla de autorización', 'Creó una plantilla de autorización{nombre_q}'),
    'students.update_template':       ('editar', 'Plantilla de autorización', 'Editó una plantilla de autorización{id_txt}'),
    'students.delete_template':       ('eliminar', 'Plantilla de autorización', 'Eliminó una plantilla de autorización{id_txt}'),
    'students.import_matricula':      ('importar', None, 'Importó el Libro de Matrícula'),
    # Usuarios
    'users.create_user':              ('crear', None, 'Creó el usuario{nombre_q}'),
    'users.update_user':              ('editar', None, 'Editó el usuario {usuario}'),
    'users.delete_user':              ('eliminar', None, 'Eliminó el usuario {usuario}'),
    'users.update_user_photo':        ('editar', None, 'Cambió la foto de {usuario}'),
    'users.set_head_teacher':         ('accion', None, 'Asignó una jefatura de curso a {usuario}'),
    'users.set_guardian_students':    ('editar', None, 'Actualizó los alumnos vinculados a {usuario}'),
    # Asignaturas y períodos
    'subjects.create_subject':        ('crear', None, 'Creó una asignatura{nombre_q}'),
    'subjects.asignar_a_cursos':      ('accion', None, 'Asignó una asignatura a cursos'),
    'periods.create_period':          ('crear', None, 'Creó un período{nombre_q}'),
    # Convivencia
    'convivencia.create_case':        ('crear', None, 'Abrió un caso de convivencia'),
    'convivencia.update_case':        ('editar', None, 'Editó un caso de convivencia{id_txt}'),
    'convivencia.avanzar_estado':     ('accion', None, 'Avanzó la etapa de un caso de convivencia{id_txt}'),
    'convivencia.add_bitacora':       ('crear', None, 'Agregó una entrada a la bitácora de un caso{id_txt}'),
    'convivencia.delete_bitacora':    ('eliminar', None, 'Eliminó una entrada de la bitácora de un caso'),
    'convivencia.update_step':        ('editar', None, 'Actualizó un paso de un caso de convivencia'),
    'convivencia.extract_from_image': ('accion', None, 'Leyó un documento con IA para un caso de convivencia'),
    # Carga académica
    'carga_academica.iniciar_proceso':        ('accion', None, 'Inició el proceso de carga académica'),
    'carga_academica.publicar_proceso':       ('accion', None, 'Publicó la carga académica {year}'),
    'carga_academica.delete_proceso':         ('eliminar', None, 'Eliminó el proceso de carga académica {year}'),
    'carga_academica.sugerir_reparto':        ('accion', None, 'Pidió una sugerencia de reparto de la carga {year}'),
    'carga_academica.aplicar_sugerencia':     ('accion', None, 'Aplicó la sugerencia de reparto de la carga {year}'),
    'carga_academica.create_docente':         ('crear', None, 'Agregó un docente a la carga académica{nombre_q}'),
    'carga_academica.update_docente':         ('editar', None, 'Editó un docente de la carga académica{id_txt}'),
    'carga_academica.delete_docente':         ('eliminar', None, 'Quitó un docente de la carga académica{id_txt}'),
    'carga_academica.create_asignacion':      ('crear', None, 'Asignó horas a un docente{id_txt}'),
    'carga_academica.update_asignacion':      ('editar', None, 'Editó una asignación de horas{id_txt}'),
    'carga_academica.delete_asignacion':      ('eliminar', None, 'Eliminó una asignación de horas{id_txt}'),
    'carga_academica.create_actividad':       ('crear', None, 'Creó una actividad no lectiva{nombre_q}'),
    'carga_academica.delete_actividad':       ('eliminar', None, 'Eliminó una actividad no lectiva{id_txt}'),
    'carga_academica.create_asignatura':      ('crear', None, 'Agregó una asignatura a la carga académica{nombre_q}'),
    'carga_academica.create_demanda':         ('crear', None, 'Agregó horas por cubrir a la carga académica'),
    'carga_academica.update_demanda':         ('editar', None, 'Editó horas por cubrir de la carga académica{id_txt}'),
    'carga_academica.delete_demanda':         ('eliminar', None, 'Eliminó horas por cubrir de la carga académica{id_txt}'),
    'carga_academica.crear_cursos_demanda':   ('crear', None, 'Agregó cursos a la carga académica'),
    'carga_academica.set_celda':              ('editar', None, 'Editó el horario de un docente{id_txt}'),
    'carga_academica.autocompletar_horario':  ('accion', None, 'Autocompletó el horario de un docente{id_txt}'),
    'carga_academica.set_bloques':            ('editar', None, 'Editó los bloques del horario'),
    'carga_academica.copiar_distribucion':    ('accion', None, 'Copió la distribución de la carga {year}'),
    'carga_academica.reiniciar_distribucion': ('accion', None, 'Reinició la distribución de la carga {year}'),
    'carga_academica.mover_proceso':          ('accion', None, 'Movió el proceso de carga académica a otro año'),
    'carga_academica.seed_lenguaje':          ('accion', None, 'Cargó la carga académica de ejemplo'),
    'carga_academica.horario_pdf':            ('descargar', None, 'Descargó el horario de un docente'),
    'carga_academica.informe_docente':        ('descargar', None, 'Descargó el informe de carga de un docente (Word)'),
    'carga_academica.informe_docente_pdf':    ('descargar', None, 'Descargó el informe de carga de un docente (PDF)'),
    'carga_academica.horarios_departamento_pdf': ('descargar', None, 'Descargó los horarios del departamento'),
    'carga_academica.informe_departamento':      ('descargar', None, 'Descargó el informe del departamento (Word)'),
    'carga_academica.informe_departamento_pdf':  ('descargar', None, 'Descargó el informe del departamento (PDF)'),
    # Colegio y puesta en marcha
    'schools.create_school':          ('crear', None, 'Creó un colegio{nombre_q}'),
    'schools.update_school':          ('editar', None, 'Editó los datos del colegio'),
    'schools.upload_logo':            ('editar', None, 'Cambió el logo del colegio'),
    'onboarding.activar_accesos':     ('accion', None, 'Activó los accesos del equipo'),
    'onboarding.cerrar':              ('accion', None, 'Cerró la puesta en marcha'),
    'onboarding.reabrir':             ('accion', None, 'Reabrió la puesta en marcha'),
    'onboarding.copiar_cursos':       ('accion', 'Curso', 'Copió los cursos de otro año'),
    'onboarding.equipo_aplicar':      ('importar', 'Usuario', 'Importó el equipo del colegio'),
    'onboarding.equipo_previsualizar': ('accion', 'Usuario', 'Previsualizó la importación del equipo'),
    'onboarding.fijar_year':          ('editar', None, 'Fijó el año de la puesta en marcha'),
    'onboarding.equipo_plantilla':    ('descargar', None, 'Descargó la plantilla del equipo'),
    # Super admin
    'super_admin.create_school':           ('crear', None, 'Creó un colegio{nombre_q}'),
    'super_admin.update_school':           ('editar', None, 'Editó un colegio{id_txt}'),
    'super_admin.create_user_for_school':  ('crear', 'Usuario', 'Creó un usuario{nombre_q} para un colegio'),
    'super_admin.toggle_school_active':    ('accion', None, 'Activó o desactivó un colegio{id_txt}'),
    'super_admin.set_school_plan':         ('accion', None, 'Cambió el plan de un colegio{id_txt}'),
    'super_admin.create_super_admin':      ('crear', 'Usuario', 'Creó un super administrador{nombre_q}'),
    'super_admin.crear_usuario':           ('crear', 'Usuario', 'Creó el usuario{nombre_q}'),
    'super_admin.actualizar_usuario':      ('editar', 'Usuario', 'Editó un usuario{id_txt}'),
    'super_admin.desactivar_usuario':      ('eliminar', 'Usuario', 'Desactivó un usuario{id_txt}'),
    'super_admin.ensure_periods':          ('accion', None, 'Creó los períodos que faltaban de un colegio{id_txt}'),
    'super_admin.ensure_all_periods':      ('accion', None, 'Creó los períodos que faltaban en todos los colegios'),
    'super_admin.seed_franz_liszt':        ('accion', None, 'Cargó datos de un colegio de ejemplo'),
    'periods.update_period':          ('editar', None, 'Editó un período{id_txt}'),
    'periods.delete_period':          ('eliminar', None, 'Eliminó un período{id_txt}'),
    'subjects.update_subject':        ('editar', None, 'Editó una asignatura{id_txt}'),
    'subjects.delete_subject':        ('eliminar', None, 'Eliminó una asignatura{id_txt}'),
    # Otros
    'payments.mp_webhook':            ('accion', None, 'Notificación de pago de Mercado Pago'),
    'ocr.save_annotations':           ('crear', None, 'Guardó anotaciones escaneadas'),
    'ocr.transcribe_image':           ('accion', None, 'Transcribió una foto de anotaciones'),
    'sitio.crear_lead':               ('crear', None, 'Envió una solicitud de demo'),
    'sitio.marcar_lead':              ('editar', None, 'Marcó una solicitud de demo'),
}

# Argumentos de la URL que identifican la entidad, del más específico al menos
_ARGS_ID = ('eid', 'grade_id', 'annotation_id', 'case_id', 'entry_id', 'step_id', 'cs_id',
            'mid', 'aid', 'did', 'tid', 'rid', 'user_id', 'uid', 'subject_id', 'period_id',
            'course_id', 'curso_id', 'school_id', 'sub_id', 'lead_id', 'sid', 'student_id')

_DESCARGA = re.compile(r'(\.pdf|\.docx|\.xlsx)$|/download', re.I)


def es_descarga(path):
    return bool(_DESCARGA.search(path or ''))


def entity_id_de(view_args, response=None):
    va = view_args or {}
    for k in _ARGS_ID:
        if isinstance(va.get(k), int):
            return va[k]
    # POST de creación: el id suele venir en la respuesta
    if response is not None and response.status_code < 400:
        try:
            j = response.get_json(silent=True) if response.is_json else None
            if isinstance(j, dict):
                for k in ('id',):
                    if isinstance(j.get(k), int):
                        return j[k]
                for v in j.values():
                    if isinstance(v, dict) and isinstance(v.get('id'), int):
                        return v['id']
        except Exception:
            pass
    return None


def clasificar(method, path, endpoint, view_args=None, body=None, response=None):
    """→ (evento, entidad, descripción, entity_id) de una request."""
    blueprint = (endpoint or '').split('.')[0] if endpoint and '.' in endpoint else ''
    entidad_bp, sustantivo = BLUEPRINTS.get(blueprint, (None, 'un registro'))
    segmento = (path or '').rstrip('/').rsplit('/', 1)[-1].lower()

    if method == 'GET':
        evento = 'descargar'
    else:
        evento = METODO_EVENTO.get(method, 'accion')
        if segmento in SEGMENTOS_IMPORTAR:
            evento = 'importar'
        elif segmento in SEGMENTOS_ACCION:
            evento = 'accion'

    entrada = ENDPOINTS.get(endpoint)
    ctx = _Contexto(view_args, body, response)
    if entrada:
        ev, ent, plantilla = entrada
        evento = ev or evento
        entidad = ent or entidad_bp
        try:
            descripcion = plantilla.format_map(ctx)
        except Exception:
            descripcion = plantilla
    else:
        entidad = entidad_bp
        if evento == 'descargar':
            descripcion = f'Descargó un archivo de {sustantivo}'
        else:
            descripcion = f'{VERBOS.get(evento, "Modificó")} {sustantivo}{ctx["id_txt"]}'
    descripcion = re.sub(r'\s+', ' ', descripcion).strip()
    return evento, entidad, descripcion, entity_id_de(view_args, response)


# ── Hook after_request ─────────────────────────────────────────────────────

_RUTAS_EXCLUIDAS = ('/api/auth/login', '/api/auditoria')


def _debe_registrar(method, path):
    if not path.startswith('/api/'):
        return False
    if any(path == r or path.startswith(r + '/') for r in _RUTAS_EXCLUIDAS):
        return False
    if 'health' in path.rsplit('/', 1)[-1]:
        return False
    if method in ('POST', 'PUT', 'PATCH', 'DELETE'):
        return True
    return method == 'GET' and es_descarga(path)


def _actor():
    """(user_id, role, school_id) del JWT, si viene uno válido."""
    try:
        from flask_jwt_extended import verify_jwt_in_request, get_jwt
        verify_jwt_in_request(optional=True)
        claims = get_jwt() or {}
        uid = _a_int(claims.get('sub'))
        return uid, claims.get('role'), claims.get('school_id')
    except Exception:
        return None, None, None


def registrar_request(response):
    method, path = request.method, request.path
    if not _debe_registrar(method, path):
        return
    if response.status_code >= 400:
        # Una request fallida puede dejar escrituras sin confirmar en la sesión
        # (en SQLite, con la base bloqueada). El teardown las descartaría igual;
        # se descartan antes para que el insert independiente no espere.
        try:
            from models import db
            db.session.rollback()
        except Exception:
            pass
    uid, role, school_id = _actor()
    nombre = email = None
    if uid:
        u = _nombre_usuario(uid)
        if u:
            nombre, email = _nombre(u), u[2]
            role = role or u[4]
            if school_id is None:
                school_id = u[3]
    va = request.view_args or {}
    # Acciones del super_admin sobre un colegio quedan visibles para ese colegio
    if school_id is None and isinstance(va.get('school_id'), int):
        school_id = va['school_id']
    try:
        body = request.get_json(silent=True) if request.is_json else None
    except Exception:
        body = None
    evento, entidad, descripcion, entity_id = clasificar(
        method, path, request.endpoint, va, body, response)
    registrar(evento, descripcion, school_id=school_id, user_id=uid, user_name=nombre,
              user_email=email, role=role, entity=entidad, entity_id=entity_id,
              status_code=response.status_code, details=_resumen_request(response))


def instalar(app):
    @app.after_request
    def _auditoria_after_request(response):
        try:
            registrar_request(response)
        except Exception as e:  # pragma: no cover
            print(f'⚠️  Auditoría: {e}')
        return response


def registrar_login(user=None, email=None, ok=True, motivo=None, status_code=200):
    """Login exitoso o fallido (llamado desde routes/auth.py). Nunca guarda la clave."""
    det = {'email': _recortar(email or '', 200)} if email else {}
    if motivo:
        det['motivo'] = motivo
    if user is not None:
        nombre = f'{user.first_name or ""} {user.last_name or ""}'.strip()
        registrar('login' if ok else 'login_fallido',
                  'Inició sesión' if ok else 'Intento fallido de inicio de sesión',
                  school_id=user.school_id, user_id=user.id, user_name=nombre or None,
                  user_email=user.email, role=user.role, entity='Sesión',
                  status_code=status_code, details=det or None)
    else:
        registrar('login_fallido', 'Intento fallido de inicio de sesión',
                  user_email=email or None, entity='Sesión',
                  status_code=status_code, details=det or None)
