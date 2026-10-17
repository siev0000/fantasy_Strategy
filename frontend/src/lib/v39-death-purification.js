import {getGameDataRows} from './game-data-registry.js';
import {getFactionSettlements,territorySettlementId} from './settlement-state.js';
import {changeV39Purification} from './v39-purification-rules.js';
import {V39_UNDEAD_SPAWN_BALANCE as balance} from './v39-gameplay-balance.js';

const world=unit=>unit?.worldId||'surface';
const dead=unit=>['死亡','死体'].includes(unit?.state)||Number(unit?.hp??unit?.currentHp)<=0;
const protectionByName=new Map(getGameDataRows('施設').map(row=>[row.施設名,Math.max(0,Math.floor(Number(row.死亡浄化保護数)||0))]));
function units(state,fields){
  return [...(fields.includes('players')?(state.players||[]).flatMap(p=>p.factionState?.units||[]):[]),
    ...(fields.includes('enemies')?state.enemies||[]:[]),
    ...(fields.includes('neutralVillages')?(state.neutralVillages||[]).flatMap(v=>v.defenseUnits||[]):[])];
}
export function findV39NewUnitDeaths(before,after,fields=['players','enemies','neutralVillages']){
  const candidates=units(after,fields).filter(unit=>dead(unit)&&!unit.summon);
  if(!candidates.length)return [];
  const ids=new Set(candidates.map(u=>`${world(u)}:${u.id}`));
  const previous=new Map(units(before,fields).filter(u=>ids.has(`${world(u)}:${u.id}`)).map(u=>[`${world(u)}:${u.id}`,u]));
  const result=new Map();
  for(const unit of candidates){
    const id=`${world(unit)}:${unit.id}`,old=previous.get(id);
    if(old&&Number(old.hp??old.currentHp)>0&&!dead(old)&&dead(unit)&&!unit.summon)result.set(id,unit);
  }
  return [...result.values()];
}
function scopeAt(state,tileKey){
  const owner=state.territoryOwnerByTile?.[tileKey];if(!owner)return null;
  const player=state.players?.find(p=>p.id===owner);
  const bases=player?getFactionSettlements(player.factionState):(state.neutralVillages||[]).filter(v=>v.id===owner||v.ownerPlayerId===owner);
  const id=territorySettlementId(state.territoryStateByTile?.[tileKey]);
  const base=id?bases.find(b=>(b.settlementId||b.id)===id):bases.find(b=>b.territoryTileKeys?.includes(tileKey))||(bases.length===1?bases[0]:null);
  return base?{owner,id:base.settlementId||base.id}:null;
}
export function getV39DeathProtectionStatus(map,state,owner,id){
  let capacity=0;
  for(const [key,names] of Object.entries(state.facilitiesByTile||{})){
    const scope=scopeAt(state,key);
    if(scope?.owner!==owner||scope?.id!==id)continue;
    for(const name of new Set(Array.isArray(names)?names:[]))capacity+=protectionByName.get(name)||0;
  }
  const turn=state.timeline?.turnNumber||1,ledger=map?.deathPurificationProtection;
  const used=ledger?.turn===turn?Number(ledger.usedBySettlement?.[`${owner}/${id}`])||0:0;
  return {capacity,used,remaining:Math.max(0,capacity-used)};
}
export function applyV39DeathPurification(map,state,deaths){
  const applicable=deaths.filter(u=>world(u)===(state.activeWorldId||'surface')&&Number.isInteger(u.x)&&Number.isInteger(u.y)&&map?.grid?.[u.y]?.[u.x]);
  if(!applicable.length)return {map,changed:false,protectedCount:0,lossCount:0};
  const turn=state.timeline?.turnNumber||1,old=map.deathPurificationProtection;
  const next={...map,purificationByTile:{...map.purificationByTile},deathPurificationProtection:{turn,usedBySettlement:old?.turn===turn?{...old.usedBySettlement}:{}}};
  let protectedCount=0,lossCount=0;
  const capacities=new Map();
  for(const unit of applicable){
    const key=`${unit.x},${unit.y}`,scope=scopeAt(state,key),scopeKey=scope?`${scope.owner}/${scope.id}`:'';
    if(scope&&!capacities.has(scopeKey))capacities.set(scopeKey,getV39DeathProtectionStatus(next,state,scope.owner,scope.id).capacity);
    const used=Number(next.deathPurificationProtection.usedBySettlement[scopeKey])||0;
    if(scope&&used<(capacities.get(scopeKey)||0)){
      next.deathPurificationProtection.usedBySettlement[scopeKey]=used+1;protectedCount++;
    }else{changeV39Purification(next,key,-balance.deathPurificationLoss);lossCount++;}
  }
  return {map:next,changed:true,protectedCount,lossCount};
}
