"""Estado de las funciones con IA.

Sirve para responder, desde la propia plataforma, una pregunta que antes
obligaba a revisar el servidor: ¿la IA está operativa? Cargar saldo en la
cuenta de Anthropic y configurar la variable donde corre la plataforma son
dos cosas distintas, y la segunda es la que suele faltar.
"""
from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt

from servicios import ia

ia_bp = Blueprint('ia', __name__)

# Qué usa IA y qué pasa si no está. Se devuelve junto al estado para que la
# pantalla pueda decir qué se pierde, en vez de solo «no disponible».
FUNCIONES = [
    {'clave': 'sugerencia_carga',
     'nombre': 'Sugerir reparto de horas',
     'donde': 'Carga Académica',
     'sin_ia': 'El reparto automático sigue funcionando con los criterios por '
               'defecto; lo que se pierde es escribir las indicaciones en '
               'lenguaje natural.'},
    {'clave': 'convivencia_imagen',
     'nombre': 'Leer un caso desde una foto',
     'donde': 'Convivencia Escolar',
     'sin_ia': 'Hay que escribir el caso a mano.'},
    {'clave': 'ocr_anotaciones',
     'nombre': 'Transcribir anotaciones del libro de clases',
     'donde': 'Escanear anotaciones',
     'sin_ia': 'La pantalla no funciona sin IA.'},
]


@ia_bp.route('/estado', methods=['GET'])
@jwt_required()
def estado():
    """Hace una petición real y mínima al modelo, no solo mira la variable."""
    if get_jwt().get('role') not in ('admin', 'directivo', 'super_admin'):
        return jsonify({'error': 'Acceso denegado'}), 403

    d = ia.diagnostico()
    d['funciones'] = FUNCIONES
    # 200 siempre: que la IA esté caída es información, no un fallo de esta
    # consulta, y un 503 haría que el frontend lo trate como error de red.
    return jsonify(d), 200
