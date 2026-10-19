"""GET /api/users/<id>/photo — protegido por JWT (Bearer o ?token=), con alcance por rol."""
import base64

import pytest

from conftest import TINY_PNG_B64, TINY_PNG_DATA_URL

DENIED = (403, 404)
PNG_BYTES = base64.b64decode(TINY_PNG_B64)


def _token(h):
    return h['Authorization'].split(' ', 1)[1]


def _set_photo(client, h, uid):
    r = client.put(f'/api/users/{uid}/photo', headers=h, json={'photo': TINY_PNG_DATA_URL})
    assert r.status_code == 200, r.get_data(as_text=True)


def _set_photo_db(app, uid):
    from models import User, db
    with app.app_context():
        u = db.session.get(User, uid)
        u.photo = TINY_PNG_DATA_URL
        db.session.commit()


@pytest.fixture(scope='module')
def photos(app, client, headers, ids, other_school_student):
    """Deja foto en pedro, diego, un alumno vinculado al apoderado y uno de otro colegio."""
    h = headers['admin']
    linked = ids['linked'][0]
    for uid in {ids['pedro'], ids['diego'], linked}:
        _set_photo(client, h, uid)
    _set_photo_db(app, other_school_student)  # PUT está restringido al colegio del token
    return {'linked': linked, 'unlinked': ids['diego'], 'other_school': other_school_student}


def _assert_image(r):
    assert r.status_code == 200, r.get_data(as_text=True)
    assert r.mimetype == 'image/png'
    assert r.data == PNG_BYTES


def test_no_token_401(client, photos, ids):
    r = client.get(f"/api/users/{ids['pedro']}/photo")
    assert r.status_code == 401, r.status_code


def test_invalid_query_token_rejected(client, photos, ids):
    r = client.get(f"/api/users/{ids['pedro']}/photo?token=not-a-jwt")
    assert r.status_code in (401, 422), r.status_code


def test_admin_same_school_bearer(client, headers, photos, ids):
    r = client.get(f"/api/users/{ids['pedro']}/photo", headers=headers['admin'])
    _assert_image(r)
    cc = r.headers.get('Cache-Control', '')
    assert 'private' in cc and 'public' not in cc, cc


def test_admin_query_token(client, headers, photos, ids):
    r = client.get(f"/api/users/{ids['pedro']}/photo?token={_token(headers['admin'])}")
    _assert_image(r)


@pytest.mark.parametrize('role', ['admin', 'directivo', 'profesor'])
def test_staff_other_school_denied(client, headers, photos, role):
    r = client.get(f"/api/users/{photos['other_school']}/photo", headers=headers[role])
    assert r.status_code in DENIED, r.status_code


def test_other_school_denied_with_query_token(client, headers, photos):
    r = client.get(f"/api/users/{photos['other_school']}/photo?token={_token(headers['admin'])}")
    assert r.status_code in DENIED, r.status_code


def test_apoderado_linked_ok(client, headers, photos):
    _assert_image(client.get(f"/api/users/{photos['linked']}/photo", headers=headers['apoderado']))


def test_apoderado_linked_ok_query_token(client, headers, photos):
    r = client.get(f"/api/users/{photos['linked']}/photo?token={_token(headers['apoderado'])}")
    _assert_image(r)


def test_apoderado_unlinked_denied(client, headers, photos, ids):
    assert photos['unlinked'] not in ids['linked']
    r = client.get(f"/api/users/{photos['unlinked']}/photo", headers=headers['apoderado'])
    assert r.status_code in DENIED, r.status_code


def test_alumno_self_ok(client, headers, photos, ids):
    _assert_image(client.get(f"/api/users/{ids['pedro']}/photo", headers=headers['alumno']))


def test_alumno_other_student_denied(client, headers, photos, ids):
    r = client.get(f"/api/users/{ids['diego']}/photo", headers=headers['alumno'])
    assert r.status_code in DENIED, r.status_code


def test_no_photo_404_when_authorized(client, headers, make_student):
    sid = make_student()
    r = client.get(f'/api/users/{sid}/photo', headers=headers['admin'])
    assert r.status_code == 404, r.status_code
