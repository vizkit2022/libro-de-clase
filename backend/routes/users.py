from flask import Blueprint, request, jsonify, Response
from flask_jwt_extended import jwt_required, get_jwt
from models import db, User, School, StudentGuardian
from functools import wraps
import base64

users_bp = Blueprint('users', __name__)

def require_roles(*roles):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            claims = get_jwt()
            if claims.get('role') not in roles:
                return jsonify({'error': 'Sin permisos'}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator

@users_bp.route('/', methods=['GET'])
@jwt_required()
def get_users():
    claims = get_jwt()
    school_id = claims.get('school_id')
    role_filter = request.args.get('role')
    query = User.query.filter_by(school_id=school_id)
    if role_filter:
        query = query.filter_by(role=role_filter)
    users = query.order_by(User.last_name).all()
    return jsonify([u.to_dict() for u in users]), 200

@users_bp.route('/<int:user_id>', methods=['GET'])
@jwt_required()
def get_user(user_id):
    claims = get_jwt()
    school_id = claims.get('school_id')
    user = User.query.filter_by(id=user_id, school_id=school_id).first_or_404()
    return jsonify(user.to_dict()), 200

@users_bp.route('/', methods=['POST'])
@jwt_required()
@require_roles('admin', 'directivo')
def create_user():
    claims = get_jwt()
    school_id = claims.get('school_id')
    data = request.get_json()

    if User.query.filter_by(email=data['email'].lower()).first():
        return jsonify({'error': 'El email ya está registrado'}), 400

    user = User(
        school_id=school_id,
        email=data['email'].lower().strip(),
        first_name=data['first_name'],
        last_name=data['last_name'],
        rut=data.get('rut'),
        phone=data.get('phone'),
        address=data.get('address'),
        gender=data.get('gender'),
        role=data.get('role', 'alumno'),
        is_active=data.get('is_active', True)
    )
    if data.get('birth_date'):
        from datetime import date
        user.birth_date = date.fromisoformat(data['birth_date'])
    user.set_password(data.get('password', 'Colegio2024!'))
    db.session.add(user)
    db.session.commit()
    return jsonify(user.to_dict()), 201

@users_bp.route('/<int:user_id>', methods=['PUT'])
@jwt_required()
def update_user(user_id):
    claims = get_jwt()
    school_id = claims.get('school_id')
    current_user_id = int(get_jwt()['sub'] if 'sub' in get_jwt() else 0)

    user = User.query.filter_by(id=user_id, school_id=school_id).first_or_404()
    data = request.get_json()

    for field in ['first_name', 'last_name', 'rut', 'phone', 'address', 'gender', 'avatar_url']:
        if field in data:
            setattr(user, field, data[field])
    if 'birth_date' in data and data['birth_date']:
        from datetime import date
        user.birth_date = date.fromisoformat(data['birth_date'])
    if 'role' in data and claims.get('role') in ['admin', 'directivo']:
        user.role = data['role']
    if 'is_active' in data and claims.get('role') in ['admin', 'directivo']:
        user.is_active = data['is_active']
    if 'password' in data and data['password']:
        user.set_password(data['password'])

    db.session.commit()
    return jsonify(user.to_dict()), 200

@users_bp.route('/<int:user_id>', methods=['DELETE'])
@jwt_required()
@require_roles('admin')
def delete_user(user_id):
    claims = get_jwt()
    school_id = claims.get('school_id')
    user = User.query.filter_by(id=user_id, school_id=school_id).first_or_404()
    user.is_active = False
    db.session.commit()
    return jsonify({'message': 'Usuario desactivado'}), 200

# ── Apoderado ↔ Alumnos ──────────────────────────────────────────────

@users_bp.route('/<int:user_id>/students', methods=['GET'])
@jwt_required()
def get_guardian_students(user_id):
    claims = get_jwt()
    school_id = claims.get('school_id')
    current_user_id = int(claims.get('sub', 0))
    current_role = claims.get('role')

    # El apoderado solo puede ver sus propios alumnos
    if current_role == 'apoderado' and current_user_id != user_id:
        return jsonify({'error': 'Sin permisos'}), 403

    relations = StudentGuardian.query.filter_by(guardian_id=user_id).all()
    students = []
    for r in relations:
        s = User.query.filter_by(id=r.student_id, school_id=school_id).first()
        if s:
            d = s.to_dict()
            d['relationship'] = r.relationship
            students.append(d)
    return jsonify(students), 200

@users_bp.route('/<int:user_id>/students', methods=['POST'])
@jwt_required()
@require_roles('admin', 'directivo')
def set_guardian_students(user_id):
    """Reemplaza todos los alumnos asignados al apoderado."""
    claims = get_jwt()
    school_id = claims.get('school_id')
    data = request.get_json()
    student_ids = data.get('student_ids', [])

    # Verificar que el usuario es apoderado
    guardian = User.query.filter_by(id=user_id, school_id=school_id, role='apoderado').first_or_404()

    # Borrar relaciones anteriores
    StudentGuardian.query.filter_by(guardian_id=user_id).delete()

    # Crear nuevas relaciones
    for sid in student_ids:
        student = User.query.filter_by(id=sid, school_id=school_id, role='alumno').first()
        if student:
            rel = StudentGuardian(
                guardian_id=user_id,
                student_id=sid,
                relationship=data.get('relationship', 'apoderado')
            )
            db.session.add(rel)

    db.session.commit()
    return jsonify({'message': f'{len(student_ids)} alumno(s) asignado(s)'}), 200


# ── Foto de perfil ────────────────────────────────────────────────────────

@users_bp.route('/<int:user_id>/photo', methods=['GET'])
def get_user_photo(user_id):
    """Sirve la foto de perfil como imagen binaria (sin autenticación, para usar como <img src>)."""
    user = User.query.filter_by(id=user_id).first()
    if not user or not user.photo:
        return jsonify({'error': 'Sin foto'}), 404

    try:
        # El photo viene como data URL: "data:image/jpeg;base64,/9j/..."
        if ',' in user.photo:
            header, b64data = user.photo.split(',', 1)
            # Extraer content-type: "data:image/jpeg;base64" → "image/jpeg"
            mime = header.replace('data:', '').replace(';base64', '')
        else:
            b64data = user.photo
            mime = 'image/jpeg'

        img_bytes = base64.b64decode(b64data)
        return Response(
            img_bytes,
            mimetype=mime,
            headers={
                'Cache-Control': 'public, max-age=86400',  # cache 1 día
                'Content-Length': str(len(img_bytes))
            }
        )
    except Exception:
        return jsonify({'error': 'Error al procesar foto'}), 500


@users_bp.route('/<int:user_id>/photo', methods=['PUT'])
@jwt_required()
def update_user_photo(user_id):
    """Actualiza la foto de perfil. Acepta base64 data URL."""
    claims = get_jwt()
    school_id = claims.get('school_id')
    current_user_id = int(claims.get('sub', 0))
    current_role = claims.get('role')

    # Solo admin/directivo puede cambiar foto de otros. Cualquiera puede cambiar la suya.
    if current_user_id != user_id and current_role not in ('admin', 'directivo'):
        return jsonify({'error': 'Sin permisos'}), 403

    user = User.query.filter_by(id=user_id, school_id=school_id).first_or_404()
    data = request.get_json()
    photo = data.get('photo')

    if photo is None:
        # Eliminar foto
        user.photo = None
    else:
        # Validar tamaño máximo (~2MB en base64 ≈ ~1.5MB de imagen)
        if len(photo) > 2_500_000:
            return jsonify({'error': 'La foto es demasiado grande (máx 2MB)'}), 400
        user.photo = photo

    db.session.commit()
    return jsonify({'message': 'Foto actualizada', 'has_photo': bool(user.photo)}), 200
