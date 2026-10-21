import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/hegemony-production',{recursive:true});
const browser=await chromium.launch();
try{
 for(const width of [390,1100]){
  const page=await browser.newPage({viewport:{width,height:850}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:3000',{waitUntil:'networkidle'});
  const result=await page.evaluate(async()=>{
   window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();await window.waitForV39MapRenderSettled();
   let state=window.getV39GameState(),player=state.players[0];
   const site={id:'production-sun',landmarkId:'勝利対象:太陽の山',kind:'victory-landmark',name:'太陽の山',terrain:'山岳',key:'12,8',x:12,y:8,
     occupiedTileKeys:['12,8','11,8','13,8','11,7','12,7','11,9','12,9']};
   window.setV39GameState({enemies:[],enemyNests:[],enemySquads:[],victoryLandmarksByTile:{[site.key]:site},players:[{...player,factionState:{...player.factionState,
     exploration:{...player.factionState.exploration,discoveredFeaturesByTile:{[site.key]:site}},units:player.factionState.units.map((u,i)=>i===0?{...u,x:11,y:8}:u)}}]});
   window.spawnV39VictoryLandmarkGuards();state=window.getV39GameState();const world=state.victoryLandmarksByTile[site.key].hegemonyWorldId;
   window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:12,y:8}}));window.activateV39FooterTab('interaction');
   const blocked=document.querySelector('[data-world-action="guardian-claim"]')?.disabled;
   window.activateV39FooterTab('squad');window.enterV39Cave();await window.waitForV39MapRenderSettled();
   state=window.getV39GameState();const guards=state.enemies.length,exit=window.__v39FieldRuntime.mapData.entrances[0];
   window.setV39GameState({enemies:state.enemies.map(u=>({...u,hp:0,currentHp:0,state:'死亡'})),players:state.players.map(p=>({...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>u.id===p.factionState.selectedUnitId?{...u,x:exit.x,y:exit.y}:u)}}))});
   window.leaveV39Cave();await window.advanceV39Turn({skipUnactedFocus:true});
   window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:12,y:8}}));window.activateV39FooterTab('interaction');
   const button=document.querySelector('[data-world-action="guardian-claim"]');if(!button||button.disabled)throw Error('Claim UI not enabled');button.click();
   state=window.getV39GameState();const owned=site.occupiedTileKeys.every(key=>state.territoryOwnerByTile[key]===player.id);
   window.importV39SaveJson(window.exportV39SaveJson());await window.waitForV39MapRenderSettled();
   return {blocked,guards,owned,world,saved:!!window.getV39GameState().explorationWorlds[world],wonImmediately:state.victory.completed};
  });
  console.log(width,result);assert(result.blocked&&result.owned&&result.saved&&!result.wonImmediately);assert.equal(result.guards,3);
  await page.screenshot({path:`output/web-game/hegemony-production/claim-${width}.png`});assert.deepEqual(errors,[]);await page.close();
 }
}finally{await browser.close();}
