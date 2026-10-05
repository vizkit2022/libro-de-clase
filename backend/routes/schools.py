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

@schools_bp.route('/<int:school_id>', methods=['PUT'])
@jwt_required()
def update_school(school_id):
    claims = get_jwt()
    if claims.get('role') not in ['admin', 'directivo']:
        return jsonify({'error': 'Sin permisos'}), 403
    school = School.query.get_or_404(school_id)
    data = request.get_json()
    for field in ['name', 'rut', 'address', 'phone', 'email', 'website',
                  'rector', 'subtitulo', 'logo_url', 'primary_color', 'secondary_color', 'accent_color']:
        if field in data:
            setattr(school, field, data[field])
    db.session.commit()
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
