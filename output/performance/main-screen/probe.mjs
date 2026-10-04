import { chromium } from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];
page.on('pageerror',e=>errors.push(String(e)));
await page.addInitScript(()=>{
 window.__perfRows=new Map();window.__perfEvents=[];
 const add=window.addEventListener.bind(window);
 window.addEventListener=function(type,listener,options){
  if(type==='v39:game-state-changed'||type==='v39:visibility-rendered'||type==='v39:squad-detail-rendered'){
   const stack=new Error().stack,source=stack.split('\n').find(line=>line.includes('/src/'))||stack;
   const key=type+' '+source;const row={type,source,count:0,total:0,max:0};window.__perfRows.set(key,row);
   const original=listener;
   listener=function(event){const t=performance.now();try{return typeof original==='function'?original.call(this,event):original.handleEvent(event);}finally{const ms=performance.now()-t;row.count++;row.total+=ms;row.max=Math.max(row.max,ms);}};
  }
  return add(type,listener,options);
 };
 add('v39:game-state-changed',e=>window.__perfEvents.push(e.detail.reason));
 window.__longtasks=[];new PerformanceObserver(list=>window.__longtasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
});
try{
 await page.goto('http://127.0.0.1:3022',{waitUntil:'networkidle'});
 const results=[];
 for(const size of [60,100]){
  const setup=await page.evaluate(async size=>{
   window.startV39LocalSession(1,{playMode:'single-test'});
   const t=performance.now();window.generateV39TestFieldWithSeed({w:size,h:size,patternId:'realistic'},'perf-main-'+size);
   await window.waitForV39MapRenderSettled();await new Promise(r=>setTimeout(r,200));
   const prepared=window.getV39ActiveFactionState(); window.updateV39ActiveFactionState({units:prepared.units.map((unit,index)=>index===0?{...unit,isSovereign:true,unitType:"統治者"}:unit),initialSettlementCount:1,initialSettlementPlans:[{name:"計測村"}]}); window.beginV39InitialPlacement({force:true}); await new Promise(r=>setTimeout(r,200)); const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];const candidate=scene.v39PlacementContext?.candidates?.[0];
   if(candidate)window.placeV39InitialBase(candidate); window.spawnV39Enemies();
   await new Promise(r=>setTimeout(r,500));
   document.querySelectorAll('#v39-play-mode-select,.vue-modal-backdrop').forEach(el=>el.style.display='none');
   const state=window.getV39GameState();return {ms:performance.now()-t,enemies:state.enemies.length,units:state.players.flatMap(p=>p.factionState.units).length,worlds:Object.keys(state.explorationWorlds).length,objects:scene.children.list.length,placed:state.players[0].factionState.villagePlacementMode===false};
  },size);
  const result=await page.evaluate(async()=>{
   const reset=()=>{for(const row of window.__perfRows.values()){row.count=0;row.total=0;row.max=0;}window.__perfEvents=[];window.__longtasks=[];};
   const snapshot=()=>({listeners:structuredClone([...window.__perfRows.values()].filter(r=>r.count).sort((a,b)=>b.total-a.total).slice(0,12)),events:window.__perfEvents,longTasks:window.__longtasks});
   const bench=(fn,n)=>{const times=[];for(let i=0;i<n;i++){const t=performance.now();fn();times.push(performance.now()-t);}return {average:times.reduce((a,b)=>a+b,0)/n,max:Math.max(...times)};};
   const reads=bench(()=>window.getV39GameState(),10);const state=window.getV39GameState();
   reset();const updates=bench(()=>window.setV39GameState({timeline:{paused:true}},{reason:'perf-noop'}),3);await new Promise(r=>setTimeout(r,150));const updateDetail=snapshot();
   reset();const t=performance.now();window.appendV39ActivityLog(state.activePlayerId,'システム','計測');const logMs=performance.now()-t;await new Promise(r=>setTimeout(r,150));const logDetail=snapshot();
   reset();const frame=[];await new Promise(r=>{let last=performance.now();function tick(now){frame.push(now-last);last=now;if(frame.length<90)requestAnimationFrame(tick);else r();}requestAnimationFrame(tick);});
   const idle={average:frame.reduce((a,b)=>a+b,0)/frame.length,max:Math.max(...frame),...snapshot()};
   reset();const start=performance.now();await window.advanceV39Turn({skipUnactedFocus:true});const turnMs=performance.now()-start;await new Promise(r=>setTimeout(r,300));const turn={...snapshot(),stages:window.getV39LatestTurnPerformance()}; const readsAfterTurn=bench(()=>window.getV39GameState(),10);
   return {reads,readsAfterTurn,updates,updateDetail,logMs,logDetail,idle,turnMs,turn,memory:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null};
  });results.push({size,setup,...result});await page.screenshot({path:`output/performance/main-screen/${size}.png`});
 }
 writeFileSync('output/performance/main-screen/report.json',JSON.stringify({results,errors},null,2));
 console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();}