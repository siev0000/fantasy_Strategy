import {getGameDataRows} from './game-data-registry.js';
import {getFactionSettlements,replaceFactionSettlement} from './settlement-state.js';
import {resolveV39FacilitySummonCosts} from './v39-facility-summon-costs.js';
import {resolveV39SummonMaterials,scaleV39SummonMaterials,inspectV39SummonMaterialPayment,payV39SummonMaterials} from './v39-summon-materials.js';
import {getV39SummonBatchOptions} from './v39-summon-batches.js';
import {resolveV39RitualSummonEffects,resolveV39SummonFamily} from './v39-ritual-facilities.js';
import {buildV39SummonPreview,createV39SummonedUnit} from './v39-summon-rules.js';
import {getHexNeighborCoords} from './hex-grid.js';
import {canUnitEnterV39Tile} from './v39-terrain-traversal.js';
import {v39WallStepHeight} from './v39-defense-rules.js';
import {isV39VillageHostileToPlayer} from './v39-village-hostility.js';

const n=value=>Math.max(0,Number(value)||0);
const split=value=>String(value||'').split('/').filter(Boolean);
const slotKey=(base,chain)=>JSON.stringify([base.settlementId||base.id,chain]);
const key=tile=>`${tile.x},${tile.y}`;
const living=unit=>n(unit.hp??unit.currentHp)>0;

export function resolveV39FacilitySummonPlacements(state,playerId,map,slot,preview,minimumRadius=0) {
  if(!slot||!preview||!map?.grid)return {tiles:[],radius:0,blocked:false};
  const definitions=getGameDataRows('施設'),seen=new Set();let row=slot.row,radius=0;
  while(row?.改築元&&!seen.has(row.施設名)){
    seen.add(row.施設名);radius++;row=definitions.find(candidate=>candidate.施設名===row.改築元);
  }
  radius=Math.max(minimumRadius,Math.min(2,radius));
  const local=unit=>living(unit)&&(unit.worldId||'surface')===slot.worldId;
  const others=(state.players||[]).filter(player=>player.id!==playerId).flatMap(player=>player.factionState.units||[]);
  const villages=state.neutralVillages||[];
  const enemies=[...(state.enemies||[]),...others,...villages.filter(v=>isV39VillageHostileToPlayer(v,playerId)).flatMap(v=>v.defenseUnits||[])];
  const blocked=enemies.some(unit=>local(unit)&&key(unit)===slot.tileKey);
  if(blocked)return {tiles:[],radius,blocked};
  const occupants=[...(state.players||[]).flatMap(player=>player.factionState.units||[]),...(state.enemies||[]),...villages.flatMap(v=>v.defenseUnits||[])];
  const occupied=new Set(occupants.filter(local).map(key));
  if(map.caveEventNpc)occupied.add(key(map.caveEventNpc));
  const tiles=[],visited=new Set([slot.tileKey]),queue=[{x:slot.x,y:slot.y,key:slot.tileKey,distance:0}];
  for(let i=0;i<queue.length;i++){
    const tile=queue[i];
    const passable=canUnitEnterV39Tile(map,tile.x,tile.y,preview)&&!v39WallStepHeight(map,tile,tile);
    if(passable&&!occupied.has(tile.key))tiles.push(tile);
    if(tile.distance>0&&!passable)continue;
    if(tile.distance>=radius)continue;
    for(const next of getHexNeighborCoords(map.w,map.h,tile.x,tile.y,map.worldWrapEnabled===true)){
      if(visited.has(next.key)||!canUnitEnterV39Tile(map,next.x,next.y,preview)||v39WallStepHeight(map,tile,next))continue;
      visited.add(next.key);queue.push({...next,distance:tile.distance+1});
    }
  }
  return {tiles,radius,blocked};
}

export function getV39FacilitySummonSlots(state,playerId,settlementId=null) {
  const player=state.players?.find(p=>p.id===playerId),slots=[];
  const definitions=getGameDataRows('施設').filter(row=>row.施設召喚枠ID);
  for(const base of getFactionSettlements(player?.factionState)) {
    if(!base.placed||(settlementId&&(base.settlementId||base.id)!==settlementId))continue;
    const chains=new Map();
    for(const row of definitions.filter(row=>(base.buildings||[]).includes(row.施設名))) {
      const old=chains.get(row.施設召喚枠ID);
      if(!old||n(row.召喚上限Lv)>n(old.召喚上限Lv))chains.set(row.施設召喚枠ID,row);
    }
    for(const [chain,row] of chains) {
      const tile=Object.entries(base.tileFacilityMap||{}).find(([,names])=>names.includes(row.施設名));
      if(!tile)continue;
      const [x,y]=tile[0].split(',').map(Number),worldId=base.worldId||'surface';
      const owned=(state.activeWorldId||'surface')!==worldId||state.territoryOwnerByTile?.[tile[0]]===playerId;
      if(!owned)continue;
      const id=slotKey(base,chain),runtime=player.factionState.facilitySummonsBySlot?.[id]||{};
      const health=base.facilityStateByTile?.[tile[0]]?.[row.施設名];
      const upgrading=(base.constructionQueue||[]).some(item=>item.tileKey===tile[0]&&item.replacesFacilityName);
      const activeUnitIds=Array.isArray(runtime.unitIds)?runtime.unitIds:runtime.unitId?[runtime.unitId]:[];
      slots.push({id,chain,row,base,x,y,worldId,tileKey:tile[0],runtime,activeUnitIds,
        usable:!upgrading&&!(health&&n(health.hp)<=0),
        remainingTurns:Math.max(0,n(runtime.readyAtTurn)-n(state.timeline?.turnNumber))});
    }
  }
  return slots;
}

export function getV39FacilitySummonEntries(slot) {
  if(!slot)return [];
  const families=split(slot.row.召喚系統);
  return getGameDataRows('召喚モンスターリスト').filter(row=>families.includes('全般')||families.includes(resolveV39SummonFamily(row.名称,row)))
    .map(row=>({row:{名前:row.名称},sourceSkillName:null,catalog:row,
      spec:{target:row.名称,level:n(row.総Lv),members:0,count:1}}));
}

export function inspectV39FacilitySummon(state,playerId,id,catalogName,map,options={}) {
  const player=state.players?.find(p=>p.id===playerId),slot=getV39FacilitySummonSlots(state,playerId).find(s=>s.id===id);
  const entry=getV39FacilitySummonEntries(slot).find(e=>e.catalog.名称===catalogName),reasons=[];
  const bonus=resolveV39RitualSummonEffects(player,entry?.spec.target,entry?.catalog,{facilitySummon:true,baseLevel:entry?.spec.level,settlement:slot?.base});
  const facility={...bonus,maximumLevel:n(slot?.row.召喚上限Lv)};
  const count=options.count??1,formation=options.formation??'split';
  const batchOptions=getV39SummonBatchOptions(facility.maximumLevel,entry?.spec.level);
  const validBatch=Number.isInteger(count)&&batchOptions.some(option=>option.count===count)&&['split','army'].includes(formation);
  if(!validBatch)reasons.push('この対象のLvでは指定した体数・編成で召喚できません');
  const safeCount=validBatch?count:1,unitCount=formation==='army'?1:safeCount;
  const creationEntry=entry?{...entry,spec:{...entry.spec,members:formation==='army'&&safeCount>1?safeCount:0,count:unitCount}}:entry;
  const preview=buildV39SummonPreview(creationEntry,facility.bonusLevel);
  const payment=resolveV39FacilitySummonCosts({...preview,summon:{representedCount:safeCount}}),goldHeld=n(slot?.base.materialStockByType?.金);
  const materials=resolveV39SummonMaterials(entry?.catalog,slot?.base);
  const initialMaterials=scaleV39SummonMaterials(materials.initialMaterials,safeCount);
  const totalUpkeepMaterials=scaleV39SummonMaterials(materials.upkeepMaterials,safeCount);
  const initialPayment={...initialMaterials,金:n(initialMaterials.金)+payment.goldCost};
  reasons.push(...materials.materialErrors,...inspectV39SummonMaterialPayment(slot?.base,initialPayment).reasons);
  if(!player||state.activePlayerId!==playerId||state.timeline?.phase!=='player')reasons.push('自分の操作ターンに実行してください');
  if(!slot)reasons.push('完成した自軍の召喚施設が必要です');
  if(slot&&(state.activeWorldId||'surface')!==slot.worldId)reasons.push('施設のあるワールドで実行してください');
  if(slot&&!slot.usable)reasons.push('施設の改築・修復が完了してから実行してください');
  if(slot?.activeUnitIds.length)reasons.push(`この施設の召喚組は活動中です（${slot.activeUnitIds.length}駒）`);
  if(slot?.remainingTurns>0)reasons.push(`再召喚まで残り${slot.remainingTurns}T`);
  if(!entry||!preview)reasons.push('召喚対象またはクラス構成が不正です');
  if(entry?.spec.level>facility.maximumLevel)reasons.push(`施設の召喚上限Lv${facility.maximumLevel}です`);
  const placement=resolveV39FacilitySummonPlacements(state,playerId,map,slot,preview,unitCount>1?1:0);
  if(placement.blocked)reasons.push('施設マスに敵がいるため召喚できません');
  else if(placement.tiles.length<unitCount)reasons.push(`施設の召喚範囲に配置可能な空きマスが${unitCount}マス必要です`);
  const eligible=!!slot&&!!entry&&!!preview&&entry.spec.level<=facility.maximumLevel;
  return {available:!reasons.length,eligible,reasons,slot,entry,creationEntry,preview,facility,...placement,...payment,...materials,
    initialMaterials,totalUpkeepMaterials,initialPayment,batchOptions,count:safeCount,formation,unitCount,goldHeld,cost:0,hpCost:0,duration:null};
}

export function summonV39FacilityUnit(state,playerId,id,catalogName,map,destination=null,options={}) {
  const check=inspectV39FacilitySummon(state,playerId,id,catalogName,map,options);
  if(!check.available)return {ok:false,state,reason:check.reasons.join(' / ')};
  const requested=Array.isArray(destination)?destination:[destination];
  const tiles=requested.map(target=>check.tiles.find(tile=>Number.isInteger(target?.x)&&Number.isInteger(target?.y)&&key(tile)===key(target)));
  if(tiles.length!==check.unitCount||tiles.some(tile=>!tile)||new Set(tiles.map(key)).size!==check.unitCount)
    return {ok:false,state,reason:`召喚範囲内の異なる空きマスを${check.unitCount}マス選択してください`};
  const player=state.players.find(p=>p.id===playerId),faction=player.factionState,turn=n(state.timeline.turnNumber);
  const serial=n(faction.summonSerial)+1,firstId=`facility-summon-${playerId}-${turn}-${serial}`;
  const created=tiles.map((tile,index)=>({...createV39SummonedUnit(check.creationEntry,check.preview),id:index?`${firstId}-${index+1}`:firstId,
    name:catalogName,x:tile.x,y:tile.y,position:[tile.x,tile.y],worldId:check.slot.worldId,
    squadId:'solo',settlementId:check.slot.base.settlementId||check.slot.base.id,
    summon:{kind:'facility',slotKey:id,catalogName,facilityName:check.slot.row.施設名,settlementName:check.slot.base.name,createdTurn:turn,expiresAtTurn:null,
      nextUpkeepTurn:turn+check.upkeepIntervalTurns,
      batchSize:check.count,formation:check.formation,representedCount:check.formation==='army'?check.count:1,
      upkeepMaterials:scaleV39SummonMaterials(check.upkeepMaterials,check.formation==='army'?check.count:1),
      cooldownTurns:Math.floor(n(check.slot.row.施設召喚再使用T)),baseLevel:check.entry.spec.level,bonusLevel:check.facility.bonusLevel}}));
  const unit=created[0],unitIds=created.map(unit=>unit.id);
  const squads=structuredClone(faction.squads||[]),solo=squads.find(s=>s.id==='solo'||s.id==='単独');
  if(solo)solo.unitIds=[...(solo.unitIds||[]),...unitIds];
  else squads.push({id:'solo',label:'単独',unitIds});
  const paid=replaceFactionSettlement(faction,payV39SummonMaterials(check.slot.base,check.initialPayment),
    {ownerPlayerId:playerId,select:false});
  const next={...paid,units:[...faction.units,...created],squads,summonSerial:serial,
    facilitySummonsBySlot:{...faction.facilitySummonsBySlot,[id]:{unitId:unit.id,unitIds,batchSize:check.count,formation:check.formation,readyAtTurn:0,createdAtTurn:turn}}};
  return {ok:true,unit,created,state:{...state,players:state.players.map(p=>p.id===playerId?{...p,factionState:next}:p)},
    message:`${check.slot.row.施設名}から${catalogName}${check.count}体を${check.formation==='army'?'軍隊':'個別'}召喚 / 金-${check.goldCost} / 維持費${check.goldCost}金・${check.upkeepIntervalTurns}Tごと`};
}
