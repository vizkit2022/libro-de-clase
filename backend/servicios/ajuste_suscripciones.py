"""Ajuste mensual del monto de las suscripciones según el tramo y la UF.

Mercado Pago cobra un monto fijo en pesos, así que cada mes se compara ese monto con lo
que corresponde hoy:

  - Si sube: se avisa por correo y el monto cambia cuando pasan los días de aviso. Sin
    aviso enviado no hay alza.
  - Si baja: se aplica de inmediato y se informa.

Solo se tocan colegios en cobro automático por tramos. Se crea a lo más un ajuste por
colegio al mes, y la restricción única evita que dos procesos lo dupliquen.

Variables de entorno:
  AJUSTE_AUTOMATICO   "1" activa la revisión periódica. Sin ella, solo corre desde el panel
  AJUSTE_AVISO_DIAS   días entre el aviso y el alza (por defecto 10)
"""
import html
import logging
import os
import threading
import time
from datetime import date, datetime, timedelta

from sqlalchemy.exc import IntegrityError

from models import db, AjusteSuscripcion, PlanCatalogo, School, Subscription, User
from routes.sitio import uf_vigente_para_cobro
from servicios import mercadopago as mp
from servicios.correo import correo_configurado, enviar_correo
from servicios.tramos import usuarios_facturables

log = logging.getLogger(__name__)

SEGUNDOS_ENTRE_REVISIONES = 6 * 60 * 60


def dias_de_aviso():
    try:
        return max(1, int(os.environ.get('AJUSTE_AVISO_DIAS') or 10))
    except ValueError:
        return 10


def automatico_activo():
    return os.environ.get('AJUSTE_AUTOMATICO') == '1'


def clp(monto):
    return '$' + f'{int(monto):,}'.replace(',', '.')


def _uf_texto(valor):
    return ('%.2f' % valor).rstrip('0').rstrip('.').replace('.', ',')


def _fecha_texto(dia):
    return dia.strftime('%d-%m-%Y')


def _suscripciones():
    """(colegio, suscripción) que el ajuste puede tocar."""
    filas = db.session.query(School, Subscription).join(
        Subscription, Subscription.school_id == School.id
    ).filter(School.plan_automatico.is_(True), Subscription.status == 'authorized',
             Subscription.mp_subscription_id.isnot(None)
    ).order_by(School.id, Subscription.created_at.desc()).all()
    vistos, resultado = set(), []
    for school, sub in filas:
        # Las simuladas de desarrollo no existen en Mercado Pago
        if school.id in vistos or sub.mp_subscription_id.startswith('SIM-'):
            continue
        vistos.add(school.id)
        if (school.plan_frecuencia or 'mensual') == 'mensual':
            resultado.append((school, sub))
    return resultado


def _calcular(school, sub, uf):
    usuarios = usuarios_facturables(school)
    tramo = PlanCatalogo.tramo_para(usuarios)
    return {
        'usuarios': usuarios, 'tramo': tramo,
        'actual': int(round(sub.amount or 0)),
        'nuevo': round(tramo.monto_uf * uf) if tramo else None,
    }


def vista_previa():
    """Qué cambiaría hoy, sin avisar ni tocar nada."""
    uf = uf_vigente_para_cobro()
    if not uf:
        return None
    previsto = []
    hoy = date.today().strftime('%Y-%m')
    for school, sub in _suscripciones():
        c = _calcular(school, sub, uf)
        resuelto = AjusteSuscripcion.query.filter(
            AjusteSuscripcion.school_id == school.id,
            db.or_(AjusteSuscripcion.estado == 'avisado', AjusteSuscripcion.periodo == hoy)).first()
        if c['nuevo'] != c['actual'] and not resuelto:
            previsto.append({'school_id': school.id, 'colegio': school.name,
                             'usuarios': c['usuarios'], 'monto_actual': c['actual'],
                             'monto_nuevo': c['nuevo'],
                             'tramo': c['tramo'].nombre if c['tramo'] else None})
    return previsto


def _destinatarios(school, sub):
    correos = [u.email for u in User.query.filter_by(school_id=school.id, role='admin',
                                                     is_active=True).all()]
    if sub.mp_payer_email:
        correos.append(sub.mp_payer_email)
    unicos = {c.strip().lower(): c.strip() for c in correos if c and c.strip()}
    return [c for k, c in unicos.items() if not k.endswith(('.local', '.invalid'))]


def _avisar(school, sub, ajuste, sube):
    tramo = ajuste.tramo_nombre or 'tu tramo'
    detalle = (f'{ajuste.usuarios} docentes y administradores activos: {tramo}, '
               f'{_uf_texto(ajuste.uf_tramo)} UF al mes, con la UF a {clp(ajuste.uf_valor)}.')
    if sube:
        asunto = f'Cambio en tu suscripción a Recreo Edu desde el {_fecha_texto(ajuste.aplicar_desde)}'
        principal = (f'Desde el {_fecha_texto(ajuste.aplicar_desde)}, la suscripción de {school.name} '
                     f'pasará de {clp(ajuste.monto_anterior)} a {clp(ajuste.monto_nuevo)} al mes.')
        cierre = 'Si no quieres continuar, puedes cancelar la suscripción en Mercado Pago antes de esa fecha.'
    else:
        asunto = 'Bajó el valor de tu suscripción a Recreo Edu'
        principal = (f'La suscripción de {school.name} bajó de {clp(ajuste.monto_anterior)} '
                     f'a {clp(ajuste.monto_nuevo)} al mes.')
        cierre = 'No tienes que hacer nada.'
    enlace = f'{mp.base_url()}/plan'
    texto = f'{principal}\n\n{detalle}\n\n{cierre}\n\nRevisa tu plan: {enlace}\n\nRecreo Edu'
    cuerpo = f"""<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:480px;margin:0 auto;padding:24px;line-height:1.5">
  <p style="font-size:18px;font-weight:bold;margin:0 0 20px">Recreo Edu</p>
  <p style="margin:0 0 12px">{html.escape(principal)}</p>
  <p style="margin:0 0 12px;color:#4b5563">{html.escape(detalle)}</p>
  <p style="margin:0 0 24px;color:#4b5563">{html.escape(cierre)}</p>
  <p style="margin:0"><a href="{html.escape(enlace, quote=True)}" style="color:#3b4fd8;font-weight:bold">Revisar mi plan</a></p>
</div>"""
    enviados = [enviar_correo(c, asunto, cuerpo, texto) for c in _destinatarios(school, sub)]
    return any(enviados)


def _aplicar(school, sub, ajuste):
    """Devuelve True si Mercado Pago aceptó. Si no, queda pendiente para la próxima revisión."""
    try:
        mp._request('PUT', f'/preapproval/{sub.mp_subscription_id}', {
            'auto_recurring': {'transaction_amount': ajuste.monto_nuevo, 'currency_id': 'CLP'}})
    except mp.MercadoPagoError as e:
        ajuste.error = str(e)[:500]
        db.session.commit()
        return False
    sub.amount = ajuste.monto_nuevo
    school.plan_monto = ajuste.monto_nuevo
    school.plan_uf = ajuste.uf_tramo
    if ajuste.tramo_nombre:
        school.plan_nombre = ajuste.tramo_nombre
    ajuste.estado, ajuste.aplicado_at, ajuste.error = 'aplicado', datetime.utcnow(), None
    db.session.commit()
    return True


def _resolver_pendiente(school, sub, pendiente, c, uf, hoy, res):
    # Si bajó desde el aviso se cobra lo menor. Si subió, espera el aviso del próximo mes.
    if c['nuevo'] is not None and c['nuevo'] < pendiente.monto_nuevo:
        pendiente.monto_nuevo = c['nuevo']
        pendiente.uf_tramo, pendiente.uf_valor = c['tramo'].monto_uf, uf
        pendiente.tramo_nombre, pendiente.usuarios = c['tramo'].nombre, c['usuarios']
    if pendiente.monto_nuevo == c['actual']:
        pendiente.estado, pendiente.error = 'cancelado', 'Ya no era necesario'
        db.session.commit()
        return
    if pendiente.aplicar_desde <= hoy or pendiente.monto_nuevo < c['actual']:
        if _aplicar(school, sub, pendiente):
            res['aplicados'] += 1
        else:
            res['errores'].append(f'{school.name}: {pendiente.error}')
        return
    db.session.commit()


def _crear(school, sub, c, uf, hoy, periodo, estado='enviando', aplicar_desde=None):
    ajuste = AjusteSuscripcion(
        school_id=school.id, subscription_id=sub.id, periodo=periodo, estado=estado,
        monto_anterior=c['actual'], monto_nuevo=c['nuevo'], usuarios=c['usuarios'],
        uf_valor=uf, uf_tramo=c['tramo'].monto_uf if c['tramo'] else None,
        tramo_nombre=c['tramo'].nombre if c['tramo'] else None, aplicar_desde=aplicar_desde or hoy)
    db.session.add(ajuste)
    try:
        db.session.commit()
    except IntegrityError:          # otro proceso llegó primero
        db.session.rollback()
        return None
    return ajuste


def _procesar(school, sub, uf, hoy, res):
    c = _calcular(school, sub, uf)
    periodo = hoy.strftime('%Y-%m')
    pendiente = AjusteSuscripcion.query.filter_by(school_id=school.id, estado='avisado').first()
    if pendiente:
        _resolver_pendiente(school, sub, pendiente, c, uf, hoy, res)
        return
    if c['nuevo'] == c['actual']:
        res['sin_cambio'] += 1
        return
    if AjusteSuscripcion.query.filter_by(school_id=school.id, periodo=periodo).first():
        return

    if c['tramo'] is None:          # sobre el último tramo: lo resuelve una persona
        if _crear(school, sub, c, uf, hoy, periodo, estado='revision'):
            res['revision'] += 1
        return

    sube = c['nuevo'] > c['actual']
    fecha = hoy + timedelta(days=dias_de_aviso()) if sube else hoy
    ajuste = _crear(school, sub, c, uf, hoy, periodo, aplicar_desde=fecha)
    if ajuste is None:
        return
    avisado = _avisar(school, sub, ajuste, sube)
    if sube:
        if not avisado:             # sin aviso no hay alza: se reintenta en la próxima revisión
            db.session.delete(ajuste)
            db.session.commit()
            res['errores'].append(f'{school.name}: no se pudo enviar el aviso')
            return
        ajuste.estado, ajuste.avisado_at = 'avisado', datetime.utcnow()
        db.session.commit()
        res['avisados'] += 1
        return
    ajuste.estado, ajuste.avisado_at = 'avisado', datetime.utcnow() if avisado else None
    db.session.commit()
    if _aplicar(school, sub, ajuste):
        res['aplicados'] += 1
    else:
        res['errores'].append(f'{school.name}: {ajuste.error}')


def _cerrar_huerfanos():
    """Avisos de suscripciones que ya no están vigentes."""
    vigentes = {s.id for _, s in _suscripciones()}
    for a in AjusteSuscripcion.query.filter_by(estado='avisado').all():
        if a.subscription_id not in vigentes:
            a.estado, a.error = 'cancelado', 'La suscripción ya no está vigente'
    db.session.commit()


def revisar(hoy=None):
    """Una pasada completa. Devuelve el resumen, o 'detenido' con el motivo si no pudo correr."""
    hoy = hoy or date.today()
    res = {'detenido': None, 'revisados': 0, 'sin_cambio': 0, 'avisados': 0, 'aplicados': 0,
           'revision': 0, 'errores': []}
    if not mp.configurado():
        res['detenido'] = 'Mercado Pago no está configurado'
        return res
    if not correo_configurado():
        res['detenido'] = 'El envío de correos no está configurado'
        return res
    uf = uf_vigente_para_cobro()
    if not uf:
        res['detenido'] = 'No se pudo obtener el valor de la UF de hoy'
        return res

    _cerrar_huerfanos()
    for school, sub in _suscripciones():
        res['revisados'] += 1
        try:
            _procesar(school, sub, uf, hoy, res)
        except Exception as e:      # un colegio con problemas no detiene a los demás
            db.session.rollback()
            log.exception('Ajuste de suscripción del colegio %s', school.id)
            res['errores'].append(f'{school.name}: {type(e).__name__}')
    return res


def instalar(app):
    """Revisión periódica en segundo plano, solo si se activó explícitamente."""
    if not automatico_activo():
        return

    def ciclo():
        time.sleep(120)             # que la aplicación termine de arrancar
        while True:
            try:
                with app.app_context():
                    log.info('Ajuste de suscripciones: %s', revisar())
                    db.session.remove()
            except Exception:
                log.exception('Falló la revisión de suscripciones')
            time.sleep(SEGUNDOS_ENTRE_REVISIONES)

    threading.Thread(target=ciclo, daemon=True, name='ajuste-suscripciones').start()
