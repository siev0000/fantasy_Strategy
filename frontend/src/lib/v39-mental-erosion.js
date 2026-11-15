import config from '../../../config/v39-mental-erosion.json';
import {addAbilityDamage} from './v39-ability-damage.js';
import {resolveV39HarmfulEffectPower} from './v39-combat-engine.js';

const disasterId='精神浸食';
const mentalAttack={攻撃手段:'魔法',判定:'魔力'};

function rollPower(event,unit,turn){
  let hash=2166136261;
  for(const char of `${event.id||disasterId}:${turn}:${unit.id||''}`){
    hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);
  }
  const minimum=Math.max(0,Math.floor(Number(config.minimumPower)||0));
  const maximum=Math.max(minimum,Math.floor(Number(config.maximumPower)||0));
  return minimum+(hash>>>0)%(maximum-minimum+1);
}

export function applyV39MentalErosion(unit,events,turn){
  if(!unit||Number(unit.hp??unit.currentHp)<=0||unit.state==='死亡')return {unit,power:0,damage:0};
  const tile=`${unit.x},${unit.y}`;
  const relevant=(events||[]).filter(event=>event.disasterId===disasterId
    &&Number(event.lastTickTurn||0)<turn&&event.tileKeys?.includes(tile));
  if(!relevant.length)return {unit,power:0,damage:0};
  const strongest=relevant.map(event=>{
    const power=rollPower(event,unit,turn);
    return {power,damage:resolveV39HarmfulEffectPower({status:{}},unit,mentalAttack,power,'精神')};
  }).reduce((best,row)=>row.damage>best.damage?row:best,{power:0,damage:0});
  return {...strongest,unit:addAbilityDamage(unit,'精神',strongest.damage)};
}
