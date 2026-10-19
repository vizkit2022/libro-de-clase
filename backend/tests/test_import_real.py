"""Importación del Libro de Matrícula REAL (solo si se define REAL_XLSX=/ruta/al/archivo.xlsx).

El archivo real contiene datos de menores: NUNCA copiarlo al repo. Este test lo ejecuta
el coordinador en un entorno controlado:  REAL_XLSX=/ruta/Libro.xlsx python3 -m pytest tests/test_import_real.py
"""
import os
import unicodedata

import pytest

REAL_XLSX = os.environ.get('REAL_XLSX')

pytestmark = pytest.mark.skipif(not REAL_XLSX, reason='REAL_XLSX no definido')

TARGET_RUT = '24.785.514-9'


def _norm(s):
    s = unicodedata.normalize('NFKD', s or '')
    return ' '.join(''.join(c for c in s if not unicodedata.combining(c)).upper().split())


def _post(client, h, dry_run):
    with open(REAL_XLSX, 'rb') as fh:
        return client.post('/api/students/import', headers=h,
                           data={'file': (fh, os.path.basename(REAL_XLSX)),
                                 'dry_run': 'true' if dry_run else 'false'},
                           content_type='multipart/form-data')


def test_real_import_dry_run(client, headers):
    r = _post(client, headers['admin'], dry_run=True)
    assert r.status_code == 200, r.get_data(as_text=True)[:2000]
    data = r.get_json()
    assert data['total_rows'] == 35
    assert data['errors'] == [], data['errors'][:5]
    assert len(data['rows']) == 35


def test_real_import_and_family_of_target(app, client, headers):
    h = headers['admin']
    r = _post(client, h, dry_run=False)
    assert r.status_code == 200, r.get_data(as_text=True)[:2000]
    data = r.get_json()
    assert data['dry_run'] is False
    assert data['total_rows'] == 35
    assert data['errors'] == [], data['errors'][:5]
    assert data['created'] + data['updated'] == 35

    from models import User
    with app.app_context():
        st = User.query.filter_by(rut=TARGET_RUT, role='alumno').one()
        sid = st.id
    f = client.get(f'/api/students/{sid}/ficha', headers=h).get_json()

    madres = [m for m in f['family'] if m['relationship'] == 'Madre']
    padres = [m for m in f['family'] if m['relationship'] == 'Padre']
    assert len(madres) == 1 and len(padres) == 1, [(m['relationship'], m['full_name']) for m in f['family']]
    madre, padre = madres[0], padres[0]
    assert _norm(madre['full_name']) == 'KARINA ROJAS DIAZ'
    assert madre['guardian_role'] == 'titular'
    assert _norm(padre['full_name']) == 'MAURICIO ARIAS SEPULVEDA'
    assert padre['is_economic_tutor'] is True
    assert _norm(f['summary']['guardian']['name']) == 'KARINA ROJAS DIAZ'
    assert f['summary']['course_name']

    # Re-importar: idempotente
    r = _post(client, h, dry_run=False)
    data2 = r.get_json()
    assert data2['created'] == 0 and data2['updated'] == 35
    f2 = client.get(f'/api/students/{sid}/ficha', headers=h).get_json()
    assert len(f2['family']) == len(f['family'])
    assert len(f2['authorizations']) == len(f['authorizations'])
