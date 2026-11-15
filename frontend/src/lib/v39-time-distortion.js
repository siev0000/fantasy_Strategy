import config from '../../../config/v39-time-distortion.json';

function rollPercent(unit,turn){
  let hash=2166136261;
  for(const char of `${turn}:${unit?.worldId||'surface'}:${unit?.id||''}`){
    hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);
  }
  return config.minimumPercent+(hash>>>0)%(config.maximumPercent-config.minimumPercent+1);
}

export function resolveV39TimeDistortionPercent(unit,events,turn){
  if(!Number.isFinite(Number(turn)))return 100;
  const tile=`${unit?.x},${unit?.y}`;
  const active=(events||[]).some(event=>event?.disasterId==='時間歪曲'
    &&Number(event.startsAtTurn)<=turn&&Number(event.expiresAtTurn)>=turn
    &&event.tileKeys?.includes(tile));
  return active?rollPercent(unit,turn):100;
}
