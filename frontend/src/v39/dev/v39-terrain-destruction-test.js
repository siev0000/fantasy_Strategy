import {focusV39MapTile} from '../map/v39-map-focus.js';
export async function startV39TerrainDestructionTest(){
  if(!window.isV39TestMode?.()||window.isV39MapInputLocked?.())return false;
  window.startV39ExpeditionTest();await window.waitForV39MapRenderSettled?.();
  const runtime=window.__v39FieldRuntime,source=runtime.mapData,map={...source,w:18,h:14,worldWrapEnabled:false,isUnderground:false,
    grid:Array.from({length:14},()=>Array(18).fill('平地')),heightLevelMap:Array.from({length:14},()=>Array(18).fill(1)),specialMap:Array.from({length:14},()=>Array(18).fill('')),
    lavaMap:Array.from({length:14},()=>Array(18).fill(false)),caveSites:[],entrances:[],defenseStructures:[],terrainDamage:{},hazardZones:[],riverData:[],victoryLandmarksByTile:{}};
  for(const [x,y,type]of [[3,6,'丘陵'],[5,6,'山岳'],[7,6,'山岳']]){map.grid[y][x]=type;map.heightLevelMap[y][x]=3;}
  map.terrainDamage.rubbleByTile={'3,8':{hp:100,maxHp:100}};
  const state=window.getV39GameState(),p=state.players.find(p=>p.id===state.activePlayerId),base=p.factionState.units[0];
  const units=[0,1].map(i=>({...base,id:`ground-test-${i}`,name:i?'撤去試験官':'地形破壊試験官',race:'只人',className:'ファイター',level:20,x:2,y:6+i,worldId:'surface',hp:1000,currentHp:1000,maxHp:1000,ap:100,currentAp:100,testOnly:true,testMovementMinimum:100,squadId:'solo',caveDuty:null,transportAssignment:null,tradeAssignment:null,equipment:[{name:'棍棒',slot:'武器1',power:1000,attackAp:20,range:3,quality:'common'}]}));
  window.setV39GameState({players:[{...p,factionState:{...p.factionState,units,squads:[{id:'solo',label:'単独',unitIds:units.map(u=>u.id)}],selectedSquadId:'solo',selectedUnitId:units[0].id,settlements:[],village:null,combatRuntime:{}}}],enemies:[],enemyNests:[],neutralVillages:[],facilitiesByTile:{},territoryOwnerByTile:{},territoryStateByTile:{},victoryLandmarksByTile:{},worldEnvironment:{activeDisasters:[]}});
  window.loadV39FieldSnapshot(map,runtime.settings,{layerChange:true,worldId:'surface'});
  await window.waitForV39MapRenderSettled?.();
  const scene=runtime.game.scene.getScenes(true)[0];scene.v39RequestedZoom=1;scene.cameras.main.setZoom(1);
  focusV39MapTile(units[0],{worldId:'surface',select:true,notify:false});
  window.activateV39FooterTab('squad');window.refreshV39SquadDerivedUI?.();
  window.showV39TurnBanner?.('棍棒で丘陵(3,6)の耐久を0にする → 1T経過で落石。瓦礫(3,8)へ隣接すると基本に撤去を表示');
  return true;
}
window.startV39TerrainDestructionTest=startV39TerrainDestructionTest;
