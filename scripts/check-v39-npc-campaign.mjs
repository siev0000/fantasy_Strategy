import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const browser=await chromium.launch();
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.goto('http://127.0.0.1:3024',{waitUntil:'networkidle'});
 const report=await page.evaluate(async()=>{
  const {withV39WorldContext}=await import('/src/v39/core/v39-world-context.js');
  const {normalizeV39NeutralVillage}=await import('/src/lib/v39-neutral-village-rules.js');
  const {createV39EventEnemy}=await import('/src/v39/ai/v39-enemy-spawn.js');
  window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();await window.waitForV39MapRenderSettled();
  const added=window.addV39TestFaction('npc');if(!added?.player)throw Error('NPC fixture missing');
  let state=window.getV39GameState();const player=state.players.find(p=>p.id===added.player.id),unit=player.factionState.units[0];
  const donor=state.players.find(p=>p.isPlayer!==false).factionState.settlements[0],base={...donor,id:'npc-base',settlementId:'npc-base',x:20,y:20,territoryTileKeys:['20,20'],ownerPlayerId:player.id};
  const site={id:'npc-campaign',kind:'victory-landmark',landmarkId:'勝利対象:太陽の山',name:'太陽の山',terrain:'山岳',key:'12,8',x:12,y:8,occupiedTileKeys:['12,8','11,8']};
  window.setV39GameState({enemies:[],enemyNests:[],enemySquads:[],victoryLandmarksByTile:{[site.key]:site},players:state.players.map(p=>p.id!==player.id?p:{...p,factionState:{...p.factionState,
    units:[{...unit,x:11,y:8,worldId:'surface',squadId:'npc-party'}],settlements:[base],village:base,selectedSettlementId:base.id,squads:[{id:'npc-party',unitIds:[unit.id],label:'NPC攻略部隊'}],
    exploration:{discoveredFeaturesByTile:{[site.key]:site}},selectedUnitId:unit.id}})});
  window.spawnV39VictoryLandmarkGuards();window.advanceV39NpcHegemonyTravel();state=window.getV39GameState();
  const worldId=state.victoryLandmarksByTile[site.key].hegemonyWorldId,entered=state.players.find(p=>p.id===player.id).factionState.units[0].worldId===worldId;
  let moves=0,attacks=0;
  for(let turn=2;turn<=18;turn++)await withV39WorldContext(worldId,()=>{
    let current=window.getV39GameState();window.setV39GameState({players:current.players.map(p=>({...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>({...u,ap:100,currentAp:100}))}}))});
    current=window.getV39GameState();const before=current.players.find(p=>p.id===player.id).factionState.units[0];
    const result=window.runV39FactionAiTurn(current,turn,window.__v39FieldRuntime.mapData);
    const after=result.state.players.find(p=>p.id===player.id).factionState.units[0];if(before.x!==after.x||before.y!==after.y)moves++;
    attacks+=result.reports.flatMap(r=>r.combatActions||[]).length;window.setV39GameState({players:result.state.players});
  });
  await withV39WorldContext(worldId,()=>{
    const current=window.getV39GameState(),exit=window.__v39FieldRuntime.mapData.entrances[0];
    window.setV39GameState({enemies:current.enemies.map(u=>({...u,hp:0,currentHp:0,state:'死亡'})),players:current.players.map(p=>p.id!==player.id?p:{...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>({...u,x:exit.x,y:exit.y}))}})});
  });
  window.advanceV39NpcHegemonyTravel();
  const queued=!!window.getV39GameState().players.find(p=>p.id===player.id).factionState.units[0].pendingWorldExit;
  const current=window.getV39GameState();window.setV39GameState({timeline:{...current.timeline,turnNumber:current.timeline.turnNumber+1}});
  window.resolveV39PendingWorldExits();window.advanceV39NpcHegemonyTravel();
  const claimed=window.getV39GameState().territoryOwnerByTile[site.key]===player.id;
  const map=window.__v39FieldRuntime.mapData,village=normalizeV39NeutralVillage({...state.neutralVillages[0],population:50},map);
  const guard=village.defenseUnits[0],enemy=createV39EventEnemy({id:'village-threat',race:'ウルフ',className:'ウルフ',level:5,x:village.x+2,y:village.y,metadata:{aggressive:true}});
  window.setV39GameState({neutralVillages:[village],enemies:[enemy]});const defense=window.runV39NeutralVillageDefenseTurn(1);
  const same=window.runV39NeutralVillageDefenseTurn(1);
  return {entered,moves,attacks,queued,claimed,villageAttacks:defense.attacks,villageMoves:defense.moves,sameAttacks:same.attacks,sameMoves:same.moves};
 });
 assert(report.entered);assert(report.moves>0);assert(report.attacks>0);assert(report.villageAttacks+report.villageMoves>0);
 assert(report.queued&&report.claimed);
 assert.equal(report.sameAttacks+report.sameMoves,0);assert.deepEqual(errors,[]);console.log(report);
}finally{await browser.close();}
