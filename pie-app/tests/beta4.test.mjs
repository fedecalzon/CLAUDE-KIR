import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const plain=v=>JSON.parse(JSON.stringify(v));
function photos() {
 const c=vm.createContext({console});
 for(const name of ['Code.gs','Beta.gs'])vm.runInContext(fs.readFileSync(new URL('../apps-script/'+name,import.meta.url),'utf8'),c);
 const rows=[],notes=[],files=[];
 const sheet={getRange:(row,col)=>({getNote:()=>'',setNote:note=>notes.push({row,col,note})})};
 const block={tareaRow:9,header:{elemento:'Base',piso:'SS4'},cols:{obs:12},items:[{off:2,tarea:'Ensayo',criterio:'Revisar'}]};
 c.sheetOrThrow_=()=>sheet;c.resolveBlock_=()=>({blk:block,title:'Hormigón'});
 c.resolveItemOffsets_=(_b,req)=>{assert.ok(req[2]);return {2:req[2]};};
 c.readFotosIndex_=()=>({});c.fotosSheet_=()=>({appendRow:r=>rows.push(plain(r))});
 c.photoFolder_=()=>({createFile:blob=>{const file={blob,getUrl:()=> 'https://drive.test/foto',getId:()=> 'photo-id',setDescription:desc=>{file.description=desc;}};files.push(file);return file;}});
 c.Session={getScriptTimeZone:()=> 'America/Argentina/Buenos_Aires'};
 c.Utilities={formatDate:()=> '2026-10-21',base64Decode:s=>s,newBlob:(data,mime,name)=>({data,mime,name})};
 const op={id:'foto1',op:'photo',sheet:'6',h:9,data:'aGVsbG8=',mime:'image/jpeg',by:'TEST',takenAt:'2026-10-21T11:00'};
 return {c,rows,notes,files,op,block};
}
test('foto general: guarda en registro (offset 0), sin tocar notas de controles ni necesitar ítems',()=>{
 const f=photos();f.block.items=[];
 f.c.opPhoto_({}, {}, {...f.op,scope:'registro',off:999});
 assert.equal(f.rows[0][2],9);assert.equal(f.rows[0][3],0);assert.equal(f.rows[0][4],9);
 assert.equal(f.rows[0][5],'Foto general del registro');assert.deepEqual(f.notes,[]);
 assert.match(f.files[0].blob.name,/_Registro_/);assert.match(f.files[0].description,/Foto general del registro/);
});
test('foto antigua pendiente: mantiene referencia original al control y su nota',()=>{
 const f=photos();f.c.opPhoto_({}, {}, {...f.op,off:2,criterio:'Revisar',tarea:'Ensayo'});
 assert.equal(f.rows[0][3],2);assert.equal(f.rows[0][4],11);assert.equal(f.rows[0][5],'Revisar');
 assert.equal(f.notes.length,1);assert.equal(f.notes[0].row,11);
});
test('foto: alcance desconocido se rechaza sin crear archivo ni índice',()=>{
 const f=photos();assert.throws(()=>f.c.opPhoto_({}, {}, {...f.op,scope:'inventado'}),e=>e.code==='bad_request');
 assert.equal(f.files.length,0);assert.equal(f.rows.length,0);
});
const html=fs.readFileSync(new URL('../apps-script/Index.html',import.meta.url),'utf8');
const src=html.slice(html.indexOf('  function plQuit(p)'),html.indexOf('  function plRequestDelete(pin)'));
function deletion(queue) {
 const c=vm.createContext({S:{queue,hold:{}},pinOp:(accion,pin,r)=>({id:'delete1',op:'pin',accion,pin,...r,status:'pending'}),
 hold:(o,ms)=>{c.S.hold[o.id]={ms};},queueChanged:()=>{},plDraw:()=>{},toast:()=>{}});
 vm.runInContext(src,c);return c;
}
const pin={id:'p1',sheet:'6',elemento:'Base',piso:'SS4'};
test('borrar marca local y deshacer restaura alta, color y geometría sin afectar otras operaciones',()=>{
 const orig=[{id:'other',op:'update'}, {id:'put1',op:'pin',accion:'poner',pin:'p1',status:'pending',color:'rosa',pts:[[.1,.1],[.2,.1],[.2,.2]]}];
 const c=deletion(plain(orig)),undo=c.plQuit(pin);
 assert.equal(c.S.queue.length,1);undo();assert.deepEqual(plain(c.S.queue),orig);undo();assert.equal(c.S.queue.length,2);
});
test('borrar marca enviada retiene envío y deshacer restaura cambios de color/movimiento pendientes',()=>{
 const orig=[{id:'color1',op:'pin',accion:'color',pin:'p1',status:'pending',color:'azul'}, {id:'move1',op:'pin',accion:'mover',pin:'p1',status:'pending',x:.2,y:.3}];
 const c=deletion(plain(orig)),undo=c.plQuit(pin);
 assert.equal(c.S.queue.length,1);assert.equal(c.S.queue[0].accion,'quitar');assert.equal(c.S.hold.delete1.ms,6500);
 undo();assert.deepEqual(plain(c.S.queue),orig);assert.equal(c.S.hold.delete1,undefined);
});
test('deshacer no restaura una marca cuyo borrado ya está enviándose',()=>{
 const c=deletion([]),undo=c.plQuit(pin);c.S.queue[0].status='sending';c.S.queue[0].sent=true;
 undo();assert.equal(c.S.queue.length,1);assert.equal(c.S.queue[0].accion,'quitar');
});
