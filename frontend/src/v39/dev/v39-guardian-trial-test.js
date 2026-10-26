import {buildV39UnitEntity} from '../../lib/v39-unit-creation-rules.js';
import {normalizeV39Village,FOOD_RESOURCE_KEYS,MATERIAL_RESOURCE_KEYS} from '../../lib/v39-economy-rules.js';
import {normalizeV39NeutralVillage} from '../../lib/v39-neutral-village-rules.js';
import {getHexNeighborCoords} from '../../lib/hex-grid.js';

window.startV39GuardianTrialTest=async()=>{
  if(!window.isV39TestMode?.()||window.isV39MapInputLocked?.())return {ok:false};
  window.cancelV39SelectedUnitMove?.();window.cancelV39SelectedUnitAttack?.('guardian-trial-test');
  const session=window.startV39LocalSession(1,{playMode:'single-test'}),initial=window.getV39GameState(),player=session.players[0];
  const w=28,h=22,grid=Array.from({length:h},()=>Array(w).fill('平地'));
  const map={w,h,grid,seed:'guardian-trial-test',guardianTrialTest:true,isUnderground:false,worldWrapEnabled:false,
    heightLevelMap:grid.map(row=>row.map(()=>0)),specialMap:[],snowCoverMap:[],lavaMap:[],fogMap:[],hazardZones:[],riverData:[]};
  const spatial={enemies:[],enemySquads:[],enemyNests:[],enemyCombatRuntime:{},neutralVillages:[],settlements:[],wandererGroups:[],
    territoryOwnerByTile:{},territoryStateByTile:{},recoveryPercentByTile:{},dangerPercentByTile:{},facilitiesByTile:{},groundLootByTile:{},
    explorationSitesByTile:{},specialtiesByTile:{},victoryLandmarksByTile:{},worldEnvironment:{}};
  const foods=Object.fromEntries(FOOD_RESOURCE_KEYS.map(name=>[name,10000]));
  const materials=Object.fromEntries(MATERIAL_RESOURCE_KEYS.map(name=>[name,1000]));
  const base=normalizeV39Village({id:'trial-base',settlementId:'trial-base',name:'試練支援拠点',x:9,y:10,placed:true,
    population:100,populationByRace:{只人:100},foodStockByType:foods,materialStockByType:materials},'只人');
  const units=[0,1].map(index=>({...buildV39UnitEntity({id:`trial-hero-${index}`,name:index?'試練の支援者':'試練の挑戦者',race:'只人',className:index?'ウィザード':'ファイター',
    level:40,x:12-index,y:10,squadId:'trial-party',equipment:[{slot:'武器1',name:index?'杖':'剣'}]}),worldId:'surface',testOnly:true,testMovementMinimum:120,isSovereign:index===0}));
  const key='13,10',landmark={id:'guardian-trial-site',key,x:13,y:10,kind:'victory-landmark',name:'太陽の山',
    landmarkId:'victory-landmark:sun',occupiedTileKeys:[key],detail:'守護者の3試練を達成して平和取得するテスト'};
  spatial.victoryLandmarksByTile[key]=landmark;
  spatial.enemies.push({...buildV39UnitEntity({id:'trial-guardian',name:'試練を授ける白虎',race:'タイガー',className:'タイガー',level:60,x:13,y:10}),
    worldId:'surface',victoryGuard:true,victoryLandmarkKey:key,aggressive:false,territoryCenterX:13,territoryCenterY:10,territoryRadius:1});
  for(const [index,tile] of [{x:7,y:5},{x:20,y:13}].entries()) {
    const keys=[tile,...getHexNeighborCoords(w,h,tile.x,tile.y)].map(point=>`${point.x},${point.y}`),id=`trial-village-${index}`;
    const village=normalizeV39NeutralVillage({id,name:index?'東の支援村':'西の支援村',...tile,race:'只人',population:50,
      territoryTileKeys:keys,foodStockByType:foods,materialStockByType:materials,buildings:['墓地','農場'],
      tileFacilityMap:{[keys[1]]:['墓地'],[keys[2]]:['農場']},
      constructionQueue:[{id:`trial-construction-${index}`,facilityName:'伐採場',tileKey:keys[3],remainingTurns:5}],
      researchLevels:{経済Lv:2,信仰Lv:2},relationsByPlayerId:{[player.id]:20},questsByPlayerId:{}},map);
    spatial.neutralVillages.push(village);spatial.settlements.push(village);
    for(const tileKey of keys){spatial.territoryOwnerByTile[tileKey]=id;spatial.territoryStateByTile[tileKey]={status:'領土',settlementId:id};}
    Object.assign(spatial.facilitiesByTile,village.tileFacilityMap);
  }
  spatial.territoryOwnerByTile['9,10']=player.id;spatial.territoryStateByTile['9,10']={status:'領土',settlementId:base.id};
  const settings={...window.__v39FieldRuntime?.settings,w,h};
  const state={...initial,...spatial,activeWorldId:'surface',timeline:{...initial.timeline,turnNumber:1,phase:'player'},victory:{},
    players:[{...player,race:'只人',factionState:{...player.factionState,units,settlements:[base],village:base,selectedSettlementId:base.id,
      selectedUnitId:units[0].id,visibility:{},exploration:{discoveredFeaturesByTile:{[key]:landmark}},villagePlacementMode:false,
      unitTrainingQueue:[],squads:[{id:'trial-party',label:'試練挑戦部隊',unitIds:units.map(unit=>unit.id)}]}}],
    explorationWorlds:{surface:{map,settings,spatial,visibility:{}}}};
  window.loadV39FieldSnapshot(map,settings,{layerChange:true});window.setV39GameState(state,{reason:'guardian-trial-test',trackUnitDeaths:false});
  const deadline=performance.now()+15000;
  while(!window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0]?.v39Input){
    if(performance.now()>deadline)throw Error('守護者試練テストのフィールドを起動できません');
    await new Promise(resolve=>requestAnimationFrame(resolve));
  }
  window.refreshV39SquadDerivedUI?.();window.refreshV39MapEntities?.();window.renderV39Visibility?.();window.activateV39FooterTab?.('interaction');
  const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
  if(scene){scene.cameras.main.setZoom(Math.min(1.4,(scene.v39FitZoom||1)*3));scene.v39RequestedZoom=scene.cameras.main.zoom;}
  window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:13,y:10}}));
  await window.waitForV39MapRenderSettled();
  window.showV39TurnBanner?.('守護者3試練：資源は準備済み。村2つは5Tで3施設目が完成。力の証明で現れる召喚体を倒し、3件を報告して引き継ぎます。');
  return {ok:true,key};
};
