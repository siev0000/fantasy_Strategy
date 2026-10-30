import {getHexDistance} from './hex-grid.js';
import {getFactionSettlements} from './settlement-state.js';

export function isV39VillageContactUnit(unit,village){
  if(!unit||!village||Number(unit.hp??unit.currentHp)<=0||!Number.isFinite(Number(unit.hp??unit.currentHp))
    ||unit.state==='死亡'||unit.pendingWorldExit||(unit.worldId||'surface')!=='surface'
    ||(village.worldId||'surface')!=='surface'||!Number.isFinite(Number(unit.x))||!Number.isFinite(Number(unit.y)))return false;
  const keys=village.territoryTileKeys?.length?village.territoryTileKeys:[`${village.x},${village.y}`];
  return keys.some(key=>{const [x,y]=String(key).split(',').map(Number);return Number.isFinite(x)&&Number.isFinite(y)&&getHexDistance(unit,{x,y})<=1;});
}

export function resolveV39MapContact(state,tile){
  if(!state||(state.activeWorldId||'surface')!=='surface')return null;
  const player=state.players?.find(row=>row.id===state.activePlayerId);
  if(!player)return null;
  const key=tile?`${tile.x},${tile.y}`:'',units=player.factionState?.units||[];
  const selected=units.find(unit=>unit.id===player.factionState.selectedUnitId);
  const candidates=[...units.filter(unit=>`${unit.x},${unit.y}`===key),...(selected?[selected]:[])];
  const byOwner=new Map();
  for(const [key,owner] of Object.entries(state.territoryOwnerByTile||{})){
    if(owner===player.id)continue;
    if(!byOwner.has(owner))byOwner.set(owner,[]);byOwner.get(owner).push(key);
  }
  const targets=[...(state.neutralVillages||[]).map(village=>({kind:'village',id:village.id,village,area:{...village,
    territoryTileKeys:[...new Set([...(village.territoryTileKeys||[]),...(byOwner.get(village.id)||[])])]}})),
    ...(state.players||[]).filter(row=>row.id!==player.id).map(faction=>{
      const bases=getFactionSettlements(faction.factionState).filter(base=>base.placed&&(base.worldId||'surface')==='surface');
      return {kind:'faction',id:faction.id,faction,area:{worldId:'surface',territoryTileKeys:[...new Set([...(byOwner.get(faction.id)||[]),...bases.flatMap(base=>base.territoryTileKeys?.length?base.territoryTileKeys:[`${base.x},${base.y}`])])]}};
    })];
  const direct=targets.find(target=>target.area.territoryTileKeys.includes(key)||(target.kind==='village'&&`${target.village.x},${target.village.y}`===key));
  if(direct)return {...direct,actor:candidates.find(unit=>isV39VillageContactUnit(unit,direct.area))||units.find(unit=>isV39VillageContactUnit(unit,direct.area))||null};
  for(const unit of candidates){const target=targets.find(target=>isV39VillageContactUnit(unit,target.area));if(target)return {...target,actor:unit};}
  return null;
}

export function hasV39VillageContact(village, playerId) {
  if(!playerId)return false;
  return village.contactedByPlayerIds?.includes(playerId)||
    ['relationsByPlayerId','questLogByPlayerId','questsByPlayerId','eventCompletedTurnByPlayerId']
      .some(key=>Object.prototype.hasOwnProperty.call(village[key]||{},playerId))||
    village.vassalPlayerId===playerId||village.lastPlayerRaid?.playerId===playerId;
}

export function recordV39VillageContact(state, villageId, playerId) {
  const village=state?.neutralVillages?.find(row=>row.id===villageId);
  if(!village||!playerId||village.contactedByPlayerIds?.includes(playerId))return null;
  return state.neutralVillages.map(row=>row.id!==villageId?row:
    {...row,contactedByPlayerIds:[...(row.contactedByPlayerIds||[]),playerId]});
}
