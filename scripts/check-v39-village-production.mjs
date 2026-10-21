import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {openV39TestSuite} from './lib/v39-test-suite.mjs';
const browser=await chromium.launch();
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e.stack)));page.on('dialog',d=>d.accept());
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
 await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.openV39TestTools();});
 await openV39TestSuite(page,'village');await page.locator('[data-test-action=village-plan-start]').click();
 await page.waitForFunction(()=>window.__v39FieldRuntime?.mapData?.villagePlanTest&&!window.isV39MapInputLocked?.());
 await page.evaluate(()=>{const s=window.getV39GameState();window.closeV39VillageMenu();window.setV39GameState({neutralVillages:s.neutralVillages.map(v=>v.planTestKey!=='cemetery'?v:{...v,materialStockByType:Object.fromEntries(Object.keys(v.materialStockByType).map(k=>[k,10000]))})});});
 const snapshot=()=>page.evaluate(()=>{const s=window.getV39GameState(),v=s.neutralVillages.find(v=>v.planTestKey==='cemetery');return {v,turn:s.timeline.turnNumber};});
 const step=async()=>{await page.evaluate(()=>window.advanceV39Turn({skipUnactedFocus:true}));await page.waitForFunction(()=>!window.isV39MapInputLocked?.());};
 for(let i=0;i<8;i++){if((await snapshot()).v.buildings.includes('農場'))break;await step();}
 let {v}=await snapshot();assert(v.buildings.includes('墓地'),'cemetery completed first');assert(v.buildings.includes('農場'),'productive farm built by actual turns');
 const cemetery=v.planSchedule.lastCompleted;assert(cemetery);
 await page.evaluate(()=>window.importV39SaveJson(window.exportV39SaveJson(0)));
 v=(await snapshot()).v;assert(v.buildings.includes('農場'),'farm survives save');
 // Removing the completed farm alone must reduce real per-turn production.
 const baseline=await snapshot();await step();const withFarm=await snapshot();
 const gain=withFarm.v.foodStockByType.穀物-baseline.v.foodStockByType.穀物;
 await page.evaluate(()=>{const s=window.getV39GameState();window.setV39GameState({neutralVillages:s.neutralVillages.map(v=>v.planTestKey!=='cemetery'?v:{...v,buildings:v.buildings.filter(n=>n!=='農場'),tileFacilityMap:Object.fromEntries(Object.entries(v.tileFacilityMap).map(([k,names])=>[k,names.filter(n=>n!=='農場')]))})});});
 const withoutStart=await snapshot();await step();const withoutEnd=await snapshot();
 const plainGain=withoutEnd.v.foodStockByType.穀物-withoutStart.v.foodStockByType.穀物;
 assert(gain>plainGain,`farm must raise actual income: ${gain} > ${plainGain}`);
 const wood=await page.evaluate(()=>{
   const s=window.getV39GameState(),v=s.neutralVillages.find(v=>v.planTestKey==='cemetery'),map=window.__v39FieldRuntime.mapData;
   const home=`${v.x},${v.y}`,free=v.territoryTileKeys.find(k=>k!==home&&!v.tileFacilityMap[k]?.includes('墓地'));
   const grid=map.grid.map(row=>[...row]),[x,y]=free.split(',').map(Number);grid[y][x]='森';window.updateV39FieldData({...map,grid});
   const keep=Object.fromEntries(Object.entries(v.tileFacilityMap).map(([k,names])=>[k,names.filter(n=>n==='墓地')]));
   const farmKey=v.territoryTileKeys.find(k=>k!==home&&k!==free&&!keep[k]?.length);keep[farmKey]=['農場'];
   const next={...v,buildings:['墓地','農場'],tileFacilityMap:keep,constructionQueue:[],researchLevels:{信仰Lv:1,経済Lv:1,軍事Lv:1},
     materialStockByType:{...v.materialStockByType,木材:0},lastProcessedTurn:0,planSchedule:{...v.planSchedule,active:{facilityName:'兵舎'}}};
   window.setV39GameState({neutralVillages:s.neutralVillages.map(r=>r.id===v.id?next:r)});
   window.dispatchEvent(new CustomEvent('v39:turn-stage-world',{detail:{turnNumber:s.timeline.turnNumber}}));
   const after=window.getV39GameState(),village=after.neutralVillages.find(r=>r.id===v.id);
   return {plan:village.planSchedule.active,offers:window.getV39WorldPopulationRules().listV39NeutralVillageQuests(after,after.activePlayerId,v.id,window.__v39FieldRuntime.mapData)};
 });
 assert.equal(wood.plan?.facilityName,'伐採場','wood shortage prioritizes productive forest');
 assert(wood.offers.some(q=>q.resourceKey==='木材'),'producer construction shortage becomes supply quest');
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>window.focusV39VillagePlanTest('cemetery'));
 await page.locator('[data-world-action=village-menu]').click();await page.locator('#v39-hub-tab-info').click();
 mkdirSync('output/web-game/village-production',{recursive:true});
 await page.screenshot({path:'output/web-game/village-production/wood-plan-390.png'});
 assert.deepEqual(errors,[]);console.log('Cemetery → farm, normal construction/payment, save and real income gain passed', {gain,plainGain});
}finally{await browser.close();}
