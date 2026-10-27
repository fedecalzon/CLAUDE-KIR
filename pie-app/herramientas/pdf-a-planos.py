"""Pasa láminas de uno o varios PDF a imágenes WebP para la pestaña Planos del PIE (v2.1) y arma planos.json.

Uso:
  python pdf-a-planos.py --planilla 6 --salida <carpeta> "<archivo.pdf>:8,9,10" "<otro.pdf>:7-9"

  --planilla  nombre de la planilla del PIE donde aparecen los planos (por defecto 6).
  --salida    carpeta donde quedan <id>.webp y planos.json (si planos.json ya existe, suma o reemplaza por id).
  --ancho     ancho en píxeles de la imagen (por defecto 3700).
  <pdf>:págs  páginas que son planos (1 = primera). Lista con comas y rangos: 8,9,10 o 7-9.

El id sale del código del cajetín (p. ej. 1281-C-PL-1802); si dos páginas lo repiten, se agrega -p<página>.
El título y la revisión salen del cajetín; se pueden corregir a mano en planos.json.
Después se suben a la carpeta «Planos» de Drive (menú PIE › Planos: abrir carpeta y verificar) todos los
.webp y el planos.json, y en el celular se toca «Sincronizar y descargar todo».
"""
import argparse, datetime, io, json, os, re, sys

import pymupdf
from PIL import Image

CODIGO = re.compile(r'\b\d{3,5}-[A-Z]-PL-\d+\b')


def paginas(txt):
    out = []
    for parte in txt.split(','):
        parte = parte.strip()
        if not parte:
            continue
        if '-' in parte:
            a, b = parte.split('-', 1)
            out += list(range(int(a), int(b) + 1))
        else:
            out.append(int(parte))
    return out


def texto_a_la_derecha(pag, rotulo, ancho_rel, alto_pt, arriba=6):
    """Texto que está a la derecha de un rótulo del cajetín (p. ej. «TITULO:»)."""
    hits = pag.search_for(rotulo)
    if not hits:
        return ''
    r = hits[0]
    clip = pymupdf.Rect(r.x1, r.y0 - arriba, r.x1 + pag.rect.width * ancho_rel, r.y0 + alto_pt)
    return ' '.join(pag.get_text(clip=clip).split())


def titulo_grande(pag, rotulo='TITULO:'):
    """Título del cajetín: el texto de mayor tamaño a la derecha del rótulo (descarta rótulos y nombres de archivo)."""
    hits = pag.search_for(rotulo)
    if not hits:
        return ''
    r = hits[0]
    clip = pymupdf.Rect(r.x1, r.y0 - 6, r.x1 + pag.rect.width * 0.36, r.y0 + 40)
    spans = [s for b in pag.get_text('dict', clip=clip)['blocks'] if b.get('type') == 0
             for l in b['lines'] for s in l['spans'] if s['text'].strip()]
    if not spans:
        return ''
    top = max(s['size'] for s in spans)
    t = ' '.join(' '.join(s['text'].strip() for s in spans if s['size'] >= top * 0.85).split())
    return re.sub(r'(?i)^proyecto ejecutivo\s+', '', t)   # el «TIPO» del cajetín cae dentro del recorte


def oracion(t):
    t = t.strip().lower()
    t = re.sub(r'\b([a-z])(\d{3,})\b', lambda m: m.group(1).upper() + m.group(2), t)   # v1216 -> V1216
    t = re.sub(r'(\d+)\s*[°º]?\s+(piso|subsuelo)\b', r'\1° \2', t)                      # 11 piso -> 11° piso
    return t[:1].upper() + t[1:]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--planilla', default='6')
    ap.add_argument('--salida', required=True)
    ap.add_argument('--ancho', type=int, default=3700)
    ap.add_argument('origen', nargs='+', help='archivo.pdf:páginas')
    a = ap.parse_args()

    os.makedirs(a.salida, exist_ok=True)
    mpath = os.path.join(a.salida, 'planos.json')
    lista = []
    if os.path.exists(mpath):
        with io.open(mpath, encoding='utf-8') as f:
            lista = json.load(f)
    por_id = {p['id']: p for p in lista}
    ahora = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M')

    for item in a.origen:
        ruta, _, pgs = item.rpartition(':')
        if not ruta or not pgs or not pgs.replace(',', '').replace('-', '').isdigit():
            sys.exit('Formato: "archivo.pdf:8,9,10" (recibí %r)' % item)
        doc = pymupdf.open(ruta)
        stem = os.path.splitext(os.path.basename(ruta))[0]
        for n in paginas(pgs):
            if not 1 <= n <= len(doc):
                sys.exit('%s no tiene la página %d (tiene %d)' % (stem, n, len(doc)))
            pag = doc[n - 1]
            m = CODIGO.search(pag.get_text())
            pid = m.group(0) if m else '%s-p%d' % (stem, n)
            if pid in por_id and por_id[pid].get('pdf') == stem and por_id[pid].get('pag') != n:
                pid = '%s-p%d' % (pid, n)   # dos páginas con el mismo código en el mismo PDF
            titulo = oracion(titulo_grande(pag)) or 'Lámina %d de %s' % (n, stem)
            rev = texto_a_la_derecha(pag, 'REVISION:', 0.06, 26, 4)
            rev = ('R' + rev) if re.fullmatch(r'\d+', rev) else ''
            z = a.ancho / pag.rect.width
            pix = pag.get_pixmap(matrix=pymupdf.Matrix(z, z), alpha=False)
            im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
            im.save(os.path.join(a.salida, pid + '.webp'), 'WEBP', quality=82, method=6)
            por_id[pid] = {'id': pid, 'planilla': a.planilla, 'titulo': titulo, 'sub': ('%s %s' % (pid, rev)).strip(),
                           'rev': rev, 'pdf': stem, 'pag': n, 'w': pix.width, 'h': pix.height, 'v': ahora}
            kb = os.path.getsize(os.path.join(a.salida, pid + '.webp')) // 1024
            print('%-18s %-22s p.%-3d %s  (%d KB)' % (pid, stem[:22], n, titulo[:60], kb))

    with io.open(mpath, 'w', encoding='utf-8') as f:
        json.dump(list(por_id.values()), f, ensure_ascii=False, indent=1)
    print('planos.json: %d láminas en %s' % (len(por_id), a.salida))


if __name__ == '__main__':
    main()
