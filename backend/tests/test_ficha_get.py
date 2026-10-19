"""GET /api/students/<sid>/ficha — forma completa, summary y permissions.can_edit."""
from datetime import date

import pytest

from conftest import add_grades, create_user, login

FICHA_KEYS = {'student', 'profile', 'medical', 'family', 'authorizations', 'documents',
              'summary', 'permissions'}
SUMMARY_KEYS = {'course_id', 'course_name', 'age', 'status', 'average', 'guardian', 'substitute'}


def _ficha(client, sid, h):
    r = client.get(f'/api/students/{sid}/ficha', headers=h)
    assert r.status_code == 200, r.get_data(as_text=True)
    return r.get_json()


def test_ficha_shape_admin(client, headers, ids):
    data = _ficha(client, ids['pedro'], headers['admin'])
    assert FICHA_KEYS <= set(data), set(data)
    assert data['student']['id'] == ids['pedro']
    assert data['student']['role'] == 'alumno'
    assert isinstance(data['profile'], dict) and data['profile']
    assert isinstance(data['medical'], dict) and data['medical']
    assert isinstance(data['family'], list)
    assert isinstance(data['authorizations'], list)
    assert isinstance(data['documents'], list)
    assert SUMMARY_KEYS <= set(data['summary']), set(data['summary'])
    assert data['permissions']['can_edit'] is True
    # Pedro está matriculado en el curso seed
    assert data['summary']['course_id'] == ids['course']
    assert data['summary']['course_name'] == ids['course_name']


def test_profile_and_medical_never_null_for_new_student(client, headers, make_student):
    sid = make_student()
    data = _ficha(client, sid, headers['admin'])
    prof, med = data['profile'], data['medical']
    assert isinstance(prof, dict) and isinstance(med, dict)
    # Campos del contrato presentes aunque no exista registro
    for k in ('id_type', 'nationality', 'status', 'lives_with', 'pie', 'pickup_with',
              'emergency_phone', 'judicial_restriction'):
        assert k in prof, k
    for k in ('allergies', 'problem_visual', 'problem_auditory', 'problem_cardiac',
              'problem_spine', 'blood_type', 'height_cm'):
        assert k in med, k
    assert prof.get('id_type') in ('RUN', None)
    assert med.get('problem_visual') in (False, None)
    assert data['family'] == [] and data['authorizations'] == [] and data['documents'] == []
    s = data['summary']
    assert s['age'] is None
    assert s['average'] is None
    assert s['guardian'] is None and s['substitute'] is None
    assert s['course_id'] is None


def test_summary_age_from_birth_date(app, client, headers, make_student):
    today = date.today()
    sid = make_student(birth_date=date(today.year - 11, 1, 1))
    data = _ficha(client, sid, headers['admin'])
    assert data['summary']['age'] == 11
    assert data['student']['birth_date'] == f'{today.year - 11}-01-01'


def test_summary_average_staff_sees_all_grades(app, client, headers, make_student):
    sid = make_student()
    add_grades(app, sid, [(6.0, True), (5.0, False), (7.0, True)])
    data = _ficha(client, sid, headers['admin'])
    assert data['summary']['average'] == pytest.approx(6.0)


def test_summary_average_rounding(app, client, headers, make_student):
    sid = make_student()
    add_grades(app, sid, [(6.0, True), (5.0, True), (6.5, True)])  # 5.8333 → 5.8
    data = _ficha(client, sid, headers['directivo'])
    assert data['summary']['average'] == pytest.approx(5.8)


def test_summary_average_student_sees_only_published(app, client, make_student):
    sid = make_student(email='alumno.promedio@example.com')
    add_grades(app, sid, [(6.0, True), (5.0, False), (7.0, True)])
    h = login(client, 'alumno.promedio@example.com', 'alumno123')
    data = _ficha(client, sid, h)
    assert data['summary']['average'] == pytest.approx(6.5)


def test_summary_average_apoderado_sees_only_published(app, client, make_student):
    from conftest import link_guardian
    sid = make_student()
    gid = create_user(app, role='apoderado', email='apod.promedio@example.com', password='apod123')
    link_guardian(app, sid, gid)
    add_grades(app, sid, [(4.0, False), (6.0, True)])
    h = login(client, 'apod.promedio@example.com', 'apod123')
    data = _ficha(client, sid, h)
    assert data['summary']['average'] == pytest.approx(6.0)


@pytest.mark.parametrize('role,expected', [
    ('admin', True), ('directivo', True), ('profesor', False),
    ('apoderado', False), ('alumno', False),
])
def test_can_edit_by_role(client, headers, ids, role, expected):
    # Pedro: visible para todos los roles seed (apoderado vinculado, alumno = él mismo)
    data = _ficha(client, ids['pedro'], headers[role])
    assert data['permissions']['can_edit'] is expected


def test_status_default_matriculado(client, headers, make_student):
    sid = make_student()
    data = _ficha(client, sid, headers['admin'])
    assert data['summary']['status'] in ('matriculado', None)
    assert data['profile'].get('status') in ('matriculado', None)
