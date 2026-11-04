import config from '../../../config/v39-skill-triggers.json';
const n=value=>Math.max(0,Number(value)||0);
const round=value=>Math.round(value*1e6)/1e6;

export function addV39Bleeding(unit, amount, turn, rule=config.bleeding) {
  const added=n(amount);
  if(!added)return unit;
  const value=round(n(unit.bleeding?.value)+added);
  return {...unit,bleeding:{value,initialValue:value,remainingTurns:rule.durationTurns,lastTickTurn:turn}};
}

export function reduceV39Bleeding(unit, actualHealing, rule=config.bleeding) {
  if(!unit.bleeding)return unit;
  const value=round(Math.max(0,n(unit.bleeding.value)-n(actualHealing)*rule.healingReductionRate));
  return {...unit,bleeding:value>0?{...unit.bleeding,value}:null};
}

export function tickV39Bleeding(unit, turn, rule=config.bleeding) {
  const bleeding=unit.bleeding;
  if(!bleeding || n(bleeding.value)<=0 || n(unit.hp??unit.currentHp)<=0 || Number(bleeding.lastTickTurn)>=turn)return {unit,damage:0};
  const damage=Math.floor(n(bleeding.value)/rule.damageDivisor);
  const remainingTurns=Math.max(0,n(bleeding.remainingTurns)-1);
  const value=remainingTurns?round(Math.max(0,n(bleeding.value)-n(bleeding.initialValue)/rule.durationTurns)):0;
  return {damage,unit:{...unit,bleeding:value>0?{...bleeding,value,remainingTurns,lastTickTurn:turn}:null}};
}

export function describeV39Bleeding(unit,rule=config.bleeding){
  const value=n(unit?.bleeding?.value);
  return value>0?{value,damage:Math.floor(value/rule.damageDivisor),remainingTurns:n(unit.bleeding.remainingTurns)}:null;
}
