from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt
from models import (db, School, Course, User, Subject, CourseSubject,
                    CargaDocente, CargaDemanda, CargaAsignacion,
                    ActividadNoLectiva, HorarioBloque, HorarioCelda,
                    DIAS_SEMANA, BLOQUES_DEFAULT,
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


# ── Asignaturas (catálogo global del colegio) ─────────────────────────

@carga_bp.route('/asignaturas', methods=['GET'])
@jwt_required()
@school_required
def list_asignaturas():
    """Catálogo de asignaturas del colegio, para el selector de la demanda."""
    rows = Subject.query.filter_by(school_id=_sid(), is_active=True)\
        .order_by(Subject.name).all()
    return jsonify([r.to_dict() for r in rows]), 200


@carga_bp.route('/asignaturas', methods=['POST'])
@jwt_required()
@school_required
def create_asignatura():
    """Crea una asignatura en el catálogo global sin salir del módulo.
    Si ya existe una con el mismo nombre, la devuelve en vez de duplicar."""
    d = request.get_json() or {}
    nombre = (d.get('name') or '').strip()
    if not nombre:
        return jsonify({'error': 'El nombre es obligatorio'}), 400

    existente = Subject.query.filter_by(school_id=_sid(), name=nombre).first()
    if existente:
        if not existente.is_active:
            existente.is_active = True
            db.session.commit()
        return jsonify({**existente.to_dict(), 'ya_existia': True}), 200

    subj = Subject(school_id=_sid(), name=nombre, code=d.get('code'),
                   color=d.get('color', '#6366F1'), is_active=True)
    db.session.add(subj)
    db.session.commit()
    return jsonify({**subj.to_dict(), 'ya_existia': False}), 201


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
    subject_id = d.get('subject_id') or None
    etiqueta = d.get('asignatura')
    if subject_id:
        subj = Subject.query.filter_by(id=subject_id, school_id=_sid()).first()
        if not subj:
            return jsonify({'error': 'La asignatura no existe en este colegio'}), 400
        etiqueta = subj.name
    row = CargaDemanda(
        school_id=_sid(),
        year=d.get('year', _year()),
        departamento=d.get('departamento'),
        subject_id=subject_id,
        asignatura=etiqueta,
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
    if 'subject_id' in d:
        sid_new = d['subject_id'] or None
        if sid_new:
            subj = Subject.query.filter_by(id=sid_new, school_id=_sid()).first()
            if not subj:
                return jsonify({'error': 'La asignatura no existe en este colegio'}), 400
            row.subject_id = subj.id
            row.asignatura = subj.name   # la etiqueta sigue al catálogo
        else:
            row.subject_id = None
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

    logo_raw = _logo_bytes(school)

    for idx, d in enumerate(docentes):
        info = d.to_dict()
        if idx > 0:
            doc.add_page_break()

        # Encabezado institucional: logo a la izquierda, datos a la derecha
        cab = doc.add_table(rows=1, cols=2)
        cab.autofit = False
        c_logo, c_txt = cab.rows[0].cells
        c_logo.width = Cm(2.2)
        if logo_raw:
            try:
                c_logo.paragraphs[0].add_run().add_picture(io.BytesIO(logo_raw), height=Cm(1.5))
            except Exception:
                pass
        for i, (txt, bold_) in enumerate([
            (school.name if school else 'Colegio', True),
            (school.rector if school and school.rector else None, False),
            ('Coordinación Académica.', False),
            (str(year), False),
        ]):
            if txt is None:
                continue
            par = c_txt.paragraphs[0] if i == 0 else c_txt.add_paragraph()
            run = par.add_run(txt)
            run.bold = bold_
            run.font.size = Pt(10 if bold_ else 9)
            par.paragraph_format.space_after = Pt(0)

        # Cajas CARGA HORARIA / DEPARTAMENTO, como en el formato original
        cajas = doc.add_table(rows=2, cols=2)
        cajas.style = 'Table Grid'
        cajas.autofit = False
        setcell(cajas.rows[0].cells[0], f'CARGA HORARIA {year}', b=True, fill=AZUL, size=10)
        setcell(cajas.rows[0].cells[1], '', fill=None)
        setcell(cajas.rows[1].cells[0], 'DEPARTAMENTO', b=True, fill=AZUL, size=10)
        setcell(cajas.rows[1].cells[1], info['departamento'] or '', b=True, size=10)
        for row in cajas.rows:
            row.cells[0].width = Cm(4.6)
            row.cells[1].width = Cm(4.0)

        doc.add_paragraph()

        # Cabecera del docente
        tb = doc.add_table(rows=0, cols=2)
        tb.style = 'Table Grid'
        tb.alignment = WD_TABLE_ALIGNMENT.CENTER
        for label, val in [
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
            row.cells[0].width = Cm(6.5)
            row.cells[1].width = Cm(8.0)

        doc.add_paragraph()

        # HORAS LECTIVAS
        tl = doc.add_table(rows=1, cols=3)
        tl.style = 'Table Grid'
        hdr = tl.rows[0].cells
        setcell(hdr[0], 'ASIGNATURAS', b=True, fill=AZUL, center=True)
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
    con la carga histórica 2026 tal como viene del Word del departamento.

    Este es el AÑO BASE. Para armar 2027 se usa /procesos/iniciar, que arrastra
    docentes y demanda pero deja la distribución en blanco."""
    sid = _sid()
    body = request.get_json(silent=True) or {}
    year = body.get('year') or 2026
    LETRAS = ['A', 'B', 'C']
    creados = {'cursos': 0, 'asignaturas': 0, 'demanda': 0, 'docentes': 0, 'asignaciones': 0}

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
        # Las asignaturas se crean en el catálogo global del colegio
        subj_ids = {}
        for asig in dict.fromkeys(a for a, _, _, _ in demanda_rows):
            subj = Subject.query.filter_by(school_id=sid, name=asig).first()
            if not subj:
                subj = Subject(school_id=sid, name=asig, is_active=True,
                               color='#6366F1')
                db.session.add(subj)
                db.session.flush()
                creados['asignaturas'] += 1
            subj_ids[asig] = subj.id

        for i, (asig, nivel, por_letra, horas) in enumerate(demanda_rows):
            db.session.add(CargaDemanda(
                school_id=sid, year=year, departamento=DEP,
                subject_id=subj_ids[asig], asignatura=asig,
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


# ══════════════════════════════════════════════════════════════════════
#  PROCESOS POR AÑO
#  Cada año es un proceso independiente. El año base (2026) guarda el
#  histórico; los años siguientes arrastran docentes y demanda pero
#  parten con la distribución en blanco para re-repartir.
# ══════════════════════════════════════════════════════════════════════

def _resumen_year(sid, year):
    docs = CargaDocente.query.filter_by(school_id=sid, year=year).all()
    dem = CargaDemanda.query.filter_by(school_id=sid, year=year).all()
    asgs = CargaAsignacion.query.filter_by(school_id=sid, year=year).all()

    asignado_por_demanda = {}
    for a in asgs:
        if a.demanda_id:
            asignado_por_demanda[a.demanda_id] = asignado_por_demanda.get(a.demanda_id, 0) + int(a.horas or 0)

    total_demanda = sum(d.horas_totales() for d in dem)
    total_asignado = sum(asignado_por_demanda.values())
    infos = [d.to_dict(with_asignaciones=False) for d in docs]
    completos = sum(1 for i in infos if i['completo'])

    return {
        'year': year,
        'docentes': len(docs),
        'docentes_completos': completos,
        'filas_demanda': len(dem),
        'filas_asignacion': len(asgs),
        'total_demanda': total_demanda,
        'total_asignado': total_asignado,
        'cobertura_pct': round(total_asignado / total_demanda * 100, 1) if total_demanda else 0,
        'en_blanco': len(asgs) == 0,
        'cerrado': total_demanda > 0 and total_asignado == total_demanda and completos == len(docs) and len(docs) > 0,
    }


@carga_bp.route('/procesos', methods=['GET'])
@jwt_required()
@school_required
def list_procesos():
    """Años que tienen datos, con el estado de avance de cada uno."""
    sid = _sid()
    years = set()
    for Model in (CargaDocente, CargaDemanda, CargaAsignacion):
        for (y,) in db.session.query(Model.year).filter_by(school_id=sid).distinct().all():
            if y:
                years.add(y)
    return jsonify({
        'procesos': [_resumen_year(sid, y) for y in sorted(years, reverse=True)],
        'sugerido': max(years) + 1 if years else date.today().year,
    }), 200


@carga_bp.route('/procesos/iniciar', methods=['POST'])
@jwt_required()
@school_required
def iniciar_proceso():
    """Abre un año nuevo arrastrando docentes y demanda desde un año base.

    Respeta la regla "mantener las horas cronológicas de contrato actual":
    la jornada de cada docente se copia tal cual. Por defecto la distribución
    queda en blanco para re-repartir; con copiar_distribucion=true se arrastra
    la del año base como punto de partida.
    """
    sid = _sid()
    d = request.get_json() or {}
    origen = d.get('year_origen')
    destino = d.get('year_destino')
    copiar_dist = bool(d.get('copiar_distribucion', False))
    copiar_demanda = bool(d.get('copiar_demanda', True))

    if not destino:
        return jsonify({'error': 'Falta year_destino'}), 400
    destino = int(destino)

    existente = _resumen_year(sid, destino)
    if existente['docentes'] or existente['filas_demanda']:
        if not bool(d.get('reemplazar', False)):
            return jsonify({
                'error': f'El año {destino} ya tiene datos.',
                'sugerencia': 'Volvé a enviarlo con reemplazar=true para rehacerlo, '
                              'o usá "reiniciar distribución" si querés conservar '
                              'docentes y demanda.',
                'resumen': existente,
            }), 409
        # Rehacer: se borra el año destino antes de reconstruirlo
        CargaAsignacion.query.filter_by(school_id=sid, year=destino)\
            .delete(synchronize_session=False)
        CargaDocente.query.filter_by(school_id=sid, year=destino)\
            .delete(synchronize_session=False)
        CargaDemanda.query.filter_by(school_id=sid, year=destino)\
            .delete(synchronize_session=False)
        db.session.commit()

    creados = {'docentes': 0, 'demanda': 0, 'asignaciones': 0}

    if not origen:
        # Proceso en blanco: no hay nada que copiar
        return jsonify({'ok': True, 'year': destino, 'creados': creados,
                        'resumen': _resumen_year(sid, destino)}), 201

    origen = int(origen)

    # 1) Demanda
    mapa_demanda = {}
    if copiar_demanda:
        for src in CargaDemanda.query.filter_by(school_id=sid, year=origen)\
                .order_by(CargaDemanda.orden, CargaDemanda.id).all():
            nueva = CargaDemanda(
                school_id=sid, year=destino, departamento=src.departamento,
                subject_id=src.subject_id,
                asignatura=src.asignatura, nivel=src.nivel, por_letra=src.por_letra,
                letras=src.letras, horas_por_grupo=src.horas_por_grupo, orden=src.orden)
            db.session.add(nueva)
            db.session.flush()
            mapa_demanda[src.id] = nueva.id
            creados['demanda'] += 1

    # 2) Docentes — se mantiene la jornada contratada
    mapa_docente = {}
    for src in CargaDocente.query.filter_by(school_id=sid, year=origen)\
            .order_by(CargaDocente.orden, CargaDocente.id).all():
        nuevo = CargaDocente(
            school_id=sid, year=destino, nombre=src.nombre, rut=src.rut,
            user_id=src.user_id, departamento=src.departamento, nivel=src.nivel,
            horas_contrato=src.horas_contrato,          # regla: jornada se mantiene
            no_lectivas_json=src.no_lectivas_json, orden=src.orden)
        db.session.add(nuevo)
        db.session.flush()
        mapa_docente[src.id] = nuevo.id
        creados['docentes'] += 1

    # 3) Distribución (opcional)
    if copiar_dist:
        for src in CargaAsignacion.query.filter_by(school_id=sid, year=origen)\
                .order_by(CargaAsignacion.orden, CargaAsignacion.id).all():
            if src.docente_id not in mapa_docente:
                continue
            db.session.add(CargaAsignacion(
                school_id=sid, year=destino, docente_id=mapa_docente[src.docente_id],
                tipo=src.tipo, demanda_id=mapa_demanda.get(src.demanda_id),
                asignatura_libre=src.asignatura_libre, letras=src.letras,
                horas=src.horas, orden=src.orden))
            creados['asignaciones'] += 1

    db.session.commit()
    return jsonify({'ok': True, 'year': destino, 'year_origen': origen,
                    'creados': creados, 'resumen': _resumen_year(sid, destino)}), 201


@carga_bp.route('/procesos/mover', methods=['POST'])
@jwt_required()
@school_required
def mover_proceso():
    """Reetiqueta un proceso completo a otro año. Útil cuando se cargaron
    datos históricos bajo el año equivocado."""
    sid = _sid()
    d = request.get_json() or {}
    desde, hasta = d.get('desde'), d.get('hasta')
    if not desde or not hasta:
        return jsonify({'error': 'Faltan "desde" y "hasta"'}), 400
    desde, hasta = int(desde), int(hasta)
    if desde == hasta:
        return jsonify({'error': 'Los años deben ser distintos'}), 400

    destino = _resumen_year(sid, hasta)
    if destino['docentes'] or destino['filas_demanda']:
        if not bool(d.get('reemplazar', False)):
            return jsonify({
                'error': f'El año {hasta} ya tiene datos; no se puede sobrescribir.',
                'sugerencia': 'Enviá reemplazar=true para borrar el año destino primero.',
                'resumen': destino,
            }), 409
        for Model in (CargaAsignacion, CargaDocente, CargaDemanda):
            Model.query.filter_by(school_id=sid, year=hasta)\
                .delete(synchronize_session=False)
        db.session.commit()

    movidos = {}
    for Model, key in ((CargaDemanda, 'demanda'), (CargaDocente, 'docentes'),
                       (CargaAsignacion, 'asignaciones')):
        movidos[key] = Model.query.filter_by(school_id=sid, year=desde)\
            .update({'year': hasta}, synchronize_session=False)
    db.session.commit()
    return jsonify({'ok': True, 'desde': desde, 'hasta': hasta, 'movidos': movidos,
                    'resumen': _resumen_year(sid, hasta)}), 200


@carga_bp.route('/procesos/<int:year>/reiniciar-distribucion', methods=['POST'])
@jwt_required()
@school_required
def reiniciar_distribucion(year):
    """Borra la distribución del año conservando docentes y demanda,
    para repartir las horas desde cero."""
    sid = _sid()
    # El horario cuelga de las asignaciones: si se borran, queda huérfano
    HorarioCelda.query.filter_by(school_id=sid, year=year)\
        .delete(synchronize_session=False)
    borradas = CargaAsignacion.query.filter_by(school_id=sid, year=year)\
        .delete(synchronize_session=False)
    db.session.commit()
    return jsonify({'ok': True, 'year': year, 'asignaciones_borradas': borradas,
                    'resumen': _resumen_year(sid, year)}), 200


@carga_bp.route('/procesos/<int:year>/copiar-distribucion', methods=['POST'])
@jwt_required()
@school_required
def copiar_distribucion(year):
    """Trae la distribución de otro año como punto de partida, emparejando
    docentes por nombre y demanda por (asignatura, nivel)."""
    sid = _sid()
    d = request.get_json() or {}
    origen = d.get('year_origen')
    if not origen:
        return jsonify({'error': 'Falta year_origen'}), 400
    origen = int(origen)

    if CargaAsignacion.query.filter_by(school_id=sid, year=year).count():
        return jsonify({'error': f'El año {year} ya tiene distribución. '
                                 f'Reinicia la distribución antes de copiar.'}), 409

    docs_dest = {d_.nombre: d_.id for d_ in CargaDocente.query.filter_by(school_id=sid, year=year).all()}
    dem_dest = {(x.asignatura, x.nivel): x.id for x in CargaDemanda.query.filter_by(school_id=sid, year=year).all()}

    copiadas, omitidas = 0, []
    for src in CargaAsignacion.query.filter_by(school_id=sid, year=origen)\
            .order_by(CargaAsignacion.orden, CargaAsignacion.id).all():
        doc_src = CargaDocente.query.get(src.docente_id)
        if not doc_src or doc_src.nombre not in docs_dest:
            omitidas.append(doc_src.nombre if doc_src else '?')
            continue
        nuevo_dem = None
        if src.demanda:
            nuevo_dem = dem_dest.get((src.demanda.asignatura, src.demanda.nivel))
        db.session.add(CargaAsignacion(
            school_id=sid, year=year, docente_id=docs_dest[doc_src.nombre],
            tipo=src.tipo, demanda_id=nuevo_dem, asignatura_libre=src.asignatura_libre,
            letras=src.letras, horas=src.horas, orden=src.orden))
        copiadas += 1
    db.session.commit()
    return jsonify({'ok': True, 'year': year, 'year_origen': origen,
                    'copiadas': copiadas, 'docentes_sin_par': sorted(set(omitidas)),
                    'resumen': _resumen_year(sid, year)}), 200


@carga_bp.route('/procesos/<int:year>', methods=['DELETE'])
@jwt_required()
@school_required
def delete_proceso(year):
    """Elimina por completo el proceso de un año."""
    sid = _sid()
    borrados = {}
    borrados['asignaciones'] = CargaAsignacion.query.filter_by(school_id=sid, year=year)\
        .delete(synchronize_session=False)
    borrados['docentes'] = CargaDocente.query.filter_by(school_id=sid, year=year)\
        .delete(synchronize_session=False)
    borrados['demanda'] = CargaDemanda.query.filter_by(school_id=sid, year=year)\
        .delete(synchronize_session=False)
    borrados['horario'] = HorarioCelda.query.filter_by(school_id=sid, year=year)\
        .delete(synchronize_session=False)
    db.session.commit()
    return jsonify({'ok': True, 'year': year, 'borrados': borrados}), 200


@carga_bp.route('/docentes/<int:did>/referencia', methods=['GET'])
@jwt_required()
@school_required
def referencia_docente(did):
    """Devuelve la carga que tuvo este mismo docente en otro año, para tenerla
    a la vista al re-repartir (regla: mover de niveles a los docentes)."""
    sid = _sid()
    doc = CargaDocente.query.filter_by(id=did, school_id=sid).first_or_404()
    year_origen = request.args.get('year_origen', type=int) or (doc.year - 1)
    par = CargaDocente.query.filter_by(school_id=sid, year=year_origen, nombre=doc.nombre).first()
    if not par:
        return jsonify({'year_origen': year_origen, 'encontrado': False,
                        'asignaciones': [], 'horas_contrato': None}), 200
    info = par.to_dict()
    return jsonify({
        'year_origen': year_origen,
        'encontrado': True,
        'horas_contrato': info['horas_contrato'],
        'horas_pedagogicas': info['horas_pedagogicas'],
        'total_lectivas': info['total_lectivas'],
        'disponibilidad': info['disponibilidad'],
        'cambio_jornada': info['horas_contrato'] != doc.horas_contrato,
        'asignaciones': info['asignaciones'],
    }), 200


# ══════════════════════════════════════════════════════════════════════
#  CATÁLOGO DE ACTIVIDADES NO LECTIVAS
# ══════════════════════════════════════════════════════════════════════

@carga_bp.route('/actividades', methods=['GET'])
@jwt_required()
@school_required
def list_actividades():
    """Catálogo del colegio. Si está vacío lo siembra con las actividades base."""
    sid = _sid()
    if ActividadNoLectiva.query.filter_by(school_id=sid).count() == 0:
        for i, a in enumerate(ACTIVIDADES_NO_LECTIVAS_DEFAULT):
            db.session.add(ActividadNoLectiva(
                school_id=sid, nombre=a['actividad'],
                minutos_default=a['minutos'], orden=i))
        db.session.commit()
    rows = ActividadNoLectiva.query.filter_by(school_id=sid, is_active=True)\
        .order_by(ActividadNoLectiva.orden, ActividadNoLectiva.nombre).all()
    return jsonify([r.to_dict() for r in rows]), 200


@carga_bp.route('/actividades', methods=['POST'])
@jwt_required()
@school_required
def create_actividad():
    """Crea una actividad en el catálogo. Reutiliza si el nombre ya existe."""
    d = request.get_json() or {}
    nombre = (d.get('nombre') or '').strip()
    if not nombre:
        return jsonify({'error': 'El nombre es obligatorio'}), 400
    ex = ActividadNoLectiva.query.filter_by(school_id=_sid(), nombre=nombre).first()
    if ex:
        if not ex.is_active:
            ex.is_active = True
            db.session.commit()
        return jsonify({**ex.to_dict(), 'ya_existia': True}), 200
    n = ActividadNoLectiva.query.filter_by(school_id=_sid()).count()
    row = ActividadNoLectiva(school_id=_sid(), nombre=nombre,
                             minutos_default=d.get('minutos_default', 60), orden=n)
    db.session.add(row)
    db.session.commit()
    return jsonify({**row.to_dict(), 'ya_existia': False}), 201


@carga_bp.route('/actividades/<int:aid>', methods=['DELETE'])
@jwt_required()
@school_required
def delete_actividad(aid):
    row = ActividadNoLectiva.query.filter_by(id=aid, school_id=_sid()).first_or_404()
    row.is_active = False       # baja lógica: no rompe cargas que ya la usan
    db.session.commit()
    return jsonify({'ok': True}), 200


# ══════════════════════════════════════════════════════════════════════
#  PUBLICACIÓN A COURSE_SUBJECT
#  Vuelca el reparto al libro de clases: una fila por curso real.
# ══════════════════════════════════════════════════════════════════════

def _asegurar_usuario_docente(doc, school_id):
    """Devuelve el user_id del docente, creándolo inactivo si hace falta.

    Se crea con is_active=False: sirve para vincular la carga y figurar en el
    libro, pero no puede entrar al sistema hasta que lo activen.
    """
    if doc.user_id:
        return doc.user_id, False
    partes = (doc.nombre or '').strip().split()
    nombre = partes[0] if partes else 'Docente'
    apellido = ' '.join(partes[1:]) or '—'
    import unicodedata
    base = f"{nombre}.{apellido.split()[0] if apellido != '—' else 'docente'}".lower()
    # Quitar tildes y ñ: el email debe ser ASCII
    base = unicodedata.normalize('NFKD', base).encode('ascii', 'ignore').decode()
    base = ''.join(c for c in base.replace(' ', '.') if c.isalnum() or c == '.') or 'docente'
    email = f"{base}@docente.local"
    i = 1
    while User.query.filter_by(email=email).first():
        i += 1
        email = f"{base}{i}@docente.local"
    u = User(school_id=school_id, email=email, first_name=nombre, last_name=apellido,
             rut=doc.rut, role='profesor', is_active=False)
    u.set_password(f'cambiar{date.today().year}')
    db.session.add(u)
    db.session.flush()
    doc.user_id = u.id
    return u.id, True


@carga_bp.route('/procesos/<int:year>/publicar', methods=['POST'])
@jwt_required()
@school_required
def publicar_proceso(year):
    """Expande la carga del año en filas de CourseSubject.

    "Lengua y Literatura · I Medio · A,B,C · 18 h" se convierte en tres filas
    de 6 h, una por curso real, con su docente. Solo se publican las filas
    enlazadas al catálogo de asignaturas; disponibilidad, jefatura y demás
    quedan únicamente en la carga.
    """
    sid = _sid()
    d = request.get_json() or {}
    reemplazar = bool(d.get('reemplazar', True))

    docentes = CargaDocente.query.filter_by(school_id=sid, year=year).all()
    if not docentes:
        return jsonify({'error': f'No hay docentes en el proceso {year}'}), 404

    cursos = Course.query.filter_by(school_id=sid, year=year).all()
    if not cursos:
        cursos = Course.query.filter_by(school_id=sid).all()
    por_nombre = {c.name: c for c in cursos}
    por_nivel_letra = {(c.level, c.letter): c for c in cursos if c.level and c.letter}

    resultado = {'filas': 0, 'usuarios_creados': 0, 'cursos_no_encontrados': [],
                 'omitidas_sin_catalogo': 0, 'reemplazadas': 0}
    publicadas = []

    for doc in docentes:
        user_id = None
        for a in doc.asignaciones:
            if a.tipo != 'asignatura' or not a.demanda:
                continue
            dem = a.demanda
            if not dem.subject_id:
                resultado['omitidas_sin_catalogo'] += 1
                continue

            letras = [x.strip() for x in (a.letras or '').split(',') if x.strip()]
            if dem.por_letra and letras:
                horas_por_curso = dem.horas_por_grupo
                objetivos = []
                for L in letras:
                    c = por_nivel_letra.get((dem.nivel, L)) or por_nombre.get(f'{dem.nivel} {L}')
                    if c:
                        objetivos.append(c)
                    else:
                        resultado['cursos_no_encontrados'].append(f'{dem.nivel} {L}')
            else:
                # Grupo único (electivos): se cuelga del primer curso del nivel
                c = por_nivel_letra.get((dem.nivel, 'A')) or por_nombre.get(f'{dem.nivel} A')
                objetivos = [c] if c else []
                if not c:
                    resultado['cursos_no_encontrados'].append(dem.nivel)
                horas_por_curso = a.horas

            if objetivos and user_id is None:
                user_id, creado = _asegurar_usuario_docente(doc, sid)
                if creado:
                    resultado['usuarios_creados'] += 1

            for c in objetivos:
                existente = CourseSubject.query.filter_by(
                    course_id=c.id, subject_id=dem.subject_id).first()
                if existente:
                    if reemplazar:
                        existente.teacher_id = user_id
                        existente.hours_per_week = horas_por_curso
                        resultado['reemplazadas'] += 1
                    publicadas.append(existente)
                else:
                    cs = CourseSubject(course_id=c.id, subject_id=dem.subject_id,
                                       teacher_id=user_id, hours_per_week=horas_por_curso)
                    db.session.add(cs)
                    publicadas.append(cs)
                    resultado['filas'] += 1

    db.session.commit()
    resultado['cursos_no_encontrados'] = sorted(set(resultado['cursos_no_encontrados']))
    resultado['total_publicadas'] = len(publicadas)
    return jsonify({'ok': True, 'year': year, **resultado}), 200


# ══════════════════════════════════════════════════════════════════════
#  HORARIO SEMANAL
# ══════════════════════════════════════════════════════════════════════

def _bloques(sid, year, crear=True):
    rows = HorarioBloque.query.filter_by(school_id=sid, year=year)\
        .order_by(HorarioBloque.orden).all()
    if not rows and crear:
        for b in BLOQUES_DEFAULT:
            db.session.add(HorarioBloque(school_id=sid, year=year, **b))
        db.session.commit()
        rows = HorarioBloque.query.filter_by(school_id=sid, year=year)\
            .order_by(HorarioBloque.orden).all()
    return rows


@carga_bp.route('/horario/bloques', methods=['GET'])
@jwt_required()
@school_required
def get_bloques():
    return jsonify({
        'dias': DIAS_SEMANA,
        'bloques': [b.to_dict() for b in _bloques(_sid(), _year())],
    }), 200


@carga_bp.route('/horario/bloques', methods=['PUT'])
@jwt_required()
@school_required
def set_bloques():
    """Reemplaza la estructura de bloques del año."""
    sid, year = _sid(), _year()
    d = request.get_json() or {}
    nuevos = d.get('bloques')
    if not isinstance(nuevos, list) or not nuevos:
        return jsonify({'error': 'Se requiere una lista de bloques'}), 400
    HorarioCelda.query.filter_by(school_id=sid, year=year).delete(synchronize_session=False)
    HorarioBloque.query.filter_by(school_id=sid, year=year).delete(synchronize_session=False)
    for i, b in enumerate(nuevos):
        db.session.add(HorarioBloque(
            school_id=sid, year=year, orden=i,
            etiqueta=b.get('etiqueta', ''), inicio=b.get('inicio'),
            fin=b.get('fin'), tipo=b.get('tipo', 'clase')))
    db.session.commit()
    return jsonify({'ok': True, 'bloques': [b.to_dict() for b in _bloques(sid, year)]}), 200


@carga_bp.route('/docentes/<int:did>/horario', methods=['GET'])
@jwt_required()
@school_required
def get_horario(did):
    sid = _sid()
    doc = CargaDocente.query.filter_by(id=did, school_id=sid).first_or_404()
    bloques = _bloques(sid, doc.year)
    celdas = HorarioCelda.query.filter_by(school_id=sid, docente_id=did).all()

    # Cuántos bloques de clase tiene puestos vs. sus horas pedagógicas
    ids_clase = {b.id for b in bloques if b.tipo == 'clase'}
    puestos = sum(1 for c in celdas if c.asignacion_id and c.bloque_id in ids_clase)
    info = doc.to_dict()

    return jsonify({
        'docente': {'id': doc.id, 'nombre': doc.nombre, 'year': doc.year,
                    'horas_contrato': info['horas_contrato'],
                    'horas_pedagogicas': info['horas_pedagogicas']},
        'dias': DIAS_SEMANA,
        'bloques': [b.to_dict() for b in bloques],
        'celdas': [c.to_dict() for c in celdas],
        'asignaciones': info['asignaciones'],
        'bloques_puestos': puestos,
        'bloques_faltantes': info['horas_pedagogicas'] - puestos,
    }), 200


@carga_bp.route('/docentes/<int:did>/horario', methods=['PUT'])
@jwt_required()
@school_required
def set_celda(did):
    """Pone o limpia una celda del horario."""
    sid = _sid()
    doc = CargaDocente.query.filter_by(id=did, school_id=sid).first_or_404()
    d = request.get_json() or {}
    bloque_id, dia = d.get('bloque_id'), d.get('dia')
    if bloque_id is None or dia is None:
        return jsonify({'error': 'Faltan bloque_id y dia'}), 400

    celda = HorarioCelda.query.filter_by(
        docente_id=did, bloque_id=bloque_id, dia=dia).first()

    asignacion_id = d.get('asignacion_id') or None
    etiqueta = (d.get('etiqueta_libre') or '').strip() or None

    if not asignacion_id and not etiqueta:
        if celda:
            db.session.delete(celda)
            db.session.commit()
        return jsonify({'ok': True, 'celda': None}), 200

    if asignacion_id:
        a = CargaAsignacion.query.filter_by(id=asignacion_id, docente_id=did).first()
        if not a:
            return jsonify({'error': 'La asignación no pertenece a este docente'}), 400

    if not celda:
        celda = HorarioCelda(school_id=sid, year=doc.year, docente_id=did,
                             bloque_id=bloque_id, dia=dia)
        db.session.add(celda)
    celda.asignacion_id = asignacion_id
    celda.letra = (d.get('letra') or None) if asignacion_id else None
    celda.etiqueta_libre = None if asignacion_id else etiqueta
    db.session.commit()
    return jsonify({'ok': True, 'celda': celda.to_dict()}), 200


@carga_bp.route('/docentes/<int:did>/horario/autocompletar', methods=['POST'])
@jwt_required()
@school_required
def autocompletar_horario(did):
    """Reparte las horas del docente en la grilla.

    Cada asignación por letra se abre en un curso concreto —"8° A,B,C · 18 h"
    son 6 h en 8°A, 6 en 8°B y 6 en 8°C— porque el docente no puede estar en
    los tres cursos a la vez. Las horas de un mismo curso se reparten entre
    días distintos para no amontonarlas.
    """
    sid = _sid()
    doc = CargaDocente.query.filter_by(id=did, school_id=sid).first_or_404()
    todos = _bloques(sid, doc.year)
    clases = [b for b in todos if b.tipo == 'clase']
    contacto = [b for b in todos if b.tipo == 'contacto']
    if not clases:
        return jsonify({'error': 'No hay bloques de clase definidos'}), 400

    if (request.get_json() or {}).get('limpiar', True):
        HorarioCelda.query.filter_by(docente_id=did).delete(synchronize_session=False)
        db.session.commit()

    ocupadas = {(c.bloque_id, c.dia) for c in
                HorarioCelda.query.filter_by(docente_id=did).all()}
    n_dias = len(DIAS_SEMANA)
    puestas, sin_espacio = 0, 0

    def poner(bloque_id, dia, asignacion_id, letra=None):
        nonlocal puestas
        db.session.add(HorarioCelda(
            school_id=sid, year=doc.year, docente_id=did, bloque_id=bloque_id,
            dia=dia, asignacion_id=asignacion_id, letra=letra))
        ocupadas.add((bloque_id, dia))
        puestas += 1

    def primer_libre(dia, saltar=()):
        for b in clases:
            if (b.id, dia) not in ocupadas and b.id not in saltar:
                return b.id
        return None

    asigs = sorted(doc.asignaciones, key=lambda x: (x.orden or 0, x.id))

    # 1) Toma de contacto: va en el bloque de contacto, todos los días
    for a in asigs:
        if a.tipo != 'toma_contacto' or not contacto:
            continue
        # Es una rutina diaria: ocupa el bloque de contacto toda la semana,
        # aunque en la carga cuente como una sola hora pedagógica
        b = contacto[0]
        for dia in range(n_dias):
            if (b.id, dia) not in ocupadas:
                poner(b.id, dia, a.id)

    # 2) Unidades a ubicar: (asignación, letra, horas)
    unidades = []
    for a in asigs:
        if a.tipo == 'toma_contacto' and contacto:
            continue
        dem = a.demanda
        letras = [x.strip() for x in (a.letras or '').split(',') if x.strip()]
        if a.tipo == 'asignatura' and dem and dem.por_letra and letras:
            for L in letras:
                unidades.append((a, L, int(dem.horas_por_grupo or 0)))
        else:
            unidades.append((a, None, int(a.horas or 0)))

    # 3) Repartir cada unidad entre días distintos, arrancando en días rotados
    #    para que no se apilen todas al comienzo de la semana
    inicio_dia = 0
    for a, letra, horas in unidades:
        usados = set()
        for h in range(horas):
            colocado = False
            # Primero intenta un día que aún no tenga este curso
            for intento in range(n_dias * 2):
                dia = (inicio_dia + h + intento) % n_dias
                if intento < n_dias and dia in usados:
                    continue
                bid = primer_libre(dia)
                if bid is not None:
                    poner(bid, dia, a.id, letra)
                    usados.add(dia)
                    colocado = True
                    break
            if not colocado:
                sin_espacio += 1
        inicio_dia = (inicio_dia + 1) % n_dias

    db.session.commit()
    return jsonify({'ok': True, 'bloques_puestos': puestas,
                    'sin_espacio': sin_espacio}), 200


# ── PDF del horario semanal ───────────────────────────────────────────

TIPO_FILL = {
    'recreo':   '#D9D9D9',
    'almuerzo': '#F2F2F2',
    'contacto': '#FFF2CC',
    'reunion':  '#E2EFDA',
}


def _logo_bytes(school):
    """Devuelve los bytes del logo del colegio, que se guarda como data URL."""
    url = getattr(school, 'logo_url', None) or ''
    if not url.startswith('data:'):
        return None
    try:
        import base64
        return base64.b64decode(url.split(',', 1)[1])
    except Exception:
        return None


def _logo_flowable(school, ImageCls, alto):
    """Logo como flowable de reportlab, respetando su proporción."""
    raw = _logo_bytes(school)
    if not raw:
        return None
    try:
        from reportlab.lib.utils import ImageReader
        src = io.BytesIO(raw)
        iw, ih = ImageReader(src).getSize()
        src.seek(0)
        return ImageCls(src, width=alto * (iw / ih), height=alto)
    except Exception:
        return None


def _pdf_horario(school, doc, bloques, celdas, year):
    from reportlab.lib.pagesizes import landscape, letter
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import (SimpleDocTemplate, Table, TableStyle,
                                    Paragraph, Spacer, Image)
    from reportlab.lib.enums import TA_CENTER

    buf = io.BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=landscape(letter),
                            leftMargin=1.1 * cm, rightMargin=1.1 * cm,
                            topMargin=0.9 * cm, bottomMargin=0.9 * cm)
    story = []

    st_col = ParagraphStyle('col', fontName='Helvetica-Bold', fontSize=7.5,
                            alignment=TA_CENTER, textColor=colors.black, leading=9)
    st_cel = ParagraphStyle('cel', fontName='Helvetica', fontSize=6.3,
                            alignment=TA_CENTER, leading=7.4)
    st_h1 = ParagraphStyle('h1', fontName='Helvetica-Bold', fontSize=11, leading=13)
    st_h2 = ParagraphStyle('h2', fontName='Helvetica', fontSize=8, leading=10)
    st_tit = ParagraphStyle('tit', fontName='Helvetica-Bold', fontSize=10.5,
                            alignment=TA_CENTER, leading=13)

    # Encabezado institucional, con logo si el colegio lo tiene
    cab = [Paragraph(school.name if school else 'Colegio', st_h1)]
    if school and school.rector:
        cab.append(Paragraph(school.rector, st_h2))
    cab.append(Paragraph('Coordinación Académica', st_h2))
    cab.append(Paragraph(str(year), st_h2))

    logo = _logo_flowable(school, Image, 1.6 * cm)
    if logo is not None:
        head = Table([[logo, cab]], colWidths=[1.9 * cm, None])
        head.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        story.append(head)
    else:
        story.extend(cab)

    story.append(Spacer(1, 6))
    nivel_txt = {'Media': 'EDUCACIÓN MEDIA', 'Básica': 'EDUCACIÓN BÁSICA'}.get(
        doc.nivel, (doc.nivel or '').upper())
    story.append(Paragraph(
        f"HORARIO {nivel_txt} {(school.name if school else '').upper()}".strip(), st_tit))
    story.append(Spacer(1, 5))

    info = doc.to_dict(with_asignaciones=False)
    enc = Table([['DOCENTE', f"{doc.nombre.upper()}  ({info['horas_pedagogicas']} horas)"]],
                colWidths=[2.6 * cm, 9 * cm])
    enc.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.6, colors.black),
        ('FONTNAME', (0, 0), (0, 0), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('ALIGN', (1, 0), (1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(enc)
    story.append(Spacer(1, 6))

    # Grilla
    mapa = {(c.bloque_id, c.dia): c for c in celdas}
    data = [[Paragraph('HORA', st_col)] + [Paragraph(d.upper(), st_col) for d in DIAS_SEMANA]]
    estilos = [
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#D9D9D9')),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]

    for i, b in enumerate(bloques, start=1):
        etiqueta = (b.etiqueta or '').strip()
        rango = f"{b.inicio}–{b.fin}"
        if b.tipo == 'recreo':
            izq = f"RECREO<br/>{rango}"
        elif b.tipo == 'almuerzo':
            izq = f"ALMUERZO<br/>{rango}"
        else:
            izq = f"{etiqueta}<br/>{rango}" if etiqueta else rango
        fila = [Paragraph(izq, st_col)]

        for dia in range(len(DIAS_SEMANA)):
            if b.tipo in ('recreo', 'almuerzo'):
                fila.append(Paragraph('', st_cel))
                continue
            c = mapa.get((b.id, dia))
            fila.append(Paragraph((c.texto() if c else '').upper(), st_cel))
        data.append(fila)

        fill = TIPO_FILL.get(b.tipo)
        if fill:
            estilos.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor(fill)))

    ancho_util = pdf.width
    col_hora = 2.1 * cm
    ancho_dia = (ancho_util - col_hora) / len(DIAS_SEMANA)
    grid = Table(data, colWidths=[col_hora] + [ancho_dia] * len(DIAS_SEMANA),
                 repeatRows=1)
    grid.setStyle(TableStyle(estilos))
    story.append(grid)

    # Pie: resumen de la jornada
    story.append(Spacer(1, 7))
    pie = Table([[
        f"Jornada contratada: {info['horas_contrato']} h",
        f"Horas en aula: {info['horas_pedagogicas']}",
        f"No lectivas: {fmt_hm(info['no_lectivas_min'])}",
        f"Recreo: {fmt_hm(info['recreo_min'])}",
    ]], colWidths=[pdf.width / 4.0] * 4)
    pie.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#999999')),
        ('FONTSIZE', (0, 0), (-1, -1), 7.5),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F2F2F2')),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(pie)

    pdf.build(story)
    buf.seek(0)
    return buf


@carga_bp.route('/docentes/<int:did>/horario.pdf', methods=['GET'])
@jwt_required()
@school_required
def horario_pdf(did):
    sid = _sid()
    doc = CargaDocente.query.filter_by(id=did, school_id=sid).first_or_404()
    bloques = _bloques(sid, doc.year)
    celdas = HorarioCelda.query.filter_by(school_id=sid, docente_id=did).all()
    school = School.query.get(sid)
    buf = _pdf_horario(school, doc, bloques, celdas, doc.year)
    nombre = (doc.nombre or 'docente').replace(' ', '_')
    return send_file(buf, as_attachment=True,
                     download_name=f'Horario_{nombre}_{doc.year}.pdf',
                     mimetype='application/pdf')


@carga_bp.route('/horarios-departamento.pdf', methods=['GET'])
@jwt_required()
@school_required
def horarios_departamento_pdf():
    """Un PDF con el horario de todos los docentes del departamento."""
    from pypdf import PdfWriter
    sid, year = _sid(), _year()
    dep = request.args.get('departamento')
    q = CargaDocente.query.filter_by(school_id=sid, year=year)
    if dep:
        q = q.filter_by(departamento=dep)
    docentes = q.order_by(CargaDocente.orden, CargaDocente.id).all()
    if not docentes:
        return jsonify({'error': 'No hay docentes para ese departamento'}), 404

    school = School.query.get(sid)
    bloques = _bloques(sid, year)
    writer = PdfWriter()
    for doc in docentes:
        celdas = HorarioCelda.query.filter_by(school_id=sid, docente_id=doc.id).all()
        writer.append(_pdf_horario(school, doc, bloques, celdas, year))
    out = io.BytesIO()
    writer.write(out)
    writer.close()
    out.seek(0)
    slug = (dep or 'Todos').replace(' ', '_')
    return send_file(out, as_attachment=True,
                     download_name=f'Horarios_{slug}_{year}.pdf',
                     mimetype='application/pdf')
