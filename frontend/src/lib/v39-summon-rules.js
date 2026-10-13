import {getGameDataRows} from "./game-data-registry.js";
import {buildV39UnitEntity,buildV39ClassEquipment} from "./v39-unit-creation-rules.js";
import {getV39UnitTestTechniques} from "./v39-test-skill-rules.js";
import {getHexNeighborCoords} from "./hex-grid.js";
import {canUnitEnterV39Tile} from "./v39-terrain-traversal.js";
import {v39WallStepHeight} from "./v39-defense-rules.js";
import {parseV39TurnCount,resolveV39SkillCooldownTurns} from "./v39-turn-timing.js";
import {V39_SUMMON_BALANCE} from "./v39-gameplay-balance.js";
import {getV39EditableSquads} from './v39-squad-edit-rules.js';
import {mergeV39Cargo} from './v39-logistics-state.js';
import initialEquipment from '../../../config/v39-summon-equipment.json';
import {createV39EquipmentEntry} from './v39-equipment-rules.js';
import {applyV39DerivedCharacterData} from '../v39/unit/v39-character-derived-rules.js';
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
  // 上位種に基礎能力列がない場合、条件クラスを遡って基礎種を使う。
  let raceRow=row;const seen=new Set();
  while(!Number.isFinite(Number(raceRow.HP))) {
    if(seen.has(raceRow.名前))return null;
    seen.add(raceRow.名前);
    const match=String(raceRow.条件クラス || '').match(/^(.+)_\d+$/);
    raceRow=match&&getGameDataRows('クラス').find(item=>item.名前===match[1]);
    if(!raceRow)return null;
  }
  const combatProfile=members?{mode:'army',memberCount:members,populationCost:members,
    hpMultiplier:1+(members-1)*V39_SUMMON_BALANCE.hpPerExtraMember,attackCount:members,simpleActionsOnly:true}:null;
  const unit=buildV39UnitEntity({id:'summon-preview',name:target,race:raceRow.名前,className:target,level,
    unitType:members?'軍隊ユニット':'召喚ユニット',isMob:members>0,isNamed:false,combatProfile,equipment:buildV39SummonEquipment(target,row)});
  return unit.derivedCharacter?.ok?unit:null;
}

export function buildV39SummonEquipment(target,row,random=null) {
  const equipment=buildV39ClassEquipment(row),rule=initialEquipment[target];
  if(!rule||equipment.some(item=>item.slot==='武器1'))return equipment;
  const candidates=rule.武器候補.map(name=>createV39EquipmentEntry(name,rule.品質,'武器1')).filter(Boolean);
  if(!candidates.length)return equipment;
  // プレビューで再抽選しない。実際の生成時のみ、各ユニットに対して抽選する。
  const index=random?Math.min(candidates.length-1,Math.max(0,Math.floor(random()*candidates.length))):0;
  return [...equipment,candidates[index]];
}

export function describeV39SummonEquipment(target) {
  const rule=initialEquipment[target];
  return rule?`初期武器: コモンの${rule.武器候補.join('・')}からランダム1個（プレビューは${rule.武器候補[0]}）`:'';
}
export function resolveV39SummonPlacements(state,map,caster,preview,excludedIds=new Set()) {
  const world=state.activeWorldId || 'surface';
  const occupied=new Set([...(state.players || []).flatMap(player=>player.factionState.units || []).filter(unit=>(unit.worldId || 'surface')===world),
    ...(state.enemies || []),...(state.neutralVillages || []).flatMap(village=>village.defenseUnits || [])]
    .filter(unit=>n(unit.hp ?? unit.currentHp)>0&&!excludedIds.has(unit.id)).map(key));
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
  const tiles=map&&caster&&preview?resolveV39SummonPlacements(state,map,caster,preview):[];
  if(entry?.spec&&tiles.length<entry.spec.count)reasons.push(`隣接する配置可能マスが${entry.spec.count}マス必要`);
  return {available:!reasons.length,reasons,caster,entry,preview,cost,hpCost,duration,tiles};
}
export function summonV39Units(state,playerId,unitId,skillName,map) {
  const check=inspectV39Summon(state,playerId,unitId,skillName,map);
  if(!check.available)return {ok:false,state,reason:check.reasons.join(' / ')};
  const turn=state.timeline.turnNumber,player=state.players.find(row=>row.id===playerId),faction=player.factionState;
  const rows=getV39EditableSquads(faction);
  const existing=rows.find(row=>row.id!=='solo'&&row.id!=='単独'&&row.unitIds.includes(unitId));
  let squadId=existing?.id||`summon-party-${unitId}`;
  if(!existing){let suffix=0;while(rows.some(row=>row.id===squadId))squadId=`summon-party-${unitId}-${++suffix}`;}
  let serial=n(faction.summonSerial)+1;const created=[];
  while(faction.units.some(unit=>String(unit.id).startsWith(`summon-${playerId}-${turn}-${serial}-`)))serial++;
  for(let i=0;i<check.entry.spec.count;i++) {
    const tile=check.tiles[i],id=`summon-${playerId}-${turn}-${serial}-${i}`;
    const row=getGameDataRows('クラス').find(item=>item.名前===check.entry.spec.target);
    const derived=applyV39DerivedCharacterData({...structuredClone(check.preview),equipment:buildV39SummonEquipment(check.entry.spec.target,row,Math.random)});
    const maxHp=Math.max(1,Math.round(derived.maxHp));
    created.push({...derived,maxHp,hp:maxHp,currentHp:maxHp,id,name:`${check.entry.spec.target}${check.entry.spec.members?'軍':''}（召喚）`,
      x:tile.x,y:tile.y,position:[tile.x,tile.y],worldId:state.activeWorldId || 'surface',squadId,
      summon:{casterId:unitId,skillName,createdTurn:turn,expiresAtTurn:turn+check.duration}});
  }
  const runtime=faction.combatRuntime || {},hp=n(check.caster.hp ?? check.caster.currentHp)-check.hpCost,ap=n(check.caster.ap ?? check.caster.currentAp)-check.cost;
  const squads=rows.map(row=>{
    if(row.id===squadId)return {...row,unitIds:[...row.unitIds,...created.map(unit=>unit.id)]};
    if(existing||!row.unitIds.includes(unitId))return row;
    const cargoByUnitId={...row.cargoByUnitId};delete cargoByUnitId[unitId];
    return {...row,unitIds:row.unitIds.filter(id=>id!==unitId),cargoByUnitId};
  });
  if(!existing)squads.push({id:squadId,label:`${check.caster.name||'召喚者'}の部隊`,summonOwnerId:unitId,
    unitIds:[unitId,...created.map(unit=>unit.id)],movementLeaderId:unitId,formationType:'column',
    cargo:mergeV39Cargo({},rows.find(row=>row.unitIds.includes(unitId))?.cargoByUnitId?.[unitId])});
  const next={...faction,summonSerial:serial,squads,units:[...faction.units.map(unit=>unit.id===unitId?{...unit,squadId,hp,currentHp:hp,ap,currentAp:ap,actionPoint:ap,lastActionTurn:turn,lastUsedAttack:skillName}:unit),...created],
    combatRuntime:{...runtime,cooldownsByUnitId:{...runtime.cooldownsByUnitId,[unitId]:{...runtime.cooldownsByUnitId?.[unitId],[skillName]:turn+resolveV39SkillCooldownTurns(check.entry.row)}}}};
  return {ok:true,state:{...state,players:state.players.map(row=>row.id===playerId?{...row,factionState:next}:row)},created,
    message:`${check.entry.spec.target}を${created.length}ユニット召喚しました`};
}
export function expireV39Summons(state,turn) {
  const removed=[],groundLootByTile={...state.groundLootByTile};
  const drop=(unit,cargo)=>{
    const bag=cargo?.resourcesByType || {},items=cargo?.equipmentInventory || [];
    if(!Object.values(bag).some(value=>n(value)>0)&&!items.length)return;
    const current=groundLootByTile[key(unit)] || {},stock=current.cargo || current;
    const resourcesByType={...stock.resourcesByType};
    for(const [name,amount] of Object.entries(bag))resourcesByType[name]=n(resourcesByType[name])+n(amount);
    groundLootByTile[key(unit)]={...current,cargo:{...stock,resourcesByType,equipmentInventory:[...(stock.equipmentInventory || []),...items]}};
  };
  const players=state.players.map(player=>{
    const dead=player.factionState.units.filter(unit=>unit.summon&&(unit.worldId || 'surface')===(state.activeWorldId || 'surface')
      &&(unit.summon.expiresAtTurn<=turn||n(unit.hp ?? unit.currentHp)<=0));
    if(!dead.length)return player;
    removed.push(...dead);const ids=new Set(dead.map(unit=>unit.id));
    // 召喚装備・死体は残さず、後から積んだ実物の荷物だけ元のマスへ残す。
    for(const unit of dead) {
      drop(unit,unit.cargo);drop(unit,{resourcesByType:unit.caveDuty?.cargo});
      drop(unit,{resourcesByType:{...unit.expeditionCargoByType}});
      drop(unit,{resourcesByType:{...unit.toolStockByType}});
    }
    const units=player.factionState.units.filter(unit=>!ids.has(unit.id));
    return {...player,factionState:{...player.factionState,units,selectedUnitId:ids.has(player.factionState.selectedUnitId)?units.find(unit=>(unit.worldId || 'surface')===(state.activeWorldId || 'surface'))?.id || '':player.factionState.selectedUnitId,
      squads:player.factionState.squads.map(squad=>{
        const unitIds=squad.unitIds.filter(id=>!ids.has(id));
        const cargoByUnitId={...squad.cargoByUnitId};
        for(const unit of dead)if(cargoByUnitId[unit.id]){drop(unit,cargoByUnitId[unit.id]);delete cargoByUnitId[unit.id];}
        if(!unitIds.length&&squad.unitIds.length)drop(dead.find(unit=>squad.unitIds.includes(unit.id)),squad.cargo);
        return {...squad,unitIds,cargoByUnitId,...(!unitIds.length?{cargo:{resourcesByType:{},equipmentInventory:[]}}:{})};
      }),
      combatRuntime:{...player.factionState.combatRuntime,...Object.fromEntries(['pendingActionsByUnitId','cooldownsByUnitId','activeEffectsByUnitId'].map(field=>[field,Object.fromEntries(Object.entries(player.factionState.combatRuntime?.[field] || {}).filter(([id])=>!ids.has(id)))]))}}};
  });
  return {state:removed.length?{...state,players,groundLootByTile}:state,removed};
}
