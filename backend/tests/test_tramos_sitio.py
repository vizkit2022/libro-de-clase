"""Los tramos del panel son la única fuente: sitio, llms.txt y cobro los leen de ahí."""
import json
import re
import uuid

import pytest

from conftest import login
from models import PlanCatalogo

ESCALA = [(3, 0.7), (10, 1.3), (20, 2.5), (30, 4), (40, 6)]


@pytest.fixture
def sa(client):
    return login(client, 'superadmin@sistema.cl', 'super123')


def guardar(client, sa, escala, **extra):
    actuales = sorted((p for p in client.get('/api/super-admin/planes', headers=sa).get_json()
                       if p['monto_uf'] and p['activo']), key=lambda p: p['usuarios_min'])
    filas = [{**({'id': actuales[i]['id']} if i < len(actuales) else {}),
              'usuarios_hasta': hasta, 'monto_uf': uf} for i, (hasta, uf) in enumerate(escala)]
    return client.put('/api/super-admin/tramos', headers=sa, json={'tramos': filas, **extra})


@pytest.fixture(autouse=True)
def restaurar(client, sa):
    yield
    assert guardar(client, sa, ESCALA, dias_prueba=30).status_code == 200


def pagina(client):
    return client.get('/').get_data(as_text=True)


def test_el_sitio_no_deja_marcas_y_sus_datos_son_validos(client):
    html = pagina(client)
    assert '{{' not in html
    for bloque in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S):
        json.loads(bloque)
    assert '<tr><td>31 a 40</td><td>6 UF</td></tr>' in html
    assert 'var TRAMOS = [[3, 0.7], [10, 1.3], [20, 2.5], [30, 4.0], [40, 6.0]]' in html
    assert 'paga 4 UF al mes' in html and 'Más de 40' in html


def test_editar_cambia_sitio_llms_y_cobro(client, sa):
    assert guardar(client, sa, [(5, 0.9), (50, 3.25)]).status_code == 200
    html = pagina(client)
    assert '<tr><td>1 a 5</td><td>0,9 UF</td></tr>' in html
    assert '<tr><td>6 a 50</td><td>3,25 UF</td></tr>' in html
    assert 'desde 0,9 UF para 1 a 5 usuarios hasta 3,25 UF para 6 a 50' in html
    assert 'paga 3,25 UF al mes' in html and 'Más de 50' in html and 'Más de 40' not in html
    assert '6 UF' not in html.split('id="precios"')[1].split('class="precio-pie"')[0]

    llms = client.get('/llms.txt').get_data(as_text=True)
    assert '1 a 5 usuarios, 0,9 UF; 6 a 50 usuarios, 3,25 UF' in llms and 'más de 50' in llms

    r = client.post('/api/registro', json={'nombre': 'A', 'apellido': 'B', 'password': 'clave-larga-1',
                                           'email': f't{uuid.uuid4().hex[:8]}@ejemplo.cl'})
    r = client.post('/api/registro/colegio', json={'nombre': 'C'},
                    headers={'Authorization': f"Bearer {r.get_json()['access_token']}"})
    h = {'Authorization': f"Bearer {r.get_json()['access_token']}"}
    plan = client.get('/api/payments/plan', headers=h).get_json()['plan']
    assert (plan['uf'], plan['monto'], plan['nombre']) == (0.9, 36000, '1 a 5 usuarios')


def test_quitar_tramos_los_desactiva_y_conserva_un_predeterminado(client, sa, app):
    assert guardar(client, sa, [(100, 9)]).status_code == 200
    with app.app_context():
        activos = PlanCatalogo.tramos_activos()
        assert [(t.usuarios_min, t.usuarios_max) for t in activos] == [(1, 100)]
        assert PlanCatalogo.vigente().monto_uf == 9


def test_dias_de_prueba_llegan_al_registro(client, sa):
    assert guardar(client, sa, ESCALA, dias_prueba=45).status_code == 200
    assert client.get('/api/registro/config').get_json()['dias_prueba'] == 45


@pytest.mark.parametrize('cuerpo', [
    {}, {'tramos': []}, {'tramos': 'x'},
    {'tramos': [{'usuarios_hasta': 0, 'monto_uf': 1}]},
    {'tramos': [{'usuarios_hasta': 5, 'monto_uf': 0}]},
    {'tramos': [{'usuarios_hasta': 5, 'monto_uf': True}]},
    {'tramos': [{'usuarios_hasta': 5, 'monto_uf': 1}, {'usuarios_hasta': 5, 'monto_uf': 2}]},
    {'tramos': [{'usuarios_hasta': 5, 'monto_uf': 1}], 'dias_prueba': 0},
])
def test_rechaza_escalas_invalidas(client, sa, cuerpo):
    antes = pagina(client)
    assert client.put('/api/super-admin/tramos', headers=sa, json=cuerpo).status_code == 400
    assert pagina(client) == antes


def test_solo_super_admin(client):
    h = login(client, 'admin@sanpatricio.cl', 'admin123')
    r = client.put('/api/super-admin/tramos', headers=h, json={'tramos': [{'usuarios_hasta': 5, 'monto_uf': 1}]})
    assert r.status_code in (401, 403)
