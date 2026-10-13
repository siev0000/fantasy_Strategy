import fixture from "../../../../config/v39-expedition-test.json";
import undeadFixture from "../../../../config/v39-undead-test.json";
import { ensureV39CaveAreas } from "../../lib/v39-cave-areas.js";
import { V39_FOG_BALANCE } from "../../lib/v39-gameplay-balance.js";
import { buildV39UnitEntity } from "../../lib/v39-unit-creation-rules.js";
import {applyV39DerivedCharacterData} from '../unit/v39-character-derived-rules.js';
import {DEFAULT_CORPSE_FIELD_TURNS} from '../../lib/v39-turn-timing.js';
import { normalizeV39Village, FOOD_RESOURCE_KEYS, MATERIAL_RESOURCE_KEYS } from "../../lib/v39-economy-rules.js";
import { replaceFactionSettlement } from "../../lib/settlement-state.js";
import { getHexNeighborCoords } from "../../lib/hex-grid.js";
import { assignV39MineDuty } from "../../lib/v39-cave-operations.js";

function emptySpatial() {
  return {enemies:[],enemySquads:[],enemyNests:[],enemyCombatRuntime:{},settlements:[],neutralVillages:[],wandererGroups:[],territoryOwnerByTile:{},territoryStateByTile:{},recoveryPercentByTile:{},dangerPercentByTile:{},facilitiesByTile:{},groundLootByTile:{},explorationSitesByTile:{},specialtiesByTile:{},victoryLandmarksByTile:{},worldEnvironment:{}};
}
function testMap(template, size, underground) {
  const grid=Array.from({length:size},(_,y)=>Array.from({length:size},(_,x)=>underground?(x===0||y===0||x===size-1||y===size-1?"岩壁":"洞窟"):"平地"));
  return {...template,w:size,h:size,grid,isUnderground:underground,worldWrapEnabled:false,riverData:[],
    heightLevelMap:grid.map(row=>row.map(()=>0)),specialMap:grid.map(row=>row.map(()=>"")),
    lavaMap:grid.map(row=>row.map(()=>false)),snowCoverMap:grid.map(row=>row.map(()=>false)),
    entrances:[],caveSites:[],caveBossIds:[],caveMine:null,caveEventNpc:null,caveConquest:null,
    expeditionTestFixture:true};
}
export function buildV39ExpeditionTestWorlds(template, player, turn, invasion=false) {
  const surface=testMap(template,fixture.地上サイズ,false),cave=testMap(template,fixture.洞窟サイズ,true);
  surface.grid[fixture.入口.y][fixture.入口.x]="洞窟";
  const entry={...fixture.鉱床入口,key:`${fixture.鉱床入口.x},${fixture.鉱床入口.y}`,surfaceEntrance:{...fixture.入口}};
  Object.assign(cave,{parentWorldId:"surface",parentExit:{...fixture.入口},entrances:[entry],caveFloor:1,caveSeed:"expedition-test",
    caveSites:fixture.群生地.map(site=>({...site,key:`${site.x},${site.y}`,remaining:3,toolHarvestRemaining:3,toolHarvestTurn:turn})),
    caveMine:{ownerPlayerId:player.id,claimedTurn:turn,lastProcessedTurn:turn,productionProgress:0,resourcesPerCycle:{鉱石:1,宝石:1},stockByResource:{...fixture.鉱床在庫},suspended:false}});
  const territory=[fixture.拠点,...getHexNeighborCoords(surface.w,surface.h,fixture.拠点.x,fixture.拠点.y)].map(tile=>`${tile.x},${tile.y}`);
  const base=normalizeV39Village({...fixture.拠点,settlementId:fixture.拠点.id,placed:true,type:"村",population:50,populationByRace:{只人:50},territoryTileKeys:territory,
    foodStockByType:Object.fromEntries(FOOD_RESOURCE_KEYS.map(name=>[name,1000])),materialStockByType:Object.fromEntries(MATERIAL_RESOURCE_KEYS.map(name=>[name,100])),
    toolStockByType:{薬草:10,水薬:5,霊薬:2,聖水:2,煙玉:2},tileFacilityMap:{"4,3":["兵舎"]}},player.race);
  const units=fixture.ユニット.map(row=>{
    const unit=buildV39UnitEntity({...row,isNamed:row.unitType!=="軍隊ユニット",equipment:[{slot:"武器1",name:row.className==="クレリック"?"杖":"剣"},{slot:"体",name:row.className==="クレリック"?"法衣":"鎧"}]});
    if(!unit.derivedCharacter?.ok)throw new Error(`テストユニットを生成できません: ${row.name}`);
    const position=invasion&&row.worldId?{x:6,y:3}:row;
    const hp=Math.max(1,Math.floor(unit.maxHp*(row.hpRate||1)));
    return {...unit,x:position.x,y:position.y,position:[position.x,position.y],worldId:invasion?"surface":row.worldId||"surface",hp,currentHp:hp,
      isSovereign:row.isSovereign===true,testOnly:true,toolStockByType:{...row.toolStockByType},expeditionCargoByType:{...row.expeditionCargoByType}};
  });
  let faction={...player.factionState,units,exploration:{researchDiscoveryVersion:1,discoveredCaveEntrancesByTile:{[`${fixture.入口.x},${fixture.入口.y}`]:true}},squads:[{id:"expedition-support",label:"支援検証部隊",unitIds:units.filter(unit=>unit.squadId==="expedition-support").map(unit=>unit.id)},
    {id:"solo",label:"単独",unitIds:units.filter(unit=>unit.squadId==="solo").map(unit=>unit.id)}],settlements:[],villagePlacementMode:false,unitTrainingQueue:[],selectedUnitId:units[0].id};
  faction=replaceFactionSettlement(faction,base,{ownerPlayerId:player.id});
  const spatial=emptySpatial();
  spatial.territoryOwnerByTile=Object.fromEntries(territory.map(key=>[key,player.id]));
  spatial.facilitiesByTile={...base.tileFacilityMap};
  const village={...fixture.村,level:1,population:20,populationByRace:{只人:20},territoryTileKeys:[fixture.村,...getHexNeighborCoords(surface.w,surface.h,fixture.村.x,fixture.村.y)].map(tile=>`${tile.x},${tile.y}`),relationsByPlayerId:{[player.id]:0},questsByPlayerId:{},defenseUnits:[]};
  spatial.neutralVillages=[village];spatial.settlements=[village];
  for(const key of village.territoryTileKeys)spatial.territoryOwnerByTile[key]=village.id;
  if(invasion){
    spatial.enemies=fixture.侵入者.map(row=>({...buildV39UnitEntity({...row,isNamed:false}),worldId:"surface",nestId:"expedition-test-nest",enemySquadId:"expedition-test-pack"}));
    const ids=spatial.enemies.map(unit=>unit.id);
    spatial.enemyNests=[{id:"expedition-test-nest",race:"ウルフ",x:9,y:8,unitIds:ids,foodStockByType:{肉:80},materialStockByType:{}}];
    spatial.enemySquads=[{id:"expedition-test-pack",unitIds:ids}];
  }
  const worlds={surface:{map:surface,spatial,visibility:{}},[fixture.鉱床ID]:{map:cave,spatial:emptySpatial(),visibility:{}}};
  return {worlds,player:{...player,factionState:faction}};
}
export function buildV39UndeadTestWorlds(template,player,turn) {
  const built=buildV39ExpeditionTestWorlds(template,player,turn);
  const surface=built.worlds.surface.map,cave=testMap(template,undeadFixture.洞窟サイズ,true);
  cave.grid=cave.grid.map(row=>row.map(()=>"岩壁"));
  cave.rooms=undeadFixture.部屋;
  cave.roomOutlines=[];
  for(const [cx,cy,rx,ry] of cave.rooms)for(let y=cy-ry;y<=cy+ry;y++)for(let x=cx-rx;x<=cx+rx;x++)cave.grid[y][x]="洞窟";
  for(let x=5;x<=12;x++)cave.grid[5][x]="洞窟";
  Object.assign(cave,{parentWorldId:"surface",parentExit:fixture.入口,caveFloor:1,
    entrances:[{x:3,y:3,key:"3,3",surfaceEntrance:fixture.入口}],caveSeed:"undead-test"});
  for(const map of [surface,cave]) {
    Object.assign(map,{fogMap:[],purificationByTile:{},unholyEventTurnByTile:{},unholyUndeadOrigins:[],
      lastPurificationTurn:0,deathFogSourceByTile:{},caveAreaByTile:null,caveAreas:null,undeadTestFixture:true});
  }
  ensureV39CaveAreas(cave);
  const spatialFor=rows=>({...emptySpatial(),groundLootByTile:Object.fromEntries(rows.map(row=>[
    `${row.x},${row.y}`,{cargo:{resourcesByType:{死体:row.人数*V39_FOG_BALANCE.corpseResourcePerBody},equipmentInventory:[]}}
  ]))});
  built.worlds={surface:{map:surface,spatial:spatialFor(undeadFixture.地上死体),visibility:{}},
    [undeadFixture.洞窟ID]:{map:cave,spatial:spatialFor(undeadFixture.洞窟死体),visibility:{}}};
  for(const row of undeadFixture.個体死体 || []) {
    const unit=applyV39DerivedCharacterData({...buildV39UnitEntity({...row,isNamed:false}),
      promotionGrowthStart:row.promotionGrowthStart,worldId:row.worldId,testOnly:true,
      state:'死亡',hp:0,currentHp:0,ap:0,currentAp:0,deathTurn:turn,deadExpireTurn:turn+DEFAULT_CORPSE_FIELD_TURNS});
    if(!unit.derivedCharacter?.ok)throw new Error(`死体を生成できません: ${row.name}`);
    built.worlds[row.worldId].spatial.enemies.push(unit);
  }
  const units=undeadFixture.ユニット.map(row=>({...buildV39UnitEntity({...row,isNamed:true,
    equipment:[{slot:"武器1",name:"剣"},{slot:"体",name:"鎧"}]}),...row,worldId:row.worldId||"surface",testOnly:true}));
  built.player={...built.player,factionState:{...built.player.factionState,units,selectedUnitId:units[0].id,
    squads:units.map(unit=>({id:unit.squadId,label:unit.name,unitIds:[unit.id]})),unitTrainingQueue:[]}};
  const base=built.player.factionState.settlements[0];
  built.worlds.surface.spatial.territoryOwnerByTile=Object.fromEntries(base.territoryTileKeys.map(key=>[key,player.id]));
  built.worlds.surface.spatial.facilitiesByTile={...base.tileFacilityMap};
  return built;
}
function startTest(invasion=false,undead=false) {
  if(!window.isV39TestMode?.()||window.isV39MapInputLocked?.())return {ok:false,reason:"テストモードで処理が完了してから使用してください"};
  window.cancelV39SelectedUnitMove?.();window.cancelV39SelectedUnitAttack?.("expedition-test");
  const session=window.startV39LocalSession(1,{playMode:"single-test"});
  // 検証王を後で配置するため、マップ生成時の通常の統治者作成フローを開始させない。
  window.setV39GameState({players:session.players.map(player=>({...player,factionState:{...player.factionState,
    units:player.factionState.units.map((unit,index)=>index===0?{...unit,isSovereign:true}:unit)}}))},{silent:true});
  const template=window.generateV39TestFieldWithSeed({w:fixture.地上サイズ,h:fixture.地上サイズ,patternId:"realistic"},"expedition-test");
  const built=undead?buildV39UndeadTestWorlds(template,session.players[0],1):buildV39ExpeditionTestWorlds(template,session.players[0],1,invasion);
  window.loadV39FieldSnapshot(built.worlds.surface.map,{...window.__v39FieldRuntime.settings,w:fixture.地上サイズ,h:fixture.地上サイズ},{layerChange:true});
  let state={...window.getV39GameState(),activeWorldId:"surface",explorationWorlds:built.worlds,...built.worlds.surface.spatial,players:[built.player]};
  if(!invasion&&!undead){const assigned=assignV39MineDuty(state,state.activePlayerId,fixture.鉱床ID,"expedition-test-carrier","transport",fixture.拠点.id);if(!assigned.ok)throw new Error(assigned.reason);state=assigned.state;}
  window.setV39GameState(state,{reason:"expedition-test-started"});
  window.refreshV39SquadDerivedUI?.();window.refreshV39MapEntities?.();window.activateV39FooterTab?.("test");
  window.showV39TurnBanner?.(undead?"死体を配置しました。地上・洞窟に観察者各1体。通常ターンで浄化低下と自然発生を確認します。":invasion?"侵入検証: 入口のウルフ2体が通常ターンで侵入。地下へ人を入れず5ターン経過を確認。":"検証データ配置: 輸送は設定済み。鉱床を表示すると道具・採取・警備指定を確認できます。");
  return {ok:true,worldId:undead?undeadFixture.洞窟ID:fixture.鉱床ID};
}
window.startV39ExpeditionTest=(invasion=false)=>startTest(invasion);
window.startV39UndeadTest=()=>startTest(false,true);
