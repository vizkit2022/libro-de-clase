"""Crea (o actualiza) el usuario demo del Colegio San Patricio y le pone clave.

La clave se escribe a mano y no se muestra en pantalla ni queda en el
historial de la terminal. Si el usuario ya existe solo cambia su clave.

    cd backend
    DATABASE_URL=postgresql://... python3 scripts/usuario_demo.py
    ... --correo otra@cuenta.cl --rol directivo
"""
import argparse
import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

NOMBRE_COLEGIO = 'Colegio San Patricio'


def crear_app():
    from flask import Flask
    from models import db
    app = Flask(__name__)
    url = os.environ.get('DATABASE_URL')
    if url:
        url = url.replace('postgres://', 'postgresql://', 1)
    else:
        url = 'sqlite:///' + os.path.join(os.path.expanduser('~'), '.colegio_app', 'colegio.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = url
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)
    return app


def pedir_clave():
    # La clave puede venir por variable de entorno (útil para pruebas automáticas)
    clave = os.environ.get('CLAVE_DEMO')
    if clave:
        return clave
    while True:
        clave = getpass.getpass('Clave para el usuario demo (mínimo 10 caracteres): ')
        if len(clave) < 10:
            print('Muy corta, prueba de nuevo.')
            continue
        if getpass.getpass('Repítela: ') != clave:
            print('No coinciden, prueba de nuevo.')
            continue
        return clave


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--correo', default='demo@sanpatricio.cl')
    ap.add_argument('--rol', default='admin', choices=['admin', 'directivo', 'profesor'])
    args = ap.parse_args()

    app = crear_app()
    from models import db, School, User
    with app.app_context():
        school = School.query.filter_by(name=NOMBRE_COLEGIO).first()
        if school is None:
            raise SystemExit(f'No existe "{NOMBRE_COLEGIO}"')
        u = User.query.filter_by(email=args.correo).first()
        if u and u.school_id != school.id:
            raise SystemExit(f'{args.correo} ya existe en otro colegio; usa otro --correo')
        clave = pedir_clave()
        if u is None:
            u = User(school_id=school.id, email=args.correo, first_name='Usuario',
                     last_name='Demo', role=args.rol, is_active=True)
            db.session.add(u)
            accion = 'Creado'
        else:
            u.role, u.is_active = args.rol, True
            accion = 'Actualizado'
        u.set_password(clave)
        u.debe_cambiar_clave = False
        db.session.commit()
        print(f'{accion}: {args.correo} ({args.rol}) en {NOMBRE_COLEGIO}.')


if __name__ == '__main__':
    main()
