import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/village-plans',{recursive:true});
const browser=await chromium.launch();
try{
 for(const width of [390,1100]){
  const page=await browser.newPage({viewport:{width,height:850}}),errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.goto('http://127.0.0.1:3000',{waitUntil:'networkidle'});
  const result=await page.evaluate(async()=>{
   if(!window.getGameDataRows?.('村計画').length||!window.getGameDataRows?.('村依頼ひな型').length)
    throw Error('配信用ビルドに村計画/依頼ひな型がありません。最新データを含めて再ビルドしてください。');
   window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest(false,{silentBanner:true});await window.waitForV39MapRenderSettled();
   const state=window.getV39GameState(),source=state.neutralVillages[0];
   const village={...source,incidentTest:false,abandoned:false,population:50,populationByRace:{[source.race]:50},
    defenseUnits:[...source.defenseUnits,{...source.defenseUnits[0],id:'production-plan-corpse',x:source.x,y:source.y,hp:0,currentHp:0,state:'死亡'}],
    foodStockByType:{穀物:100000,野菜:100000,肉:100000,魚:100000},materialStockByType:{木材:1000,石材:1000,鉄:1000,金:100},
    researchLevels:{信仰Lv:1},buildings:[],constructionQueue:[],tileFacilityMap:{},lastProcessedTurn:0};
   window.setV39GameState({...state,neutralVillages:[village],settlements:state.settlements.map(row=>row.id===village.id?village:row),enemies:[]});
   const advance=turn=>{const now=window.getV39GameState();window.setV39GameState({timeline:{...now.timeline,turnNumber:turn}});window.dispatchEvent(new CustomEvent('v39:turn-stage-world',{detail:{turnNumber:turn}}));};
   advance(2);let current=window.getV39GameState(),base=current.neutralVillages[0],queue=base.constructionQueue[0];
   if(!queue)throw Error(JSON.stringify({schedule:base.planSchedule,territory:base.territoryTileKeys,units:base.defenseUnits.map(unit=>({id:unit.id,hp:unit.hp,state:unit.state,x:unit.x,y:unit.y,summon:unit.summon})),x:base.x,y:base.y,buildings:base.buildings}));
   advance(2);const same=window.getV39GameState().neutralVillages[0].constructionQueue[0].remainingTurns===queue.remainingTurns;
   window.importV39SaveJson(window.exportV39SaveJson());await window.waitForV39MapRenderSettled();
   for(let turn=3;turn<=2+queue.remainingTurns;turn++)advance(turn);
   current=window.getV39GameState();base=current.neutralVillages[0];
   window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:base.x,y:base.y}}));window.activateV39FooterTab('interaction');await window.waitForV39MapRenderSettled();
   return {started:queue.facilityName,same,built:base.buildings.includes('墓地'),field:current.facilitiesByTile[queue.tileKey]?.includes('墓地'),owner:current.territoryOwnerByTile[queue.tileKey]===base.id};
  });
  console.log(width,result);assert(result.started==='墓地'&&result.same&&result.built&&result.field&&result.owner);assert.deepEqual(errors,[]);
  await page.screenshot({path:`output/web-game/village-plans/production-${width}.png`});await page.close();
 }
}finally{await browser.close();}
