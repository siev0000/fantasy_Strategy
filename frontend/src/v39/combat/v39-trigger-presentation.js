// Reactions use the normal map-effect resolver, including explicit animations and category settings.
export function playV39TriggerEffect(log){
  const api=globalThis.window;
  if(!api||api.__v39SuppressCombatEffects===true||!log.skillRow||!log.entry||!log.attacker)return false;
  const attacker=log.attacker,target=log.entry;
  const world=api.getV39GameState?.({includeWorlds:false})?.activeWorldId;
  if(world&&(attacker.worldId||'surface')!==world)return false;
  if(![attacker.x,attacker.y,target.x,target.y].every(Number.isFinite)||typeof api.playV39MapEffect!=='function')return false;
  void api.playV39MapEffect({skillRow:log.skillRow,attacker,hitEntries:[target],
    areaTiles:[{x:target.x,y:target.y}],attackerTile:{x:attacker.x,y:attacker.y},
    tileX:target.x,tileY:target.y,splash:0});
  return true;
}
