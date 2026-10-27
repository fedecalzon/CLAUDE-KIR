"""Convierte los dos PDF recibidos a WebP: todas las páginas y siete láminas para el visor.

python generar-planos-adjuntos.py --s11 "COMR-MC-REF-ESTRUCTURA S11P_RevB.pdf" \
  --subpresion "1281-C-CA-020_RevA.pdf" --salida "planos-webp"

No recorta ni modifica los PDF. Conserva IDs del manifiesto original y revisiones del cajetín.
Requiere PyMuPDF y Pillow. La salida debe ser una carpeta nueva o vacía.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

import pymupdf
from PIL import Image

S11 = {
    7: ('1281-C-PL-1202', 'Estructura sobre 11° piso - estructura proyectada - encofrados', 'R02', '02 de 07'),
    8: ('1281-C-PL-1232', 'Estructura sobre 11° piso - refuerzo de viga V1216', 'R02', '05 de 07'),
    9: ('1281-C-PL-1233', 'Estructura sobre 11° piso - refuerzo de viga V1215', 'R02', '06 de 07'),
}
SUB = {
    8: ('1281-C-PL-1802', 'Losa de subpresión - estructura proyectada - encofrados', 'R00', '02 de 04'),
    9: ('1281-C-PL-1881', 'Losa de subpresión - banquina tipo 1 para apoyo de tanques contra incendio', 'R00', '03 de 04'),
    10: ('1281-C-PL-1881-p10', 'Losa de subpresión - banquina tipo 2 para apoyo de tanques contra incendio', 'R00', '04 de 04'),
    11: ('C1224-01-PL-SDB003', 'Sistema de bombeo contra incendio - sala de bombas, planta, cortes y detalles', 'RC', ''),
}

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def dump(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--s11', type=Path, required=True)
    ap.add_argument('--subpresion', type=Path, required=True)
    ap.add_argument('--salida', type=Path, required=True)
    ap.add_argument('--ancho', type=int, default=3700)
    args = ap.parse_args()
    if not 1000 <= args.ancho <= 6000:
        ap.error('El ancho debe estar entre 1000 y 6000 píxeles')
    if args.salida.exists() and any(args.salida.iterdir()):
        ap.error('La carpeta de salida debe ser nueva o vacía; no se reemplazan imágenes existentes')
    sources = [(args.s11, S11, 15, 'S11P'), (args.subpresion, SUB, 14, 'Subpresion')]
    # Verificar todo antes de generar archivos.
    for path, mapping, expected, _ in sources:
        with pymupdf.open(path) as doc:
            if len(doc) != expected:
                ap.error(f'{path.name}: se esperaban {expected} páginas de los adjuntos recibidos')
            for n, (pid, *_) in mapping.items():
                if pid.replace('-p10', '') not in doc[n-1].get_text():
                    ap.error(f'{path.name}, página {n}: no coincide el código esperado {pid}')
    plans = args.salida / 'Planos'
    full = args.salida / 'Documentos_completos'
    plans.mkdir(parents=True)
    full.mkdir(parents=True)
    manifest, index = [], []
    for source, mapping, _, folder in sources:
        out = full / folder
        out.mkdir()
        source_sha = sha(source)
        with pymupdf.open(source) as doc:
            for n, page in enumerate(doc, 1):
                pix = page.get_pixmap(matrix=pymupdf.Matrix(args.ancho / page.rect.width, args.ancho / page.rect.width),
                                      colorspace=pymupdf.csRGB, alpha=False)
                im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
                if im.width != args.ancho:
                    sized = im.resize((args.ancho, round(im.height * args.ancho / im.width)), Image.Resampling.LANCZOS)
                    im.close()
                    im = sized
                target = out / f'pagina-{n:03d}.webp'
                im.save(target, 'WEBP', quality=90, method=6)
                width, height = im.size
                im.close()
                digest = sha(target)
                entry = {'pdf':source.name, 'pdf_sha256':source_sha, 'pagina':n,
                         'archivo':target.relative_to(args.salida).as_posix(), 'w':width, 'h':height,
                         'rotacion_pdf':page.rotation, 'tipo':'plano' if n in mapping else 'memoria',
                         'sha256':digest, 'bytes':target.stat().st_size}
                index.append(entry)
                if n in mapping:
                    pid, title, rev, sheet = mapping[n]
                    if target.stat().st_size > 6 * 1024 * 1024:
                        raise ValueError(f'{pid}: supera el límite de 6 MB de la app')
                    shutil.copyfile(target, plans / (pid + '.webp'))
                    manifest.append({'id':pid, 'planilla':'6', 'titulo':title, 'sub':f'{pid} {rev}', 'rev':rev,
                                     'pdf':source.stem, 'pag':n, 'w':width, 'h':height, 'v':digest[:16],
                                     'codigo':pid.replace('-p10', ''), 'hoja':sheet,
                                     'documentos': ['_KIR-COMR-REF-VyL-S11P-R04' if folder == 'S11P' else 'C1224-01-PL-SDB003-C' if n == 11 else '_KIR-COMR-REF-ESTR-SP-R00'],
                                     'revision_archivo':'R04' if folder == 'S11P' else 'RC' if n == 11 else 'R00',
                                     'fuente_sha256':source_sha, 'imagen_sha256':digest})
                print(f'{folder} página {n:02d}/{len(doc)}: {entry["tipo"]}, {width} × {height}, {entry["bytes"]//1024} KB', flush=True)
    # Mantener la secuencia conocida del manifiesto anterior, agregando la sala de bombas.
    order = ['1281-C-PL-1802','1281-C-PL-1881','1281-C-PL-1881-p10','1281-C-PL-1202',
             '1281-C-PL-1232','1281-C-PL-1233','C1224-01-PL-SDB003']
    manifest.sort(key=lambda p: order.index(p['id']))
    dump(plans / 'planos.json', manifest)
    dump(args.salida / 'indice-paginas.json', index)
    print(f'Listo: {len(manifest)} láminas para el visor y {len(index)} páginas completas', flush=True)

if __name__ == '__main__':
    main()
