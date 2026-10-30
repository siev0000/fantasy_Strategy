import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/production-facility-candidates';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
 for(const width of [390,1100]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],results=[];
  page.on('pageerror',error=>errors.push(String(error.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39ExpeditionTest();
    await window.waitForV39MapRenderSettled();
  });
  for(const [name,terrain,scale,dock] of [
    ['農場','平地',1,false],['伐採場','森',1,false],['採石場','丘陵',1,false],['鉱山','山岳',1,false],['港','平地',2,true]
  ]){
    await page.evaluate(async({name,terrain,scale,dock})=>{
      const s=window.getV39GameState(),p=s.players.find(row=>row.id===s.activePlayerId),first=p.factionState.settlements[0];
      const base={...first,scaleLevel:scale,scaleKey:scale===2?'town':'village',type:scale===2?'町':'村',
        buildings:dock?['船着き場']:[],constructionQueue:[],tileFacilityMap:dock?{'6,6':['船着き場']}:{},facilityStateByTile:{},
        territoryTileKeys:['5,5','6,6'],territoryTileModeMap:{'5,5':'settlement','6,6':'resource'},
        materialStockByType:Object.fromEntries(Object.keys(first.materialStockByType).map(key=>[key,10000])),
        cityLevels:{鍛冶Lv:10,魔法Lv:10,信仰Lv:10,軍事Lv:10,経済Lv:10}};
      const map=window.__v39FieldRuntime.mapData;map.grid[6][6]=terrain;map.grid[6][7]='海';map.specialMap[6][6]='';
      window.updateV39FieldData(map);
      window.setV39GameState({players:s.players.map(row=>row.id!==p.id?row:{...p,factionState:{...p.factionState,settlements:[base],selectedSettlementId:base.settlementId}}),
        territoryOwnerByTile:{...s.territoryOwnerByTile,'6,6':p.id},territoryStateByTile:{...s.territoryStateByTile,'6,6':{settlementId:base.settlementId,hp:100,maxHp:100}},
        facilitiesByTile:{'6,6':dock?['船着き場']:[]}});
      window.activateV39FooterTab('tile');window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:6,y:6}}));
      await window.waitForV39MapRenderSettled();window.openV39LandConstruction({x:6,y:6});
    },{name,terrain,scale,dock});
    await page.locator('[data-land-build-category]').selectOption('すべて');
    const candidate=page.locator(`[data-land-build-facility="${name}"]`);
    assert(await candidate.isVisible(),`${name} must appear for ${terrain}`);await candidate.click();
    const start=page.locator('[data-land-construction-start]');
    assert(await start.isEnabled(),`${name}: ${await page.locator('.v39-land-build-detail').innerText()}`);
    await page.screenshot({path:`${out}/${name}-${width}.png`});
    await start.click();
    const queue=await page.evaluate(()=>window.getV39ActiveFactionState().settlements[0].constructionQueue);
    assert(queue.some(row=>row.facilityName===name),'real construction did not start');
    if(name==='港'){
      assert.equal(queue[0].replacesFacilityName,'船着き場');
      assert.equal(queue[0].remainingTurns,1,'dock upgrade must apply the sheet-defined build-time reduction');
      const completed=await page.evaluate(async()=>{
        await window.advanceV39Turn({skipUnactedFocus:true,presentation:false});
        return window.getV39ActiveFactionState().settlements[0].tileFacilityMap['6,6'];
      });
      assert(completed.includes('港')&&!completed.includes('船着き場'),'port must replace the dock, not stack on it');
    }
    results.push({name,terrain,scale,dock,queue});
  }
  // The source sheet still requires a town and dock; do not silently remove those rules.
  await page.evaluate(()=>{
    const s=window.getV39GameState();window.setV39GameState({players:s.players.map(p=>({...p,factionState:{...p.factionState,
      settlements:p.factionState.settlements.map(base=>({...base,scaleLevel:1,scaleKey:'village',type:'村',buildings:[],constructionQueue:[],tileFacilityMap:{}}))}})),facilitiesByTile:{'6,6':[]}});
    window.openV39LandConstruction({x:6,y:6});
  });
  assert.equal(await page.locator('[data-land-build-facility="港"]').count(),0,'port must remain hidden without town/dock');
  assert.equal(await page.evaluate(()=>window.startV39Construction('港',{x:6,y:6}).ok),false,'the construction API must also reject a missing port prerequisite');
  assert.deepEqual(errors,[]);writeFileSync(`${out}/report-${width}.json`,JSON.stringify(results,null,2));
  console.log(`${width}: 5 production facilities appear on matching terrain and start construction; port prerequisites preserved`);
  await page.close();
 }
}finally{await browser.close();}
