"""Carga inicial con Excel y datos de ejemplo."""
import io
import time
import uuid
import zipfile

import pytest
from openpyxl import Workbook, load_workbook

from conftest import create_user, login
from models import (db, School, User, Course, Enrollment, Grade, Annotation, Subject, CourseSubject,
                    StudentFamilyMember, DatoEjemplo, CLAVE_INUTILIZABLE)
from routes import autoonboarding as ao
from routes import registro as registro_mod


@pytest.fixture(autouse=True)
def sin_limite():
    registro_mod._INTENTOS.clear()


def colegio_nuevo(client, nombre='Colegio Excel'):
    r = client.post('/api/registro', json={'nombre': 'Ana', 'apellido': 'Prueba',
                                           'email': f'p.{uuid.uuid4().hex[:10]}@example.com',
                                           'password': 'una-clave-larga'})
    r2 = client.post('/api/registro/colegio', json={'nombre': nombre},
                     headers={'Authorization': f"Bearer {r.get_json()['access_token']}"})
    d = r2.get_json()
    return {'Authorization': f"Bearer {d['access_token']}"}, d['school']['id']


def xlsx(**hojas):
    wb = Workbook()
    wb.remove(wb.active)
    for nombre, filas in hojas.items():
        ws = wb.create_sheet(nombre.replace('_', ' '))
        for f in filas:
            ws.append(f)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def subir(client, h, ruta, contenido, nombre='datos.xlsx'):
    return client.post(f'/api/autoonboarding/{ruta}', headers=h, content_type='multipart/form-data',
                       data={'archivo': (io.BytesIO(contenido), nombre)})


# RUT con dígito verificador correcto, inventados para la prueba
RUT_A, RUT_B, RUT_C = '6.000.001-8', '6.000.000-K', '6.000.002-6'
ALUMNOS = [['Curso', 'RUT', 'Nombres', 'Apellidos', 'Email apoderado', 'Teléfono apoderado'],
           ['1° Básico A', RUT_A, 'Ana', 'Soto Vera', 'mama.ana@example.com', '+56 9 1111 1111'],
           ['1° Básico A', RUT_B, 'Luis', 'Rojas Paz', 'papa.luis@example.com', ''],
           ['2° Básico A', RUT_C, 'Eva', 'Mora Gil', '', '']]
DOCENTES = [['Nombres', 'Apellidos', 'Email', 'Asignatura', 'Curso'],
            ['Paula', 'Tapia Ruiz', 'paula.tapia@example.com', 'Matemática', '1° Básico A'],
            ['Paula', 'Tapia Ruiz', 'paula.tapia@example.com', 'Lenguaje', '2° Básico A']]


def test_ruts_de_las_pruebas_son_validos():
    from routes.students import rut_is_valid
    assert all(rut_is_valid(r) for r in (RUT_A, RUT_B, RUT_C))


# ── Plantilla ────────────────────────────────────────────────────────────────

def test_plantilla_e_ignora_sus_ejemplos(client):
    h, _ = colegio_nuevo(client)
    r = client.get('/api/autoonboarding/plantilla.xlsx', headers=h)
    assert r.status_code == 200
    wb = load_workbook(io.BytesIO(r.data))
    assert wb.sheetnames[:2] == ['Alumnos', 'Docentes'] and 'Instrucciones' in wb.sheetnames
    assert [c.value for c in wb['Alumnos'][1]] == ['Curso', 'RUT', 'Nombres', 'Apellidos',
                                                   'Email apoderado', 'Teléfono apoderado']
    assert [c.value for c in wb['Docentes'][1]] == ['Nombres', 'Apellidos', 'Email', 'Asignatura', 'Curso']
    # Subirla sin cambios no crea a nadie
    d = subir(client, h, 'previsualizar', r.data).get_json()
    assert d['total_alumnos'] == 0 and d['total_docentes'] == 0 and d['se_puede_aplicar'] is False
    assert any('ejemplo' in e['motivo'] for e in d['errores'])


# ── Vista previa ─────────────────────────────────────────────────────────────

def test_previsualizar_forma_exacta_y_no_escribe(client, app):
    h, sid = colegio_nuevo(client)
    r = subir(client, h, 'previsualizar', xlsx(Alumnos=ALUMNOS, Docentes=DOCENTES))
    assert r.status_code == 200, r.get_data(as_text=True)
    d = r.get_json()
    assert set(d) == {'columnas_detectadas', 'columnas_faltantes', 'cursos', 'total_alumnos', 'total_docentes',
                      'total_apoderados', 'muestra', 'errores', 'se_puede_aplicar'}
    assert d['columnas_detectadas']['rut'] == 'RUT' and d['columnas_faltantes'] == []
    assert d['cursos'] == [{'nombre': '1° Básico A', 'alumnos': 2}, {'nombre': '2° Básico A', 'alumnos': 1}]
    assert (d['total_alumnos'], d['total_docentes'], d['total_apoderados']) == (3, 1, 2)
    assert len(d['muestra']) == 3 and d['se_puede_aplicar'] is True
    with app.app_context():
        assert Course.query.filter_by(school_id=sid).count() == 0
        assert User.query.filter_by(school_id=sid).count() == 1


def test_excel_ajeno_con_titulo_sinonimos_y_nombre_completo(client):
    h, _ = colegio_nuevo(client)
    ajeno = xlsx(Hoja1=[
        ['NÓMINA 2026 - COLEGIO CUALQUIERA'],
        [],
        ['N°', 'ALUMNO/A', 'R.U.N.', 'CURSO', 'CORREO DEL APODERADO', 'CELULAR'],
        [1, 'Soto Vera, Ana', 60000018, '1° Básico A', 'x@example.com', 912345678],
        [2, 'Luis Rojas Paz', None, '1° Básico A', None, None],
    ])
    d = subir(client, h, 'previsualizar', ajeno).get_json()
    assert d['columnas_detectadas']['nombre_completo'] == 'ALUMNO/A'
    assert d['columnas_detectadas']['email_apoderado'] == 'CORREO DEL APODERADO'
    assert d['total_alumnos'] == 2 and d['se_puede_aplicar'] is True, d
    assert d['muestra'][0]['nombres'] == 'Ana' and d['muestra'][0]['apellidos'] == 'Soto Vera'
    assert d['muestra'][0]['rut'] == RUT_A
    assert d['muestra'][1]['apellidos'] == 'Rojas Paz'


def test_una_hoja_por_curso(client):
    h, _ = colegio_nuevo(client)
    filas = [['RUT', 'Nombres', 'Apellidos'], [RUT_A, 'Ana', 'Soto Vera']]
    d = subir(client, h, 'previsualizar', xlsx(**{'3° Básico B': filas})).get_json()
    assert d['cursos'] == [{'nombre': '3° Básico B', 'alumnos': 1}]


def test_csv_con_punto_y_coma(client):
    h, _ = colegio_nuevo(client)
    csv = f'curso;rut;nombres;apellidos\n1° Básico A;{RUT_A};Ana;Soto\n'.encode()
    d = subir(client, h, 'previsualizar', csv, 'nomina.csv').get_json()
    assert d['total_alumnos'] == 1


def test_errores_entendibles_por_fila(client):
    h, _ = colegio_nuevo(client)
    d = subir(client, h, 'previsualizar', xlsx(Alumnos=[
        ALUMNOS[0],
        ['1° Básico A', '12.345.678-0', 'Malo', 'Digito', '', ''],
        ['1° Básico A', RUT_A, 'Sin', '', '', ''],
        ['', RUT_B, 'Sin', 'Curso', '', ''],
        ['1° Básico A', RUT_C, 'Eva', 'Mora', 'no-es-correo', ''],
        ['1° Básico A', RUT_C, 'Eva', 'Mora', '', ''],
    ])).get_json()
    motivos = {e['fila']: e['motivo'] for e in d['errores']}
    assert 'verificador' in motivos[2] and 'apellido' in motivos[3] and 'curso' in motivos[4]
    assert 'correo' in motivos[5] and 'repetido' in motivos[6]
    assert d['total_alumnos'] == 1          # la del correo malo igual se carga


def test_columnas_faltantes(client):
    h, _ = colegio_nuevo(client)
    d = subir(client, h, 'previsualizar', xlsx(Hoja1=[['Dato', 'Otro'], ['a', 'b']])).get_json()
    assert d['se_puede_aplicar'] is False
    assert set(d['columnas_faltantes']) == {'curso', 'nombres', 'apellidos'}


# ── Validación del archivo ───────────────────────────────────────────────────

@pytest.mark.parametrize('contenido,nombre', [
    (b'esto no es un excel', 'falso.xlsx'),
    (b'PK\x03\x04roto', 'roto.xlsx'),
    (b'MZ\x90\x00programa', 'programa.exe'),
    (b'\xd0\xcf\x11\xe0antiguo', 'antiguo.xls'),
    (b'', 'vacio.xlsx'),
    (b'a\x00b,c', 'binario.csv'),
])
def test_rechaza_archivos_que_no_son_excel(client, contenido, nombre):
    h, _ = colegio_nuevo(client)
    r = subir(client, h, 'previsualizar', contenido, nombre)
    assert r.status_code == 400 and r.get_json()['error']


def test_rechaza_zip_que_no_es_excel(client):
    h, _ = colegio_nuevo(client)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as z:
        z.writestr('hola.txt', 'hola')
    assert subir(client, h, 'previsualizar', buf.getvalue()).status_code == 400


def test_rechaza_archivo_grande_con_json(client):
    h, _ = colegio_nuevo(client)
    r = subir(client, h, 'previsualizar', b'PK' + b'0' * ao.MAX_BYTES)
    assert r.status_code == 413 and r.get_json()['error']


def test_rechaza_zip_bomb(client, monkeypatch):
    h, _ = colegio_nuevo(client)
    monkeypatch.setattr(ao, 'MAX_DESCOMPRIMIDO', 100)
    assert subir(client, h, 'previsualizar', xlsx(Alumnos=ALUMNOS)).status_code == 400


def test_rechaza_demasiadas_filas(client, monkeypatch):
    h, _ = colegio_nuevo(client)
    monkeypatch.setattr(ao, 'MAX_FILAS', 2)
    r = subir(client, h, 'previsualizar', xlsx(Alumnos=ALUMNOS))
    assert r.status_code == 400 and 'filas' in r.get_json()['error']


def test_falta_archivo_400(client):
    h, _ = colegio_nuevo(client)
    assert client.post('/api/autoonboarding/previsualizar', headers=h).status_code == 400


# ── Permisos ─────────────────────────────────────────────────────────────────

def test_permisos(client, headers):
    assert client.get('/api/autoonboarding/resumen').status_code == 401
    for rol in ('profesor', 'apoderado', 'alumno'):
        assert client.get('/api/autoonboarding/resumen', headers=headers[rol]).status_code == 403
        assert client.post('/api/autoonboarding/demo', headers=headers[rol]).status_code == 403
    assert client.get('/api/autoonboarding/resumen', headers=headers['directivo']).status_code == 200


# ── Aplicar ──────────────────────────────────────────────────────────────────

def test_aplicar_crea_y_es_idempotente(client, app):
    h, sid = colegio_nuevo(client)
    archivo = xlsx(Alumnos=ALUMNOS, Docentes=DOCENTES)
    r = subir(client, h, 'aplicar', archivo)
    assert r.status_code == 200, r.get_data(as_text=True)
    d = r.get_json()
    assert set(d) == {'cursos_creados', 'alumnos_creados', 'alumnos_actualizados', 'docentes_creados',
                      'apoderados_creados', 'omitidos', 'resumen'}
    assert (d['cursos_creados'], d['alumnos_creados'], d['alumnos_actualizados']) == (2, 3, 0)
    assert (d['docentes_creados'], d['apoderados_creados']) == (1, 2) and d['omitidos'] == []
    assert d['resumen'] == client.get('/api/autoonboarding/resumen', headers=h).get_json()
    res = d['resumen']
    assert (res['cursos'], res['alumnos'], res['docentes'], res['apoderados'], res['asignaturas']) == (2, 3, 1, 2, 2)
    assert res['por_curso'][0] == {'nombre': '1° Básico A', 'alumnos': 2, 'promedio': None}
    assert res['promedio_general'] is None and res['asistencia'] is None and res['anotaciones'] == 0

    d2 = subir(client, h, 'aplicar', archivo).get_json()
    assert (d2['cursos_creados'], d2['alumnos_creados'], d2['alumnos_actualizados']) == (0, 0, 3)
    assert (d2['docentes_creados'], d2['apoderados_creados']) == (0, 0)
    assert d2['resumen'] == res

    with app.app_context():
        alumnos = User.query.filter_by(school_id=sid, role='alumno').all()
        assert len(alumnos) == 3
        # Nadie queda con clave conocida ni con acceso
        assert all(a.password_hash == CLAVE_INUTILIZABLE for a in alumnos)
        p = User.query.filter_by(email='paula.tapia@example.com').first()
        assert p.role == 'profesor' and p.is_active is False and p.school_id == sid
        assert CourseSubject.query.filter_by(teacher_id=p.id).count() == 2
        assert User.query.filter_by(school_id=sid, role='apoderado').count() == 0
        titular = StudentFamilyMember.query.filter_by(email='mama.ana@example.com').one()
        assert titular.guardian_role == 'titular' and titular.user_id is None


def test_aplicar_nunca_envia_correos(client, monkeypatch):
    import smtplib
    def explota(*_a, **_k):
        raise AssertionError('Se intentó enviar un correo')
    monkeypatch.setattr(smtplib, 'SMTP', explota)
    monkeypatch.setattr(smtplib, 'SMTP_SSL', explota)
    h, _ = colegio_nuevo(client)
    assert subir(client, h, 'aplicar', xlsx(Alumnos=ALUMNOS, Docentes=DOCENTES)).status_code == 200


def test_alumnos_sin_rut_tambien_son_idempotentes(client, app):
    h, sid = colegio_nuevo(client)
    archivo = xlsx(Alumnos=[['Curso', 'Nombres', 'Apellidos'], ['1° Básico A', 'Ana', 'Soto']])
    assert subir(client, h, 'aplicar', archivo).get_json()['alumnos_creados'] == 1
    d = subir(client, h, 'aplicar', archivo).get_json()
    assert (d['alumnos_creados'], d['alumnos_actualizados']) == (0, 1)
    # Si después llega con RUT, se completa y no se duplica
    con_rut = xlsx(Alumnos=[['Curso', 'RUT', 'Nombres', 'Apellidos'], ['1° Básico A', RUT_A, 'Ana', 'Soto']])
    d = subir(client, h, 'aplicar', con_rut).get_json()
    assert (d['alumnos_creados'], d['alumnos_actualizados']) == (0, 1)
    with app.app_context():
        assert User.query.filter_by(school_id=sid, role='alumno').one().rut == RUT_A


def test_cambio_de_curso_no_deja_dos_matriculas_activas(client, app):
    h, sid = colegio_nuevo(client)
    subir(client, h, 'aplicar', xlsx(Alumnos=[ALUMNOS[0], ALUMNOS[1]]))
    fila = list(ALUMNOS[1])
    fila[0] = '2° Básico A'
    subir(client, h, 'aplicar', xlsx(Alumnos=[ALUMNOS[0], fila]))
    with app.app_context():
        u = User.query.filter_by(school_id=sid, role='alumno').one()
        assert Enrollment.query.filter_by(student_id=u.id, status='activo').count() == 1


def test_no_toca_cuentas_de_otro_colegio(client, app):
    h, sid = colegio_nuevo(client)
    # Mismo correo y mismo RUT que personas del colegio del seed
    ajeno = 'mvaldes@sanpatricio.cl'
    with app.app_context():
        pedro = User.query.filter_by(email='pedro.alvarado@gmail.com').first()
        pedro.rut = RUT_A
        db.session.commit()
        antes = pedro.first_name, pedro.school_id
        id_pedro = pedro.id
        escuela_docente = User.query.filter_by(email=ajeno).first().school_id
    r = subir(client, h, 'aplicar', xlsx(
        Alumnos=[ALUMNOS[0], ['1° Básico A', RUT_A, 'Intruso', 'Falso', 'apoderado@sanpatricio.cl', '']],
        Docentes=[DOCENTES[0], ['Mala', 'Persona', ajeno, 'Mate', '1° Básico A']]))
    d = r.get_json()
    assert r.status_code == 200 and d['docentes_creados'] == 0
    assert any(ajeno in o['motivo'] for o in d['omitidos'])
    with app.app_context():
        p = db.session.get(User, id_pedro)
        assert (p.first_name, p.school_id) == antes
        assert User.query.filter_by(email=ajeno).first().school_id == escuela_docente
        # El alumno es nuevo y propio, y el apoderado no se vinculó a la cuenta ajena
        nuevo = User.query.filter_by(school_id=sid, rut=RUT_A).one()
        assert nuevo.first_name == 'Intruso'
        fam = StudentFamilyMember.query.filter_by(student_id=nuevo.id).one()
        assert fam.user_id is None


def test_transaccion_unica_si_algo_falla(client, app, monkeypatch):
    h, sid = colegio_nuevo(client)
    def falla(*_a, **_k):
        raise RuntimeError('fallo a mitad de camino')
    monkeypatch.setattr(ao, '_aplicar_docentes', falla)
    r = subir(client, h, 'aplicar', xlsx(Alumnos=ALUMNOS, Docentes=DOCENTES))
    assert r.status_code == 500 and 'No se guardó nada' in r.get_json()['error']
    with app.app_context():
        assert Course.query.filter_by(school_id=sid).count() == 0
        assert User.query.filter_by(school_id=sid, role='alumno').count() == 0


def test_anio_cerrado_409(client, app):
    from datetime import date
    from models import AcademicYear
    h, sid = colegio_nuevo(client)
    with app.app_context():
        db.session.add(AcademicYear(school_id=sid, year=date.today().year, status='cerrado'))
        db.session.commit()
    assert subir(client, h, 'aplicar', xlsx(Alumnos=ALUMNOS)).status_code == 409
    assert client.post('/api/autoonboarding/demo', headers=h).status_code == 409


def test_aplicar_sin_filas_validas_400(client):
    h, _ = colegio_nuevo(client)
    assert subir(client, h, 'aplicar', xlsx(Hoja1=[['Dato'], ['a']])).status_code == 400


# ── Datos de ejemplo ─────────────────────────────────────────────────────────

def test_demo_carga_rapido_y_completo(client, app):
    h, sid = colegio_nuevo(client)
    t0 = time.time()
    r = client.post('/api/autoonboarding/demo', headers=h)
    dur = time.time() - t0
    assert r.status_code == 201, r.get_data(as_text=True)
    assert dur < 3, f'demo tardó {dur:.2f}s'
    res = r.get_json()['resumen']
    assert res['tiene_demo'] is True and res['cursos'] == 3 and res['alumnos'] == 30
    assert res['docentes'] == 5 and res['apoderados'] == 30 and res['asignaturas'] == 5
    assert 1.0 <= res['promedio_general'] <= 7.0 and res['anotaciones'] == 12
    assert all(c['alumnos'] == 10 and c['promedio'] for c in res['por_curso'])
    me = client.get('/api/auth/me', headers=h).get_json()
    assert me['school']['tiene_demo'] is True
    with app.app_context():
        gente = User.query.filter(User.school_id == sid, User.role.in_(('alumno', 'profesor'))).all()
        assert all(u.email.endswith('@ejemplo.invalid') for u in gente)
        assert all(u.password_hash == CLAVE_INUTILIZABLE for u in gente)
        correos = [f.email for f in StudentFamilyMember.query.join(
            User, StudentFamilyMember.student_id == User.id).filter(User.school_id == sid)]
        assert correos and all(c.endswith('@ejemplo.invalid') for c in correos)
    # Doble clic: no duplica
    r2 = client.post('/api/autoonboarding/demo', headers=h)
    assert r2.status_code == 200 and r2.get_json()['resumen']['alumnos'] == 30


def test_demo_no_permite_entrar_con_esas_cuentas(client, app):
    h, sid = colegio_nuevo(client)
    client.post('/api/autoonboarding/demo', headers=h)
    with app.app_context():
        email = User.query.filter_by(school_id=sid, role='profesor').first().email
    for clave in ('!', 'x', CLAVE_INUTILIZABLE):
        assert client.post('/api/auth/login', json={'email': email, 'password': clave}).status_code == 401


def test_demo_409_si_hay_alumnos_reales(client, headers, app):
    h, sid = colegio_nuevo(client)
    create_user(app, role='alumno', school_id=sid)
    assert client.post('/api/autoonboarding/demo', headers=h).status_code == 409
    assert client.post('/api/autoonboarding/demo', headers=headers['admin']).status_code == 409


def _conteos(sid):
    return {
        'usuarios': User.query.filter_by(school_id=sid).count(),
        'cursos': Course.query.filter_by(school_id=sid).count(),
        'asignaturas': Subject.query.filter_by(school_id=sid).count(),
        'marcas': DatoEjemplo.query.filter_by(school_id=sid).count(),
    }


def test_borrar_demo_deja_todo_como_estaba(client, app):
    h, sid = colegio_nuevo(client)
    with app.app_context():
        antes = _conteos(sid)
        notas, anot = Grade.query.count(), Annotation.query.count()
    client.post('/api/autoonboarding/demo', headers=h)
    r = client.delete('/api/autoonboarding/demo', headers=h)
    assert r.status_code == 200, r.get_data(as_text=True)
    assert r.get_json()['resumen']['tiene_demo'] is False
    with app.app_context():
        assert _conteos(sid) == antes
        assert (Grade.query.count(), Annotation.query.count()) == (notas, anot)
        assert db.session.get(School, sid).tiene_demo is False
    # Repetirlo no falla, y se puede volver a cargar
    assert client.delete('/api/autoonboarding/demo', headers=h).status_code == 200
    assert client.post('/api/autoonboarding/demo', headers=h).status_code == 201


def test_borrar_demo_conserva_lo_cargado_por_el_colegio(client, app):
    h, sid = colegio_nuevo(client)
    with app.app_context():
        real_docente = create_user(app, role='profesor', school_id=sid, email='real.docente@example.com')
    real_alumno = create_user(app, role='alumno', school_id=sid, email='real.alumno@example.com')
    propio = client.post('/api/courses/', headers=h, json={'name': 'Curso propio'}).get_json()['id']
    materia_propia = client.post('/api/subjects/', headers=h, json={'name': 'Taller propio'}).get_json()['id']
    # Un alumno real impide cargar el ejemplo: esta cuenta recién pasa a alumno después
    with app.app_context():
        u = db.session.get(User, real_alumno)
        u.role = 'directivo'
        db.session.commit()
    assert client.post('/api/autoonboarding/demo', headers=h).status_code == 201
    with app.app_context():
        u = db.session.get(User, real_alumno)
        u.role = 'alumno'
        demo = Course.query.filter_by(school_id=sid, name='1° Básico A').first()
        otro = Course.query.filter_by(school_id=sid, name='4° Básico A').first()
        materia_demo = Subject.query.filter_by(school_id=sid, code='MAT').first()
        # Encima del ejemplo, el colegio matriculó a un alumno real y usó una asignatura
        db.session.add(Enrollment(student_id=real_alumno, course_id=demo.id, year=demo.year, status='activo'))
        db.session.add(CourseSubject(course_id=propio, subject_id=materia_demo.id, teacher_id=real_docente))
        ids_demo, id_otro, id_mat = demo.id, otro.id, materia_demo.id
        db.session.commit()

    assert client.delete('/api/autoonboarding/demo', headers=h).status_code == 200
    with app.app_context():
        assert db.session.get(User, real_alumno) and db.session.get(User, real_docente)
        assert db.session.get(Course, propio) and db.session.get(Subject, materia_propia)
        # El curso con alumno real y la asignatura en uso se quedan; el resto se va
        assert db.session.get(Course, ids_demo) is not None
        assert db.session.get(Course, id_otro) is None
        assert db.session.get(Subject, id_mat) is not None
        assert Enrollment.query.filter_by(course_id=ids_demo).one().student_id == real_alumno
        assert User.query.filter(User.school_id == sid, User.email.like('%@ejemplo.invalid')).count() == 0
        assert DatoEjemplo.query.filter_by(school_id=sid).count() == 0


def test_borrar_demo_no_toca_otros_colegios(client, app):
    h1, s1 = colegio_nuevo(client, 'Uno')
    h2, s2 = colegio_nuevo(client, 'Dos')
    client.post('/api/autoonboarding/demo', headers=h1)
    client.post('/api/autoonboarding/demo', headers=h2)
    client.delete('/api/autoonboarding/demo', headers=h1)
    res = client.get('/api/autoonboarding/resumen', headers=h2).get_json()
    assert res['alumnos'] == 30 and res['tiene_demo'] is True
    assert client.get('/api/autoonboarding/resumen', headers=h1).get_json()['alumnos'] == 0


def test_borrar_demo_en_colegio_real_no_hace_nada(client, headers, app):
    with app.app_context():
        antes = User.query.count(), Course.query.count(), Grade.query.count()
    assert client.delete('/api/autoonboarding/demo', headers=headers['admin']).status_code == 200
    with app.app_context():
        assert (User.query.count(), Course.query.count(), Grade.query.count()) == antes


def test_subir_excel_reemplaza_el_ejemplo(client, app):
    h, sid = colegio_nuevo(client)
    client.post('/api/autoonboarding/demo', headers=h)
    d = subir(client, h, 'aplicar', xlsx(Alumnos=ALUMNOS)).get_json()
    assert d['alumnos_creados'] == 3 and d['resumen']['tiene_demo'] is False
    assert d['resumen']['alumnos'] == 3 and d['resumen']['promedio_general'] is None
    with app.app_context():
        assert User.query.filter(User.school_id == sid, User.email.like('%@ejemplo.invalid')).count() == 0
