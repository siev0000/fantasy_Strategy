import settings from '../../../config/v39-facility-storage.json';
import {getGameDataRows,raceData,factionData} from './game-data-registry.js';
import {getHexDistance,getHexOffsetNeighbors} from './hex-grid.js';
import {canUnitEnterV39Tile} from './v39-terrain-traversal.js';

const world=unit=>unit?.worldId||'surface';
const alive=unit=>Number(unit?.hp??unit?.currentHp)>0&&!['死亡','死体'].includes(unit?.state);
const hasCargo=value=>value&&typeof value==='object'&&Object.values(value).some(v=>typeof v==='number'?v>0:typeof v==='object'?hasCargo(v):Boolean(v));
const assigned=value=>Boolean(value)&&(typeof value!=='object'||value.enabled!==false);
const playerRaces=new Set(raceData.flatMap(row=>[row.key,row.name,row.className]).filter(Boolean));
for(const row of factionData){
  playerRaces.add(row.カナ);playerRaces.add(row.種族);
}
export function isV39PlayerStorageRace(unit){return playerRaces.has(unit?.race||unit?.raceName||unit?.種族);}
export function getV39FacilityStorageRule(name){
  const row=getGameDataRows('施設').find(row=>(row.施設名||row.名前)===name);
  if(row&&Object.hasOwn(row,'格納種別'))return {type:({'生体':'unit','魂':'soul','死体':'corpse'})[row.格納種別]||'',capacity:Math.max(0,Number(row.格納上限)||0),target:row.格納対象==='プレイヤー種族'?'player':'all'};
  return settings.facilities[name]||null;
}
export function getV39StorageFacilities(state,playerId){
  const worldId=state.activeWorldId||'surface';
  return Object.entries(state.facilitiesByTile||{}).flatMap(([tileKey,names])=>{
    if(state.territoryOwnerByTile?.[tileKey]!==playerId)return [];
    const [x,y]=tileKey.split(',').map(Number);
    return (Array.isArray(names)?names:[]).flatMap(name=>{
      const rule=getV39FacilityStorageRule(name);
      return rule?.type?[{tileKey,name,x,y,worldId,...rule}]:[];
    });
  });
}
export function getV39FacilityStoredEntries(state,playerId,facility){
  const faction=state.players?.find(p=>p.id===playerId)?.factionState;
  if(facility?.type==='corpse')return (faction?.deadUnitReserve||[]).filter(entry=>entry.corpseStorage?.tileKey===facility.tileKey&&entry.corpseStorage.facilityName===facility.name&&entry.corpseStorage.worldId===facility.worldId);
  if(facility?.type==='soul'){
    const archives=getV39StorageFacilities(state,playerId).filter(f=>f.type==='soul');
    return (faction?.soulStorage||[]).filter(soul=>soul.storageTileKey?soul.storageTileKey===facility.tileKey:archives[0]?.tileKey===facility.tileKey);
  }
  return (faction?.facilityStorage||[]).filter(entry=>entry.tileKey===facility?.tileKey&&entry.facilityName===facility?.name&&entry.worldId===facility?.worldId);
}
export function inspectV39FacilityDeposit(state,playerId,facility,unit){
  const faction=state.players?.find(p=>p.id===playerId)?.factionState;
  if(state.activePlayerId!==playerId||state.timeline?.phase!=='player')return '自分の操作ターンに行ってください';
  const found=getV39StorageFacilities(state,playerId).find(f=>f.tileKey===facility?.tileKey&&f.name===facility?.name);
  if(!found||found.type!=='unit')return '生体を格納できる自軍施設が必要です';
  if(!faction?.units?.some(u=>u.id===unit?.id)||!alive(unit)||unit.isSovereign||unit.summon)return '統治者・死体・召喚体は格納できません';
  if(found.target==='player'&&!isV39PlayerStorageRace(unit))return 'この施設はプレイヤー種族専用です。魔獣は魔獣研究所へ格納してください';
  if(world(unit)!==found.worldId||!Number.isInteger(unit.x)||!Number.isInteger(unit.y)||getHexDistance(found,unit)>1)return '施設上または隣接マスへ移動してください';
  if(found.capacity&&getV39FacilityStoredEntries(state,playerId,found).length>=found.capacity)return '格納上限です';
  const runtime=faction.combatRuntime||{};
  if([unit.caveDuty,unit.autoTransport,unit.tradeAssignment,unit.transportAssignment,unit.instructorAssignment].some(assigned)
    ||runtime.pendingActionsByUnitId?.[unit.id]||(runtime.activeEffectsByUnitId?.[unit.id]||[]).length||unit.shield?.remaining>0||unit.barrier?.remaining>0
    ||['recruitInstructorByTile','recruitInstructorTransfers'].some(key=>Object.values(faction[key]||{}).some(row=>row.unitId===unit.id))
    ||faction.units.some(u=>u.summon?.casterId===unit.id))return '任務・教官・召喚・行動予約・一時効果を先に解除してください';
  const squad=faction.squads?.find(s=>s.unitIds?.includes(unit.id));
  if(squad&&(hasCargo(squad.cargo)||hasCargo(squad.cargoByUnitId?.[unit.id])))return '部隊の荷物を先に降ろしてください';
  return '';
}
export function depositV39FacilityUnit(state,playerId,facility,unitId){
  const faction=state.players?.find(p=>p.id===playerId)?.factionState,unit=faction?.units?.find(u=>u.id===unitId);
  const reason=inspectV39FacilityDeposit(state,playerId,facility,unit);
  if(reason)return {ok:false,reason,state};
  const squads=(faction.squads||[]).map(s=>{
    const unitIds=(s.unitIds||[]).filter(id=>id!==unitId),next={...s,unitIds};
    for(const key of ['leaderId','movementLeaderId'])if(next[key]===unitId)next[key]=unitIds[0]||'';
    return next;
  });
  const combatRuntime={...faction.combatRuntime},runtimeByKey={};
  for(const [key,rows] of Object.entries(combatRuntime))if(key.endsWith('ByUnitId')){
    if(rows?.[unitId]!==undefined)runtimeByKey[key]=structuredClone(rows[unitId]);
    combatRuntime[key]=Object.fromEntries(Object.entries(rows||{}).filter(([id])=>id!==unitId));
  }
  const next={...faction,units:faction.units.filter(u=>u.id!==unitId),squads,combatRuntime,
    selectedUnitId:faction.selectedUnitId===unitId?'':faction.selectedUnitId,
    facilityStorage:[...(faction.facilityStorage||[]),{unit:structuredClone(unit),runtimeByKey,tileKey:facility.tileKey,facilityName:facility.name,worldId:state.activeWorldId||'surface'}]};
  return {ok:true,state:{...state,players:state.players.map(p=>p.id===playerId?{...p,factionState:next}:p)}};
}
export function withdrawV39FacilityUnit(state,playerId,facility,unitId,map){
  const faction=state.players?.find(p=>p.id===playerId)?.factionState;
  facility=getV39StorageFacilities(state,playerId).find(f=>f.tileKey===facility?.tileKey&&f.name===facility?.name&&f.type==='unit');
  const entry=getV39FacilityStoredEntries(state,playerId,facility).find(e=>e.unit?.id===unitId);
  if(!entry||state.activePlayerId!==playerId||state.timeline?.phase!=='player'
    ||!facility)return {ok:false,reason:'操作可能な自軍施設と格納ユニットが必要です',state};
  const occupied=new Set([...(state.players||[]).flatMap(p=>p.factionState?.units||[]),...(state.enemies||[]),...(state.neutralVillages||[]).flatMap(v=>v.defenseUnits||[])]
    .filter(u=>alive(u)&&world(u)===(state.activeWorldId||'surface')).map(u=>`${u.x},${u.y}`));
  const target=[facility,...getHexOffsetNeighbors(facility.x,facility.y)].find(tile=>map?.grid?.[tile.y]?.[tile.x]
    &&!occupied.has(`${tile.x},${tile.y}`)&&canUnitEnterV39Tile(map,tile.x,tile.y,entry.unit));
  if(!target)return {ok:false,reason:'施設周囲に配置できる空きマスがありません',state};
  // Withdrawal never refreshes AP or restores an old squad's membership.
  const unit={...entry.unit,x:target.x,y:target.y,position:[target.x,target.y],squadId:'solo',worldId:state.activeWorldId||'surface',ap:0,currentAp:0};
  const squads=(faction.squads||[]).map(s=>s.id==='solo'?{...s,unitIds:[...(s.unitIds||[]),unit.id]}:s);
  if(!squads.some(s=>s.id==='solo'))squads.push({id:'solo',label:'単独',unitIds:[unit.id]});
  const combatRuntime={...faction.combatRuntime};
  for(const [key,value] of Object.entries(entry.runtimeByKey||{}))if(key.endsWith('ByUnitId'))combatRuntime[key]={...combatRuntime[key],[unit.id]:structuredClone(value)};
  const next={...faction,units:[...faction.units,unit],squads,combatRuntime,facilityStorage:faction.facilityStorage.filter(e=>e.unit.id!==unitId),selectedUnitId:unit.id};
  return {ok:true,state:{...state,players:state.players.map(p=>p.id===playerId?{...p,factionState:next}:p)}};
}
