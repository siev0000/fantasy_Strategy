import config from '../../../config/v39-atmosphere-display.json';
import {V39_FOG_BALANCE} from './v39-gameplay-balance.js';

export const V39_ATMOSPHERE_OPACITY_KINDS=config.kinds;
export function normalizeV39AtmosphereOpacity(value={}){
  return Object.fromEntries(config.kinds.filter(kind=>value?.[kind.id]!==undefined&&value?.[kind.id]!==null&&value?.[kind.id]!=='')
    .map(kind=>[kind.id,Math.max(0,Math.min(100,Number.isFinite(Number(value[kind.id]))?Number(value[kind.id]):V39_FOG_BALANCE.displayAlpha*100))]));
}
export function v39AtmosphereOpacityPercent(kind,settings={}){
  return normalizeV39AtmosphereOpacity(settings.atmosphereOpacityByKind)[kind]??V39_FOG_BALANCE.displayAlpha*100;
}
