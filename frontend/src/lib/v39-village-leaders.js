import config from '../../../config/v39-village-leaders.json';
import {buildV39UnitEntity} from './v39-unit-creation-rules.js';
import {withV39ConversationPersonality} from './v39-conversation-personality.js';

export function withV39VillageLeader(village){
  if(!village||village.abandoned&&!village.leader)return village;
  const race=village.combatRaceName||(village.race==='人間'?'只人':village.race)||'只人';
  const title=config.titleByRace[race]||config.defaultTitle;
  const leader=withV39ConversationPersonality(village.leader||{
    ...buildV39UnitEntity({id:`${village.id}-leader`,name:`${village.name||'村'}の${title}`,race,
      className:config.defaultClass,level:Math.max(config.minimumLevel,Number(village.level)||1),
      x:village.x,y:village.y,settlementId:village.id,isNamed:true,role:'交渉専任'}),
    title,isVillageLeader:true,nonCombatant:true,worldId:'surface',neutralVillageId:village.id,
    conversationPersonality:village.conversationPersonality
  });
  // Non-combat representatives do not need the large derived-data cache.
  if(!village.leader)delete leader.derivedData;
  return {...village,leader,conversationPersonality:leader.conversationPersonality};
}

export const getV39VillageSpeaker=village=>village?.leader||{
  id:`${village?.id}-leader`,name:`${village?.name||'村'}の代表`,race:village?.combatRaceName||village?.race||'只人',
  className:config.defaultClass,conversationPersonality:village?.conversationPersonality
};
