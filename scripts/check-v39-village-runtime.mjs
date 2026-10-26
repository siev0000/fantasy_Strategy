import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {openV39TestSuite} from './lib/v39-test-suite.mjs';

// Run against the built server: dev modules do not reproduce parameter-default lowering errors.
const browser=await chromium.launch();
try{
 await mkdir('output/web-game/village-runtime',{recursive:true});
 for(const width of [390,1100]){
  const page=await browser.newPage({viewport:{width,height:850}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack)));
  page.on('dialog',dialog=>dialog.accept());
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.openV39TestTools();});
  await page.locator('[data-test-tab=scenarios]').click();
  await openV39TestSuite(page,'village');
  await page.locator('[data-test-action=village-plan-start]').click();
  await page.waitForFunction(()=>window.__v39FieldRuntime?.mapData?.villagePlanTest&&!!window.getV39MapEntityMarker?.('plan-visitor-cemetery'));
  assert.deepEqual(errors,[],'built test startup must not throw');
  await page.evaluate(()=>{
   const s=window.getV39GameState(),map=window.__v39FieldRuntime.mapData,source=s.neutralVillages.find(v=>v.planTestKey==='cemetery');
   const template=source.defenseUnits.find(u=>u.hp>0);
   const units=Array.from({length:6},(_,i)=>({...template,id:`runtime-worker-${i}`,name:`採取軍${i+1}`,isNamed:false,isSovereign:false,
    x:source.x+i%3,y:source.y+Math.floor(i/3),ap:100,currentAp:100,maxAp:100,lastDefenseTurn:0,lastResourceTurn:0,
    squadId:'solo',squadMoveMode:'follow',status:{...template.status,SIZ:170,移動:100},combatProfile:{...template.combatProfile,mode:'army',memberCount:3}}));
   map.grid[source.y][source.x+3]='森';
   const village={...source,population:100,populationByRace:{只人:100},defenseUnits:units,buildings:['墓地'],tileFacilityMap:{},
    constructionQueue:[],planSchedule:{},resourceOperations:undefined,researchLevels:{軍事Lv:3,信仰Lv:3,経済Lv:3},
    materialStockByType:{...source.materialStockByType,木材:0}};
   window.setV39GameState({neutralVillages:[village],settlements:[village],enemies:[],enemyNests:[],
    players:s.players.map(p=>({...p,factionState:{...p.factionState,units:p.factionState.units.map((u,i)=>({...u,x:9,y:6+i}))}}))});
   window.__villageRuntimeStart=Object.fromEntries(units.map(u=>[u.id,`${u.x},${u.y}`]));
  });
  const result=await page.evaluate(async()=>{
   const rows=[];let moved=false,gathered=false,delivered=false,previousCargo=0;
   for(let i=0;i<7;i++){
    await window.advanceV39Turn({skipUnactedFocus:true});
    const s=window.getV39GameState(),v=s.neutralVillages[0],commands=v.resourceOperations?.lastCommands||[];
    moved ||= v.defenseUnits.some(u=>window.__villageRuntimeStart[u.id]&&window.__villageRuntimeStart[u.id]!==`${u.x},${u.y}`);
    gathered ||= commands.some(c=>c.startsWith('資源取得:'));
    const cargo=(v.resourceOperations?.squads||[]).reduce((sum,squad)=>sum+Number(squad.cargo?.resourcesByType?.木材||0)
     +Object.values(squad.cargoByUnitId||{}).reduce((n,load)=>n+Number(load.resourcesByType?.木材||0),0),0);
    delivered ||= previousCargo>0&&cargo<previousCargo;
    previousCargo=cargo;
    rows.push({turn:s.timeline.turnNumber,processed:v.lastProcessedTurn,resourceTurn:v.resourceOperations?.lastProcessedTurn,
     wood:v.materialStockByType.木材,cargo,commands,teams:v.resourceOperations?.aiState?.resourceTeams});
    if(moved&&gathered&&delivered)break;
   }
   window.importV39SaveJson(window.exportV39SaveJson(0));
   return {moved,gathered,delivered,rows,saved:window.getV39GameState().neutralVillages[0].resourceOperations?.lastProcessedTurn};
  });
  assert(result.moved,'surplus village army never moved');
  assert(result.gathered,'village army never gathered');
  assert(result.delivered,'real cargo never reached village');
  assert(result.rows.every(r=>r.turn===r.processed&&r.turn===r.resourceTurn),'village task did not advance with the actual turn');
  assert.equal(result.saved,result.rows.at(-1).resourceTurn);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:`output/web-game/village-runtime/turn-${width}.png`});
  console.log(width,JSON.stringify(result));await page.close();
 }
}finally{await browser.close();}
