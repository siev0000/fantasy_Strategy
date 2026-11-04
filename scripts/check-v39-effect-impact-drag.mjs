import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({ entryPoints:['frontend/src/v39/ui/v39-effect-impact-drag.js'], bundle:true, write:false, format:'esm', platform:'node' });
const { installV39EffectImpactDrag, resolveV39EffectImpactGuide } = await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

const inverseBundle=await build({entryPoints:['配布用/アニメーション再生機能/phaser-effect-player.mjs'],bundle:true,write:false,format:'esm',platform:'node'});
const {resolveEffectImpactPercent}=await import('data:text/javascript;base64,'+Buffer.from(inverseBundle.outputFiles[0].text).toString('base64'));
for(const flipX of [false,true])for(const flipY of [false,true])for(const angleDeg of [0,30,90]){
 const bounds={flipX,flipY,x:100,y:80,width:120,height:90,angleDeg,screenScaleX:2.5,screenScaleY:.7};
 for(const point of resolveV39EffectImpactGuide(bounds)){
  const inverse=resolveEffectImpactPercent(bounds,point);
  assert.ok(Math.abs(inverse.impactXPercent-point.percentX)<1e-8);
  assert.ok(Math.abs(inverse.impactYPercent-point.percentY)<1e-8);
 }
}
const handlers = {}, captured = new Set();
const stage = {
  addEventListener(name, fn) { handlers[name] = fn; },
  getBoundingClientRect() { return { left:10, top:20, width:240, height:140 }; },
  setPointerCapture(id) { captured.add(id); },
  hasPointerCapture(id) { return captured.has(id); },
  releasePointerCapture(id) { captured.delete(id); }
};
let committed, preview, cancelled = 0;
const bounds = { x:100, y:100, width:120, height:120, angleDeg:90, screenScaleX:2, screenScaleY:.5 };
installV39EffectImpactDrag(stage, {
  getContext:() => ({ bounds, width:480, height:280, index:1 }),
  onPreview:(point, value) => { preview = value; },
  onCommit:(value, context) => { committed = { value, context }; },
  onCancel:() => { cancelled++; }
});
const event = (x, y, pointerId = 1) => ({ clientX:x, clientY:y, pointerId, button:0,
  target:{ closest:() => true }, preventDefault() {}, stopImmediatePropagation() {} });
handlers.pointerdown(event(60, 70));
assert.ok(captured.has(1));
handlers.pointermove(event(60, 85, 2));
assert.equal(preview, undefined, 'other pointer ignored');
handlers.pointermove(event(60, 85));
assert.ok(Math.abs(preview.impactXPercent-100)<1e-9);
assert.ok(Math.abs(preview.impactYPercent-50)<1e-9);
assert.equal(committed, undefined, 'save only on release, not on every move');
handlers.pointerup(event(60, 85));
assert.ok(Math.abs(committed.value.impactXPercent-100)<1e-9);
assert.equal(committed.context.index, 1);
assert.equal(captured.size, 0);
committed = undefined;
handlers.pointerdown(event(60, 70));
handlers.pointercancel(event(60, 85));
assert.equal(cancelled, 1);
assert.equal(committed, undefined, 'cancel does not save');
handlers.pointerdown(event(60, 70));
handlers.lostpointercapture();
assert.equal(cancelled, 2);
console.log('PASS: impact drag, rotated/per-axis inverse, CSS scaling, pointer capture, release save and cancellation. No browser.');
