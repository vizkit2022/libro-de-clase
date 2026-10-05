from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt
from models import (db, School, Course, User,
                    CargaDocente, CargaDemanda, CargaAsignacion,
                    TABLA_LEGAL_MINEDUC, CARGA_TIPOS, MAX_HORAS_DISPONIBILIDAD,
                    ACTIVIDADES_NO_LECTIVAS_DEFAULT, tabla_legal_lookup)
from datetime import date, datetime
from functools import wraps
import json as json_lib
import io

carga_bp = Blueprint('carga_academica', __name__)

NIVELES = ['7° Básico', '8° Básico', 'I Medio', 'II Medio', 'III Medio', 'IV Medio']


def school_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        claims = get_jwt()
        if not claims.get('school_id'):
            return jsonify({'error': 'Sin colegio asignado'}), 403
        return f(*args, **kwargs)
    return decorated


def _sid():
    return get_jwt().get('school_id')


def _year():
    return request.args.get('year', date.today().year + 1, type=int)


def fmt_hm(minutos):
    """420 -> '7:00'"""
    minutos = int(minutos or 0)
    sign = '-' if minutos < 0 else ''
    minutos = abs(minutos)
    return f"{sign}{minutos // 60}:{minutos % 60:02d}"


# ── Catálogos ─────────────────────────────────────────────────────────

@carga_bp.route('/catalogos', methods=['GET'])
@jwt_required()
def catalogos():
    return jsonify({
        'niveles': NIVELES,
        'tipos': CARGA_TIPOS,
        'max_disponibilidad': MAX_HORAS_DISPONIBILIDAD,
        'actividades_default': ACTIVIDADES_NO_LECTIVAS_DEFAULT,
        'tabla_legal': [
            {'jornada': j, 'horas_pedagogicas': v[0],
             'recreo_min': v[1], 'recreo': fmt_hm(v[1]),
             'no_lectivas_min': v[2], 'no_lectivas': fmt_hm(v[2])}
            for j, v in sorted(TABLA_LEGAL_MINEDUC.items(), reverse=True)
        ],
    }), 200


@carga_bp.route('/tabla-legal/<int:jornada>', methods=['GET'])
@jwt_required()
def tabla_legal_row(jornada):
    r = tabla_legal_lookup(jornada)
    if not r:
        return jsonify({'error': f'Jornada {jornada} no existe en la Tabla Legal'}), 404
    r['recreo'] = fmt_hm(r['recreo_min'])
    r['no_lectivas'] = fmt_hm(r['no_lectivas_min'])
    return jsonify(r), 200


# ── Demanda ───────────────────────────────────────────────────────────

@carga_bp.route('/demanda', methods=['GET'])
@jwt_required()
@school_required
def list_demanda():
    q = CargaDemanda.query.filter_by(school_id=_sid(), year=_year())
    dep = request.args.get('departamento')
    if dep:
        q = q.filter_by(departamento=dep)
    rows = q.order_by(CargaDemanda.orden, CargaDemanda.id).all()
    return jsonify([r.to_dict() for r in rows]), 200


@carga_bp.route('/demanda', methods=['POST'])
@jwt_required()
@school_required
def create_demanda():
    d = request.get_json()
    row = CargaDemanda(
        school_id=_sid(),
        year=d.get('year', _year()),
        departamento=d.get('departamento'),
        asignatura=d['asignatura'],
        nivel=d['nivel'],
        por_letra=d.get('por_letra', True),
        letras=d.get('letras', 'A,B,C'),
        horas_por_grupo=d.get('horas_por_grupo', 0),
        orden=d.get('orden', 0),
    )
    db.session.add(row)
    db.session.commit()
    return jsonify(row.to_dict()), 201


@carga_bp.route('/demanda/<int:rid>', methods=['PUT'])
@jwt_required()
@school_required
def update_demanda(rid):
    row = CargaDemanda.query.filter_by(id=rid, school_id=_sid()).first_or_404()
    d = request.get_json()
    for f in ['departamento', 'asignatura', 'nivel', 'por_letra', 'letras',
              'horas_por_grupo', 'orden']:
        if f in d:
            setattr(row, f, d[f])
    db.session.commit()
    return jsonify(row.to_dict()), 200


@carga_bp.route('/demanda/<int:rid>', methods=['DELETE'])
@jwt_required()
@school_required
def delete_demanda(rid):
    row = CargaDemanda.query.filter_by(id=rid, school_id=_sid()).first_or_404()
    CargaAsignacion.query.filter_by(demanda_id=rid).update({'demanda_id': None})
    db.session.delete(row)
    db.session.commit()
    return jsonify({'ok': True}), 200


# ── Docentes ──────────────────────────────────────────────────────────

@carga_bp.route('/docentes', methods=['GET'])
@jwt_required()
@school_required
def list_docentes():
    q = CargaDocente.query.filter_by(school_id=_sid(), year=_year())
    dep = request.args.get('departamento')
    if dep:
        q = q.filter_by(departamento=dep)
    rows = q.order_by(CargaDocente.orden, CargaDocente.id).all()
    light = request.args.get('light') == '1'
    return jsonify([r.to_dict(with_asignaciones=not light) for r in rows]), 200


@carga_bp.route('/docentes/<int:did>', methods=['GET'])
@jwt_required()
@school_required
def get_docente(did):
    row = CargaDocente.query.filter_by(id=did, school_id=_sid()).first_or_404()
    return jsonify(row.to_dict()), 200


@carga_bp.route('/docentes', methods=['POST'])
@jwt_required()
@school_required
def create_docente():
    d = request.get_json()
    row = CargaDocente(
        school_id=_sid(),
        year=d.get('year', _year()),
        nombre=d['nombre'],
        rut=d.get('rut'),
        user_id=d.get('user_id') or None,
        departamento=d.get('departamento'),
        nivel=d.get('nivel', 'Media'),
        horas_contrato=d.get('horas_contrato', 44),
        no_lectivas_json=json_lib.dumps(d.get('no_lectivas', ACTIVIDADES_NO_LECTIVAS_DEFAULT)),
        orden=d.get('orden', 0),
    )
    db.session.add(row)
    db.session.commit()
    return jsonify(row.to_dict()), 201


@carga_bp.route('/docentes/<int:did>', methods=['PUT'])
@jwt_required()
@school_required
def update_docente(did):
    row = CargaDocente.query.filter_by(id=did, school_id=_sid()).first_or_404()
    d = request.get_json()
    for f in ['nombre', 'rut', 'departamento', 'nivel', 'horas_contrato', 'orden', 'user_id']:
        if f in d:
            setattr(row, f, d[f] or None if f == 'user_id' else d[f])
    if 'no_lectivas' in d:
        row.no_lectivas_json = json_lib.dumps(d['no_lectivas'])
    db.session.commit()
    return jsonify(row.to_dict()), 200


@carga_bp.route('/docentes/<int:did>', methods=['DELETE'])
@jwt_required()
@school_required
def delete_docente(did):
    row = CargaDocente.query.filter_by(id=did, school_id=_sid()).first_or_404()
    db.session.delete(row)
    db.session.commit()
    return jsonify({'ok': True}), 200


# ── Asignaciones ──────────────────────────────────────────────────────

@carga_bp.route('/docentes/<int:did>/asignaciones', methods=['POST'])
@jwt_required()
@school_required
def create_asignacion(did):
    doc = CargaDocente.query.filter_by(id=did, school_id=_sid()).first_or_404()
    d = request.get_json()
    row = CargaAsignacion(
        school_id=_sid(),
        year=doc.year,
        docente_id=did,
        tipo=d.get('tipo', 'asignatura'),
        demanda_id=d.get('demanda_id') or None,
        asignatura_libre=d.get('asignatura_libre'),
        letras=d.get('letras'),
        horas=d.get('horas', 0),
        orden=d.get('orden', 0),
    )
    db.session.add(row)
    db.session.commit()
    return jsonify(row.to_dict()), 201


@carga_bp.route('/asignaciones/<int:aid>', methods=['PUT'])
@jwt_required()
@school_required
def update_asignacion(aid):
    row = CargaAsignacion.query.filter_by(id=aid, school_id=_sid()).first_or_404()
    d = request.get_json()
    for f in ['tipo', 'asignatura_libre', 'letras', 'horas', 'orden']:
        if f in d:
            setattr(row, f, d[f])
    if 'demanda_id' in d:
        row.demanda_id = d['demanda_id'] or None
    db.session.commit()
    return jsonify(row.to_dict()), 200


@carga_bp.route('/asignaciones/<int:aid>', methods=['DELETE'])
@jwt_required()
@school_required
def delete_asignacion(aid):
    row = CargaAsignacion.query.filter_by(id=aid, school_id=_sid()).first_or_404()
    db.session.delete(row)
    db.session.commit()
    return jsonify({'ok': True}), 200


# ── Dashboard ─────────────────────────────────────────────────────────

@carga_bp.route('/dashboard', methods=['GET'])
@jwt_required()
@school_required
def dashboard():
    sid, year = _sid(), _year()
    demanda = CargaDemanda.query.filter_by(school_id=sid, year=year).order_by(
        CargaDemanda.orden, CargaDemanda.id).all()
    docentes = CargaDocente.query.filter_by(school_id=sid, year=year).order_by(
        CargaDocente.orden, CargaDocente.id).all()
    asigs = CargaAsignacion.query.filter_by(school_id=sid, year=year).all()

    # Horas asignadas por fila de demanda
    por_demanda = {}
    for a in asigs:
        if a.demanda_id:
            por_demanda[a.demanda_id] = por_demanda.get(a.demanda_id, 0) + int(a.horas or 0)

    vista_asignaturas = []
    for d in demanda:
        asignadas = por_demanda.get(d.id, 0)
        total = d.horas_totales()
        vista_asignaturas.append({
            **d.to_dict(),
            'horas_asignadas': asignadas,
            'horas_faltantes': total - asignadas,
            'cobertura_pct': round(asignadas / total * 100, 1) if total else 0,
            'estado': 'completa' if asignadas == total else ('sobreasignada' if asignadas > total else 'incompleta'),
        })

    vista_docentes = [d.to_dict(with_asignaciones=False) for d in docentes]

    # Agregados por asignatura (sumando niveles)
    por_asignatura = {}
    for v in vista_asignaturas:
        k = v['asignatura']
        acc = por_asignatura.setdefault(k, {
            'asignatura': k, 'departamento': v['departamento'],
            'horas_demanda': 0, 'horas_asignadas': 0, 'niveles': 0})
        acc['horas_demanda'] += v['horas_totales']
        acc['horas_asignadas'] += v['horas_asignadas']
        acc['niveles'] += 1
    for acc in por_asignatura.values():
        acc['horas_faltantes'] = acc['horas_demanda'] - acc['horas_asignadas']
        acc['cobertura_pct'] = round(acc['horas_asignadas'] / acc['horas_demanda'] * 100, 1) if acc['horas_demanda'] else 0

    total_demanda = sum(v['horas_totales'] for v in vista_asignaturas)
    total_asignado = sum(v['horas_asignadas'] for v in vista_asignaturas)
    docentes_completos = sum(1 for d in vista_docentes if d['completo'])
    alertas = []
    for d in vista_docentes:
        if d['excede_disponibilidad']:
            alertas.append({'tipo': 'disponibilidad', 'docente': d['nombre'],
                            'mensaje': f"{d['nombre']}: {d['disponibilidad']} h de disponibilidad (máx. {MAX_HORAS_DISPONIBILIDAD})"})
        if d['diferencia'] != 0 and d['horas_pedagogicas']:
            signo = 'le sobran' if d['diferencia'] > 0 else 'le faltan'
            alertas.append({'tipo': 'descuadre', 'docente': d['nombre'],
                            'mensaje': f"{d['nombre']}: {signo} {abs(d['diferencia'])} h vs. su jornada"})
        if d['excede_no_lectivas']:
            alertas.append({'tipo': 'no_lectivas', 'docente': d['nombre'],
                            'mensaje': f"{d['nombre']}: actividades no lectivas superan {fmt_hm(d['no_lectivas_min'])}"})

    return jsonify({
        'year': year,
        'resumen': {
            'total_demanda': total_demanda,
            'total_asignado': total_asignado,
            'total_faltante': total_demanda - total_asignado,
            'cobertura_pct': round(total_asignado / total_demanda * 100, 1) if total_demanda else 0,
            'docentes_total': len(vista_docentes),
            'docentes_completos': docentes_completos,
        },
        'por_asignatura': sorted(por_asignatura.values(), key=lambda x: x['asignatura']),
        'detalle_demanda': vista_asignaturas,
        'docentes': vista_docentes,
        'alertas': alertas,
    }), 200


# ── Informe Word (.docx) ──────────────────────────────────────────────

def _docx_informe(school, docentes, year):
    from docx import Document
    from docx.shared import Pt, Cm, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement

    AZUL = '8EA9DB'
    GRIS = 'D9D9D9'

    def shade(cell, color):
        tcPr = cell._tc.get_or_add_tcPr()
        shd = OxmlElement('w:shd')
        shd.set(qn('w:val'), 'clear')
        shd.set(qn('w:fill'), color)
        tcPr.append(shd)

    def bold(cell, val=True, size=9):
        for p in cell.paragraphs:
            for r in p.runs:
                r.bold = val
                r.font.size = Pt(size)

    def setcell(cell, text, b=False, fill=None, center=False, size=9):
        cell.text = str(text) if text is not None else ''
        if center:
            cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        bold(cell, b, size)
        if fill:
            shade(cell, fill)

    doc = Document()
    for s in doc.sections:
        s.top_margin = s.bottom_margin = Cm(1.5)
        s.left_margin = s.right_margin = Cm(2)

    for idx, d in enumerate(docentes):
        info = d.to_dict()
        if idx > 0:
            doc.add_page_break()

        # Encabezado institucional
        h = doc.add_paragraph()
        r = h.add_run(school.name if school else 'Colegio')
        r.bold = True
        r.font.size = Pt(13)
        sub = doc.add_paragraph()
        rs = sub.add_run((school.rector and f'{school.rector}\n' or '') + 'Coordinación Académica')
        rs.italic = True
        rs.font.size = Pt(9)

        t = doc.add_paragraph()
        t.alignment = WD_ALIGN_PARAGRAPH.CENTER
        rt = t.add_run(f'CARGA HORARIA {year}')
        rt.bold = True
        rt.font.size = Pt(12)

        # Cabecera del docente
        tb = doc.add_table(rows=0, cols=2)
        tb.style = 'Table Grid'
        tb.alignment = WD_TABLE_ALIGNMENT.CENTER
        for label, val in [
            ('DEPARTAMENTO', info['departamento'] or ''),
            ('Docente', info['nombre']),
            ('Nivel', info['nivel'] or ''),
            ('Horas cronológicas contrato', info['horas_contrato']),
            ('Horas pedagógicas en el aula', info['horas_pedagogicas']),
            ('Horas no Lectivas', fmt_hm(info['no_lectivas_min'])),
            ('Recreo', fmt_hm(info['recreo_min'])),
        ]:
            row = tb.add_row()
            setcell(row.cells[0], label, b=True, fill=GRIS)
            setcell(row.cells[1], val)

        doc.add_paragraph()

        # HORAS LECTIVAS
        tl = doc.add_table(rows=1, cols=3)
        tl.style = 'Table Grid'
        hdr = tl.rows[0].cells
        setcell(hdr[0], 'ASIGNATURA', b=True, fill=AZUL, center=True)
        setcell(hdr[1], 'CURSOS', b=True, fill=AZUL, center=True)
        setcell(hdr[2], 'CANTIDAD DE HORAS', b=True, fill=AZUL, center=True)

        for a in info['asignaciones']:
            row = tl.add_row().cells
            setcell(row[0], a['asignatura'] or dict(
                disponibilidad='Disponibilidad', toma_contacto='Toma de contacto',
                orientacion='Orientación / Consejo de curso', jefatura='Trabajo de jefatura',
                jefe_departamento='Jefe de Departamento').get(a['tipo'], a['tipo']))
            setcell(row[1], a['cursos_texto'] or '', center=True)
            setcell(row[2], a['horas'], center=True)

        row = tl.add_row().cells
        setcell(row[0], 'Total de horas', b=True, fill=GRIS)
        setcell(row[1], '', fill=GRIS)
        setcell(row[2], info['total_lectivas'], b=True, fill=GRIS, center=True)

        row = tl.add_row().cells
        setcell(row[0], 'Diferencia vs. horas pedagógicas en aula', b=True)
        setcell(row[1], '', center=True)
        setcell(row[2], info['diferencia'], b=True, center=True)

        doc.add_paragraph()

        # HORAS NO LECTIVAS
        tn = doc.add_table(rows=1, cols=2)
        tn.style = 'Table Grid'
        hdr = tn.rows[0].cells
        setcell(hdr[0], 'ACTIVIDAD', b=True, fill=AZUL, center=True)
        setcell(hdr[1], 'TIEMPO (h:mm)', b=True, fill=AZUL, center=True)

        for act in info['no_lectivas']:
            row = tn.add_row().cells
            setcell(row[0], act.get('actividad', ''))
            setcell(row[1], fmt_hm(act.get('minutos', 0)), center=True)

        for label, val, b in [
            ('Total actividades registradas', fmt_hm(info['total_actividades_min']), True),
            ('Horas no Lectivas (según Tabla Legal)', fmt_hm(info['no_lectivas_min']), False),
            ('Permanencia en horas cronológicas', fmt_hm(info['permanencia_min']), True),
            ('Recreo (según Tabla Legal)', fmt_hm(info['recreo_min']), False),
        ]:
            row = tn.add_row().cells
            setcell(row[0], label, b=b, fill=GRIS if b else None)
            setcell(row[1], val, b=b, fill=GRIS if b else None, center=True)

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf


@carga_bp.route('/docentes/<int:did>/informe.docx', methods=['GET'])
@jwt_required()
@school_required
def informe_docente(did):
    doc = CargaDocente.query.filter_by(id=did, school_id=_sid()).first_or_404()
    school = School.query.get(_sid())
    buf = _docx_informe(school, [doc], doc.year)
    nombre = (doc.nombre or 'docente').replace(' ', '_')
    return send_file(buf, as_attachment=True,
                     download_name=f'Carga_{nombre}_{doc.year}.docx',
                     mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document')


@carga_bp.route('/informe-departamento.docx', methods=['GET'])
@jwt_required()
@school_required
def informe_departamento():
    sid, year = _sid(), _year()
    dep = request.args.get('departamento')
    q = CargaDocente.query.filter_by(school_id=sid, year=year)
    if dep:
        q = q.filter_by(departamento=dep)
    docentes = q.order_by(CargaDocente.orden, CargaDocente.id).all()
    if not docentes:
        return jsonify({'error': 'No hay docentes para ese departamento'}), 404
    school = School.query.get(sid)
    buf = _docx_informe(school, docentes, year)
    slug = (dep or 'Todos').replace(' ', '_')
    return send_file(buf, as_attachment=True,
                     download_name=f'Carga_Horaria_{slug}_{year}.docx',
                     mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document')


# ── Seed: Colegio Alberto Pérez, Departamento de Lenguaje 2027 ────────

@carga_bp.route('/seed-lenguaje', methods=['POST'])
@jwt_required()
@school_required
def seed_lenguaje():
    """Puebla cursos 7°-IV Medio (A,B,C), la demanda de Lenguaje y los 6 docentes
    con su carga 2026 como línea base para 2027."""
    sid = _sid()
    year = request.get_json(silent=True) and request.get_json().get('year') or _year()
    LETRAS = ['A', 'B', 'C']
    creados = {'cursos': 0, 'demanda': 0, 'docentes': 0, 'asignaciones': 0}

    # 1) Cursos: 6 niveles × A,B,C
    for nivel in NIVELES:
        for letra in LETRAS:
            nombre = f'{nivel} {letra}'
            if not Course.query.filter_by(school_id=sid, name=nombre, year=year).first():
                db.session.add(Course(school_id=sid, name=nombre, level=nivel,
                                      letter=letra, year=year, is_active=True))
                creados['cursos'] += 1
    db.session.commit()

    # 2) Demanda del departamento de Lenguaje
    DEP = 'Lenguaje'
    if CargaDemanda.query.filter_by(school_id=sid, year=year, departamento=DEP).count() == 0:
        demanda_rows = [
            # (asignatura, nivel, por_letra, horas_por_grupo)
            ('Lengua y Literatura', '7° Básico',  True, 6),
            ('Lengua y Literatura', '8° Básico',  True, 6),
            ('Lengua y Literatura', 'I Medio',    True, 6),
            ('Lengua y Literatura', 'II Medio',   True, 6),
            ('Lengua y Literatura', 'III Medio',  True, 3),
            ('Lengua y Literatura', 'IV Medio',   True, 3),
            ('Taller de Lenguaje',  '7° Básico',  True, 2),
            ('Taller de Lenguaje',  '8° Básico',  True, 2),
            ('Taller de Lenguaje',  'I Medio',    True, 2),
            ('Taller de Lenguaje',  'II Medio',   True, 2),
            ('Taller PAES',         'III Medio',  True, 2),
            ('Taller PAES',         'IV Medio',   True, 2),
            ('Electivo: Participación y argumentación en democracia', 'III Medio', False, 6),
            ('Electivo: Taller de lectura y escritura especializada', 'III Medio', False, 6),
            ('Electivo: Taller de Literatura',                        'IV Medio',  False, 6),
        ]
        for i, (asig, nivel, por_letra, horas) in enumerate(demanda_rows):
            db.session.add(CargaDemanda(
                school_id=sid, year=year, departamento=DEP, asignatura=asig,
                nivel=nivel, por_letra=por_letra,
                letras='A,B,C' if por_letra else '', horas_por_grupo=horas, orden=i))
            creados['demanda'] += 1
        db.session.commit()

    dmap = {(d.asignatura, d.nivel): d.id for d in
            CargaDemanda.query.filter_by(school_id=sid, year=year, departamento=DEP).all()}

    # 3) Docentes + carga 2026 como línea base
    DOCENTES = [
        ('Daniela Villanueva', 44, [
            ('jefe_departamento', None, None, None, 32),
            ('asignatura', 'Lengua y Literatura', 'III Medio', 'A,C', 6),
        ]),
        ('Francisca Chávez', 43, [
            ('asignatura', 'Lengua y Literatura', 'IV Medio',  'A,B,C', 9),
            ('asignatura', 'Lengua y Literatura', 'II Medio',  'A',     6),
            ('asignatura', 'Taller PAES',         'III Medio', 'A,B,C', 6),
            ('asignatura', 'Taller PAES',         'IV Medio',  'A,B,C', 6),
            ('disponibilidad', None, None, None, 6),
            ('toma_contacto',  None, None, None, 1),
            ('orientacion',    None, None, 'IV Medio C', 1),
            ('jefatura',       None, None, None, 2),
        ]),
        ('Karla Neculqueo', 39, [
            ('asignatura', 'Lengua y Literatura', 'I Medio',   'A,B,C', 18),
            ('asignatura', 'Electivo: Participación y argumentación en democracia', 'III Medio', None, 6),
            ('asignatura', 'Taller de Lenguaje',  '7° Básico', 'A,B',   4),
            ('disponibilidad', None, None, None, 2),
            ('toma_contacto',  None, None, None, 1),
            ('orientacion',    None, None, 'I Medio B', 1),
            ('jefatura',       None, None, None, 2),
        ]),
        ('Dominique Solar', 42, [
            ('asignatura', 'Lengua y Literatura', 'II Medio',  'B,C',   12),
            ('asignatura', 'Taller de Lenguaje',  'I Medio',   'A,B,C', 6),
            ('asignatura', 'Taller de Lenguaje',  'II Medio',  'A,B,C', 6),
            ('asignatura', 'Electivo: Taller de lectura y escritura especializada', 'III Medio', None, 6),
            ('disponibilidad', None, None, None, 2),
            ('toma_contacto',  None, None, None, 1),
            ('orientacion',    None, None, 'II Medio C', 1),
            ('jefatura',       None, None, None, 2),
        ]),
        ('Joana Jaime', 37, [
            ('asignatura', 'Lengua y Literatura', '7° Básico', 'A,B,C', 18),
            ('asignatura', 'Taller de Lenguaje',  '7° Básico', 'C',     2),
            ('asignatura', 'Taller de Lenguaje',  '8° Básico', 'A,B,C', 6),
            ('disponibilidad', None, None, None, 2),
            ('toma_contacto',  None, None, None, 1),
            ('orientacion',    None, None, '7° Básico C', 1),
            ('jefatura',       None, None, None, 2),
        ]),
        ('Daniela Carreño', 38, [
            ('asignatura', 'Lengua y Literatura', '8° Básico', 'A,B,C', 18),
            ('asignatura', 'Electivo: Taller de Literatura', 'IV Medio', None, 6),
            ('asignatura', 'Lengua y Literatura', 'III Medio', 'B',     3),
            ('disponibilidad', None, None, None, 2),
            ('toma_contacto',  None, None, None, 1),
            ('orientacion',    None, None, 'III Medio B', 1),
            ('jefatura',       None, None, None, 2),
        ]),
    ]

    for i, (nombre, jornada, filas) in enumerate(DOCENTES):
        if CargaDocente.query.filter_by(school_id=sid, year=year, nombre=nombre).first():
            continue
        doc = CargaDocente(school_id=sid, year=year, nombre=nombre, departamento=DEP,
                           nivel='Media', horas_contrato=jornada, orden=i,
                           no_lectivas_json=json_lib.dumps(ACTIVIDADES_NO_LECTIVAS_DEFAULT))
        db.session.add(doc)
        db.session.flush()
        creados['docentes'] += 1
        for j, (tipo, asig, nivel, letras, horas) in enumerate(filas):
            db.session.add(CargaAsignacion(
                school_id=sid, year=year, docente_id=doc.id, tipo=tipo,
                demanda_id=dmap.get((asig, nivel)) if asig else None,
                asignatura_libre=None if asig else None,
                letras=letras, horas=horas, orden=j))
            creados['asignaciones'] += 1
    db.session.commit()

    return jsonify({'ok': True, 'year': year, 'creados': creados}), 201
