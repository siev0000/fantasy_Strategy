import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/turn-snapshots';mkdirSync(out,{recursive:true});
const label=process.env.V39_PROFILE_LABEL||'after',fixturePath=`${out}/fixture.json`;
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:475,height:869}}),errors=[];page.on('pageerror',e=>errors.push(String(e.stack)));
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
 await page.evaluate(async input=>{window.closeV39PlayModeSelection();if(input)window.importV39SaveJson(input);else{await window.setV39TestMode(true);window.startV39ExpeditionTest();}},existsSync(fixturePath)?readFileSync(fixturePath,'utf8'):null);
 await page.waitForFunction(()=>!!window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0]?.v39Input&&!window.isV39MapInputLocked());
 if(!existsSync(fixturePath))writeFileSync(fixturePath,await page.evaluate(()=>window.exportV39SaveJson(0)));
 const reports=[];
 for(const surface of [true,false]){
  await page.evaluate(async surface=>{const u=window.getV39ActiveFactionState().units.find(u=>u.worldId?.startsWith('cave:'));if(!u)throw Error('cave fixture missing');window.viewV39OwnedUnitWorld(u.id,{surface});await window.waitForV39MapRenderSettled();},surface);
  await page.waitForTimeout(250);
  const report=await page.evaluate(async()=>{
   const originalGet=window.getV39GameState,originalSet=window.setV39GameState,random=Math.random;
   const stats={fullReads:0,lightReads:0,fullReturns:0,getMs:0,setMs:0,callers:{}};let seed=7182;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
   window.getV39GameState=(options)=>{const begin=performance.now(),result=originalGet(options);stats.getMs+=performance.now()-begin;const full=options?.includeWorlds!==false;stats[full?'fullReads':'lightReads']++;if(full){const caller=new Error().stack.split('\n').slice(2,4).map(s=>s.trim().replace(/\?.*?(?=:\d+:\d+\)?$)/,'')).join(' <- ');stats.callers[caller]=(stats.callers[caller]||0)+1;}return result;};
   window.setV39GameState=(patch,options)=>{const begin=performance.now(),result=originalSet(patch,options);stats.setMs+=performance.now()-begin;if(options?.returnState!==false)stats.fullReturns++;return result;};
   const begin=performance.now();let ok;
   try{ok=await window.advanceV39Turn({skipUnactedFocus:true,presentation:false});}finally{window.getV39GameState=originalGet;window.setV39GameState=originalSet;Math.random=random;}
   if(!ok)throw Error('turn not advanced');
   const state=originalGet(),world=state.activeWorldId;
   const summary={turn:state.timeline.turnNumber,world,players:state.players.map(p=>({id:p.id,units:p.factionState.units.map(u=>({id:u.id,hp:u.hp,ap:u.ap,x:u.x,y:u.y,world:u.worldId})),stocks:p.factionState.settlements?.map(b=>b.materialStockByType)})),enemies:state.enemies.map(u=>({id:u.id,hp:u.hp,x:u.x,y:u.y})),worlds:Object.entries(state.explorationWorlds).map(([id,w])=>({id,w:w.map?.w,h:w.map?.h,grid:w.map?.grid}))};
   return {world,elapsedMs:performance.now()-begin,stats,summary};
  });reports.push(report);
 }
 const summary=reports.map(r=>r.summary);if(label!=='before'&&existsSync(`${out}/before.json`))assert.deepEqual(summary,JSON.parse(readFileSync(`${out}/before.json`,'utf8')).map(r=>r.summary),'same seeded turns preserve units, HP, AP, inventory and maps');
 assert.deepEqual(errors,[]);writeFileSync(`${out}/${label}.json`,JSON.stringify(reports));
 for(const {world,elapsedMs,stats}of reports)console.log(JSON.stringify({world,elapsedMs,fullReads:stats.fullReads,lightReads:stats.lightReads,fullReturns:stats.fullReturns,getMs:stats.getMs,setMs:stats.setMs}));
 await page.screenshot({path:`${out}/${label}.png`});
}finally{await browser.close();}
