export const V39_CONTROL_STATUS_FIELDS = {
  睡眠:['精神攻撃','精神'],
  沈黙:['魔法'],
  感電:['雷'],
  凍結:['氷']
};

export const V39_ELEMENTAL_CONTROL_RESISTANCES = {感電:'雷耐性',凍結:'氷耐性'};

const pointsPerTurn = 100;
const naturalThawPerTurn = 10;
export const V39_NUMERIC_STATUSES = ['盲目','幻覚','疲労','麻痺'];

export function readV39NumericStatus(unit,kind) {
  return Math.max(0,Number(unit?.numericStatuses?.[kind])||0);
}

export function resolveV39PerceptionDamage(unit) {
  return readV39NumericStatus(unit,'盲目')+readV39NumericStatus(unit,'幻覚');
}

export function resolveV39FatigueApLoss(unit) {
  return Math.floor(readV39NumericStatus(unit,'疲労')/5);
}

export function resolveV39MaxAp(unit,base=Number(unit?.maxAp??unit?.maxActionPoint??100)||0) {
  return Math.max(0,base-resolveV39FatigueApLoss(unit));
}

export function addV39NumericStatus(unit,kind,amount) {
  if(amount<=0)return unit;
  const next={...unit,numericStatuses:{...unit.numericStatuses,[kind]:readV39NumericStatus(unit,kind)+amount}};
  if(kind==='麻痺')return subtractAp(next,amount);
  if(kind!=='疲労')return next;
  const base=Math.max(0,Number(unit.maxAp??unit.maxActionPoint??100)||0);
  const ap=Math.max(0,Number(unit.ap??unit.currentAp??base)||0);
  const cap=resolveV39MaxAp(next,base);
  return ap>cap?subtractAp(next,ap-cap):next;
}

export function recoverV39NumericStatus(unit,kind,amount) {
  if(amount<=0)return unit;
  const value=readV39NumericStatus(unit,kind);
  if(value<=0)return unit;
  const numericStatuses={...unit.numericStatuses};
  if(value>amount)numericStatuses[kind]=value-amount;
  else delete numericStatuses[kind];
  return {...unit,numericStatuses};
}

export function clearV39WeakerStatuses(unit,power) {
  if(!(power>0))return unit;
  const weaker=value=>Number(value)>0&&Number(value)<power;
  let next=unit;
  for(const key of ['numericStatuses','abilityDamage','abilityCurses','abilityPoison']){
    const statuses=Object.entries(unit[key]||{});
    const remaining=statuses.filter(([,value])=>!weaker(value));
    if(remaining.length!==statuses.length)next={...next,[key]:Object.fromEntries(remaining)};
  }
  for(const key of ['bleeding','restraint']){
    if(weaker(unit[key]?.value))next={...next,[key]:null};
  }
  if(weaker(unit.controlStatuses?.凍結?.value))next=thawV39Unit(next);
  const totals=new Map();
  for(const effect of unit.periodicDamage||[]){
    if(effect.remainingTurns>0)totals.set(effect.kind,(totals.get(effect.kind)||0)+(Number(effect.value)||0));
  }
  const periodic=(unit.periodicDamage||[]).filter(effect=>!weaker(totals.get(effect.kind)));
  if(periodic.length!==(unit.periodicDamage||[]).length)next={...next,periodicDamage:periodic};
  return next;
}

export function resolveV39ControlStatusPower(row, effects, kind) {
  if (!effects.includes(kind)) return 0;
  return Math.max(0, ...V39_CONTROL_STATUS_FIELDS[kind].map(key => Number(row[key]) || 0));
}

export function resolveV39NumericStatusPower(row,effects,kind) {
  const value=key=>Math.max(0,Number(row[key])||0);
  if(kind==='疲労')return effects.includes(kind)?value('呪い'):0;
  if(kind==='麻痺')return effects.includes(kind)?value('毒')+value('呪い'):0;
  return value(kind);
}

export function addV39ControlStatus(unit, kind, amount, turn) {
  if (amount <= 0) return unit;
  const previous = unit.controlStatuses?.[kind];
  const accumulated = (previous?.value || 0) + amount;
  if (kind === '凍結') {
    return subtractAp({...unit,controlStatuses:{...unit.controlStatuses,凍結:{value:accumulated,appliedTurn:turn}}},amount);
  }
  const turns = Math.floor(accumulated / pointsPerTurn);
  const active = hasV39ControlStatus(unit,kind,turn);
  const expiresAtTurn = turns
    ? Math.max(turn, previous?.expiresAtTurn || 0) + turns
    : previous?.expiresAtTurn || 0;
  const remainder = accumulated % pointsPerTurn;
  const status = {...previous,value:turns?0:remainder,expiresAtTurn};
  if(kind==='感電'&&turns&&!active)status.startedAtTurn=turn;
  const next = {...unit,controlStatuses:{...unit.controlStatuses,[kind]:status}};
  if(turns&&remainder>0){
    const prior=unit.controlApRemainder?.turn===turn?unit.controlApRemainder.amount:0;
    next.controlApRemainder={turn,amount:prior+remainder};
  }
  const apLoss = turns ? remainder+(kind==='感電'&&!active?pointsPerTurn:0) : 0;
  return apLoss>0?subtractAp(next,apLoss):next;
}

function subtractAp(unit, amount) {
  const ap = Math.max(0,(Number(unit.ap ?? unit.currentAp ?? unit.actionPoint ?? 100) || 0) - amount);
  return {...unit,ap,currentAp:ap,actionPoint:ap};
}

export function thawV39Unit(unit) {
  if (!unit?.controlStatuses?.凍結) return unit;
  const {凍結, ...controlStatuses} = unit.controlStatuses;
  return {...unit,controlStatuses};
}

export function advanceV39ControlStatuses(unit, turn) {
  let next = unit;
  const frozen = unit.controlStatuses?.凍結;
  if (frozen?.value > 0 && frozen.appliedTurn!==turn) {
    const value = Math.max(0,frozen.value-naturalThawPerTurn);
    next = value > 0
      ? {...next,controlStatuses:{...next.controlStatuses,凍結:{value}}}
      : thawV39Unit(next);
  }
  return applyV39ControlTurnAp(next,turn);
}

export function applyV39ControlTurnAp(unit, turn, {restored=false}={}) {
  const remainder=restored&&unit.controlApRemainder?.turn===turn?unit.controlApRemainder.amount:0;
  const frozen = unit.controlStatuses?.凍結;
  const shock = unit.controlStatuses?.感電;
  const freezeLoss = restored || frozen?.appliedTurn!==turn ? Number(frozen?.value)||0 : 0;
  const shockLoss = hasV39ControlStatus(unit,'感電',turn) && (restored || shock?.startedAtTurn!==turn) ? pointsPerTurn : 0;
  const amount = freezeLoss + shockLoss + remainder + (restored?readV39NumericStatus(unit,'麻痺'):0);
  return amount>0?subtractAp(unit,amount):unit;
}

export function hasV39ControlStatus(unit, kind, turn) {
  return (unit?.controlStatuses?.[kind]?.expiresAtTurn || 0) > turn;
}

export function getV39ActionBlock(unit, turn, action, row) {
  if (unit?.knockedDown && action !== 'passive') return '転倒';
  if (unit?.staggeredTurn === turn && unit?.staggeredTurn != null && Number(unit.ap ?? unit.currentAp) <= 0) return '怯み';
  if (hasV39ControlStatus(unit,'睡眠',turn)) return '睡眠';
  if (action !== 'move' && hasV39ControlStatus(unit,'沈黙',turn)
      && (row?.攻撃手段 === '魔法' || row?.判定 === '魔力' || Number(row?.魔法) > 0)) return '沈黙';
  return '';
}

export const V39_STAND_UP_AP_COST = 20;

export function standUpV39Unit(unit, turn) {
  const ap = Number(unit?.ap ?? unit?.currentAp) || 0;
  if (!unit?.knockedDown || Number(unit.hp ?? unit.currentHp) <= 0 || ap < V39_STAND_UP_AP_COST) return unit;
  if (hasV39ControlStatus(unit,'睡眠',turn)) return unit;
  const remaining = ap - V39_STAND_UP_AP_COST;
  return {...unit,knockedDown:false,ap:remaining,currentAp:remaining,actionPoint:remaining};
}
