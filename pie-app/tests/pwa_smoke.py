"""Prueba local con Chromium y API simulada; no conecta con Google ni modifica planillas."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CAT = {
    'ok': True, 'version': '2.3.0-beta.1', 'generado': '2026-10-20T12:00:00Z',
    'datos': {'obra': 'Obra de prueba BETA', 'direccion': '', 'licitacion': '',
              'responsables': [{'nombre': 'Inspector de prueba', 'abrev': 'TEST'}],
              'instrumentos': [], 'metodos': ['IV'], 'estados': ['AP', 'RZ']},
    'categorias': [{'sheet': '6', 'titulo': 'Hormigón armado', 'rubro': 'Fundaciones y estructuras',
                    'crit': [['PRE', 'Armadura', '1', 'Verificar armadura', 'IV', 'NA']],
                    'registros': [{'h': 9, 's': 3, 'sig': 'test', 'slots': 1, 'resp': ['Inspector de prueba'],
                                   'piso': '11', 'sector': 'A', 'etapa': '', 'elemento': 'V1216',
                                   'cols': ['documento', 'fecha', 'resp', 'estado', 'fum', 'obs'],
                                   'fotos': {}, 'items': [[1, 0, '', '', '', '', '', '']]}]}],
    'fod': {'docs': []}, 'fums': [], 'equipos': [], 'liberaciones': [], 'pines': [], 'planos': []
}

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

def main():
    handler = functools.partial(QuietHandler, directory=str(ROOT / 'pwa'))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://localhost:{server.server_port}'
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),
                                        headless=True, args=['--no-sandbox'])
            context = browser.new_context(viewport={'width': 390, 'height': 844})
            page = context.new_page()
            errors, batches = [], []
            page.on('pageerror', lambda err: errors.append(str(err)))
            def api(route):
                req = route.request.post_data_json
                if req['action'] == 'batch':
                    batches.append(req['ops'])
                    for op in req['ops']:
                        if op['op'] == 'update':
                            patch = op['items']['1']
                            row = CAT['categorias'][0]['registros'][0]['items'][0]
                            for field, i in [('documento',2),('fecha',3),('resp',4),('estado',5),('fum',6),('obs',7)]:
                                if field in patch:
                                    row[i] = patch[field]
                    response = {'ok': True, 'results': [{'id': op['id'], 'ok': True, 'sheet': '6', 'h': 9} for op in req['ops']],
                                'categorias': CAT['categorias'], 'fums': [], 'liberaciones': [], 'pines': []}
                else:
                    response = CAT
                route.fulfill(status=200, content_type='application/json', body=json.dumps(response))
            context.route('**/api', api)
            page.add_init_script("""if (!localStorage.getItem('pie.settings')) {
              localStorage.setItem('pie.settings', JSON.stringify({apiUrl:location.origin+'/api',token:'DEMO-NO-SECRET',inspector:'Inspector de prueba'}));
            }""")
            page.goto(origin + '/index.html')
            page.wait_for_function("document.body.innerText.includes('Obra de prueba BETA')")
            page.evaluate('navigator.serviceWorker.ready')
            page.wait_for_function('!!navigator.serviceWorker.controller')
            print('OK: shell, catálogo y service worker disponibles')
            context.set_offline(True)
            page.goto(origin + '/index.html#/c/6/r/h9')
            page.locator('[data-act="mark"][data-st="ap"]').wait_for()
            page.locator('[data-act="mark"][data-st="ap"]').click()
            page.wait_for_function("document.querySelector('[data-act=mark][data-st=ap]').getAttribute('aria-pressed') === 'true'")
            # Esperar a la persistencia, sin depender de un temporizador arbitrario.
            page.wait_for_function("""async () => {
              const db = await new Promise((resolve,reject)=>{const r=indexedDB.open('pie');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
              try { return await new Promise(resolve=>{const r=db.transaction('kv').objectStore('kv').get('queue');r.onsuccess=()=>resolve((r.result||[]).length>0)}); }
              finally {db.close()}
            }""")
            page.reload()
            page.wait_for_function("document.querySelector('[data-act=mark][data-st=ap]')?.getAttribute('aria-pressed') === 'true'")
            print('OK: apertura offline y control AP conservado tras recargar')
            context.set_offline(False)
            page.wait_for_function("document.body.innerText.includes('Al día')", timeout=20000)
            assert len(batches) == 1, f'Lotes recibidos: {len(batches)}'
            assert batches[0][0]['items']['1']['estado'] == 'AP'
            assert not errors, errors
            print('OK: reconexión envía la operación y recibe confirmación; sin errores JavaScript')
            page.evaluate("""async () => {
              const db = await new Promise((resolve,reject)=>{const r=indexedDB.open('pie');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
              const queue = Array.from({length:27}, (_,i)=>({id:'batch-test-'+i, op:'update',sheet:'6',h:9,sig:'test',elemento:'V1216',status:'pending',createdAt:1,
                items:{1:{criterio:'Verificar armadura',tarea:'Armadura',obs:'Control de lote '+i}}}));
              try {await new Promise((resolve,reject)=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').put(queue,'queue');t.oncomplete=resolve;t.onerror=()=>reject(t.error)});}
              finally {db.close()}
            }""")
            page.reload()
            # La marca DOM se usa como señal de que terminaron las respuestas y los renders.
            page.wait_for_function("document.body.innerText.includes('Control de lote 26')", timeout=20000)
            page.wait_for_function("""async () => {
              const db = await new Promise((resolve,reject)=>{const r=indexedDB.open('pie');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
              try { return await new Promise(resolve=>{const r=db.transaction('kv').objectStore('kv').get('queue');r.onsuccess=()=>resolve(Array.isArray(r.result)&&r.result.length===0)}); }
              finally {db.close()}
            }""", timeout=20000)
            page.wait_for_function("document.body.innerText.includes('Al día')", timeout=20000)
            assert [len(b) for b in batches] == [1, 25, 2], {'sizes':[len(b) for b in batches], 'ids':[[o['id'] for o in b] for b in batches], 'errors':errors, 'screen':page.locator('body').inner_text()[:1200]}
            ids = [op['id'] for batch in batches[1:] for op in batch]
            assert len(ids) == len(set(ids)) == 27
            cache_urls = page.evaluate("""async () => {
              const names = (await caches.keys()).filter(n=>n.startsWith('pie-shell-'));
              return (await Promise.all(names.map(async n=>(await (await caches.open(n)).keys()).map(r=>r.url)))).flat();
            }""")
            assert len(cache_urls) == 4, cache_urls
            assert all('/api' not in u and 'token=' not in u for u in cache_urls)
            assert not errors, errors
            print('OK: 27 operaciones salen en lotes de 25 y 2, sin duplicar ni perder identificadores')
            print('OK: caché del shell limitada a 4 archivos; sin API ni parámetros de acceso')
            print('API de Google, fotografías reales e iPhone: no ejercitados por esta prueba')
            browser.close()
    finally:
        server.shutdown()
        server.server_close()

if __name__ == '__main__':
    main()
