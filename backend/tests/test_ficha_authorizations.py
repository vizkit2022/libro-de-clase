"""Plantillas de autorización y autorizaciones del alumno (con firma en data URL)."""
import pytest

from conftest import TINY_PNG_DATA_URL, as_list, unwrap

EXPECTED_KEYS = {'fotos', 'actividades', 'redes_sociales', 'religion', 'reglamento',
                 'uniforme', 'carta_compromiso'}


def _templates(client, h):
    r = client.get('/api/students/authorization-templates', headers=h)
    assert r.status_code == 200, r.get_data(as_text=True)
    return as_list(r.get_json(), 'templates')


def _create(client, h, sid, **body):
    r = client.post(f'/api/students/{sid}/authorizations', headers=h, json=body)
    assert r.status_code == 201, r.get_data(as_text=True)
    return unwrap(r.get_json(), 'authorization')


# ── Plantillas ───────────────────────────────────────────────────────────────
def test_templates_seeded_and_idempotent(client, headers):
    t1 = _templates(client, headers['admin'])
    t2 = _templates(client, headers['admin'])
    assert len(t1) >= 7
    assert sorted(t['id'] for t in t1) == sorted(t['id'] for t in t2)
    keys = {t.get('key') for t in t1}
    assert EXPECTED_KEYS <= keys, keys
    fotos = next(t for t in t1 if t.get('key') == 'fotos')
    assert fotos['title'].startswith('Autorizo a mi hijo(a) a ser fotografiado(a)')
    assert all(t.get('is_active', True) for t in t1)


def test_templates_visible_to_profesor(client, headers):
    assert len(_templates(client, headers['profesor'])) >= 7


def test_template_crud(client, headers):
    h = headers['admin']
    before = len(_templates(client, h))
    r = client.post('/api/students/authorization-templates', headers=h,
                    json={'title': 'Autorizo gira de estudios', 'description': 'Viaje 2026'})
    assert r.status_code == 201, r.get_data(as_text=True)
    t = unwrap(r.get_json(), 'template')
    assert t['title'] == 'Autorizo gira de estudios'
    assert len(_templates(client, h)) == before + 1

    r = client.put(f"/api/students/authorization-templates/{t['id']}", headers=h,
                   json={'title': 'Gira de estudios (editada)'})
    assert r.status_code == 200
    assert unwrap(r.get_json(), 'template')['title'] == 'Gira de estudios (editada)'

    r = client.delete(f"/api/students/authorization-templates/{t['id']}", headers=h)
    assert r.status_code in (200, 204)
    assert t['id'] not in {x['id'] for x in _templates(client, h)}
    # Seed no recrea plantillas borradas sin key ni duplica las existentes
    assert len(_templates(client, h)) == before


def test_template_title_required(client, headers):
    r = client.post('/api/students/authorization-templates', headers=headers['admin'], json={})
    assert r.status_code == 400


def test_template_edit_forbidden_for_non_editors(client, headers):
    t = _templates(client, headers['admin'])[0]
    for role in ('profesor', 'apoderado', 'alumno'):
        assert client.post('/api/students/authorization-templates', headers=headers[role],
                           json={'title': 'X'}).status_code == 403
        assert client.put(f"/api/students/authorization-templates/{t['id']}", headers=headers[role],
                          json={'title': 'X'}).status_code == 403
        assert client.delete(f"/api/students/authorization-templates/{t['id']}",
                             headers=headers[role]).status_code == 403


# ── Autorizaciones del alumno ────────────────────────────────────────────────
def test_create_from_template_copies_title(client, headers, make_student):
    h = headers['admin']
    sid = make_student()
    tpl = next(t for t in _templates(client, h) if t.get('key') == 'actividades')
    a = _create(client, h, sid, template_id=tpl['id'])
    assert a['template_id'] == tpl['id']
    assert a['title'] == tpl['title']
    assert a['status'] == 'pendiente'
    assert a['has_signature'] is False
    assert a['student_id'] == sid


def test_create_custom(client, headers, make_student):
    sid = make_student()
    a = _create(client, headers['directivo'], sid, title='Permiso personalizado',
                description='Desc', status='rechazado', signed_by_name='Juan Pérez',
                signed_by_rut='11.111.111-1', signed_at='2026-04-01', notes='n')
    assert a['template_id'] is None
    assert a['title'] == 'Permiso personalizado'
    assert a['status'] == 'rechazado'
    assert a['signed_at'] == '2026-04-01'
    assert a['signed_by_name'] == 'Juan Pérez'


def test_create_without_title_or_template_400(client, headers, make_student):
    sid = make_student()
    r = client.post(f'/api/students/{sid}/authorizations', headers=headers['admin'],
                    json={'status': 'autorizado'})
    assert r.status_code == 400


def test_signed_by_member_fills_name_and_rut(client, headers, make_student):
    h = headers['admin']
    sid = make_student()
    r = client.post(f'/api/students/{sid}/family', headers=h,
                    json={'first_name': 'Karina', 'last_name': 'Ficticia', 'rut': '13.294.390-7',
                          'relationship': 'Madre'})
    mid = unwrap(r.get_json(), 'member')['id']
    a = _create(client, h, sid, title='Con firmante', signed_by_member_id=mid)
    assert a['signed_by_member_id'] == mid
    assert a['signed_by_name'] == 'Karina Ficticia'
    assert a['signed_by_rut'] == '13.294.390-7'


def test_signature_valid_and_remove(client, headers, make_student):
    h = headers['admin']
    sid = make_student()
    a = _create(client, h, sid, title='Con firma', signature_image=TINY_PNG_DATA_URL)
    assert a['has_signature'] is True
    assert a['signature_image'] == TINY_PNG_DATA_URL

    r = client.put(f"/api/students/{sid}/authorizations/{a['id']}", headers=h,
                   json={'signature_image': None})
    assert r.status_code == 200, r.get_data(as_text=True)
    upd = unwrap(r.get_json(), 'authorization')
    assert upd['has_signature'] is False
    assert upd['signature_image'] is None


def test_signature_jpeg_via_put(client, headers, make_student):
    h = headers['admin']
    sid = make_student()
    a = _create(client, h, sid, title='Sin firma')
    jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP////////////////8='
    r = client.put(f"/api/students/{sid}/authorizations/{a['id']}", headers=h,
                   json={'signature_image': jpeg, 'status': 'autorizado', 'signed_at': '2026-05-05'})
    assert r.status_code == 200
    upd = unwrap(r.get_json(), 'authorization')
    assert upd['has_signature'] is True
    assert upd['status'] == 'autorizado'
    assert upd['signed_at'] == '2026-05-05'


@pytest.mark.parametrize('bad', ['hola', 'data:text/plain;base64,aG9sYQ==',
                                 'https://example.com/firma.png'])
def test_signature_invalid_400(client, headers, make_student, bad):
    sid = make_student()
    r = client.post(f'/api/students/{sid}/authorizations', headers=headers['admin'],
                    json={'title': 'Firma inválida', 'signature_image': bad})
    assert r.status_code == 400
    a = _create(client, headers['admin'], sid, title='Ok')
    r = client.put(f"/api/students/{sid}/authorizations/{a['id']}", headers=headers['admin'],
                   json={'signature_image': bad})
    assert r.status_code == 400


def test_signature_too_large_400(client, headers, make_student):
    sid = make_student()
    big = 'data:image/png;base64,' + 'A' * 1_700_000
    r = client.post(f'/api/students/{sid}/authorizations', headers=headers['admin'],
                    json={'title': 'Firma enorme', 'signature_image': big})
    assert r.status_code == 400
    lst = as_list(client.get(f'/api/students/{sid}/authorizations',
                             headers=headers['admin']).get_json(), 'authorizations')
    assert lst == []


def test_list_update_delete(client, headers, make_student):
    h = headers['admin']
    sid = make_student()
    a1 = _create(client, h, sid, title='A1')
    a2 = _create(client, h, sid, title='A2')
    lst = as_list(client.get(f'/api/students/{sid}/authorizations', headers=h).get_json(),
                  'authorizations')
    assert {x['id'] for x in lst} == {a1['id'], a2['id']}

    r = client.put(f"/api/students/{sid}/authorizations/{a1['id']}", headers=h,
                   json={'status': 'autorizado', 'notes': 'ok'})
    assert unwrap(r.get_json(), 'authorization')['status'] == 'autorizado'

    r = client.delete(f"/api/students/{sid}/authorizations/{a1['id']}", headers=h)
    assert r.status_code in (200, 204)
    lst = as_list(client.get(f'/api/students/{sid}/authorizations', headers=h).get_json(),
                  'authorizations')
    assert [x['id'] for x in lst] == [a2['id']]
    assert client.put(f"/api/students/{sid}/authorizations/{a1['id']}", headers=h,
                      json={'status': 'rechazado'}).status_code == 404
    # La autorización de otro alumno no es accesible por esta ruta
    other = make_student()
    assert client.delete(f"/api/students/{other}/authorizations/{a2['id']}",
                         headers=h).status_code == 404


def test_invalid_status_rejected(client, headers, make_student):
    sid = make_student()
    r = client.post(f'/api/students/{sid}/authorizations', headers=headers['admin'],
                    json={'title': 'X', 'status': 'quizas'})
    assert r.status_code == 400


def test_apoderado_sees_signature(app, client, headers, ids):
    sid = ids['pedro']
    a = _create(client, headers['admin'], sid, title='Firma visible', signature_image=TINY_PNG_DATA_URL)
    r = client.get(f'/api/students/{sid}/authorizations', headers=headers['apoderado'])
    assert r.status_code == 200
    mine = [x for x in as_list(r.get_json(), 'authorizations') if x['id'] == a['id']]
    assert mine and mine[0]['signature_image'] == TINY_PNG_DATA_URL
    ficha = client.get(f'/api/students/{sid}/ficha', headers=headers['apoderado']).get_json()
    assert any(x['id'] == a['id'] and x['has_signature'] for x in ficha['authorizations'])
