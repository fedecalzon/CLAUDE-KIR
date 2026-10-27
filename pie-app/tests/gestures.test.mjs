import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Ejecuta las funciones reales del visor, no una copia de su lógica.
// El DOM simulado permite inyectar pérdida de captura, blur y frames a voluntad.
const html = fs.readFileSync(new URL('../apps-script/Index.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('  function plFit('), html.indexOf('  function plSelPin('));

function fixture() {
  const listeners = new Map();
  const winListeners = new Map();
  const docListeners = new Map();
  const frames = new Map();
  const taps = [];
  const captured = new Set();
  let frameId = 0, writes = 0, transform = '';
  const state = {z: 1, fit: .4, tx: -300, ty: -250};
  const pl = {id: 'test-plan', w: 1000, h: 800};
  const style = {setProperty() {}, get transform() {return transform;}, set transform(value) {transform = value; writes++;}};
  const target = {closest: () => null};
  function on(map, name, fn) {if (!map.has(name)) map.set(name, []); map.get(name).push(fn);}
  function off(map, name, fn) {map.set(name, (map.get(name) || []).filter(x => x !== fn));}
  const v = {
    clientWidth: 400, clientHeight: 300, isConnected: true, style: {},
    addEventListener: (name, fn) => on(listeners, name, fn),
    removeEventListener: (name, fn) => off(listeners, name, fn),
    getBoundingClientRect: () => ({left: 10, top: 20, width: v.clientWidth, height: v.clientHeight}),
    setPointerCapture: id => captured.add(id),
    releasePointerCapture: id => captured.delete(id),
    hasPointerCapture: id => captured.has(id),
    closest: () => null,
    contains: node => node === target || node === v,
    classList: {add() {}, remove() {}, toggle() {}},
  };
  const st = {
    style, isConnected: true,
    getBoundingClientRect: () => ({left: 10 + state.tx, top: 20 + state.ty, width: pl.w * state.z, height: pl.h * state.z}),
  };
  const window = {
    addEventListener: (name, fn) => on(winListeners, name, fn),
    removeEventListener: (name, fn) => off(winListeners, name, fn),
  };
  const document = {
    hidden: false, visibilityState: 'visible',
    getElementById: id => id === 'plView' ? v : id === 'plStage' ? st : null,
    addEventListener: (name, fn) => on(docListeners, name, fn),
    removeEventListener: (name, fn) => off(docListeners, name, fn),
  };
  const requestAnimationFrame = fn => {frames.set(++frameId, fn); return frameId;};
  const cancelAnimationFrame = id => frames.delete(id);
  Object.assign(window, {requestAnimationFrame, cancelAnimationFrame});
  const c = vm.createContext({console, Math, Number, Date, Object, PL: state, document, window,
    requestAnimationFrame, cancelAnimationFrame,
    ResizeObserver: class {observe() {} disconnect() {}},
    r5: n => Math.round(n*100000)/100000, plTap: (x,y) => taps.push([x,y]),
  });
  vm.runInContext(source, c);
  c.plGestures(v, pl);
  const event = (type, values={}) => ({type, target, pointerId: 1, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1,
    clientX: 100, clientY: 120, deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false,
    prevented: false, preventDefault() {this.prevented=true;}, stopPropagation() {}, ...values});
  function emit(type, values={}, map=listeners) {
    const e=event(type, values);
    for (const fn of [...(map.get(type)||[])]) fn(e);
    return e;
  }
  function flush() {
    const batch=[...frames.values()]; frames.clear();
    for (const fn of batch) fn(16);
  }
  return {c, pl, state, v, taps, captured, emit, flush,
    blur: () => emit('blur',{},winListeners),
    visibility: () => {document.hidden=true;document.visibilityState='hidden';emit('visibilitychange',{},docListeners);},
    writes: () => writes, transform: () => transform,
  };
}

function finiteState(f) {
  for (const key of ['z','fit','tx','ty']) assert.ok(Number.isFinite(f.state[key]), key+' debe ser finito');
  assert.ok(f.state.z > 0, 'escala positiva');
  assert.ok(!/NaN|Infinity/.test(f.transform()), 'transformación válida');
}

test('rueda normal permite desplazar la página sin cambiar zoom', () => {
  const f=fixture(), before=f.state.z;
  const e=f.emit('wheel',{deltaY:120}); f.flush();
  assert.equal(e.prevented,false);
  assert.equal(f.state.z,before);
});

for (const modifier of ['ctrlKey','metaKey']) {
  test(modifier+': rueda da zoom gradual centrado en el puntero', () => {
    const f=fixture();
    const before=f.state.z;
    const e=f.emit('wheel',{deltaY:-1,[modifier]:true}); f.flush();
    assert.equal(e.prevented,true);
    assert.ok(f.state.z>before && f.state.z<before*1.05, 'delta de un píxel no debe saltar 18%');
    finiteState(f);
  });
}

test('rueda horizontal no cambia escala', () => {
  const f=fixture(), before=f.state.z;
  f.emit('wheel',{deltaX:80,deltaY:0,ctrlKey:true}); f.flush();
  assert.equal(f.state.z,before);
});

test('arrastre agrupa eventos en un único dibujo por frame y no pierde distancia', () => {
  const f=fixture();
  f.emit('pointerdown');
  for (let i=1;i<=20;i++) f.emit('pointermove',{clientX:100+i,clientY:120+i});
  assert.ok(f.writes()<=1, 'no redibujar por cada evento');
  f.flush();
  assert.ok(f.writes()<=2, 'como máximo un dibujo adicional por frame');
  assert.equal(f.state.tx,-280);
  assert.equal(f.state.ty,-230);
  f.emit('pointerup',{clientX:120,clientY:140}); f.flush();
  assert.equal(f.taps.length,0,'arrastrar no crea marcas');
});

for (const interruption of ['pointercancel','lostpointercapture','blur','visibilitychange']) {
  test(interruption+': libera gesto y un movimiento tardío no arrastra ni marca', () => {
    const f=fixture();
    f.emit('pointerdown');
    if (interruption==='blur') f.blur();
    else if (interruption==='visibilitychange') f.visibility();
    else f.emit(interruption);
    f.flush();
    const before={...f.state};
    f.emit('pointermove',{clientX:160,clientY:180});
    f.emit('pointerup',{clientX:160,clientY:180}); f.flush();
    assert.equal(f.state.tx,before.tx);
    assert.equal(f.state.ty,before.ty);
    assert.equal(f.taps.length,0);
  });
}

test('botón secundario no inicia arrastre ni coloca marcas', () => {
  const f=fixture(), before={...f.state};
  f.emit('pointerdown',{button:2,buttons:2});
  f.emit('pointermove',{button:2,buttons:2,clientX:150});
  f.emit('pointerup',{button:2,buttons:0,clientX:150}); f.flush();
  assert.equal(f.state.tx,before.tx);
  assert.equal(f.taps.length,0);
});

test('pellizco con dos dedos cambia zoom y no produce un tap al soltarlos', () => {
  const f=fixture();
  f.emit('pointerdown',{pointerType:'touch',pointerId:1,clientX:100,clientY:120});
  f.emit('pointerdown',{pointerType:'touch',pointerId:2,clientX:200,clientY:120});
  f.emit('pointermove',{pointerType:'touch',pointerId:2,clientX:240,clientY:120}); f.flush();
  assert.ok(f.state.z>1);
  f.emit('pointerup',{pointerType:'touch',pointerId:2,clientX:240,clientY:120});
  f.emit('pointerup',{pointerType:'touch',pointerId:1,clientX:100,clientY:120}); f.flush();
  assert.equal(f.taps.length,0);
  finiteState(f);
});

test('visor temporalmente sin dimensiones no genera NaN al ajustar o acercar', () => {
  const f=fixture();
  f.v.clientWidth=0;f.v.clientHeight=0;f.state.z=0;f.state.fit=0;
  f.c.plFit(f.pl,true);
  f.c.plZoomAt(f.pl,1.4,0,0);
  finiteState(f);
});
