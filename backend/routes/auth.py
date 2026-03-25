from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from models import db, User, School
from datetime import datetime, timedelta

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'}), 200

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email', '').lower().strip()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': 'Email y contraseña requeridos'}), 400

    user = User.query.filter_by(email=email, is_active=True).first()
    if not user or not user.check_password(password):
        return jsonify({'error': 'Credenciales inválidas'}), 401

    user.last_login = datetime.utcnow()
    db.session.commit()

    token = create_access_token(
        identity=str(user.id),
        additional_claims={
            'role': user.role,
            'school_id': user.school_id  # None para super_admin
        },
        expires_delta=timedelta(hours=12)
    )

    school = School.query.get(user.school_id) if user.school_id else None

    return jsonify({
        'access_token': token,
        'user': user.to_dict(),
        'school': school.to_dict() if school else None
    }), 200


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def get_me():
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    if not user:
        return jsonify({'error': 'Usuario no encontrado'}), 404
    school = School.query.get(user.school_id) if user.school_id else None
    return jsonify({'user': user.to_dict(), 'school': school.to_dict() if school else None}), 200


@auth_bp.route('/change-password', methods=['POST'])
@jwt_required()
def change_password():
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    data = request.get_json()

    if not user.check_password(data.get('current_password', '')):
        return jsonify({'error': 'Contraseña actual incorrecta'}), 400

    user.set_password(data.get('new_password', ''))
    db.session.commit()
    return jsonify({'message': 'Contraseña actualizada'}), 200
