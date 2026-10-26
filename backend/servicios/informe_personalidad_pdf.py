"""Informe de personalidad en PDF (carta, una página por alumno).

Sigue el formato que usan los colegios: encabezado con logo y nombre del
colegio, datos del alumno con la escala al lado, una tabla por área con las
columnas Sem. 1 y Sem. 2, observaciones y las firmas del profesor(a) jefe y
de dirección al pie de la página.

Uso (dentro de un app context de Flask):
    pdf_bytes = build_informe_personalidad_pdf(curso, [alumno1, alumno2])
"""
import io
import re
from datetime import date
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer,
                                Image, PageBreak, Flowable)

from models import School, PERSONALIDAD_ESCALA

MARGEN_X = 18 * mm
ANCHO = letter[0] - 2 * MARGEN_X
COL_SEM = 18 * mm

GRIS_CAB = colors.HexColor('#E5E5E5')
GRIS_LINEA = colors.HexColor('#D4D4D4')
NEGRO = colors.HexColor('#111111')


def _estilos():
    base = dict(fontName='Helvetica', textColor=NEGRO)
    return {
        'fecha': ParagraphStyle('fecha', fontSize=8, alignment=TA_RIGHT, **base),
        'colegio': ParagraphStyle('colegio', fontName='Helvetica-Bold', fontSize=15,
                                  leading=18, alignment=TA_CENTER, textColor=NEGRO),
        'titulo': ParagraphStyle('titulo', fontName='Helvetica-Bold', fontSize=15,
                                 leading=18, alignment=TA_CENTER, textColor=NEGRO),
        'anio': ParagraphStyle('anio', fontName='Helvetica-Bold', fontSize=7.5,
                               leading=10, alignment=TA_CENTER, textColor=NEGRO),
        'lbl': ParagraphStyle('lbl', fontName='Helvetica-Bold', fontSize=7.5, leading=9.5,
                              textColor=NEGRO),
        'val': ParagraphStyle('val', fontSize=7.5, leading=9.5, **base),
        'area': ParagraphStyle('area', fontName='Helvetica-Bold', fontSize=7.5, leading=9,
                               alignment=TA_CENTER, textColor=NEGRO),
        'crit': ParagraphStyle('crit', fontSize=8.5, leading=10.5, **base),
        'nota': ParagraphStyle('nota', fontSize=8.5, leading=10.5, alignment=TA_CENTER, **base),
        'obs_tit': ParagraphStyle('obs_tit', fontName='Helvetica-Bold', fontSize=9, leading=12,
                                  textColor=NEGRO),
        'obs': ParagraphStyle('obs', fontSize=8.5, leading=11, **base),
        'firma': ParagraphStyle('firma', fontSize=7.5, leading=9.5, alignment=TA_CENTER, **base),
    }


def _ciudad(school):
    """Última parte de la dirección ("Av. X 123, Maipú" → "Maipú"), si la hay."""
    partes = [p.strip() for p in (school.address or '').split(',') if p.strip()]
    if len(partes) < 2:
        return None
    ciudad = re.sub(r'\d+', '', partes[-1]).strip(' .-')
    return ciudad or None


def _nombre(u):
    return f'{u.first_name or ""} {u.last_name or ""}'.strip()


class _Firmas(Flowable):
    """Ocupa lo que queda de la página y dibuja las firmas abajo del todo."""
    ALTO = 22 * mm

    def __init__(self, izq, der, estilo):
        super().__init__()
        self.izq, self.der, self.estilo = izq, der, estilo
        self._alto = self.ALTO

    def wrap(self, aw, ah):
        self.width = aw
        self._alto = max(ah, self.ALTO)
        return aw, self._alto

    def split(self, aw, ah):
        return [] if ah < self.ALTO else [self]

    def draw(self):
        c = self.canv
        ancho_firma = 75 * mm
        for i, (nombre, cargo) in enumerate((self.izq, self.der)):
            cx = self.width * (0.25 if i == 0 else 0.75)
            y = 10 * mm
            p = Paragraph(escape(nombre or ''), self.estilo)
            w, h = p.wrap(ancho_firma, 20 * mm)
            p.drawOn(c, cx - w / 2, y + 2 * mm)
            c.setDash(2, 1.2)
            c.setLineWidth(0.5)
            c.setStrokeColor(colors.HexColor('#555555'))
            c.line(cx - ancho_firma / 2, y, cx + ancho_firma / 2, y)
            c.setDash()
            p = Paragraph(escape(cargo), self.estilo)
            w, h = p.wrap(ancho_firma, 20 * mm)
            p.drawOn(c, cx - w / 2, y - h - 1.5 * mm)


def _encabezado(E, school, year, ciudad):
    from routes.carga_academica import _logo_flowable
    hoy = date.today().strftime('%d/%m/%Y')
    story = [Paragraph(escape(f'{ciudad}, {hoy}' if ciudad else hoy), E['fecha'])]
    logo = _logo_flowable(school, Image, 17 * mm) if school else None
    if logo is not None and logo.drawWidth > 30 * mm:
        esc = 30 * mm / logo.drawWidth
        logo.drawWidth *= esc
        logo.drawHeight *= esc
    textos = [Paragraph(escape((school.name or '').upper()), E['colegio']),
              Paragraph('INFORME DE PERSONALIDAD', E['titulo']),
              Paragraph(f'Año Escolar: {year}', E['anio'])]
    lado = 32 * mm
    cab = Table([[logo or '', textos, '']], colWidths=[lado, ANCHO - 2 * lado, lado])
    cab.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    story += [cab, Spacer(1, 8 * mm)]
    return story


def _datos(E, alumno, curso, jefe):
    filas = [
        ('Nombre Alumno:', _nombre(alumno).upper()),
        ('Rut:', alumno.rut or ''),
        ('Curso:', (curso.name or '').upper()),
        ('Profesor(a) Jefe:', (jefe or '').upper()),
    ]
    izq = Table([[Paragraph(l, E['lbl']), Paragraph(escape(v), E['val'])] for l, v in filas],
                colWidths=[26 * mm, 80 * mm])
    izq.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0.5),
    ]))
    escala = [Paragraph('Escala:', E['lbl'])] + [
        Paragraph(f'<b>{k}</b>: {escape(v)}', E['val']) for k, v in PERSONALIDAD_ESCALA]
    t = Table([[izq, escala]], colWidths=[ANCHO - 55 * mm, 55 * mm])
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    return [t, Spacer(1, 3 * mm)]


def _tabla(E, areas, resp):
    filas, estilo = [], [
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 3), ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 0.8), ('BOTTOMPADDING', (0, 0), (-1, -1), 1.2),
    ]
    n = 0
    for area, criterios in areas:
        i = len(filas)
        filas.append([Paragraph(escape(area.nombre.upper()), E['area']),
                      Paragraph('Sem. 1', E['area']), Paragraph('Sem. 2', E['area'])])
        estilo.append(('BACKGROUND', (0, i), (-1, i), GRIS_CAB))
        for c in criterios:
            n += 1
            filas.append([Paragraph(f'{n}. {escape(c.texto)}', E['crit']),
                          Paragraph(resp[1].get(c.id, ''), E['nota']),
                          Paragraph(resp[2].get(c.id, ''), E['nota'])])
            j = len(filas) - 1
            estilo += [('LINEBELOW', (0, j), (-1, j), 0.3, GRIS_LINEA),
                       ('LINEBEFORE', (1, j), (-1, j), 0.3, GRIS_LINEA)]
    t = Table(filas, colWidths=[ANCHO - 2 * COL_SEM, COL_SEM, COL_SEM], repeatRows=0)
    t.setStyle(TableStyle(estilo))
    return [t]


def _observaciones(E, obs):
    textos = [(s, (obs.get(s) or '').strip()) for s in (1, 2)]
    textos = [(s, t) for s, t in textos if t]
    story = [Spacer(1, 4 * mm)]
    if not textos:
        story.append(Paragraph('<u>Sin Observaciones</u>', E['obs_tit']))
        return story
    story.append(Paragraph('<u>Observaciones</u>', E['obs_tit']))
    for s, t in textos:
        cuerpo = escape(t).replace('\n', '<br/>')
        etiqueta = f'<b>{s}° semestre:</b> ' if len(textos) > 1 or s == 2 else ''
        story.append(Paragraph(etiqueta + cuerpo, E['obs']))
        story.append(Spacer(1, 1.5 * mm))
    return story


def build_informe_personalidad_pdf(curso, alumnos):
    """PDF con una página (o más, si la pauta es larga) por alumno."""
    from routes.personalidad import pauta, respuestas_de
    E = _estilos()
    school = School.query.get(curso.school_id)
    year = curso.year or date.today().year
    areas = pauta(curso.school_id)
    jefe = _nombre(curso.head_teacher) if curso.head_teacher else ''
    director = (school.rector or '').strip() if school else ''
    ciudad = _ciudad(school) if school else None

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, leftMargin=MARGEN_X, rightMargin=MARGEN_X,
                            topMargin=10 * mm, bottomMargin=12 * mm,
                            title='Informe de personalidad', author=school.name if school else '')
    story = []
    for k, alumno in enumerate(alumnos):
        if k:
            story.append(PageBreak())
        resp, obs = respuestas_de(alumno.id, year)
        story += _encabezado(E, school, year, ciudad)
        story += _datos(E, alumno, curso, jefe)
        story += _tabla(E, areas, resp)
        story += _observaciones(E, obs)
        story.append(_Firmas((jefe, 'Nombre y firma profesor(a) jefe'),
                             (director, 'Director(a)'), E['firma']))
    doc.build(story)
    return buf.getvalue()
