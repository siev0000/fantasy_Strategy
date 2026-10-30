import {getHexOffsetNeighbors,getHexDistance,turnV39HexDirectionToward} from './hex-grid.js';
import {resolveV39WindDirectionAt} from './v39-weather.js';
import {isV39ProtectedGround} from './v39-terrain-destruction.js';
import {resolveV39RainConditions} from './v39-rain-rules.js';

const key=p=>`${p.x},${p.y}`;
const height=(map,p)=>Number(map.heightLevelMap?.[p.y]?.[p.x])||0;
const inside=(map,p)=>p.x>=0&&p.y>=0&&p.x<map.w&&p.y<map.h;
const water=(map,p)=>/海|湖/.test(String(map.grid?.[p.y]?.[p.x]));

// Explicit spawn options never mutate spreadsheet defaults or existing events.
export function withV39TyphoonSpawnRadius(rule, options) {
  if(rule.id!=='災害:台風'||options?.radius==null||options.radius==='')return rule;
  const requested=Number(options.radius);
  if(!Number.isFinite(requested))return rule;
  const maximum=Math.max(rule.radius,Number(rule.details?.maximumRadius)||0);
  const radius=Math.max(0,Math.min(maximum,Math.floor(requested)));
  return {...rule,radius,details:{...rule.details,
    ...(options.autoGrow===false?{radiusGrowthPerTurn:0,maximumRadius:radius}:{})}};
}
export function isV39DynamicDisasterAnchor(rule,map,point,events=[]){
  const detail=rule.details||{};
  if(detail.minimumHeight!==undefined&&height(map,point)<detail.minimumHeight)return false;
  if(detail.movement==='downhill'&&!getHexOffsetNeighbors(point.x,point.y).some(p=>inside(map,p)&&height(map,p)<height(map,point)))return false;
  if(detail.minimumClimateTemperature!==undefined&&(!map.climateProfile||Number(map.climateProfile.regions?.[`${Math.floor(point.x/map.climateProfile.regionSize)},${Math.floor(point.y/map.climateProfile.regionSize)}`]?.temperature??-Infinity)<detail.minimumClimateTemperature))return false;
  if(detail.movement==='coast'&&!getHexOffsetNeighbors(point.x,point.y).some(p=>inside(map,p)&&!water(map,p)&&height(map,p)<=(detail.maximumHeight??Infinity)))return false;
  if(detail.triggerDisaster&&!events.some(event=>event.disasterId===detail.triggerDisaster&&getHexDistance(point,event)<=(detail.triggerRadius??0)))return false;
  return true;
}
function area(map,point,radius){
  const result=[];
  for(let y=Math.max(0,point.y-radius-1);y<=Math.min(map.h-1,point.y+radius+1);y++)for(let x=Math.max(0,point.x-radius-1);x<=Math.min(map.w-1,point.x+radius+1);x++)if(getHexDistance(point,{x,y})<=radius)result.push(`${x},${y}`);
  return result;
}
export function advanceV39DynamicDisaster(source,map,turn,state={}){
  const detail=source.details||{};
  if(!detail.movement)return source;
  if(source.lastMovementTurn>=turn)return source;
  let event={...source},point={x:event.x,y:event.y};
  let direction=event.direction;
  if(!Number.isInteger(direction)){
    direction=[...String(event.id)].reduce((sum,char)=>(sum+char.charCodeAt(0))%6,0);
    if(detail.movement==='coast'){
      const neighbors=getHexOffsetNeighbors(point.x,point.y);
      const index=neighbors.findIndex(p=>inside(map,p)&&!water(map,p)&&height(map,p)<=(detail.maximumHeight??Infinity));
      if(index>=0)direction=index;
    }
  }
  // Creation remains at the source; only later turns advance the front.
  if(detail.followWind===true){
    const wind=resolveV39WindDirectionAt(map,state.worldEnvironment?.weather,point.x,point.y);
    if(wind!=null)direction=!Number.isInteger(source.direction)?wind
      :turn>event.startsAtTurn?turnV39HexDirectionToward(direction,wind,detail.windTurnSteps??1):direction;
  }
  if(turn>event.startsAtTurn)for(let step=0;step<(detail.stepsPerTurn||0);step++){
    const neighbors=getHexOffsetNeighbors(point.x,point.y);
    let next=neighbors[direction];
    if(detail.movement==='downhill')next=neighbors.filter(p=>inside(map,p)&&height(map,p)<height(map,point)).sort((a,b)=>height(map,a)-height(map,b))[0];
    if(!next||!inside(map,next)||detail.movement==='coast'&&(height(map,next)>(detail.maximumHeight??Infinity)||event.reachedLand&&water(map,next))){event.expiresAtTurn=Math.min(event.expiresAtTurn,turn-1);break;}
    point=next;if(!water(map,point))event.reachedLand=true;
  }
  const tileKeys=area(map,point,event.radius||0);
  event={...event,...point,tileKeys,direction,lastMovementTurn:turn};
  if(detail.radiusDecayPerTurn!==undefined){
    if(turn>event.startsAtTurn&&event.expiresAtTurn>=turn){
      const profile=map.climateProfile;
      const temperature=profile?.regions?.[`${Math.floor(point.x/profile.regionSize)},${Math.floor(point.y/profile.regionSize)}`]?.temperature;
      const sea=/海/.test(String(map.grid?.[point.y]?.[point.x]));
      const cold=temperature!=null&&Number(temperature)<(detail.minimumClimateTemperature??-Infinity);
      // Unknown sea temperature holds size; land and cold sea cannot feed the vortex.
      const warmSea=sea&&!cold&&(temperature!=null||detail.minimumClimateTemperature==null);
      const delta=!sea||cold?-detail.radiusDecayPerTurn:warmSea?(detail.radiusGrowthPerTurn||0):0;
      const radius=(source.radius||0)+delta;
      if(radius<0){event.expiresAtTurn=turn-1;event.tileKeys=[];}
      event.radius=Math.max(0,Math.min(detail.maximumRadius??Infinity,radius));
      if(event.expiresAtTurn>=turn)event.tileKeys=area(map,point,event.radius);
    }
  }else if(detail.maximumRadius!==undefined&&detail.radiusGrowthPerTurn>0){
    const initial=event.initialRadius??source.radius??0;
    event.initialRadius=initial;
    event.radius=Math.min(detail.maximumRadius,initial+Math.max(0,turn-event.startsAtTurn)*detail.radiusGrowthPerTurn);
    event.tileKeys=area(map,point,event.radius);
  }
  if(detail.rubbleDurability>0&&event.expiresAtTurn>=turn){
    const previous=map.terrainDamage||{},rubble={...previous.rubbleByTile};
    for(const tileKey of tileKeys){const [x,y]=tileKey.split(',').map(Number);if(!rubble[tileKey]&&!isV39ProtectedGround(map,{x,y},state))rubble[tileKey]={hp:detail.rubbleDurability,maxHp:detail.rubbleDurability};}
    map.terrainDamage={...previous,rubbleByTile:rubble};
  }
  return event;
}
export function projectV39DynamicDisasterFields(map,weather,events,turn){
  const active=events.filter(event=>event.expiresAtTurn>=turn&&event.startsAtTurn<=turn);
  map.disasterFields=active.filter(event=>event.details&&(event.details.movementImpediment||event.details.fogPenalty||event.details.visionPenalty||event.details.scoutPenalty||event.details.rangedAccuracyMultiplier!==undefined)).map(event=>({tileKeys:event.tileKeys,...event.details,x:event.x,y:event.y,radius:event.radius,disasterId:event.disasterId}));
  const next=weather?{...weather,disasterAreas:active.filter(event=>event.details?.weather).map(event=>({disasterId:event.disasterId,tileKeys:event.tileKeys,weather:event.details.weather,humidity:event.details.weatherHumidity,startedAtTurn:event.startsAtTurn}))}:weather;
  map.rainConditions=resolveV39RainConditions(map,next);
  return next;
}
export function getV39DisasterFieldAt(map,x,y){
  const fields=(map?.disasterFields||[]).filter(field=>field.tileKeys?.includes(`${x},${y}`));
  return {vision:Math.max(0,...fields.map(f=>Number(f.visionPenalty)||0)),scout:Math.max(0,...fields.map(f=>Number(f.scoutPenalty)||0)),rangedAccuracyMultiplier:Math.min(1,...fields.map(f=>Number(f.rangedAccuracyMultiplier??1)))};
}
