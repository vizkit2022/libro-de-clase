"""PUT /profile y PUT /medical."""
import pytest

from conftest import unwrap


def _get(client, sid, h):
    r = client.get(f'/api/students/{sid}/ficha', headers=h)
    assert r.status_code == 200
    return r.get_json()


def test_put_profile_user_and_profile(client, headers, make_student):
    sid = make_student()
    body = {
        'user': {'first_name': 'Pedrito', 'last_name': 'Prueba Ficha', 'address': 'Calle 1 #23',
                 'phone': '56911112222', 'birth_date': '2014-05-03', 'gender': 'Masculino'},
        'profile': {'nationality': 'Chile', 'comuna': 'Maipú', 'list_order': 5, 'pie': True,
                    'enrollment_date': '2026-03-01', 'status': 'matriculado',
                    'lives_with': 'Madre', 'household_size': 3, 'id_type': 'RUN',
                    'emergency_contact_name': 'Tía', 'emergency_phone': '56900001111',
                    'judicial_restriction': True, 'judicial_restriction_detail': 'Detalle',
                    'has_commitment_letter': False, 'admission_type': 'nuevo'},
    }
    r = client.put(f'/api/students/{sid}/profile', headers=headers['admin'], json=body)
    assert r.status_code == 200, r.get_data(as_text=True)
    data = r.get_json()
    # Devuelve la ficha completa
    assert {'student', 'profile', 'medical', 'summary'} <= set(data)
    st, pr = data['student'], data['profile']
    assert st['first_name'] == 'Pedrito'
    assert st['last_name'] == 'Prueba Ficha'
    assert st['address'] == 'Calle 1 #23'
    assert st['phone'] == '56911112222'
    assert st['birth_date'] == '2014-05-03'
    assert st['gender'] == 'Masculino'
    assert pr['list_order'] == 5
    assert pr['pie'] is True
    assert pr['enrollment_date'] == '2026-03-01'
    assert pr['comuna'] == 'Maipú'
    assert pr['household_size'] == 3
    assert pr['judicial_restriction'] is True
    assert pr['has_commitment_letter'] is False
    assert pr['admission_type'] == 'nuevo'
    # Persistido
    again = _get(client, sid, headers['admin'])
    assert again['student']['first_name'] == 'Pedrito'
    assert again['profile']['emergency_phone'] == '56900001111'
    assert again['summary']['age'] is not None


def test_put_profile_only_profile_creates_record(client, headers, make_student):
    sid = make_student()
    r = client.put(f'/api/students/{sid}/profile', headers=headers['directivo'],
                   json={'profile': {'religion': 'Católica', 'baptized': True}})
    assert r.status_code == 200, r.get_data(as_text=True)
    pr = r.get_json()['profile']
    assert pr['religion'] == 'Católica' and pr['baptized'] is True
    assert pr.get('id') is not None


def test_put_profile_only_user(client, headers, make_student):
    sid = make_student()
    r = client.put(f'/api/students/{sid}/profile', headers=headers['admin'],
                   json={'user': {'address': 'Solo dirección'}})
    assert r.status_code == 200
    assert r.get_json()['student']['address'] == 'Solo dirección'


def test_put_profile_duplicate_email_400(client, headers, make_student):
    sid = make_student(email='original.email@example.com')
    r = client.put(f'/api/students/{sid}/profile', headers=headers['admin'],
                   json={'user': {'email': 'admin@sanpatricio.cl'}})
    assert r.status_code == 400
    assert 'error' in r.get_json()
    assert _get(client, sid, headers['admin'])['student']['email'] == 'original.email@example.com'


def test_put_profile_same_email_is_ok(client, headers, make_student):
    sid = make_student(email='mismo.email@example.com')
    r = client.put(f'/api/students/{sid}/profile', headers=headers['admin'],
                   json={'user': {'email': 'mismo.email@example.com', 'first_name': 'Igual'}})
    assert r.status_code == 200, r.get_data(as_text=True)


def test_put_profile_change_email(client, headers, make_student):
    sid = make_student()
    r = client.put(f'/api/students/{sid}/profile', headers=headers['admin'],
                   json={'user': {'email': 'nuevo.email.alumno@example.com'}})
    assert r.status_code == 200
    assert r.get_json()['student']['email'] == 'nuevo.email.alumno@example.com'


def test_put_profile_user_whitelist(client, headers, make_student):
    """role / school_id no están en la whitelist → se ignoran."""
    sid = make_student()
    r = client.put(f'/api/students/{sid}/profile', headers=headers['admin'],
                   json={'user': {'role': 'admin', 'first_name': 'Whitelist'}})
    assert r.status_code == 200
    st = r.get_json()['student']
    assert st['role'] == 'alumno'
    assert st['first_name'] == 'Whitelist'


def test_put_profile_clear_birth_date(client, headers, make_student):
    sid = make_student()
    client.put(f'/api/students/{sid}/profile', headers=headers['admin'],
               json={'user': {'birth_date': '2014-01-01'}})
    r = client.put(f'/api/students/{sid}/profile', headers=headers['admin'],
                   json={'user': {'birth_date': None}})
    assert r.status_code == 200
    assert r.get_json()['student']['birth_date'] is None
    assert r.get_json()['summary']['age'] is None


def test_put_medical(client, headers, make_student):
    sid = make_student()
    r = client.put(f'/api/students/{sid}/medical', headers=headers['admin'],
                   json={'allergies': 'Maní', 'problem_visual': True, 'problem_cardiac': False,
                         'height_cm': 140.5, 'weight_kg': 38, 'blood_type': 'O+',
                         'special_care': 'Asma', 'other_problems': 'Ninguno'})
    assert r.status_code == 200, r.get_data(as_text=True)
    med = unwrap(r.get_json(), 'medical')
    assert med['allergies'] == 'Maní'
    assert med['problem_visual'] is True
    assert med['problem_cardiac'] is False
    assert med['problem_auditory'] is False
    assert med['problem_spine'] is False
    assert med['height_cm'] == pytest.approx(140.5)
    assert med['weight_kg'] == pytest.approx(38)
    assert med['blood_type'] == 'O+'
    # Toggle a False y otro a True
    r = client.put(f'/api/students/{sid}/medical', headers=headers['admin'],
                   json={'problem_visual': False, 'problem_spine': True})
    assert r.status_code == 200
    med = unwrap(r.get_json(), 'medical')
    assert med['problem_visual'] is False
    assert med['problem_spine'] is True
    assert med['allergies'] == 'Maní'  # no se pisa lo no enviado
    ficha = _get(client, sid, headers['admin'])
    assert ficha['medical']['problem_spine'] is True
    assert ficha['medical']['special_care'] == 'Asma'
