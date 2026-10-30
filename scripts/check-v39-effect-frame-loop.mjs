import assert from 'node:assert/strict';
import {PhaserEffectPlayer,resolveEffectSheetLayout,resolveEffectFrameRange} from '../配布用/アニメーション再生機能/phaser-effect-player.mjs';
const intervals=new Map();let serial=0;
const originalSet=globalThis.setInterval,originalClear=globalThis.clearInterval;
globalThis.setInterval=(fn,ms)=>{const id=++serial;intervals.set(id,{fn,ms});return id;};
globalThis.clearInterval=id=>intervals.delete(id);
const scene={textures:{get:()=>({getSourceImage:()=>({width:960,height:120})})},add:{image(){return {scene,frame:{data:{}},setOrigin(){},setScale(){},setDepth(){},setAngle(){},setAlpha(){},setBlendMode(){},setName(){},setCrop(){},setPosition(){},clearTint(){},clearMask(){},destroy(){this.scene=null;}};}}};
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
try{
  const layout=resolveEffectSheetLayout(960,120);assert.equal(layout.frameCount,8);
  assert.deepEqual(resolveEffectFrameRange(8,{frameStart:3,frameEnd:5}),{start:3,end:5,count:3});
  assert.deepEqual(resolveEffectFrameRange(8),{start:0,end:7,count:8});
  assert.deepEqual(resolveEffectFrameRange(8,{frameStart:50,frameEnd:90}),{start:7,end:7,count:1});
  const player=new PhaserEffectPlayer(scene,{textureLoader:async()=> 'shared'}),frames=[];
  const request={x:0,y:0,src:'wind',frameStart:3,frameEnd:5,renderStyle:'none',showPreviousFrameGhost:false,totalDurationMs:360,onFrame:frame=>frames.push(frame.frameIndex)};
  const promise=player.play({...request,loop:true});await flush();assert.equal(intervals.size,1);assert.equal([...intervals.values()][0].ms,120);
  for(let i=0;i<7;i++)[...intervals.values()][0].fn();
  assert.deepEqual(frames,[3,4,5,3,4,5,3,4]);player.stop();await promise;assert.equal(intervals.size,0);
  frames.length=0;const finite=player.play(request);await flush();for(let i=0;i<3;i++)[...intervals.values()][0].fn();await finite;assert.deepEqual(frames,[3,4,5]);assert.equal(intervals.size,0);
  frames.length=0;const normal=player.play({...request,frameStart:0,frameEnd:7});await flush();for(let i=0;i<8;i++)[...intervals.values()][0].fn();await normal;assert.deepEqual(frames,[0,1,2,3,4,5,6,7]);
  const loop=player.play({...request,loop:true});await flush();player.destroy();await loop;assert.equal(intervals.size,0);
  let resolveLoad;const pending=new PhaserEffectPlayer(scene,{textureLoader:()=>new Promise(resolve=>{resolveLoad=resolve;})});const cancelled=pending.play(request);pending.destroy();resolveLoad('shared');assert.equal(await cancelled,false);assert.equal(intervals.size,0);
  console.log('PASS: existing effect player loops frames 4/5/6, finite/default playback unchanged, timer period, stop/destroy and async-load cancellation. No browser.');
}finally{globalThis.setInterval=originalSet;globalThis.clearInterval=originalClear;}
