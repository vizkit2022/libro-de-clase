"""POST /api/students/import — Libro de Matrícula (Excel SINTÉTICO generado en tmp).

Los tests de este módulo comparten BD y se ejecutan en orden:
dry_run → importación real → re-importación (idempotencia) → course_id explícito.
"""
import io
import unicodedata

import pytest

import excel_fixture as xf
from conftest import as_list


def _norm(s):
    s = unicodedata.normalize('NFKD', s or '')
    return ' '.join(''.join(c for c in s if not unicodedata.combining(c)).upper().split())


def _post_import(client, h, path, **form):
    data = {'file': (open(path, 'rb'), 'Libro_Matricula_test.xlsx')}
    data.update({k: str(v) for k, v in form.items()})
    return client.post('/api/students/import', headers=h, data=data,
                       content_type='multipart/form-data')


@pytest.fixture(scope='module')
def xlsx(tmp_path_factory):
    p = tmp_path_factory.mktemp('xlsx') / 'matricula.xlsx'
    return xf.build_matricula_xlsx(p, xf.standard_rows(), trailing_empty_rows=4)


def _counts(app):
    import models as m
    with app.app_context():
        return {
            'users': m.User.query.count(),
            'alumnos': m.User.query.filter_by(role='alumno').count(),
            'profiles': m.StudentProfile.query.count(),
            'medical': m.StudentMedical.query.count(),
            'family': m.StudentFamilyMember.query.count(),
            'auths': m.StudentAuthorization.query.count(),
            'enrollments': m.Enrollment.query.count(),
            'courses': m.Course.query.count(),
            'guardian_links': m.StudentGuardian.query.count(),
        }


def _student_id(app, rut):
    from models import User
    with app.app_context():
        users = User.query.filter_by(rut=rut, role='alumno').all()
        assert len(users) == 1, (rut, [u.rut for u in User.query.filter_by(role='alumno')])
        return users[0].id


def _ficha(client, h, sid):
    r = client.get(f'/api/students/{sid}/ficha', headers=h)
    assert r.status_code == 200
    return r.get_json()


def _tpl_keys(client, h):
    r = client.get('/api/students/authorization-templates', headers=h)
    return {t['id']: t.get('key') for t in as_list(r.get_json(), 'templates')}


def _auth_by_key(client, h, ficha):
    keys = _tpl_keys(client, h)
    out = {}
    for a in ficha['authorizations']:
        k = a.get('template_key') or keys.get(a.get('template_id'))
        out[k] = a
    return out


# ── Validaciones ─────────────────────────────────────────────────────────────
def test_import_forbidden_for_profesor(client, headers, xlsx):
    for role in ('profesor', 'apoderado', 'alumno'):
        r = _post_import(client, headers[role], xlsx, dry_run='true')
        assert r.status_code == 403, role


def test_import_not_xlsx_400(client, headers, tmp_path):
    p = tmp_path / 'no_excel.xlsx'
    p.write_bytes(b'esto no es un excel')
    r = _post_import(client, headers['admin'], p, dry_run='true')
    assert r.status_code == 400
    assert 'error' in r.get_json()
    txt = tmp_path / 'datos.txt'
    txt.write_text('rut,nombre\n1,2\n')
    r = client.post('/api/students/import', headers=headers['admin'],
                    data={'file': (open(txt, 'rb'), 'datos.csv'), 'dry_run': 'true'},
                    content_type='multipart/form-data')
    assert r.status_code == 400


def test_import_without_file_400(client, headers):
    r = client.post('/api/students/import', headers=headers['admin'], data={'dry_run': 'true'},
                    content_type='multipart/form-data')
    assert r.status_code == 400


# ── dry_run ──────────────────────────────────────────────────────────────────
def test_dry_run_persists_nothing(app, client, headers, xlsx):
    before = _counts(app)
    r = _post_import(client, headers['admin'], xlsx)  # dry_run por defecto = true
    assert r.status_code == 200, r.get_data(as_text=True)
    data = r.get_json()
    assert data['dry_run'] is True
    assert data['total_rows'] == 3
    assert data['created'] == 3 and data['updated'] == 0
    assert data['errors'] == []
    assert len(data['rows']) == 3
    assert {row['action'] for row in data['rows']} == {'crear'}
    for row in data['rows']:
        assert {'row', 'rut', 'name', 'action', 'family', 'authorizations', 'warnings'} <= set(row)
    by_rut = {row['rut']: row for row in data['rows']}
    assert xf.RUT_B in by_rut, by_rut.keys()  # RUT normalizado con K mayúscula
    assert by_rut[xf.RUT_A]['family'] == 2     # madre(=apoderado) + padre(=tutor eco)
    assert by_rut[xf.RUT_B]['family'] == 1     # solo madre (=apoderado=tutor eco)
    assert by_rut[xf.RUT_C]['family'] == 3     # abuela apoderada + madre + padre
    assert data['course']['name'] == xf.COURSE_NAME
    assert _counts(app) == before


def test_dry_run_explicit_true(app, client, headers, xlsx):
    before = _counts(app)
    r = _post_import(client, headers['admin'], xlsx, dry_run='true')
    assert r.status_code == 200
    assert r.get_json()['dry_run'] is True
    assert _counts(app) == before


# ── Importación real ─────────────────────────────────────────────────────────
def test_real_import_creates_everything(app, client, headers, xlsx, ids):
    h = headers['admin']
    before = _counts(app)
    r = _post_import(client, h, xlsx, dry_run='false')
    assert r.status_code == 200, r.get_data(as_text=True)
    data = r.get_json()
    assert data['dry_run'] is False
    assert data['total_rows'] == 3
    assert data['created'] == 3
    assert data['updated'] == 0
    assert data['errors'] == []
    after = _counts(app)
    assert after['alumnos'] == before['alumnos'] + 3
    assert after['profiles'] == before['profiles'] + 3
    assert after['medical'] >= before['medical'] + 1
    assert after['family'] == before['family'] + 6
    assert after['enrollments'] == before['enrollments'] + 3
    # curso inexistente "6° Básica B" → se crea
    assert after['courses'] == before['courses'] + 1
    from models import Course
    with app.app_context():
        course = Course.query.filter_by(name=xf.COURSE_NAME, school_id=ids['school']).one()
        course_id = course.id
    assert data['course']['id'] == course_id


def test_imported_student_a(app, client, headers):
    h = headers['admin']
    sid = _student_id(app, xf.RUT_A)
    f = _ficha(client, h, sid)
    st, pr, med = f['student'], f['profile'], f['medical']
    assert st['first_name'] == 'Ana Sofía'
    assert st['last_name'] == 'Prueba Uno'
    assert st['gender'] == 'Femenino'
    assert st['birth_date'] == '2014-11-02'
    assert st['phone'] == '56911110001'           # sin '.0'
    assert st['address'] == 'Calle Ficticia 123'
    assert st['email'].endswith('.local')         # sin email_alumno → correo sintético
    assert pr['list_order'] == 1
    assert pr['admission_type'] == 'antiguo'
    assert pr['status'] == 'matriculado'
    assert pr['nationality'] == 'Chile'
    assert pr['comuna'] == 'Maipú'
    assert pr['previous_school'] == 'Escuela Ficticia'  # strip
    assert pr['has_sibling_in_school'] is True          # 'SI'
    assert pr['household_size'] == 4
    assert pr['siblings_count'] == 1
    assert pr['lives_with'] == 'Padre/Madre'
    assert pr['enrollment_date'] == '2025-12-12'
    assert pr['pie'] in (False, None)                   # 'NO'
    assert pr['judicial_restriction'] is False          # 'No'
    assert pr['pickup_with'] == 'FURGÓN'
    assert pr['emergency_phone'] == '56911110001'
    assert pr['emergency_phone_2'] == '+56933330001 - PAPÁ'
    assert pr['priority_status'] == 'Ninguno'
    assert isinstance(pr.get('extra'), (dict, str, type(None)))
    assert med['problem_visual'] is True                # ' P.VISUALES'
    assert med['problem_auditory'] is False
    assert med['allergies'] == 'Pasto'
    assert med['special_care'] == 'ASMA'

    fam = {m['rut']: m for m in f['family']}
    assert set(fam) == {xf.RUT_A_MADRE, xf.RUT_A_PADRE}
    madre, padre = fam[xf.RUT_A_MADRE], fam[xf.RUT_A_PADRE]
    assert madre['relationship'] == 'Madre'
    assert madre['guardian_role'] == 'titular'
    assert madre['first_name'] == 'Marta'
    assert madre['phone'] == '56922220001'
    assert madre['email'].lower() == 'marta.ficticia@example.com'
    assert madre['birth_date'] == '1980-01-15'
    assert padre['relationship'] == 'Padre'
    assert padre['is_economic_tutor'] is True
    assert padre['guardian_role'] == 'suplente'
    assert not madre.get('is_economic_tutor')

    s = f['summary']
    assert s['course_name'] == xf.COURSE_NAME
    assert s['guardian']['member_id'] == madre['id']
    assert _norm(s['guardian']['name']) == 'MARTA FICTICIA PEREZ'
    assert s['guardian']['rut'] == xf.RUT_A_MADRE

    auths = _auth_by_key(client, h, f)
    assert auths['fotos']['status'] == 'autorizado'
    assert auths['reglamento']['status'] == 'autorizado'
    assert auths['carta_compromiso']['status'] == 'rechazado'
    assert 'redes_sociales' not in auths and 'religion' not in auths  # columnas vacías
    assert auths['fotos']['signed_by_member_id'] == madre['id']
    assert auths['fotos']['signed_at'] == '2025-12-12'


def test_imported_student_b(app, client, headers):
    h = headers['admin']
    sid = _student_id(app, xf.RUT_B)   # 'k' minúscula normalizada a 'K'
    f = _ficha(client, h, sid)
    assert f['student']['rut'] == xf.RUT_B
    assert f['profile']['nationality'] != 'False'
    assert f['profile']['repeated_courses'] == '1 BÁSICO'
    assert f['profile']['admission_type'] == 'nuevo'
    assert f['profile']['judicial_restriction'] is True   # 'Sí'
    assert len(f['family']) == 1                          # sin padre
    madre = f['family'][0]
    assert madre['rut'] == xf.RUT_B_MADRE
    assert madre['relationship'] == 'Madre'               # parentesco '1' → bloque madre
    assert madre['guardian_role'] == 'titular'
    assert madre['nationality'] not in ('False', False)
    assert f['summary']['substitute'] is None


def test_imported_student_c(app, client, headers):
    h = headers['admin']
    sid = _student_id(app, xf.RUT_C)
    f = _ficha(client, h, sid)
    assert f['student']['email'] == 'carlos.tres@example.com'  # email_alumno
    assert f['profile']['nationality'] == 'Venezuela'
    fam = {m['rut']: m for m in f['family']}
    assert set(fam) == {xf.RUT_C_ABUELA, xf.RUT_C_MADRE, xf.RUT_C_PADRE}
    titulares = [m for m in f['family'] if m['guardian_role'] == 'titular']
    assert [m['rut'] for m in titulares] == [xf.RUT_C_ABUELA]
    assert fam[xf.RUT_C_ABUELA]['relationship'] not in ('1', 1, None, '')
    assert fam[xf.RUT_C_PADRE]['is_economic_tutor'] is True
    assert len([m for m in f['family'] if m['guardian_role'] == 'suplente']) <= 1


def test_imported_students_enrolled_in_created_course(app, ids):
    from models import Course, Enrollment
    with app.app_context():
        course = Course.query.filter_by(name=xf.COURSE_NAME, school_id=ids['school']).one()
        for rut in (xf.RUT_A, xf.RUT_B, xf.RUT_C):
            sid = _student_id(app, rut)
            enr = Enrollment.query.filter_by(student_id=sid, course_id=course.id).all()
            assert len(enr) == 1 and enr[0].is_active


def test_imported_student_can_login(app, client):
    """El alumno C (con email_alumno) puede iniciar sesión con la clave por defecto."""
    r = client.post('/api/auth/login', json={'email': 'carlos.tres@example.com',
                                             'password': 'Alumno2026!'})
    assert r.status_code == 200


# ── Idempotencia ─────────────────────────────────────────────────────────────
def test_reimport_is_idempotent(app, client, headers, xlsx):
    before = _counts(app)
    sid_a = _student_id(app, xf.RUT_A)
    auths_before = {(a['template_id'], a['status'])
                    for a in _ficha(client, headers['admin'], sid_a)['authorizations']}
    r = _post_import(client, headers['admin'], xlsx, dry_run='false')
    assert r.status_code == 200, r.get_data(as_text=True)
    data = r.get_json()
    assert data['created'] == 0
    assert data['updated'] == 3
    assert data['errors'] == []
    assert {row['action'] for row in data['rows']} == {'actualizar'}
    assert _counts(app) == before
    auths_after = {(a['template_id'], a['status'])
                   for a in _ficha(client, headers['admin'], sid_a)['authorizations']}
    assert auths_after == auths_before


def test_reimport_does_not_overwrite_with_blanks(app, client, headers, tmp_path):
    """Una fila con columnas vacías no debe borrar datos ya cargados."""
    sid_a = _student_id(app, xf.RUT_A)
    row = {'rut': xf.RUT_A, 'nombre': 'Ana Sofía', 'apellidos': 'Prueba Uno',
           'id_curso': xf.COURSE_NAME}
    p = xf.build_matricula_xlsx(tmp_path / 'parcial.xlsx', [row])
    r = _post_import(client, headers['admin'], p, dry_run='false')
    assert r.status_code == 200, r.get_data(as_text=True)
    f = _ficha(client, headers['admin'], sid_a)
    assert f['student']['phone'] == '56911110001'
    assert f['profile']['comuna'] == 'Maipú'
    assert f['medical']['allergies'] == 'Pasto'
    assert len(f['family']) == 2


# ── course_id explícito ──────────────────────────────────────────────────────
def test_import_with_explicit_course_id(app, client, headers, ids, tmp_path):
    p = xf.build_matricula_xlsx(tmp_path / 'curso.xlsx', xf.course_override_rows())
    before = _counts(app)
    r = _post_import(client, headers['directivo'], p, dry_run='false', course_id=ids['course'])
    assert r.status_code == 200, r.get_data(as_text=True)
    data = r.get_json()
    assert data['course']['id'] == ids['course']
    assert data['created'] == 1
    after = _counts(app)
    assert after['courses'] == before['courses']   # '8° Básico Z' NO se crea
    from models import Enrollment
    sid = _student_id(app, xf.RUT_D)
    with app.app_context():
        enr = Enrollment.query.filter_by(student_id=sid).all()
        assert [e.course_id for e in enr] == [ids['course']]


def test_import_matches_existing_course_by_normalized_name(app, client, headers, ids, tmp_path):
    """'5° básica a' (minúsculas, 'básica', espacios extra) debe matchear '5° Básico A' del seed."""
    from excel_fixture import rut_with_dv
    row = {'rut': rut_with_dv(30555666), 'nombre': 'Elena', 'apellidos': 'Prueba Cinco',
           'id_curso': '5°  básica a', 'fecha_nacimiento': '2015-02-02'}
    p = xf.build_matricula_xlsx(tmp_path / 'norm.xlsx', [row])
    before = _counts(app)
    r = _post_import(client, headers['admin'], p, dry_run='false')
    assert r.status_code == 200, r.get_data(as_text=True)
    assert r.get_json()['course']['id'] == ids['course']
    assert _counts(app)['courses'] == before['courses']


def test_import_create_guardian_access(app, client, headers, tmp_path):
    from excel_fixture import rut_with_dv
    m_rut = rut_with_dv(31666001)
    row = {'rut': rut_with_dv(30666777), 'nombre': 'Felipe', 'apellidos': 'Prueba Seis',
           'id_curso': xf.COURSE_NAME, 'rut_appoderado': m_rut, 'nombre_apoderado': 'Fabiola',
           'apellidos_apoderado': 'Madre Seis', 'parentesco_apoderado': 'Madre',
           'email_apoderado': 'fabiola.seis@example.com',
           'rut_madre': m_rut, 'nombre_madre': 'Fabiola', 'apellidos_madre': 'Madre Seis',
           'email_madre': 'fabiola.seis@example.com', 'parentesco_madre': 'Madre'}
    p = xf.build_matricula_xlsx(tmp_path / 'acceso.xlsx', [row])
    r = _post_import(client, headers['admin'], p, dry_run='false', create_guardian_access='true')
    assert r.status_code == 200, r.get_data(as_text=True)
    from models import User
    with app.app_context():
        u = User.query.filter_by(email='fabiola.seis@example.com').first()
        assert u is not None and u.role == 'apoderado'


def test_withdrawn_and_moved_students_keep_inactive_enrollment(app, client, headers, tmp_path):
    """fecha_retiro → ficha 'retirado' y matrícula inactiva; «Cambiado a X» deja inactivo
    el curso de origen y «Cambiado desde X» activo el de destino."""
    from excel_fixture import rut_with_dv
    from models import Enrollment, StudentProfile, Course
    ret, mov = rut_with_dv(30777001), rut_with_dv(30777002)
    origen = [
        {'rut': ret, 'nombre': 'Rita', 'apellidos': 'Retiro', 'id_curso': '7° Básica X',
         'fecha_retiro': '15/03/2026', 'observacion_retiro': 'Cambio de colegio'},
        {'rut': mov, 'nombre': 'Mario', 'apellidos': 'Cambio', 'id_curso': '7° Básica X',
         'cambio_curso': 'Cambiado a 7° Básica Y'},
    ]
    destino = [{'rut': mov, 'nombre': 'Mario', 'apellidos': 'Cambio', 'id_curso': '7° Básica Y',
                'cambio_curso': 'Cambiado desde 7° Básica X'}]
    for name, rows in (('x.xlsx', origen), ('y.xlsx', destino)):
        r = _post_import(client, headers['admin'], xf.build_matricula_xlsx(tmp_path / name, rows),
                         dry_run='false')
        assert r.status_code == 200, r.get_data(as_text=True)

    sid_ret, sid_mov = _student_id(app, ret), _student_id(app, mov)
    with app.app_context():
        cx = Course.query.filter(Course.name == '7° Básica X').one().id
        cy = Course.query.filter(Course.name == '7° Básica Y').one().id
        assert StudentProfile.query.filter_by(student_id=sid_ret).one().status == 'retirado'
        assert [(e.course_id, e.is_active) for e in Enrollment.query.filter_by(student_id=sid_ret)] == [(cx, False)]
        assert StudentProfile.query.filter_by(student_id=sid_mov).one().status == 'matriculado'
        enr = {e.course_id: e.is_active for e in Enrollment.query.filter_by(student_id=sid_mov)}
        assert enr == {cx: False, cy: True}
