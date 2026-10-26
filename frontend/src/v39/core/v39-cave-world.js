import {createV39HegemonyWorld,hegemonyEntranceAt,V39_HEGEMONY_EXIT_TURNS} from '../../lib/v39-hegemony-areas.js';
import {advanceV39WorldExits} from '../../lib/v39-world-exit-rules.js';
import {prepareV39HegemonyWorlds} from '../../lib/v39-hegemony-land-rules.js';
import {getHexDistance} from '../../lib/hex-grid.js';
import {transferV39GuardianLand} from '../../lib/v39-guardian-quests.js';
import { createCaveCharacter, generateCaveFloor, useCaveSite, caveSiteUnavailable } from "../../lib/v39-cave-adventure.js";
import { findV39CavePath, createV39CaveSeed } from "../../lib/v39-cave-generator.js";
import { createPlayerRecord } from "../../lib/player-state.js";
import { addV39CargoToFactionUnit } from "../../lib/v39-logistics-state.js";
import { HEX_TILE_CONFIG } from "../../lib/phaser-map-panel-config.js";
import { groupV39SurfaceCaves, isV39UnitInWorld } from "../../lib/v39-cave-spatial-rules.js";
import { isV39CaveEntranceDiscovered } from "../../lib/v39-cave-entrance-rules.js";
import { getHexNeighborCoords } from "../../lib/hex-grid.js";
import { canUnitEnterV39Tile, resolveV39UnitMovementStepCost } from "../../lib/v39-terrain-traversal.js";
import { resolveV39MovementLeader, unitCurrentAp } from "../../lib/v39-squad-movement-rules.js";
import { resolveV39CaveFormation, V39_CAVE_FORMATIONS } from "../../lib/v39-cave-formation-rules.js";
import { isV39UnitWaiting } from "../../lib/v39-unit-action-rules.js";
import { syncV39CavePartyMenu } from "./v39-cave-party-menu.js";
import { V39_CAVE_BALANCE, V39_CAVE_MINE_BALANCE } from "../../lib/v39-gameplay-balance.js";
import { inspectV39CaveMine, createV39CaveMine, advanceV39CaveMine } from "../../lib/v39-cave-mine-rules.js";
import { renderV39CaveConquestChoice, advanceV39CaveConquest } from "./v39-cave-conquest.js";
import { createV39CaveEventNpc } from "./v39-cave-events.js";
import { collectV39MovementOccupancy } from "../../lib/v39-movement-occupancy-rules.js";
import {v39SquadMoveMode} from '../../lib/v39-squad-coordination.js';
import { playV39UnitMovementPath } from "../unit/v39-unit-movement.js";
import { showV39Feedback } from "../ui/v39-feedback.js";
import { assignV39MineDuty, advanceV39MineDuties, advanceV39CaveIntrusions } from "../../lib/v39-cave-operations.js";

const spatialKeys=["enemies","enemySquads","enemyNests","enemyCombatRuntime","settlements","territoryOwnerByTile","territoryStateByTile","recoveryPercentByTile","dangerPercentByTile","facilitiesByTile","neutralVillages","wandererGroups","groundLootByTile","explorationSitesByTile","specialtiesByTile","victoryLandmarksByTile","worldEnvironment"];
let switching=false;
let selectedGatherTile=null;
const clone=value=>structuredClone(value);

function rememberWorld(state){
  const worlds={...(state.explorationWorlds||{})},id=state.activeWorldId||"surface";
  if(!window.__v39FieldRuntime?.mapData)return worlds;
  const camera=window.__v39FieldRuntime.game?.scene?.getScenes(true)?.[0]?.cameras?.main;
  worlds[id]={...worlds[id],map:clone(window.__v39FieldRuntime.mapData),settings:clone(window.__v39FieldRuntime.settings),spatial:Object.fromEntries(spatialKeys.map(key=>[key,clone(state[key])])),visibility:Object.fromEntries(state.players.map(player=>[player.id,clone(player.factionState.visibility)])),exploration:Object.fromEntries(state.players.map(player=>[player.id,clone(player.factionState.exploration)]))};
  if(camera&&!window.__v39BackgroundWorldTurn)worlds[id].camera={zoom:camera.zoom,scrollX:camera.scrollX,scrollY:camera.scrollY};
  return worlds;
}

function activateWorld(state,worlds,id,players=state.players){
  const world=worlds[id];if(!world?.map)throw new Error("移動先のマップがありません。");
  switching=true;
  const batch=window.beginV39MapRenderBatch?.('world-layer-switch');
  try{
    window.cancelV39SelectedUnitMove?.();
    window.cancelV39SelectedUnitAttack?.("world-layer-changed");
    window.loadV39FieldSnapshot(world.map,world.settings||{}, {layerChange:true,worldId:id,camera:world.camera});
    window.setV39GameState({activeWorldId:id,explorationWorlds:worlds,...world.spatial,players:players.map(player=>({...player,factionState:{...player.factionState,visibility:world.visibility?.[player.id]||{},exploration:world.exploration?.[player.id]||{}}}))},{reason:"world-layer-changed"});
    window.refreshV39SquadDerivedUI?.();
    window.activateV39FooterTab?.("squad");
  }finally{switching=false;window.endV39MapRenderBatch?.(batch,{force:true,reason:'world-layer-switch'});}
  installActions();renderSites();
  window.dispatchEvent(new CustomEvent("v39:cave-world-ready"));
  return id;
}

function createWorld(options){
  if(options.hegemonyArea)return createV39HegemonyWorld(options);
  const {map,enemies,sites}=generateCaveFloor({seed:options.seed||"expedition-1",templateId:options.templateId||"random",floor:options.floor||1,caveTest:options.caveTest===true,entranceCount:Math.max(2,options.surfaceEntrances?.length||2)});
  map.caveSites=sites;
  map.caveBossIds=enemies.filter(unit=>unit.isCaveBoss).map(unit=>unit.id);
  map.caveBossRace=enemies.find(unit=>unit.isCaveBoss)?.race||"";
  map.caveFloor=options.floor||1;
  map.caveSeed=options.seed||"expedition-1";
  // 抽選結果のtemplateIdとは別に、階層ごとの抽選/指定設定を保持する。
  map.caveTemplateMode=options.templateId||"random";
  map.isUnderground=true;
  map.heightLevelMap=map.grid.map(row=>row.map(()=>0));
  map.specialMap=map.grid.map(row=>row.map(()=>""));
  map.riverData=[];
  map.parentWorldId=options.parentWorldId||null;
  map.parentExit=options.parentExit||null;
  map.entrances.forEach((entry,index)=>{entry.surfaceEntrance=options.surfaceEntrances?.[index]||null;});
  const reserved=new Set([...map.entrances,...enemies, ...sites].map(tile=>`${tile.x},${tile.y}`));
  const floorQueue=[map.entrances[0]],seen=new Set([map.entrances[0].key]);
  for(let i=0;i<floorQueue.length;i++)for(const next of getHexNeighborCoords(map.w,map.h,floorQueue[i].x,floorQueue[i].y)){
    if(seen.has(next.key)||map.grid[next.y][next.x]!=="洞窟")continue;
    seen.add(next.key);floorQueue.push(next);
  }
  map.stairsDown=map.entrances.find(entry=>entry!==map.entrances[0]&&!entry.surfaceEntrance)
    ||floorQueue.reverse().find(tile=>!reserved.has(`${tile.x},${tile.y}`));
  createV39CaveEventNpc(map);
  if(map.caveEventNpc){
    const npc=map.caveEventNpc;
    // NPCの固定位置に生成済みの敵・採取地点があれば、空いた通路へ移す。
    for(const entity of [...enemies,...sites])if(entity.x===npc.x&&entity.y===npc.y){
      const tile=floorQueue.find(tile=>!reserved.has(tile.key)&&tile!==map.stairsDown&&(tile.x!==npc.x||tile.y!==npc.y));
      if(!tile)throw new Error("鍛冶師と重なる洞窟配置を移動できません");
      Object.assign(entity,{x:tile.x,y:tile.y,key:tile.key});reserved.add(tile.key);
    }
  }
  return {map,spatial:{enemies,enemySquads:[],enemyNests:[],enemyCombatRuntime:{},settlements:[],neutralVillages:[],wandererGroups:[],territoryOwnerByTile:{},territoryStateByTile:{},recoveryPercentByTile:{},dangerPercentByTile:{},facilitiesByTile:{},groundLootByTile:{},explorationSitesByTile:{},specialtiesByTile:{},victoryLandmarksByTile:{},worldEnvironment:{}},visibility:{}};
}

export function enterV39Cave(options={}){
  if(window.isV39MapInputLocked?.())throw new Error("処理が終わるまでお待ちください。");
  let state=window.getV39GameState();
  const prepared=prepareV39HegemonyWorlds(state);
  if(prepared!==state){window.setV39GameState(prepared,{reason:'hegemony-worlds-prepared'});state=window.getV39GameState();}
  const selected=window.getV39SelectedSquadUnit?.();
  const player=state.players.find(row=>row.id===state.activePlayerId);
  if(!player?.factionState.units.length)throw new Error("探索するユニットがいません。");
  const squad=player.factionState.squads.find(row=>row.unitIds?.includes(selected?.id));
  const actor=selected||player.factionState.units[0];
  const ids=new Set(options.unitIds||(v39SquadMoveMode(actor)!=='follow'?[actor.id]:
    (squad?.unitIds||[actor.id]).filter(id=>v39SquadMoveMode(player.factionState.units.find(unit=>unit.id===id))==='follow')));
  const surfaceMap=window.__v39FieldRuntime?.mapData;
  const areaEntry=hegemonyEntranceAt(surfaceMap,actor.x,actor.y);
  const landmark=(state.activeWorldId||'surface')==='surface'&&!areaEntry?Object.values(state.victoryLandmarksByTile||{})
    .find(site=>site.hegemonyWorldId&&(site.occupiedTileKeys||[site.key]).includes(`${actor.x},${actor.y}`)):null;
  if(landmark){
    if(!player.factionState.exploration?.discoveredFeaturesByTile?.[landmark.key])throw new Error('覇権地を調査して発見してください。');
    options={...options,caveTest:true,worldId:landmark.hegemonyWorldId,parentWorldId:'surface',entrySurface:{x:actor.x,y:actor.y}};
  }
  if(areaEntry)options={...options,caveTest:true,hegemonyArea:areaEntry.areaId,worldId:`hegemony-test:${areaEntry.areaId}`,
    parentWorldId:state.activeWorldId||'surface',parentExit:{x:areaEntry.x,y:areaEntry.y},entrySurface:{x:areaEntry.x,y:areaEntry.y}};
  else if(surfaceMap?.hegemonyTestHub)throw new Error('覇権地の入口マスに移動してください。');
  if(options.caveTest!==true&&(state.activeWorldId||"surface")==="surface"){
    const group=groupV39SurfaceCaves(surfaceMap).find(row=>row.some(tile=>tile.x===selected?.x&&tile.y===selected?.y));
    if(!group)throw new Error("洞窟の入口に移動してください。");
    if(!isV39CaveEntranceDiscovered(player.factionState,surfaceMap,selected.x,selected.y))throw new Error("この洞窟入口は未発見です。索敵範囲を調査してください。");
    options={...options,seed:`entrance-${group[0].x}-${group[0].y}`,surfaceEntrances:group,entrySurface:{x:selected.x,y:selected.y}};
  }
  const worlds=rememberWorld(state),worldId=options.worldId||`cave:${options.seed||"expedition-1"}:${options.floor||1}`;
  worlds[worldId] ||= createWorld(options);
  const world=worlds[worldId],entry=world.map.entrances.find(tile=>tile.surfaceEntrance?.x===options.entrySurface?.x&&tile.surfaceEntrance?.y===options.entrySurface?.y)||world.map.entrances[0];
  if(world.map.hegemonyInterior&&options.entrySurface)world.map.parentExit={...options.entrySurface};
  if(world.map.hegemonyInterior)world.map.hegemonyVisited=true;
  const path=findV39CavePath(world.map,entry,world.map.entryTarget||world.map.stairsDown||world.map.entrances[1]);
  const members=player.factionState.units.filter(unit=>ids.has(unit.id)&&isV39UnitInWorld(unit,state.activeWorldId)&&Number(unit.hp??unit.currentHp)>0);
  if(resolveV39MovementLeader(squad,members)?.movementHold)throw new Error("移動先頭がその場待機中です。解除するか先頭を変更してください。");
  const incoming=members.filter(unit=>!unit.movementHold);
  const leaderId=resolveV39MovementLeader(squad,incoming)?.id;
  if(!leaderId)throw new Error("探索できる生存ユニットがいません。");
  const entryOrder=[leaderId,...(squad?.unitIds||incoming.map(unit=>unit.id)).filter(id=>id!==leaderId&&incoming.some(unit=>unit.id===id))];
  const occupied=new Set([...world.spatial.enemies,...state.players.flatMap(row=>row.factionState.units).filter(unit=>isV39UnitInWorld(unit,worldId)&&!ids.has(unit.id))].filter(unit=>Number(unit.hp??unit.currentHp)>0).map(unit=>`${unit.x},${unit.y}`));
  if(world.map.caveEventNpc)occupied.add(`${world.map.caveEventNpc.x},${world.map.caveEventNpc.y}`);
  const queue=[...path.slice(0,entryOrder.length).reverse()],seen=new Set(queue.map(tile=>`${tile.x},${tile.y}`));
  if(!queue.length){queue.push(entry);seen.add(entry.key);}
  for(let i=0;i<queue.length;i++)for(const next of getHexNeighborCoords(world.map.w,world.map.h,queue[i].x,queue[i].y)){
    if(seen.has(next.key)||(world.map.hegemonyInterior?world.map.grid[next.y][next.x]==="岩壁":world.map.grid[next.y][next.x]!=="洞窟"))continue;
    seen.add(next.key);queue.push(next);
  }
  const positions=new Map();
  for(const id of entryOrder){
    const unit=incoming.find(row=>row.id===id),saved=!options.entrySurface&&unit.locationsByWorld?.[worldId];
    const position=saved&&!occupied.has(`${saved.x},${saved.y}`)&&canUnitEnterV39Tile(world.map,saved.x,saved.y,unit)?saved:
      queue.find(tile=>!occupied.has(`${tile.x},${tile.y}`)&&canUnitEnterV39Tile(world.map,tile.x,tile.y,unit));
    if(!position)throw new Error("入口付近に部隊を配置できる空きマスがありません。");
    positions.set(id,position);occupied.add(`${position.x},${position.y}`);
  }
  const players=state.players.map(row=>row.id!==player.id?row:{...row,factionState:{...row.factionState,
    selectedUnitId:incoming.some(unit=>unit.id===selected?.id)?selected.id:leaderId,
    squads:row.factionState.squads.map(record=>record.id===squad?.id?{...record,movementLeaderId:leaderId,...resolveV39CaveFormation(record,[leaderId,...record.unitIds.filter(id=>id!==leaderId)])}:record),
    units:row.factionState.units.map(unit=>{
    if(!incoming.some(member=>member.id===unit.id))return unit;
    const position=positions.get(unit.id);
    return {...unit,worldId,locationsByWorld:{...unit.locationsByWorld,[state.activeWorldId||"surface"]:{x:unit.x,y:unit.y}},x:position.x,y:position.y};
  })}});
  return activateWorld(state,worlds,worldId,players);
}

// View an owned unit's world without moving the unit or changing its mission.
window.viewV39OwnedUnitWorld=(unitId,{surface=false}={})=>{
  if(window.isV39MapInputLocked?.())return false;
  const state=window.getV39GameState(),faction=state.players.find(p=>p.id===state.activePlayerId)?.factionState;
  const unit=faction?.units.find(u=>u.id===unitId&&Number(u.hp??u.currentHp)>0);
  if(!unit)return false;
  const id=surface?'surface':unit.worldId||'surface',worlds=rememberWorld(state);
  if(!worlds[id]?.map)return false;
  const selected=(unit.worldId||'surface')===id?unit:faction.units.find(u=>(u.worldId||'surface')===id&&Number(u.hp??u.currentHp)>0);
  const players=state.players.map(p=>p.id===state.activePlayerId?{...p,factionState:{...p.factionState,selectedUnitId:selected?.id||p.factionState.selectedUnitId}}:p);
  if(id!==state.activeWorldId)activateWorld(state,worlds,id,players);
  else window.setV39GameState({players},{reason:'logistics-unit-viewed'});
  return true;
};

// 専用検証マップの表示切替。個体は移動させず、通常ゲームでは使用できない。
window.viewV39ExpeditionTestWorld=(id)=>{
  if(!window.isV39TestMode?.()||window.isV39MapInputLocked?.())return false;
  const state=window.getV39GameState(),worlds=rememberWorld(state);
  if(!worlds[id]?.map?.expeditionTestFixture)return false;
  const players=state.players.map(player=>({...player,factionState:{...player.factionState,
    selectedUnitId:player.factionState.units.find(unit=>(unit.worldId||"surface")===id)?.id||player.factionState.selectedUnitId}}));
  activateWorld(state,worlds,id,players);
  return true;
};

export function leaveV39Cave(){
  if(window.isV39MapInputLocked?.())throw new Error("処理が終わるまでお待ちください。");
  const state=window.getV39GameState(),worlds=rememberWorld(state);
  const map=worlds[state.activeWorldId]?.map,actor=window.getV39SelectedSquadUnit?.();
  const exit=map?.entrances?.find(tile=>tile.x===actor?.x&&tile.y===actor?.y);
  const destination=map?.parentWorldId||"surface";
  if(!worlds[destination]?.map)throw new Error("戻るマップがありません。");
  if(map?.parentWorldId&&exit!==map.entrances[0])throw new Error("上り口に移動してください。");
  if(map?.entrances?.some(tile=>tile.surfaceEntrance)&&!exit?.surfaceEntrance)throw new Error("地上への入口に移動してください。");
  const faction=state.players.find(player=>player.id===state.activePlayerId)?.factionState;
  const squad=faction?.squads.find(row=>row.unitIds?.includes(actor?.id));
  const ids=new Set(v39SquadMoveMode(actor)!=='follow'?[actor?.id]:(squad?.unitIds||[actor?.id]).filter(id=>v39SquadMoveMode(faction.units.find(unit=>unit.id===id))==='follow'));
  const members=faction.units.filter(unit=>ids.has(unit.id)&&isV39UnitInWorld(unit,state.activeWorldId)&&Number(unit.hp??unit.currentHp)>0);
  if(resolveV39MovementLeader(squad,members)?.movementHold)throw new Error("移動先頭がその場待機中です。解除するか先頭を変更してください。");
  const outgoing=members.filter(unit=>!unit.movementHold);
  const anchor=map?.parentExit||exit?.surfaceEntrance;
  if(map?.hegemonyInterior){
    if(!anchor)throw new Error('地上の出口が設定されていません。');
    if(state.timeline?.phase!=='player')throw new Error('プレイヤーターンに退出を開始してください。');
    if(!actor||Number(actor.hp??actor.currentHp)<=0)throw new Error('退出する生存ユニットを選択してください。');
    if(actor.pendingWorldExit)throw new Error('退出準備中です。ターンを終了してください。');
    const request={actorId:actor.id,worldId:state.activeWorldId,destination,x:actor.x,y:actor.y,anchor,
      startedTurn:state.timeline.turnNumber,readyTurn:state.timeline.turnNumber+V39_HEGEMONY_EXIT_TURNS};
    const ids=new Set(outgoing.map(unit=>unit.id));
    const players=state.players.map(player=>player.id!==state.activePlayerId?player:{...player,factionState:{...player.factionState,
      units:player.factionState.units.map(unit=>ids.has(unit.id)?{...unit,pendingWorldExit:request,ap:0,currentAp:0,actionPoint:0,
        waitTurnNumber:state.timeline.turnNumber,lastActionTurn:state.timeline.turnNumber}:unit)}});
    window.setV39GameState({players},{reason:'world-exit-requested'});
    window.showV39TurnBanner?.(`退出準備中 ⌛${V39_HEGEMONY_EXIT_TURNS}：敵の行動後に地上へ戻ります。`);
    return {pending:true,readyTurn:request.readyTurn};
  }
  const occupied=new Set([...state.players.flatMap(player=>player.factionState.units).filter(unit=>isV39UnitInWorld(unit,destination)),...worlds[destination].spatial.enemies].filter(unit=>Number(unit.hp??unit.currentHp)>0).map(unit=>`${unit.x},${unit.y}`));
  const queue=anchor?[anchor]:[],positions=[];
  const seen=new Set(queue.map(tile=>`${tile.x},${tile.y}`));
  for(let i=0;i<queue.length&&positions.length<outgoing.length;i++){
    const tile=queue[i];
    if(!occupied.has(`${tile.x},${tile.y}`)&&outgoing.every(unit=>canUnitEnterV39Tile(worlds[destination].map,tile.x,tile.y,unit)))positions.push(tile);
    for(const next of getHexNeighborCoords(worlds[destination].map.w,worlds[destination].map.h,tile.x,tile.y)){
      if(seen.has(next.key)||worlds[destination].map.grid[next.y][next.x]==="岩壁")continue;
      seen.add(next.key);queue.push(next);
    }
  }
  if(anchor&&positions.length<outgoing.length)throw new Error("出口付近に部隊を配置できる空きマスがありません。");
  outgoing.sort((a,b)=>Number(b.id===actor.id)-Number(a.id===actor.id));
  const exitPositions=new Map(outgoing.map((unit,index)=>[unit.id,positions[index]]));
  const players=state.players.map(player=>player.id!==state.activePlayerId?player:{...player,factionState:{...player.factionState,units:player.factionState.units.map(unit=>{
    if(!outgoing.some(member=>member.id===unit.id))return unit;
    const position=anchor?exitPositions.get(unit.id):unit.locationsByWorld?.[destination];
    if(!position)return unit;
    return {...unit,worldId:destination,locationsByWorld:{...unit.locationsByWorld,[state.activeWorldId]:{x:unit.x,y:unit.y}},x:position.x,y:position.y};
  })}});
  return activateWorld(state,worlds,destination,players);
}

window.resolveV39PendingWorldExits=()=>{
  if(!window.getV39EnemyTurnState().players.some(player=>player.factionState.units.some(unit=>unit.pendingWorldExit)))return;
  const state=window.getV39GameState();
  const worlds=rememberWorld(state),result=advanceV39WorldExits(state,worlds,state.timeline.turnNumber);
  if(!result.notices.length)return;
  if(result.viewWorldId)activateWorld(state,worlds,result.viewWorldId,result.players);
  else window.setV39GameState({players:result.players,explorationWorlds:worlds},{reason:'world-exits-resolved'});
  for(const notice of result.notices)window.appendV39ActivityLog?.([notice.playerId],'移動',notice.message);
};

window.advanceV39NpcHegemonyTravel=()=>{
  const snapshot=window.getV39EnemyTurnState(),sites=snapshot.activeWorldId==='surface'?snapshot.victoryLandmarksByTile:snapshot.explorationWorlds?.surface?.spatial?.victoryLandmarksByTile;
  if(!snapshot.players.some(player=>player.isPlayer===false&&player.factionState.units.some(unit=>Number(unit.hp??unit.currentHp)>0&&
    (snapshot.explorationWorlds?.[unit.worldId]?.map?.hegemonyInterior||Object.values(sites||{}).some(site=>site.hegemonyWorldId&&(site.occupiedTileKeys||[site.key]).includes(`${unit.x},${unit.y}`))))))return;
  const initial=window.getV39GameState(),worlds=rememberWorld(initial),surface=worlds.surface;
  if(!surface)return;
  let players=initial.players,changed=false;
  for(const player of players.filter(player=>player.isPlayer===false)){
    for(const landmark of Object.values(surface.spatial.victoryLandmarksByTile||{})){
      const world=worlds[landmark.hegemonyWorldId];if(!world)continue;
      const faction=players.find(row=>row.id===player.id).factionState;
      const living=unit=>Number(unit.hp??unit.currentHp)>0&&unit.state!=='死亡';
      const guards=world.spatial.enemies.filter(unit=>unit.victoryGuard&&living(unit));
      const inside=faction.units.filter(unit=>living(unit)&&unit.worldId===landmark.hegemonyWorldId&&!unit.pendingWorldExit);
      const exit=world.map.entrances[0],departing=inside.find(unit=>unit.x===exit.x&&unit.y===exit.y);
      if(!guards.length&&departing){
        const request={actorId:departing.id,worldId:landmark.hegemonyWorldId,destination:'surface',x:exit.x,y:exit.y,
          anchor:world.map.parentExit,startedTurn:initial.timeline.turnNumber,readyTurn:initial.timeline.turnNumber+V39_HEGEMONY_EXIT_TURNS};
        const ids=new Set(inside.filter(unit=>unit.squadId===departing.squadId).map(unit=>unit.id));
        players=players.map(row=>row.id!==player.id?row:{...row,factionState:{...row.factionState,units:row.factionState.units.map(unit=>ids.has(unit.id)?{...unit,pendingWorldExit:request,ap:0,currentAp:0}:unit)}});changed=true;
      }
      const approaching=faction.units.find(unit=>living(unit)&&(unit.worldId||'surface')==='surface'&&(landmark.occupiedTileKeys||[landmark.key]).includes(`${unit.x},${unit.y}`));
      if(!approaching)continue;
      if(!guards.length){
        const claim=transferV39GuardianLand({...initial,...surface.spatial,activeWorldId:'surface',players,explorationWorlds:worlds},player.id,landmark.key,{conquest:true});
        if(claim.ok){players=claim.state.players;worlds[landmark.hegemonyWorldId]=claim.state.explorationWorlds[landmark.hegemonyWorldId];
          for(const field of ['territoryOwnerByTile','territoryStateByTile','dangerPercentByTile','victoryLandmarksByTile'])surface.spatial[field]=claim.state[field];changed=true;}
        continue;
      }
      const party=faction.units.filter(unit=>living(unit)&&(unit.worldId||'surface')==='surface'&&unit.squadId===approaching.squadId);
      const occupied=new Set([...world.spatial.enemies,...players.flatMap(p=>p.factionState.units).filter(unit=>unit.worldId===landmark.hegemonyWorldId)]
        .filter(living).map(unit=>`${unit.x},${unit.y}`));
      const tiles=[];
      for(let y=0;y<world.map.h;y++)for(let x=0;x<world.map.w;x++)if(world.map.grid[y][x]!=='岩壁')tiles.push({x,y});
      tiles.sort((a,b)=>getHexDistance(a,exit)-getHexDistance(b,exit));
      const positions=new Map();
      for(const unit of party){const tile=tiles.find(tile=>!occupied.has(`${tile.x},${tile.y}`)&&canUnitEnterV39Tile(world.map,tile.x,tile.y,unit));
        if(!tile)break;positions.set(unit.id,tile);occupied.add(`${tile.x},${tile.y}`);}
      if(positions.size!==party.length)continue;
      world.map.parentExit={x:approaching.x,y:approaching.y};
      world.map.hegemonyVisited=true;
      players=players.map(row=>row.id!==player.id?row:{...row,factionState:{...row.factionState,units:row.factionState.units.map(unit=>{
        const tile=positions.get(unit.id);return tile?{...unit,worldId:landmark.hegemonyWorldId,x:tile.x,y:tile.y,position:[tile.x,tile.y],ap:0,currentAp:0,
          locationsByWorld:{...unit.locationsByWorld,surface:{x:unit.x,y:unit.y}}}:unit;
      })}});changed=true;
    }
  }
  if(changed)window.setV39GameState({players,explorationWorlds:worlds,...(initial.activeWorldId==='surface'?surface.spatial:{})},{reason:'npc-hegemony-travel'});
};

export function descendV39Cave(){
  const map=window.__v39FieldRuntime?.mapData,unit=window.getV39SelectedSquadUnit?.();
  const exit=map?.stairsDown||map?.entrances?.[1];
  if(!map?.isUnderground||unit?.x!==exit?.x||unit?.y!==exit?.y)throw new Error("次の階層への入口に移動してください。");
  return enterV39Cave({seed:map.caveSeed,templateId:map.caveTemplateMode||map.templateId,floor:map.caveFloor+1,caveTest:map.caveTest===true,parentWorldId:window.getV39GameState().activeWorldId,parentExit:{x:exit.x,y:exit.y}});
}

// 開始画面のテストでも作成直後から通常ゲームのユニットとして登録する。
export function startV39CaveTest(profiles,options={}){
  const state=window.getV39GameState();
  if(!state.players.some(player=>player.factionState.units.length)){
    const units=profiles.map(createCaveCharacter);
    const player=createPlayerRecord({id:"player-1",ready:true,factionState:{units,squads:[{id:"cave-party",label:"探索部隊",unitIds:units.map(unit=>unit.id)}],selectedUnitId:units[0].id,villagePlacementMode:false}});
    window.setV39GameState({players:[player],activePlayerId:player.id},{reason:"cave-test-characters-created"});
  }
  return enterV39Cave({...options,seed:String(options.seed||"").trim()||createV39CaveSeed(),caveTest:true});
}

function installActions(){
  if(window.__v39BackgroundWorldTurn)return;
  renderPartyOrder();
  const list=document.getElementById("detailBasicList");if(!list)return;
  let button=document.getElementById("v39-cave-enter-action");
  if(!button){button=document.createElement("button");button.id="v39-cave-enter-action";button.className="technique-card system-action-card";button.type="button";button.addEventListener("click",()=>{
    try{window.getV39GameState().activeWorldId==="surface"?enterV39Cave():leaveV39Cave();}
    catch(error){window.showV39TurnBanner?.(error.message);}
  });list.appendChild(button);}
  const state=window.getV39GameState({includeWorlds:false}),unit=window.getV39SelectedSquadUnit?.(),map=window.__v39FieldRuntime?.mapData;
  const underground=state.activeWorldId!=="surface";
  const areaEntrance=hegemonyEntranceAt(map,unit?.x,unit?.y);
  const landmarkEntrance=!underground?Object.values(state.victoryLandmarksByTile||{}).find(site=>
    state.players.find(player=>player.id===state.activePlayerId)?.factionState.exploration?.discoveredFeaturesByTile?.[site.key]
    &&(site.hegemonyWorldId||state.enemies.some(enemy=>enemy.victoryLandmarkKey===site.key))&&(site.occupiedTileKeys||[site.key]).includes(`${unit?.x},${unit?.y}`)):null;
  const entrance=underground?map?.entrances?.some((tile,index)=>tile.x===unit?.x&&tile.y===unit?.y&&(map.parentWorldId?index===0:!!tile.surfaceEntrance||(!map.entrances.some(entry=>entry.surfaceEntrance)&&index===0))):!!areaEntrance||isV39CaveEntranceDiscovered(state.players.find(player=>player.id===state.activePlayerId)?.factionState,map,unit?.x,unit?.y);
  button.hidden=!entrance&&!landmarkEntrance;
  button.disabled=!!window.isV39MapInputLocked?.()||!!unit?.pendingWorldExit;
  button.textContent=underground?(map?.hegemonyInterior?"地上へ戻る":map?.parentWorldId?"前の階層へ":"地上へ戻る"):areaEntrance?`${areaEntrance.name}に入る`:"洞窟に入る";
  if(map?.hegemonyInterior)button.textContent=unit?.pendingWorldExit
    ?`退出準備中 ⌛${Math.max(0,unit.pendingWorldExit.readyTurn-state.timeline.turnNumber)}`:`地上へ戻る ⌛${V39_HEGEMONY_EXIT_TURNS}`;
  if(landmarkEntrance)button.textContent=`${landmarkEntrance.name}の奥地へ`;
  let cancelExit=document.getElementById('v39-world-exit-cancel');
  if(!cancelExit){
    cancelExit=document.createElement('button');cancelExit.id='v39-world-exit-cancel';cancelExit.className='technique-card system-action-card';
    cancelExit.type='button';cancelExit.textContent='退出を取り消す';list.appendChild(cancelExit);
    cancelExit.addEventListener('click',()=>{
      if(window.isV39MapInputLocked?.())return;
      const current=window.getV39GameState(),request=window.getV39SelectedSquadUnit?.()?.pendingWorldExit;if(!request)return;
      window.setV39GameState({players:current.players.map(player=>player.id!==current.activePlayerId?player:{...player,factionState:{...player.factionState,
        units:player.factionState.units.map(unit=>unit.pendingWorldExit?.actorId===request.actorId&&unit.pendingWorldExit?.worldId===request.worldId
          ?{...unit,pendingWorldExit:null}:unit)}})},{reason:'world-exit-cancelled'});
    });
  }
  cancelExit.hidden=!unit?.pendingWorldExit;cancelExit.disabled=!!window.isV39MapInputLocked?.();
  let descend=document.getElementById("v39-cave-descend-action");
  if(!descend){descend=document.createElement("button");descend.id="v39-cave-descend-action";descend.className="technique-card system-action-card";descend.type="button";descend.textContent="次の階層へ";descend.addEventListener("click",()=>{try{descendV39Cave();}catch(error){window.showV39TurnBanner?.(error.message);}});list.appendChild(descend);}
  const stairs=map?.stairsDown||map?.entrances?.[1];
  descend.hidden=!underground||stairs?.x!==unit?.x||stairs?.y!==unit?.y;
  descend.disabled=!!window.isV39MapInputLocked?.();
  renderMineActions(list,state,unit,map);
  renderV39CaveConquestChoice(list,state,unit,map,()=>commitMineAction(false));
  renderSiteActions();
}

function renderPartyOrder(){ syncV39CavePartyMenu(); }

function mineActorReason(state, actor, cost){
  if(window.isV39MapInputLocked?.())return "処理が終わるまでお待ちください";
  if(state.timeline?.phase!=="player")return "プレイヤーターンに操作してください";
  const owned=state.players.find(row=>row.id===state.activePlayerId)?.factionState.units.some(unit=>unit.id===actor?.id);
  if(!owned||!isV39UnitInWorld(actor,state.activeWorldId)||Number(actor.hp??actor.currentHp)<=0)return "この洞窟にいる自軍の生存者を選択してください";
  if(isV39UnitWaiting(actor,state.timeline.turnNumber))return "このターンは待機済みです";
  if(unitCurrentAp(actor)<cost)return "APが不足しています";
  return "";
}

function commitMineAction(collect){
  const state=window.getV39GameState(),actor=window.getV39SelectedSquadUnit?.(),map=window.__v39FieldRuntime?.mapData;
  const cost=collect?V39_CAVE_MINE_BALANCE.harvestApCost:V39_CAVE_MINE_BALANCE.claimApCost;
  const reason=mineActorReason(state,actor,cost);
  if(reason)throw new Error(reason);
  if(!map?.isUnderground)throw new Error("洞窟内で操作してください");
  let mine,faction=state.players.find(row=>row.id===state.activePlayerId).factionState,message;
  if(collect){
    if(map.caveMine?.ownerPlayerId!==state.activePlayerId)throw new Error("自軍の鉱床ではありません");
    if(!map.entrances.some(tile=>tile.x===actor.x&&tile.y===actor.y))throw new Error("鉱床の入口に移動してください");
    const stock=map.caveMine.stockByResource;
    if(!Object.values(stock||{}).some(value=>value>0))throw new Error("まだ採掘在庫がありません");
    const result=addV39CargoToFactionUnit(faction,actor.id,{resourcesByType:stock});
    if(!result.ok)throw new Error("物資を運べる部隊を選択してください");
    faction=result.faction;mine={...map.caveMine,stockByResource:{}};
    message=`鉱床から回収: ${Object.entries(stock).map(([name,amount])=>`${name} ${amount}`).join(" / ")}`;
  }else{
    mine=createV39CaveMine(map,state.enemies,state.activePlayerId,state.timeline.turnNumber);
    message=`奥地${map.caveFloor}を鉱床化。次ターンから採掘を開始します`;
  }
  faction={...faction,units:faction.units.map(unit=>unit.id===actor.id?{...unit,ap:unitCurrentAp(unit)-cost,currentAp:unitCurrentAp(unit)-cost}:unit)};
  window.cancelV39SelectedUnitMove?.();window.cancelV39SelectedUnitAttack?.("cave-mine");
  map.caveMine=mine;
  const worlds=rememberWorld({...state,players:state.players.map(row=>row.id===state.activePlayerId?{...row,factionState:faction}:row)});
  window.setV39GameState({explorationWorlds:worlds,players:state.players.map(row=>row.id===state.activePlayerId?{...row,factionState:faction}:row)},{reason:"cave-mine"});
  window.appendV39ActivityLog?.(state.activePlayerId,"鉱床",message,{worldId:state.activeWorldId});
  window.showV39TurnBanner?.(message);window.refreshV39SquadDerivedUI?.();
  return {ok:true,mine};
}

function updateMineOptions(select,rows){
  const selected=select.value,existing=new Map([...select.options].map(option=>[option.value,option]));
  let cursor=select.firstElementChild;
  for(const row of rows){
    const option=existing.get(row.id)||document.createElement('option');
    existing.delete(row.id);option.value=row.id;
    if(option.textContent!==row.label)option.textContent=row.label;
    if(option!==cursor)select.insertBefore(option,cursor);
    cursor=option.nextElementSibling;
  }
  for(const option of existing.values())option.remove();
  if(rows.some(row=>row.id===selected))select.value=selected;
}

function renderMineActions(list,state,actor,map){
  let operations=document.getElementById("v39-mine-operations");
  if(!operations){operations=document.createElement("div");operations.id="v39-mine-operations";operations.className="system-action-card";(document.getElementById('footTile')||list).appendChild(operations);}
  operations.hidden=map?.caveMine?.ownerPlayerId!==state.activePlayerId;
  const context=`${state.activePlayerId}:${state.activeWorldId}`;
  if(operations.dataset.context!==context){operations.replaceChildren();operations.dataset.context=context;}
  if(map?.caveMine?.ownerPlayerId===state.activePlayerId){
    const player=state.players.find(row=>row.id===state.activePlayerId);
    if(!operations.firstChild){
    const title=document.createElement("b");title.textContent="鉱床の入口警備（運搬は物流タブ）";operations.appendChild(title);
    const units=document.createElement("select");units.id="v39-mine-duty-unit";units.setAttribute("aria-label","担当軍隊");
    const settlements=document.createElement("select");settlements.id="v39-mine-duty-settlement";settlements.setAttribute("aria-label","搬入先拠点");
    operations.append(units,settlements);
    for(const [duty,label] of [["guard","入口警備"],["none","任務解除"]]){
      const button=document.createElement("button");button.type="button";button.textContent=label;button.dataset.mineDuty=duty;button.disabled=!units.options.length;
      button.addEventListener("click",()=>{const result=window.assignV39MineDuty(units.value,duty,settlements.value);window.showV39TurnBanner?.(result.ok?`${label}を指定しました`:result.reason);renderSiteActions();});operations.appendChild(button);
    }
    }
    const units=operations.querySelector('#v39-mine-duty-unit');
    updateMineOptions(units,player.factionState.units.filter(unit=>Number(unit.hp)>0&&String(unit.unitType).includes('軍隊')&&!unit.isNamed)
      .map(unit=>({id:unit.id,label:`${unit.name} ${unit.caveDuty?.status||'任務なし'}`})));
    updateMineOptions(operations.querySelector('#v39-mine-duty-settlement'),player.factionState.settlements.filter(row=>row.placed)
      .map(settlement=>({id:settlement.id,label:settlement.name||settlement.id})));
    operations.querySelectorAll('[data-mine-duty]').forEach(button=>button.disabled=!units.options.length||!!window.isV39MapInputLocked?.());
  }
  // 旧セーブに残っているボスも、除去される前に攻略対象IDを保存する。
  if(map?.isUnderground&&!map.caveBossIds)map.caveBossIds=state.enemies.filter(unit=>unit.isCaveBoss).map(unit=>unit.id);
  const show=map?.isUnderground&&((map.caveBossIds||[]).length||map.caveMine);
  for(const collect of [false,true]){
    const id=collect?"v39-cave-mine-collect":"v39-cave-mine-claim";
    let button=document.getElementById(id);
    if(!button){
      button=document.createElement("button");button.id=id;button.type="button";button.className="technique-card system-action-card";
      button.addEventListener("click",()=>{try{commitMineAction(collect);}catch(error){window.showV39TurnBanner?.(error.message);}});list.appendChild(button);
    }
    button.hidden=!show||(collect?!map.caveMine:!!map.caveMine);
    if(button.hidden)continue;
    let reason=mineActorReason(state,actor,collect?V39_CAVE_MINE_BALANCE.harvestApCost:V39_CAVE_MINE_BALANCE.claimApCost);
    if(collect){
      const stock=Object.entries(map.caveMine.stockByResource||{}).map(([name,amount])=>`${name} ${amount}`).join(" / ")||"在庫なし";
      const income=Object.entries(map.caveMine.resourcesPerCycle||{}).map(([name,amount])=>`${name}+${amount}`).join(" / ");
      button.textContent=`鉱床回収: ${stock}（${income}/${V39_CAVE_MINE_BALANCE.productionIntervalTurns}ターン${map.caveMine.suspended?"・採掘停止":""}）`;
      if(map.caveMine.ownerPlayerId!==state.activePlayerId)reason="他勢力の鉱床です";
      else if(!map.entrances.some(tile=>tile.x===actor?.x&&tile.y===actor?.y))reason="入口で回収できます";
      else if(!Object.values(map.caveMine.stockByResource||{}).some(value=>value>0))reason="在庫なし";
    }else{
      const inspection=inspectV39CaveMine(map,state.enemies);
      reason=reason||inspection.reason;
      button.textContent=`鉱床化 / AP ${V39_CAVE_MINE_BALANCE.claimApCost}${reason?` / ${reason}`:""}`;
    }
    button.disabled=!!reason;button.title=reason;
  }
}

window.claimV39CaveMine=()=>commitMineAction(false);
window.collectV39CaveMine=()=>commitMineAction(true);
// 共通ターン処理が各ワールドへ切り替えた状態で呼ぶ。非表示の鉱床も進む。
window.advanceV39CaveMine=turnNumber=>{
  advanceV39CaveConquest(turnNumber);
  const map=window.__v39FieldRuntime?.mapData;
  if(!map?.isUnderground||!map.caveMine)return;
  const state=window.getV39GameState();
  if(!state.players.some(player=>player.id===map.caveMine.ownerPlayerId))return;
  map.caveMine=advanceV39CaveMine(map.caveMine,state.enemies,turnNumber);
};

async function applyCavePartyOrder(faction,squad,order,keepHeld=false){
  const state=window.getV39GameState(),runtime=window.__v39FieldRuntime,map=runtime?.mapData;
  const byId=new Map(faction.units.map(unit=>[unit.id,unit]));
  // 先頭の明示変更では待機者を残す。前へ/後ろへの位置交換は解除してから行う。
  const fixed=id=>keepHeld&&(byId.get(id)?.movementHold||v39SquadMoveMode(byId.get(id))!=='follow');
  const previous=squad.unitIds.filter(id=>!fixed(id)),next=order.filter(id=>!fixed(id));
  const changed=next.map((id,index)=>({unit:byId.get(id),target:byId.get(previous[index])}))
    .filter((row,index)=>next[index]!==previous[index]);
  const unavailable=changed.some(({unit,target})=>!unit||!target||Number(unit.hp??unit.currentHp)<=0
    ||!isV39UnitInWorld(unit,state.activeWorldId)||unit.movementHold||['independent','gather'].includes(unit.squadMoveMode));
  if(unavailable){showV39Feedback("同じ階層の生存者を追従に戻し、その場待機を解除してから隊列を変更してください");return false;}
  if(changed.some(({unit})=>isV39UnitWaiting(unit,state.timeline.turnNumber))){
    showV39Feedback("このターン待機済みのキャラクターは隊列交換で移動できません");return false;
  }
  const {blocked}=collectV39MovementOccupancy(state,changed.map(row=>row.unit.id),map);
  const routes=changed.map(({unit,target})=>{
    if(map.isUnderground)return findV39CavePath(map,unit,target,[...blocked]);
    const key=tile=>`${tile.x},${tile.y}`,previous=new Map([[key(unit),null]]),queue=[unit];
    for(let cursor=0;cursor<queue.length&&!previous.has(key(target));cursor++) {
      const current=queue[cursor];
      for(const next of getHexNeighborCoords(map.w,map.h,current.x,current.y,map.worldWrapEnabled===true)) {
        if(previous.has(next.key)||blocked.has(next.key)||!canUnitEnterV39Tile(map,next.x,next.y,unit)
          ||!Number.isFinite(resolveV39UnitMovementStepCost(map,current.x,current.y,next.x,next.y,unit)))continue;
        previous.set(next.key,current);queue.push(next);
      }
    }
    if(!previous.has(key(target)))return [];
    const path=[];
    for(let cursor=target;cursor;cursor=previous.get(key(cursor)))path.unshift({x:cursor.x,y:cursor.y});
    return path;
  });
  if(routes.some((path,index)=>!path.length||path.some(tile=>!canUnitEnterV39Tile(map,tile.x,tile.y,changed[index].unit)))){
    showV39Feedback("交換先までの通路が塞がれているため隊列を変更できません");return false;
  }
  const costs=routes.map((path,index)=>path.slice(1).reduce((total,tile,step)=>total+
    resolveV39UnitMovementStepCost(map,path[step].x,path[step].y,tile.x,tile.y,changed[index].unit),0));
  const insufficient=changed.findIndex(({unit},index)=>unitCurrentAp(unit)<costs[index]);
  if(insufficient>=0){showV39Feedback(`${changed[insufficient].unit.name}のAPが不足しています（隊列変更 ${costs[insufficient]}）`);return false;}
  window.cancelV39SelectedUnitMove?.();window.cancelV39SelectedUnitAttack?.("party-order-changed");
  const token=window.beginV39MapInputLock?.("party-order"),app=document.getElementById("app"),wasInert=app?.inert;
  if(app)app.inert=true;
  let batch=null;
  try{
    await window.waitForV39MapRenderSettled?.();
    window.refreshV39MapEntities?.();batch=window.beginV39MapRenderBatch?.("party-order");
    const length=Math.max(1,...routes.map(path=>path.length));
    const frames=Array.from({length},(_,step)=>changed.map((row,index)=>({id:row.unit.id,...routes[index][Math.min(step,routes[index].length-1)]})));
    await playV39UnitMovementPath(runtime.game?.scene?.getScenes(true)?.[0],frames,map);
    const destinations=new Map(changed.map(({unit,target},index)=>{
      const ap=unitCurrentAp(unit)-costs[index];
      return [unit.id,{x:target.x,y:target.y,ap,currentAp:ap,actionPoint:ap,lastActionTurn:state.timeline.turnNumber}];
    }));
    window.updateV39ActiveFactionState({
      units:faction.units.map(unit=>destinations.has(unit.id)?{...unit,...destinations.get(unit.id)}:unit),
      squads:faction.squads.map(row=>row.id===squad.id?{...row,unitIds:order,movementLeaderId:order[0],...resolveV39CaveFormation(row,order)}:row)
    },{reason:"party-order-changed"});
    window.refreshV39SquadDerivedUI?.();return true;
  }finally{
    window.endV39MapRenderBatch?.(batch,{force:true,reason:"party-order-complete"});
    await window.waitForV39MapRenderSettled?.();
    window.endV39MapInputLock?.(token,"party-order-complete");if(app)app.inert=wasInert;renderPartyOrder();
  }
}

export async function reorderV39CaveParty(delta,unitId=window.getV39SelectedSquadUnit?.()?.id){
  if(window.isV39MapInputLocked?.())return false;
  const faction=window.getV39ActiveFactionState(),actor=faction.units.find(unit=>unit.id===unitId);
  const squad=faction.squads.find(row=>row.unitIds?.includes(actor?.id)),index=squad?.unitIds.indexOf(actor?.id),next=index+delta;
  if(!squad||next<0||next>=squad.unitIds.length)return false;
  const order=[...squad.unitIds];[order[index],order[next]]=[order[next],order[index]];
  return applyCavePartyOrder(faction,squad,order);
}

export async function setV39CaveMovementLeader(unitId){
  if(window.isV39MapInputLocked?.())return false;
  const faction=window.getV39ActiveFactionState(),actor=faction.units.find(unit=>unit.id===unitId);
  const squad=faction.squads.find(row=>row.unitIds?.includes(unitId));
  if(!squad||!actor||Number(actor.hp??actor.currentHp)<=0)return false;
  if(v39SquadMoveMode(actor)!=='follow'){showV39Feedback('追従に戻してから移動先頭を変更してください');return false;}
  const order=[unitId,...squad.unitIds.filter(id=>id!==unitId)];
  return applyCavePartyOrder(faction,squad,order,true);
}

export function setV39CaveFormation(unitId,formationType){
  if(window.isV39MapInputLocked?.()||!Object.hasOwn(V39_CAVE_FORMATIONS,formationType))return false;
  const faction=window.getV39ActiveFactionState(),squad=faction.squads.find(row=>row.unitIds?.includes(unitId));
  if(!squad)return false;
  window.cancelV39SelectedUnitMove?.();
  window.updateV39ActiveFactionState({squads:faction.squads.map(row=>row.id===squad.id?{...row,...resolveV39CaveFormation({...row,formationType})}:row)});
  window.refreshV39SquadDerivedUI?.();renderPartyOrder();return true;
}

export function toggleV39CaveMovementHold(unitId){
  if(window.isV39MapInputLocked?.())return false;
  const faction=window.getV39ActiveFactionState(),actor=faction.units.find(unit=>unit.id===unitId);
  if(!actor||Number(actor.hp??actor.currentHp)<=0)return false;
  window.cancelV39SelectedUnitMove?.();
  window.updateV39ActiveFactionState({units:faction.units.map(unit=>unit.id===unitId?{...unit,movementHold:!unit.movementHold}:unit)});
  window.refreshV39SquadDerivedUI?.();renderPartyOrder();return true;
}

window.startV39CaveTest=startV39CaveTest;
window.enterV39Cave=enterV39Cave;
window.leaveV39Cave=leaveV39Cave;
window.descendV39Cave=descendV39Cave;
window.reorderV39CaveParty=reorderV39CaveParty;
window.setV39CaveMovementLeader=setV39CaveMovementLeader;
window.setV39CaveFormation=setV39CaveFormation;
window.toggleV39CaveMovementHold=toggleV39CaveMovementHold;
// 他階層は不変の保存済みデータ。現在階層だけ新しいスナップショットにする。
window.captureV39ExplorationWorlds=()=>rememberWorld(window.getV39EnemyTurnState());
function operationState(){const state=window.getV39GameState();return {...state,explorationWorlds:rememberWorld(state)};}
function commitOperations(next){
  const active=next.explorationWorlds?.[next.activeWorldId||"surface"];
  if(active?.map?.caveMine)window.__v39FieldRuntime.mapData.caveMine=active.map.caveMine;
  window.setV39GameState({players:next.players,explorationWorlds:next.explorationWorlds,enemies:next.enemies,enemyNests:next.enemyNests,enemySquads:next.enemySquads},{reason:"cave-operations",silent:true});
}
window.advanceV39MineDuties=(playerId,turn)=>{
  if(!window.getV39EnemyTurnState().players.find(row=>row.id===playerId)?.factionState.units.some(unit=>unit.caveDuty))return;
  commitOperations(advanceV39MineDuties(operationState(),playerId,turn));
};
window.advanceV39CaveIntrusions=turn=>{
  const state=window.getV39EnemyTurnState();
  if(!window.__v39FieldRuntime?.mapData?.caveMine&&!Object.values(state.explorationWorlds||{}).some(world=>world.map?.caveMine))return;
  commitOperations(advanceV39CaveIntrusions(operationState(),turn));
};
window.assignV39MineDuty=(unitId,duty,settlementId="")=>{
  if(window.isV39MapInputLocked?.())return {ok:false,reason:"処理中です"};
  const state=operationState();if(state.timeline.phase!=="player")return {ok:false,reason:"操作ターンではありません"};
  const mineWorldId=duty==='none'?state.players.find(player=>player.id===state.activePlayerId)?.factionState.units.find(unit=>unit.id===unitId)?.caveDuty?.mineWorldId:state.activeWorldId;
  const result=assignV39MineDuty(state,state.activePlayerId,mineWorldId,unitId,duty,settlementId);
  if(result.ok){commitOperations(result.state);window.dispatchEvent(new CustomEvent("v39:game-state-changed"));}return result;
};
window.addEventListener("v39:game-state-changed",event=>{if(!switching&&event.detail?.reason!=="activity-log"){installActions();renderSites();}});
window.addEventListener("v39:unit-selected",installActions);
window.addEventListener("v39:squad-detail-rendered",installActions);
window.addEventListener("v39:map-input-lock-changed",installActions);
window.addEventListener("v39:unit-selected",event=>{
  if(switching||window.isV39MapInputLocked?.())return;
  const state=window.getV39GameState(),worldId=event.detail.unit?.worldId||"surface";
  if(worldId!==state.activeWorldId&&state.explorationWorlds?.[worldId])activateWorld(state,rememberWorld(state),worldId);
});
window.addEventListener("v39:field-layer-changed",()=>{setTimeout(()=>{installActions();renderSites();},100);});
window.addEventListener("v39:visibility-rendered",renderSites);
window.addEventListener("v39:field-input-ready",()=>{installActions();renderSites();});
window.addEventListener("v39:save-loaded",()=>{setTimeout(()=>{installActions();renderSites();},100);});

function renderSites(){
  if(window.__v39BackgroundWorldTurn)return;
  const map=window.__v39FieldRuntime?.mapData,scene=window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0];
  if(!scene||(!map?.isUnderground&&!map?.hegemonyInterior))return;
  scene.v39CaveSites?.destroy(true);
  scene.v39CaveSites=scene.add.container(0,0).setDepth(27);
  const stairs=(map.entrances||[]).map((tile,index)=>({...tile,icon:map.hegemonyInterior?'出口':map.parentWorldId&&index===0?"↑":"↗",remaining:1,worldExit:map.hegemonyInterior}));
  if(map.stairsDown)stairs.push({...map.stairsDown,icon:"↓",remaining:1});
  for(const site of [...(map.caveSites||[]),...stairs]){
    if(!(site.worldExit&&window.isV39TestMode?.())&&!window.isV39TileExplored?.(site.x,site.y)&&!window.isV39TileInCurrentVision?.(site.x,site.y))continue;
    site.discovered=true;
    const x=site.x*HEX_TILE_CONFIG.width+(site.y%2?HEX_TILE_CONFIG.oddRowOffsetX:0)+HEX_TILE_CONFIG.width/2,y=site.y*HEX_TILE_CONFIG.rowStep+HEX_TILE_CONFIG.height/2;
    if(site.worldExit)scene.v39CaveSites.add(scene.add.circle(x,y,HEX_TILE_CONFIG.width*.46,0x102d35,.9).setStrokeStyle(3,0xffe17a));
    const marker=scene.add.text(x,y,site.icon,{fontSize:`${HEX_TILE_CONFIG.width*.4}px`,color:site.worldExit?'#ffe17a':'#ffffff',fontStyle:'bold'}).setOrigin(.5).setInteractive();
    if(site.worldExit)marker.setName('v39-world-exit-marker');
    marker.setAlpha(site.remaining>0?1:.35);
    marker.on("pointerdown",()=>{
      window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:{x:site.x,y:site.y,terrain:map.hegemonyInterior?map.grid[site.y][site.x]:site.wall?"岩壁":"洞窟"}}));
    });
    scene.v39CaveSites.add(marker);
  }
  renderSiteActions();
  window.dispatchEvent(new CustomEvent("v39:cave-gather-target-changed"));
}

function siteGame(state,actor){
  const faction=state.players.find(row=>row.id===state.activePlayerId).factionState;
  const squad=faction.squads.find(row=>row.unitIds?.includes(actor.id));
  const map=window.__v39FieldRuntime.mapData;
  // 仮の複製で処理し、採取・AP・運搬品をまとめて確定する。
  return {map,phase:"player",position:actor,party:clone(faction.units.filter(unit=>(squad?.unitIds||[actor.id]).includes(unit.id)&&isV39UnitInWorld(unit,state.activeWorldId))),sites:clone(map.caveSites),inventory:{鉱石:0,宝石:0},floor:map.caveFloor,turn:state.timeline.turnNumber,log:[]};
}

function renderSiteActions(){
  const list=document.getElementById("detailBasicList"),map=window.__v39FieldRuntime?.mapData,actor=window.getV39SelectedSquadUnit?.();
  if(!list)return;
  const expandedSite=list.querySelector('[data-v39-cave-site].is-expanded')?.dataset.v39CaveSite;
  const previous=new Map([...list.querySelectorAll('[data-v39-cave-site]')].map(node=>[node.dataset.v39CaveSite,node]));
  const removePrevious=()=>{for(const node of previous.values())node.remove();};
  if(!map?.isUnderground||!actor){removePrevious();return;}
  const state=window.getV39GameState({includeWorlds:false});if(!isV39UnitInWorld(actor,state.activeWorldId)){removePrevious();return;}
  const game=siteGame(state,actor);
  let cursor=previous.values().next().value||document.getElementById('detailBasicRows');
  for(const site of map.caveSites||[]){
    if(site.wall)continue;
    if(!site.discovered||site.remaining<=0||site.x!==actor.x||site.y!==actor.y)continue;
    const button=document.createElement("div");button.setAttribute("role","button");button.tabIndex=0;
    button.className="technique-card technique-select-card system-action-card";button.dataset.v39CaveSite=site.id;
    button.dataset.v39TechniqueName=`__cave_site_${site.id}`;button.setAttribute("aria-expanded","false");
    let reason=caveSiteUnavailable(game,site,game.party.find(unit=>unit.id===actor.id));
    if(isV39UnitWaiting(actor,state.timeline.turnNumber))reason="このターンは待機済みです";
    if(window.isV39MapInputLocked?.())reason="処理中です";
    const summary=document.createElement("span");summary.className="technique-summary";
    const icon=document.createElement("span");icon.className="technique-icon";icon.textContent=site.icon;
    const name=document.createElement("b");name.className="technique-name";name.textContent="休息して回復";
    const ap=document.createElement("small");ap.className="technique-ap";ap.textContent=`AP ${V39_CAVE_BALANCE.recoveryApCost}`;
    const reserve=document.createElement("span");reserve.className="technique-power";reserve.textContent=`残り${site.remaining}`;
    summary.append(icon,name,ap,reserve);
    const detail=document.createElement("span");detail.className="technique-detail";
    detail.innerHTML='<span class="technique-detail-head"><b>説明</b><button type="button" data-v39-system-use>使用</button></span>';
    const description=document.createElement("span");description.className="technique-detail-description";
    description.textContent=`${site.name}で仲間を回復 / AP ${V39_CAVE_BALANCE.recoveryApCost}${reason?` / ${reason}`:""}`;
    detail.appendChild(description);button.append(summary,detail);
    const use=detail.querySelector("button");
    use.disabled=!!reason;
    button.title=reason;button.classList.toggle("unavailable",use.disabled);
    use.onclick=event=>{event.stopPropagation();interactSite(site);};
    if(expandedSite===site.id){button.classList.add("is-expanded");button.setAttribute("aria-expanded","true");}
    const old=previous.get(site.id);
    let next=button;
    if(old&&old.outerHTML===button.outerHTML){next=old;old.querySelector('[data-v39-system-use]').onclick=use.onclick;}
    else if(old){if(cursor===old)cursor=old.nextElementSibling;old.remove();}
    previous.delete(site.id);
    if(next!==cursor)list.insertBefore(next,cursor);
    cursor=next.nextElementSibling;
  }
  removePrevious();
}

function interactSite(site){
  const state=window.getV39GameState(),player=state.players.find(row=>row.id===state.activePlayerId),actor=window.getV39SelectedSquadUnit?.();
  if(!actor||!isV39UnitInWorld(actor,state.activeWorldId)||window.isV39MapInputLocked?.()||isV39UnitWaiting(actor,state.timeline.turnNumber))return {ok:false};
  const game=siteGame(state,actor);
  try{
    useCaveSite(game,site.id,actor.id);
    let faction={...player.factionState,units:player.factionState.units.map(unit=>game.party.find(member=>member.id===unit.id)||unit)};
    if(site.wall){
      const result=addV39CargoToFactionUnit(faction,actor.id,{resourcesByType:game.inventory});
      if(!result.ok)throw new Error("採取物を運ぶ部隊がありません。");
      faction=result.faction;
    }
    window.cancelV39SelectedUnitMove?.();window.cancelV39SelectedUnitAttack?.("cave-site-used");
    window.__v39FieldRuntime.mapData.caveSites=game.sites;
    window.setV39GameState({players:state.players.map(row=>row.id===player.id?{...row,factionState:faction}:row)},{reason:"cave-site-used"});
    const message=game.log.map(row=>typeof row==="string"?row:row.message).filter(Boolean).join(" / ");
    window.appendV39ActivityLog?.(player.id,site.wall?"採取":"回復",message,{worldId:state.activeWorldId,siteId:site.id});
    window.pushV39Notification?.(message,{title:site.wall?"採取":"回復"});
    window.showV39TurnBanner?.(message);
    return {ok:true,siteId:site.id};
  }catch(error){window.showV39TurnBanner?.(error.message);return {ok:false,reason:error.message};}
}

function inspectCaveGather(){
  const map=window.__v39FieldRuntime?.mapData,actor=window.getV39SelectedSquadUnit?.();
  if(!map?.isUnderground)return null;
  const state=window.getV39GameState({includeWorlds:false});
  const nearby=new Set(actor&&isV39UnitInWorld(actor,state.activeWorldId)?getHexNeighborCoords(map.w,map.h,actor.x,actor.y).map(tile=>tile.key):[]);
  const hasTarget=map.caveSites?.some(row=>row.wall&&row.discovered&&row.remaining>0&&nearby.has(`${row.x},${row.y}`))||false;
  const site=map.caveSites?.find(row=>row.wall&&row.discovered&&row.x===selectedGatherTile?.x&&row.y===selectedGatherTile?.y);
  let reason="周囲1マスの鉱石・宝石を選択してください";
  if(site&&actor){
    const game=siteGame(state,actor);
    reason=caveSiteUnavailable(game,site,game.party.find(unit=>unit.id===actor.id));
    if(isV39UnitWaiting(actor,state.timeline.turnNumber))reason="このターンは待機済みです";
    if(!isV39UnitInWorld(actor,state.activeWorldId))reason="このキャラクターは別のマップにいます";
    if(window.isV39MapInputLocked?.())reason="処理中です";
  }
  return {hasTarget,available:!!site&&!!actor&&!reason,reason,site,apCost:V39_CAVE_BALANCE.miningApCost};
}

window.inspectV39CaveGather=inspectCaveGather;
window.gatherV39SelectedCaveSite=()=>{
  const check=inspectCaveGather();
  if(!check?.available){window.showV39TurnBanner?.(check?.reason);return {ok:false,reason:check?.reason};}
  return interactSite(check.site);
};
window.addEventListener("v39:tile-selected",event=>{
  selectedGatherTile=event.detail;renderSiteActions();
  window.dispatchEvent(new CustomEvent("v39:cave-gather-target-changed"));
  if(window.getV39AttackSession?.())return;
  const map=window.__v39FieldRuntime?.mapData,actor=window.getV39SelectedSquadUnit?.();
  if(!map?.isUnderground||!actor)return;
  const site=map.caveSites?.find(row=>row.discovered&&row.remaining>0&&row.x===selectedGatherTile?.x&&row.y===selectedGatherTile?.y);
  if(!site)return;
  const nearby=getHexNeighborCoords(map.w,map.h,actor.x,actor.y).some(tile=>tile.x===site.x&&tile.y===site.y);
  if(site.wall&&nearby)window.openV39ActionDetail?.("__system_gather__");
  else if(!site.wall&&actor.x===site.x&&actor.y===site.y)window.openV39ActionDetail?.(`__cave_site_${site.id}`);
});
for(const type of ["v39:unit-selected","v39:field-layer-changed"]){
  window.addEventListener(type,()=>{
    selectedGatherTile=null;
    window.dispatchEvent(new CustomEvent("v39:cave-gather-target-changed"));
  });
}
