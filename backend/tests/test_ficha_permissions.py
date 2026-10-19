"""Permisos de la ficha: ver (staff/apoderado vinculado/alumno propio), editar (admin/directivo)."""
import pytest

from conftest import TINY_PNG_DATA_URL, file_tuple, unwrap


@pytest.fixture(scope='module')
def member_id(client, headers, ids):
    """Miembro de familia de Pedro creado por admin (para probar PUT/DELETE prohibidos)."""
    r = client.post(f"/api/students/{ids['pedro']}/family", headers=headers['admin'],
                    json={'first_name': 'Rosa', 'last_name': 'Soto Vera', 'relationship': 'Madre'})
    assert r.status_code == 201, r.get_data(as_text=True)
    return unwrap(r.get_json(), 'member')['id']


@pytest.fixture(scope='module')
def doc_id(client, headers, ids):
    r = client.post(f"/api/students/{ids['pedro']}/documents", headers=headers['admin'],
                    data={'file': file_tuple(b'%PDF-1.4 doc', 'doc.pdf')},
                    content_type='multipart/form-data')
    assert r.status_code == 201, r.get_data(as_text=True)
    return unwrap(r.get_json(), 'document')['id']


@pytest.fixture(scope='module')
def auth_id(client, headers, ids):
    r = client.post(f"/api/students/{ids['pedro']}/authorizations", headers=headers['admin'],
                    json={'title': 'Permiso de prueba'})
    assert r.status_code == 201, r.get_data(as_text=True)
    return unwrap(r.get_json(), 'authorization')['id']


# ── Sin token ────────────────────────────────────────────────────────────────
@pytest.mark.parametrize('method,path', [
    ('get', '/api/students/{sid}/ficha'),
    ('put', '/api/students/{sid}/profile'),
    ('get', '/api/students/{sid}/family'),
    ('get', '/api/students/{sid}/documents'),
    ('get', '/api/students/authorization-templates'),
    ('post', '/api/students/import'),
])
def test_no_token_401(client, ids, method, path):
    r = getattr(client, method)(path.format(sid=ids['pedro']))
    assert r.status_code == 401


# ── Profesor: ve, no edita ───────────────────────────────────────────────────
def test_profesor_can_view(client, headers, ids):
    assert client.get(f"/api/students/{ids['diego']}/ficha", headers=headers['profesor']).status_code == 200
    assert client.get(f"/api/students/{ids['pedro']}/family", headers=headers['profesor']).status_code == 200


def test_profesor_cannot_edit(client, headers, ids, member_id, doc_id, auth_id):
    sid = ids['pedro']
    h = headers['profesor']
    calls = [
        client.put(f'/api/students/{sid}/profile', headers=h, json={'profile': {'comuna': 'X'}}),
        client.put(f'/api/students/{sid}/medical', headers=h, json={'allergies': 'X'}),
        client.post(f'/api/students/{sid}/family', headers=h, json={'first_name': 'X'}),
        client.put(f'/api/students/{sid}/family/{member_id}', headers=h, json={'phone': '1'}),
        client.delete(f'/api/students/{sid}/family/{member_id}', headers=h),
        client.put(f'/api/students/{sid}/guardians', headers=h,
                   json={'titular_member_id': member_id, 'suplente_member_id': None}),
        client.post(f'/api/students/{sid}/family/{member_id}/access', headers=h, json={}),
        client.post(f'/api/students/{sid}/authorizations', headers=h, json={'title': 'X'}),
        client.put(f'/api/students/{sid}/authorizations/{auth_id}', headers=h,
                   json={'status': 'autorizado'}),
        client.delete(f'/api/students/{sid}/authorizations/{auth_id}', headers=h),
        client.post(f'/api/students/{sid}/documents', headers=h,
                    data={'file': file_tuple(b'x', 'a.pdf')}, content_type='multipart/form-data'),
        client.put(f'/api/students/{sid}/documents/{doc_id}', headers=h, json={'title': 'X'}),
        client.delete(f'/api/students/{sid}/documents/{doc_id}', headers=h),
        client.post('/api/students/authorization-templates', headers=h, json={'title': 'X'}),
    ]
    codes = [r.status_code for r in calls]
    assert codes == [403] * len(calls), codes
    # Nada se borró
    assert client.get(f'/api/students/{sid}/documents/{doc_id}/download',
                      headers=headers['admin']).status_code == 200


def test_profesor_can_download_document(client, headers, ids, doc_id):
    r = client.get(f"/api/students/{ids['pedro']}/documents/{doc_id}/download",
                   headers=headers['profesor'])
    assert r.status_code == 200


# ── Apoderado ────────────────────────────────────────────────────────────────
def test_apoderado_views_linked_students(client, headers, ids):
    assert len(ids['linked']) == 2
    for sid in ids['linked']:
        r = client.get(f'/api/students/{sid}/ficha', headers=headers['apoderado'])
        assert r.status_code == 200, (sid, r.get_data(as_text=True))


def test_apoderado_forbidden_unlinked_student(client, headers, ids):
    sid = ids['diego']
    h = headers['apoderado']
    assert sid not in ids['linked']
    assert client.get(f'/api/students/{sid}/ficha', headers=h).status_code == 403
    assert client.get(f'/api/students/{sid}/family', headers=h).status_code == 403
    assert client.get(f'/api/students/{sid}/documents', headers=h).status_code == 403
    assert client.get(f'/api/students/{sid}/authorizations', headers=h).status_code == 403


def test_apoderado_cannot_edit_linked_student(client, headers, ids, member_id, auth_id):
    sid = ids['pedro']
    h = headers['apoderado']
    assert client.put(f'/api/students/{sid}/profile', headers=h,
                      json={'user': {'first_name': 'Hack'}}).status_code == 403
    assert client.put(f'/api/students/{sid}/medical', headers=h, json={'allergies': 'X'}).status_code == 403
    assert client.post(f'/api/students/{sid}/family', headers=h, json={'first_name': 'X'}).status_code == 403
    assert client.put(f'/api/students/{sid}/authorizations/{auth_id}', headers=h,
                      json={'signature_image': TINY_PNG_DATA_URL}).status_code == 403
    assert client.post(f'/api/students/{sid}/documents', headers=h,
                       data={'file': file_tuple(b'x', 'a.pdf')},
                       content_type='multipart/form-data').status_code == 403


def test_apoderado_can_download_linked_document(client, headers, ids, doc_id):
    r = client.get(f"/api/students/{ids['pedro']}/documents/{doc_id}/download",
                   headers=headers['apoderado'])
    assert r.status_code == 200
    assert r.data == b'%PDF-1.4 doc'


def test_apoderado_cannot_download_unlinked_document(client, headers, ids):
    r = client.post(f"/api/students/{ids['diego']}/documents", headers=headers['admin'],
                    data={'file': file_tuple(b'%PDF diego', 'd.pdf')},
                    content_type='multipart/form-data')
    assert r.status_code == 201
    did = unwrap(r.get_json(), 'document')['id']
    r = client.get(f"/api/students/{ids['diego']}/documents/{did}/download",
                   headers=headers['apoderado'])
    assert r.status_code == 403


# ── Alumno ───────────────────────────────────────────────────────────────────
def test_alumno_views_self_only(client, headers, ids):
    h = headers['alumno']
    assert client.get(f"/api/students/{ids['pedro']}/ficha", headers=h).status_code == 200
    assert client.get(f"/api/students/{ids['valentina']}/ficha", headers=h).status_code == 403
    assert client.get(f"/api/students/{ids['diego']}/documents", headers=h).status_code == 403


def test_alumno_cannot_edit_self(client, headers, ids):
    h = headers['alumno']
    sid = ids['pedro']
    assert client.put(f'/api/students/{sid}/profile', headers=h,
                      json={'profile': {'comuna': 'X'}}).status_code == 403
    assert client.post(f'/api/students/{sid}/family', headers=h,
                       json={'first_name': 'X'}).status_code == 403


# ── 404 ──────────────────────────────────────────────────────────────────────
def test_nonexistent_student_404(client, headers):
    assert client.get('/api/students/987654/ficha', headers=headers['admin']).status_code == 404
    assert client.put('/api/students/987654/profile', headers=headers['admin'],
                      json={'profile': {}}).status_code == 404


def test_other_school_student_404(client, headers, other_school_student):
    sid = other_school_student
    assert client.get(f'/api/students/{sid}/ficha', headers=headers['admin']).status_code == 404
    assert client.get(f'/api/students/{sid}/ficha', headers=headers['profesor']).status_code == 404
    assert client.post(f'/api/students/{sid}/family', headers=headers['admin'],
                       json={'first_name': 'X'}).status_code == 404


@pytest.mark.parametrize('who', ['admin', 'profesor', 'apoderado', 'directivo'])
def test_non_student_user_id_404(client, headers, ids, who):
    assert client.get(f'/api/students/{ids[who]}/ficha', headers=headers['admin']).status_code == 404


def test_member_of_other_student_404(client, headers, ids, member_id):
    # El miembro pertenece a Pedro; accederlo por la ruta de Diego debe fallar
    r = client.put(f"/api/students/{ids['diego']}/family/{member_id}", headers=headers['admin'],
                   json={'phone': '1'})
    assert r.status_code == 404
