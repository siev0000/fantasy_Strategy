import {getGameDataRows} from './game-data-registry.js';
import {resolveV39WallStepStructures,v39WallEdgeKey} from './v39-wall-edges.js';

const definitions=new Map(getGameDataRows('施設').map(row=>[row.施設名,row]));
const amount=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
const definition=wall=>definitions.get(wall.wallFacilityName||wall.facilityName);

export function resolveV39FriendlyWallMovePercent(map,from,to,{ownerId='',isFriendlyOwner=null}={}){
  let percent=0;
  for(const wall of resolveV39WallStepStructures(map,from,to)){
    if(!ownerId||!wall.ownerId||!(wall.ownerId===ownerId||isFriendlyOwner?.(wall.ownerId)))continue;
    percent=Math.max(percent,amount(definition(wall)?.味方通行AP増加率));
  }
  return percent;
}

export function resolveV39InternalWallHappiness(map,settlementId,ownerId,residentialKeys){
  const residential=new Set(residentialKeys),edges=new Map();let limit=0;
  for(const wall of map?.defenseStructures||[]){
    if(wall.kind!=='壁'||wall.hp<=0||!wall.edge||wall.ownerId!==ownerId||wall.settlementId!==settlementId)continue;
    if(![wall.edge.from,wall.edge.to].every(p=>residential.has(`${p.x},${p.y}`)))continue;
    const row=definition(wall);if(!row)continue;
    const key=v39WallEdgeKey(wall.edge);
    edges.set(key,Math.max(edges.get(key)||0,amount(row.内壁幸福度低下)));
    limit=Math.max(limit,amount(row.内壁幸福度低下上限));
  }
  const rawPenalty=[...edges.values()].reduce((sum,value)=>sum+value,0);
  return {penalty:Math.min(rawPenalty,limit),rawPenalty,limit,edgeCount:edges.size};
}
