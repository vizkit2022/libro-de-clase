"""
Rutas exclusivas del Super Administrador.
Permiten gestionar todos los colegios, sus planes y suscripciones.
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from models import db, School, User, Subscription, Period
from datetime import datetime, timedelta, date
from functools import wraps

super_admin_bp = Blueprint('super_admin', __name__)


def require_super_admin(fn):
    """Decorador: solo permite acceso al rol super_admin."""
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        claims = get_jwt()
        if claims.get('role') != 'super_admin':
            return jsonify({'error': 'Acceso denegado. Se requiere rol super_admin.'}), 403
        return fn(*args, **kwargs)
    return wrapper


# ── Estadísticas globales ────────────────────────────────────────────────────
@super_admin_bp.route('/stats', methods=['GET'])
@require_super_admin
def get_stats():
    total_schools = School.query.count()
    active_schools = School.query.filter_by(is_active=True).count()
    paid_schools = School.query.filter_by(plan='paid', plan_status='active').count()
    free_schools = School.query.filter_by(plan='free').count()
    total_users = User.query.filter(User.role != 'super_admin').count()
    active_subscriptions = Subscription.query.filter_by(status='authorized').count()

    return jsonify({
        'total_schools': total_schools,
        'active_schools': active_schools,
        'paid_schools': paid_schools,
        'free_schools': free_schools,
        'total_users': total_users,
        'active_subscriptions': active_subscriptions,
    }), 200


# ── Gestión de Colegios ──────────────────────────────────────────────────────
@super_admin_bp.route('/schools', methods=['GET'])
@require_super_admin
def list_schools():
    schools = School.query.order_by(School.created_at.desc()).all()
    return jsonify([s.to_dict() for s in schools]), 200


@super_admin_bp.route('/schools', methods=['POST'])
@require_super_admin
def create_school():
    data = request.get_json()
    if not data.get('name'):
        return jsonify({'error': 'El nombre del colegio es requerido'}), 400

    # Verificar RUT duplicado
    if data.get('rut'):
        existing = School.query.filter_by(rut=data['rut']).first()
        if existing:
            return jsonify({'error': 'Ya existe un colegio con ese RUT'}), 409

    plan = data.get('plan', 'free')

    school = School(
        name=data['name'],
        rut=data.get('rut'),
        address=data.get('address'),
        phone=data.get('phone'),
        email=data.get('email'),
        website=data.get('website'),
        rector=data.get('rector'),
        primary_color=data.get('primary_color', '#2563EB'),
        secondary_color=data.get('secondary_color', '#1E40AF'),
        accent_color=data.get('accent_color', '#3B82F6'),
        plan=plan,
        plan_status='active',
        is_active=True,
    )

    # Si es de pago, marcar vencimiento inicial (sin suscripción activa aún)
    if plan == 'paid':
        school.subscription_expires_at = datetime.utcnow() + timedelta(days=30)

    db.session.add(school)
    db.session.flush()

    # Crear admin inicial del colegio si se proporcionan datos
    admin_email = data.get('admin_email')
    admin_password = data.get('admin_password', 'colegio123')
    if admin_email:
        admin = User(
            school_id=school.id,
            email=admin_email,
            first_name=data.get('admin_first_name', 'Administrador'),
            last_name=data.get('admin_last_name', school.name),
            role='admin',
        )
        admin.set_password(admin_password)
        db.session.add(admin)

    db.session.commit()

    # Crear 2 períodos por defecto (en transacción separada para no bloquear la creación)
    try:
        _create_default_periods(school.id)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"[warn] No se pudieron crear períodos para colegio {school.id}: {e}")

    return jsonify(school.to_dict()), 201


def _create_default_periods(school_id):
    """Crea Semestre 1 y Semestre 2 para el año actual si no existen."""
    year = datetime.utcnow().year
    existing = Period.query.filter_by(school_id=school_id, year=year).count()
    if existing > 0:
        return
    periods = [
        Period(school_id=school_id, name=f'Semestre 1 {year}', period_type='semestral',
               year=year, number=1, is_active=True,
               start_date=date(year, 3, 1), end_date=date(year, 7, 31)),
        Period(school_id=school_id, name=f'Semestre 2 {year}', period_type='semestral',
               year=year, number=2, is_active=True,
               start_date=date(year, 8, 1), end_date=date(year, 12, 31)),
    ]
    for p in periods:
        db.session.add(p)


@super_admin_bp.route('/schools/<int:school_id>', methods=['GET'])
@require_super_admin
def get_school(school_id):
    school = School.query.get_or_404(school_id)
    data = school.to_dict()
    # Incluir últimas suscripciones
    subs = Subscription.query.filter_by(school_id=school_id).order_by(Subscription.created_at.desc()).limit(5).all()
    data['subscriptions'] = [s.to_dict() for s in subs]
    return jsonify(data), 200


@super_admin_bp.route('/schools/<int:school_id>', methods=['PUT'])
@require_super_admin
def update_school(school_id):
    school = School.query.get_or_404(school_id)
    data = request.get_json()

    for field in ['name', 'rut', 'address', 'phone', 'email', 'website',
                  'rector', 'primary_color', 'secondary_color', 'accent_color',
                  'is_active', 'plan', 'plan_status']:
        if field in data:
            setattr(school, field, data[field])

    if 'subscription_expires_at' in data and data['subscription_expires_at']:
        school.subscription_expires_at = datetime.fromisoformat(data['subscription_expires_at'])

    db.session.commit()
    return jsonify(school.to_dict()), 200


@super_admin_bp.route('/schools/<int:school_id>/toggle-active', methods=['POST'])
@require_super_admin
def toggle_school_active(school_id):
    school = School.query.get_or_404(school_id)
    school.is_active = not school.is_active
    db.session.commit()
    return jsonify({'is_active': school.is_active, 'message': f"Colegio {'activado' if school.is_active else 'desactivado'}"}), 200


@super_admin_bp.route('/schools/<int:school_id>/set-plan', methods=['POST'])
@require_super_admin
def set_school_plan(school_id):
    """Cambia manualmente el plan de un colegio (útil para pruebas o ajustes manuales)."""
    school = School.query.get_or_404(school_id)
    data = request.get_json()
    plan = data.get('plan', 'free')
    months = data.get('months', 1)

    school.plan = plan
    school.plan_status = 'active'
    if plan == 'paid':
        school.subscription_expires_at = datetime.utcnow() + timedelta(days=30 * months)
    else:
        school.subscription_expires_at = None

    db.session.commit()
    return jsonify(school.to_dict()), 200


# ── Gestión de Suscripciones ─────────────────────────────────────────────────
@super_admin_bp.route('/subscriptions', methods=['GET'])
@require_super_admin
def list_subscriptions():
    subs = Subscription.query.order_by(Subscription.created_at.desc()).all()
    return jsonify([s.to_dict() for s in subs]), 200


@super_admin_bp.route('/subscriptions/<int:sub_id>', methods=['GET'])
@require_super_admin
def get_subscription(sub_id):
    sub = Subscription.query.get_or_404(sub_id)
    return jsonify(sub.to_dict()), 200


# ── Gestión de Super Admins ──────────────────────────────────────────────────
@super_admin_bp.route('/admins', methods=['GET'])
@require_super_admin
def list_super_admins():
    admins = User.query.filter_by(role='super_admin').all()
    return jsonify([a.to_dict() for a in admins]), 200


@super_admin_bp.route('/admins', methods=['POST'])
@require_super_admin
def create_super_admin():
    data = request.get_json()
    if not data.get('email') or not data.get('password'):
        return jsonify({'error': 'Email y contraseña son requeridos'}), 400

    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'Ya existe un usuario con ese email'}), 409

    admin = User(
        school_id=None,
        email=data['email'].lower().strip(),
        first_name=data.get('first_name', 'Super'),
        last_name=data.get('last_name', 'Admin'),
        role='super_admin',
    )
    admin.set_password(data['password'])
    db.session.add(admin)
    db.session.commit()
    return jsonify(admin.to_dict()), 201


@super_admin_bp.route('/schools/<int:school_id>/ensure-periods', methods=['POST'])
@require_super_admin
def ensure_periods(school_id):
    """Crea períodos por defecto en un colegio que no los tiene."""
    School.query.get_or_404(school_id)
    _create_default_periods(school_id)
    db.session.commit()
    periods = Period.query.filter_by(school_id=school_id).all()
    return jsonify([p.to_dict() for p in periods]), 200


@super_admin_bp.route('/schools/ensure-all-periods', methods=['POST'])
@require_super_admin
def ensure_all_periods():
    """Crea períodos por defecto en TODOS los colegios que no los tengan."""
    schools = School.query.all()
    updated = []
    for s in schools:
        year = datetime.utcnow().year
        existing = Period.query.filter_by(school_id=s.id, year=year).count()
        if existing == 0:
            _create_default_periods(s.id)
            updated.append(s.name)
    db.session.commit()
    return jsonify({'updated': updated, 'count': len(updated)}), 200


@super_admin_bp.route('/schools/<int:school_id>/create-user', methods=['POST'])
@require_super_admin
def create_user_for_school(school_id):
    """Crea un usuario en cualquier colegio (solo super_admin)."""
    School.query.get_or_404(school_id)
    data = request.get_json()
    if not data.get('email') or not data.get('password'):
        return jsonify({'error': 'Email y contraseña son requeridos'}), 400
    if User.query.filter_by(email=data['email'].lower().strip()).first():
        return jsonify({'error': 'Ya existe un usuario con ese email'}), 409
    user = User(
        school_id=school_id,
        email=data['email'].lower().strip(),
        first_name=data.get('first_name', 'Usuario'),
        last_name=data.get('last_name', ''),
        role=data.get('role', 'admin'),
        phone=data.get('phone'),
        rut=data.get('rut'),
    )
    user.set_password(data['password'])
    db.session.add(user)
    db.session.commit()
    return jsonify(user.to_dict()), 201


@super_admin_bp.route('/schools/seed-franz-liszt', methods=['POST'])
@require_super_admin
def seed_franz_liszt():
    """Crea el colegio Franz Liszt si no existe."""
    from datetime import date as date_cls
    existing = School.query.filter(School.name.ilike('%franz liszt%')).first()
    if existing:
        return jsonify({'message': 'Ya existe', 'school': existing.to_dict()}), 200

    school = School(
        name='Colegio Franz Liszt',
        plan='free', plan_status='active', is_active=True,
        primary_color='#2563EB', secondary_color='#1E40AF', accent_color='#3B82F6',
    )
    db.session.add(school)
    db.session.flush()
    _create_default_periods(school.id)
    db.session.commit()
    return jsonify({'message': 'Creado', 'school': school.to_dict()}), 201
