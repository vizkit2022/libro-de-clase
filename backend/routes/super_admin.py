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
        subtitulo=data.get('subtitulo'),
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

    # Usuarios del colegio. Solo los facturables van en la lista principal;
    # alumnos y apoderados se informan como total, no se enumeran.
    from models import ROLES_FACTURABLES
    usuarios = User.query.filter_by(school_id=school_id)\
        .order_by(User.role, User.last_name, User.first_name).all()
    data['usuarios'] = [{
        'id': u.id, 'nombre': f'{u.first_name} {u.last_name}',
        'email': u.email, 'rut': u.rut, 'role': u.role,
        'is_active': u.is_active, 'last_login': u.last_login.isoformat() if u.last_login else None,
    } for u in usuarios if u.role in ROLES_FACTURABLES]
    data['otros_usuarios'] = {
        'alumnos': sum(1 for u in usuarios if u.role == 'alumno' and u.is_active),
        'apoderados': sum(1 for u in usuarios if u.role == 'apoderado' and u.is_active),
    }
    return jsonify(data), 200


@super_admin_bp.route('/schools/<int:school_id>', methods=['PUT'])
@require_super_admin
def update_school(school_id):
    school = School.query.get_or_404(school_id)
    data = request.get_json()

    for field in ['name', 'rut', 'address', 'phone', 'email', 'website',
                  'rector', 'subtitulo', 'primary_color', 'secondary_color', 'accent_color',
                  'is_active', 'plan', 'plan_status']:
        if field in data:
            setattr(school, field, data[field])

    if 'subscription_expires_at' in data and data['subscription_expires_at']:
        school.subscription_expires_at = datetime.fromisoformat(data['subscription_expires_at'])

    db.session.commit()

    # Crear usuario admin adicional si se proporcionan datos
    admin_email = data.get('admin_email', '').strip()
    if admin_email:
        if User.query.filter_by(email=admin_email).first():
            return jsonify({'error': f'El email {admin_email} ya está registrado'}), 400
        admin = User(
            school_id=school.id,
            email=admin_email,
            first_name=data.get('admin_first_name', 'Administrador'),
            last_name=data.get('admin_last_name', school.name),
            role=data.get('admin_role', 'admin'),
        )
        admin.set_password(data.get('admin_password', 'colegio123'))
        db.session.add(admin)
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


# ══════════════════════════════════════════════════════════════════════
#  USUARIOS DE TODOS LOS COLEGIOS
#  El super admin administra a quienes operan la plataforma: directivos,
#  administradores y docentes. Alumnos y apoderados los maneja el colegio.
# ══════════════════════════════════════════════════════════════════════

ROLES_GESTIONABLES = ('admin', 'directivo', 'profesor')


@super_admin_bp.route('/usuarios', methods=['GET'])
@require_super_admin
def listar_usuarios():
    """Usuarios operativos, con su colegio. Filtrable por colegio, rol o texto."""
    from models import ROLES_FACTURABLES

    q = User.query.filter(User.role.in_(ROLES_FACTURABLES))

    if request.args.get('school_id'):
        q = q.filter(User.school_id == request.args.get('school_id', type=int))
    if request.args.get('role'):
        q = q.filter(User.role == request.args.get('role'))

    buscar = (request.args.get('buscar') or '').strip()
    if buscar:
        patron = f'%{buscar}%'
        q = q.filter(db.or_(User.first_name.ilike(patron),
                            User.last_name.ilike(patron),
                            User.email.ilike(patron)))

    usuarios = q.order_by(User.school_id, User.role, User.last_name).all()
    colegios = {s.id: s.name for s in School.query.all()}

    return jsonify([{
        'id': u.id, 'nombre': u.first_name, 'apellido': u.last_name,
        'email': u.email, 'rut': u.rut, 'telefono': u.phone,
        'role': u.role, 'is_active': u.is_active,
        'school_id': u.school_id, 'colegio': colegios.get(u.school_id, '—'),
        'last_login': u.last_login.isoformat() if u.last_login else None,
        'created_at': u.created_at.isoformat() if u.created_at else None,
    } for u in usuarios]), 200


@super_admin_bp.route('/usuarios', methods=['POST'])
@require_super_admin
def crear_usuario():
    d = request.get_json() or {}
    email = (d.get('email') or '').strip().lower()
    nombre = (d.get('nombre') or '').strip()
    apellido = (d.get('apellido') or '').strip()
    rol = d.get('role', 'admin')

    if not email or not nombre or not apellido:
        return jsonify({'error': 'Nombre, apellido y correo son obligatorios'}), 400
    if rol not in ROLES_GESTIONABLES:
        return jsonify({'error': f'Rol no válido: {rol}'}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({'error': f'El correo {email} ya está registrado'}), 400
    if not d.get('school_id'):
        return jsonify({'error': 'Hay que indicar el colegio'}), 400
    if not School.query.get(d['school_id']):
        return jsonify({'error': 'El colegio no existe'}), 404

    clave = d.get('password') or 'colegio123'
    u = User(school_id=d['school_id'], email=email, first_name=nombre,
             last_name=apellido, rut=(d.get('rut') or '').strip() or None,
             phone=(d.get('telefono') or '').strip() or None,
             role=rol, is_active=d.get('is_active', True))
    u.set_password(clave)
    db.session.add(u)
    db.session.commit()
    return jsonify({'ok': True, 'id': u.id, 'email': email}), 201


@super_admin_bp.route('/usuarios/<int:uid>', methods=['PUT'])
@require_super_admin
def actualizar_usuario(uid):
    u = User.query.get_or_404(uid)
    if u.role == 'super_admin':
        return jsonify({'error': 'El super admin no se edita desde aquí'}), 403
    d = request.get_json() or {}

    if 'email' in d:
        email = (d['email'] or '').strip().lower()
        if not email:
            return jsonify({'error': 'El correo no puede quedar vacío'}), 400
        otro = User.query.filter_by(email=email).first()
        if otro and otro.id != u.id:
            return jsonify({'error': f'El correo {email} ya está en uso'}), 400
        u.email = email

    for campo, destino in (('nombre', 'first_name'), ('apellido', 'last_name'),
                           ('rut', 'rut'), ('telefono', 'phone')):
        if campo in d:
            setattr(u, destino, (d[campo] or '').strip() or None)

    if 'role' in d:
        if d['role'] not in ROLES_GESTIONABLES:
            return jsonify({'error': f'Rol no válido: {d["role"]}'}), 400
        u.role = d['role']
    if 'school_id' in d and d['school_id']:
        if not School.query.get(d['school_id']):
            return jsonify({'error': 'El colegio no existe'}), 404
        u.school_id = d['school_id']
    if 'is_active' in d:
        u.is_active = bool(d['is_active'])
    if d.get('password'):
        u.set_password(d['password'])

    db.session.commit()
    return jsonify({'ok': True, 'id': u.id}), 200


@super_admin_bp.route('/usuarios/<int:uid>', methods=['DELETE'])
@require_super_admin
def desactivar_usuario(uid):
    """Baja lógica: conserva su historial de notas, anotaciones y carga."""
    u = User.query.get_or_404(uid)
    if u.role == 'super_admin':
        return jsonify({'error': 'El super admin no se desactiva desde aquí'}), 403
    u.is_active = False
    db.session.commit()
    return jsonify({'ok': True, 'mensaje': f'{u.first_name} {u.last_name} quedó sin acceso'}), 200
