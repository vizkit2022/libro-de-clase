from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from models import db, User, School
from datetime import datetime, timedelta
from servicios.auditoria import registrar_login

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'}), 200

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').lower().strip()
    password = data.get('password') or ''

    if not email or not password:
        registrar_login(email=email, ok=False, motivo='Faltan email o contraseña',
                        status_code=400)
        return jsonify({'error': 'Email y contraseña requeridos'}), 400

    user = User.query.filter_by(email=email, is_active=True).first()
    if not user or not user.check_password(password):
        # Auditoría: se guarda el email intentado (y el colegio si la cuenta
        # existe), nunca la contraseña
        cuenta = user or User.query.filter_by(email=email).first()
        if cuenta is None:
            motivo = 'Email no registrado'
        elif not cuenta.is_active:
            motivo = 'Cuenta desactivada'
        else:
            motivo = 'Contraseña incorrecta'
        registrar_login(cuenta, email=email, ok=False, motivo=motivo, status_code=401)
        return jsonify({'error': 'Credenciales inválidas'}), 401

    user.last_login = datetime.utcnow()
    db.session.commit()
    registrar_login(user, email=email, ok=True)

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


@auth_bp.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    """El JWT no se invalida en el servidor; el endpoint deja el cierre en la auditoría."""
    return jsonify({'message': 'Sesión cerrada'}), 200


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

    nueva = data.get('new_password') or ''
    if len(nueva) < 6:
        return jsonify({'error': 'La nueva contraseña debe tener al menos 6 '
                                 'caracteres'}), 400

    user.set_password(nueva)
    # Si venía con clave temporal del asistente, ya cumplió su propósito
    user.debe_cambiar_clave = False
    db.session.commit()
    return jsonify({'message': 'Contraseña actualizada'}), 200
