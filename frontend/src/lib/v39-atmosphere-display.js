import config from '../../../config/v39-atmosphere-display.json';
import {projectV39HazardEvents,getV39ActiveHazardsAt} from './v39-hazard-zones.js';
import {isV39FogTile,isV39DeathFogTile} from './v39-fog-rules.js';
import {getV39EffectAttribute} from './v39-effect-attribute-settings.js';
import {V39_FOG_BALANCE} from './v39-gameplay-balance.js';

export const V39_ATMOSPHERE_DISPLAY=config;
export const isV39AtmosphereDisaster=id=>config.kinds.some(kind=>kind.disasterId===id);

export function v39AtmospherePalette(){
  return config.kinds.map(kind=>{
    const attributeName=kind.fogAttribute?V39_FOG_BALANCE.deathAttribute:kind.attribute;
    const attribute=attributeName?getV39EffectAttribute(attributeName):null;
    const color=kind.color||attribute?.tint||(attribute?.gradientEnabled?attribute.gradientColorA:null);
    return {...kind,color:/^#[0-9a-f]{6}$/i.test(color||'')?color:`#${V39_FOG_BALANCE.displayColor.toString(16).padStart(6,'0')}`};
  });
}

export function activeV39AtmosphereDisasters(state){
  const turn=state.timeline?.turnNumber||1;
  return (state.worldEnvironment?.activeDisasters||[]).filter(event=>isV39AtmosphereDisaster(event.disasterId)&&(event.startsAtTurn??event.turn??0)<=turn&&event.expiresAtTurn>=turn);
}

export function collectV39AtmosphereTiles(data,state){
  const tiles=new Map(),turn=state.timeline?.turnNumber||1;
  const add=(x,y,kind)=>{
    if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=data.w||y>=data.h)return;
    const key=`${x},${y}`,tile=tiles.get(key)||{key,x,y,kinds:new Set()};
    tile.kinds.add(kind);tiles.set(key,tile);
  };
  for(let y=0;y<data.h;y++)for(let x=0;x<data.w;x++){
    const fog=data.fogMap?.[y]?.[x];
    if(fog?.expiresAtTurn&&fog.expiresAtTurn<=turn)continue;
    if(isV39FogTile(data,x,y))add(x,y,isV39DeathFogTile(data,x,y)?'death':'fog');
  }
  for(const event of [...(!data.isUnderground?activeV39AtmosphereDisasters(state).filter(event=>!event.persistentHazard):[]),...projectV39HazardEvents(data,turn).filter(event=>isV39AtmosphereDisaster(event.disasterId))]){
    const kind=config.kinds.find(row=>row.disasterId===event.disasterId).id;
    for(const key of event.tileKeys||[]){const [x,y]=String(key).split(',').map(Number);add(x,y,kind);}
  }
  return [...tiles.values()].sort((a,b)=>a.y-b.y||a.x-b.x).map(tile=>({...tile,kinds:config.kinds.filter(kind=>tile.kinds.has(kind.id)).map(kind=>kind.id)}));
}

export function inspectV39EnvironmentEffectsAt(data,state,x,y){
  if(!data?.grid)return [];
  const turn=state.timeline?.turnNumber||1,key=`${x},${y}`,effects=[];
  for(const {rule} of getV39ActiveHazardsAt(data,x,y,turn))effects.push({name:rule.カテゴリ名,remaining:null,persistent:true,description:rule.効果});
  for(const zone of data.hazardZones||[]){
    const remaining=Number(zone.suppressedUntilByTile?.[key]||0)-turn;
    if(remaining>0&&zone.tileKeys.includes(key))effects.push({name:zone.name,remaining:null,persistent:true,suppressedRemaining:remaining});
  }
  if(isV39FogTile(data,x,y)){
    const fog=data.fogMap?.[y]?.[x],remaining=fog?.expiresAtTurn?fog.expiresAtTurn-turn:null;
    if(remaining===null||remaining>0)effects.push({name:isV39DeathFogTile(data,x,y)?'死の霧':'霧',remaining});
  }
  if(!data.isUnderground)for(const event of state.worldEnvironment?.activeDisasters||[]){
    if(!event.persistentHazard&&(event.startsAtTurn??event.turn??0)<=turn&&event.expiresAtTurn>=turn&&event.tileKeys?.includes(key))effects.push({name:event.name||event.disasterId,remaining:event.expiresAtTurn-turn+1});
  }
  return effects;
}
