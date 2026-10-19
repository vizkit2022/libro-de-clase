"""Ficha de matrícula en PDF: servicio build_ficha_pdf y endpoint GET /alumnos/<id>/ficha.pdf."""
import re

import pytest

from conftest import TINY_PNG_DATA_URL, unwrap

pytest.importorskip('reportlab')

Y = 2026


def _pdf_mod():
    return pytest.importorskip('servicios.ficha_matricula_pdf')


def _paginas(pdf_bytes):
    return len(re.findall(rb'/Type\s*/Page(?![s\w])', pdf_bytes))


@pytest.fixture(scope='module')
def alumno_completo(client, headers, app, ids):
    """Alumno del 5° Básico A con ficha bastante llena (perfil, salud, familia, permiso firmado)."""
    from models import Enrollment
    from conftest import create_user
    from models import db
    sid = create_user(app, first_name='Ficha', last_name='Pdf Completa', address='Calle PDF 1')
    with app.app_context():
        db.session.add(Enrollment(student_id=sid, course_id=ids['course'], year=Y, is_active=True))
        db.session.commit()
    h = headers['admin']
    r = client.put(f'/api/students/{sid}/profile', headers=h, json={
        'user': {'birth_date': '2015-04-10', 'gender': 'Femenino', 'phone': '56911112222'},
        'profile': {'nationality': 'Chile', 'comuna': 'Ñuñoa', 'region': 'Metropolitana',
                    'enrollment_date': '2026-03-01', 'matricula_number': '123',
                    'lives_with': 'Madre', 'household_size': 3, 'siblings_count': 1,
                    'emergency_contact_name': 'Tía Rosa', 'emergency_phone': '56900001111',
                    'previous_school': 'Escuela Anterior', 'social_name': 'Fichi'}})
    assert r.status_code == 200, r.get_data(as_text=True)
    assert client.put(f'/api/students/{sid}/medical', headers=h,
                      json={'allergies': 'Maní', 'problem_visual': True}).status_code == 200
    r = client.post(f'/api/students/{sid}/family', headers=h,
                    json={'first_name': 'María', 'last_name': 'Pdf', 'relationship': 'Madre',
                          'rut': '12.345.678-5', 'phone': '56922222222',
                          'email': 'maria.pdf@example.com', 'is_titular': True})
    assert r.status_code == 201, r.get_data(as_text=True)
    mid = unwrap(r.get_json(), 'member')['id']
    r = client.post(f'/api/students/{sid}/authorizations', headers=h,
                    json={'title': 'Uso de imagen', 'status': 'autorizado',
                          'signed_by_member_id': mid, 'signature_image': TINY_PNG_DATA_URL})
    assert r.status_code == 201, r.get_data(as_text=True)
    return sid


def test_build_ficha_pdf_bytes(app, alumno_completo):
    mod = _pdf_mod()
    with app.app_context():
        pdf = mod.build_ficha_pdf(alumno_completo, Y)
    assert isinstance(pdf, (bytes, bytearray))
    assert pdf[:4] == b'%PDF'
    assert 1 <= _paginas(pdf) <= 2


def test_build_ficha_pdf_alumno_sin_ficha(app, make_student):
    mod = _pdf_mod()
    sid = make_student()
    with app.app_context():
        pdf = mod.build_ficha_pdf(sid, Y)
    assert pdf[:4] == b'%PDF'


@pytest.mark.parametrize('role', ['admin', 'directivo', 'profesor'])
def test_endpoint_pdf(client, headers, alumno_completo, role):
    _pdf_mod()
    r = client.get(f'/api/matricula/alumnos/{alumno_completo}/ficha.pdf?year={Y}',
                   headers=headers[role])
    assert r.status_code == 200, r.get_data(as_text=True)[:300]
    assert r.mimetype == 'application/pdf'
    assert r.data[:4] == b'%PDF'
    cd = r.headers.get('Content-Disposition', '')
    assert 'attachment' in cd
    assert 'ficha_matricula_' in cd and '.pdf' in cd


def test_endpoint_pdf_sin_year(client, headers, alumno_completo):
    _pdf_mod()
    r = client.get(f'/api/matricula/alumnos/{alumno_completo}/ficha.pdf', headers=headers['admin'])
    assert r.status_code == 200
    assert r.data[:4] == b'%PDF'


@pytest.mark.parametrize('role', ['apoderado', 'alumno'])
def test_endpoint_pdf_prohibido(client, headers, ids, role):
    _pdf_mod()
    r = client.get(f"/api/matricula/alumnos/{ids['pedro']}/ficha.pdf", headers=headers[role])
    assert r.status_code == 403


def test_endpoint_pdf_otro_colegio_404(client, headers, other_school_student):
    _pdf_mod()
    r = client.get(f'/api/matricula/alumnos/{other_school_student}/ficha.pdf',
                   headers=headers['admin'])
    assert r.status_code == 404
