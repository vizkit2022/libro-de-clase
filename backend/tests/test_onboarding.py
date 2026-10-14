"""Pruebas del asistente de puesta en marcha.

Lo que más importa verificar acá es que el avance se calcula de los datos
reales y no de una marca guardada: si alguien borra los cursos después de
haberlos creado, el paso tiene que volver a aparecer pendiente.

    python3 -m pytest backend/tests/test_onboarding.py -q
"""
import io
import os
import sys
from datetime import date

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ['DATABASE_URL'] = 'sqlite:///:memory:'


@pytest.fixture()
def entorno():
    from app import create_app
    from models import db, School, User, Course, Period, Subject, CourseSubject

    app = create_app()
    app.config['TESTING'] = True
    with app.app_context():
        colegio = School(name='Colegio de Prueba', rector='Ana Soto')
        db.session.add(colegio)
        db.session.commit()

        admin = User(school_id=colegio.id, email='admin@prueba.cl',
                     first_name='Víctor', last_name='Espinoza', role='admin')
        admin.set_password('x')
        db.session.add(admin)
        db.session.commit()

        from flask_jwt_extended import create_access_token
        token = create_access_token(
            identity=str(admin.id),
            additional_claims={'role': 'admin', 'school_id': colegio.id})

        cli = app.test_client()
        cli.environ_base['HTTP_AUTHORIZATION'] = f'Bearer {token}'
        yield app, cli, colegio.id, db


def estado(cli, year=2027):
    r = cli.get(f'/api/onboarding/estado?year={year}')
    assert r.status_code == 200, r.get_json()
    return r.get_json()


def paso(datos, clave):
    return next(p for p in datos['pasos'] if p['clave'] == clave)


# ── El avance se calcula, no se guarda ────────────────────────────────

def test_colegio_vacio_arranca_casi_en_cero(entorno):
    _, cli, _, _ = entorno
    d = estado(cli)
    assert d['total'] == 8
    assert d['pct'] <= 25
    assert d['docentes_pueden_entrar'] is False
    assert d['puede_cerrar'] is False
    # Sin cursos, los pasos que dependen de ellos salen bloqueados
    assert paso(d, 'matricula')['estado'] == 'bloqueado'
    assert paso(d, 'matricula')['bloqueado_por'] == 'cursos'


def test_el_avance_sube_y_baja_con_los_datos(entorno):
    app, cli, sid, db = entorno
    from models import Course

    with app.app_context():
        for n in (1, 2):
            db.session.add(Course(school_id=sid, name=f'{n}° Básico A',
                                  level=f'{n}° Básico', letter='A', year=2027))
        db.session.commit()

    assert paso(estado(cli), 'cursos')['estado'] == 'completo'

    # Y si los cursos se borran, el paso vuelve a estar pendiente. Esto es lo
    # que no pasaría si el avance se guardara como una marca.
    with app.app_context():
        Course.query.filter_by(school_id=sid, year=2027).delete()
        db.session.commit()

    assert paso(estado(cli), 'cursos')['estado'] == 'pendiente'


def test_el_paso_de_equipo_es_el_que_habilita_a_los_docentes(entorno):
    app, cli, sid, db = entorno
    from models import User

    assert estado(cli)['docentes_pueden_entrar'] is False

    with app.app_context():
        u = User(school_id=sid, email='p@prueba.cl', first_name='Rocío',
                 last_name='Herrera', role='profesor', is_active=False)
        u.set_password('x')
        db.session.add(u)
        db.session.commit()

    # Aunque la cuenta esté inactiva, el paso 5 ya está cumplido: activarla
    # es asunto del paso 8.
    assert estado(cli)['docentes_pueden_entrar'] is True


def test_un_curso_sin_asignaturas_deja_el_paso_en_parcial(entorno):
    app, cli, sid, db = entorno
    from models import Course, Subject, CourseSubject

    with app.app_context():
        c1 = Course(school_id=sid, name='1° Básico A', year=2027)
        c2 = Course(school_id=sid, name='2° Básico A', year=2027)
        leng = Subject(school_id=sid, name='Lenguaje')
        db.session.add_all([c1, c2, leng])
        db.session.commit()
        db.session.add(CourseSubject(course_id=c1.id, subject_id=leng.id,
                                     hours_per_week=8))
        db.session.commit()

    p = paso(estado(cli), 'asignaturas')
    assert p['estado'] == 'parcial'
    assert any('2° Básico A' in x for x in p['pendientes'])


# ── Copiar cursos de otro año ─────────────────────────────────────────

def test_copiar_cursos_no_duplica_los_que_ya_estan(entorno):
    app, cli, sid, db = entorno
    from models import Course

    with app.app_context():
        db.session.add_all([
            Course(school_id=sid, name='1° Básico A', year=2026),
            Course(school_id=sid, name='2° Básico A', year=2026),
            Course(school_id=sid, name='1° Básico A', year=2027),
        ])
        db.session.commit()

    r = cli.post('/api/onboarding/cursos/copiar',
                 json={'year_origen': 2026, 'year_destino': 2027})
    assert r.status_code == 201
    d = r.get_json()
    assert d['creados'] == 1 and d['omitidos'] == 1

    # Repetir la operación no crea nada más
    r2 = cli.post('/api/onboarding/cursos/copiar',
                  json={'year_origen': 2026, 'year_destino': 2027})
    assert r2.get_json()['creados'] == 0


def test_copiar_desde_un_year_sin_cursos_avisa(entorno):
    _, cli, _, _ = entorno
    r = cli.post('/api/onboarding/cursos/copiar',
                 json={'year_origen': 2020, 'year_destino': 2027})
    assert r.status_code == 404


# ── Importación del equipo ────────────────────────────────────────────

def planilla(filas):
    from openpyxl import Workbook
    wb = Workbook()
    for f in filas:
        wb.active.append(f)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def previsualizar(cli, filas):
    return cli.post('/api/onboarding/equipo/previsualizar',
                    data={'archivo': (planilla(filas), 'equipo.xlsx')},
                    content_type='multipart/form-data')


def test_la_vista_previa_clasifica_cada_fila(entorno):
    app, cli, sid, db = entorno
    from models import User

    with app.app_context():
        u = User(school_id=sid, email='dcarreno@colegio.cl', first_name='Daniela',
                 last_name='Carreño Soto', role='profesor')
        u.set_password('x')
        db.session.add(u)
        db.session.commit()

    r = previsualizar(cli, [
        ['nombre', 'apellido', 'rut', 'email', 'rol', 'jornada'],
        ['Daniela', 'carreño  soto', '', '', 'Docente', '44'],   # ya existe
        ['Rocío', 'Herrera', '', '', 'Profesora', '30'],          # nueva
        ['Marcela', 'Pinto', '', '', 'Jefe UTP', '44'],           # directivo
        ['', 'SinNombre', '', '', '', ''],                        # error
        ['Rocío', 'Herrera', '', '', '', ''],                     # repetida
    ])
    assert r.status_code == 200, r.get_json()
    d = r.get_json()
    assert d['resumen'] == {'ya_existe': 1, 'nuevo': 2, 'error': 2}

    # Por fila, no por nombre: «Rocío» aparece dos veces a propósito
    por_fila = {i['fila']: i for i in d['items']}
    assert por_fila[4]['rol'] == 'directivo'      # Marcela, «Jefe UTP»
    assert por_fila[3]['rol'] == 'profesor'       # Rocío, «Profesora»
    assert por_fila[3]['jornada'] == 30
    # A quien no trae correo se le genera uno, y sin tildes
    correo = por_fila[3]['email']
    assert correo.isascii() and correo.endswith('@docente.local')


def test_la_planilla_sin_columnas_minimas_se_rechaza_con_explicacion(entorno):
    _, cli, _, _ = entorno
    r = previsualizar(cli, [['a', 'b'], ['1', '2']])
    assert r.status_code == 400
    assert 'nombre' in r.get_json()['error']


def test_aplicar_crea_personas_inactivas(entorno):
    app, cli, sid, db = entorno
    from models import User

    r = cli.post('/api/onboarding/equipo/aplicar', json={'items': [
        {'nombre': 'Rocío', 'apellido': 'Herrera',
         'email': 'rherrera@colegio.cl', 'rol': 'profesor'},
        {'nombre': 'Marcela', 'apellido': 'Pinto',
         'email': 'mpinto@colegio.cl', 'rol': 'directivo'},
    ]})
    assert r.status_code == 201
    assert r.get_json()['creados'] == 2

    with app.app_context():
        personas = User.query.filter(User.school_id == sid,
                                     User.role.in_(('profesor', 'directivo'))).all()
        assert len(personas) == 2
        # Inactivas hasta el paso 8
        assert all(not u.is_active for u in personas)


def test_aplicar_resuelve_un_correo_tomado_entre_medio(entorno):
    app, cli, sid, db = entorno
    from models import User

    with app.app_context():
        otro = User(school_id=sid, email='ocupado@colegio.cl',
                    first_name='Otra', last_name='Persona', role='admin')
        otro.set_password('x')
        db.session.add(otro)
        db.session.commit()

    r = cli.post('/api/onboarding/equipo/aplicar', json={'items': [
        {'nombre': 'Rocío', 'apellido': 'Herrera',
         'email': 'ocupado@colegio.cl', 'rol': 'profesor'}]})
    assert r.status_code == 201
    creada = r.get_json()['personas'][0]
    assert creada['email'] != 'ocupado@colegio.cl'


# ── Activación y claves ───────────────────────────────────────────────

def test_activar_genera_claves_que_sirven_para_entrar(entorno):
    app, cli, sid, db = entorno
    from models import User

    with app.app_context():
        u = User(school_id=sid, email='rh@colegio.cl', first_name='Rocío',
                 last_name='Herrera', role='profesor', is_active=False)
        u.set_password('vieja')
        db.session.add(u)
        db.session.commit()

    r = cli.post('/api/onboarding/accesos/activar', json={'generar_claves': True})
    assert r.status_code == 200
    d = r.get_json()
    # Solo la docente: el admin de la fixture ya venía activo
    assert d['activadas'] == 1
    clave = next(c['clave'] for c in d['claves'] if c['email'] == 'rh@colegio.cl')

    with app.app_context():
        u = User.query.filter_by(email='rh@colegio.cl').first()
        assert u.is_active and u.debe_cambiar_clave
        assert u.check_password(clave)         # la clave entregada funciona
        assert not u.check_password('vieja')


def test_la_clave_no_queda_guardada_en_texto(entorno):
    app, cli, sid, db = entorno
    from models import User

    d = cli.post('/api/onboarding/accesos/activar',
                 json={'generar_claves': True}).get_json()
    clave = d['claves'][0]['clave']

    with app.app_context():
        u = User.query.get(d['claves'][0]['id'])
        assert clave not in (u.password_hash or '')
        # Y no hay ninguna columna donde haya quedado
        assert clave not in str(u.to_dict())


def test_activar_sin_generar_claves_solo_activa(entorno):
    app, cli, sid, db = entorno
    from models import User

    r = cli.post('/api/onboarding/accesos/activar', json={'generar_claves': False})
    d = r.get_json()
    assert d['claves'] == []
    with app.app_context():
        assert all(u.is_active for u in
                   User.query.filter(User.school_id == sid,
                                     User.role.in_(('admin', 'profesor'))).all())


def test_cambiar_la_clave_apaga_el_aviso(entorno):
    app, cli, sid, db = entorno
    from models import User

    d = cli.post('/api/onboarding/accesos/activar',
                 json={'generar_claves': True}).get_json()
    mia = next(c for c in d['claves'] if c['email'] == 'admin@prueba.cl')

    r = cli.post('/api/auth/change-password',
                 json={'current_password': mia['clave'],
                       'new_password': 'otraclave123'})
    assert r.status_code == 200
    with app.app_context():
        assert User.query.get(mia['id']).debe_cambiar_clave is False


def test_una_clave_demasiado_corta_se_rechaza(entorno):
    _, cli, _, _ = entorno
    d = cli.post('/api/onboarding/accesos/activar',
                 json={'generar_claves': True}).get_json()
    mia = next(c for c in d['claves'] if c['email'] == 'admin@prueba.cl')
    r = cli.post('/api/auth/change-password',
                 json={'current_password': mia['clave'], 'new_password': '123'})
    assert r.status_code == 400


# ── Cierre ────────────────────────────────────────────────────────────

def test_no_se_puede_cerrar_con_pendientes_salvo_que_se_fuerce(entorno):
    app, cli, sid, db = entorno

    r = cli.post('/api/onboarding/cerrar?year=2027', json={})
    assert r.status_code == 409
    assert r.get_json()['faltan']

    r2 = cli.post('/api/onboarding/cerrar?year=2027', json={'forzar': True})
    assert r2.status_code == 200
    assert r2.get_json()['con_pendientes']

    from models import School
    with app.app_context():
        assert School.query.get(sid).onboarding_cerrado_at is not None

    assert cli.post('/api/onboarding/reabrir').status_code == 200
    with app.app_context():
        assert School.query.get(sid).onboarding_cerrado_at is None


def test_la_carga_horaria_no_impide_cerrar(entorno):
    """Es el único paso opcional: un colegio puede partir sin horario."""
    _, cli, _, _ = entorno
    d = estado(cli)
    assert paso(d, 'carga')['opcional'] is True
    assert 'Carga horaria y jefaturas' not in d['faltan_para_cerrar']


# ── De punta a punta: ¿el docente ve lo suyo? ─────────────────────────

def test_al_terminar_el_asistente_el_docente_ve_sus_cursos(entorno):
    """Es la promesa del asistente, así que conviene probarla entera."""
    app, cli, sid, db = entorno
    from models import User, Course, Subject, CourseSubject, Period
    from flask_jwt_extended import create_access_token

    with app.app_context():
        # Pasos 2 y 3: período y cursos
        db.session.add(Period(school_id=sid, name='Semestre 1',
                              period_type='semestral', year=2027, number=1))
        curso = Course(school_id=sid, name='7° Básico A', year=2027)
        leng = Subject(school_id=sid, name='Lenguaje')
        db.session.add_all([curso, leng])
        db.session.commit()
        curso_id, leng_id = curso.id, leng.id

    # Paso 5: el equipo, por el asistente
    cli.post('/api/onboarding/equipo/aplicar', json={'items': [
        {'nombre': 'Rocío', 'apellido': 'Herrera',
         'email': 'rherrera@colegio.cl', 'rol': 'profesor'}]})

    with app.app_context():
        docente = User.query.filter_by(email='rherrera@colegio.cl').first()
        docente_id = docente.id
        # Paso 7: se le asigna la asignatura y la jefatura
        db.session.add(CourseSubject(course_id=curso_id, subject_id=leng_id,
                                     teacher_id=docente_id, hours_per_week=8))
        Course.query.get(curso_id).head_teacher_id = docente_id
        db.session.commit()

    # Antes de activar, la cuenta está inactiva
    with app.app_context():
        assert User.query.get(docente_id).is_active is False

    # Paso 8: activar y entregar claves
    d = cli.post('/api/onboarding/accesos/activar',
                 json={'generar_claves': True}).get_json()
    clave = next(c['clave'] for c in d['claves'] if c['id'] == docente_id)

    # La docente entra con la clave que le entregaron
    r = cli.post('/api/auth/login', json={'email': 'rherrera@colegio.cl',
                                          'password': clave})
    assert r.status_code == 200, r.get_json()
    token = r.get_json()['access_token']

    suyo = app.test_client()
    suyo.environ_base['HTTP_AUTHORIZATION'] = f'Bearer {token}'
    cursos = suyo.get('/api/courses/?year=2027').get_json()

    assert len(cursos) == 1
    assert cursos[0]['name'] == '7° Básico A'
    assert cursos[0]['is_head_teacher'] is True
    assert [a['subject']['name'] for a in cursos[0]['my_subjects']] == ['Lenguaje']


def test_super_admin_ve_el_avance_de_cada_colegio(entorno):
    app, cli, sid, db = entorno
    from models import User
    from flask_jwt_extended import create_access_token

    with app.app_context():
        sa = User(email='sa@kolevia.cl', first_name='Super', last_name='Admin',
                  role='super_admin')
        sa.set_password('x')
        db.session.add(sa)
        db.session.commit()
        token = create_access_token(identity=str(sa.id),
                                    additional_claims={'role': 'super_admin'})

    c = app.test_client()
    c.environ_base['HTTP_AUTHORIZATION'] = f'Bearer {token}'
    r = c.get('/api/super-admin/onboarding')
    assert r.status_code == 200
    fila = next(x for x in r.get_json()['colegios'] if x['id'] == sid)
    assert 0 <= fila['pct'] <= 100
    assert fila['docentes_pueden_entrar'] is False
    assert fila['siguiente_paso']


# ── Guardar los datos del colegio ─────────────────────────────────────

def test_un_campo_demasiado_largo_avisa_cual_en_vez_de_reventar(entorno):
    """PostgreSQL rechaza un VARCHAR pasado de largo con un 500 ilegible.

    SQLite no lo valida, así que esto en local nunca se veía: por eso la
    comprobación está en la ruta y no solo en la base.
    """
    app, cli, sid, db = entorno

    r = cli.put(f'/api/schools/{sid}', json={
        'name': 'Colegio', 'phone': '+56 2 2345 6789 anexo 102 — dirección' * 3})
    assert r.status_code == 400
    assert 'teléfono' in r.get_json()['error']

    r2 = cli.put(f'/api/schools/{sid}', json={'name': 'C', 'rut': '7' * 40})
    assert r2.status_code == 400
    assert 'RUT' in r2.get_json()['error']


def test_un_telefono_chileno_con_anexo_si_cabe(entorno):
    """El caso que motivó ampliar la columna: 20 caracteres no alcanzaban."""
    app, cli, sid, db = entorno
    from models import School

    telefono = '+56 2 2345 6789 an. 102'
    assert len(telefono) > 20
    r = cli.put(f'/api/schools/{sid}', json={'name': 'Colegio', 'phone': telefono})
    assert r.status_code == 200
    with app.app_context():
        assert School.query.get(sid).phone == telefono


def test_los_campos_vacios_se_guardan_como_nulos(entorno):
    """Así «falta el rector» es una sola condición y no dos."""
    app, cli, sid, db = entorno
    from models import School

    cli.put(f'/api/schools/{sid}', json={'name': 'Colegio', 'rector': '   '})
    with app.app_context():
        assert School.query.get(sid).rector is None
    # Y el paso 1 lo reporta como pendiente
    p = paso(estado(cli), 'colegio')
    assert any('rector' in x for x in p['pendientes'])


def test_no_se_puede_dejar_al_colegio_sin_nombre(entorno):
    _, cli, sid, _ = entorno
    r = cli.put(f'/api/schools/{sid}', json={'name': '  '})
    assert r.status_code == 400
    assert 'nombre' in r.get_json()['error']


def test_subir_logo_y_despues_guardar_datos_no_se_estorban(entorno):
    """La secuencia que reportó el colegio: primero el logo, luego guardar."""
    import io as _io
    app, cli, sid, db = entorno
    from models import School

    png = bytes.fromhex(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489'
        '0000000a49444154789c6360000002000100ffff0300000600055'
        '7bfabd40000000049454e44ae426082')
    r = cli.post(f'/api/schools/{sid}/upload-logo',
                 data={'logo': (_io.BytesIO(png), 'logo.png', 'image/png')},
                 content_type='multipart/form-data')
    assert r.status_code == 200
    assert r.get_json()['logo_url'].startswith('data:image/png;base64,')

    r2 = cli.put(f'/api/schools/{sid}', json={
        'name': 'Colegio Franz Liszt', 'rector': 'Ana Soto', 'phone': ''})
    assert r2.status_code == 200
    # Guardar los datos no borra el logo que se acaba de subir
    assert r2.get_json()['logo_url'].startswith('data:image/png;base64,')
