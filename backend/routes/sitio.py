"""Sitio público de Kolevia: landing y captura de solicitudes de demo."""
import os
import re

from flask import Blueprint, request, jsonify, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt

from models import db, SolicitudDemo

sitio_bp = Blueprint('sitio', __name__)

LANDING_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'landing')
EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


# La raíz muestra el sitio público. Va antes del catch-all de React, que
# de otro modo entrega la app y termina rebotando al login.
@sitio_bp.route('/')
@sitio_bp.route('/inicio')
@sitio_bp.route('/inicio/')
def landing():
    return send_from_directory(LANDING_DIR, 'index.html')


@sitio_bp.route('/inicio/img/<path:archivo>')
def landing_img(archivo):
    """Imágenes del sitio público."""
    return send_from_directory(os.path.join(LANDING_DIR, 'img'), archivo,
                               max_age=60 * 60 * 24 * 7)


@sitio_bp.route('/api/leads', methods=['POST'])
def crear_lead():
    """Público a propósito: lo llama el formulario del sitio, sin sesión."""
    d = request.get_json(silent=True) or request.form or {}
    nombre = (d.get('nombre') or '').strip()
    email = (d.get('email') or '').strip()

    if not nombre or not email:
        return jsonify({'error': 'El nombre y el correo son obligatorios'}), 400
    if not EMAIL_RE.match(email):
        return jsonify({'error': 'El correo no parece válido'}), 400

    def corto(valor, tope):
        return (str(valor).strip()[:tope] or None) if valor else None

    lead = SolicitudDemo(
        nombre=nombre[:200], email=email[:200],
        telefono=corto(d.get('telefono'), 50),
        colegio=corto(d.get('colegio'), 200),
        mensaje=corto(d.get('mensaje'), 2000),
        origen=corto(d.get('origen'), 60) or 'sitio',
    )
    db.session.add(lead)
    db.session.commit()
    return jsonify({'ok': True, 'mensaje': 'Solicitud recibida'}), 201


@sitio_bp.route('/api/leads', methods=['GET'])
@jwt_required()
def listar_leads():
    if get_jwt().get('role') != 'super_admin':
        return jsonify({'error': 'Acceso denegado'}), 403
    filas = SolicitudDemo.query.order_by(SolicitudDemo.created_at.desc()).all()
    return jsonify([f.to_dict() for f in filas]), 200


@sitio_bp.route('/api/leads/<int:lead_id>', methods=['PUT'])
@jwt_required()
def marcar_lead(lead_id):
    if get_jwt().get('role') != 'super_admin':
        return jsonify({'error': 'Acceso denegado'}), 403
    lead = SolicitudDemo.query.get_or_404(lead_id)
    d = request.get_json() or {}
    if 'atendida' in d:
        lead.atendida = bool(d['atendida'])
    db.session.commit()
    return jsonify(lead.to_dict()), 200
