import { createCaveCharacter, generateCaveFloor, useCaveSite, caveSiteUnavailable } from "../../lib/v39-cave-adventure.js";
import { findV39CavePath } from "../../lib/v39-cave-generator.js";
import { createPlayerRecord } from "../../lib/player-state.js";
import { addV39CargoToFactionUnit } from "../../lib/v39-logistics-state.js";
import { HEX_TILE_CONFIG } from "../../lib/phaser-map-panel-config.js";
import { groupV39SurfaceCaves, isV39UnitInWorld } from "../../lib/v39-cave-spatial-rules.js";
import { getHexNeighborCoords } from "../../lib/hex-grid.js";
import { canUnitEnterV39Tile } from "../../lib/v39-terrain-traversal.js";
import { isV39UnitWaiting } from "../../lib/v39-unit-action-rules.js";

const spatialKeys=["enemies","enemySquads","enemyNests","enemyCombatRuntime","settlements","territoryOwnerByTile","territoryStateByTile","recoveryPercentByTile","dangerPercentByTile","facilitiesByTile","neutralVillages","wandererGroups","groundLootByTile","explorationSitesByTile","specialtiesByTile","victoryLandmarksByTile","worldEnvironment"];
let switching=false;
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
  try{
    window.cancelV39SelectedUnitMove?.();
    window.cancelV39SelectedUnitAttack?.("world-layer-changed");
    window.loadV39FieldSnapshot(world.map,world.settings||{}, {layerChange:true});
    window.setV39GameState({activeWorldId:id,explorationWorlds:worlds,...world.spatial,players:players.map(player=>({...player,factionState:{...player.factionState,visibility:world.visibility?.[player.id]||{},exploration:world.exploration?.[player.id]||{}}}))},{reason:"world-layer-changed"});
    window.refreshV39SquadDerivedUI?.();
    window.renderV39Visibility?.();
    window.refreshV39MapEntities?.();
    window.activateV39FooterTab?.("squad");
    setTimeout(()=>{
      if(window.getV39GameState().activeWorldId!==id)return;
      const camera=window.__v39FieldRuntime.game?.scene?.getScenes(true)?.[0]?.cameras?.main;
      if(camera&&world.camera){camera.setZoom(world.camera.zoom);camera.setScroll(world.camera.scrollX,world.camera.scrollY);}
    },100);
  }finally{switching=false;}
  installActions();renderSites();
  return id;
}

function createWorld(options){
  const {map,enemies,sites}=generateCaveFloor({seed:options.seed||"expedition-1",templateId:options.templateId||"random",floor:options.floor||1,entranceCount:Math.max(2,options.surfaceEntrances?.length||2)});
  map.caveSites=sites;
  map.caveFloor=options.floor||1;
  map.caveSeed=options.seed||"expedition-1";
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
  return {map,spatial:{enemies,enemySquads:[],enemyNests:[],enemyCombatRuntime:{},settlements:[],neutralVillages:[],wandererGroups:[],territoryOwnerByTile:{},territoryStateByTile:{},recoveryPercentByTile:{},dangerPercentByTile:{},facilitiesByTile:{},groundLootByTile:{},explorationSitesByTile:{},specialtiesByTile:{},victoryLandmarksByTile:{},worldEnvironment:{}},visibility:{}};
}

export function enterV39Cave(options={}){
  if(window.isV39MapInputLocked?.())throw new Error("処理が終わるまでお待ちください。");
  const state=window.getV39GameState(),selected=window.getV39SelectedSquadUnit?.();
  const player=state.players.find(row=>row.id===state.activePlayerId);
  if(!player?.factionState.units.length)throw new Error("探索するユニットがいません。");
  const squad=player.factionState.squads.find(row=>row.unitIds?.includes(selected?.id));
  const ids=new Set(options.unitIds||squad?.unitIds||[selected?.id||player.factionState.units[0].id]);
  const surfaceMap=window.__v39FieldRuntime?.mapData;
  if(!options.seed&&(state.activeWorldId||"surface")==="surface"){
    const group=groupV39SurfaceCaves(surfaceMap).find(row=>row.some(tile=>tile.x===selected?.x&&tile.y===selected?.y));
    if(!group)throw new Error("洞窟の入口に移動してください。");
    options={...options,seed:`entrance-${group[0].x}-${group[0].y}`,surfaceEntrances:group,entrySurface:{x:selected.x,y:selected.y}};
  }
  const worlds=rememberWorld(state),worldId=options.worldId||`cave:${options.seed||"expedition-1"}:${options.floor||1}`;
  worlds[worldId] ||= createWorld(options);
  const world=worlds[worldId],entry=world.map.entrances.find(tile=>tile.surfaceEntrance?.x===options.entrySurface?.x&&tile.surfaceEntrance?.y===options.entrySurface?.y)||world.map.entrances[0];
  const path=findV39CavePath(world.map,entry,world.map.stairsDown||world.map.entrances[1]);
  const incoming=player.factionState.units.filter(unit=>ids.has(unit.id)&&isV39UnitInWorld(unit,state.activeWorldId)&&Number(unit.hp??unit.currentHp)>0);
  const entryOrder=incoming.map(unit=>unit.id);
  const leaderId=entryOrder.includes(selected?.id)?selected.id:entryOrder[0];
  if(!leaderId)throw new Error("探索できる生存ユニットがいません。");
  entryOrder.splice(0,entryOrder.length,leaderId,...entryOrder.filter(id=>id!==leaderId));
  const occupied=new Set([...world.spatial.enemies,...state.players.flatMap(row=>row.factionState.units).filter(unit=>isV39UnitInWorld(unit,worldId)&&!ids.has(unit.id))].filter(unit=>Number(unit.hp??unit.currentHp)>0).map(unit=>`${unit.x},${unit.y}`));
  const queue=[...path.slice(0,entryOrder.length).reverse()],seen=new Set(queue.map(tile=>`${tile.x},${tile.y}`));
  if(!queue.length){queue.push(entry);seen.add(entry.key);}
  for(let i=0;i<queue.length;i++)for(const next of getHexNeighborCoords(world.map.w,world.map.h,queue[i].x,queue[i].y)){
    if(seen.has(next.key)||world.map.grid[next.y][next.x]!=="洞窟")continue;
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
  const players=state.players.map(row=>row.id!==player.id?row:{...row,factionState:{...row.factionState,selectedUnitId:leaderId,units:row.factionState.units.map(unit=>{
    if(!ids.has(unit.id)||!isV39UnitInWorld(unit,state.activeWorldId)||Number(unit.hp??unit.currentHp)<=0)return unit;
    const position=positions.get(unit.id);
    return {...unit,worldId,locationsByWorld:{...unit.locationsByWorld,[state.activeWorldId||"surface"]:{x:unit.x,y:unit.y}},x:position.x,y:position.y};
  })}});
  return activateWorld(state,worlds,worldId,players);
}

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
  const ids=new Set(squad?.unitIds||[actor?.id]);
  const outgoing=faction.units.filter(unit=>ids.has(unit.id)&&isV39UnitInWorld(unit,state.activeWorldId)&&Number(unit.hp??unit.currentHp)>0);
  const anchor=map?.parentExit||exit?.surfaceEntrance;
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
    if(!ids.has(unit.id)||unit.worldId!==state.activeWorldId||Number(unit.hp??unit.currentHp)<=0)return unit;
    const position=anchor?exitPositions.get(unit.id):unit.locationsByWorld?.[destination];
    if(!position)return unit;
    return {...unit,worldId:destination,locationsByWorld:{...unit.locationsByWorld,[state.activeWorldId]:{x:unit.x,y:unit.y}},x:position.x,y:position.y};
  })}});
  return activateWorld(state,worlds,destination,players);
}

export function descendV39Cave(){
  const map=window.__v39FieldRuntime?.mapData,unit=window.getV39SelectedSquadUnit?.();
  const exit=map?.stairsDown||map?.entrances?.[1];
  if(!map?.isUnderground||unit?.x!==exit?.x||unit?.y!==exit?.y)throw new Error("次の階層への入口に移動してください。");
  return enterV39Cave({seed:map.caveSeed,templateId:map.templateId,floor:map.caveFloor+1,parentWorldId:window.getV39GameState().activeWorldId,parentExit:{x:exit.x,y:exit.y}});
}

// 開始画面のテストでも作成直後から通常ゲームのユニットとして登録する。
export function startV39CaveTest(profiles,options={}){
  const state=window.getV39GameState();
  if(!state.players.some(player=>player.factionState.units.length)){
    const units=profiles.map(createCaveCharacter);
    const player=createPlayerRecord({id:"player-1",ready:true,factionState:{units,squads:[{id:"cave-party",label:"探索部隊",unitIds:units.map(unit=>unit.id)}],selectedUnitId:units[0].id,villagePlacementMode:false}});
    window.setV39GameState({players:[player],activePlayerId:player.id},{reason:"cave-test-characters-created"});
  }
  return enterV39Cave(options);
}

function installActions(){
  if(window.__v39BackgroundWorldTurn)return;
  renderPartyOrder();
  const list=document.getElementById("detailTechniqueList");if(!list)return;
  let button=document.getElementById("v39-cave-enter-action");
  if(!button){button=document.createElement("button");button.id="v39-cave-enter-action";button.className="technique-card system-action-card";button.type="button";button.addEventListener("click",()=>{
    try{window.getV39GameState().activeWorldId==="surface"?enterV39Cave():leaveV39Cave();}
    catch(error){window.showV39TurnBanner?.(error.message);}
  });list.appendChild(button);}
  const state=window.getV39GameState(),unit=window.getV39SelectedSquadUnit?.(),map=window.__v39FieldRuntime?.mapData;
  const underground=state.activeWorldId!=="surface";
  const entrance=underground?map?.entrances?.some((tile,index)=>tile.x===unit?.x&&tile.y===unit?.y&&(map.parentWorldId?index===0:!!tile.surfaceEntrance||(!map.entrances.some(entry=>entry.surfaceEntrance)&&index===0))):map?.grid?.[unit?.y]?.[unit?.x]==="洞窟";
  button.hidden=!entrance;
  button.disabled=!!window.isV39MapInputLocked?.();
  button.textContent=underground?(map?.parentWorldId?"前の階層へ":"地上へ戻る"):"洞窟に入る";
  let descend=document.getElementById("v39-cave-descend-action");
  if(!descend){descend=document.createElement("button");descend.id="v39-cave-descend-action";descend.className="technique-card system-action-card";descend.type="button";descend.textContent="次の階層へ";descend.addEventListener("click",()=>{try{descendV39Cave();}catch(error){window.showV39TurnBanner?.(error.message);}});list.appendChild(descend);}
  const stairs=map?.stairsDown||map?.entrances?.[1];
  descend.hidden=!underground||stairs?.x!==unit?.x||stairs?.y!==unit?.y;
  descend.disabled=!!window.isV39MapInputLocked?.();
  renderPartyOrder();
  renderSiteActions();
}

function renderPartyOrder(){
  const list=document.getElementById("squadMemberList");if(!list)return;
  let toolbar=document.getElementById("v39-cave-party-order");
  if(!toolbar){
    toolbar=document.createElement("div");toolbar.id="v39-cave-party-order";toolbar.className="v39-squad-shortcuts";
    for(const [delta,label] of [[-1,"隊列を前へ"],[1,"隊列を後ろへ"]]){
      const button=document.createElement("button");button.type="button";button.textContent=delta<0?"↑":"↓";button.title=label;button.setAttribute("aria-label",label);button.className="v39-footer-shortcut v39-footer-icon-shortcut";button.dataset.tooltip=label;
      button.addEventListener("click",()=>reorderV39CaveParty(delta));toolbar.appendChild(button);
    }
    document.querySelector("#v39-squad-main .v39-squad-shortcuts")?.appendChild(toolbar);
  }
  const state=window.getV39GameState(),actor=window.getV39SelectedSquadUnit?.();
  const squad=state.players.find(player=>player.id===state.activePlayerId)?.factionState.squads.find(row=>row.unitIds?.includes(actor?.id));
  toolbar.hidden=state.activeWorldId==="surface"||!squad;
  const index=squad?.unitIds.indexOf(actor?.id)??-1;
  [...toolbar.children].forEach((button,i)=>{button.disabled=!!window.isV39MapInputLocked?.()||index<0||(i===0?index===0:index===squad.unitIds.length-1);});
}

export function reorderV39CaveParty(delta){
  if(window.isV39MapInputLocked?.()||window.getV39GameState().activeWorldId==="surface")return false;
  const faction=window.getV39ActiveFactionState(),actor=window.getV39SelectedSquadUnit?.();
  const squad=faction.squads.find(row=>row.unitIds?.includes(actor?.id)),index=squad?.unitIds.indexOf(actor?.id),next=index+delta;
  if(!squad||next<0||next>=squad.unitIds.length)return false;
  const order=[...squad.unitIds];[order[index],order[next]]=[order[next],order[index]];
  window.cancelV39SelectedUnitMove?.();window.cancelV39SelectedUnitAttack?.("party-order-changed");
  window.updateV39ActiveFactionState({squads:faction.squads.map(row=>row.id===squad.id?{...row,unitIds:order}:row)});
  window.refreshV39SquadDerivedUI?.();renderPartyOrder();return true;
}

window.startV39CaveTest=startV39CaveTest;
window.enterV39Cave=enterV39Cave;
window.leaveV39Cave=leaveV39Cave;
window.descendV39Cave=descendV39Cave;
window.reorderV39CaveParty=reorderV39CaveParty;
// 他階層は不変の保存済みデータ。現在階層だけ新しいスナップショットにする。
window.captureV39ExplorationWorlds=()=>rememberWorld(window.getV39EnemyTurnState());
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
window.addEventListener("v39:save-loaded",()=>{setTimeout(()=>{installActions();renderSites();},100);});

function renderSites(){
  if(window.__v39BackgroundWorldTurn)return;
  const map=window.__v39FieldRuntime?.mapData,scene=window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0];
  if(!scene||!map?.isUnderground)return;
  scene.v39CaveSites?.destroy(true);
  scene.v39CaveSites=scene.add.container(0,0).setDepth(27);
  const stairs=(map.entrances||[]).map((tile,index)=>({...tile,icon:map.parentWorldId&&index===0?"↑":"↗",remaining:1}));
  if(map.stairsDown)stairs.push({...map.stairsDown,icon:"↓",remaining:1});
  for(const site of [...(map.caveSites||[]),...stairs]){
    if(!window.isV39TileExplored?.(site.x,site.y)&&!window.isV39TileInCurrentVision?.(site.x,site.y))continue;
    site.discovered=true;
    const x=site.x*HEX_TILE_CONFIG.width+(site.y%2?HEX_TILE_CONFIG.oddRowOffsetX:0)+HEX_TILE_CONFIG.width/2,y=site.y*HEX_TILE_CONFIG.rowStep+HEX_TILE_CONFIG.height/2;
    const marker=scene.add.text(x,y,site.icon,{fontSize:`${HEX_TILE_CONFIG.width*.4}px`}).setOrigin(.5).setInteractive();
    marker.setAlpha(site.remaining>0?1:.35);
    marker.on("pointerdown",()=>{window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:{x:site.x,y:site.y,terrain:site.wall?"岩壁":"洞窟"}}));});
    scene.v39CaveSites.add(marker);
  }
  renderSiteActions();
}

function siteGame(state,actor){
  const faction=state.players.find(row=>row.id===state.activePlayerId).factionState;
  const squad=faction.squads.find(row=>row.unitIds?.includes(actor.id));
  const map=window.__v39FieldRuntime.mapData;
  // 仮の複製で処理し、採取・AP・運搬品をまとめて確定する。
  return {map,phase:"player",position:actor,party:clone(faction.units.filter(unit=>(squad?.unitIds||[actor.id]).includes(unit.id)&&isV39UnitInWorld(unit,state.activeWorldId))),sites:clone(map.caveSites),inventory:{鉱石:0,宝石:0},floor:map.caveFloor,turn:state.timeline.turnNumber,log:[]};
}

function renderSiteActions(){
  const list=document.getElementById("detailTechniqueList"),map=window.__v39FieldRuntime?.mapData,actor=window.getV39SelectedSquadUnit?.();
  if(!list)return;
  list.querySelectorAll("[data-v39-cave-site]").forEach(button=>button.remove());
  if(!map?.isUnderground||!actor)return;
  const state=window.getV39GameState(),game=siteGame(state,actor);
  const nearby=new Set(getHexNeighborCoords(map.w,map.h,actor.x,actor.y).map(tile=>tile.key));
  for(const site of map.caveSites||[]){
    if(!site.discovered||!(site.wall?nearby.has(`${site.x},${site.y}`):site.x===actor.x&&site.y===actor.y))continue;
    const button=document.createElement("button");button.type="button";button.className="technique-card system-action-card";button.dataset.v39CaveSite=site.id;
    const reason=caveSiteUnavailable(game,site,game.party.find(unit=>unit.id===actor.id));
    button.textContent=`${site.icon} ${site.wall?`${site.name}を採取` : "休息して回復"} 残り${site.remaining}`;
    button.title=reason;button.disabled=!!reason||isV39UnitWaiting(actor,state.timeline.turnNumber)||!!window.isV39MapInputLocked?.();
    button.addEventListener("click",()=>interactSite(site));list.appendChild(button);
  }
}

function interactSite(site){
  const state=window.getV39GameState(),player=state.players.find(row=>row.id===state.activePlayerId),actor=window.getV39SelectedSquadUnit?.();
  if(!actor||window.isV39MapInputLocked?.()||isV39UnitWaiting(actor,state.timeline.turnNumber))return;
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
  }catch(error){window.showV39TurnBanner?.(error.message);}
}

window.addEventListener("v39:tile-selected",renderSiteActions);
