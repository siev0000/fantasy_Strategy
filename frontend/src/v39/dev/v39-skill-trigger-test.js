import {createSpyTestFixture} from './v39-spy-test.js';
import fixture from '../../../../config/v39-skill-trigger-test.json';
import {buildV39UnitEntity} from '../../lib/v39-unit-creation-rules.js';
import {declareV39War} from '../../lib/v39-diplomacy-rules.js';
import {focusV39MapTile} from '../map/v39-map-focus.js';
import {getSelectedSettlement,replaceFactionSettlement} from '../../lib/settlement-state.js';
import {getV39EquipmentCatalog,normalizeV39EquipmentInventory} from '../../lib/v39-equipment-rules.js';
import {MATERIAL_RESOURCE_KEYS} from '../../lib/v39-economy-rules.js';
import {getHexNeighborCoords} from '../../lib/hex-grid.js';

function createTestMap({width,height}=fixture.mapSize){
  const grid=value=>Array.from({length:height},()=>Array(width).fill(value));
  return {w:width,h:height,worldWrapEnabled:false,isUnderground:false,hegemonyInterior:null,
    grid:grid('平地'),heightLevelMap:grid(0),specialMap:grid(''),reliefMap:grid(''),
    lavaMap:[],snowCoverMap:[],snowfallMap:[],fogMap:[],hazardZones:[],disasterFields:[],terrainDamage:{},
    caveSites:[],entrances:[],riverData:[],victoryLandmarksByTile:{},defenseStructures:[]};
}

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
  const {unit,targets,equipmentNames,startingQualities,weaponCraftSpecialist,skillGrantTestUnit,skillGrantThief,skillGrantStock}=fixture.equipmentTest;
  const qualities=craftEquipment ? startingQualities : [undefined];
  const equipmentStock=equipmentNames.flatMap(name=>qualities.map(quality=>({name,quality})));
  const tester={...buildV39UnitEntity(unit),worldId:'surface',testOnly:true,squadId:'solo'};
  const dummies=targets.map(target=>({
    ...buildV39UnitEntity({...target,race:unit.race}),worldId:'surface',testOnly:true,
    testTrainingTarget:true,squadId:'solo',hp:fixture.hp,currentHp:fixture.hp,maxHp:fixture.hp,
    ap:0,currentAp:0,maxAp:0
  }));
  const testers=[tester];
  if(!craftEquipment){
    const {unit:reaper,demonUnit,weapon,actions,additionalSkillNames}=fixture.namedUnitTest;
    const baseWeapon=getV39EquipmentCatalog().some(({name})=>name==="刀")?"刀":weapon.name;
    testers.push({...buildV39UnitEntity({...reaper,equipment:[{...weapon,name:baseWeapon}]}),
      worldId:"surface",testOnly:true,testSkillNames:[...actions.map(row=>row.名前),...additionalSkillNames]});
    testers.push({...buildV39UnitEntity(demonUnit),worldId:"surface",testOnly:true,squadId:"solo"});
  }
  if(craftEquipment){
    const stockedRareTypes=new Set(equipmentStock.filter(item=>item.quality==="rare").map(item=>item.name));
    for(const {name} of getV39EquipmentCatalog()){
      if(!stockedRareTypes.has(name))equipmentStock.push({name,quality:"rare"});
    }
    equipmentStock.push(skillGrantStock);
    testers.push(...[skillGrantTestUnit,skillGrantThief].map(sample=>({
      ...buildV39UnitEntity(sample),worldId:'surface',testOnly:true,squadId:'solo'
    })));
  }
  for(const [index, additions] of [[0,testers],[1,dummies]]){
    const faction=players[index].factionState;
    faction.units=craftEquipment?additions:[...faction.units,...additions];
    faction.squads[0].unitIds=faction.units.map(member=>member.id);
    faction.selectedUnitId=craftEquipment?faction.units[0].id:faction.selectedUnitId;
  }
  const map={...createTestMap(),skillTriggerTestFixture:true,equipmentCraftTestFixture:craftEquipment};
  const base=getSelectedSettlement(player.factionState)||{id:'equipment-test-base',settlementId:'equipment-test-base',
    name:'武具検証拠点',x:4,y:4,placed:true,type:'村',population:50};
  const tileKey=`${base.x},${base.y}`;
  const neighbors=craftEquipment?getHexNeighborCoords(map.w,map.h,base.x,base.y):[];
  const territoryTileKeys=[tileKey,...neighbors.map(tile=>tile.key)];
  const forge=neighbors.find(tile=>!players.some(side=>side.factionState.units.some(member=>member.x===tile.x&&member.y===tile.y)))??base;
  if(craftEquipment){
    const {id,name,className,craftSkill,passiveSkillNames}=weaponCraftSpecialist;
    const faction=players[0].factionState;
    const smith=buildV39UnitEntity({id,name,race:unit.race,className:"ファイター",level:10,x:forge.x,y:forge.y});
    faction.units.push({...smith,worldId:"surface",squadId:"solo",testOnly:true,
      testWeaponCraft:{className,craftSkill},testSkillNames:passiveSkillNames});
    faction.squads[0].unitIds.push(id);
  }
  const facilities=['鍛冶場'];
  const facilitiesByTile={[`${forge.x},${forge.y}`]:facilities};
  players[0].factionState=replaceFactionSettlement(players[0].factionState,{
    ...base,buildings:facilities,tileFacilityMap:facilitiesByTile,territoryTileKeys,
    ...(craftEquipment?{facilityStateByTile:{},constructionQueue:[]}:{}),
    cityLevels:{...base.cityLevels, ...(craftEquipment ? {鍛冶Lv:5, 魔法Lv:7, 信仰Lv:5} : {鍛冶Lv:1})},
    materialStockByType:{...base.materialStockByType,...Object.fromEntries(MATERIAL_RESOURCE_KEYS.map(name=>[name,100])),
      ...(craftEquipment?{金:300}:{})},
    equipmentInventory:normalizeV39EquipmentInventory(equipmentStock)
  },{ownerPlayerId:player.id});
  return {map,players,facilitiesByTile,territoryOwnerByTile:Object.fromEntries(territoryTileKeys.map(key=>[key,player.id])),
    territoryStateByTile:Object.fromEntries(territoryTileKeys.map(key=>[key,{status:'領土',settlementId:base.settlementId||base.id}])),
    diplomacyRelations:declareV39War({players,diplomacyRelations:{}},players[0].id,players[1].id,1).diplomacyRelations};
}

export function selectV39SkillTriggerTestSide(index){
  const map=window.__v39FieldRuntime?.mapData;
  if(!window.isV39TestMode?.()||!(map?.skillTriggerTestFixture||map?.spyTestFixture))return false;
  const state=window.getV39GameState(),player=state.players[index];
  if(!player)return false;
  window.setV39GameState({activePlayerId:player.id,timeline:{...state.timeline,activeTurnPlayerId:player.id,phase:'player'}},{reason:'skill-trigger-test-side'});
  if(map.spyTestFixture){
    window.refreshV39MapEntities?.();window.activateV39FooterTab?.('interaction');window.openV39SpyPanel?.();return true;
  }
  window.activateV39FooterTab?.('squad');
  window.refreshV39SquadDerivedUI?.();window.refreshV39MapEntities?.();
  focusV39MapTile(player.factionState.units[0],{worldId:'surface',select:true,notify:false});
  window.showV39TurnBanner?.(window.__v39FieldRuntime.mapData.equipmentCraftTestFixture
    ? '武具作成テスト。シーフに戦士の短剣（レア）を装備すると闘気撃が出ます。'
    : player.name+'を操作中。味方の「黒角侯ヴァルグ」で悪魔ネームドの姿を確認できます。「死神検証・フェンサー」はスカーミッシャー取得で死神になります。');
  return true;
}

export async function startV39SkillTriggerTest(options={}){
  if(!window.isV39TestMode?.()||window.isV39MapInputLocked?.())return false;
  const started=window.startV39ExpeditionTest?.(false,{silentBanner:true});if(!started?.ok)return false;
  await window.waitForV39MapRenderSettled?.();
  const state=window.getV39GameState(),runtime=window.__v39FieldRuntime;
  const player=state.players.find(row=>row.id===state.activePlayerId);
  const {map,...data}=options.spyTest?createSpyTestFixture(player,createTestMap({width:24,height:16})):createV39SkillTriggerFieldFixture(player,options);
  window.setV39GameState({...data,activeWorldId:'surface',activePlayerId:player.id,
    gameSettings:{...state.gameSettings,turnProgressionMode:'standard'},
    timeline:{...state.timeline,activeTurnPlayerId:player.id,phase:'player'},
    settlements:[],enemies:[],enemySquads:[],enemyNests:[],neutralVillages:[],victoryLandmarksByTile:{},
    worldEnvironment:{activeDisasters:[]}},
    {reason:'skill-trigger-test-start',trackUnitDeaths:false});
  window.loadV39FieldSnapshot({...runtime.mapData,spyTestFixture:false,skillTriggerTestFixture:false,equipmentCraftTestFixture:false,...map},runtime.settings,{layerChange:true,worldId:'surface'});
  await window.waitForV39MapRenderSettled?.();
  selectV39SkillTriggerTestSide(0);
  return true;
}
