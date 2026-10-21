import {V39_HEGEMONY_AREAS,createV39HegemonyWorld} from './v39-hegemony-areas.js';
import {getHexNeighborCoords} from './hex-grid.js';

export const livingHegemonyGuard=unit=>Number(unit.hp??unit.currentHp)>0&&!['死亡','死体'].includes(unit.state);
export function getV39HegemonyGuards(state,landmark){
  if(!landmark)return [];
  const id=landmark.hegemonyWorldId;
  const enemies=id&&id!==state.activeWorldId?state.explorationWorlds?.[id]?.spatial?.enemies:state.enemies;
  return (enemies||[]).filter(unit=>unit.victoryLandmarkKey===landmark.key&&livingHegemonyGuard(unit));
}
export function canV39ClaimHegemony(state,feature){
  const landmark=state.victoryLandmarksByTile?.[feature.key];
  if(!landmark?.hegemonyWorldId)return !getV39HegemonyGuards(state,landmark).length;
  return !!state.explorationWorlds?.[landmark.hegemonyWorldId]?.map?.guardianInitialized&&!getV39HegemonyGuards(state,landmark).length;
}
export function prepareV39HegemonyWorlds(state){
  if(state.activeWorldId&&state.activeWorldId!=='surface')return state;
  let enemies=state.enemies||[],nests=state.enemyNests||[],squads=state.enemySquads||[];
  const worlds={...state.explorationWorlds},landmarks={...state.victoryLandmarksByTile};
  let changed=false;
  for(const [key,landmark] of Object.entries(landmarks)){
    if(landmark.hegemonyWorldId&&worlds[landmark.hegemonyWorldId]||landmark.peacefulOwnerPlayerId)continue;
    const area=V39_HEGEMONY_AREAS.find(area=>area.name===landmark.name);
    const guards=enemies.filter(unit=>unit.victoryLandmarkKey===key);
    if(!area||!guards.length)continue;
    const id=`hegemony:${landmark.id}`,world=createV39HegemonyWorld({hegemonyArea:area.id,parentWorldId:'surface',parentExit:{x:landmark.x,y:landmark.y}});
    const positions=[{x:5,y:2},...getHexNeighborCoords(world.map.w,world.map.h,5,2)];
    const ids=new Set(guards.map(unit=>unit.id)),nestIds=new Set(guards.map(unit=>unit.nestId));
    world.map.hegemonyLandmarkKey=key;world.map.guardianInitialized=true;world.map.hegemonyVisited=false;
    world.spatial.enemies=guards.map((unit,index)=>({...unit,...positions[index%positions.length],worldId:id,territoryCenterX:5,territoryCenterY:2}));
    world.spatial.enemyNests=nests.filter(nest=>nestIds.has(nest.id)).map(nest=>({...nest,x:5,y:2,worldId:id,territoryRadius:4}));
    world.spatial.enemySquads=squads.filter(squad=>squad.unitIds?.some(unitId=>ids.has(unitId)));
    worlds[id]=world;landmarks[key]={...landmark,hegemonyWorldId:id};
    enemies=enemies.filter(unit=>!ids.has(unit.id));nests=nests.filter(nest=>!nestIds.has(nest.id));
    squads=squads.filter(squad=>!squad.unitIds?.some(unitId=>ids.has(unitId)));changed=true;
  }
  return changed?{...state,enemies,enemyNests:nests,enemySquads:squads,explorationWorlds:worlds,victoryLandmarksByTile:landmarks}:state;
}
