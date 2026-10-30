import weatherConfig from '../../../config/v39-weather.json';

export const V39_RAIN_STRENGTHS=weatherConfig.rainStrengths;
export const v39RainStrengthForWeather=type=>weatherConfig.rainStrengthByWeather[type]||null;
export function resolveV39RainConditions(map,weather){
  if(!weather||!map?.climateProfile||map.isUnderground||map.hegemonyInterior||weather.profileId!==map.climateProfile.id)return null;
  return {profileId:weather.profileId,
    regions:Object.fromEntries(Object.entries(weather.regions||{}).map(([key,row])=>[key,v39RainStrengthForWeather(row.weather)])),
    areas:(weather.disasterAreas||[]).map(area=>({tileKeys:area.tileKeys,strength:weatherConfig.rainStrengthByDisaster[area.disasterId]||v39RainStrengthForWeather(area.weather)}))};
}
export function getV39RainStrengthAt(map,conditions,x,y){
  if(!conditions||map?.isUnderground||map?.hegemonyInterior||conditions.profileId!==map?.climateProfile?.id||x<0||y<0||x>=map.w||y>=map.h)return null;
  const override=(conditions.areas||[]).find(area=>area.tileKeys?.includes(`${x},${y}`));
  return override?override.strength:conditions.regions?.[`${Math.floor(x/map.climateProfile.regionSize)},${Math.floor(y/map.climateProfile.regionSize)}`]||null;
}
export function resolveV39RainScoutPenalty(map,tiles){
  return Math.max(0,...tiles.map(tile=>V39_RAIN_STRENGTHS[getV39RainStrengthAt(map,map?.rainConditions,tile.x,tile.y)]?.scoutPenalty||0));
}
