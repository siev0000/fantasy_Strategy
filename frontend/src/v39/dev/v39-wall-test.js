import fixture from '../../../../config/v39-wall-test.json';
import {createV39DefenseStructure,v39DefenseNeighbors} from '../../lib/v39-defense-rules.js';
import {collectV39WallOuterEdges,v39WallEdgeKey} from '../../lib/v39-wall-edges.js';
import {getVillageScaleDefinitions} from '../../composables/villageCoreUtils.js';
import {V39_DEFENSE_BALANCE} from '../../lib/v39-gameplay-balance.js';
import {buildV39UnitEntity} from '../../lib/v39-unit-creation-rules.js';
import {focusV39MapTile} from '../map/v39-map-focus.js';

export function buildV39WallTestFixture(ownerId,turn=1){
  const grid=()=>Array.from({length:fixture.height},()=>Array(fixture.width).fill(''));
  const map={w:fixture.width,h:fixture.height,worldWrapEnabled:false,isUnderground:false,hegemonyInterior:null,
    grid:Array.from({length:fixture.height},()=>Array(fixture.width).fill('平地')),
    heightLevelMap:Array.from({length:fixture.height},()=>Array(fixture.width).fill(0)),specialMap:grid(),reliefMap:grid(),
    lavaMap:[],snowCoverMap:[],snowfallMap:[],fogMap:[],hazardZones:[],disasterFields:[],terrainDamage:{},
    caveSites:[],entrances:[],riverData:[],victoryLandmarksByTile:{},defenseStructures:[],wallTestFixture:true};
  const tileFacilityMap={},samples=[],settlements=[];
  const settlementId='wall-test-base';
  for(const sample of fixture.samples){
    const rule=sample.facility?V39_DEFENSE_BALANCE.facilityWalls[sample.facility]:null;
    if(rule){
      const from={x:sample.x,y:sample.y},tiles=[from,...v39DefenseNeighbors(from).slice(0,sample.footprint-1)];
      const baseId=sample.id==='defense'?settlementId:`wall-test-${sample.id}-base`;
      const structures=collectV39WallOuterEdges(tiles,map).map(edge=>{
        const wall=createV39DefenseStructure(map,edge.from,{名前:sample.name,効果:'壁',ガード:rule.hp},{id:sample.id,ownerPlayerId:ownerId},turn);
        return {...wall,id:`${sample.id}-${v39WallEdgeKey(edge)}`,edge,height:rule.height,wallFacilityName:sample.facility,settlementId:baseId};
      });
      map.defenseStructures.push(...structures);
      samples.push({id:sample.id,name:sample.name,x:sample.x,y:sample.y,structureIds:structures.map(w=>w.id),structureId:structures[0].id});
      const scale=getVillageScaleDefinitions().find(row=>row.footprintTiles===sample.footprint);
      settlements.push({id:baseId,settlementId:baseId,name:`${sample.footprint}マス${scale?.name||'拠点'}`,placed:true,worldId:'surface',...from,
        scaleKey:scale?.key,scaleLevel:scale?.level,population:50,populationByRace:{只人:50},buildings:[],tileFacilityMap:{},
        territoryResidentialCenterMap:Object.fromEntries(tiles.map(p=>[`${p.x},${p.y}`,`${from.x},${from.y}`])),
        territoryResidentialLevelMap:Object.fromEntries(tiles.map(p=>[`${p.x},${p.y}`,scale?.key])),
        territoryTileModeMap:Object.fromEntries(tiles.map(p=>[`${p.x},${p.y}`,'settlement'])),type:scale?.name,
        foodStockByType:{穀物:1000},materialStockByType:{木材:10000,石材:10000,鉄:10000,金:10000},cityLevels:{軍事Lv:10,経済Lv:10,信仰Lv:10,鍛冶Lv:10,魔法Lv:10}});
      continue;
    }
    const structure=createV39DefenseStructure(map,{x:sample.x,y:sample.y},
      {名前:sample.name,効果:sample.kind||(sample.barrier?'壁 障壁':'壁'),範囲:sample.kind==='結界'?'周囲':sample.edge?'辺':'単体',炸裂:10,ガード:sample.guard,効果時間:sample.duration||0},
      {id:`wall-test-${sample.id}`,ownerPlayerId:ownerId},turn,sample.facing||0);
    if(!structure)throw new Error(`${sample.name}を配置できません`);
    map.defenseStructures.push(structure);samples.push({id:sample.id,name:sample.name,x:sample.x,y:sample.y,structureId:structure.id});
  }
  map.wallTestSamples=samples;
  const tile=fixture.construction,buildId='wall-build-test-base';
  const buildTiles=[tile,...v39DefenseNeighbors(tile)];
  settlements.push({...structuredClone(settlements[1]),id:buildId,settlementId:buildId,name:'壁建築検証拠点',...tile,
    territoryResidentialLevelMap:Object.fromEntries(buildTiles.map(p=>[`${p.x},${p.y}`,settlements[1].scaleKey])),
    territoryTileModeMap:Object.fromEntries(buildTiles.map(p=>[`${p.x},${p.y}`,'settlement'])),
    territoryResidentialCenterMap:Object.fromEntries(buildTiles.map(p=>[`${p.x},${p.y}`,`${tile.x},${tile.y}`]))});
  map.wallBuildTestTile={...tile};
  const settlement=settlements[0];
  const units=[['wall-move','移動試験官',3,4],['wall-attack','壁破壊試験官',3,5]].map(([id,name,x,y])=>({
    ...buildV39UnitEntity({id,name,race:'只人',className:'ファイター',level:20,x,y,
      equipment:[{name:'棍棒',slot:'武器1',power:250,attackAp:20,range:30,quality:'common'}]}),
    worldId:'surface',testOnly:true,testMovementMinimum:100,squadId:'solo',hp:1000,currentHp:1000,maxHp:1000,ap:100,currentAp:100}));
  const territoryStateByTile={};
  for(const base of settlements)for(const key of Object.keys(base.territoryResidentialCenterMap)){
    territoryStateByTile[key]={settlementId:base.settlementId,hp:100,maxHp:100};
  }
  return {map,settlement,settlements,units,territoryOwnerByTile:Object.fromEntries(Object.keys(territoryStateByTile).map(key=>[key,ownerId])),
    territoryStateByTile,facilitiesByTile:tileFacilityMap};
}

export async function startV39WallTest(){
  if(!window.isV39TestMode?.()||window.isV39MapInputLocked?.())return false;
  const started=window.startV39ExpeditionTest?.(false,{silentBanner:true});if(!started?.ok)return false;
  await window.waitForV39MapRenderSettled?.();
  const state=window.getV39GameState(),player=state.players.find(row=>row.id===state.activePlayerId),runtime=window.__v39FieldRuntime;
  const {map,settlement,settlements,units,...spatial}=buildV39WallTestFixture(player.id,state.timeline?.turnNumber||1);
  window.setV39GameState({...spatial,settlements,enemies:[],enemySquads:[],enemyNests:[],neutralVillages:[],victoryLandmarksByTile:{},
    worldEnvironment:{activeDisasters:[]},players:[{...player,factionState:{...player.factionState,units,
      settlements,village:null,selectedSettlementId:settlement.settlementId,
      squads:[{id:'solo',name:'単独',unitIds:units.map(unit=>unit.id)}],selectedSquadId:'solo',selectedUnitId:units[0].id,combatRuntime:{}}}]},
    {reason:'wall-test-start',trackUnitDeaths:false});
  window.loadV39FieldSnapshot({...runtime.mapData,...map},runtime.settings,{layerChange:true,worldId:'surface'});
  await window.waitForV39MapRenderSettled?.();
  const scene=runtime.game?.scene?.getScenes(true)?.[0];
  if(scene){scene.v39RequestedZoom=.6;scene.cameras?.main?.setZoom(.6);}
  focusV39MapTile({x:8,y:6},{worldId:'surface',select:true,notify:false});
  window.activateV39FooterTab?.('test');window.refreshV39SquadDerivedUI?.();window.refreshV39MapEntities?.();
  window.showV39TurnBanner?.('壁5種を配置。テストの各壁ボタンで位置とHPを確認。部隊の移動/攻撃で比較できます。魔法壁は5Tで消滅。');
  return true;
}
window.startV39WallTest=startV39WallTest;
window.openV39WallBuildTest=()=>{
  const map=window.__v39FieldRuntime?.mapData,tile=map?.wallBuildTestTile;
  if(!map?.wallTestFixture||!tile||!window.isV39TestMode?.())return false;
  focusV39MapTile(tile,{worldId:'surface',select:true,notify:false});
  return window.openV39LandConstruction?.(tile,{facilityName:'防壁'})||false;
};
window.focusV39WallTestSample=id=>{
  const map=window.__v39FieldRuntime?.mapData,sample=map?.wallTestSamples?.find(row=>row.id===id);
  if(!sample||!map.wallTestFixture)return false;
  const structure=map.defenseStructures?.find(row=>row.id===sample.structureId);
  focusV39MapTile(sample,{worldId:'surface',select:true,notify:false});
  window.showV39TurnBanner?.(`${sample.name} (${sample.x},${sample.y}) / ${structure?`HP ${structure.hp}/${structure.maxHp}・高さ${structure.height}`:'破壊済み・効果終了'}`);
  return true;
};
