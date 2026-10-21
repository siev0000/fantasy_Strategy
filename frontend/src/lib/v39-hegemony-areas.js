import config from '../../../config/v39-hegemony-areas.json';

export const V39_HEGEMONY_AREAS=config.areas;
export const V39_HEGEMONY_TEST_HUB=config.testHub;
export const V39_HEGEMONY_EXIT_TURNS=config.exitTurns;
export function hegemonyEntranceAt(map,x,y){
  return map?.hegemonyTestHub?map.hegemonyEntrances?.find(entry=>entry.x===x&&entry.y===y):null;
}
export function hegemonyZoneAt(map,x,y){
  return map?.hegemonyInterior&&map.hegemonyZoneKeys?.includes(`${x},${y}`)
    ?V39_HEGEMONY_AREAS.find(area=>area.id===map.hegemonyAreaId):null;
}
export function hegemonyLightMultiplier(map,unit,element,worldId){
  if((unit?.worldId||'surface')!==(worldId||'surface')||element!=='光')return 1;
  return hegemonyZoneAt(map,unit.x,unit.y)?.lightMultiplier||1;
}
export function createV39HegemonyWorld(options){
  const area=V39_HEGEMONY_AREAS.find(row=>row.id===options.hegemonyArea);
  if(!area)throw new Error('覇権地の固定エリアがありません');
  const {width:w,height:h}=config,keys=[];
  const grid=area.layout.map((row,y)=>[...row].map((cell,x)=>{
    if(cell==='x')keys.push(`${x},${y}`);
    return cell==='#'?'岩壁':cell==='x'&&area.water?(x<3||x>8?'海':'河川'):area.base;
  }));
  if(grid.length!==h||grid.some(row=>row.length!==w))throw new Error('固定エリアの寸法が不正です');
  const map={w,h,grid,seed:`hegemony-${area.id}`,hegemonyInterior:true,hegemonyAreaId:area.id,hegemonyAreaName:area.name,
    hegemonyZoneKeys:keys,isUnderground:false,worldWrapEnabled:false,
    heightLevelMap:grid.map(row=>row.map(()=>0)),specialMap:grid.map(row=>row.map(()=>'')),
    snowCoverMap:[],lavaMap:[],riverData:[],hazardZones:[],fogMap:[],
    entrances:[{...config.entry,key:`${config.entry.x},${config.entry.y}`}],entryTarget:{...config.entryTarget},
    parentWorldId:options.parentWorldId||'surface',parentExit:options.parentExit,caveSites:[]};
  if(area.visualTerrain==='溶岩'){
    const zoneKeys=new Set(keys),edges=[];
    // Reuse the field lava renderer without enabling the unrelated percentage-damage lava simulation.
    for(const key of keys){const [x,y]=key.split(',').map(Number);if(zoneKeys.has(`${x+1},${y}`))edges.push(`${key}|${x+1},${y}`);}
    map.lavaFlowData={nodeKeys:keys,edgeKeys:edges};
  }
  return {map,spatial:{enemies:[],enemySquads:[],enemyNests:[],enemyCombatRuntime:{},settlements:[],neutralVillages:[],wandererGroups:[],territoryOwnerByTile:{},territoryStateByTile:{},recoveryPercentByTile:{},dangerPercentByTile:{},facilitiesByTile:{},groundLootByTile:{},explorationSitesByTile:{},specialtiesByTile:{},victoryLandmarksByTile:{},worldEnvironment:{}},visibility:{}};
}
