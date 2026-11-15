import config from '../../../config/v39-gravity-effects.json';

export function resolveV39GravityPower(event){
  const magic=event?.origin==='magic'?Number(event?.details?.magicPower):NaN;
  return Number.isFinite(magic)?Math.max(0,magic):config.eventPower;
}

export function resolveV39GravityMovementEffect(map,points=[]){
  const fields=(map?.disasterFields||[]).filter(field=>field.disasterId==='重力異常'
    &&points.some(point=>field.tileKeys?.includes(`${point?.x},${point?.y}`)));
  return {movementLoss:Math.max(0,...fields.map(field=>Math.max(0,Number(field.gravityPower)||0))),flightBlocked:fields.length>0};
}
