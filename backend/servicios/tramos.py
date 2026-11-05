"""Precio por tramos: el colegio paga según sus docentes y administradores activos.

Mercado Pago cobra un monto fijo en pesos, así que las UF del tramo se convierten con
el valor del día. Mientras no haya una suscripción vigente, el tramo y el monto se
recalculan cada vez que se consulta el plan. Después, la suscripción conserva su monto.
"""
from models import db, PlanCatalogo, User, ROLES_FACTURABLES
from routes.sitio import valor_uf_hoy
from servicios import mercadopago as mp


def usuarios_facturables(school):
    """Los datos de ejemplo no cuentan: explorar la plataforma no debe subir el precio."""
    from routes.autoonboarding import DOMINIO_EJEMPLO
    return db.session.query(db.func.count(User.id)).filter(
        User.school_id == school.id,
        User.role.in_(ROLES_FACTURABLES),
        User.is_active.is_(True),
        ~User.email.like(f'%{DOMINIO_EJEMPLO}'),
    ).scalar() or 0


def monto_en_pesos(uf_tramo):
    uf = valor_uf_hoy()
    return round(uf_tramo * uf) if uf else None


def aplicar_tramo(school):
    """Deja en el colegio el plan que le corresponde. No hace commit.

    Devuelve lo que necesita mostrar la página de plan, o None si el colegio tiene un
    plan fijo. Sin UF disponible, un cambio de tramo deja el monto vacío: es preferible
    no ofrecer el pago a cobrar el valor de otro tramo.
    """
    if not school.plan_automatico:
        return None
    usuarios = usuarios_facturables(school)
    info = {'usuarios': usuarios, 'sobre_limite': False, 'uf_disponible': True}
    if mp.suscripcion_vigente(school):
        return info

    tramo = PlanCatalogo.tramo_para(usuarios)
    if tramo is None:
        school.plan_nombre, school.plan_uf, school.plan_monto = 'Plan Especial', None, None
        info['sobre_limite'] = True
        activos = PlanCatalogo.tramos_activos()
        info['tope'] = activos[-1].usuarios_max if activos else 0
        return info

    mismo_tramo = school.plan_nombre == tramo.nombre and school.plan_uf == tramo.monto_uf
    monto = monto_en_pesos(tramo.monto_uf)
    if monto is None:
        info['uf_disponible'] = False
        if not mismo_tramo:
            school.plan_monto = None
    else:
        school.plan_monto = monto
    school.plan_nombre, school.plan_uf = tramo.nombre, tramo.monto_uf
    school.plan_frecuencia = tramo.frecuencia
    return info
