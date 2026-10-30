import balance from '../../../config/v39-soul-recovery.json';

// Old saves store whole-soul equivalents. Normal soul UI shows resource value, not a count of people.
export function resolveV39SoulResourceValue(storedAmount){
  const value=Number(storedAmount);
  return Number.isFinite(value)?Math.round(value*balance.pointsPerSoul*1e6)/1e6:0;
}
export const v39CargoResourceDisplayAmount=(name,amount)=>name==='魂'?resolveV39SoulResourceValue(amount):amount;
