import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/hegemony-campaign',{recursive:true});
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:390,height:850}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
 const result=await page.evaluate(async()=>{
  const {transferV39GuardianLand,getV39GuardianQuestDefinitions}=await import('/src/lib/v39-guardian-quests.js');
  const {evaluateV39Victory}=await import('/src/lib/v39-victory-rules.js');
  window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest(false,{silentBanner:true});await window.waitForV39MapRenderSettled();
  const current=window.getV39GameState(),player=current.players[0],site={id:'campaign-sun',landmarkId:'勝利対象:太陽の山',kind:'victory-landmark',name:'太陽の山',terrain:'山岳',key:'12,8',x:12,y:8,
    occupiedTileKeys:['12,8','11,8','13,8','11,7','12,7','11,9','12,9']};
  window.setV39GameState({enemies:[],enemyNests:[],enemySquads:[],victoryLandmarksByTile:{[site.key]:site},players:[{...player,factionState:{...player.factionState,
    exploration:{...player.factionState.exploration,discoveredFeaturesByTile:{[site.key]:true}},units:player.factionState.units.map((u,i)=>i===0?{...u,x:11,y:8}:u)}}]});
  const spawned=window.spawnV39VictoryLandmarkGuards();let state=window.getV39GameState(),landmark=state.victoryLandmarksByTile[site.key],world=state.explorationWorlds[landmark.hegemonyWorldId];
  if(!world)throw Error(JSON.stringify({reports:spawned.reports,site:landmark,enemyCount:state.enemies.length,worlds:Object.keys(state.explorationWorlds)}));
  const blocked=transferV39GuardianLand(state,player.id,site.key,{conquest:true});
  const initial={surfaceGuards:state.enemies.filter(u=>u.victoryGuard).length,insideGuards:world.spatial.enemies.length,boss:world.spatial.enemies.find(u=>u.guardianSpeciesName)?.guardianSpeciesName,blocked:!blocked.ok};
  // Full trial execution is covered by check-v39-guardian-trials; this fixture tests interior cleanup.
  const completed={...landmark,guardianByPlayerId:{[player.id]:{relation:100,completedEventIds:getV39GuardianQuestDefinitions().map(row=>row.ID)}}};
  const peaceful=transferV39GuardianLand({...state,victoryLandmarksByTile:{...state.victoryLandmarksByTile,[site.key]:completed}},player.id,site.key);
  initial.peaceful=peaceful.ok&&peaceful.state.explorationWorlds[landmark.hegemonyWorldId].spatial.enemies.length===0;
  window.enterV39Cave();await window.waitForV39MapRenderSettled();
  const entered=window.getV39GameState().activeWorldId;
  state=window.getV39GameState();window.setV39GameState({enemies:state.enemies.map(u=>({...u,hp:0,currentHp:0,state:'死亡'}))});
  const exit=window.__v39FieldRuntime.mapData.entrances[0];state=window.getV39GameState();
  window.setV39GameState({players:state.players.map(p=>({...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>u.id===p.factionState.selectedUnitId?{...u,x:exit.x,y:exit.y}:u)}}))});
  window.leaveV39Cave();await window.advanceV39Turn({skipUnactedFocus:true});
  state=window.getV39GameState();const claim=transferV39GuardianLand(state,player.id,site.key,{conquest:true});
  if(!claim.ok)throw Error(claim.reason);
  window.setV39GameState(claim.state,{reason:'campaign-claim'});state=window.getV39GameState();
  let progress=evaluateV39Victory(state,2).state;const immediate=progress.victory.completed;
  for(let turn=3;turn<=7;turn++)progress=evaluateV39Victory(progress,turn).state;
  window.importV39SaveJson(window.exportV39SaveJson());await window.waitForV39MapRenderSettled();
  return {...initial,entered,returned:state.activeWorldId,owned:site.occupiedTileKeys.every(key=>state.territoryOwnerByTile[key]===player.id),immediate,won:progress.victory.completed,
    saved:!!window.getV39GameState().explorationWorlds[landmark.hegemonyWorldId]};
 });
 assert.equal(result.surfaceGuards,0);assert.equal(result.insideGuards,3);assert(result.boss&&result.blocked&&result.peaceful);assert(result.entered.startsWith('hegemony:'));
 assert.equal(result.returned,'surface');assert(result.owned&&!result.immediate&&result.won&&result.saved);
 await page.screenshot({path:'output/web-game/hegemony-campaign/claimed.png'});assert.deepEqual(errors,[]);console.log(result);
}finally{await browser.close();}

