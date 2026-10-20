"""Ficha de matrícula del alumno en PDF (A4, 2 páginas para un caso normal).

Mismas secciones que el formulario oficial del colegio, con un diseño más
limpio: barras de sección con el color del colegio, etiqueta pequeña sobre
el valor en una grilla, "—" para campos vacíos y firmas en miniatura.

Uso (dentro de un app context de Flask):
    pdf_bytes = build_ficha_pdf(student_id, year=2026)
"""
import base64
import io
from datetime import date, datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT, TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (SimpleDocTemplate, Table, TableStyle, Paragraph,
                                Spacer, Image, KeepTogether)
from xml.sax.saxutils import escape

from models import (db, User, School, Course, Enrollment, StudentProfile,
                    StudentMedical, StudentFamilyMember, StudentAuthorization)

VACIO = '—'
MARGEN = 14 * mm
ANCHO = A4[0] - 2 * MARGEN

GRIS_TXT = colors.HexColor('#111827')
GRIS_LBL = colors.HexColor('#6B7280')
GRIS_LINEA = colors.HexColor('#E5E7EB')
GRIS_SUAVE = colors.HexColor('#F9FAFB')

CHIP = {
    # estado → (texto, fondo, color texto)
    'autorizado': ('Autorizado', '#DCFCE7', '#166534'),
    'rechazado': ('Rechazado', '#FEE2E2', '#991B1B'),
    'pendiente': ('Pendiente', '#FEF3C7', '#92400E'),
    'activo': ('Activo', '#DCFCE7', '#166534'),
    'por_confirmar': ('Por confirmar', '#FEF3C7', '#92400E'),
    'retirado': ('Retirado', '#FEE2E2', '#991B1B'),
    'trasladado': ('Trasladado', '#E0E7FF', '#3730A3'),
    'no_continua': ('No continúa', '#F3F4F6', '#374151'),
    'egresado': ('Egresado', '#E0F2FE', '#075985'),
}


# ── Utilidades ──────────────────────────────────────────────────────────────

def _hex(c, default='#2563EB'):
    c = (c or '').strip()
    if len(c) == 7 and c.startswith('#'):
        try:
            int(c[1:], 16)
            return c
        except ValueError:
            pass
    return default


def _mix(hex_color, other, t):
    """Mezcla hex_color con other (t = proporción de other)."""
    a = colors.HexColor(hex_color)
    b = colors.HexColor(other)
    return colors.Color(a.red + (b.red - a.red) * t,
                        a.green + (b.green - a.green) * t,
                        a.blue + (b.blue - a.blue) * t)


def _lum(hex_color):
    c = colors.HexColor(hex_color)
    return 0.2126 * c.red + 0.7152 * c.green + 0.0722 * c.blue


def _fecha(d):
    if not d:
        return None
    if isinstance(d, datetime):
        d = d.date()
    if isinstance(d, date):
        return d.strftime('%d-%m-%Y')
    return str(d)


def _edad(nac, ref):
    if not nac:
        return None
    if isinstance(nac, datetime):
        nac = nac.date()
    años = ref.year - nac.year - ((ref.month, ref.day) < (nac.month, nac.day))
    return años if 0 <= años < 130 else None


def _sino(v):
    if v is None:
        return None
    return 'Sí' if v else 'No'


def _txt(v):
    if v is None:
        return None
    if isinstance(v, bool):
        return _sino(v)
    if isinstance(v, (date, datetime)):
        return _fecha(v)
    s = str(v).strip()
    return s or None


def _tel(v):
    """Formatea teléfonos chilenos guardados solo con dígitos (56912345678 → +56 9 1234 5678)."""
    s = _txt(v)
    if not s:
        return None
    d = s.replace(' ', '').lstrip('+')
    if d.isdigit():
        if len(d) == 11 and d.startswith('569'):
            return f'+56 9 {d[3:7]} {d[7:]}'
        if len(d) == 9 and d.startswith('9'):
            return f'+56 9 {d[1:5]} {d[5:]}'
        if len(d) == 11 and d.startswith('562'):
            return f'+56 2 {d[3:7]} {d[7:]}'
    return s


def _img_from_data_url(url, max_w, max_h):
    if not url or not str(url).startswith('data:'):
        return None
    try:
        raw = base64.b64decode(url.split(',', 1)[1])
        src = io.BytesIO(raw)
        iw, ih = ImageReader(src).getSize()
        src.seek(0)
        esc = min(max_w / iw, max_h / ih)
        return Image(src, width=iw * esc, height=ih * esc)
    except Exception:
        return None


# ── Estilos ─────────────────────────────────────────────────────────────────

class _Estilos:
    def __init__(self, primario):
        self.primario = colors.HexColor(primario)
        # Para textos sobre blanco: si el color del colegio es muy claro, oscurecer
        self.primario_txt = _mix(primario, '#000000', 0.45) if _lum(primario) > 0.6 \
            else self.primario
        self.tinte = _mix(primario, '#FFFFFF', 0.90)
        self.lbl = ParagraphStyle('lbl', fontName='Helvetica', fontSize=8, leading=9.6,
                                  textColor=GRIS_LBL)
        self.val = ParagraphStyle('val', fontName='Helvetica', fontSize=11, leading=13.4,
                                  textColor=GRIS_TXT)
        self.val_b = ParagraphStyle('valb', parent=self.val, fontName='Helvetica-Bold')
        self.alerta = ParagraphStyle('alerta', parent=self.val, fontName='Helvetica-Bold',
                                     textColor=colors.HexColor('#B45309'))
        self.vacio = ParagraphStyle('vacio', parent=self.val, textColor=colors.HexColor('#9CA3AF'))
        self.sec = ParagraphStyle('sec', fontName='Helvetica-Bold', fontSize=11, leading=13.5,
                                  textColor=self.primario_txt)
        self.card = ParagraphStyle('card', fontName='Helvetica-Bold', fontSize=9.5, leading=11.5,
                                   textColor=self.primario_txt)
        self.small = ParagraphStyle('small', fontName='Helvetica', fontSize=9.5, leading=11.8,
                                    textColor=GRIS_TXT)
        self.small_g = ParagraphStyle('smallg', parent=self.small, fontSize=8.5, leading=10.4,
                                      textColor=GRIS_LBL)
        self.chip = ParagraphStyle('chip', fontName='Helvetica-Bold', fontSize=8.5, leading=10,
                                   alignment=TA_CENTER)
        self.esc_nom = ParagraphStyle('escn', fontName='Helvetica-Bold', fontSize=15,
                                      leading=18, textColor=GRIS_TXT)
        self.esc_dat = ParagraphStyle('escd', fontName='Helvetica', fontSize=9.5, leading=12,
                                      textColor=GRIS_LBL)
        self.titulo = ParagraphStyle('tit', fontName='Helvetica-Bold', fontSize=18, leading=22,
                                     textColor=self.primario_txt, alignment=TA_RIGHT)
        self.alumno = ParagraphStyle('alu', fontName='Helvetica-Bold', fontSize=16, leading=19,
                                     textColor=GRIS_TXT)
        self.alumno_sub = ParagraphStyle('alus', fontName='Helvetica', fontSize=10, leading=12.5,
                                         textColor=GRIS_LBL)
        self.firma = ParagraphStyle('firma', fontName='Helvetica', fontSize=9.5, leading=11.5,
                                    textColor=GRIS_LBL, alignment=TA_CENTER)


def _p(texto, st):
    return Paragraph(escape(texto).replace('\n', '<br/>'), st)


def _campo(E, label, valor, bold=False, alerta=False):
    v = _txt(valor)
    st = E.alerta if alerta else E.val_b if bold else E.val
    return [Paragraph(escape(label.upper()), E.lbl),
            _p(v, st) if v else Paragraph(VACIO, E.vacio)]


def _chip(E, estado, ancho=25 * mm):
    texto, fondo, fg = CHIP.get((estado or '').lower(), (estado or VACIO, '#F3F4F6', '#374151'))
    st = ParagraphStyle('c', parent=E.chip, textColor=colors.HexColor(fg))
    t = Table([[Paragraph(escape(texto), st)]], colWidths=[ancho], rowHeights=[5.8 * mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(fondo)),
        ('ROUNDEDCORNERS', [5, 5, 5, 5]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ('LEFTPADDING', (0, 0), (-1, -1), 2), ('RIGHTPADDING', (0, 0), (-1, -1), 2),
    ]))
    return t


def _seccion(E, titulo):
    """Barra delgada: acento de color a la izquierda, fondo tenue y título."""
    t = Table([['', Paragraph(escape(titulo.upper()), E.sec)]],
              colWidths=[1.2 * mm, ANCHO - 1.2 * mm], rowHeights=[7.2 * mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), E.primario),
        ('BACKGROUND', (1, 0), (1, 0), E.tinte),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (0, 0), 0), ('RIGHTPADDING', (0, 0), (0, 0), 0),
        ('LEFTPADDING', (1, 0), (1, 0), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
    ]))
    t.spaceBefore = 2.6 * mm
    t.spaceAfter = 0.8 * mm
    return t


def _grilla(E, filas, ancho=ANCHO, cols=4):
    """filas: lista de filas; cada fila es lista de (label, valor[, span[, bold]])."""
    w = ancho / cols
    data, estilo = [], [
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 5), ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 2.2), ('BOTTOMPADDING', (0, 0), (-1, -1), 2.6),
    ]
    for r, fila in enumerate(filas):
        celdas, c = [], 0
        for item in fila:
            label, valor = item[0], item[1]
            span = item[2] if len(item) > 2 else 1
            bold = item[3] if len(item) > 3 else False
            alerta = item[4] if len(item) > 4 else False
            celdas.append(_campo(E, label, valor, bold, alerta))
            celdas.extend([''] * (span - 1))
            if span > 1:
                estilo.append(('SPAN', (c, r), (c + span - 1, r)))
            c += span
        while c < cols:
            celdas.append('')
            c += 1
        data.append(celdas)
        if r < len(filas) - 1:
            estilo.append(('LINEBELOW', (0, r), (-1, r), 0.4, GRIS_LINEA))
    t = Table(data, colWidths=[w] * cols)
    t.setStyle(TableStyle(estilo))
    return t


# ── Datos ───────────────────────────────────────────────────────────────────

def _matricula(student_id, year):
    q = Enrollment.query.filter_by(student_id=student_id)
    if year:
        q = q.filter(Enrollment.year == year)
    ens = q.all()
    if not ens and year:
        # El year puede venir solo en el curso
        ens = [e for e in Enrollment.query.filter_by(student_id=student_id).all()
               if (db.session.get(Course, e.course_id) or Course()).year == year]
    if not ens:
        return None

    def activo(e):
        st = getattr(e, 'status', None)
        return (st == 'activo') if st else bool(e.is_active)

    def orden(e):
        return (1 if activo(e) else 0,
                getattr(e, 'enrollment_date', None) or (e.enrolled_at.date() if e.enrolled_at else date.min),
                e.id)
    return max(ens, key=orden)


def _estado_matricula(en, profile):
    if en is not None:
        st = getattr(en, 'status', None)
        if st:
            return st
        return 'activo' if en.is_active else 'retirado'
    if profile and profile.status in ('retirado', 'egresado'):
        return profile.status
    return None


def _parentesco(m):
    if not m:
        return None
    if m.relationship == 'Otro' and m.relationship_other:
        return m.relationship_other
    return m.relationship


def _persona_card(E, titulo, m, ancho):
    cols = 2
    if m is None:
        filas = [[('Nombre', None, 2)]]
        cuerpo = _grilla(E, filas, ancho, cols)
    else:
        filas = [
            [('Nombres', m.first_name, 1, True), ('Apellidos', m.last_name, 1, True)],
            [('N° identificación', m.rut), ('Fecha de nacimiento', _fecha(m.birth_date))],
            [('Nacionalidad', m.nationality), ('Parentesco', _parentesco(m))],
            [('Sexo', m.sex), ('Teléfono', _tel(m.phone))],
            [('Correo electrónico', m.email, 2)],
            [('Estudios', m.education_level), ('Profesión', m.profession or m.occupation)],
        ]
        cuerpo = _grilla(E, filas, ancho, cols)
    cab = Table([[Paragraph(escape(titulo.upper()), E.card)]], colWidths=[ancho])
    cab.setStyle(TableStyle([
        ('LINEBELOW', (0, 0), (-1, -1), 0.9, E.primario),
        ('LEFTPADDING', (0, 0), (-1, -1), 5), ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
    ]))
    t = Table([[cab], [cuerpo]], colWidths=[ancho])
    t.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.5, GRIS_LINEA),
        ('ROUNDEDCORNERS', [3, 3, 3, 3]),
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    return t


def _par_cards(E, a, b):
    gap = 4 * mm
    w = (ANCHO - gap) / 2
    t = Table([[_persona_card(E, a[0], a[1], w), '', _persona_card(E, b[0], b[1], w)]],
              colWidths=[w, gap, w])
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    t.spaceBefore = 1.2 * mm
    return t


# ── Encabezado y pie ────────────────────────────────────────────────────────

def _encabezado(E, school, year, curso, profile, en, estado):
    from routes.carga_academica import _logo_flowable

    nombre = school.name if school else 'Colegio'
    datos = []
    if school and school.address:
        datos.append('Dirección: ' + school.address)
    if school and school.phone:
        datos.append('Teléfono: ' + school.phone)
    izq = [Paragraph(escape(nombre), E.esc_nom)]
    if datos:
        izq.append(Paragraph('<br/>'.join(escape(d) for d in datos), E.esc_dat))

    logo = _logo_flowable(school, Image, 15 * mm) if school else None
    if logo is not None and logo.drawWidth > 32 * mm:   # logos muy anchos
        esc = 32 * mm / logo.drawWidth
        logo.drawWidth *= esc
        logo.drawHeight *= esc
    w_logo = (logo.drawWidth + 4 * mm) if logo is not None else 0
    w_der = 78 * mm
    der = [Paragraph(escape(f'Ficha de Matrícula {year}' if year else 'Ficha de Matrícula'),
                     E.titulo)]
    celdas = [logo, izq, der] if logo is not None else [izq, der]
    anchos = ([w_logo] if logo is not None else []) + [ANCHO - w_logo - w_der, w_der]
    cab = Table([celdas], colWidths=anchos)
    cab.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LINEBELOW', (0, 0), (-1, -1), 1.4, E.primario),
    ]))

    # Franja de matrícula: curso, N°, fecha, estado
    f_mat = getattr(en, 'enrollment_date', None) if en is not None else None
    f_mat = f_mat or (profile.enrollment_date if profile else None)
    w = ANCHO / 5
    est_cell = [Paragraph('ESTADO', E.lbl), _chip(E, estado, 26 * mm) if estado
                else Paragraph(VACIO, E.vacio)]
    franja = Table([[
        _campo(E, 'Curso', curso.name if curso else None, True),
        _campo(E, 'Año', year, True),
        _campo(E, 'N° de matrícula', profile.matricula_number if profile else None, True),
        _campo(E, 'Fecha de matrícula', _fecha(f_mat), True),
        est_cell,
    ]], colWidths=[w] * 5)
    franja.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), GRIS_SUAVE),
        ('BOX', (0, 0), (-1, -1), 0.5, GRIS_LINEA),
        ('LINEBEFORE', (1, 0), (-1, -1), 0.4, GRIS_LINEA),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6), ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    franja.spaceBefore = 3 * mm
    return [cab, franja]


def _make_canvas(E, school_name, emitido):
    class _Canvas(rl_canvas.Canvas):
        def __init__(self, *a, **kw):
            super().__init__(*a, **kw)
            self._paginas = []

        def showPage(self):
            self._paginas.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._paginas)
            for st in self._paginas:
                self.__dict__.update(st)
                self._pie(total)
                super().showPage()
            super().save()

        def _pie(self, total):
            y = 8.5 * mm
            self.setStrokeColor(GRIS_LINEA)
            self.setLineWidth(0.5)
            self.line(MARGEN, y + 3.6 * mm, A4[0] - MARGEN, y + 3.6 * mm)
            self.setFont("Helvetica", 8.5)
            self.setFillColor(GRIS_LBL)
            self.drawString(MARGEN, y, school_name)
            self.drawRightString(A4[0] - MARGEN, y,
                                 f'Emitido el {emitido}  ·  Página {self._pageNumber} de {total}')
    return _Canvas


# ── Función principal ───────────────────────────────────────────────────────

def build_ficha_pdf(student_id, year=None):
    """Genera la ficha de matrícula del alumno y devuelve los bytes del PDF.

    Debe llamarse dentro de un app context. Lanza ValueError si el alumno no existe.
    """
    alumno = db.session.get(User, student_id)
    if alumno is None:
        raise ValueError('Alumno no encontrado')

    school = db.session.get(School, alumno.school_id) if alumno.school_id else None
    profile = StudentProfile.query.filter_by(student_id=student_id).first()
    medical = StudentMedical.query.filter_by(student_id=student_id).first()
    familia = StudentFamilyMember.query.filter_by(student_id=student_id) \
        .order_by(StudentFamilyMember.id).all()
    auths = StudentAuthorization.query.filter_by(student_id=student_id) \
        .order_by(StudentAuthorization.template_id.is_(None),
                  StudentAuthorization.template_id, StudentAuthorization.id).all()

    try:
        year = int(year) if year else None
    except (TypeError, ValueError):
        year = None
    en = _matricula(student_id, year)
    curso = db.session.get(Course, en.course_id) if en is not None else None
    if year is None:
        year = (en.year if en is not None and en.year else None) or \
            (curso.year if curso is not None and curso.year else None) or date.today().year
    estado = _estado_matricula(en, profile)

    E = _Estilos(_hex(getattr(school, 'primary_color', None)))
    hoy = date.today()
    P = profile or StudentProfile()
    M = medical or StudentMedical()

    story = _encabezado(E, school, year, curso, profile, en, estado)

    # Nombre destacado del alumno
    nombre = ' '.join(x for x in [alumno.first_name, alumno.last_name] if x)
    story.append(Spacer(1, 3 * mm))

    # ── Datos del estudiante
    edad = _edad(alumno.birth_date, hoy)
    f_nac = _fecha(alumno.birth_date)
    if f_nac and edad is not None:
        f_nac = f'{f_nac}  ({edad} años)'
    genero = P.gender_identity
    if genero == 'Otro' and P.gender_other:
        genero = P.gender_other
    elif not genero and P.gender_other:
        genero = P.gender_other
    story.append(_seccion(E, 'Datos del estudiante'))
    story.append(_grilla(E, [
        [('Apellidos', alumno.last_name, 2, True), ('Nombres', alumno.first_name, 2, True)],
        [('Nombre social', P.social_name), ('N° identificación', alumno.rut),
         ('Sexo', alumno.gender), ('Género', genero)],
        [('Fecha de nacimiento', f_nac), ('Nacionalidad', P.nationality),
         ('Colegio de procedencia', P.previous_school, 2)],
        [('Dirección', alumno.address, 2), ('Comuna', P.comuna), ('Región', P.region)],
        [('Cursos repetidos', P.repeated_courses, 2), ('Teléfono', _tel(alumno.phone)),
         ('Correo electrónico', alumno.email if alumno.email and
          not alumno.email.endswith('.local') else None)],
    ]))

    # ── Emergencia + hogar (lado a lado)
    gap = 4 * mm
    w = (ANCHO - gap) / 2
    emer = _grilla(E, [
        [('Contacto de emergencia', P.emergency_contact_name, 2, True)],
        [('Teléfono 1', _tel(P.emergency_phone)), ('Teléfono 2', _tel(P.emergency_phone_2))],
    ], w, 2)
    hogar = _grilla(E, [
        [('Vive con', P.lives_with, 2, True)],
        [('N° de personas en el hogar', P.household_size), ('N° de hermanos', P.siblings_count)],
    ], w, 2)
    sec_w = (ANCHO - gap) / 2

    def mini_sec(t):
        s = Table([['', Paragraph(escape(t.upper()), E.sec)]],
                  colWidths=[1.2 * mm, sec_w - 1.2 * mm], rowHeights=[7.2 * mm])
        s.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, 0), E.primario),
            ('BACKGROUND', (1, 0), (1, 0), E.tinte),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (0, 0), 0), ('RIGHTPADDING', (0, 0), (0, 0), 0),
            ('LEFTPADDING', (1, 0), (1, 0), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ]))
        return s
    dos = Table([[mini_sec('Datos de emergencia'), '', mini_sec('Hogar del estudiante')],
                 [emer, '', hogar]], colWidths=[w, gap, w])
    dos.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 0.8 * mm),
    ]))
    dos.spaceBefore = 2.6 * mm
    story.append(dos)

    # ── Apoderados y padres
    titular = next((m for m in familia if m.guardian_role == 'titular'), None)
    suplente = next((m for m in familia if m.guardian_role == 'suplente'), None)
    madre = next((m for m in familia if m.relationship == 'Madre'), None)
    padre = next((m for m in familia if m.relationship == 'Padre'), None)
    # Título y tarjetas juntos: un título de sección no queda solo al pie de la página
    story.append(KeepTogether([_seccion(E, 'Apoderados'),
                               _par_cards(E, ('Apoderado titular', titular), ('Apoderado suplente', suplente))]))
    story.append(KeepTogether([_seccion(E, 'Madre y padre'),
                               _par_cards(E, ('Madre', madre), ('Padre', padre))]))

    # ── Salud
    def prob(label, v):
        return (label, 'Sí' if v else 'No', 1, False, bool(v))
    salud = [
        [prob('Problemas visuales', M.problem_visual),
         prob('Problemas auditivos', M.problem_auditory),
         prob('Problemas cardíacos', M.problem_cardiac),
         prob('Problemas de columna', M.problem_spine)],
    ]
    if M.other_problems:
        salud.append([('Otros problemas', M.other_problems, 4)])
    salud += [
        [('Contraindicaciones', M.contraindications, 2), ('Alérgico a', M.allergies, 2)],
        [('Enfermedades crónicas', M.chronic_diseases, 2),
         ('Cuidados especiales', M.special_care, 2)],
        [('Medicamentos', M.medications, 2), ('Observaciones médicas', M.notes, 2)],
    ]
    story.append(KeepTogether([_seccion(E, 'Salud'), _grilla(E, salud)]))

    # ── Autorizaciones
    bloque = [_seccion(E, 'Autorizaciones')]
    if auths:
        w_chip, w_quien, w_firma = 27 * mm, 46 * mm, 32 * mm
        w_txt = ANCHO - w_chip - w_quien - w_firma
        data = [[Paragraph('AUTORIZACIÓN', E.lbl), Paragraph('ESTADO', E.lbl),
                 Paragraph('FIRMADO POR', E.lbl), Paragraph('FIRMA', E.lbl)]]
        for a in auths:
            txt = [_p(a.title, E.small)]
            if a.description:
                txt.append(_p(a.description, E.small_g))
            st = (a.status or 'pendiente').lower()
            quien = []
            if a.signed_by_name or a.signed_at:
                if a.signed_by_name:
                    quien.append(_p(a.signed_by_name, E.small))
                extra = ' · '.join(x for x in [a.signed_by_rut, _fecha(a.signed_at)] if x)
                if extra:
                    quien.append(_p(extra, E.small_g))
            else:
                quien.append(Paragraph(VACIO, E.vacio))
            firma = _img_from_data_url(a.signature_image, w_firma - 6, 9 * mm) \
                or Paragraph(VACIO, E.vacio)
            data.append([txt, _chip(E, st, 23 * mm), quien, firma])
        t = Table(data, colWidths=[w_txt, w_chip, w_quien, w_firma], repeatRows=1)
        estilo = [
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 5), ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 2.4), ('BOTTOMPADDING', (0, 0), (-1, -1), 2.8),
            ('LINEBELOW', (0, 0), (-1, 0), 0.6, GRIS_LINEA),
        ]
        for r in range(1, len(data) - 1):
            estilo.append(('LINEBELOW', (0, r), (-1, r), 0.4, GRIS_LINEA))
        t.setStyle(TableStyle(estilo))
        bloque.append(t)
    else:
        bloque.append(_p('Sin autorizaciones registradas.', E.small_g))
    story.extend(bloque)

    # ── Observaciones
    reglamento = next((a for a in auths if 'reglamento' in (a.title or '').lower()), None)
    acepta = CHIP.get((reglamento.status or '').lower(), (None,))[0] if reglamento else None
    prohib = _sino(P.judicial_restriction)
    if P.judicial_restriction and P.judicial_restriction_detail:
        prohib = f'Sí — {P.judicial_restriction_detail}'
    situacion = []
    if estado in ('retirado', 'trasladado', 'no_continua', 'egresado'):
        f_ret = getattr(en, 'withdrawal_date', None) if en is not None else None
        f_ret = f_ret or P.withdrawal_date
        motivo = (getattr(en, 'withdrawal_reason', None) if en is not None else None) \
            or P.withdrawal_reason
        situacion = [[('Situación', CHIP.get(estado, (estado,))[0], 1, True),
                      ('Fecha de retiro', _fecha(f_ret)),
                      ('Motivo', motivo, 2)]]
    story.append(KeepTogether([
        _seccion(E, 'Observaciones'),
        _grilla(E, [
            [('Prohibición judicial', prohib, 2, False, bool(P.judicial_restriction)),
             ('Aceptación de reglamentos', acepta),
             ('Carta de compromiso', _sino(P.has_commitment_letter))],
            [('Se retira con', P.pickup_with, 4)],
            [('Observaciones', P.observations, 4)],
        ] + situacion),
    ]))

    # ── Firmas
    tit_nombre = titular.full_name if titular else ''
    lw = 70 * mm

    def linea(etq, nom):
        return [Spacer(1, 13 * mm),
                Table([['']], colWidths=[lw], rowHeights=[1],
                      style=[('LINEABOVE', (0, 0), (-1, -1), 0.7, GRIS_TXT)]),
                Paragraph(escape(etq), E.firma),
                Paragraph(escape(nom) if nom else '&nbsp;', E.firma)]
    firmas = Table([[linea('Nombre y firma del apoderado', tit_nombre), '',
                     linea('Nombre y firma de encargado de matrícula', '')]],
                   colWidths=[(ANCHO - 20 * mm) / 2, 20 * mm, (ANCHO - 20 * mm) / 2])
    firmas.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'), ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(KeepTogether([Spacer(1, 2 * mm), firmas]))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=MARGEN, rightMargin=MARGEN,
                            topMargin=MARGEN, bottomMargin=MARGEN + 4 * mm,
                            title=f'Ficha de Matrícula {year} — {nombre}',
                            author=school.name if school else '')
    doc.build(story, canvasmaker=_make_canvas(E, school.name if school else '',
                                              hoy.strftime('%d-%m-%Y')))
    return buf.getvalue()
