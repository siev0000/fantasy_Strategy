import {isV39ProtectedGround,V39_TERRAIN_DESTRUCTION_RULES as rules} from './v39-terrain-destruction.js';

const key=point=>`${point.x},${point.y}`;
function hash(value){
  let result=2166136261;
  for(const char of String(value)){result^=char.charCodeAt(0);result=Math.imul(result,16777619);}
  return result>>>0;
}

export function scheduleV39CaveEarthquake(worlds,earthquakes,turn,settings=rules){
  if(!settings.collapse||!Array.isArray(earthquakes)||!earthquakes.length)return {worlds,scheduled:[]};
  let next=worlds,scheduled=[];
  for(const [worldId,world] of Object.entries(worlds||{})){
    const map=world?.map;
    if(!/^cave:.*:1$/.test(worldId)||!map?.isUnderground)continue;
    const matching=earthquakes.filter(event=>(map.entrances||[]).some(entry=>entry.surfaceEntrance&&event.tileKeys?.includes(key(entry.surfaceEntrance))));
    if(!matching.length)continue;
    let pending={...map.terrainDamage?.pendingByTile},changed=false;
    const candidates=[];
    for(let y=1;y<map.h-1;y++)for(let x=1;x<map.w-1;x++){
      const point={x,y};
      if(map.grid?.[y]?.[x]==='洞窟'&&!isV39ProtectedGround(map,point))candidates.push(point);
    }
    for(const event of matching){
      const seed=hash(`${event.id}:${worldId}`),count=Math.min(candidates.length,1+seed%3);
      const ordered=[...candidates].sort((a,b)=>hash(`${seed}:${key(a)}`)-hash(`${seed}:${key(b)}`)||a.y-b.y||a.x-b.x);
      let added=0;
      for(const point of ordered){
        if(added>=count)break;
        const k=key(point);
        if(pending[k])continue;
        pending[k]={...point,kind:'rockfall',sourceDisasterId:event.id,hiddenWarning:true,resolvesAtTurn:turn+settings.collapse.delayTurns,
          power:settings.collapse.power,element:settings.collapse.element,rubbleDurability:settings.rubbleDurability};
        scheduled.push({worldId,...point,sourceDisasterId:event.id});
        added++;changed=true;
      }
    }
    if(changed)next={...next,[worldId]:{...world,map:{...map,terrainDamage:{...map.terrainDamage,pendingByTile:pending}}}};
  }
  return {worlds:next,scheduled};
}
