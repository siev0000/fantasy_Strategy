import {disasterData} from './game-data-registry.js';
import {resolveV39DisasterRule} from './v39-disaster-rules.js';

const number=value=>Number.isFinite(Number(value))?Number(value):0;

export function getV39ConditionEventRules(effectType=''){
  return disasterData.map(resolveV39DisasterRule).filter(rule=>rule?.enabled
    &&rule.occurrenceMethods.includes('条件イベント')
    &&Array.isArray(rule.details?.conditionEvent?.conditions)
    &&(!effectType||rule.details.conditionEvent.effects?.some(effect=>effect.type===effectType)));
}

export function getV39ConditionEffect(rule,type){
  return rule?.details?.conditionEvent?.effects?.find(effect=>effect.type===type)||null;
}

export function countV39SettlementConditions(rule,base,{food=false,crowded=false,contamination=false}={}){
  const civic=base?.civicState||{};
  return (rule?.details?.conditionEvent?.conditions||[]).reduce((sum,condition)=>sum+Number(({
    foodShortage:()=>food,
    overcrowding:()=>crowded,
    corpsesOrMiasma:()=>contamination,
    happinessAtMost:()=>number(civic.happiness??100)<=condition.value,
    securityAtMost:()=>number(civic.security??100)<=condition.value
  })[condition.type]?.()===true),0);
}

export function matchesV39SettlementConditions(rule,base,context){
  return countV39SettlementConditions(rule,base,context)>=number(rule?.details?.conditionEvent?.minimumMatches);
}
