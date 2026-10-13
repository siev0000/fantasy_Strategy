import {V39_UNDEAD_SPAWN_BALANCE as balance,V39_FOG_BALANCE} from "./v39-gameplay-balance.js";
import {resolveV39TerrainNameAt} from "./v39-terrain-location.js";
import {getGameDataRows} from "./game-data-registry.js";
const key=unit=>`${unit.x},${unit.y}`;
const undeadClasses=new Set(getGameDataRows('クラス').filter(row=>/アンデッド|不死/.test(String(row.種類 || ''))).map(row=>row.名前));
export const isV39Undead = unit => unit?.isUndead===true || /アンデッド|ゾンビ|スケルトン|リッチ|レイス/.test(`${unit?.race || ''} ${unit?.className || ''}`)
  || undeadClasses.has(unit?.race) || undeadClasses.has(unit?.className);
export function changeV39Purification(map,tileKey,delta) {
  const [x,y]=String(tileKey).split(',').map(Number);
  if(!Number.isInteger(x)||!Number.isInteger(y)||!map?.grid?.[y]?.[x])return false;
  map.purificationByTile ||= {};
  map.purificationByTile[tileKey]=(Number(map.purificationByTile[tileKey]) || 0)+delta;
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
  if(!map?.grid || map.lastPurificationTurn>=turn)return [];
  map.lastPurificationTurn=turn;
  const corpses=new Set(Object.entries(state.groundLootByTile || {}).filter(([,loot])=>Number((loot.cargo || loot)?.resourcesByType?.死体)>=V39_FOG_BALANCE.corpseResourcePerBody).map(([key])=>key));
  const units=[...(state.enemies || []),...(state.players || []).flatMap(player=>player.factionState?.units || []),...(state.neutralVillages || []).flatMap(village=>village.defenseUnits || [])];
  for(const unit of units)if((unit.worldId || 'surface')===(state.activeWorldId || 'surface')&&(unit.state==='死亡'||Number(unit.hp ?? unit.currentHp)<=0)
    &&(!unit.deadExpireTurn||unit.deadExpireTurn>turn))corpses.add(key(unit));
  for(const tile of corpses)changeV39Purification(map,tile,-balance.corpsePurificationLoss);
  for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++)
    if(map.fogMap?.[y]?.[x]?.kind==='death'||map.specialMap?.[y]?.[x]==='死の霧'||map.grid[y]?.[x]==='死の霧')changeV39Purification(map,`${x},${y}`,-balance.fogPurificationLoss);
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
