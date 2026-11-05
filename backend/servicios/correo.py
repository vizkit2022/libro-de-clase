"""Envío de correos con la API de Resend.

Se usa HTTP y no SMTP porque Railway bloquea el SMTP saliente en sus planes menores.

Variables de entorno:
  RESEND_API_KEY     sin ella no se envía nada
  CORREO_REMITENTE   opcional. Su dominio debe estar verificado en Resend
"""
import json
import logging
import os
import urllib.error
import urllib.request

log = logging.getLogger(__name__)

REMITENTE_POR_DEFECTO = 'Recreo Edu <no-responde@kolevia.cl>'


def correo_configurado():
    return bool((os.environ.get('RESEND_API_KEY') or '').strip())


def enviar_correo(destino, asunto, html, texto):
    """Devuelve True si el proveedor aceptó el correo. Nunca lanza."""
    clave = (os.environ.get('RESEND_API_KEY') or '').strip()
    if not clave:
        return False
    cuerpo = {
        'from': (os.environ.get('CORREO_REMITENTE') or '').strip() or REMITENTE_POR_DEFECTO,
        'to': [destino], 'subject': asunto, 'html': html, 'text': texto,
    }
    pedido = urllib.request.Request(
        'https://api.resend.com/emails',
        data=json.dumps(cuerpo).encode('utf-8'),
        headers={'Authorization': f'Bearer {clave}',
                 'Content-Type': 'application/json',
                 # Resend rechaza el User-Agent que urllib trae por defecto
                 'User-Agent': 'RecreoEdu/1.0'},
        method='POST')
    try:
        with urllib.request.urlopen(pedido, timeout=10) as respuesta:
            return 200 <= respuesta.status < 300
    except urllib.error.HTTPError as e:
        log.error('Resend rechazó un correo: HTTP %s', e.code)
    except Exception as e:
        log.error('No se pudo enviar un correo: %s', type(e).__name__)
    return False
