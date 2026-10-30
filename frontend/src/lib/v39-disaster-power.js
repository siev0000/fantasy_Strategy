import {inspectV39WeatherAt} from './v39-weather.js';

export function resolveV39ClimateDisasterPower(event,map,weather){
  if(event.origin==='magic'&&Number.isFinite(event.details?.magicPower))return event.details.magicPower;
  const range=event.details?.powerRange;
  if(!range)return Math.max(0,Number(event.damagePower)||0);
  const humidity=Number(inspectV39WeatherAt(map,weather,event.x,event.y)?.humidity??range.humidityMinimum);
  const ratio=Math.max(0,Math.min(1,(humidity-range.humidityMinimum)/(range.humidityMaximum-range.humidityMinimum)));
  return Math.round(range.minimum+(range.maximum-range.minimum)*ratio);
}
