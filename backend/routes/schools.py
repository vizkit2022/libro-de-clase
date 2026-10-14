import base64
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from models import db, School

schools_bp = Blueprint('schools', __name__)

@schools_bp.route('/', methods=['GET'])
@jwt_required()
def get_schools():
    claims = get_jwt()
    if claims.get('role') == 'admin' and request.args.get('all'):
        schools = School.query.all()
    else:
        school = School.query.get(claims.get('school_id'))
        schools = [school] if school else []
    return jsonify([s.to_dict() for s in schools]), 200

@schools_bp.route('/<int:school_id>', methods=['GET'])
@jwt_required()
def get_school(school_id):
    school = School.query.get_or_404(school_id)
    return jsonify(school.to_dict()), 200

@schools_bp.route('/', methods=['POST'])
@jwt_required()
def create_school():
    claims = get_jwt()
    if claims.get('role') != 'admin':
        return jsonify({'error': 'Solo administradores pueden crear colegios'}), 403
    data = request.get_json()
    school = School(
        name=data['name'], rut=data.get('rut'),
        address=data.get('address'), phone=data.get('phone'),
        email=data.get('email'), website=data.get('website'),
        rector=data.get('rector'), subtitulo=data.get('subtitulo'),
        primary_color=data.get('primary_color', '#2563EB'),
        secondary_color=data.get('secondary_color', '#1E40AF'),
        accent_color=data.get('accent_color', '#3B82F6')
    )
    db.session.add(school)
    db.session.commit()
    return jsonify(school.to_dict()), 201

# Largo máximo de cada columna de texto, y cómo se llama en pantalla.
# PostgreSQL rechaza un valor más largo que su VARCHAR y la petición muere
# con un 500 sin explicación; SQLite no lo valida, así que en local nunca se
# ve. Mejor avisar cuál campo se pasó y por cuánto.
LARGOS = {
    'name': (200, 'nombre del colegio'),
    'rut': (20, 'RUT'),
    'address': (300, 'dirección'),
    'phone': (50, 'teléfono'),
    'email': (100, 'correo'),
    'website': (200, 'sitio web'),
    'rector': (200, 'rector o director'),
    'subtitulo': (200, 'bajada institucional'),
    'primary_color': (7, 'color principal'),
    'secondary_color': (7, 'color secundario'),
    'accent_color': (7, 'color de acento'),
}


@schools_bp.route('/<int:school_id>', methods=['PUT'])
@jwt_required()
def update_school(school_id):
    claims = get_jwt()
    if claims.get('role') not in ['admin', 'directivo', 'super_admin']:
        return jsonify({'error': 'Sin permisos'}), 403
    school = School.query.get_or_404(school_id)
    data = request.get_json() or {}

    for campo, (tope, etiqueta) in LARGOS.items():
        valor = data.get(campo)
        if isinstance(valor, str) and len(valor.strip()) > tope:
            return jsonify({
                'error': f'El {etiqueta} tiene {len(valor.strip())} caracteres '
                         f'y el máximo son {tope}.'
            }), 400

    for field in ['name', 'rut', 'address', 'phone', 'email', 'website',
                  'rector', 'subtitulo', 'logo_url', 'primary_color',
                  'secondary_color', 'accent_color']:
        if field in data:
            valor = data[field]
            # Los vacíos se guardan como NULL y no como cadena vacía: así
            # «falta el rector» es una sola condición y no dos.
            if isinstance(valor, str):
                valor = valor.strip() or None
            setattr(school, field, valor)

    if not (school.name or '').strip():
        return jsonify({'error': 'El colegio necesita un nombre'}), 400

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'No se pudo guardar',
                        'detalle': str(e)[:180]}), 400
    return jsonify(school.to_dict()), 200


@schools_bp.route('/<int:school_id>/upload-logo', methods=['POST'])
@jwt_required()
def upload_logo(school_id):
    claims = get_jwt()
    # El super_admin también administra colegios desde su panel
    if claims.get('role') not in ['admin', 'directivo', 'super_admin']:
        return jsonify({'error': 'Sin permisos'}), 403
    school = School.query.get_or_404(school_id)

    file = request.files.get('logo')
    if not file:
        return jsonify({'error': 'No se envió ningún archivo'}), 400

    raw = file.read()
    if not raw:
        return jsonify({'error': 'El archivo está vacío'}), 400

    MAX_BYTES = 2 * 1024 * 1024
    if len(raw) > MAX_BYTES:
        return jsonify({'error': f'El logo pesa {len(raw) // 1024} KB. '
                                 f'El máximo es {MAX_BYTES // 1024} KB.'}), 400

    mime = file.content_type or 'image/png'
    if not mime.startswith('image/'):
        return jsonify({'error': f'El archivo debe ser una imagen (llegó {mime})'}), 400

    # Se guarda como data URL para no depender del sistema de archivos
    data = base64.b64encode(raw).decode('utf-8')
    logo_url = f"data:{mime};base64,{data}"

    school.logo_url = logo_url
    db.session.commit()
    return jsonify({'logo_url': logo_url}), 200
