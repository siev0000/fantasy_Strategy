import {V39_HEGEMONY_AREAS,V39_HEGEMONY_TEST_HUB} from '../../lib/v39-hegemony-areas.js';
import {HEX_TILE_CONFIG as hex} from '../../lib/phaser-map-panel-config.js';
import {v39VictoryLandmarkDefinitions} from '../../lib/v39-victory-landmarks.js';
import {getHexNeighborCoords} from '../../lib/hex-grid.js';
import {buildV39UnitEntity} from '../../lib/v39-unit-creation-rules.js';

window.startV39HegemonyAreaTest=async()=>{
  if(!window.isV39TestMode?.()||window.isV39MapInputLocked?.())return {ok:false};
  const result=window.startV39ExpeditionTest(false,{silentBanner:true});if(!result.ok)return result;
  const state=window.getV39GameState(),player=state.players[0];
  const hub=V39_HEGEMONY_TEST_HUB,w=hub.width,h=hub.height;
  const grid=Array.from({length:h},()=>Array(w).fill('平地'));
  const entrances=hub.entrances.map(entry=>({...entry,name:V39_HEGEMONY_AREAS.find(area=>area.id===entry.areaId).name}));
  const definitions=v39VictoryLandmarkDefinitions(),markers={};
  for(const entry of entrances){
    const definition=definitions.find(row=>row.name===entry.name);
    if(!definition)throw new Error(`覇権地の定義がありません: ${entry.name}`);
    const tiles=[entry,...getHexNeighborCoords(w,h,entry.x,entry.y)],key=`${entry.x},${entry.y}`;
    const terrain=definition.terrainNames[0];
    for(const tile of tiles)grid[tile.y][tile.x]=terrain;
    // Keep a walkable shoreline entrance for the inspection party.
    if(entry.areaId==='sea'){grid[entry.y][entry.x]='平地';grid[entry.y][entry.x-1]='平地';}
    markers[key]={id:`hegemony-test:${entry.areaId}`,kind:'victory-landmark',key,x:entry.x,y:entry.y,
      landmarkId:definition.id,featureId:definition.id,featureName:definition.name,name:definition.name,
      terrain,detail:definition.detail,footprintRadius:1,occupiedTileKeys:tiles.map(tile=>`${tile.x},${tile.y}`)};
  }
  const map={w,h,grid,seed:'hegemony-test-hub',hegemonyTestHub:true,hegemonyEntrances:entrances,
    isUnderground:false,worldWrapEnabled:false,heightLevelMap:grid.map(row=>row.map(()=>0)),
    specialMap:[],snowCoverMap:[],lavaMap:[],fogMap:[],hazardZones:[],riverData:[]};
  const spatial={enemies:[],enemySquads:[],enemyNests:[],enemyCombatRuntime:{},settlements:[],neutralVillages:[],wandererGroups:[],
    territoryOwnerByTile:{},territoryStateByTile:{},recoveryPercentByTile:{},dangerPercentByTile:{},facilitiesByTile:{},groundLootByTile:{},
    explorationSitesByTile:{},specialtiesByTile:{},victoryLandmarksByTile:markers,worldEnvironment:{}};
  // Keep the inspection party small, without transport/instructor missions from the base fixture.
  const units=player.factionState.units.filter(unit=>unit.worldId==='surface'||!unit.worldId).slice(0,2)
    .map((unit,index)=>{
      const trained=buildV39UnitEntity({...unit,level:hub.unitLevel,squadId:'area-test',...hub.party[index]});
      if(!trained.derivedCharacter?.ok)throw new Error(`探索者を育成できません: ${unit.name}`);
      return {...trained,testOnly:true,testMovementMinimum:hub.minimumMovement,isSovereign:unit.isSovereign,
        locationsByWorld:{},worldId:'surface',transportAssignment:null,caveDuty:null,
        hp:Math.max(1,trained.maxHp-20),currentHp:Math.max(1,trained.maxHp-20)};
    });
  const settings={...window.__v39FieldRuntime.settings,w,h};
  window.loadV39FieldSnapshot(map,settings,{layerChange:true});
  const exploration={discoveredFeaturesByTile:Object.fromEntries(Object.keys(markers).map(key=>[key,true]))};
  window.setV39GameState({...spatial,activeWorldId:'surface',players:[{...player,factionState:{...player.factionState,visibility:{},exploration,units,settlements:[],village:null,selectedSettlementId:'',selectedUnitId:units[0].id,
    squads:[{id:'area-test',label:'奥地確認部隊',unitIds:units.map(unit=>unit.id)}]}}],explorationWorlds:{surface:{map,settings,spatial,visibility:{}}}},{reason:'hegemony-test-started',trackUnitDeaths:false});
  window.refreshV39SquadDerivedUI?.();window.refreshV39MapEntities?.();window.renderV39Visibility?.();
  window.activateV39FooterTab?.('squad');
  await window.waitForV39MapRenderSettled();
  renderZones();
  window.showV39TurnBanner?.('覇権地テスト：4つの入口へ移動し、「基本」から入れます。出口から地上に戻って別の入口へ。');
  return {ok:true,entrances};
};

function renderZones(){
  const runtime=window.__v39FieldRuntime,map=runtime?.mapData,scene=runtime?.game?.scene?.getScenes(true)?.[0];
  if(!scene||window.__v39BackgroundWorldTurn)return;
  scene.v39HegemonyZones?.destroy(true);scene.v39HegemonyZones=null;
  if(map?.hegemonyTestHub){
    window.renderV39VictoryLandmarkIcons?.();return;
  }
  if(!map?.hegemonyInterior)return;
  const area=V39_HEGEMONY_AREAS.find(row=>row.id===map.hegemonyAreaId);if(!area)return;
  const layer=scene.add.graphics().setDepth(12);scene.v39HegemonyZones=layer;
  const color=parseInt(area.color.slice(1),16);
  for(const key of map.hegemonyZoneKeys){
    const [x,y]=key.split(',').map(Number);
    if(!window.isV39TestMode?.()&&!window.isV39TileExplored?.(x,y))continue;
    const cx=x*hex.width+(y%2?hex.oddRowOffsetX:0)+hex.width/2,cy=y*hex.rowStep+hex.height/2;
    const points=[[0,-hex.height/2],[hex.width/2,hex.height/2-hex.rowStep],[hex.width/2,hex.rowStep-hex.height/2],
      [0,hex.height/2],[-hex.width/2,hex.rowStep-hex.height/2],[-hex.width/2,hex.height/2-hex.rowStep]]
      .map(([dx,dy])=>({x:cx+dx*.96,y:cy+dy*.96}));
    layer.fillStyle(color,.24).fillPoints(points,true);layer.lineStyle(2,color,.9).strokePoints(points,true);
  }
  scene.game.v39InvalidateRender?.();
}
for(const event of ['v39:visibility-rendered','v39:cave-world-ready','v39:save-loaded','v39:field-input-ready'])window.addEventListener(event,renderZones);
