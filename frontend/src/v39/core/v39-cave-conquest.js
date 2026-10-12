import { V39_CAVE_NEST_BALANCE as rules, V39_CAVE_BALANCE, V39_CAVE_MINE_BALANCE } from "../../lib/v39-gameplay-balance.js";
import { updateV39CaveConquest, advanceV39CaveRecolonization } from "../../lib/v39-cave-conquest-rules.js";
import { inspectV39CaveMine } from "../../lib/v39-cave-mine-rules.js";
import { createV39EventEnemy, getV39EnemySpawnDefinitions } from "../ai/v39-enemy-spawn.js";
import { FOOD_RESOURCE_KEYS, NORMAL_FOOD_RESOURCE_KEYS } from "../../lib/v39-economy-rules.js";
import { resolveV39ConsumableFoodKeys } from "../../lib/v39-population-economy.js";
import { formatV39NestName, nextV39NestSequence, resolveV39NestRadiusForScale } from "../../lib/v39-nest-rules.js";
import { getHexDistance, getHexNeighborCoords } from "../../lib/hex-grid.js";
import { canUnitEnterV39Tile } from "../../lib/v39-terrain-traversal.js";
import { unitCurrentAp } from "../../lib/v39-squad-movement-rules.js";
import { isV39UnitWaiting } from "../../lib/v39-unit-action-rules.js";

const alive = unit => Number(unit?.hp ?? unit?.currentHp ?? 0) > 0;
const key = unit => `${unit.x},${unit.y}`;

function syncConquest(map,state){
  if(!map?.isUnderground||map.caveMine)return null;
  map.caveConquest=updateV39CaveConquest(map,state.enemies,state.timeline.turnNumber);
  return map.caveConquest;
}

export function renderV39CaveConquestChoice(list,state,actor,map,claim){
  const conquest=syncConquest(map,state);
  let panel=document.getElementById("v39-cave-conquest-choice");
  if(!panel){
    panel=document.createElement("div");panel.id="v39-cave-conquest-choice";
    panel.className="system-action-card v39-cave-conquest-choice";panel.setAttribute("role","group");
    const text=document.createElement("span");text.dataset.conquestMessage="";panel.appendChild(text);
    const accept=document.createElement("button");accept.type="button";accept.id="v39-cave-conquest-accept";accept.textContent="鉱床化する";
    accept.addEventListener("click",()=>{try{claim();}catch(error){window.showV39TurnBanner?.(error.message);}});
    const defer=document.createElement("button");defer.type="button";defer.id="v39-cave-conquest-defer";defer.textContent="あとで";
    defer.addEventListener("click",()=>{
      const current=window.getV39GameState(),currentMap=window.__v39FieldRuntime?.mapData;
      if(window.isV39MapInputLocked?.()||current.timeline.phase!=="player"||!currentMap?.caveConquest)return;
      currentMap.caveConquest.deferredByPlayerId={...currentMap.caveConquest.deferredByPlayerId,[current.activePlayerId]:true};
      window.setV39GameState({explorationWorlds:window.captureV39ExplorationWorlds()},{reason:"cave-mine-deferred"});
      window.showV39TurnBanner?.("鉱床化を見送りました。後から行動欄で鉱床化できます");
    });
    panel.append(accept,defer);list.prepend(panel);
  }
  panel.hidden=!conquest?.bossDefeated||!!map.caveMine||!!conquest.deferredByPlayerId?.[state.activePlayerId]||window.__v39BackgroundWorldTurn===true;
  if(panel.hidden)return;
  const inspection=inspectV39CaveMine(map,state.enemies);
  const actorReason=!actor||!alive(actor)?"生存キャラを選択してください"
    :isV39UnitWaiting(actor,state.timeline.turnNumber)?"このターンは待機済みです"
      :unitCurrentAp(actor)<V39_CAVE_MINE_BALANCE.claimApCost?"鉱床化のAPが不足しています":"";
  const reason=inspection.reason||actorReason;
  panel.querySelector("[data-conquest-message]").textContent=`奥地のボスを撃破しました。鉱床化しますか？${reason?` ${reason}`:""}`;
  panel.querySelector("#v39-cave-conquest-accept").disabled=!!reason||window.isV39MapInputLocked?.()||state.timeline.phase!=="player";
  panel.querySelector("#v39-cave-conquest-defer").disabled=window.isV39MapInputLocked?.()||state.timeline.phase!=="player";
}

function arrivalPlan(map,conquest){
  if(conquest.arrivalPlan)return conquest.arrivalPlan;
  let candidates=getV39EnemySpawnDefinitions("洞窟");
  const different=candidates.filter(row=>row.race!==conquest.previousRace);
  if(rules.preferDifferentRace&&different.length)candidates=different;
  if(!candidates.length)return null;
  const definition=candidates[Math.floor(Math.random()*candidates.length)];
  const foodKeys=resolveV39ConsumableFoodKeys(definition.race,FOOD_RESOURCE_KEYS,NORMAL_FOOD_RESOURCE_KEYS);
  const bonus=map.caveTest?(map.caveDifficultyHeight||0)*window.getV39EnemySpawnRules().terrainLevelStep
    :Math.max(0,map.caveFloor-1)*V39_CAVE_BALANCE.floorLevelStep;
  const level=Math.min(V39_CAVE_BALANCE.adventureEnemyLevelCap,definition.maxLevel+bonus);
  return {race:definition.race,className:definition.className,name:definition.name,image:definition.row.画像,
    definitionId:definition.definitionId,level,bossLevel:Math.min(V39_CAVE_BALANCE.adventureEnemyLevelCap,level+V39_CAVE_BALANCE.bossLevelBonus),
    settlerCount:Math.max(1,Math.floor(rules.requiredSameRaceUnits)),requiresFood:foodKeys.length>0,
    foodResource:foodKeys[0]||"",foodAmount:Math.max(0,Number(rules.arrivalFoodAmount)||0)};
}

function spawnNest(map,state,plan,turnNumber){
  const generation=(map.caveConquest.generation||0)+1,nestId=`${map.id}-recolonized-${generation}`;
  const template=createV39EventEnemy({id:`${nestId}-probe`,race:plan.race,className:plan.className,level:plan.level,x:0,y:0});
  if(!template)return null;
  const occupied=new Set([...state.enemies,...state.players.flatMap(player=>player.factionState.units)].filter(alive).map(key));
  if(map.caveEventNpc)occupied.add(key(map.caveEventNpc));
  const safe=tile=>!map.entrances.some(entry=>getHexDistance(tile,entry)<=V39_CAVE_BALANCE.entranceSafeDistance);
  const candidates=map.grid.flatMap((row,y)=>row.flatMap((terrain,x)=>terrain==="洞窟"?[{x,y}]:[]))
    .filter(tile=>safe(tile)&&!occupied.has(key(tile))&&canUnitEnterV39Tile(map,tile.x,tile.y,template));
  const allowed=new Set(candidates.map(key));
  // 同種族の小集団を接続した床へ配置。入口安全距離とNPC、既存生存者を避ける。
  let positions=[];
  for(const center of candidates){
    const queue=[center],seen=new Set([key(center)]);
    for(let cursor=0;cursor<queue.length&&queue.length<plan.settlerCount+1;cursor++){
      for(const next of getHexNeighborCoords(map.w,map.h,queue[cursor].x,queue[cursor].y)){
        if(!allowed.has(key(next))||seen.has(key(next)))continue;
        seen.add(key(next));queue.push(next);
        if(queue.length>=plan.settlerCount+1)break;
      }
    }
    if(queue.length>=plan.settlerCount+1){positions=queue.slice(0,plan.settlerCount+1);break;}
  }
  if(!positions.length)return null;
  const center=positions.at(-1),radius=resolveV39NestRadiusForScale(1),squadId=`enemy-squad-${nestId}`;
  const units=positions.map((position,index)=>{
    const boss=index===positions.length-1;
    const enemy=createV39EventEnemy({id:`${nestId}-${boss?"boss":index}`,name:`${plan.name}${boss?"（ボス）":""}`,
      race:plan.race,className:plan.className,level:boss?plan.bossLevel:plan.level,...position,
      metadata:{image:plan.image,spawnTerrain:"洞窟",sourceDefinitionId:plan.definitionId,spawnType:"洞窟再巣化",aggressive:true,enemySquadId:squadId}});
    return enemy?{...enemy,worldId:state.activeWorldId,isCaveBoss:boss,nestId,nestType:plan.race,
      territoryCenterX:center.x,territoryCenterY:center.y,territoryRadius:radius}:null;
  });
  if(units.some(unit=>!unit))return null;
  const population=Math.max(0,Math.floor(rules.initialNestPopulation));
  const nest={id:nestId,name:formatV39NestName(plan.race,nextV39NestSequence(state.enemyNests,plan.race)),race:plan.race,
    nestType:plan.race,...center,territoryRadius:radius,scaleLevel:1,population,populationByRace:{[plan.race]:population},
    foodStockByType:plan.foodResource?{[plan.foodResource]:plan.foodAmount}:{},materialStockByType:{},equipmentInventory:[],
    unitIds:units.map(unit=>unit.id),squadId,sourceDefinitionId:plan.definitionId,economyInitialized:true,createdAtTurn:turnNumber};
  return {units,nest,squad:{id:squadId,nestId,unitIds:nest.unitIds,cargo:{resourcesByType:{},equipmentInventory:[]}},generation};
}

export function advanceV39CaveConquest(turnNumber){
  const map=window.__v39FieldRuntime?.mapData,state=window.getV39GameState();
  const conquest=syncConquest(map,state);
  if(!conquest?.bossDefeated||map.caveMine||!rules.recolonizeUnclaimed||conquest.lastProcessedTurn>=turnNumber)return;
  // 背景ワールドではユニット一覧がその世界へ投影済み。表示世界ではworldIdを照合する。
  const playerPresent=state.players.some(player=>player.isPlayer!==false&&player.factionState.units.some(unit=>alive(unit)&&(unit.worldId||"surface")===state.activeWorldId));
  const plan=conquest.arrivalPlan||(!playerPresent?arrivalPlan(map,conquest):null);
  const next=advanceV39CaveRecolonization(conquest,turnNumber,{playerPresent,plan,hasEnemies:state.enemies.some(alive)});
  map.caveConquest={...next,arrivalPlan:plan};
  if(!next.ready)return;
  const spawned=spawnNest(map,state,plan,turnNumber);
  if(!spawned)return;
  map.caveBossIds=spawned.units.filter(unit=>unit.isCaveBoss).map(unit=>unit.id);
  map.caveBossRace=plan.race;
  map.caveConquest={generation:spawned.generation,bossDefeated:false,progressTurns:0,lastProcessedTurn:turnNumber,
    activeNestId:spawned.nest.id,deferredByPlayerId:{}};
  window.setV39GameState({enemies:[...state.enemies,...spawned.units],
    enemyNests:[...state.enemyNests.filter(nest=>nest.id!==conquest.activeNestId),spawned.nest],
    enemySquads:[...state.enemySquads.filter(squad=>squad.nestId!==conquest.activeNestId),spawned.squad]},{reason:"cave-recolonized"});
  // 未発見・非表示の奥地情報を通常プレイへ通知しない。
  if(!window.__v39BackgroundWorldTurn){
    window.refreshV39MapEntities?.();
    if(window.isV39TestMode?.()||window.isV39TileInCurrentVision?.(spawned.nest.x,spawned.nest.y)){
      window.showV39TurnBanner?.(`${spawned.nest.name}が成立し、新しいボスが出現しました`);
    }
  }
}
