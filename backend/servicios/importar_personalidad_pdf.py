"""Lee informes de personalidad en PDF (formato del sistema anterior del colegio).

Cada página es el informe de un alumno: datos arriba (Nombre Alumno, Rut,
Curso, Profesor(a) Jefe), una tabla por área con las columnas Sem. 1 y
Sem. 2, y las observaciones abajo. Se lee el texto con sus coordenadas:
cada valor (S, G, AV, N, NO) se asigna a la columna cuyo encabezado le queda
más cerca y a la fila del criterio que empieza justo encima (los criterios
largos ocupan dos líneas y el valor queda centrado entre ambas).

Uso:
    paginas = leer_informes(archivo_pdf)   # bytes o file-like
"""
import io
import re

from models import PERSONALIDAD_VALORES

RE_CRITERIO = re.compile(r'^(\d{1,2})\.\s+(.*)$')
RE_ANIO = re.compile(r'A[ñn]o Escolar:\s*(\d{4})')
ETIQUETAS = {
    'Nombre Alumno:': 'nombre', 'Rut:': 'rut', 'Curso:': 'curso', 'Profesor(a) Jefe:': 'profesor',
}


def _fragmentos(pagina):
    """[(x, y, texto)] con y creciendo hacia abajo, como se lee la página."""
    out = []
    alto = float(pagina.mediabox.height)

    def visitor(texto, cm, tm, _fd, _fs):
        t = (texto or '').strip()
        if t:
            # Posición en la página = matriz de texto × matriz de transformación
            x = tm[4] * cm[0] + tm[5] * cm[2] + cm[4]
            y = tm[4] * cm[1] + tm[5] * cm[3] + cm[5]
            out.append((float(x), alto - float(y), t))

    pagina.extract_text(visitor_text=visitor)
    return out


def _leer_pagina(frags):
    if not frags:
        return None
    # Encabezados "Sem. 1" / "Sem. 2": definen las columnas de valores
    sem1 = [x for x, _y, t in frags if t == 'Sem. 1']
    sem2 = [x for x, _y, t in frags if t == 'Sem. 2']
    if not sem1:
        return None
    x1 = min(sem1)
    x2 = min(sem2) if sem2 else x1 + 66
    filas_cab = {round(y) for x, y, t in frags if t in ('Sem. 1', 'Sem. 2')}

    # Datos del alumno: etiqueta a la izquierda y el valor en la misma línea,
    # antes de la columna de la escala
    datos = {}
    etiquetas = [(y, ETIQUETAS[t], x) for x, y, t in frags if t in ETIQUETAS]
    x_escala = min([x for x, _y, t in frags if t == 'Escala:'] or [x1 * 0.7])
    for y, campo, xe in etiquetas:
        partes = sorted((x, t) for x, yy, t in frags
                        if abs(yy - y) <= 2 and xe < x < x_escala and t not in ETIQUETAS)
        datos[campo] = ' '.join(t for _x, t in partes).strip()
    # Un nombre largo se parte en dos líneas centradas respecto de la etiqueta
    y_etiquetas = [y for y, _c, _x in etiquetas]
    for y, campo, xe in etiquetas:
        partes = sorted((yy, x, t) for x, yy, t in frags
                        if abs(yy - y) <= 8 and xe < x < x_escala and t not in ETIQUETAS
                        and not any(abs(yy - ye) <= 2 for ye in y_etiquetas if ye != y))
        if partes:
            datos[campo] = ' '.join(t for _y, _x, t in partes).strip()

    anio = None
    for _x, _y, t in frags:
        m = RE_ANIO.search(t)
        if m:
            anio = int(m.group(1))
            break

    # Criterios: "N. texto" (más las líneas que siguen, si el texto se corta)
    x_texto = min([x for x, _y, t in frags if RE_CRITERIO.match(t)] or [0])
    criterios = []
    for x, y, t in sorted(frags, key=lambda f: (f[1], f[0])):
        if x > x_texto + 5 or x >= x1 - 20:
            continue
        m = RE_CRITERIO.match(t)
        if m:
            criterios.append({'numero': int(m.group(1)), 'texto': m.group(2).strip(), 'y': y,
                              'valores': {1: None, 2: None}})
        elif criterios and 0 < y - criterios[-1]['y'] <= 20 and round(y) not in filas_cab \
                and not t.startswith('Sin Observaciones'):
            ultimo = criterios[-1]
            if not ultimo.get('_cerrado'):
                ultimo['texto'] += ' ' + t
                ultimo['_cerrado'] = True   # a lo más una línea extra
    if not criterios:
        return None

    # Valores: a la fila del criterio que empieza justo encima
    for x, y, t in frags:
        if t not in PERSONALIDAD_VALORES or x < x1 - 20:
            continue
        sem = 1 if abs(x - (x1 + 15)) <= abs(x - (x2 + 15)) else 2
        dueno = None
        for c in criterios:
            if c['y'] <= y + 2:
                dueno = c
        if dueno is not None and dueno['y'] >= y - 20:
            dueno['valores'][sem] = t

    # Observaciones: lo que hay entre la tabla y las firmas
    y_tabla = max(c['y'] for c in criterios)
    y_firmas = min([y for _x, y, t in frags if set(t) == {'-'}]
                   + [y - 13 for _x, y, t in frags if t.startswith('Nombre y firma')]
                   + [10 ** 6]) - 15
    obs = [t for x, y, t in sorted(frags, key=lambda f: (f[1], f[0]))
           if y_tabla + 8 < y < y_firmas and t not in PERSONALIDAD_VALORES
           and t not in ('Sin Observaciones', 'Observaciones', 'Observaciones:')]
    for c in criterios:
        c.pop('y', None)
        c.pop('_cerrado', None)
    return {
        'nombre': datos.get('nombre') or '',
        'rut': datos.get('rut') or '',
        'curso': datos.get('curso') or '',
        'profesor': datos.get('profesor') or '',
        'anio': anio,
        'criterios': criterios,
        'observaciones': _por_semestre(' '.join(obs).strip(), criterios),
    }


def _por_semestre(texto, criterios):
    """{1: '...', 2: '...'}. Si el texto trae "1° semestre:" / "2° semestre:" se
    separa; si no, va al último semestre con respuestas."""
    out = {1: '', 2: ''}
    if not texto:
        return out
    partes = re.split(r'(\d)\s*°\s*semestre:\s*', texto, flags=re.I)
    if len(partes) > 1:
        for i in range(1, len(partes) - 1, 2):
            s = int(partes[i])
            if s in out:
                out[s] = partes[i + 1].strip()
        return out
    tiene_2 = any(c['valores'].get(2) for c in criterios)
    out[2 if tiene_2 else 1] = texto
    return out


def leer_informes(archivo):
    """Lista de informes (uno por página con datos). Las páginas en blanco se saltan."""
    from pypdf import PdfReader
    if isinstance(archivo, (bytes, bytearray)):
        archivo = io.BytesIO(archivo)
    lector = PdfReader(archivo)
    out = []
    for i, pagina in enumerate(lector.pages, start=1):
        info = _leer_pagina(_fragmentos(pagina))
        if info and (info['rut'] or info['nombre']):
            info['pagina'] = i
            out.append(info)
    return out
