import {V39_VOLCANO_DAMAGE_BALANCE} from './v39-gameplay-balance.js';

export function damageV39FacilityHealth(source={},requestedDamage=0,turn=1,cause='災害'){
  const maxHp=Math.max(1,Number(source.maxHp)||V39_VOLCANO_DAMAGE_BALANCE.facilityMaxHp);
  const beforeHp=Math.max(0,Math.min(maxHp,Number(source.hp??maxHp)||0));
  const damage=Math.min(beforeHp,Math.max(0,Number(requestedDamage)||0)),afterHp=beforeHp-damage;
  return {beforeHp,afterHp,maxHp,damage,health:{...source,hp:afterHp,maxHp,status:afterHp<=0?'損壊':'稼働',
    lastDamage:damage,lastDamageTurn:turn,lastDamageCause:cause}};
}
