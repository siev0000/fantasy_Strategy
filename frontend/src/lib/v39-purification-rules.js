import {V39_UNDEAD_SPAWN_BALANCE as balance,V39_FOG_BALANCE} from "./v39-gameplay-balance.js";
import {resolveV39TerrainNameAt} from "./v39-terrain-location.js";
import {canV39UnitLeaveOrganicCorpse} from './v39-corpse-types.js';
import {resolveV39CitySpecializationModifiers,getV39SelectedCityDefinitions} from './v39-city-specialization-rules.js';
import {getHexDistance} from './hex-grid.js';
import {territorySettlementId,getFactionSettlementById,getSelectedSettlement} from './settlement-state.js';
export {isV39Undead} from './v39-corpse-types.js';
const key=unit=>`${unit.x},${unit.y}`;
export function normalizeV39Purification(value) {
  const parsed=Number(value);
  return Math.max(balance.minimumPurification,Number.isFinite(parsed)?parsed:0);
}
export function normalizeV39MapPurification(map) {
  for(const [tile,value] of Object.entries(map?.purificationByTile||{}))map.purificationByTile[tile]=normalizeV39Purification(value);
  return map;
}
export function changeV39Purification(map,tileKey,delta) {
  const [x,y]=String(tileKey).split(',').map(Number);
  if(!Number.isInteger(x)||!Number.isInteger(y)||!map?.grid?.[y]?.[x])return false;
  map.purificationByTile ||= {};
  const amount=Number(delta);
  map.purificationByTile[tileKey]=normalizeV39Purification(normalizeV39Purification(map.purificationByTile[tileKey])+(Number.isFinite(amount)?amount:0));
  return true;
}
export function applyV39DeathBlade(map,attacker,entries) {
  const names=[...(attacker?.techniques || []).map(row=>row.name || row.名前 || row.source?.名前),...(attacker?.skills || []).map(row=>typeof row==='string'?row:row.name || row.名前),...(attacker?.passiveBaseSkillNames || [])];
  if(!names.includes('死の刃'))return 0;
  const tiles=new Set(entries.filter(row=>Number(row.beforeHp)>0&&Number(row.afterHp)<=0&&Number(row.total)>0).map(key));
  for(const tile of tiles)changeV39Purification(map,tile,-balance.deathBladePurificationLoss);
  return tiles.size;
}
export function advanceV39Purification(map,state,turn,random=Math.random) {
  normalizeV39MapPurification(map);
  if(!map?.grid || map.lastPurificationTurn>=turn)return [];
  map.lastPurificationTurn=turn;
  const corpses=new Set(Object.entries(state.groundLootByTile || {}).filter(([,loot])=>Number((loot.cargo || loot)?.resourcesByType?.死体)>=V39_FOG_BALANCE.corpseResourcePerBody).map(([key])=>key));
  const units=[...(state.enemies || []),...(state.players || []).flatMap(player=>player.factionState?.units || []),...(state.neutralVillages || []).flatMap(village=>village.defenseUnits || [])];
  for(const unit of units)if(canV39UnitLeaveOrganicCorpse(unit)&&(unit.worldId || 'surface')===(state.activeWorldId || 'surface')&&(unit.state==='死亡'||Number(unit.hp ?? unit.currentHp)<=0)
    &&(!unit.deadExpireTurn||unit.deadExpireTurn>turn))corpses.add(key(unit));
  for(const tile of corpses)changeV39Purification(map,tile,-balance.corpsePurificationLoss);
  for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++)
    if(map.fogMap?.[y]?.[x]?.kind==='death'||map.specialMap?.[y]?.[x]==='死の霧'||map.grid[y]?.[x]==='死の霧')changeV39Purification(map,`${x},${y}`,-balance.fogPurificationLoss);
  const cities=new Map();
  for(const [tile,owner] of Object.entries(state.territoryOwnerByTile||{})) {
    const player=state.players?.find(row=>row.id===owner),id=territorySettlementId(state.territoryStateByTile?.[tile]);
    const cacheKey=`${owner}:${id}`;
    if(!cities.has(cacheKey)){
      const base=id?getFactionSettlementById(player?.factionState,id):getSelectedSettlement(player?.factionState);
      cities.set(cacheKey,{base,scoped:getV39SelectedCityDefinitions(base).some(row=>row.効果範囲&&row.効果範囲!=='所属領土'),amounts:new Map()});
    }
    const city=cities.get(cacheKey),base=city.base;
    if(!base?.placed||(base.worldId||'surface')!==(state.activeWorldId||'surface'))continue;
    const [x,y]=tile.split(',').map(Number),distance=city.scoped?getHexDistance(base,{x,y}):'*';
    if(!city.amounts.has(distance)){
      const modifiers=resolveV39CitySpecializationModifiers(base,{tileKey:tile,worldId:state.activeWorldId||'surface'});
      city.amounts.set(distance,modifiers.purification-modifiers.impurity);
    }
    const amount=city.amounts.get(distance);if(amount)changeV39Purification(map,tile,amount);
  }
  map.unholyEventTurnByTile ||= {};
  const events=[];
  for(const [tile,value] of Object.entries(map.purificationByTile || {})) {
    const [x,y]=tile.split(',').map(Number);
    if(value>balance.purificationThreshold||turn-(map.unholyEventTurnByTile[tile] ?? -Infinity)<balance.sameTileCooldownTurns
      ||['海','湖','火山','溶岩','岩壁','壁'].includes(resolveV39TerrainNameAt(map,x,y)))continue;
    const roll=random();
    const type=roll<balance.unholyFogChance?'fog':roll<balance.unholyFogChance+balance.unholyUndeadChance?'undead':null;
    if(!type)continue;
    events.push({x,y,key:tile,type});map.unholyEventTurnByTile[tile]=turn;
  }
  return events;
}
