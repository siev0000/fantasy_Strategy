import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/basic-facility-costs';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e.stack)));
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
 await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39ExpeditionTest();await window.waitForV39MapRenderSettled();});
 for(const [name,terrain,wood,stone] of [
   ['農場','平地',30,0],['伐採場','森',20,0],['採石場','丘陵',30,0],
   ['鉱山','山岳',40,20],['墓地','平地',20,0],['船着き場','平地',40,0]
 ]){
  const result=await page.evaluate(async({name,terrain,wood,stone})=>{
    const s=window.getV39GameState(),p=s.players.find(p=>p.id===s.activePlayerId),first=p.factionState.settlements[0];
    const base={...first,scaleLevel:1,scaleKey:'village',type:'村',buildings:name==='船着き場'?['墓地']:[],constructionQueue:[],tileFacilityMap:{},facilityStateByTile:{},
      territoryTileKeys:['5,5','6,6'],territoryTileModeMap:{'5,5':'settlement','6,6':'resource'},
      materialStockByType:{...Object.fromEntries(Object.keys(first.materialStockByType).map(k=>[k,0])),木材:wood,石材:stone},
      cityLevels:{鍛冶Lv:1,魔法Lv:1,信仰Lv:1,軍事Lv:1,経済Lv:1}};
    const map=window.__v39FieldRuntime.mapData;map.grid[6][6]=terrain;map.grid[6][7]='海';map.specialMap[6][6]='';window.updateV39FieldData(map);
    window.setV39GameState({players:s.players.map(row=>row.id!==p.id?row:{...p,factionState:{...p.factionState,settlements:[base],selectedSettlementId:base.settlementId}}),
      territoryOwnerByTile:{...s.territoryOwnerByTile,'6,6':p.id},territoryStateByTile:{...s.territoryStateByTile,'6,6':{settlementId:base.settlementId,hp:100,maxHp:100}},facilitiesByTile:{}});
    window.activateV39FooterTab('tile');window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:6,y:6}}));
    await window.waitForV39MapRenderSettled();window.openV39LandConstruction({x:6,y:6});
    return {name};
  },{name,terrain,wood,stone});
  await page.locator('[data-land-build-category]').selectOption('すべて');
  await page.locator(`[data-land-build-facility="${name}"]`).click();
  assert(await page.locator('[data-land-construction-start]').isEnabled(),`${name}: cannot bootstrap with exact materials and zero iron`);
  if(name==='農場')await page.screenshot({path:`${out}/farm-no-stone-iron.png`});
  await page.locator('[data-land-construction-start]').click();
  const stock=await page.evaluate(()=>window.getV39ActiveFactionState().settlements[0].materialStockByType);
  assert.equal(stock.木材,0);assert.equal(stock.石材,0);assert.equal(stock.鉄,0);
  assert(await page.evaluate(name=>window.getV39ActiveFactionState().settlements[0].constructionQueue.some(q=>q.facilityName===name),name));
  console.log(`${result.name}: exact wood ${wood}, stone ${stone}, iron 0 starts construction and deducts costs`);
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
