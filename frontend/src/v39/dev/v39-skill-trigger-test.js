import fixture from '../../../../config/v39-skill-trigger-test.json';
import {buildV39UnitEntity} from '../../lib/v39-unit-creation-rules.js';
import {declareV39War} from '../../lib/v39-diplomacy-rules.js';
import {focusV39MapTile} from '../map/v39-map-focus.js';
import {getSelectedSettlement,replaceFactionSettlement} from '../../lib/settlement-state.js';
import {normalizeV39EquipmentInventory} from '../../lib/v39-equipment-rules.js';
import {MATERIAL_RESOURCE_KEYS} from '../../lib/v39-economy-rules.js';

export function createV39SkillTriggerFieldFixture(player,{craftEquipment=false}={}){
  const players=fixture.units.map((sample,index)=>{
    const units=[sample,...(sample.companions||[])].map(({companions,...member})=>({
      ...buildV39UnitEntity({...member,race:member.race,className:member.className,level:fixture.level}),
      worldId:'surface',testOnly:true,testMovementMinimum:100,testFlightMinimum:member.flightMinimum||0,squadId:'solo',
      hp:fixture.hp,currentHp:fixture.hp,maxHp:fixture.hp,ap:100,currentAp:100,
      testSkillNames:[...fixture.actions.map(row=>row.名前),...(fixture.additionalSkillNames||[]),...(member.passiveSkillNames||[])]
    }));
    return {...player,id:index?'trigger-test-opponent':player.id,name:index?'検証B・天使':'検証A・人族',race:sample.race,
      isPlayer:true,isNpc:false,ready:true,factionState:{...player.factionState,
      units,settlements:[],village:null,selectedSettlementId:null,
      squads:[{id:'solo',name:'単独',unitIds:units.map(unit=>unit.id)}],selectedSquadId:'solo',selectedUnitId:units[0].id,combatRuntime:{}}};
  });
  const {unit,targets,equipmentNames}=fixture.equipmentTest;
  const tester={...buildV39UnitEntity(unit),worldId:'surface',testOnly:true,squadId:'solo'};
  const dummies=targets.map(target=>({
    ...buildV39UnitEntity({...target,race:unit.race}),worldId:'surface',testOnly:true,
    testTrainingTarget:true,squadId:'solo',hp:fixture.hp,currentHp:fixture.hp,maxHp:fixture.hp,
    ap:0,currentAp:0,maxAp:0
  }));
  for(const [index, additions] of [[0,[tester]],[1,dummies]]){
    const faction=players[index].factionState;
    faction.units=craftEquipment?additions:[...faction.units,...additions];
    faction.squads[0].unitIds=faction.units.map(member=>member.id);
    faction.selectedUnitId=craftEquipment?faction.units[0].id:faction.selectedUnitId;
  }
  const base=getSelectedSettlement(player.factionState)||{id:'equipment-test-base',settlementId:'equipment-test-base',
    name:'武具検証拠点',x:4,y:4,placed:true,type:'村',population:50};
  const tileKey=`${base.x},${base.y}`;
  const facilities=['鍛冶場'];
  players[0].factionState=replaceFactionSettlement(players[0].factionState,{
    ...base,buildings:facilities,tileFacilityMap:{[tileKey]:facilities},territoryTileKeys:[tileKey],
    cityLevels:{...base.cityLevels,鍛冶Lv:1},
    materialStockByType:{...base.materialStockByType,...Object.fromEntries(MATERIAL_RESOURCE_KEYS.map(name=>[name,100]))},
    equipmentInventory:craftEquipment?[]:normalizeV39EquipmentInventory(equipmentNames.map(name=>({name})))
  },{ownerPlayerId:player.id});
  const {width,height}=fixture.mapSize;
  const grid=value=>Array.from({length:height},()=>Array(width).fill(value));
  const map={w:width,h:height,worldWrapEnabled:false,isUnderground:false,hegemonyInterior:null,
    grid:grid('平地'),heightLevelMap:grid(0),specialMap:grid(''),reliefMap:grid(''),
    lavaMap:[],snowCoverMap:[],snowfallMap:[],fogMap:[],hazardZones:[],disasterFields:[],terrainDamage:{},
    caveSites:[],entrances:[],riverData:[],victoryLandmarksByTile:{},defenseStructures:[],skillTriggerTestFixture:true,
    equipmentCraftTestFixture:craftEquipment};
  return {map,players,facilitiesByTile:{[tileKey]:facilities},territoryOwnerByTile:{[tileKey]:player.id},
    territoryStateByTile:{[tileKey]:{status:'領土',settlementId:base.settlementId||base.id}},
    diplomacyRelations:declareV39War({players,diplomacyRelations:{}},players[0].id,players[1].id,1).diplomacyRelations};
}

export function selectV39SkillTriggerTestSide(index){
  if(!window.isV39TestMode?.()||!window.__v39FieldRuntime?.mapData?.skillTriggerTestFixture)return false;
  const state=window.getV39GameState(),player=state.players[index];
  if(!player)return false;
  window.setV39GameState({activePlayerId:player.id,timeline:{...state.timeline,activeTurnPlayerId:player.id,phase:'player'}},{reason:'skill-trigger-test-side'});
  window.activateV39FooterTab?.('squad');
  window.refreshV39SquadDerivedUI?.();window.refreshV39MapEntities?.();
  focusV39MapTile(player.factionState.units[0],{worldId:'surface',select:true,notify:false});
  window.showV39TurnBanner?.(window.__v39FieldRuntime.mapData.equipmentCraftTestFixture
    ? '武具作成テスト。検証拠点で武具を作り、武具検証ユニットに装備して案山子を攻撃できます。'
    : player.name+'を操作中。操作する兵は部隊一覧で選択。武具検証ユニットで剣・弓・篭手・素手を比較できます。');
  return true;
}

export async function startV39SkillTriggerTest(options={}){
  if(!window.isV39TestMode?.()||window.isV39MapInputLocked?.())return false;
  const started=window.startV39ExpeditionTest?.(false,{silentBanner:true});if(!started?.ok)return false;
  await window.waitForV39MapRenderSettled?.();
  const state=window.getV39GameState(),runtime=window.__v39FieldRuntime;
  const player=state.players.find(row=>row.id===state.activePlayerId);
  const {map,...data}=createV39SkillTriggerFieldFixture(player,options);
  window.setV39GameState({...data,activeWorldId:'surface',activePlayerId:player.id,
    gameSettings:{...state.gameSettings,turnProgressionMode:'standard'},
    timeline:{...state.timeline,activeTurnPlayerId:player.id,phase:'player'},
    settlements:[],enemies:[],enemySquads:[],enemyNests:[],neutralVillages:[],victoryLandmarksByTile:{},
    worldEnvironment:{activeDisasters:[]}},
    {reason:'skill-trigger-test-start',trackUnitDeaths:false});
  window.loadV39FieldSnapshot({...runtime.mapData,...map},runtime.settings,{layerChange:true,worldId:'surface'});
  await window.waitForV39MapRenderSettled?.();
  selectV39SkillTriggerTestSide(0);
  return true;
}
