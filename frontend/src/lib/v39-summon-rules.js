import {getGameDataRows} from "./game-data-registry.js";
import {buildV39UnitEntity,buildV39ClassEquipment} from "./v39-unit-creation-rules.js";
import {getV39UnitTestTechniques} from "./v39-test-skill-rules.js";
import {getHexNeighborCoords} from "./hex-grid.js";
import {canUnitEnterV39Tile} from "./v39-terrain-traversal.js";
import {v39WallStepHeight} from "./v39-defense-rules.js";
import {parseV39TurnCount,resolveV39SkillCooldownTurns} from "./v39-turn-timing.js";
import {V39_SUMMON_BALANCE} from "./v39-gameplay-balance.js";
const n=value=>Math.max(0,Number(value)||0),key=unit=>`${unit.x},${unit.y}`;
export function parseV39SummonEffect(row) {
  const effect=String(row?.効果 || '');
  if(!effect.startsWith('召喚_'))return null;
  const tokens=effect.split('_'),target=tokens[1];let level=null,members=0,count=1;
  const seen=new Set();
  for(const token of tokens.slice(2)) {
    const match=token.match(/^(Lv|軍隊|数)(\d+)$/);
    if(!match||seen.has(match[1])||!Number.isSafeInteger(Number(match[2]))||Number(match[2])<1)return null;
    seen.add(match[1]);const value=Number(match[2]);
    if(match[1]==='Lv')level=value;else if(match[1]==='軍隊')members=value;else count=value;
  }
  if(!target||level===null||level>V39_SUMMON_BALANCE.maximumLevel)return null;
  return {target,level,members,count};
}
export function getV39SummonEntries(unit) {
  const rows=[...(unit?.techniques || []),...getV39UnitTestTechniques(unit)].map(item=>item.source || item);
  const unique=new Map();
  for(const row of rows)if(String(row.行動).toUpperCase()==='A'&&String(row.効果 || '').startsWith('召喚_'))unique.set(row.名前,row);
  return [...unique.values()].map(row=>({row,spec:parseV39SummonEffect(row)}));
}
export function buildV39SummonPreview(entry) {
  if(!entry?.spec)return null;
  const {target,level,members}=entry.spec,row=getGameDataRows('クラス').find(row=>row.名前===target);
  if(!row)return null;
  const combatProfile=members?{mode:'army',memberCount:members,populationCost:members,
    hpMultiplier:1+(members-1)*V39_SUMMON_BALANCE.hpPerExtraMember,attackCount:members,simpleActionsOnly:true}:null;
  const unit=buildV39UnitEntity({id:'summon-preview',name:target,race:target,className:target,level,
    unitType:members?'軍隊ユニット':'召喚ユニット',isMob:members>0,isNamed:false,combatProfile,equipment:buildV39ClassEquipment(row)});
  return unit.derivedCharacter?.ok?unit:null;
}
function placements(state,map,caster,preview) {
  const world=state.activeWorldId || 'surface';
  const occupied=new Set([...(state.players || []).flatMap(player=>player.factionState.units || []).filter(unit=>(unit.worldId || 'surface')===world),
    ...(state.enemies || []),...(state.neutralVillages || []).flatMap(village=>village.defenseUnits || [])]
    .filter(unit=>n(unit.hp ?? unit.currentHp)>0).map(key));
  if(map.caveEventNpc)occupied.add(key(map.caveEventNpc));
  return getHexNeighborCoords(map.w,map.h,caster.x,caster.y,map.worldWrapEnabled===true)
    .filter(tile=>!occupied.has(tile.key)&&canUnitEnterV39Tile(map,tile.x,tile.y,preview)
      &&!v39WallStepHeight(map,caster,tile));
}
export function inspectV39Summon(state,playerId,unitId,skillName,map) {
  const player=state.players.find(row=>row.id===playerId),caster=player?.factionState.units.find(row=>row.id===unitId);
  const entry=getV39SummonEntries(caster).find(entry=>entry.row.名前===skillName),preview=buildV39SummonPreview(entry),reasons=[];
  const turn=n(state.timeline?.turnNumber),cost=n(entry?.row.AP消費),hpCost=n(entry?.row.HP消費),duration=parseV39TurnCount(entry?.row.効果時間);
  if(!caster||playerId!==state.activePlayerId||state.timeline.phase!=='player'||n(caster.hp ?? caster.currentHp)<=0
    ||(caster.worldId || 'surface')!==(state.activeWorldId || 'surface'))reasons.push('操作中の生存ユニットが必要');
  if(caster?.waitTurnNumber===turn)reasons.push('待機済みです');
  if(!entry?.spec||!preview)reasons.push('召喚対象または書式が不正');
  if(duration<1)reasons.push('効果時間の設定が必要');
  if(n(caster?.ap ?? caster?.currentAp)<cost)reasons.push('AP不足');
  if(n(caster?.hp ?? caster?.currentHp)<=hpCost)reasons.push('HP不足');
  const runtime=player?.factionState.combatRuntime || {};
  if(runtime.pendingActionsByUnitId?.[unitId])reasons.push('別の行動を発動待機中');
  if(n(runtime.cooldownsByUnitId?.[unitId]?.[skillName])>turn)reasons.push('使用済みまたはCT中');
  const tiles=map&&caster&&preview?placements(state,map,caster,preview):[];
  if(entry?.spec&&tiles.length<entry.spec.count)reasons.push(`隣接する配置可能マスが${entry.spec.count}マス必要`);
  return {available:!reasons.length,reasons,caster,entry,preview,cost,hpCost,duration,tiles};
}
export function summonV39Units(state,playerId,unitId,skillName,map) {
  const check=inspectV39Summon(state,playerId,unitId,skillName,map);
  if(!check.available)return {ok:false,state,reason:check.reasons.join(' / ')};
  const turn=state.timeline.turnNumber,player=state.players.find(row=>row.id===playerId),faction=player.factionState;
  const serial=n(faction.summonSerial)+1,created=[];
  for(let i=0;i<check.entry.spec.count;i++) {
    const tile=check.tiles[i],id=`summon-${playerId}-${turn}-${serial}-${i}`;
    created.push({...check.preview,id,name:`${check.entry.spec.target}${check.entry.spec.members?'軍':''}（召喚）`,
      x:tile.x,y:tile.y,position:[tile.x,tile.y],worldId:state.activeWorldId || 'surface',squadId:'solo',
      summon:{casterId:unitId,skillName,createdTurn:turn,expiresAtTurn:turn+check.duration}});
  }
  const runtime=faction.combatRuntime || {},hp=n(check.caster.hp ?? check.caster.currentHp)-check.hpCost,ap=n(check.caster.ap ?? check.caster.currentAp)-check.cost;
  const next={...faction,summonSerial:serial,units:[...faction.units.map(unit=>unit.id===unitId?{...unit,hp,currentHp:hp,ap,currentAp:ap,actionPoint:ap,lastActionTurn:turn,lastUsedAttack:skillName}:unit),...created],
    combatRuntime:{...runtime,cooldownsByUnitId:{...runtime.cooldownsByUnitId,[unitId]:{...runtime.cooldownsByUnitId?.[unitId],[skillName]:turn+resolveV39SkillCooldownTurns(check.entry.row)}}}};
  return {ok:true,state:{...state,players:state.players.map(row=>row.id===playerId?{...row,factionState:next}:row)},created,
    message:`${check.entry.spec.target}を${created.length}ユニット召喚しました`};
}
export function expireV39Summons(state,turn) {
  const removed=[];const players=state.players.map(player=>{
    const dead=player.factionState.units.filter(unit=>unit.summon&&(unit.summon.expiresAtTurn<=turn||n(unit.hp ?? unit.currentHp)<=0));
    if(!dead.length)return player;
    removed.push(...dead);const ids=new Set(dead.map(unit=>unit.id));
    const units=player.factionState.units.filter(unit=>!ids.has(unit.id));
    return {...player,factionState:{...player.factionState,units,selectedUnitId:ids.has(player.factionState.selectedUnitId)?units.find(unit=>(unit.worldId || 'surface')===(state.activeWorldId || 'surface'))?.id || '':player.factionState.selectedUnitId,
      squads:player.factionState.squads.map(squad=>({...squad,unitIds:squad.unitIds.filter(id=>!ids.has(id))})),
      combatRuntime:{...player.factionState.combatRuntime,pendingActionsByUnitId:Object.fromEntries(Object.entries(player.factionState.combatRuntime?.pendingActionsByUnitId || {}).filter(([id])=>!ids.has(id)))}}};
  });
  return {state:removed.length?{...state,players}:state,removed};
}
