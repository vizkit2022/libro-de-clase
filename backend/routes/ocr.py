import os
import base64
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from models import db, Annotation, User, Course, Enrollment
from datetime import date

ocr_bp = Blueprint('ocr', __name__)


def get_anthropic_client():
    """Crea cliente Anthropic si hay API key disponible."""
    api_key = os.environ.get('ANTHROPIC_API_KEY', '')
    if not api_key:
        return None
    try:
        import anthropic
        return anthropic.Anthropic(api_key=api_key)
    except ImportError:
        return None


@ocr_bp.route('/transcribe', methods=['POST'])
@jwt_required()
def transcribe_image():
    """
    Recibe una imagen del libro de clases (base64) y la transcribe usando Claude Vision.
    Retorna las anotaciones detectadas para que el profesor las revise antes de guardar.
    """
    claims = get_jwt()
    role = claims.get('role')
    if role not in ('admin', 'directivo', 'profesor'):
        return jsonify({'error': 'Sin permisos'}), 403

    data = request.get_json()
    image_data = data.get('image')   # base64 string (sin prefijo data:image/...)
    image_type = data.get('image_type', 'jpeg')  # jpeg, png, webp

    if not image_data:
        return jsonify({'error': 'Se requiere una imagen'}), 400

    client = get_anthropic_client()
    if not client:
        return jsonify({
            'error': 'API key de Anthropic no configurada',
            'hint': 'Configura la variable de entorno ANTHROPIC_API_KEY en el archivo .env del backend'
        }), 503

    try:
        # Prompt especializado para libros de clases chilenos
        prompt = """Eres un asistente especializado en transcribir libros de clases de colegios chilenos.

Analiza esta imagen del libro de clases y extrae TODAS las anotaciones que encuentres.

Para cada anotación identificada, proporciona la siguiente información en formato JSON:

{
  "anotaciones": [
    {
      "titulo": "Título breve de la anotación (máx 80 caracteres)",
      "descripcion": "Descripción completa del texto transcrito",
      "tipo": "positiva | negativa | neutral | academica",
      "alumno_nombre": "Nombre del alumno si se menciona, o null",
      "fecha_texto": "Fecha que aparece en el texto si se menciona, o null"
    }
  ],
  "texto_completo": "Todo el texto visible en la imagen, transcrito tal cual",
  "observaciones": "Comentarios sobre la calidad de la imagen o dificultades de lectura"
}

Criterios para clasificar el tipo:
- "positiva": felicitaciones, reconocimientos, buena conducta, participación destacada, logros
- "negativa": mala conducta, atrasos, faltas, incumplimientos, sanciones
- "academica": tareas, rendimiento académico, notas, materias
- "neutral": informaciones generales, comunicaciones a apoderados, otros

Si el texto es ilegible o la imagen no corresponde a un libro de clases, indica en "observaciones" y devuelve "anotaciones": [].

IMPORTANTE: Responde SOLO con el JSON válido, sin explicaciones adicionales."""

        response = client.messages.create(
            model='claude-opus-4-6',
            max_tokens=2048,
            messages=[
                {
                    'role': 'user',
                    'content': [
                        {
                            'type': 'image',
                            'source': {
                                'type': 'base64',
                                'media_type': f'image/{image_type}',
                                'data': image_data,
                            },
                        },
                        {
                            'type': 'text',
                            'text': prompt
                        }
                    ],
                }
            ],
        )

        # Parsear respuesta JSON
        import json
        raw_text = response.content[0].text.strip()

        # Limpiar posibles bloques markdown
        if raw_text.startswith('```'):
            lines = raw_text.split('\n')
            raw_text = '\n'.join(lines[1:-1])

        result = json.loads(raw_text)
        return jsonify(result), 200

    except Exception as e:
        return jsonify({
            'error': f'Error al procesar la imagen: {str(e)}'
        }), 500


@ocr_bp.route('/save', methods=['POST'])
@jwt_required()
def save_annotations():
    """
    Guarda en la BD las anotaciones confirmadas por el profesor.
    Espera: student_id, course_id, anotaciones: [{titulo, descripcion, tipo, fecha}]
    """
    claims = get_jwt()
    role = claims.get('role')
    school_id = claims.get('school_id')
    current_user_id = int(claims.get('sub', 0))

    if role not in ('admin', 'directivo', 'profesor'):
        return jsonify({'error': 'Sin permisos'}), 403

    data = request.get_json()
    student_id = data.get('student_id')
    course_id = data.get('course_id')
    anotaciones = data.get('anotaciones', [])

    if not student_id or not course_id:
        return jsonify({'error': 'Se requiere student_id y course_id'}), 400

    # Validar que el alumno pertenece al colegio
    student = User.query.filter_by(id=student_id, school_id=school_id, role='alumno').first_or_404()
    course = Course.query.filter_by(id=course_id, school_id=school_id).first_or_404()

    saved = []
    for ann_data in anotaciones:
        titulo = ann_data.get('titulo', '').strip()
        descripcion = ann_data.get('descripcion', '').strip()
        tipo = ann_data.get('tipo', 'neutral')
        fecha_str = ann_data.get('fecha')

        if not titulo or not descripcion:
            continue

        # Parsear fecha si viene
        try:
            from datetime import datetime
            ann_date = datetime.strptime(fecha_str, '%Y-%m-%d').date() if fecha_str else date.today()
        except Exception:
            ann_date = date.today()

        ann = Annotation(
            student_id=student.id,
            course_id=course.id,
            annotation_type=tipo if tipo in ('positiva', 'negativa', 'neutral', 'academica') else 'neutral',
            title=titulo[:200],
            description=descripcion,
            date=ann_date,
            created_by=current_user_id
        )
        db.session.add(ann)
        saved.append(ann)

    db.session.commit()
    return jsonify({
        'message': f'{len(saved)} anotación(es) guardada(s) exitosamente',
        'saved_count': len(saved)
    }), 201
