"""
Generador de un "Libro de Matrícula" SINTÉTICO para los tests de importación.

- La fila de encabezados replica exactamente la del archivo real (198 columnas, mismo
  orden e índices, con las entidades HTML tal cual vienen en el original).
- Todos los datos que se escriben son INVENTADOS. Nunca copiar el archivo real al repo.

Uso:
    from excel_fixture import build_matricula_xlsx, rut_with_dv
    build_matricula_xlsx(path, [{'rut': '30.111.222-3', 'nombre': 'Ana', 5: '...'}])

Las claves de cada fila pueden ser el índice 0-based de la columna (int) o el nombre del
encabezado (str, con o sin entidades HTML). Para encabezados duplicados (id_comuna,
id_etnia, lugar_de_trabajo, observaciones) usar el índice: el nombre resuelve a la
PRIMERA aparición.
"""
import html

import openpyxl

HEADERS = [
    'matricula', 'fecha_matricula', 'nombre', 'apellidos', 'sexo', 'rut',
    'rut_apoderado', 'id_curso', 'telefono', 'cambio_curso', 'fecha_retiro', 'orden_lista',
    'vive_con', 'nacionalidad', 'comuna_alumno', 'ciudad', 'etnia', 'num_hermanos',
    'tel_emergencia', 'fecha_nacimiento', 'posee', 'religion', 'domicilio', 'almuerzo_sige',
    'hermano_colegio', 'hijo_funcionario', 'colegio_procedencia', 'bautizado', 'observacion_retiro', 'mail_emergencia',
    'cont_emergencia', 'datos_interes', 'c_repetidos', 'permiso_atraso', 'region_alumno', 'email_alumno',
    'img_fecha', 'genero', 'otro_genero', 'telefono_alumno', 'id_comuna', 'cantidad_personas_hogar',
    'admision_tipo_estudiante', 'admision_estado', 'grado_code', 'fecha_prematricula', 'pertenece_pie', 'nombre_social',
    'id_datos_tutor_economico', 'id_datos_sige', 'Prioritario_Preferennte', 'id_datos_beneficios', 'nee_pie', 'familiar_con_enf_invalidante',
    'permiso_actividades', 'permiso_fotos', 'observaciones', 'rut_appoderado', 'nombre_apoderado', 'apellidos_apoderado',
    'direccion_apoderado', 'fecha_nacimiento_apoderado', 'nacionalidad_apoderado', 'telefono_apoderado', 'estudios_apoderado', 'profesion_apoderado',
    'email_apoderado', 'proviene_apoderado', 'jefe_hogar_apoderado', 'responsabilidad_apoderado', 'lugar_de_trabajo', 'sexo_apoderado',
    'estado_civil_apoderado', 'parentesco_apoderado', 'religion_apoderado', 'tel_laboral_apoderado', 'id_afp_apoderado', 'e_cronica_apoderado',
    'autorizado_apoderado', 'tipo_documento_a', 'id_comuna', 'id_etnia', 'pin_firma_apoderado', 'rut_madre',
    'nombre_madre', 'apellidos_madre', 'direccion_madre', 'fecha_nacimiento_madre', 'nacionalidad_madre', 'telefono_madre',
    'estudios_madre', 'profesion_madre', 'email_madre', 'jefe_hogar_madre', 'responsabilidad_madre', 'sexo_madre',
    'estado_civil_madre', 'parentesco_madre', 'religion_madre', 'tel_laboral_madre', 'ocupacion_madre', 'trabajo_madre',
    'lugar_de_trabajo', 'id_afp_madre', 'e_cronica_madre', 'id_comuna', 'id_etnia', 'rut_padre',
    'nombre_padre', 'apellidos_padre', 'direccion_padre', 'fecha_nacimiento_padre', 'nacionalidad_padre', 'telefono_padre',
    'estudios_padre', 'profesion_padre', 'email_padre', 'jefe_hogar_padre', 'responsabilidad_padre', 'sexo_padre',
    'estado_civil_padre', 'parentesco_padre', 'religion_padre', 'tel_laboral_padre', 'ocupacion_padre', 'trabajo_padre',
    'lugar_de_trabajo', 'id_afp_padre', 'e_cronica_padre', 'id_comuna', 'id_etnia', 'rut_tut_eco',
    'nombre_tut_eco', 'apellidos_tut_eco', 'direccion_tut_eco', 'fecha_nacimiento_tut_eco', 'nacionalidad_tut_eco', 'telefono_tut_eco',
    'estudios_tut_eco', 'profesion_tut_eco', 'email_tut_eco', 'proviene_tut_eco', 'jefe_hogar_tut_eco', 'responsabilidad_tut_eco',
    'sexo_tut_eco', 'estado_civil_tut_eco', 'parentesco_tut_eco', 'religion_tut_eco', 'tel_laboral_tut_eco', 'id_afp_tut_eco',
    'lugar_de_trabajo', 'e_cronica_tut_eco', 'id_comuna', 'id_etnia', 'almuerza', 'necesita_almuerzo',
    'pie', 'pie_tipo', 'fps', 'programa4_7', 'suf', 'diagnostico_pie',
    'autoriza_actividades', 'autoriza_facebook', 'viajara', 'observaciones_form', 'repetidos', 'autoriza_religion',
    'Condici&oacute;n que requiere mayor atenci&oacute;n', 'Alergias', 'Carta de Compromiso 2026', 'Prohibici&oacute;n judicial de acercamiento al menor', 'Tomo conocimiento y acepto sus disposiciones internas, condiciones y Reglamentos, incluido Seguro Escolar y Protocolos, los cuales me comprometo, juntamente con mi pupilo(a), a cumplir en todos sus puntos.', 'Tomo conocimiento y acepto &iacute;ntegramente las disposiciones internas, Reglamentos y Protocolos, incluido Seguro Escolar y Uniforme, los cuales me comprometo, juntamente con mi pupilo(a), a cumplir en todos sus puntos.',
    'Acepto que en este establecimiento se utiliza uniforme propio, por lo que me comprometo a cumplirlo y mantenerlo durante todo el a&ntilde;o escolar.', 'Tomo conocimiento que, por el bienestar del alumno(a) y/o situaciones de Convivencia Escolar, se puede proceder al traslado del o la Estudiante al curso de la jornada alterna.', 'Enfermedad o Condici&oacute;n Importante para tener especial cuidado (TEA, Asma, Dificultades Articulatorias, D&eacute;ficit Atencional u otros).', 'El / La Estudiante se retira del Establecimiento con:', 'Tel&eacute;fono de Emergencia 2', 'jj',
    'Posee Carta de Compromiso 2026', 'Observaciones M&eacute;dicas o Enfermedad/Condici&oacute;n importante para tener especial cuidado (TEA, Asma, Dificultades Articulatorias, D&eacute;ficit Atencional u otros).', 'medicamentos', 'c_medicas', 'alergias', 'e_cronica',
    'gs_rh', 'consultorio_clinica', 'observaciones', 'problemas', 'estatura', 'talla',
    'peso', 'id_afp', 'especialistas', 'estado_vacunacion_covid', 'p_cintura', 'id_carga_salud',
]

assert len(HEADERS) == 198, len(HEADERS)

# nombre (unescaped y raw) -> primer índice
_NAME_TO_INDEX = {}
for _i, _h in enumerate(HEADERS):
    _NAME_TO_INDEX.setdefault(_h, _i)
    _NAME_TO_INDEX.setdefault(html.unescape(_h), _i)

# Índices de uso frecuente (ver spec/excel_columns.txt)
COL = {
    'fecha_matricula': 1, 'nombre': 2, 'apellidos': 3, 'sexo': 4, 'rut': 5,
    'rut_apoderado': 6, 'id_curso': 7, 'telefono': 8, 'orden_lista': 11, 'vive_con': 12,
    'nacionalidad': 13, 'comuna_alumno': 14, 'ciudad': 15, 'etnia': 16, 'num_hermanos': 17,
    'tel_emergencia': 18, 'fecha_nacimiento': 19, 'domicilio': 22, 'hermano_colegio': 24,
    'colegio_procedencia': 26, 'cont_emergencia': 30, 'c_repetidos': 32, 'permiso_atraso': 33,
    'email_alumno': 35, 'genero': 37, 'cantidad_personas_hogar': 41,
    'admision_tipo_estudiante': 42, 'admision_estado': 43, 'pertenece_pie': 46,
    'id_datos_sige': 49, 'prioritario': 50, 'permiso_actividades': 54, 'permiso_fotos': 55,
    'rut_appoderado': 57, 'nombre_apoderado': 58, 'apellidos_apoderado': 59,
    'fecha_nacimiento_apoderado': 61, 'nacionalidad_apoderado': 62, 'telefono_apoderado': 63,
    'estudios_apoderado': 64, 'profesion_apoderado': 65, 'email_apoderado': 66,
    'proviene_apoderado': 67, 'sexo_apoderado': 71, 'parentesco_apoderado': 73,
    'autorizado_apoderado': 78, 'tipo_documento_a': 79,
    'rut_madre': 83, 'nombre_madre': 84, 'apellidos_madre': 85, 'fecha_nacimiento_madre': 87,
    'nacionalidad_madre': 88, 'telefono_madre': 89, 'estudios_madre': 90, 'profesion_madre': 91,
    'email_madre': 92, 'sexo_madre': 95, 'parentesco_madre': 97,
    'rut_padre': 107, 'nombre_padre': 108, 'apellidos_padre': 109, 'fecha_nacimiento_padre': 111,
    'nacionalidad_padre': 112, 'telefono_padre': 113, 'estudios_padre': 114, 'profesion_padre': 115,
    'email_padre': 116, 'sexo_padre': 119, 'parentesco_padre': 121,
    'rut_tut_eco': 131, 'nombre_tut_eco': 132, 'apellidos_tut_eco': 133,
    'fecha_nacimiento_tut_eco': 135, 'nacionalidad_tut_eco': 136, 'telefono_tut_eco': 137,
    'email_tut_eco': 140, 'sexo_tut_eco': 144, 'parentesco_tut_eco': 146,
    'autoriza_actividades': 162, 'autoriza_facebook': 163, 'autoriza_religion': 167,
    'carta_compromiso': 170, 'prohibicion_judicial': 171, 'reglamento': 173, 'uniforme': 174,
    'retira_con': 177, 'tel_emergencia_2': 178, 'posee_carta_compromiso': 180,
    'obs_medicas': 181, 'medicamentos': 182, 'c_medicas': 183, 'alergias': 184,
    'e_cronica': 185, 'problemas': 189,
}


def col_index(key):
    """Resuelve un índice (int) o nombre de encabezado/alias (str) al índice 0-based."""
    if isinstance(key, int):
        if not 0 <= key < len(HEADERS):
            raise KeyError(key)
        return key
    if key in COL:
        return COL[key]
    if key in _NAME_TO_INDEX:
        return _NAME_TO_INDEX[key]
    raise KeyError(f'Columna desconocida: {key!r}')


def rut_dv(number):
    """Dígito verificador chileno (módulo 11) → '0'-'9' o 'K'."""
    total, factor = 0, 2
    for d in reversed(str(int(number))):
        total += int(d) * factor
        factor = 2 if factor == 7 else factor + 1
    r = 11 - (total % 11)
    return '0' if r == 11 else 'K' if r == 10 else str(r)


def format_rut(number, dv=None, lower_k=False):
    """12345678 → '12.345.678-5' (DV calculado si no se entrega)."""
    dv = dv or rut_dv(number)
    if lower_k:
        dv = dv.lower()
    s = f'{int(number):,}'.replace(',', '.')
    return f'{s}-{dv}'


def rut_with_dv(number, lower_k=False):
    return format_rut(number, lower_k=lower_k)


def find_number_with_k(start):
    """Primer número >= start cuyo DV es K (para probar la normalización de 'k')."""
    n = start
    while rut_dv(n) != 'K':
        n += 1
    return n


def build_matricula_xlsx(path, rows, trailing_empty_rows=3, sheet_title='Libro de Matrícula'):
    """Escribe un .xlsx con la fila de encabezados real y las filas indicadas.

    rows: lista de dicts {indice_o_nombre: valor}. Se agregan `trailing_empty_rows`
    filas vacías al final (celdas con '' como en el archivo real exportado).
    Devuelve `path`.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet_title
    ws.append(list(HEADERS))
    for row in rows:
        values = [None] * len(HEADERS)
        for k, v in row.items():
            values[col_index(k)] = v
        ws.append(values)
    for _ in range(trailing_empty_rows):
        ws.append([''] * 6 + [None] * (len(HEADERS) - 6))
    wb.save(str(path))
    return path


# ── Dataset sintético estándar ───────────────────────────────────────────────
# RUTs ficticios en el rango 30.000.000+ (no asignados a personas reales).
RUT_A = rut_with_dv(30111222)            # alumno A
RUT_A_MADRE = rut_with_dv(31111001)      # madre A == apoderado A
RUT_A_PADRE = rut_with_dv(31111002)      # padre A == tutor económico A
_NK = find_number_with_k(30222333)
RUT_B_LOWER = format_rut(_NK, lower_k=True)   # alumno B con 'k' minúscula
RUT_B = format_rut(_NK)                       # normalizado esperado (K mayúscula)
_NMK = find_number_with_k(31222001)
RUT_B_MADRE_LOWER = format_rut(_NMK, lower_k=True)
RUT_B_MADRE = format_rut(_NMK)
RUT_C = rut_with_dv(30333444)
RUT_C_MADRE = rut_with_dv(31333001)
RUT_C_PADRE = rut_with_dv(31333002)
RUT_C_ABUELA = rut_with_dv(31333003)     # apoderada distinta de madre/padre
RUT_D = rut_with_dv(30444555)            # usado para el test de course_id explícito
RUT_D_MADRE = rut_with_dv(31444001)

COURSE_NAME = '6° Básica B'


def standard_rows():
    """3 alumnos sintéticos cubriendo los casos borde del Excel real."""
    row_a = {
        'fecha_matricula': '2025-12-12', 'nombre': 'Ana Sofía', 'apellidos': 'Prueba Uno',
        'sexo': 'Femenino', 'rut': RUT_A, 'rut_apoderado': RUT_A_MADRE, 'id_curso': COURSE_NAME,
        'telefono': 56911110001, 'orden_lista': 1, 'vive_con': 'Padre/Madre',
        'nacionalidad': 'Chile', 'comuna_alumno': 'Maipú', 'ciudad': 'Santiago',
        'etnia': 'no pertenece a una etnia', 'num_hermanos': 1, 'tel_emergencia': 56911110001,
        'fecha_nacimiento': '2014-11-02', 'domicilio': 'Calle Ficticia 123',
        'hermano_colegio': 'SI', 'colegio_procedencia': 'Escuela Ficticia ',
        'cont_emergencia': 'Mamá', 'c_repetidos': 0, 'permiso_atraso': 0, 'genero': 2,
        40: 114, 'cantidad_personas_hogar': 4, 'admision_tipo_estudiante': 'antiguo',
        'admision_estado': 'matriculado', 'pertenece_pie': 'NO', 'id_datos_sige': 'ninguno',
        'prioritario': 'Ninguno', 'permiso_actividades': 0, 'permiso_fotos': 'SI',
        # apoderado == madre (mismo RUT)
        'rut_appoderado': RUT_A_MADRE, 'nombre_apoderado': 'Marta ',
        'apellidos_apoderado': 'Ficticia Pérez', 'fecha_nacimiento_apoderado': '1980-01-15',
        'nacionalidad_apoderado': 'Chile', 'telefono_apoderado': 56922220001,
        'estudios_apoderado': ' Educacion Media', 'profesion_apoderado': 'Contadora ',
        'email_apoderado': 'Marta.Ficticia@example.com', 'proviene_apoderado': 3,
        'sexo_apoderado': 'Femenino', 'parentesco_apoderado': 'Madre', 'tipo_documento_a': 1,
        80: 114, 81: 0,
        'rut_madre': RUT_A_MADRE, 'nombre_madre': 'Marta ', 'apellidos_madre': 'Ficticia Pérez',
        'fecha_nacimiento_madre': '1980-01-15', 'nacionalidad_madre': 'Chile',
        'telefono_madre': 56922220001, 'estudios_madre': ' Educacion Media',
        'profesion_madre': 'Contadora ', 'email_madre': 'Marta.Ficticia@example.com',
        'sexo_madre': 'Femenino', 'parentesco_madre': 'Madre', 105: 114, 106: 0,
        'rut_padre': RUT_A_PADRE, 'nombre_padre': 'Pablo', 'apellidos_padre': 'Ficticio Soto',
        'fecha_nacimiento_padre': '1978-05-20', 'nacionalidad_padre': 'Chile',
        'telefono_padre': 56933330001, 'estudios_padre': ' Tecnico Profesional',
        'profesion_padre': 'Supervisor', 'email_padre': 'pablo.ficticio@example.com',
        'sexo_padre': 'Masculino', 'parentesco_padre': 'Padre', 129: 114, 130: 0,
        # tutor económico == padre (mismo RUT, mayúsculas distintas en apellidos como el real)
        'rut_tut_eco': RUT_A_PADRE, 'nombre_tut_eco': 'Pablo', 'apellidos_tut_eco': 'Ficticio SOTO',
        'fecha_nacimiento_tut_eco': '1978-05-20', 'nacionalidad_tut_eco': 'Chile',
        'telefono_tut_eco': 56933330001, 'email_tut_eco': 'pablo.ficticio@example.com',
        'sexo_tut_eco': 'Masculino', 'parentesco_tut_eco': 'Padre', 152: 114, 153: 0,
        'carta_compromiso': 'No', 'prohibicion_judicial': 'No', 'reglamento': 'Sí',
        'retira_con': 'FURGÓN ', 'tel_emergencia_2': '+56933330001 - PAPÁ',
        'obs_medicas': 'ASMA', 'c_medicas': 'No', 'alergias': 'Pasto', 'e_cronica': 'No',
        'problemas': ' P.VISUALES',
    }
    row_b = {
        'fecha_matricula': '2026-02-24', 'nombre': 'Bruno', 'apellidos': 'Prueba Dos',
        'sexo': 'Masculino', 'rut': RUT_B_LOWER, 'rut_apoderado': RUT_B_MADRE_LOWER,
        'id_curso': COURSE_NAME, 'telefono': 56911110002, 'orden_lista': 2, 'vive_con': 'Madre',
        'nacionalidad': 'False', 'comuna_alumno': 'Estación Central', 'num_hermanos': 0,
        'tel_emergencia': 56911110002, 'fecha_nacimiento': '2014-06-21',
        'domicilio': 'Pasaje Inventado #10', 'colegio_procedencia': 'Escuela Ficticia',
        'cont_emergencia': 'Mamá', 'c_repetidos': '1 BÁSICO ', 'genero': 1,
        'cantidad_personas_hogar': 2, 'admision_tipo_estudiante': 'nuevo',
        'admision_estado': 'matriculado', 'pertenece_pie': 'NO', 'permiso_actividades': 0,
        'permiso_fotos': 'SI',
        # apoderado == madre, parentesco con código numérico '1', sin padre
        'rut_appoderado': RUT_B_MADRE_LOWER, 'nombre_apoderado': 'Beatriz',
        'apellidos_apoderado': 'Inventada Rojas', 'fecha_nacimiento_apoderado': '1990-03-03',
        'nacionalidad_apoderado': False, 'telefono_apoderado': 56922220002,
        'email_apoderado': 'beatriz.inventada@example.com', 'sexo_apoderado': 'Femenino',
        'parentesco_apoderado': 1, 'tipo_documento_a': 1,
        'rut_madre': RUT_B_MADRE_LOWER, 'nombre_madre': 'Beatriz',
        'apellidos_madre': 'Inventada Rojas', 'fecha_nacimiento_madre': '1990-03-03',
        'nacionalidad_madre': False, 'telefono_madre': 56922220002,
        'email_madre': 'beatriz.inventada@example.com', 'sexo_madre': 'Femenino',
        'parentesco_madre': 'Madre',
        'rut_tut_eco': RUT_B_MADRE_LOWER, 'nombre_tut_eco': 'Beatriz',
        'apellidos_tut_eco': 'Inventada Rojas', 'parentesco_tut_eco': 1,
        'sexo_tut_eco': 'Femenino',
        'prohibicion_judicial': 'Sí', 'reglamento': 'Sí',
        'retira_con': 'MADRE', 'tel_emergencia_2': '+56922220002',
    }
    row_c = {
        'fecha_matricula': '2025-12-16', 'nombre': 'Carlos', 'apellidos': 'Prueba Tres',
        'sexo': 'Masculino', 'rut': RUT_C, 'rut_apoderado': RUT_C_ABUELA, 'id_curso': COURSE_NAME,
        'telefono': 56911110003, 'orden_lista': 3, 'vive_con': 'Padre/Madre',
        'nacionalidad': 'Venezuela', 'fecha_nacimiento': '2014-05-03',
        'email_alumno': 'carlos.tres@example.com', 'admision_tipo_estudiante': 'nuevo',
        'admision_estado': 'matriculado', 'permiso_fotos': 'SI',
        'rut_appoderado': RUT_C_ABUELA, 'nombre_apoderado': 'Carmen',
        'apellidos_apoderado': 'Abuela Ficticia', 'telefono_apoderado': 56922220003,
        'email_apoderado': 'carmen.abuela@example.com', 'sexo_apoderado': 'Femenino',
        'parentesco_apoderado': 1,
        'rut_madre': RUT_C_MADRE, 'nombre_madre': 'Clara', 'apellidos_madre': 'Madre Ficticia',
        'parentesco_madre': 'Madre', 'sexo_madre': 'Femenino', 'telefono_madre': 56922220013,
        'rut_padre': RUT_C_PADRE, 'nombre_padre': 'Cesar', 'apellidos_padre': 'Padre Ficticio',
        'parentesco_padre': 'Padre', 'sexo_padre': 'Masculino', 'telefono_padre': 56933330003,
        'rut_tut_eco': RUT_C_PADRE, 'nombre_tut_eco': 'Cesar', 'apellidos_tut_eco': 'Padre Ficticio',
        'parentesco_tut_eco': 'Padre',
        'reglamento': 'Sí', 'prohibicion_judicial': 'No',
    }
    return [row_a, row_b, row_c]


def course_override_rows():
    """1 alumno para probar course_id explícito (id_curso apunta a otro curso)."""
    return [{
        'fecha_matricula': '2026-01-05', 'nombre': 'Diana', 'apellidos': 'Prueba Cuatro',
        'sexo': 'Femenino', 'rut': RUT_D, 'rut_apoderado': RUT_D_MADRE,
        'id_curso': '8° Básico Z', 'fecha_nacimiento': '2013-01-01',
        'rut_appoderado': RUT_D_MADRE, 'nombre_apoderado': 'Dora',
        'apellidos_apoderado': 'Madre Cuatro', 'parentesco_apoderado': 'Madre',
        'rut_madre': RUT_D_MADRE, 'nombre_madre': 'Dora', 'apellidos_madre': 'Madre Cuatro',
        'parentesco_madre': 'Madre', 'permiso_fotos': 'SI',
    }]
