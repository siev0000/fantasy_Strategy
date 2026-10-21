export function isV39VillageHostileToPlayer(village,playerId){
  if(!village||!playerId||village.abandoned)return false;
  return Array.isArray(village.hostilePlayerIds)?village.hostilePlayerIds.includes(playerId):village.lastPlayerRaid?.playerId===playerId;
}
export function v39VillageHostilePlayerUnits(state,village){
  return (state.players||[]).filter(player=>isV39VillageHostileToPlayer(village,player.id))
    .flatMap(player=>(player.factionState?.units||[]).filter(unit=>(unit.worldId||'surface')==='surface'&&Number(unit.hp??unit.currentHp)>0&&unit.state!=='死亡'));
}
