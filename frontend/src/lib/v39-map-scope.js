import config from '../../../config/v39-map-climate.json';

export const V39_MAP_SCOPES=config.scopes;
export const V39_CLIMATE_ZONES=config.zones;
export const V39_SINGLE_ISLAND_PATTERNS=config.singleIslandPatterns;
const clamp=(value,min,max,fallback)=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?fallback:Math.min(max,Math.max(min,Number(value)));

export function normalizeV39MapScope(input={}){
  if(!Object.hasOwn(config.scopes,input.mapScope))return {};
  const zone=Object.hasOwn(config.zones,input.climateSettings?.zone)?input.climateSettings.zone:'temperate';
  const preset=config.zones[zone];
  return {mapScope:input.mapScope,climateSettings:{zone,
    baseTemperature:clamp(input.climateSettings?.baseTemperature,-20,35,preset.temperature),
    humidity:clamp(input.climateSettings?.humidity,0,100,preset.humidity)}};
}

export function normalizeV39ScopePattern(pattern,scope){
  return scope==='island'&&!config.singleIslandPatterns.includes(pattern)?'realistic':pattern;
}

export function v39ClimateForestScale(scope){
  if(!scope.mapScope||scope.mapScope==='world')return 1;
  const preset=config.zones[scope.climateSettings.zone];
  return Math.max(.1,Math.min(1.6,preset.forestScale*scope.climateSettings.humidity/Math.max(1,preset.humidity)));
}

export function applyV39ClimateBiomes(map,profile,protectedKeys=new Set()){
  const snowCoverMap=Array.from({length:map.h},()=>Array(map.w).fill(false));
  let snowTiles=0,desertTiles=0;
  for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++){
    const terrain=map.grid[y][x],region=profile.regions[`${Math.floor(x/profile.regionSize)},${Math.floor(y/profile.regionSize)}`];
    if(!region||/海|湖|河川|火山/.test(terrain)||protectedKeys.has(`${x},${y}`))continue;
    const cold=region.temperature<=config.snowTemperature;
    if(cold){
      snowCoverMap[y][x]=true;snowTiles++;
      if(['平地','荒野','砂漠'].includes(terrain))map.grid[y][x]='雪原';
    }else if(terrain==='雪原')map.grid[y][x]='平地';
    if(!cold&&region.temperature>=config.desertMinimumTemperature&&region.humidity<=config.desertMaximumHumidity){
      if(['平地','荒野'].includes(map.grid[y][x])){map.grid[y][x]='砂漠';desertTiles++;}
    }else if(map.grid[y][x]==='砂漠')map.grid[y][x]='平地';
  }
  return {snowCoverMap,info:{source:'climate',snowTiles,desertTiles}};
}
