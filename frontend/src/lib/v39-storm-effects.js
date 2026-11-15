import config from '../../../config/v39-storm-effects.json';
import {readV39UnitResistance} from './v39-reduction-keys.js';
import {resolveV39ResistanceReduction} from './v39-resistance-math.js';
import {v39HexRay} from './v39-combat-ray.js';

export function resolveV39StormPower(event){
  const magic=event?.origin==='magic'?Number(event?.details?.magicPower):NaN;
  return Number.isFinite(magic)?Math.max(0,magic):config.naturalPower;
}

export function resolveV39DisasterPenaltyDamage(unit,power,resistanceKey){
  const resistance=Math.max(0,Number(readV39UnitResistance(unit,resistanceKey))||0);
  const reduced=resolveV39ResistanceReduction(power,unit?.level??unit?.status?.Lv??1,resistance,0,resistanceKey);
  return Math.max(0,Math.floor(reduced.reducedPower*(1-reduced.resistanceRate)));
}

export const resolveV39StormBodyDamage=(unit,power)=>resolveV39DisasterPenaltyDamage(unit,power,'体幹耐性');

function fieldMovementLoss(map,unit,points,id,powerKey,resistanceKey){
  const fields=(map?.disasterFields||[]).filter(field=>field.disasterId===id
    &&points.some(point=>field.tileKeys?.includes(`${point?.x},${point?.y}`)));
  return Math.max(0,...fields.map(field=>resolveV39DisasterPenaltyDamage(unit,field[powerKey],resistanceKey)));
}

export const resolveV39StormFlightLoss=(map,unit,points=[unit])=>fieldMovementLoss(map,unit,points,'暴風','stormPower','体幹耐性');
export const resolveV39ColdWaveMovementLoss=(map,unit,points=[unit])=>fieldMovementLoss(map,unit,points,'大寒波','coldPower','氷耐性');

function fieldShotLoss(map,attacker,target,id,powerKey,resistanceKey){
  if(!map||!attacker||!target)return 0;
  const tiles=[attacker,...v39HexRay(map,attacker,target)];
  let loss=0;
  for(const point of tiles){
    const fields=(map.disasterFields||[]).filter(field=>field.disasterId===id
      &&field.tileKeys?.includes(`${point.x},${point.y}`));
    loss+=Math.max(0,...fields.map(field=>resolveV39DisasterPenaltyDamage(attacker,field[powerKey],resistanceKey)));
  }
  return loss;
}
export const resolveV39StormShotPowerLoss=(map,attacker,target)=>fieldShotLoss(map,attacker,target,'暴風','stormPower','体幹耐性');
export const resolveV39ColdWaveShotPowerLoss=(map,attacker,target)=>fieldShotLoss(map,attacker,target,'大寒波','coldPower','氷耐性');
