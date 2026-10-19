"""Familia: CRUD, apoderados titular/suplente, borrado con autorizaciones firmadas."""
import pytest

from conftest import as_list, unwrap


def _create(client, h, sid, **body):
    body.setdefault('first_name', 'Miembro')
    r = client.post(f'/api/students/{sid}/family', headers=h, json=body)
    assert r.status_code == 201, r.get_data(as_text=True)
    return unwrap(r.get_json(), 'member')


def _family(client, h, sid):
    r = client.get(f'/api/students/{sid}/family', headers=h)
    assert r.status_code == 200
    return as_list(r.get_json(), 'family')


def _by_id(members):
    return {m['id']: m for m in members}


def test_family_crud(client, headers, make_student):
    h = headers['admin']
    sid = make_student()
    m = _create(client, h, sid, relationship='Madre', first_name='Rosa', last_name='Soto Vera',
                rut='12.121.212-1', phone='56955555555', email='rosa.soto@example.com',
                can_pickup=True, birth_date='1980-02-03', lives_with_student=True)
    assert m['id'] and m['student_id'] == sid
    assert m['full_name'] == 'Rosa Soto Vera'
    assert m['has_access'] is False
    assert m['user_email'] is None
    assert m['can_pickup'] is True
    assert m['birth_date'] == '1980-02-03'
    assert m['guardian_role'] is None

    fam = _family(client, h, sid)
    assert [x['id'] for x in fam] == [m['id']]

    r = client.put(f"/api/students/{sid}/family/{m['id']}", headers=h,
                   json={'phone': '56900000000', 'is_emergency_contact': True, 'occupation': 'Chef'})
    assert r.status_code == 200, r.get_data(as_text=True)
    upd = unwrap(r.get_json(), 'member')
    assert upd['phone'] == '56900000000'
    assert upd['is_emergency_contact'] is True
    assert upd['occupation'] == 'Chef'
    assert upd['first_name'] == 'Rosa'  # no se pierde

    # La ficha incluye la familia
    ficha = client.get(f'/api/students/{sid}/ficha', headers=h).get_json()
    assert [x['id'] for x in ficha['family']] == [m['id']]

    r = client.delete(f"/api/students/{sid}/family/{m['id']}", headers=h)
    assert r.status_code in (200, 204)
    assert _family(client, h, sid) == []
    assert client.put(f"/api/students/{sid}/family/{m['id']}", headers=h,
                      json={'phone': '1'}).status_code == 404
    assert client.delete(f"/api/students/{sid}/family/{m['id']}", headers=h).status_code == 404


@pytest.mark.parametrize('body', [{}, {'first_name': ''}, {'first_name': '   '},
                                  {'last_name': 'Sin nombre'}])
def test_family_first_name_required(client, headers, make_student, body):
    sid = make_student()
    r = client.post(f'/api/students/{sid}/family', headers=headers['admin'], json=body)
    assert r.status_code == 400
    assert 'error' in r.get_json()


def test_family_put_cannot_blank_first_name(client, headers, make_student):
    sid = make_student()
    m = _create(client, headers['admin'], sid, first_name='Ana')
    r = client.put(f"/api/students/{sid}/family/{m['id']}", headers=headers['admin'],
                   json={'first_name': ''})
    assert r.status_code == 400


def test_guardians_titular_suplente(client, headers, make_student):
    h = headers['admin']
    sid = make_student()
    m1 = _create(client, h, sid, relationship='Madre', first_name='Karla', last_name='Uno',
                 rut='13.294.390-7', phone='56911111111')
    m2 = _create(client, h, sid, relationship='Padre', first_name='Mario', last_name='Dos')
    m3 = _create(client, h, sid, relationship='Abuelo/a', first_name='Elsa', last_name='Tres',
                 phone='56933333333')

    r = client.put(f'/api/students/{sid}/guardians', headers=h,
                   json={'titular_member_id': m1['id'], 'suplente_member_id': m2['id']})
    assert r.status_code == 200, r.get_data(as_text=True)
    fam = _by_id(as_list(r.get_json(), 'family'))
    assert fam[m1['id']]['guardian_role'] == 'titular'
    assert fam[m2['id']]['guardian_role'] == 'suplente'
    assert fam[m3['id']]['guardian_role'] is None

    s = client.get(f'/api/students/{sid}/ficha', headers=h).get_json()['summary']
    assert s['guardian']['member_id'] == m1['id']
    assert s['guardian']['name'] == 'Karla Uno'
    assert s['guardian']['rut'] == '13.294.390-7'
    assert s['guardian']['phone'] == '56911111111'
    assert s['guardian']['relationship'] == 'Madre'
    assert s['substitute']['member_id'] == m2['id']

    # Reasignar titular: m3 pasa a titular, m1 deja de serlo
    r = client.put(f'/api/students/{sid}/guardians', headers=h,
                   json={'titular_member_id': m3['id'], 'suplente_member_id': m2['id']})
    assert r.status_code == 200
    fam = _by_id(as_list(r.get_json(), 'family'))
    assert fam[m3['id']]['guardian_role'] == 'titular'
    assert fam[m1['id']]['guardian_role'] is None
    assert fam[m2['id']]['guardian_role'] == 'suplente'
    titulares = [m for m in fam.values() if m['guardian_role'] == 'titular']
    assert len(titulares) == 1

    s = client.get(f'/api/students/{sid}/ficha', headers=h).get_json()['summary']
    assert s['guardian']['member_id'] == m3['id']
    assert s['guardian']['relationship'] == 'Abuelo/a'

    # El suplente pasa a titular → deja de ser suplente; suplente null
    r = client.put(f'/api/students/{sid}/guardians', headers=h,
                   json={'titular_member_id': m2['id'], 'suplente_member_id': None})
    assert r.status_code == 200
    fam = _by_id(as_list(r.get_json(), 'family'))
    assert fam[m2['id']]['guardian_role'] == 'titular'
    assert fam[m3['id']]['guardian_role'] is None
    assert [m for m in fam.values() if m['guardian_role'] == 'suplente'] == []
    s = client.get(f'/api/students/{sid}/ficha', headers=h).get_json()['summary']
    assert s['guardian']['member_id'] == m2['id']
    assert s['substitute'] is None


def test_guardians_same_member_400(client, headers, make_student):
    sid = make_student()
    m = _create(client, headers['admin'], sid, first_name='Uno')
    r = client.put(f'/api/students/{sid}/guardians', headers=headers['admin'],
                   json={'titular_member_id': m['id'], 'suplente_member_id': m['id']})
    assert r.status_code == 400


def test_guardians_member_of_other_student_rejected(client, headers, make_student):
    sid1, sid2 = make_student(), make_student()
    foreign = _create(client, headers['admin'], sid2, first_name='Ajeno')
    r = client.put(f'/api/students/{sid1}/guardians', headers=headers['admin'],
                   json={'titular_member_id': foreign['id'], 'suplente_member_id': None})
    assert r.status_code in (400, 404)
    fam2 = _family(client, headers['admin'], sid2)
    assert fam2[0]['guardian_role'] is None


def test_delete_member_who_signed_authorization(client, headers, make_student):
    h = headers['admin']
    sid = make_student()
    m = _create(client, h, sid, relationship='Madre', first_name='Firma', last_name='Madre',
                rut='16.546.398-6')
    r = client.post(f'/api/students/{sid}/authorizations', headers=h,
                    json={'title': 'Salida pedagógica', 'status': 'autorizado',
                          'signed_by_member_id': m['id'], 'signed_at': '2026-03-10'})
    assert r.status_code == 201, r.get_data(as_text=True)
    auth = unwrap(r.get_json(), 'authorization')
    assert auth['signed_by_member_id'] == m['id']
    assert auth['signed_by_name'] == 'Firma Madre'
    assert auth['signed_by_rut'] == '16.546.398-6'

    r = client.delete(f"/api/students/{sid}/family/{m['id']}", headers=h)
    assert r.status_code in (200, 204), r.get_data(as_text=True)

    r = client.get(f'/api/students/{sid}/authorizations', headers=h)
    auths = as_list(r.get_json(), 'authorizations')
    assert len(auths) == 1
    assert auths[0]['id'] == auth['id']
    assert auths[0]['signed_by_member_id'] is None
    assert auths[0]['status'] == 'autorizado'
    assert auths[0]['signed_by_name'] == 'Firma Madre'  # se conserva el nombre registrado


def test_delete_titular_clears_summary(client, headers, make_student):
    h = headers['admin']
    sid = make_student()
    m = _create(client, h, sid, first_name='Titular')
    client.put(f'/api/students/{sid}/guardians', headers=h,
               json={'titular_member_id': m['id'], 'suplente_member_id': None})
    client.delete(f"/api/students/{sid}/family/{m['id']}", headers=h)
    s = client.get(f'/api/students/{sid}/ficha', headers=h).get_json()['summary']
    assert s['guardian'] is None
