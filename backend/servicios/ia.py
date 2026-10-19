"""Acceso al modelo, en un solo lugar.

Antes cada módulo leía ANTHROPIC_API_KEY por su cuenta, creaba su cliente y
escribía a mano el nombre del modelo. Eso dejaba tres problemas:

- para cambiar de modelo había que acordarse de los tres archivos;
- cuando la clave faltaba, cada módulo fallaba distinto (uno devolvía 500,
  otro 503 y el tercero seguía sin IA y lo anotaba);
- no había forma de saber desde la aplicación si la IA estaba operativa sin
  gastar una petición real de un módulo.

Acá se resuelven los tres. El nombre del modelo sale de una variable de
entorno para poder moverlo sin tocar código: Anthropic retira modelos viejos
con aviso previo, y Haiku 4.5 ya tiene fecha tentativa de retiro.
"""
import os
import time

# Haiku es el adecuado para estas tareas: traducir texto a JSON y leer
# imágenes de documentos. No hace falta un modelo más caro.
MODELO_POR_DEFECTO = 'claude-haiku-5-5'

# Transcribir manuscrito de un libro de clases es bastante más difícil que
# traducir una instrucción a JSON, así que esa tarea usa un modelo mayor.
MODELO_VISION_POR_DEFECTO = 'claude-opus-4-6'


def modelo():
    return os.environ.get('ANTHROPIC_MODEL') or MODELO_POR_DEFECTO


def modelo_vision():
    return (os.environ.get('ANTHROPIC_MODEL_VISION')
            or os.environ.get('ANTHROPIC_MODEL')
            or MODELO_VISION_POR_DEFECTO)


def hay_clave():
    return bool((os.environ.get('ANTHROPIC_API_KEY') or '').strip())


def cliente():
    """Devuelve el cliente, o None si no se puede usar.

    None en vez de excepción porque la mayoría de los módulos tiene un camino
    alternativo sin IA y no debería tener que envolverlo todo en try.
    """
    clave = (os.environ.get('ANTHROPIC_API_KEY') or '').strip()
    if not clave:
        return None
    try:
        import anthropic
    except ImportError:
        return None
    return anthropic.Anthropic(api_key=clave)


def limpiar_json(texto):
    """Quita el cercado markdown que el modelo a veces agrega igual."""
    t = (texto or '').strip()
    if t.startswith('```'):
        partes = t.split('```')
        t = partes[1] if len(partes) > 1 else t
        if t.lstrip().lower().startswith('json'):
            t = t.lstrip()[4:]
    return t.strip()


def explicar_error(e):
    """Traduce una falla del servicio a algo que un usuario pueda accionar.

    El texto crudo del SDK trae el JSON de la respuesta, el request_id y
    términos en inglés. Mostrárselo a un inspector de convivencia no le dice
    qué hacer y además filtra detalle interno a una ventana del navegador.
    """
    nombre = type(e).__name__
    texto = str(e)
    # Se mira el nombre de la excepción y el texto: el SDK usa clases
    # propias, pero envuelto o simulado llega como Exception a secas.
    pista = f'{nombre} {texto}'.lower()

    if ('authentication' in pista or '401' in pista
            or 'x-api-key' in pista or 'permission' in pista):
        return ('La clave de acceso al servicio de IA existe pero fue rechazada. '
                'Hay que revisarla en la configuración del servidor.')
    if 'not_found' in pista or '404' in pista:
        return (f'El modelo «{modelo()}» no existe o fue retirado. '
                'Se puede cambiar con la variable ANTHROPIC_MODEL.')
    if 'credit' in pista or 'billing' in pista or 'quota' in pista:
        return ('La cuenta de IA no tiene saldo disponible. Las demás funciones '
                'de la plataforma siguen operando con normalidad.')
    if 'rate' in pista and 'limit' in pista:
        return 'El servicio de IA está recibiendo demasiadas peticiones. Reintenta en un minuto.'
    if 'overloaded' in pista or '529' in pista or '503' in pista:
        return 'El servicio de IA está saturado en este momento. Reintenta en unos minutos.'
    if 'timeout' in pista or 'timed out' in pista:
        return 'El servicio de IA demoró demasiado en responder. Reintenta.'
    return 'El servicio de IA no pudo procesar la solicitud.'


def diagnostico():
    """Comprueba de verdad que la IA responde, con una petición mínima.

    Tener saldo en la cuenta y tener la variable configurada en el servidor
    son dos cosas distintas, y la segunda es la que suele faltar. Esto
    distingue ambos casos y además detecta una clave inválida o un modelo
    retirado, que de otro modo aparecen como un error genérico dentro de
    cualquier módulo.
    """
    estado = {'configurada': hay_clave(), 'modelo': modelo(),
              'modelo_vision': modelo_vision(),
              'ok': False, 'latencia_ms': None, 'error': None}

    if not estado['configurada']:
        estado['error'] = ('No hay ANTHROPIC_API_KEY en el servidor. Cargar saldo '
                           'en la cuenta de Anthropic no basta: hay que agregar la '
                           'variable de entorno donde corre la plataforma.')
        return estado

    c = cliente()
    if c is None:
        estado['error'] = 'El paquete anthropic no está instalado en el servidor.'
        return estado

    inicio = time.time()
    try:
        r = c.messages.create(
            model=modelo(), max_tokens=8,
            messages=[{'role': 'user', 'content': 'Responde solo: ok'}])
        estado['ok'] = True
        estado['respuesta'] = (r.content[0].text or '').strip()[:40]
    except Exception as e:
        estado['error'] = explicar_error(e)
        # El detalle crudo sí sirve acá: esta pantalla es de administración
        estado['detalle_tecnico'] = f'{type(e).__name__}: {str(e)[:200]}'
    estado['latencia_ms'] = int((time.time() - inicio) * 1000)
    return estado
