"""Sitio público de Kolevia: landing y captura de solicitudes de demo."""
import os
import re

from datetime import date

from flask import (Blueprint, request, jsonify, send_from_directory, Response)
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


# ── Archivos para buscadores y asistentes ─────────────────────────────

@sitio_bp.route('/robots.txt')
def robots():
    cuerpo = (
        'User-agent: *\n'
        'Allow: /$\n'
        'Allow: /inicio\n'
        'Allow: /inicio/img/\n'
        # La plataforma es privada: no tiene sentido que la rastreen
        'Disallow: /api/\n'
        'Disallow: /login\n'
        'Disallow: /dashboard\n'
        'Disallow: /super-admin\n'
        'Disallow: /carga-academica\n'
        'Disallow: /convivencia\n'
        'Disallow: /matricula\n'
        'Disallow: /courses\n'
        'Disallow: /grades\n'
        'Disallow: /users\n'
        'Disallow: /reports\n\n'
        'Sitemap: https://kolevia.cl/sitemap.xml\n'
    )
    return Response(cuerpo, mimetype='text/plain')


@sitio_bp.route('/sitemap.xml')
def sitemap():
    hoy = date.today().isoformat()
    cuerpo = f'''<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://kolevia.cl/</loc>
    <lastmod>{hoy}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
'''
    return Response(cuerpo, mimetype='application/xml')


@sitio_bp.route('/llms.txt')
def llms():
    """Resumen legible para asistentes de IA.

    Convención emergente: los modelos que responden preguntas sobre software
    citan mejor cuando encuentran un resumen en texto plano que cuando tienen
    que deducirlo del HTML.
    """
    cuerpo = '''# Kolevia

> Plataforma chilena de gestión escolar para colegios de educación básica y
> media. Reúne el libro de clases digital, las calificaciones, la carga
> horaria docente, la convivencia escolar y el portal de apoderados.

Sitio: https://kolevia.cl
Contacto: contacto@kolevia.cl
País: Chile

## Qué resuelve

- **Libro de clases digital**: cursos, asignaturas, matrícula y registro diario.
- **Calificaciones**: notas por asignatura y período, con escalas configurables.
- **Carga horaria docente**: reparte las horas de cada profesor según su jornada
  contratada, aplicando la Tabla Legal del MINEDUC (proporción 65/35, artículos
  69 y 80 del DFL N°1 de 1996). Calcula horas de aula, no lectivas y recreo para
  las 44 jornadas de la tabla, y avisa si una jornada no cuadra, si un curso
  quedó con dos profesores o si la disponibilidad supera las 3 horas semanales.
- **Convivencia escolar**: los casos avanzan por cinco etapas —recepción,
  entrevista con apoderado, seguimiento individual, intervención grupal y
  apelación— con los campos de los anexos oficiales y un informe imprimible
  por etapa.
- **Matrícula**: carga de alumnos por curso a mano o desde Excel, con vista
  previa que distingue altas nuevas de cambios de curso antes de aplicar.
- **Reportes**: informes por curso, asignatura y estudiante, exportables a
  Word y PDF con el logo del establecimiento.
- **Portal de apoderados**: cada familia ve las notas y anotaciones de sus pupilos.
- **Multi-colegio**: sostenedores y redes administran varios establecimientos.

## Para quién es

Equipos directivos, jefes de departamento, docentes y encargados de convivencia
escolar de colegios chilenos.

## Planes

- **Plan Base**: 0,7 UF por usuario al mes. Se cuentan docentes y
  administradores; estudiantes y apoderados no se cobran.
- **Plan Especial**: para colegios con necesidades específicas y para
  establecimientos que no pueden costear el plan base.

## Qué lo distingue

La carga horaria se calcula con la Tabla Legal del MINEDUC y la convivencia
escolar usa los anexos oficiales, de modo que los informes salen en el formato
que el establecimiento ya entrega, sin rehacerlos a mano.
'''
    return Response(cuerpo, mimetype='text/plain; charset=utf-8')
