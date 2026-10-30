import balance from '../../../config/v39-teleport.json';
import {getHexDistance,getHexNeighborCoords} from './hex-grid.js';
import {getFactionSettlements} from './settlement-state.js';
import {resolveAttackApCost,resolveAttackRange} from './v39-combat-engine.js';
import {getV39UnitTestTechniques} from './v39-test-skill-rules.js';
import {canUnitEnterV39Tile} from './v39-terrain-traversal.js';
import {isV39UnitWaiting} from './v39-unit-action-rules.js';
import {resolveV39SkillCooldownTurns,parseV39TurnCount} from './v39-turn-timing.js';
import {canV39FactionAttack} from './v39-diplomacy-rules.js';
import {isV39VillageHostileToPlayer} from './v39-village-hostility.js';
import {collectV39FactionVision} from './v39-faction-intelligence-rules.js';
import {resolveDetectionStealthValue} from './v39-detection-rules.js';
import {inspectV39StatusResistance,resolveV39StatusResistance} from './v39-status-resistance.js';

const world=u=>u?.worldId||'surface';
const alive=u=>u&&Number(u.hp??u.currentHp)>0&&u.state!=='死亡';
const pos=u=>`${u.x},${u.y}`;
const terrain=(map,tile)=>map?.grid?.[tile?.y]?.[tile?.x];
export function parseV39TeleportEffect(row){
  const match=String(row?.効果||'').match(/^転移(?:_([^_\s/]+))?$/);
  return match?{terrain:match[1]||null}:null;
}
export function getV39TeleportEntries(unit){
  const rows=[...(unit?.techniques||[]),...getV39UnitTestTechniques(unit)].map(row=>row.source||row);
  return [...new Map(rows.filter(row=>row.行動==='A'&&parseV39TeleportEffect(row)).map(row=>[row.名前,{row,spec:parseV39TeleportEffect(row)}])).values()];
}
export const isV39ForcedTeleport=row=>String(row?.対象||'').trim()==='相手';
export const v39TeleportCastTurns=row=>parseV39TurnCount(row?.待機,balance.castTurns);
export const v39TeleportGateDuration=row=>parseV39TurnCount(row?.効果時間);
export function getV39TeleportVictims(state,playerId,map){
  if(!map?.grid)return [];
  const worldId=state.activeWorldId||'surface';
  const projected={...state,players:state.players.map(p=>({...p,factionState:{...p.factionState,
    units:(p.factionState?.units||[]).filter(u=>world(u)===worldId),village:worldId==='surface'?p.factionState?.village:null,
    settlements:getFactionSettlements(p.factionState).filter(s=>world(s)===worldId)}}))};
  const vision=collectV39FactionVision(projected,playerId,map);
  const visible=u=>alive(u)&&world(u)===worldId&&vision.visible.has(pos(u))
    &&Number(vision.detectionByTile.get(pos(u)))>=resolveDetectionStealthValue(u,{mapData:map,turnNumber:state.timeline?.turnNumber});
  return [
    ...(state.enemies||[]).map(unit=>({unit,kind:'enemy'})),
    ...(state.players||[]).filter(p=>p.id!==playerId&&canV39FactionAttack(state,playerId,p.id)).flatMap(p=>(p.factionState?.units||[]).map(unit=>({unit,kind:'player',playerId:p.id}))),
    ...(state.neutralVillages||[]).filter(v=>isV39VillageHostileToPlayer(v,playerId)).flatMap(v=>(v.defenseUnits||[]).map(unit=>({unit,kind:'village',villageId:v.id})))
  ].filter(record=>visible(record.unit));
}
export function getV39TeleportTargets(state,playerId,unitId){
  const faction=state.players?.find(p=>p.id===playerId)?.factionState;
  const unit=faction?.units?.find(u=>u.id===unitId);
  return [
    ...getFactionSettlements(faction).filter(s=>s.placed).map(s=>({id:`base:${s.settlementId}`,name:s.name||'自拠点',worldId:world(s),x:s.x,y:s.y,base:true})),
    ...(unit?.teleportLocations||[]).map(t=>({...t,base:false}))
  ];
}
function owner(state,playerId,unitId){
  const player=state.players?.find(p=>p.id===playerId);
  return {player,unit:player?.factionState?.units?.find(u=>u.id===unitId)};
}
function controllable(state,playerId,unit){
  return state.activePlayerId===playerId&&state.timeline?.phase==='player'&&alive(unit)
    &&Number.isInteger(unit.x)&&Number.isInteger(unit.y)&&unit.x>=0&&unit.y>=0
    &&world(unit)===(state.activeWorldId||'surface')&&!unit.pendingWorldExit;
}
export function registerV39TeleportLocation(state,playerId,unitId,name='登録地点',remove=false){
  const {player,unit}=owner(state,playerId,unitId);
  if(!controllable(state,playerId,unit)||!getV39TeleportEntries(unit).length)return {ok:false,state,reason:'操作中の転移スキル所持者が必要です'};
  const locations=remove?[]:[{id:'memory:1',name:String(name||'登録地点').trim().slice(0,40),worldId:world(unit),x:unit.x,y:unit.y}];
  return {ok:true,state:{...state,players:state.players.map(p=>p!==player?p:{...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>u.id===unitId?{...u,teleportLocations:locations.slice(0,balance.registeredLocations)}:u)}})}};
}
function distance(map,from,to){
  if(!map?.grid||!from||!to)return Infinity;
  const offsets=map?.worldWrapEnabled===true?[-1,0,1]:[0];
  return Math.min(...offsets.flatMap(dx=>offsets.map(dy=>getHexDistance(from,{x:to.x+dx*map.w,y:to.y+dy*map.h}))));
}
function party(faction,caster,mode){
  if(mode!=='squad')return [caster].filter(Boolean);
  const squad=(faction?.squads||[]).find(s=>!['solo','単独'].includes(s.id)&&(s.unitIds||[]).includes(caster?.id));
  return squad?(squad.unitIds||[]).map(id=>faction.units.find(u=>u.id===id)).filter(alive):[caster].filter(Boolean);
}
function placements(state,map,target,units,worldId,requiredTerrain,from,range){
  const ignored=new Set(units.map(u=>u.id));
  const spatial=worldId===(state.activeWorldId||'surface')?state:state.explorationWorlds?.[worldId]?.spatial||{};
  const occupied=new Set([...(state.players||[]).flatMap(p=>p.factionState?.units||[]),...(spatial.enemies||[]).map(u=>({...u,worldId:u.worldId||worldId})),...(spatial.neutralVillages||[]).flatMap(v=>v.defenseUnits||[]).map(u=>({...u,worldId:u.worldId||worldId}))]
    .filter(u=>alive(u)&&world(u)===worldId&&!ignored.has(u.id)).map(pos));
  if(map?.caveEventNpc)occupied.add(pos(map.caveEventNpc));
  const tiles=[{x:target.x,y:target.y,key:pos(target)}],seen=new Set([pos(target)]);
  for(let i=0;i<tiles.length;i++){
    if(distance(map,target,tiles[i])>=balance.arrivalRadius)continue;
    for(const t of getHexNeighborCoords(map.w,map.h,tiles[i].x,tiles[i].y,map.worldWrapEnabled===true))if(!seen.has(t.key)){seen.add(t.key);tiles.push(t);}
  }
  const walls=new Set((map.defenseStructures||[]).filter(w=>w.kind==='壁'&&w.hp>0&&!w.edge).flatMap(w=>w.tiles||[]).map(pos));
  const options=units.map(u=>tiles.filter(t=>!occupied.has(pos(t))&&!walls.has(pos(t))&&distance(map,from,t)<=range&&terrain(map,t)&&(!requiredTerrain||terrain(map,t)===requiredTerrain)&&canUnitEnterV39Tile(map,t.x,t.y,u)));
  // Assign scarce terrain-compatible slots first; never stack the arriving party.
  const order=units.map((u,i)=>i).sort((a,b)=>options[a].length-options[b].length),assigned=new Map();
  function assign(n,used){
    if(n===order.length)return true;
    const i=order[n];for(const t of options[i])if(!used.has(pos(t))){assigned.set(units[i].id,t);if(assign(n+1,new Set([...used,pos(t)])))return true;}
    return false;
  }
  return assign(0,new Set())?assigned:null;
}
export function inspectV39Teleport(state,playerId,unitId,skillName,targetId,map,mode='self',{resolving=false,targetUnitId=''}={}){
  const {player,unit}=owner(state,playerId,unitId),reasons=[];
  const entry=getV39TeleportEntries(unit).find(e=>e.row.名前===skillName);
  const target=getV39TeleportTargets(state,playerId,unitId).find(t=>t.id===targetId);
  const forced=isV39ForcedTeleport(entry?.row),duration=v39TeleportGateDuration(entry?.row);
  const victim=mode==='other'?getV39TeleportVictims(state,playerId,map).find(r=>r.unit.id===targetUnitId):null;
  const members=mode==='other'?[victim?.unit].filter(Boolean):party(player?.factionState,unit,mode),turn=Number(state.timeline?.turnNumber)||1;
  const range=entry?resolveAttackRange(entry.row,unit,map):0,cost=entry?resolveAttackApCost(entry.row,unit):0;
  if(!alive(unit)||(!resolving&&!controllable(state,playerId,unit)))reasons.push('操作中の生存ユニットが必要です');
  if(!entry||!target)reasons.push('スキルまたは転移先を選択してください');
  if(entry?.row.条件&&entry.row.条件!==entry.spec.terrain)reasons.push('未対応の転移条件があります');
  if(forced!==(mode==='other'))reasons.push(forced?'相手を選択してください':'このスキルは自身・部隊用です');
  if(mode==='other'&&!victim)reasons.push('発見済みの敵対対象を選択してください');
  if(forced&&duration>0)reasons.push('相手への強制転移と持続する門は併用できません');
  if(!resolving&&(unit?.pendingTeleport||isV39UnitWaiting(unit,turn)||(mode!=='other'&&members.some(u=>isV39UnitWaiting(u,turn)))))reasons.push('待機・転移準備中です');
  if(!resolving&&Number(unit?.ap??unit?.currentAp)<cost)reasons.push(`AP${cost}が必要です`);
  if(Number(unit?.hp??unit?.currentHp)<=Number(entry?.row.HP消費||0))reasons.push('HPが不足しています');
  const cooldown=player?.factionState?.combatRuntime?.cooldownsByUnitId?.[unitId]?.[skillName];
  if(!resolving&&Number(cooldown)>turn)reasons.push('クールタイム中です');
  if(target&&world(unit)!==world(target))reasons.push('別マップへは転移できません');
  if(target&&distance(map,unit,target)>range)reasons.push('射程外');
  if(victim&&distance(map,unit,victim.unit)>range)reasons.push('相手が射程外です');
  if(duration>0&&target&&pos(target)===pos(unit))reasons.push('出入口が同じ地点です');
  if(entry?.spec.terrain&&members.some(u=>terrain(map,u)!==entry.spec.terrain))reasons.push(`出発地は${entry.spec.terrain}が必要です`);
  if(target&&entry?.spec.terrain&&terrain(map,target)!==entry.spec.terrain)reasons.push(`転移先は${entry.spec.terrain}が必要です`);
  if(mode!=='other'&&members.some(u=>world(u)!==world(unit)||distance(map,unit,u)>balance.gatherRadius||u.pendingWorldExit||(!resolving&&u.pendingTeleport)))reasons.push('部隊全員を同じマップの周囲1マスに集合させてください');
  const tiles=target&&map?.grid&&members.length?placements(state,map,target,members,world(unit),entry?.spec.terrain,unit,range):null;
  if(!duration&&target&&!tiles)reasons.push('転移先に全員が入れる空きマスがありません');
  if(tiles&&entry?.spec.terrain&&[...tiles.values()].some(t=>terrain(map,t)!==entry.spec.terrain))reasons.push(`到着マスも${entry.spec.terrain}が必要です`);
  if(forced&&Number(entry?.row.魔法||0)<=0)reasons.push('強制転移にはスキルの魔法値が必要です');
  const resistance=victim&&entry?inspectV39StatusResistance({attacker:unit,target:victim.unit,skillRow:entry.row,mapData:map}):null;
  return {available:!reasons.length,reasons,unit,entry,target,members,tiles,range,cost,victim,resistance,duration};
}
export function beginV39Teleport(state,playerId,unitId,skillName,targetId,map,mode='self',targetUnitId='',random=Math.random){
  const check=inspectV39Teleport(state,playerId,unitId,skillName,targetId,map,mode,{targetUnitId});
  if(!check.available)return {ok:false,state,reason:check.reasons.join(' / ')};
  const turn=Number(state.timeline.turnNumber),ids=check.members.map(u=>u.id);
  const pending={skillName,targetId,target:{...check.target},mode,targetUnitId,unitIds:ids,worldId:world(check.unit),x:check.unit.x,y:check.unit.y,readyTurn:turn+v39TeleportCastTurns(check.entry.row)};
  const players=state.players.map(p=>p.id!==playerId?p:{...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>u.id!==unitId&&!ids.includes(u.id)?u:{...u,
    ...(v39TeleportCastTurns(check.entry.row)>0?{waitTurnNumber:turn}:{}),lastActionTurn:turn,...(u.id===unitId?{ap:Math.max(0,Number(u.ap??u.currentAp)-check.cost),currentAp:Math.max(0,Number(u.ap??u.currentAp)-check.cost),actionPoint:Math.max(0,Number(u.ap??u.currentAp)-check.cost),hp:Number(u.hp??u.currentHp)-Number(check.entry.row.HP消費||0),currentHp:Number(u.hp??u.currentHp)-Number(check.entry.row.HP消費||0),pendingTeleport:pending}:{})}),combatRuntime:{...p.factionState.combatRuntime,cooldownsByUnitId:{...p.factionState.combatRuntime?.cooldownsByUnitId,[unitId]:{...p.factionState.combatRuntime?.cooldownsByUnitId?.[unitId],[skillName]:turn+resolveV39SkillCooldownTurns(check.entry.row)}}}}});
  const next={...state,players};
  return {ok:true,state:pending.readyTurn<=turn?advanceV39Teleports(next,turn,map,random):next};
}
export function advanceV39Teleports(state,nextTurn,activeMap,random=Math.random){
  let current={...state,teleportGates:(state.teleportGates||[]).filter(g=>g.expiresAtTurn>nextTurn)};
  for(const gate of state.teleportGates||[])if(gate.expiresAtTurn<=nextTurn)current=appendTeleportLog(current,gate.ownerPlayerId,nextTurn,`転移門「${gate.skillName}」が消滅しました`);
  for(const originalPlayer of state.players||[])for(const original of originalPlayer.factionState?.units||[]){
    const pending=original.pendingTeleport;if(!pending||pending.readyTurn>nextTurn)continue;
    const {player,unit}=owner(current,originalPlayer.id,original.id);
    const map=world(unit)===(current.activeWorldId||'surface')?activeMap:current.explorationWorlds?.[world(unit)]?.map;
    const background=world(unit)!==(current.activeWorldId||'surface');
    const spatial=background?current.explorationWorlds?.[world(unit)]?.spatial||{}:current;
    const scoped=background?{...current,...spatial,activeWorldId:world(unit)}:current;
    const check=inspectV39Teleport(scoped,player.id,unit.id,pending.skillName,pending.targetId,map,pending.mode,{resolving:true,targetUnitId:pending.targetUnitId});
    const changedParty=check.members.length!==pending.unitIds.length||check.members.some(u=>!pending.unitIds.includes(u.id));
    const moved=world(unit)!==pending.worldId||unit.x!==pending.x||unit.y!==pending.y;
    const changedTarget=!check.target||world(check.target)!==world(pending.target)||pos(check.target)!==pos(pending.target);
    let reason=pending.interrupted?'被ダメージで中断':moved?'移動したため中断':changedParty?'対象・部隊編成が変わったため中断':changedTarget?'転移先が変更されたため中断':!map?'マップがありません':check.reasons.join(' / ');
    let resistance=null;
    if(!reason&&check.victim){resistance=resolveV39StatusResistance({attacker:unit,target:check.victim.unit,skillRow:check.entry.row,mapData:map,random});if(resistance.resisted)reason='相手が抵抗に成功しました';}
    const gate=!reason&&check.duration>0?{id:`gate:${player.id}:${unit.id}:${encodeURIComponent(pending.skillName)}:${nextTurn}`,ownerPlayerId:player.id,casterId:unit.id,skillName:pending.skillName,worldId:world(unit),a:{x:pending.x,y:pending.y},b:{x:check.target.x,y:check.target.y},terrain:check.entry.spec.terrain,expiresAtTurn:nextTurn+check.duration}:null;
    const message=reason?`${unit.name||unit.id}の転移失敗: ${reason}`:gate?`${check.target.name}へつながる転移門を開きました（${check.duration}T）`:`${check.victim?.unit.name||unit.name||unit.id}が${check.target.name}へ転移しました`;
    const move=u=>{
      const t=!reason&&!gate&&check.tiles?.get(u.id);
      return {...u,...(u.id===unit.id?{pendingTeleport:null}:{}),...(t?movedUnit(u,t,nextTurn):{})};
    };
    const nextSpatial={enemies:(spatial.enemies||[]).map(move),neutralVillages:(spatial.neutralVillages||[]).map(v=>({...v,defenseUnits:(v.defenseUnits||[]).map(move)}))};
    current={...current,players:current.players.map(p=>({...p,factionState:{...p.factionState,units:p.factionState.units.map(move)}})),
      ...(background?{explorationWorlds:{...current.explorationWorlds,[world(unit)]:{...current.explorationWorlds[world(unit)],spatial:{...spatial,...nextSpatial}}}}:nextSpatial),
      ...(gate?{teleportGates:[...current.teleportGates,gate]}:{})};
    current=appendTeleportLog(current,player.id,nextTurn,message,resistance);
    if(check.victim?.playerId)current=appendTeleportLog(current,check.victim.playerId,nextTurn,message,resistance);
  }
  return current;
}
function movedUnit(unit,tile,turn){
  return {x:tile.x,y:tile.y,position:[tile.x,tile.y],locationsByWorld:{...unit.locationsByWorld,[world(unit)]:{x:tile.x,y:tile.y}},lastMovedTurn:turn,moveCommand:null};
}
function appendTeleportLog(state,playerId,turn,message,detail=null){
  return {...state,players:state.players.map(p=>p.id!==playerId?p:{...p,factionState:{...p.factionState,activityLog:[...(p.factionState.activityLog||[]),{id:`teleport:${turn}:${p.id}:${(p.factionState.activityLog||[]).length}`,turn,category:'転移',message,detail}].slice(-200)}})};
}
export function getV39TeleportGates(state,worldId=state.activeWorldId,turn=state.timeline?.turnNumber){
  return (state.teleportGates||[]).filter(g=>g?.a&&g?.b&&[g.a.x,g.a.y,g.b.x,g.b.y].every(Number.isInteger)&&g.worldId===worldId&&g.expiresAtTurn>Number(turn||1));
}
export function inspectV39TeleportGateUse(state,playerId,unitId,gateId,map,mode='self'){
  const {player,unit}=owner(state,playerId,unitId),gate=getV39TeleportGates(state).find(g=>g.id===gateId),reasons=[];
  const members=party(player?.factionState,unit,mode),turn=state.timeline?.turnNumber;
  const from=gate&&unit?(pos(unit)===pos(gate.a)?gate.a:pos(unit)===pos(gate.b)?gate.b:null):null;
  const target=from===gate?.a?gate?.b:gate?.a;
  if(!controllable(state,playerId,unit))reasons.push('操作中の生存ユニットが必要です');
  if(!gate||!from)reasons.push('転移門のマスへ移動してください');
  if(members.some(u=>isV39UnitWaiting(u,turn)||u.pendingTeleport||u.pendingWorldExit||Number(u.ap??u.currentAp)<balance.gateUseAp))reasons.push(`全員にAP${balance.gateUseAp}が必要です（待機・準備中は利用不可）`);
  if(members.some(u=>world(u)!==world(unit)||distance(map,unit,u)>balance.gatherRadius))reasons.push('部隊を門の周囲へ集合させてください');
  if(gate?.terrain&&members.some(u=>terrain(map,u)!==gate.terrain))reasons.push(`出発地は${gate.terrain}が必要です`);
  const tiles=gate&&from&&map?.grid?placements(state,map,target,members,gate.worldId,gate.terrain,from,Infinity):null;
  if(from&&!tiles)reasons.push('出口付近に全員が入れる空きマスがありません');
  return {available:!reasons.length,reasons,unit,members,gate,tiles,target,cost:balance.gateUseAp};
}
export function useV39TeleportGate(state,playerId,unitId,gateId,map,mode='self'){
  const check=inspectV39TeleportGateUse(state,playerId,unitId,gateId,map,mode);
  if(!check.available)return {ok:false,state,reason:check.reasons.join(' / ')};
  const turn=state.timeline.turnNumber;
  const players=state.players.map(p=>p.id!==playerId?p:{...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>{
    const tile=check.tiles.get(u.id);if(!tile)return u;
    const ap=Number(u.ap??u.currentAp)-check.cost;
    return {...u,...movedUnit(u,tile,turn),ap,currentAp:ap,actionPoint:ap,lastActionTurn:turn};
  })}});
  return {ok:true,state:appendTeleportLog({...state,players},playerId,turn,`${check.members.length}体が転移門を通りました（各AP${check.cost}）`)};
}
