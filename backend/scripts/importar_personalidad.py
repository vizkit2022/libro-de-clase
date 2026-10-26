"""Carga informes de personalidad en PDF (sistema anterior) a la base.

Lee cada página, busca al alumno por RUT (o por nombre si no tiene RUT) dentro
del colegio y graba las respuestas en su año y semestre. Sin --aplicar solo
muestra lo que haría.

    cd backend
    DATABASE_URL=postgresql://... python3 scripts/importar_personalidad.py \
        --colegio "Franz Liszt" ~/Downloads/Informe*.pdf            # vista previa
    ... --aplicar                                                    # graba
    ... --aplicar --sobrescribir                                     # pisa lo ya llenado
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('pdfs', nargs='+')
    ap.add_argument('--colegio', required=True, help='parte del nombre del colegio')
    ap.add_argument('--aplicar', action='store_true')
    ap.add_argument('--sobrescribir', action='store_true')
    args = ap.parse_args()

    import app as app_module
    from models import db, School
    from routes.personalidad import _plan_importacion, aplicar_importacion
    from routes.access import year_is_closed
    from servicios.importar_personalidad_pdf import leer_informes

    with app_module.application.app_context():
        colegios = School.query.filter(School.name.ilike(f'%{args.colegio}%')).all()
        if len(colegios) != 1:
            sys.exit(f'Se esperaba un colegio y hay {len(colegios)}: {[c.name for c in colegios]}')
        colegio = colegios[0]
        leidos = [(os.path.basename(p), leer_informes(open(p, 'rb').read())) for p in args.pdfs]
        vista, ops = _plan_importacion(colegio.id, leidos, args.sobrescribir)

        print(f'\nColegio: {colegio.name}\n')
        for a in vista['archivos']:
            ok = [f for f in a['alumnos'] if f['estado'] == 'ok']
            print(f"{a['archivo']:<34} {a['curso_pdf'] or '-':<36} "
                  f"{len(ok):>3}/{len(a['alumnos'])} listos")
            for f in a['alumnos']:
                if f['estado'] == 'no_encontrado':
                    print(f"    ✗ no está en la plataforma: {f['nombre']} ({f['rut']})")
                elif f['estado'] == 'ok' and f.get('curso_distinto'):
                    print(f"    ! {f['nombre_plataforma']}: PDF dice {f['curso_pdf']}, "
                          f"plataforma {f['curso_plataforma']}")
                elif f['estado'] == 'ok' and f.get('ya_tenia'):
                    print(f"    · {f['nombre_plataforma']} ya tenía {f['ya_tenia']} respuestas")
        r = vista['resumen']
        print(f"\nInformes leídos: {r['informes']} · listos: {r['listos']} · "
              f"sin datos: {r['sin_datos']} · no encontrados: {r['no_encontrados']} · "
              f"respuestas: {r['respuestas']}")
        if vista['criterios_sin_match']:
            print('Criterios que no calzan con la pauta:', *vista['criterios_sin_match'], sep='\n  ')

        if not args.aplicar:
            print('\nVista previa: no se grabó nada. Agrega --aplicar para cargar.')
            return
        cerrados = sorted({y for _s, y in ops if year_is_closed(colegio.id, y)})
        if cerrados:
            sys.exit(f'Años cerrados: {cerrados}. Reábrelos antes de importar.')
        res = aplicar_importacion(colegio.id, ops, args.sobrescribir)
        print(f"\nGrabado: {res['alumnos']} alumnos · {res['creadas']} respuestas nuevas · "
              f"{res['actualizadas']} actualizadas · {res['omitidas']} distintas sin tocar")
        db.session.remove()


if __name__ == '__main__':
    main()
