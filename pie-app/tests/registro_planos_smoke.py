"""Prueba de interfaz con API simulada: vínculos, marcas y fotos. No escribe en Google."""
import base64
import copy
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright
from pwa_smoke import CAT, QuietHandler

ROOT = Path(__file__).resolve().parents[1]
DOC = '_KIR-COMR-REF-ESTR-SP-R00'
QUEUE = """async () => {
 const db = await new Promise((ok,no)=>{const r=indexedDB.open('pie');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
 try { return await new Promise(ok=>{const r=db.transaction('kv').objectStore('kv').get('queue');r.onsuccess=()=>ok(r.result||[])}); }
 finally {db.close()}
}"""

def main():
    cat=copy.deepcopy(CAT)
    cat['planos']=json.loads((ROOT/'planos/planos.json').read_text())
    cat['fod']['docs']=[['_KIR-COMR-REF-ESTR-SP','0','Subpresión','','','','Aprobado','Si']]
    category=cat['categorias'][0]
    category['crit'].append(['PRE','Replanteo','1','Verificar niveles','IV','NA'])
    reg=category['registros'][0]
    reg['items'][0][2]=DOC
    reg['slots']=2
    reg['items'].append([2,1,DOC,'','','','',''])
    reg['fotos']={'1':[['server-photo','https://drive.google.com/file/d/server-photo/view']]}
    reg2=copy.deepcopy(reg)
    reg2.update(h=20,elemento='Otra revisión',fotos={})
    reg2['items']=[[1,0,'_KIR-COMR-REF-ESTR-SP-R01','','','','','']]
    category['registros'].append(reg2)
    handler=functools.partial(QuietHandler,directory=str(ROOT/'pwa'))
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    origin=f'http://localhost:{server.server_port}'
    try:
      with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':int(os.environ.get('PIE_TEST_WIDTH','390')),'height':844})
        page=context.new_page()
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        requests=[]
        def api(route):
          req=route.request.post_data_json
          requests.append(req)
          if req['action']=='plano':
            response={'ok':True,'mime':'image/webp','data':base64.b64encode((ROOT/'planos'/(req['id']+'.webp')).read_bytes()).decode()}
          elif req['action']=='batch':
            for op in req['ops']:
              if op['op']=='pin' and op['accion']=='poner':
                cat['pines'].append([op['pin'],'6',9,op['plano'],op['x'],op['y'],op['elemento'],'11','TEST',op['alc']['k'],op['alc']['v'],op.get('pts'),op.get('color','auto')])
              if op['op']=='pin' and op['accion']=='quitar':
                cat['pines']=[pin for pin in cat['pines'] if pin[0]!=op['pin']]
              if op['op']=='pin' and op['accion']=='color':
                next(pin for pin in cat['pines'] if pin[0]==op['pin'])[12]=op['color']
              if op['op']=='update':
                for off,patch in op['items'].items():
                  row=next(x for x in reg['items'] if x[0]==int(off))
                  for field,i in [('documento',2),('fecha',3),('resp',4),('estado',5),('fum',6),('obs',7)]:
                    if field in patch:row[i]=patch[field]
              if op['op']=='photo':
                reg['fotos'].setdefault(str(op['off']),[]).append([op['id'],'https://drive.google.com/file/d/'+op['id']+'/view'])
            response={'ok':True,'results':[{'id':op['id'],'ok':True,'sheet':'6','h':9} for op in req['ops']],'categorias':cat['categorias'],'pines':cat['pines']}
          else: response=cat
          route.fulfill(status=200,content_type='application/json',body=json.dumps(response))
        context.route('**/api',api)
        context.route('https://drive.google.com/**',lambda route:route.abort())
        page.add_init_script("""if(!localStorage.getItem('pie.settings'))localStorage.setItem('pie.settings',JSON.stringify({apiUrl:location.origin+'/api',token:'DEMO-NO-SECRET',inspector:'Inspector de prueba'}))""")
        page.goto(origin+'/index.html#/c/6/r/h9')
        page.locator('[data-act="reg-plan"]').first.wait_for()
        page.evaluate('navigator.serviceWorker.ready')
        page.wait_for_function('!!navigator.serviceWorker.controller')
        assert page.locator('.docrow').inner_text().find('3 hojas')>=0
        page.locator('.docrow').click()
        page.wait_for_function('document.getElementById("plImg")?.naturalWidth > 0')
        assert page.locator('[data-act="pl-lam"]').count()==3
        assert page.evaluate('location.hash')=='#/c/6/r/h9'
        assert page.locator('#plActive').inner_text().find('Hoja 02 de 04')>=0
        assert page.locator('.reg-docs').count()==1
        image_height=page.locator('#plView').bounding_box()['height']
        assert image_height>=320
        assert page.locator('#plWrap').evaluate('e=>getComputedStyle(e).position')=='relative'
        assert page.locator('#regPhotos .thumbs a').count()==1
        page.locator('[data-act="more"]').first.click()
        assert page.locator('.det .thumbs, .det [data-photo]').count()==0
        assert page.locator('#photoControl').count()==0
        assert page.locator('.docrow').evaluate('e=>parseFloat(getComputedStyle(e).borderTopWidth)')>=1
        assert page.locator('#plView #plLeg').count()==0
        page.locator('[data-act="pl-lam"]').nth(1).click()
        page.wait_for_function('document.getElementById("plImg")?.naturalWidth > 0')
        assert requests[-1]['id']=='1281-C-PL-1881'
        print('OK: código abre tres hojas dentro del registro; selector conserva hoja y detalle sin fotos')
        # Descargar la tercera hoja y volver antes de quedar offline.
        page.locator('[data-act="pl-lam"]').nth(2).click()
        page.wait_for_function('document.getElementById("plImg")?.naturalWidth > 0')
        page.locator('[data-act="pl-lam"]').first.click()
        page.wait_for_function('document.getElementById("plImg")?.naturalWidth > 0')
        context.set_offline(True)
        page.locator('[data-act="pl-mode"]').click()
        page.locator('#plView').scroll_into_view_if_needed()
        box=page.locator('#plStage').bounding_box()
        page.mouse.click(box['x']+box['width']*.5,box['y']+box['height']*.5)
        page.locator('[data-act="pl-scope"][data-k="tarea"]').first.click()
        page.wait_for_function('document.querySelectorAll("#plPins [data-pin]").length === 1')
        assert abs(page.locator('#plView').bounding_box()['height']-image_height)<1
        page.locator('[data-act="pl-color"][data-color="violeta"]').click()
        assert page.locator('#plPins .manual').count()==1
        assert page.locator('#plPins .manual .pin-dot').evaluate('e=>getComputedStyle(e).backgroundColor')=='rgb(117, 66, 168)'
        assert page.locator('[data-color="violeta"]').get_attribute('aria-pressed')=='true'
        assert page.locator('[data-act="pl-mark"]').count()==3
        page.wait_for_timeout(400)
        page.locator('[data-act="pl-mark"][data-st="ap"]').click()
        page.wait_for_function('document.querySelector("#it-1 [data-act=mark][data-st=ap]")?.getAttribute("aria-pressed") === "true"')
        # Zona a la segunda hoja. La marca queda ligada al registro actual, sin elegirlo otra vez.
        page.locator('[data-act="pl-lam"]').nth(1).click()
        # Respetar la protección contra doble toque al cambiar la botonera.
        page.wait_for_timeout(400)
        page.locator('[data-act="pl-zona"]').click()
        page.wait_for_function('document.getElementById("plBar").innerText.includes("esquinas")')
        page.locator('#plView').scroll_into_view_if_needed()
        box=page.locator('#plStage').bounding_box()
        for x,y in [(0.4,0.4),(0.6,0.4),(0.5,0.6)]:
          page.mouse.click(box['x']+box['width']*x,box['y']+box['height']*y)
        page.locator('[data-act="pl-zcerrar"]').click()
        page.locator('[data-act="pl-scope"][data-k="reg"]').click()
        page.wait_for_timeout(400)
        page.locator('[data-act="pl-color"][data-color="naranja"]').click()
        assert page.locator('#plZoneG polygon[data-pin]').get_attribute('stroke')=='#A64B08'
        assert page.locator('#plView').bounding_box()['height']>=320
        page.locator('input[data-photo][multiple]').set_input_files(ROOT/'pwa/icon-192.png')
        page.wait_for_function('document.querySelectorAll("#regPhotos [data-act=rmphoto]").length === 1')
        page.wait_for_function('('+QUEUE+')().then(q=>q.filter(o=>o.op==="pin").length===2 && q.some(o=>o.op==="photo" && o.off===0 && o.scope==="registro"))')
        queue=page.evaluate(QUEUE)
        pins=[o for o in queue if o['op']=='pin']
        assert all(o['h']==9 and o['sheet']=='6' for o in pins)
        assert pins[0]['color']=='violeta' and pins[1]['color']=='naranja'
        assert pins[0]['plano']=='1281-C-PL-1802' and pins[0]['alc']['k']=='tarea'
        assert pins[1]['plano']=='1281-C-PL-1881' and len(pins[1]['pts'])==3
        print('OK: pin y zona vinculados al registro; foto general se guarda en el registro (offset 0) sin selector')
        page.reload()
        page.locator('.docrow').wait_for()
        assert page.locator('#regPhotos .thumbs a').count()==1
        page.locator('#regPhotos [data-act="rmphoto"]').wait_for()
        page.locator('.docrow').click()
        page.wait_for_function('document.getElementById("plImg")?.naturalWidth > 0')
        assert page.locator('#plPins [data-pin]').count()==1
        assert 'manual' in page.locator('#plPins [data-pin]').get_attribute('class')
        page.locator('[data-act="pl-lam"]').nth(1).click()
        assert page.locator('#plZoneG polygon[data-pin]').count()==1
        assert page.locator('#plZoneG polygon[data-pin]').get_attribute('stroke')=='#A64B08'
        print('OK: imágenes, marcas y foto local conservadas tras recarga sin conexión')
        # Navegar a una revisión no disponible: no mostrar imágenes de R00 bajo R01.
        page.goto(origin+'/index.html#/c/6/r/h20')
        page.locator('.docrow').wait_for()
        assert 'Sin imagen vinculada' in page.locator('.reg-docs').inner_text()
        page.locator('.docrow').click()
        assert page.locator('#plImg').count()==0
        assert 'No hay imágenes vinculadas' in page.locator('.reg-plan').inner_text()
        # Funcionalidad global de planos sigue disponible.
        page.goto(origin+'/index.html#/c/6')
        page.get_by_role('tab',name='Planos',exact=True).click()
        page.locator('#plWrap').wait_for()
        assert page.locator('[data-act="pl-lam"]').count()==7
        print('OK: revisión incorrecta no se enlaza y pestaña general mantiene las siete hojas')
        page.goto(origin+'/index.html#/c/6/r/h9')
        page.locator('.docrow').wait_for()
        context.set_offline(False)
        page.wait_for_function('('+QUEUE+')().then(q=>q.length===0)',timeout=20000)
        page.wait_for_function('document.querySelectorAll("#regPhotos .thumbs a").length === 2',timeout=20000)
        assert any(req['action']=='batch' and any(o['op']=='photo' and o['off']==0 and o['scope']=='registro' for o in req['ops']) for req in requests)
        if page.locator('#plImg').count()==0: page.locator('.docrow').click()
        page.wait_for_function('document.getElementById("plImg")?.naturalWidth > 0')
        # Marca confirmada: cambiar color crea una operación propia y se conserva al recargar.
        page.locator('#plPins [data-pin]').click()
        page.locator('[data-act="pl-color"][data-color="azul"]').click()
        page.wait_for_function('('+QUEUE+')().then(q=>q.length===0)',timeout=20000)
        page.wait_for_function('document.body.innerText.includes("Al día")',timeout=20000)
        assert any(req['action']=='batch' and any(o.get('accion')=='color' and o['color']=='azul' for o in req['ops']) for req in requests)
        assert cat['pines'][0][12]=='azul'
        page.reload()
        page.locator('.docrow').wait_for()
        page.locator('.docrow').click()
        page.wait_for_function('document.getElementById("plImg")?.naturalWidth > 0')
        assert '#2563A6' in page.locator('#plPins [data-pin]').get_attribute('style')
        # La rueda desplaza la página y el zoom responde únicamente con modificador.
        page.locator('#plView').scroll_into_view_if_needed()
        box=page.locator('#plView').bounding_box()
        page.mouse.move(box['x']+box['width']*.5,box['y']+box['height']*.5)
        scale=lambda:page.locator('#plStage').evaluate('e=>new DOMMatrix(getComputedStyle(e).transform).a')
        before=scale();y0=page.evaluate('scrollY')
        page.mouse.wheel(0,160)
        page.wait_for_function('scrollY > '+str(y0))
        assert abs(scale()-before)<.00001
        page.locator('#plView').scroll_into_view_if_needed()
        box=page.locator('#plView').bounding_box()
        page.mouse.move(box['x']+box['width']*.5,box['y']+box['height']*.5)
        page.keyboard.down('Control');page.mouse.wheel(0,-180);page.keyboard.up('Control')
        page.wait_for_function('new DOMMatrix(getComputedStyle(document.getElementById("plStage")).transform).a > '+str(before))
        page.locator('#plView').focus()
        page.keyboard.press('+')
        page.keyboard.press('+')
        page.wait_for_timeout(100)
        transform=page.locator('#plStage').get_attribute('style')
        box=page.locator('#plView').bounding_box()
        x=box['x']+box['width']*.5;y=box['y']+box['height']*.5
        page.mouse.move(x,y);page.mouse.down();page.mouse.move(x-60,y-30,steps=20);page.mouse.up()
        page.wait_for_function('(s)=>document.getElementById("plStage").getAttribute("style") !== s',arg=transform)
        assert page.locator('#plPins [data-pin]').count()==1
        page.keyboard.press('0')
        print('OK: colores persisten antes y después del envío; panel no achica imagen; rueda, zoom y arrastre funcionan')
        page.locator('#plPins [data-pin]').click()
        page.locator('.reg-docs').scroll_into_view_if_needed()
        page.wait_for_function('document.body.classList.contains("det-vis")')
        page.wait_for_function('getComputedStyle(document.querySelector(".bbar")).visibility === "hidden"')
        page.screenshot(path=os.environ.get('PIE_SCREENSHOT', '/tmp/PIE-beta4-vista.png'),full_page=True,animations='disabled')
        # Filtro claro fuera del plano, borrado con cancelación y deshacer.
        page.locator('[data-input="pl-state"]').select_option('rz')
        assert page.locator('#plPins [data-pin]').count()==0
        page.locator('[data-input="pl-state"]').select_option('all')
        assert page.locator('#plPins [data-pin]').count()==1
        context.set_offline(True)
        page.locator('[data-act="pl-delete-mode"]').click()
        page.locator('#plPins [data-pin]').click()
        page.locator('#ask [data-ans="cancel"]').click()
        assert page.locator('#plPins [data-pin]').count()==1
        page.wait_for_timeout(400)
        page.locator('#plPins [data-pin]').click()
        page.locator('#ask [data-ans="ok"]').click()
        page.wait_for_function('document.querySelectorAll("#plPins [data-pin]").length===0')
        page.locator('#toast .act').click()
        page.wait_for_function('document.querySelectorAll("#plPins [data-pin]").length===1')
        page.wait_for_timeout(400)
        page.locator('#plPins [data-pin]').click()
        page.locator('#ask [data-ans="ok"]').click()
        page.locator('[data-act="pl-lam"]').nth(1).click()
        page.locator('[data-act="pl-delete-mode"]').click()
        page.locator('#plPins [data-pin]').click()
        page.locator('#ask [data-ans="ok"]').click()
        page.wait_for_function('document.querySelectorAll("#plZoneG polygon[data-pin]").length===0')
        page.wait_for_function('('+QUEUE+')().then(q=>q.filter(o=>o.accion==="quitar").length===2)')
        # Recarga durante la cola offline: las marcas borradas no reaparecen.
        page.reload();page.locator('.docrow').wait_for();page.locator('.docrow').click()
        assert page.locator('#plPins [data-pin]').count()==0
        context.set_offline(False)
        page.wait_for_function('('+QUEUE+')().then(q=>q.length===0)',timeout=20000)
        assert len(cat['pines'])==0
        assert len(reg['fotos']['0'])==1 and len(reg['fotos']['1'])==1
        assert reg['items'][0][5]=='AP'
        print('OK: filtro con nombres, cancelación, borrar pin/zona, deshacer y sincronización sin perder fotos ni controles')
        assert not errors,errors
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        print('OK: reconexión confirma marcas y foto; galería sin duplicados; sin errores JS ni desborde móvil')
        browser.close()
    finally:
      server.shutdown()
      server.server_close()

if __name__=='__main__':main()
