import config from '../../../config/v39-weather.json';
import {normalizeV39MapScope,V39_MAP_SCOPES} from './v39-map-scope.js';

export const V39_WEATHER_TYPES=Object.freeze(Object.keys(config.weathers));
const clamp=(n,min=0,max=100)=>Math.min(max,Math.max(min,n));
const hash=value=>{let h=2166136261;for(const c of String(value)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);return (h^(h>>>16))>>>0;};
const roll=key=>hash(key)/4294967296;
const CLIMATE_VERSION=3;
function weatherTemperature(region,type){
  const temperature=region.temperature+config.weathers[type].temperatureOffset;
  return ['雪','吹雪'].includes(type)?Math.min(config.temperature.snowfallMaximum,temperature):temperature;
}

export function createV39ClimateProfile(map) {
  if(!map?.grid?.length||map.isUnderground)return null;
  const size=config.regionSize,regions={},w=map.w||map.grid[0].length,h=map.h||map.grid.length;
  const scope=normalizeV39MapScope(map),managed=!!scope.mapScope;
  let fingerprint='';
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const id=`${Math.floor(x/size)},${Math.floor(y/size)}`;
    const region=regions[id]||={id,x:Math.floor(x/size)*size,y:Math.floor(y/size)*size,count:0,water:0,forest:0,river:0,desert:0,height:0,snow:0};
    const terrain=[map.grid[y]?.[x],map.specialMap?.[y]?.[x],map.reliefMap?.[y]?.[x]].join('/');
    const height=Number(map.heightLevelMap?.[y]?.[x])||0;
    region.count++;region.height+=/海|湖/.test(terrain)?Math.max(0,height):height;
    region.water+=/海|湖/.test(terrain)?1:0;region.forest+=/森|林/.test(terrain)?1:0;
    region.desert+=/砂漠|荒野/.test(terrain)?1:0;
    region.snow+=/雪原|雪山|氷原/.test(terrain)?1:0;
    const river=/河川|川/.test(terrain)||map.riverData?.riverSet?.has?.(`${x},${y}`);
    region.river+=river?1:0;
    fingerprint+=managed?`${/海|湖/.test(terrain)?1:0}:${map.heightLevelMap?.[y]?.[x]??0};`:`${terrain}:${map.heightLevelMap?.[y]?.[x]??0}:${river?1:0};`;
  }
  const scopeKey=JSON.stringify(scope);
  const id=`climate:v${CLIMATE_VERSION}:${w}x${h}:${hash(fingerprint+scopeKey)}`;
  for(const region of Object.values(regions)){
    const latitude=Math.abs(((region.y+Math.min(size,h-region.y)/2)/h)*2-1),t=config.temperature,u=config.humidity;
    const base=managed&&scope.mapScope!=='world'?scope.climateSettings.baseTemperature:t.equator;
    const latitudeDrop=managed?V39_MAP_SCOPES[scope.mapScope].latitudeDrop:t.latitudeDrop;
    region.temperature=Math.round(clamp(base-latitude*latitudeDrop-region.height/region.count*t.heightDrop
      +(roll(`${id}:${region.id}:heat`)-.5)*6,t.minimum,t.maximum));
    region.snowRegion=region.snow>0;
    if(region.snowRegion&&!managed)region.temperature=Math.min(region.temperature,t.snowRegionMaximum);
    const humidityBase=managed&&scope.mapScope!=='world'?scope.climateSettings.humidity:u.base;
    region.humidity=Math.round(clamp(humidityBase+(region.water*u.water+(managed?0:region.forest*u.forest)+region.river*u.river+(managed?0:region.desert*u.desert))/region.count));
    delete region.water;delete region.forest;delete region.river;delete region.desert;delete region.height;delete region.count;delete region.snow;
  }
  return {version:CLIMATE_VERSION,id,w,h,regionSize:size,scopeKey,regions};
}

export function ensureV39ClimateProfile(map) {
  if(!map||map.isUnderground)return null;
  if(!map.climateProfile||map.climateProfile.version!==CLIMATE_VERSION||map.climateProfile.w!==map.w||map.climateProfile.h!==map.h
    ||map.climateProfile.scopeKey!==JSON.stringify(normalizeV39MapScope(map)))map.climateProfile=createV39ClimateProfile(map);
  return map.climateProfile;
}

export function getV39ClimateRegion(profile,x,y) {
  if(!profile||!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=profile.w||y>=profile.h)return null;
  return profile.regions[`${Math.floor(x/profile.regionSize)},${Math.floor(y/profile.regionSize)}`]||null;
}

function chooseWeather(profile,region,turn) {
  const cold=region.temperature<=config.conditions.coldTemperature;
  const choices=Object.entries(config.weathers).filter(([name])=>cold?['晴れ','雪','吹雪'].includes(name):!['雪','吹雪'].includes(name))
    .map(([name,row])=>({name,weight:Math.max(1,row.weight*(1+(region.humidity-50)/50*row.humidityBias))}));
  let value=roll(`${profile.id}:${region.id}:weather:${turn}`)*choices.reduce((sum,row)=>sum+row.weight,0);
  return choices.find(row=>(value-=row.weight)<0)?.name||'晴れ';
}

export function advanceV39Weather(profile,previous,turn) {
  if(!profile)return null;
  let weather=previous?.profileId===profile.id&&previous.lastTurn<=turn?previous:{profileId:profile.id,lastTurn:Math.max(0,turn-1),regions:{}};
  if(weather.lastTurn>=turn)return weather;
  const regions=Object.fromEntries(Object.entries(weather.regions||{}).map(([id,row])=>[id,{...row}]));
  for(let t=weather.lastTurn+1;t<=turn;t++)for(const region of Object.values(profile.regions)){
    let row=regions[region.id]||{humidity:region.humidity,dryness:100-region.humidity,dryTurns:0,wetTurns:0,weatherUntilTurn:0};
    if(row.weatherUntilTurn<t||!config.weathers[row.weather]){
      const duration=config.durationMin+Math.floor(roll(`${profile.id}:${region.id}:duration:${t}`)*(config.durationMax-config.durationMin+1));
      row={...row,weather:chooseWeather(profile,region,t),weatherStartedTurn:t,weatherUntilTurn:t+duration-1};
    }
    const rule=config.weathers[row.weather];
    regions[region.id]={...row,temperature:weatherTemperature(region,row.weather),
      humidity:clamp(row.humidity+rule.humidityDelta),dryness:clamp(row.dryness+rule.drynessDelta),
      dryTurns:rule.precipitation?0:row.dryTurns+1,wetTurns:rule.precipitation?row.wetTurns+1:0};
  }
  return {...weather,lastTurn:turn,regions};
}

export function inspectV39WeatherAt(map,weather,x,y) {
  const profile=ensureV39ClimateProfile(map),region=getV39ClimateRegion(profile,x,y);
  if(!region)return null;
  const current=weather?.profileId===profile.id?weather.regions?.[region.id]:null;
  return {regionId:region.id,climateTemperature:region.temperature,climateHumidity:region.humidity,...current};
}

export function setV39WeatherAt(map,previous,turn,x,y,type) {
  if(!config.weathers[type])return null;
  const profile=ensureV39ClimateProfile(map),weather=advanceV39Weather(profile,previous,turn);
  const region=getV39ClimateRegion(profile,x,y);if(!weather||!region)return null;
  const row=weather.regions[region.id],same=row.weather===type;
  return {...weather,regions:{...weather.regions,[region.id]:{...row,weather:type,
    temperature:weatherTemperature(region,type),
    weatherStartedTurn:same?row.weatherStartedTurn:turn,weatherUntilTurn:turn+config.durationMax-1,
    dryTurns:same?row.dryTurns:0,wetTurns:same?row.wetTurns:0}}};
}

export function resolveV39DisasterWeather(rule,map,weather,point) {
  const methods=rule.occurrenceMethods||['自然'];
  if(!methods.some(method=>['自然','条件付き'].includes(method)))return {allowed:false,climateMultiplier:1,weatherMultiplier:1};
  const current=inspectV39WeatherAt(map,weather,point.x,point.y),condition=rule.occurrenceCondition||'',min=Math.max(1,rule.requiredConditionTurns||1),c=config.conditions;
  if(!condition)return {allowed:true,climateMultiplier:1,weatherMultiplier:1,current};
  let allowed=false;
  if(condition==='不浄')allowed=Number(map.purificationByTile?.[`${point.x},${point.y}`]??100)<=c.unholyPurification||map.fogMap?.[point.y]?.[point.x]?.kind==='death';
  else if(current?.weather){
    if(condition==='乾燥')allowed=current.dryness>=c.dryness&&current.dryTurns>=min;
    if(condition==='豪雨')allowed=['豪雨','雷雨'].includes(current.weather)&&current.wetTurns>=min&&current.humidity>=c.wetHumidity;
    if(condition==='雷雨')allowed=current.weather==='雷雨'&&weather.lastTurn-current.weatherStartedTurn+1>=min;
    if(condition==='強風')allowed=['豪雨','雷雨','吹雪'].includes(current.weather)&&weather.lastTurn-current.weatherStartedTurn+1>=min;
    if(condition==='寒冷')allowed=['雪','吹雪'].includes(current.weather)&&current.temperature<=c.coldTemperature&&current.wetTurns>=min;
    if(condition==='高温')allowed=current.temperature>=c.hotTemperature&&current.dryTurns>=min;
  }
  const dry=['乾燥','高温'].includes(condition),wet=['豪雨','雷雨'].includes(condition);
  return {allowed,current,
    climateMultiplier:dry?clamp(1+(50-(current?.climateHumidity??50))/100,.5,1.5):wet?clamp(1+((current?.climateHumidity??50)-50)/100,.5,1.5):1,
    weatherMultiplier:dry?1+(current?.dryness||0)/100:wet?1+(current?.humidity||0)/100:1};
}
