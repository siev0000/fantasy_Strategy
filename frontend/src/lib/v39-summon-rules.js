import {replaceV39CastOnAction} from './v39-casting-rules.js';
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
import {v39SquadMoveMode} from './v39-squad-coordination.js';
import initialEquipment from '../../../config/v39-summon-equipment.json';
import {createV39EquipmentEntry} from './v39-equipment-rules.js';
import {applyV39DerivedCharacterData} from '../v39/unit/v39-character-derived-rules.js';
import {resolveV39RitualSummonEffects,recordV39FacilitySummonLosses} from './v39-ritual-facilities.js';
import {advanceV39FacilitySummonUpkeep} from './v39-facility-summon-costs.js';
import {resolveV39FacilitySummonCosts} from './v39-facility-summon-costs.js';
import {getFactionSettlementById,getSelectedSettlement,replaceFactionSettlement} from './settlement-state.js';
import {resolveV39SummonMaterials,scaleV39SummonMaterials,inspectV39SummonMaterialPayment,payV39SummonMaterials} from './v39-summon-materials.js';
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
  const catalog=getGameDataRows('召喚モンスターリスト');
  const groups=new Set(catalog.map(item=>item.分類));
  return [...unique.values()].flatMap(row=>{
    const spec=parseV39SummonEffect(row);
    if(!spec||!groups.has(spec.target))return [{row,spec,sourceSkillName:row.名前,skillMaximumLevel:spec?.level}];
    return catalog.filter(item=>item.分類===spec.target&&Number(item.総Lv)>0&&Number(item.総Lv)<=spec.level)
      .map(item=>({row:{...row,名前:`${row.名前} / ${item.名称}`},sourceSkillName:row.名前,catalog:item,skillMaximumLevel:spec.level,
        spec:{...spec,target:item.名称,level:Number(item.総Lv)}}));
  });
}
function catalogComposition(entry,bonusLevel) {
  const levels={},tokens=String(entry.catalog?.クラス構成||'').trim().split(/[\s,、/]+/);
  for(const token of tokens){
    const match=token.match(/^(.+)_(\d+)$/);
    if(!match||Number(match[2])<1)return null;
    levels[match[1]]=(levels[match[1]]||0)+Number(match[2]);
  }
  if(Object.values(levels).reduce((sum,lv)=>sum+lv,0)!==entry.spec.level)return null;
  const rows=getGameDataRows('クラス'),names=Object.keys(levels);
  if(names.some(name=>!rows.some(row=>row.名前===name)))return null;
  const race=names.find(name=>Number.isFinite(Number(rows.find(row=>row.名前===name).HP)));
  if(!race)return null;
  levels[race]+=bonusLevel;
  return {race,className:names.at(-1),levels};
}
function summonEquipment(entry,row,random=null) {
  if(!entry.catalog)return buildV39SummonEquipment(entry.spec.target,row,random);
  const slots={'武器':'武器1','副武器':'武器2','胴':'体','頭':'頭','足':'足','装飾1':'装飾1','装飾2':'装飾2'};
  const gear=[];
  for(const [field,slot] of Object.entries(slots)) {
    const text=String(entry.catalog[field]||'').trim();
    if(!text||text==='×')continue;
    const choices=text.replace(/（.*）/g,'').split('/').map(name=>name.trim()).filter(Boolean);
    if(!choices.length)continue;
    const index=random?Math.min(choices.length-1,Math.floor(random()*choices.length)):0;
    const item=createV39EquipmentEntry(choices[index],'common',slot);
    if(item)gear.push(item);
  }
  return gear.length?gear:buildV39SummonEquipment(entry.spec.target,{},random);
}
export function buildV39SummonPreview(entry,bonusLevel=0) {
  if(!entry?.spec)return null;
  const {target,members}=entry.spec,level=entry.spec.level+bonusLevel;
  if(entry.catalog){
    const composition=catalogComposition(entry,bonusLevel);
    if(!composition)return null;
    const row=getGameDataRows('クラス').find(row=>row.名前===composition.className);
    const equipment=summonEquipment(entry,row);
    const unit=buildV39UnitEntity({id:'summon-preview',name:target,race:composition.race,className:composition.className,level,
      prerequisiteClassLevels:Object.fromEntries(Object.entries(composition.levels).filter(([name])=>name!==composition.race&&name!==composition.className)),
      equipment,unitType:members?'軍隊ユニット':'召喚ユニット',isMob:members>0,isNamed:false,
      combatProfile:members?{mode:'army',memberCount:members,populationCost:members,hpMultiplier:1+(members-1)*V39_SUMMON_BALANCE.hpPerExtraMember,attackCount:members,simpleActionsOnly:true}:null});
    const derived=applyV39DerivedCharacterData({...unit,summonGrowth:{levelsByClass:composition.levels}});
    return derived.derivedCharacter?.ok?{...derived,hp:derived.maxHp,currentHp:derived.maxHp}:null;
  }
  const row=getGameDataRows('クラス').find(row=>row.名前===target);
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

export function createV39SummonedUnit(entry,preview,random=Math.random) {
  const row=getGameDataRows('クラス').find(item=>item.名前===preview.className);
  const derived=applyV39DerivedCharacterData({...structuredClone(preview),equipment:summonEquipment(entry,row,random)});
  const maxHp=Math.max(1,Math.round(derived.maxHp));
  return {...derived,maxHp,hp:maxHp,currentHp:maxHp};
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
  const entry=getV39SummonEntries(caster).find(entry=>entry.row.名前===skillName),reasons=[];
  const paymentBase=getFactionSettlementById(player?.factionState,caster?.settlementId)||getSelectedSettlement(player?.factionState);
  const facility=resolveV39RitualSummonEffects(player,entry?.spec?.target,entry?.catalog,{baseLevel:entry?.spec?.level,settlement:paymentBase});
  facility.maximumLevel=entry?.catalog?Math.min(n(entry.skillMaximumLevel),V39_SUMMON_BALANCE.normalMaximumLevel):n(entry?.skillMaximumLevel);
  const preview=buildV39SummonPreview(entry,facility.bonusLevel);
  const materials=resolveV39SummonMaterials(entry?.catalog,paymentBase);
  const initialPayment=scaleV39SummonMaterials(materials.initialMaterials,entry?.spec?.count||1);
  reasons.push(...materials.materialErrors,...inspectV39SummonMaterialPayment(paymentBase,initialPayment).reasons);
  const turn=n(state.timeline?.turnNumber),cost=n(entry?.row.AP消費),hpCost=n(entry?.row.HP消費),duration=parseV39TurnCount(entry?.row.効果時間);
  if(!caster||playerId!==state.activePlayerId||state.timeline.phase!=='player'||n(caster.hp ?? caster.currentHp)<=0
    ||(caster.worldId || 'surface')!==(state.activeWorldId || 'surface'))reasons.push('操作中の生存ユニットが必要');
  if(caster?.waitTurnNumber===turn)reasons.push('待機済みです');
  if(!entry?.spec||!preview)reasons.push('召喚対象または書式が不正');
  if(entry?.spec?.level>facility.maximumLevel)reasons.push(`スキルの召喚上限Lv${facility.maximumLevel}です`);
  if(entry?.catalog&&entry.spec.level>V39_SUMMON_BALANCE.normalMaximumLevel)reasons.push('通常上限を超える候補です。特殊召喚の解禁条件は未設定です');
  if(entry?.catalog&&!preview) {
    const classes=new Set(getGameDataRows('クラス').map(row=>row.名前));
    const missing=String(entry.catalog.クラス構成||'').split(/\s+/).map(s=>s.replace(/_\d+$/,'')).filter(name=>!classes.has(name));
    if(missing.length)reasons.push(`未登録クラス: ${missing.join('・')}`);
  }
  if(duration<1)reasons.push('効果時間の設定が必要');
  if(n(caster?.ap ?? caster?.currentAp)<cost)reasons.push('AP不足');
  if(n(caster?.hp ?? caster?.currentHp)<=hpCost)reasons.push('HP不足');
  const runtime=player?.factionState.combatRuntime || {};
  if(runtime.pendingActionsByUnitId?.[unitId]&&!runtime.pendingActionsByUnitId[unitId].aimAfterCast)reasons.push('別の行動を発動待機中');
  if(n(runtime.cooldownsByUnitId?.[unitId]?.[entry?.sourceSkillName||skillName])>turn)reasons.push('使用済みまたはCT中');
  const tiles=map&&caster&&preview?resolveV39SummonPlacements(state,map,caster,preview):[];
  if(entry?.spec&&tiles.length<entry.spec.count)reasons.push(`隣接する配置可能マスが${entry.spec.count}マス必要`);
  const eligible=!!entry?.spec&&!!preview&&duration>0&&entry.spec.level<=facility.maximumLevel
    &&(!entry.catalog||entry.spec.level<=V39_SUMMON_BALANCE.normalMaximumLevel);
  return {available:!reasons.length,eligible,reasons,caster,entry,preview,cost,hpCost,duration,tiles,facility,paymentBase,initialPayment,...materials};
}
export function summonV39Units(state,playerId,unitId,skillName,map) {
  const check=inspectV39Summon(state,playerId,unitId,skillName,map);
  if(!check.available)return {ok:false,state,reason:check.reasons.join(' / ')};
  const turn=state.timeline.turnNumber,player=state.players.find(row=>row.id===playerId),faction=player.factionState;
  const rows=getV39EditableSquads(faction);
  const existing=rows.find(row=>row.id!=='solo'&&row.id!=='単独'&&row.unitIds.includes(unitId));
  let squadId=existing?.id||`summon-party-${unitId}`;
  if(!existing){let suffix=0;while(rows.some(row=>row.id===squadId))squadId=`summon-party-${unitId}-${++suffix}`;}
  const mode=existing?v39SquadMoveMode(check.caster):'follow';
  const movement={squadMoveMode:mode,squadGather:mode==='gather'?{status:'moving',reason:'',lastProcessedTurn:0}:null};
  let serial=n(faction.summonSerial)+1;const created=[];
  while(faction.units.some(unit=>String(unit.id).startsWith(`summon-${playerId}-${turn}-${serial}-`)))serial++;
  for(let i=0;i<check.entry.spec.count;i++) {
    const tile=check.tiles[i],id=`summon-${playerId}-${turn}-${serial}-${i}`;
    const derived=createV39SummonedUnit(check.entry,check.preview);
    const maxHp=Math.max(1,Math.round(derived.maxHp));
    created.push({...derived,maxHp,hp:maxHp,currentHp:maxHp,id,name:`${check.entry.spec.target}${check.entry.spec.members?'軍':''}`,
      x:tile.x,y:tile.y,position:[tile.x,tile.y],worldId:state.activeWorldId || 'surface',squadId,...movement,
      summon:{casterId:unitId,casterName:check.caster.name,skillName:check.entry.sourceSkillName||skillName,catalogName:check.entry.catalog?.名称,
        upkeepMaterials:check.upkeepMaterials,paymentSettlementId:check.paymentBase?.settlementId||check.paymentBase?.id,
        nextUpkeepTurn:turn+resolveV39FacilitySummonCosts(derived).upkeepIntervalTurns,
        baseLevel:check.entry.spec.level,bonusLevel:check.facility.bonusLevel,createdTurn:turn,expiresAtTurn:turn+check.duration}});
  }
  const runtime=replaceV39CastOnAction(faction.combatRuntime,unitId),hp=n(check.caster.hp ?? check.caster.currentHp)-check.hpCost,ap=n(check.caster.ap ?? check.caster.currentAp)-check.cost;
  const squads=rows.map(row=>{
    if(row.id===squadId)return {...row,unitIds:[...row.unitIds,...created.map(unit=>unit.id)]};
    if(existing||!row.unitIds.includes(unitId))return row;
    const cargoByUnitId={...row.cargoByUnitId};delete cargoByUnitId[unitId];
    return {...row,unitIds:row.unitIds.filter(id=>id!==unitId),cargoByUnitId};
  });
  if(!existing)squads.push({id:squadId,label:`${check.caster.name||'召喚者'}の部隊`,summonOwnerId:unitId,
    unitIds:[unitId,...created.map(unit=>unit.id)],movementLeaderId:unitId,formationType:'column',
    cargo:mergeV39Cargo({},rows.find(row=>row.unitIds.includes(unitId))?.cargoByUnitId?.[unitId])});
  const paid=Object.keys(check.initialPayment).length?replaceFactionSettlement(faction,payV39SummonMaterials(check.paymentBase,check.initialPayment),{ownerPlayerId:playerId,select:false}):faction;
  const next={...paid,summonSerial:serial,squads,units:[...faction.units.map(unit=>unit.id===unitId?{...unit,...(!existing?movement:{}),squadId,hp,currentHp:hp,ap,currentAp:ap,actionPoint:ap,lastActionTurn:turn,lastUsedAttack:skillName}:unit),...created],
    combatRuntime:{...runtime,cooldownsByUnitId:{...runtime.cooldownsByUnitId,[unitId]:{...runtime.cooldownsByUnitId?.[unitId],[check.entry.sourceSkillName||skillName]:turn+resolveV39SkillCooldownTurns(check.entry.row)}}}};
  return {ok:true,state:{...state,players:state.players.map(row=>row.id===playerId?{...row,factionState:next}:row)},created,
    message:`${check.entry.spec.target}を${created.length}ユニット召喚しました`};
}
export function expireV39Summons(state,turn) {
  const upkeep=advanceV39FacilitySummonUpkeep(state,turn);state=upkeep.state;
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
      &&(unit.summon.maintenanceFailed||(unit.summon.kind!=='facility'&&unit.summon.expiresAtTurn<=turn)||n(unit.hp ?? unit.currentHp)<=0));
    if(!dead.length)return player;
    removed.push(...dead);const ids=new Set(dead.map(unit=>unit.id));
    // 召喚装備・死体は残さず、後から積んだ実物の荷物だけ元のマスへ残す。
    for(const unit of dead) {
      drop(unit,unit.cargo);drop(unit,{resourcesByType:unit.caveDuty?.cargo});
      drop(unit,{resourcesByType:{...unit.expeditionCargoByType}});
      drop(unit,{resourcesByType:{...unit.toolStockByType}});
    }
    const units=player.factionState.units.filter(unit=>!ids.has(unit.id));
    return {...player,factionState:{...player.factionState,units,
      facilitySummonsBySlot:recordV39FacilitySummonLosses(player.factionState,dead,turn),
      selectedUnitId:ids.has(player.factionState.selectedUnitId)?units.find(unit=>(unit.worldId || 'surface')===(state.activeWorldId || 'surface'))?.id || '':player.factionState.selectedUnitId,
      squads:player.factionState.squads.map(squad=>{
        const unitIds=squad.unitIds.filter(id=>!ids.has(id));
        const cargoByUnitId={...squad.cargoByUnitId};
        for(const unit of dead)if(cargoByUnitId[unit.id]){drop(unit,cargoByUnitId[unit.id]);delete cargoByUnitId[unit.id];}
        if(!unitIds.length&&squad.unitIds.length)drop(dead.find(unit=>squad.unitIds.includes(unit.id)),squad.cargo);
        return {...squad,unitIds,cargoByUnitId,...(!unitIds.length?{cargo:{resourcesByType:{},equipmentInventory:[]}}:{})};
      }),
      combatRuntime:{...player.factionState.combatRuntime,...Object.fromEntries(['pendingActionsByUnitId','cooldownsByUnitId','activeEffectsByUnitId'].map(field=>[field,Object.fromEntries(Object.entries(player.factionState.combatRuntime?.[field] || {}).filter(([id])=>!ids.has(id)))]))}}};
  });
  return {state:removed.length?{...state,players,groundLootByTile}:state,removed,reports:upkeep.reports};
}
