import {getHexDistance} from './hex-grid.js';
import {getV39StorageFacilities,getV39FacilityStoredEntries} from './v39-facility-storage.js';
import {DEFAULT_CORPSE_FIELD_TURNS} from './v39-turn-timing.js';

const dead=u=>u&&Number(u.hp??u.currentHp)===0&&['死亡','死体'].includes(u.state)&&!u.summon;
const world=u=>u?.worldId||'surface';
const factionOf=(s,id)=>s.players?.find(p=>p.id===id)?.factionState;
const turnOf=s=>Math.max(1,Number(s.timeline?.turnNumber)||1);

export function getV39CorpseStorageCandidates(state,playerId,facility){
  const faction=factionOf(state,playerId);
  if(!facility||facility.type!=='corpse')return [];
  const nearby=u=>dead(u)&&(!u.deadExpireTurn||u.deadExpireTurn>turnOf(state))&&world(u)===facility.worldId&&Number.isInteger(u.x)&&Number.isInteger(u.y)&&getHexDistance(u,facility)<=1;
  const rows=[...(faction?.units||[]),...(state.enemies||[])].filter(nearby);
  for(const entry of faction?.deadUnitReserve||[])if(!entry.corpseStorage&&dead(entry.unit)&&world(entry.unit)===facility.worldId)rows.push(entry.unit);
  return [...new Map(rows.map(u=>[u.id,u])).values()];
}

export function recoverV39CorpseToFacility(state,playerId,facility,unitId){
  const fail=reason=>({ok:false,reason,state});
  facility=getV39StorageFacilities(state,playerId).find(f=>f.type==='corpse'&&f.tileKey===facility?.tileKey&&f.name===facility?.name);
  if(!facility||state.activePlayerId!==playerId||state.timeline?.phase!=='player')return fail('自分の操作ターンに自軍の霊廟から回収してください');
  const faction=factionOf(state,playerId),unit=getV39CorpseStorageCandidates(state,playerId,facility).find(u=>u.id===unitId);
  if(!unit)return fail('施設上・隣接の死体、または回収済み遺体を選択してください');
  if(facility.capacity&&getV39FacilityStoredEntries(state,playerId,facility).length>=facility.capacity)return fail('保管上限です');
  if((faction.deadUnitReserve||[]).some(e=>e.unit?.id===unitId&&e.corpseStorage))return fail('既に保管されています');
  const turn=turnOf(state),previous=(faction.deadUnitReserve||[]).find(e=>e.unit?.id===unitId);
  const corpseStorage={tileKey:facility.tileKey,facilityName:facility.name,worldId:facility.worldId,
    remainingTurns:Math.max(1,(Number(unit.deadExpireTurn)||turn+DEFAULT_CORPSE_FIELD_TURNS)-turn)};
  const reserve={...previous,unitId,unit:{...structuredClone(unit),ap:0,currentAp:0,actionPoint:0},reason:'霊廟保管',storedAtTurn:turn,storedAtMs:Date.now(),corpseStorage};
  const next={...faction,units:faction.units.filter(u=>u.id!==unitId),
    squads:(faction.squads||[]).map(s=>({...s,unitIds:(s.unitIds||[]).filter(id=>id!==unitId),memberIds:(s.memberIds||[]).filter(id=>id!==unitId)})),
    selectedUnitId:faction.selectedUnitId===unitId?'':faction.selectedUnitId,
    deadUnitReserve:[...(faction.deadUnitReserve||[]).filter(e=>e.unit?.id!==unitId),reserve],
    deathHistory:[...(faction.deathHistory||[]),{id:`mausoleum-${unitId}-${turn}`,unitId,unitName:unit.name,type:'霊廟保管',turn,atMs:Date.now(),x:unit.x,y:unit.y,cause:unit.deathCause,
      equipment:structuredClone(unit.equipment||[]),affiliation:{squadId:unit.squadId,race:unit.race,className:unit.className}}]};
  return {ok:true,state:{...state,enemies:(state.enemies||[]).filter(u=>u.id!==unitId),
    players:state.players.map(p=>p.id===playerId?{...p,factionState:next}:p)}};
}

export function releaseV39StoredCorpse(state,playerId,facility,unitId){
  const fail=reason=>({ok:false,reason,state});
  facility=getV39StorageFacilities(state,playerId).find(f=>f.type==='corpse'&&f.tileKey===facility?.tileKey&&f.name===facility?.name);
  const faction=factionOf(state,playerId),entry=getV39FacilityStoredEntries(state,playerId,facility).find(e=>e.unit?.id===unitId);
  if(!facility||!entry||state.activePlayerId!==playerId||state.timeline?.phase!=='player')return fail('操作可能な自軍の霊廟が必要です');
  // Resume only the unspent field lifetime; withdrawing never revives the body.
  const unit={...structuredClone(entry.unit),x:facility.x,y:facility.y,position:[facility.x,facility.y],worldId:facility.worldId,
    hp:0,currentHp:0,ap:0,currentAp:0,state:'死亡',squadId:'solo',deadExpireTurn:turnOf(state)+Math.max(1,entry.corpseStorage.remainingTurns||1)};
  const next={...faction,units:[...faction.units,unit],deadUnitReserve:faction.deadUnitReserve.filter(e=>e!==entry)};
  return {ok:true,state:{...state,players:state.players.map(p=>p.id===playerId?{...p,factionState:next}:p)}};
}
