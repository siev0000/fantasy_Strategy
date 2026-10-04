import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {writeFileSync} from 'node:fs';
const label=process.argv[2]||'before';
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
await page.addInitScript(()=>{
 window.__uiRows=[];window.__uiFrames=[];
 const original=EventTarget.prototype.addEventListener;
 EventTarget.prototype.addEventListener=function(type,handler,options){
  if(['click','v39:footer-tab-changed','v39:squad-detail-rendered'].includes(type)&&typeof handler==='function'){
   const source=new Error().stack.split('\n').find(row=>row.includes('/src/'));
   const fn=handler;handler=function(...args){const t=performance.now();try{return fn.apply(this,args);}finally{window.__uiRows.push({type,source,ms:performance.now()-t});}};
  }
  return original.call(this,type,handler,options);
 };
});
try{
 await page.goto('http://127.0.0.1:3022',{waitUntil:'networkidle'});
 await page.evaluate(async()=>{
  window.startV39LocalSession(1,{playMode:'single-test'});
  window.generateV39TestFieldWithSeed({w:100,h:100,patternId:'realistic'},'perf-main-100');
  await window.waitForV39MapRenderSettled();
  const faction=window.getV39ActiveFactionState();window.updateV39ActiveFactionState({units:faction.units.map((u,i)=>i===0?{...u,isSovereign:true,unitType:'統治者'}:u),initialSettlementCount:1,initialSettlementPlans:[{name:'計測村'}]});
  window.beginV39InitialPlacement({force:true});await new Promise(r=>setTimeout(r,200));
  const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];window.placeV39InitialBase(scene.v39PlacementContext.candidates[0]);window.spawnV39Enemies();
  document.querySelectorAll('#v39-play-mode-select,.vue-modal-backdrop').forEach(el=>el.style.display='none');
 });
 await page.waitForTimeout(700);
 const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
 await page.evaluate(()=>{window.__uiRows=[];let last=performance.now();window.__uiRun=true;function frame(t){if(!window.__uiRun)return;window.__uiFrames.push(t-last);last=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);});
 await page.waitForTimeout(1500);
 const clicks=[];
 for(const key of ['tile','settlement','test','manage','squad','tile','squad']){
  clicks.push(await page.evaluate(key=>{const button=document.querySelector(`[data-foot="${key}"]`);const t=performance.now();button?.click();return {key,ms:performance.now()-t,exists:!!button};},key));
  await page.waitForTimeout(300);
 }
 await page.locator('[data-squad-detail-tab="action"]').click();await page.waitForTimeout(300);
 const bounds=await page.locator('[data-squad-detail-panel="action"]').boundingBox();if(bounds){await page.mouse.move(bounds.x+40,bounds.y+30);for(let i=0;i<8;i++){await page.mouse.wheel(0,120);await page.waitForTimeout(100);}}
 const {profile}=await cdp.send('Profiler.stop');
 const metrics=await page.evaluate(()=>{window.__uiRun=false;const frames=window.__uiFrames;return {listeners:window.__uiRows.sort((a,b)=>b.ms-a.ms).slice(0,25),frames:{count:frames.length,average:frames.reduce((a,b)=>a+b,0)/frames.length,max:Math.max(...frames),over50:frames.filter(n=>n>50).length},scrollTop:document.querySelector('[data-squad-detail-panel="action"]')?.scrollTop};});
 const nodes=new Map(profile.nodes.map(n=>[n.id,n])),self=new Map();profile.samples?.forEach((id,i)=>self.set(id,(self.get(id)||0)+profile.timeDeltas[i]/1000));
 const top=[...self].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([id,ms])=>({ms,...nodes.get(id).callFrame}));
 writeFileSync(`output/performance/ui-input/${label}.json`,JSON.stringify({clicks,metrics,top,errors},null,2));writeFileSync(`output/performance/ui-input/${label}.cpuprofile`,JSON.stringify(profile));await page.screenshot({path:`output/performance/ui-input/${label}.png`});console.log(JSON.stringify({clicks,metrics,top:top.slice(0,12),errors},null,2));
}finally{await browser.close();}