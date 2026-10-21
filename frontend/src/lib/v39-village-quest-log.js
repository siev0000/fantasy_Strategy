const key=quest=>JSON.stringify([quest.eventId||quest.dialogueEventId||'',quest.id||'']);
const index=records=>Object.fromEntries(Object.values(records||{}).filter(Boolean).map(quest=>[key(quest),quest]));

export function getV39VillageQuests(village,playerId){
  const records=index(village?.questLogByPlayerId?.[playerId]),legacy=village?.questsByPlayerId?.[playerId];
  if(legacy&&key(legacy))records[key(legacy)]=legacy;
  return Object.values(records);
}
export function findV39VillageQuest(village,playerId,eventId){
  return getV39VillageQuests(village,playerId).reverse().find(quest=>quest.eventId===eventId||quest.dialogueEventId===eventId);
}
export function syncV39VillageQuestLog(village){
  const log=Object.fromEntries(Object.entries(village.questLogByPlayerId||{}).map(([playerId,records])=>[playerId,index(records)]));
  for(const [playerId,quest] of Object.entries(village.questsByPlayerId||{})){
    if(quest&&key(quest))log[playerId]={...log[playerId],[key(quest)]:quest};
  }
  return {...village,questLogByPlayerId:log};
}
