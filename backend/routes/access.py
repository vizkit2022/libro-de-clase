"""
Helpers de autorización compartidos por las rutas.

Reglas para roles "consumidores" (apoderado / alumno):
  - Solo lectura: nunca pueden crear, editar ni borrar.
  - El apoderado solo ve a los alumnos vinculados en student_guardians.
  - El alumno solo se ve a sí mismo.
  - Ambos ven únicamente calificaciones publicadas por el profesor.
"""
from flask import jsonify
from flask_jwt_extended import get_jwt
from models import StudentGuardian

STAFF_ROLES = ('admin', 'directivo', 'profesor')
READONLY_ROLES = ('apoderado', 'alumno')


def current_claims():
    claims = get_jwt()
    return {
        'user_id': int(claims.get('sub', 0) or 0),
        'role': claims.get('role'),
        'school_id': claims.get('school_id'),
    }


def is_staff(role):
    return role in STAFF_ROLES


def is_readonly_role(role):
    return role in READONLY_ROLES


def guardian_student_ids(guardian_id):
    """IDs de los alumnos vinculados a un apoderado."""
    rows = StudentGuardian.query.filter_by(guardian_id=guardian_id).all()
    return {r.student_id for r in rows}


def allowed_student_ids(claims):
    """
    Alumnos que el usuario actual puede consultar.
    None  → sin restricción (admin/directivo/profesor).
    set() → conjunto explícito (apoderado: sus alumnos; alumno: él mismo).
    """
    role = claims['role']
    if role == 'apoderado':
        return guardian_student_ids(claims['user_id'])
    if role == 'alumno':
        return {claims['user_id']}
    return None


def can_view_student(claims, student_id):
    allowed = allowed_student_ids(claims)
    return allowed is None or int(student_id) in allowed


def only_published(claims):
    """¿Debe filtrarse a notas publicadas?"""
    return is_readonly_role(claims['role'])


def forbidden(msg='Sin permisos'):
    return jsonify({'error': msg}), 403
