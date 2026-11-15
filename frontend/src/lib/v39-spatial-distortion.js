import config from '../../../config/v39-spatial-distortion.json';

export function resolveV39SpatialDistortionPercent(unit,state,position=unit){
  if(!unit||!state)return null;
  if((unit.worldId||'surface')!==(state.activeWorldId||'surface'))return null;
  const turn=Number(state.timeline?.turnNumber);
  if(!Number.isFinite(turn))return null;
  const tile=`${position?.x},${position?.y}`;
  const active=(state.worldEnvironment?.activeDisasters||[]).some(event=>event?.disasterId==='空間歪曲'
    &&Number(event.startsAtTurn)<=turn&&Number(event.expiresAtTurn)>=turn&&event.tileKeys?.includes(tile));
  if(!active)return null;
  let hash=2166136261;
  for(const char of `${turn}:${unit.worldId||'surface'}:${unit.id||''}`){
    hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);
  }
  return config.minimumPercent+(hash>>>0)%(config.maximumPercent-config.minimumPercent+1);
}
