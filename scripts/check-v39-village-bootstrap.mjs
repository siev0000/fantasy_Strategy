import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const browser=await chromium.launch();
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
 const result=await page.evaluate(async()=>{
  window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39VillagePlanTest();await window.waitForV39MapRenderSettled();
  const {advanceV39VillagePlans}=await import('/src/lib/v39-village-plans.js');
  const initial=window.getV39GameState(),map=structuredClone(window.__v39FieldRuntime.mapData);
  let village=initial.neutralVillages.find(v=>v.planTestKey==='cemetery');
  for(const row of map.grid)row.fill('平地');
  village={...village,buildings:[],tileFacilityMap:{},constructionQueue:[],planSchedule:{},
    foodStockByType:{穀物:1000,野菜:1000,肉:1000,魚:1000},
    materialStockByType:{...Object.fromEntries(Object.keys(village.materialStockByType).map(k=>[k,0])),木材:50},
    cityLevels:{鍛冶Lv:1,魔法Lv:1,信仰Lv:1,軍事Lv:1,経済Lv:1}};
  let state={...initial,enemies:[],enemyNests:[],facilitiesByTile:{},neutralVillages:[village],settlements:[village]};
  const history=[];
  for(let t=1;t<=8;t++){
    const next=advanceV39VillagePlans(state,village,map,t);village=next.village;
    state={...next.state,neutralVillages:[village],settlements:[village]};
    history.push({turn:t,buildings:village.buildings,queue:village.constructionQueue,goal:village.planSchedule.active,stock:village.materialStockByType});
    if(village.buildings.includes('農場'))break;
  }
  return {history,buildings:village.buildings};
 });
 assert(result.buildings.includes('墓地')&&result.buildings.includes('農場'),JSON.stringify(result,null,2));
 assert.deepEqual(errors,[]);console.log('Village AI builds cemetery then farm starting with wood 50, stone 0, iron 0');
}finally{await browser.close();}
