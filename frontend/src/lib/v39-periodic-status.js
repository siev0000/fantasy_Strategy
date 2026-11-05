const n=value=>Math.max(0,Number(value)||0);
export function addV39PeriodicStatus(unit,kind,value,duration,turn){
  if(!(value>0)||!(duration>0))return unit;
  return {...unit,periodicDamage:[...(unit.periodicDamage||[]),{kind,value:n(value),remainingTurns:Math.max(1,Math.floor(duration)),lastTickTurn:turn}]};
}
export function tickV39PeriodicStatus(unit,turn){
  const remaining=[],entries=[];
  for(const effect of unit.periodicDamage||[]){
    if(effect.lastTickTurn>=turn){remaining.push(effect);continue;}
    if(effect.remainingTurns<=0)continue;
    entries.push({kind:effect.kind,damage:Math.floor(n(effect.value))});
    if(effect.remainingTurns>1)remaining.push({...effect,remainingTurns:effect.remainingTurns-1,lastTickTurn:turn});
  }
  return {unit:{...unit,periodicDamage:remaining},entries};
}
export function recoverV39PeriodicPoison(unit,amount){
  return {...unit,periodicDamage:(unit.periodicDamage||[]).map(effect=>effect.kind==='毒'?{...effect,value:Math.max(0,n(effect.value)-n(amount))}:effect).filter(effect=>effect.value>0)};
}
