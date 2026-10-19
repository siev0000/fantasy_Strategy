import {resolveV39DisasterRule} from './v39-disaster-rules.js';

export function resolveV39DisasterDamageTiles(event,turn) {
  if(event.damageTickTurn===turn&&Array.isArray(event.damageTileKeys))return [...event.damageTileKeys];
  const rule=resolveV39DisasterRule(event.disasterId);
  const keys=[...new Set(event.tileKeys||[])];
  if((event.damagePattern??rule?.damagePattern)!=='ランダム')return keys;
  const tilesPerHit=Math.max(0,Number(event.randomDamageTilesPerHit??rule?.randomDamageTilesPerHit)||0);
  const expected=tilesPerHit>0?keys.length/tilesPerHit:Math.max(0,Math.floor(Number(event.randomDamageTileCount??rule?.randomDamageTileCount)||0));
  // Stable per event/turn: reloading cannot reroll a strike, and empty tiles are eligible.
  let seed=2166136261;
  for(const char of `${event.id}:${turn}`){seed^=char.charCodeAt(0);seed=Math.imul(seed,16777619);}
  const random=()=>{
    seed=(seed+0x6D2B79F5)|0;
    let value=Math.imul(seed^(seed>>>15),1|seed);
    value^=value+Math.imul(value^(value>>>7),61|value);
    return ((value^(value>>>14))>>>0)/4294967296;
  };
  const whole=Math.floor(expected),fraction=expected-whole;
  const count=Math.min(keys.length,whole+(fraction>0&&random()<fraction?1:0));
  for(let i=keys.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[keys[i],keys[j]]=[keys[j],keys[i]];}
  return keys.slice(0,count);
}
