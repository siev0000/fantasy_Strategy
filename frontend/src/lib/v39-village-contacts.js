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
