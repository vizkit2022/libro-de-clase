"""La sugerencia no debe pisar lo que ya se asignó a mano.

Es la garantía que más importa del botón: si borrara el trabajo hecho,
nadie lo usaría dos veces.
"""
import os
import sys
import tempfile

import pytest

os.environ.setdefault('JWT_SECRET_KEY', 'test')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture()
def cliente():
    os.environ['DATABASE_URL'] = 'sqlite:///' + tempfile.mktemp(suffix='.db')
    os.environ.pop('ANTHROPIC_API_KEY', None)   # el solver debe bastarse solo
    from app import create_app
    from models import School
    from flask_jwt_extended import create_access_token

    app = create_app()
    c = app.test_client()
    with app.app_context():
        sid = School.query.first().id
        token = create_access_token(identity='1',
                                    additional_claims={'school_id': sid, 'role': 'admin'})
    c.environ_base['HTTP_AUTHORIZATION'] = f'Bearer {token}'

    c.post('/api/carga-academica/seed-lenguaje', json={'year': 2026})
    c.post('/api/carga-academica/procesos/iniciar',
           json={'year_origen': 2026, 'year_destino': 2027, 'copiar_distribucion': False})
    return c


def _docente(c, nombre):
    datos = c.get('/api/carga-academica/dashboard?year=2027').get_json()
    return next(x['id'] for x in datos['docentes'] if x['nombre'] == nombre)


def _demanda(c, asignatura, nivel):
    filas = c.get('/api/carga-academica/demanda?year=2027').get_json()
    return next(x for x in filas
                if x['asignatura'] == asignatura and x['nivel'] == nivel)


def test_completar_conserva_lo_asignado_a_mano(cliente):
    karla = _docente(cliente, 'Karla Neculqueo')
    fila = _demanda(cliente, 'Lengua y Literatura', 'I Medio')
    cliente.post(f'/api/carga-academica/docentes/{karla}/asignaciones',
                 json={'tipo': 'asignatura', 'demanda_id': fila['id'],
                       'letras': 'A,B', 'horas': 12})

    prop = cliente.post('/api/carga-academica/procesos/2027/sugerir', json={}).get_json()
    assert prop['modo'] == 'completar'

    # Nadie recibe de nuevo los cursos que Karla ya tiene
    nuevas = [f for p in prop['propuesta'] for f in p['filas']
              if not f.get('existente') and f.get('demanda_id') == fila['id']]
    for f in nuevas:
        assert set((f['letras'] or '').split(',')) & {'A', 'B'} == set()

    cliente.post('/api/carga-academica/procesos/2027/aplicar-sugerencia',
                 json={'propuesta': prop['propuesta'], 'modo': 'completar'})

    suyas = [a for a in cliente.get(f'/api/carga-academica/docentes/{karla}')
             .get_json()['asignaciones'] if a['demanda_id'] == fila['id']]
    assert any(a['letras'] == 'A,B' and a['horas'] == 12 for a in suyas)


def test_el_reparto_respeta_las_reglas_duras(cliente):
    prop = cliente.post('/api/carga-academica/procesos/2027/sugerir',
                        json={'rotar_niveles': True}).get_json()
    cliente.post('/api/carga-academica/procesos/2027/aplicar-sugerencia',
                 json={'propuesta': prop['propuesta']})

    cob = cliente.get('/api/carga-academica/demanda/cobertura?year=2027').get_json()
    assert [c for c in cob if c['estado'] == 'sobreasignada'] == []
    assert [c['asignatura'] for c in cob if c['letras_en_conflicto']] == []

    tablero = cliente.get('/api/carga-academica/dashboard?year=2027').get_json()
    assert [d['nombre'] for d in tablero['docentes'] if d['excede_disponibilidad']] == []
    assert tablero['resumen']['total_asignado'] == tablero['resumen']['total_demanda']


def test_rehacer_sí_reemplaza(cliente):
    karla = _docente(cliente, 'Karla Neculqueo')
    fila = _demanda(cliente, 'Lengua y Literatura', 'I Medio')
    cliente.post(f'/api/carga-academica/docentes/{karla}/asignaciones',
                 json={'tipo': 'asignatura', 'demanda_id': fila['id'],
                       'letras': 'A,B', 'horas': 12})
    antes = len(cliente.get(f'/api/carga-academica/docentes/{karla}')
                .get_json()['asignaciones'])

    prop = cliente.post('/api/carga-academica/procesos/2027/sugerir',
                        json={'modo': 'rehacer'}).get_json()
    assert prop['modo'] == 'rehacer'
    # En rehacer no se arrastra nada como existente
    assert all(not f.get('existente') for p in prop['propuesta'] for f in p['filas'])

    r = cliente.post('/api/carga-academica/procesos/2027/aplicar-sugerencia',
                     json={'propuesta': prop['propuesta'], 'modo': 'rehacer'}).get_json()
    assert r['filas_reemplazadas'] >= antes - 1
