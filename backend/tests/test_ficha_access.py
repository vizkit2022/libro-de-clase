"""POST /family/<mid>/access — crea o vincula la cuenta de apoderado del miembro."""
from conftest import create_user, login, unwrap


def _member(client, h, sid, **body):
    body.setdefault('first_name', 'Apoderada')
    body.setdefault('relationship', 'Madre')
    r = client.post(f'/api/students/{sid}/family', headers=h, json=body)
    assert r.status_code == 201, r.get_data(as_text=True)
    return unwrap(r.get_json(), 'member')


def _guardian_links(app, student_id, email):
    from models import StudentGuardian, User
    with app.app_context():
        users = User.query.filter_by(email=email).all()
        links = StudentGuardian.query.filter_by(student_id=student_id).all()
        return users, [l for l in links if users and l.guardian_id == users[0].id]


def test_create_access_creates_user_and_link(app, client, headers, make_student):
    h = headers['admin']
    sid = make_student()
    m = _member(client, h, sid, first_name='Nueva', last_name='Apoderada',
                email='nueva.apoderada@example.com', rut='18.058.831-0')
    r = client.post(f"/api/students/{sid}/family/{m['id']}/access", headers=h,
                    json={'password': 'Clave123!'})
    assert r.status_code in (200, 201), r.get_data(as_text=True)
    data = r.get_json()
    assert data['created'] is True
    assert data['user']['role'] == 'apoderado'
    assert data['user']['email'] == 'nueva.apoderada@example.com'
    assert data['member']['has_access'] is True
    assert data['member']['user_id'] == data['user']['id']
    assert data['member']['user_email'] == 'nueva.apoderada@example.com'

    users, links = _guardian_links(app, sid, 'nueva.apoderada@example.com')
    assert len(users) == 1 and len(links) == 1
    assert users[0].school_id is not None
    assert links[0].relationship == 'Madre'

    # Segunda llamada: no duplica usuario ni vínculo
    r = client.post(f"/api/students/{sid}/family/{m['id']}/access", headers=h, json={})
    assert r.status_code in (200, 201), r.get_data(as_text=True)
    assert r.get_json()['created'] is False
    users, links = _guardian_links(app, sid, 'nueva.apoderada@example.com')
    assert len(users) == 1 and len(links) == 1

    # El nuevo apoderado entra con la clave y ve (no edita) la ficha
    ah = login(client, 'nueva.apoderada@example.com', 'Clave123!')
    assert client.get(f'/api/students/{sid}/ficha', headers=ah).status_code == 200
    ficha = client.get(f'/api/students/{sid}/ficha', headers=ah).get_json()
    assert ficha['permissions']['can_edit'] is False
    assert client.put(f'/api/students/{sid}/profile', headers=ah,
                      json={'user': {'first_name': 'X'}}).status_code == 403
    assert client.post(f'/api/students/{sid}/family', headers=ah,
                       json={'first_name': 'X'}).status_code == 403
    # No ve a otros alumnos
    other = make_student()
    assert client.get(f'/api/students/{other}/ficha', headers=ah).status_code == 403


def test_create_access_default_password(client, headers, make_student):
    sid = make_student()
    m = _member(client, headers['admin'], sid, email='default.pass@example.com')
    r = client.post(f"/api/students/{sid}/family/{m['id']}/access", headers=headers['admin'])
    assert r.status_code in (200, 201), r.get_data(as_text=True)
    ah = login(client, 'default.pass@example.com', 'Apoderado2026!')
    assert client.get(f'/api/students/{sid}/ficha', headers=ah).status_code == 200


def test_access_member_without_email_400(client, headers, make_student):
    sid = make_student()
    m = _member(client, headers['admin'], sid)
    r = client.post(f"/api/students/{sid}/family/{m['id']}/access", headers=headers['admin'], json={})
    assert r.status_code == 400
    assert 'error' in r.get_json()


def test_access_email_used_by_profesor_400(app, client, headers, make_student):
    sid = make_student()
    m = _member(client, headers['admin'], sid, email='mvaldes@sanpatricio.cl')
    r = client.post(f"/api/students/{sid}/family/{m['id']}/access", headers=headers['admin'], json={})
    assert r.status_code == 400
    from models import User
    with app.app_context():
        assert User.query.filter_by(email='mvaldes@sanpatricio.cl').first().role == 'profesor'


def test_access_links_existing_apoderado_same_school(app, client, headers, ids, make_student):
    sid = make_student()
    m = _member(client, headers['admin'], sid, email='apoderado@sanpatricio.cl', first_name='Rosa')
    r = client.post(f"/api/students/{sid}/family/{m['id']}/access", headers=headers['admin'], json={})
    assert r.status_code in (200, 201), r.get_data(as_text=True)
    data = r.get_json()
    assert data['created'] is False
    assert data['user']['id'] == ids['apoderado']
    # El apoderado seed ahora ve también a este alumno (con su clave original)
    assert client.get(f'/api/students/{sid}/ficha', headers=headers['apoderado']).status_code == 200


def test_access_existing_apoderado_other_school_rejected(app, client, headers, make_student):
    from models import School, db
    with app.app_context():
        s = School(name='Otro Colegio Acceso', rut='98.765.432-1')
        db.session.add(s)
        db.session.commit()
        other_school = s.id
    create_user(app, role='apoderado', school_id=other_school, email='apod.otro.colegio@example.com')
    sid = make_student()
    m = _member(client, headers['admin'], sid, email='apod.otro.colegio@example.com')
    r = client.post(f"/api/students/{sid}/family/{m['id']}/access", headers=headers['admin'], json={})
    assert r.status_code == 400


def test_access_email_case_insensitive(app, client, headers, make_student):
    """El login normaliza a minúsculas: el usuario creado debe poder iniciar sesión."""
    sid = make_student()
    m = _member(client, headers['admin'], sid, email='Mayus.Apoderado@Example.com')
    r = client.post(f"/api/students/{sid}/family/{m['id']}/access", headers=headers['admin'],
                    json={'password': 'Clave123!'})
    assert r.status_code in (200, 201), r.get_data(as_text=True)
    ah = login(client, 'mayus.apoderado@example.com', 'Clave123!')
    assert client.get(f'/api/students/{sid}/ficha', headers=ah).status_code == 200
