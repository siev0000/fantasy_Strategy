import {ensureV39ClimateProfile,getV39ClimateRegion} from './v39-weather.js';

const number=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
export function matchesV39ClimateConditions(row,climate){
  if(!climate)return true;
  return [['最低気温','最高気温','climateTemperature'],['最低湿潤度','最高湿潤度','climateHumidity']].every(([low,high,key])=>{
    const value=number(climate[key]),min=number(row?.[low]),max=number(row?.[high]);
    return value===null||((min===null||value>=min)&&(max===null||value<=max));
  });
}

// A generation pass shares one profile and one immutable sample per region.
export function createV39ClimateLookup(map,weather){
  const profile=ensureV39ClimateProfile(map),cache=new Map();
  return (x,y)=>{
    const region=getV39ClimateRegion(profile,x,y);
    if(!region)return null;
    if(!cache.has(region.id))cache.set(region.id,{climateTemperature:region.temperature,climateHumidity:region.humidity,
      weather:weather?.profileId===profile.id?weather.regions?.[region.id]?.weather:null});
    return cache.get(region.id);
  };
}
