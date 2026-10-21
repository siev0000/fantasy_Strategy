import fixture from '../../../../config/v39-village-plan-test.json';
import {getGameDataRows} from '../../lib/game-data-registry.js';
import {buildV39UnitEntity} from '../../lib/v39-unit-creation-rules.js';
import {normalizeV39NeutralVillage,advanceV39NeutralVillages} from '../../lib/v39-neutral-village-rules.js';
import {normalizeV39Village,FOOD_RESOURCE_KEYS,MATERIAL_RESOURCE_KEYS} from '../../lib/v39-economy-rules.js';
import {getHexNeighborCoords} from '../../lib/hex-grid.js';
import {HEX_TILE_CONFIG as hex} from '../../lib/phaser-map-panel-config.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const key=tile=>`${tile.x},${tile.y}`;
const footprint=tile=>[tile,...getHexNeighborCoords(fixture.width,fixture.height,tile.x,tile.y,false)];
const food=()=>Object.fromEntries(FOOD_RESOURCE_KEYS.map(name=>[name,100000]));
const materials=()=>Object.fromEntries(MATERIAL_RESOURCE_KEYS.map(name=>[name,1000]));
let starting=null;

function waitUntilReady(check,label) {
  return new Promise((resolve,reject)=>{
    const deadline=performance.now()+15000;
    const poll=()=>{
      if(check()){resolve();return;}
      if(performance.now()>=deadline){reject(new Error(`${label}の準備が完了しませんでした`));return;}
      window.requestAnimationFrame(poll);
    };
    poll();
  });
}

export function focusV39VillagePlanTest(sampleKey) {
  if(!window.isV39TestMode?.()||window.isV39MapInputLocked?.()||!window.__v39FieldRuntime?.mapData?.villagePlanTest)return false;
  const state=window.getV39GameState(),village=state.neutralVillages.find(row=>row.planTestKey===sampleKey);
  const player=state.players.find(row=>row.id===state.activePlayerId),unit=player?.factionState.units.find(row=>row.id===`plan-visitor-${sampleKey}`);
  if(!village||!unit)return false;
  window.setV39GameState({players:state.players.map(row=>row.id!==player.id?row:{...row,factionState:{...row.factionState,selectedUnitId:unit.id}})},{reason:'village-plan-test-focus'});
  window.refreshV39SquadDerivedUI?.();window.activateV39FooterTab?.('interaction');
  const scene=window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0];
  if(scene){
    scene.cameras.main.setZoom(Math.min(1.5,(scene.v39FitZoom||1)*4)).centerOn(village.x*hex.width+(village.y%2?hex.oddRowOffsetX:0)+hex.width/2,village.y*hex.rowStep+hex.height/2);
    scene.v39RequestedZoom=scene.cameras.main.zoom;scene.v39SelectedTile={x:village.x,y:village.y};
    scene.game.v39InvalidateRender?.();
  }
  window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:village.x,y:village.y}}));
  window.showV39TurnBanner?.(fixture.villages.find(row=>row.key===sampleKey).hint);
  return true;
}

async function createVillagePlanTest() {
  if(!window.isV39TestMode?.())return {ok:false,reason:'テストモードを有効にしてください'};
  await waitUntilReady(()=>typeof window.startV39LocalSession==='function'&&typeof window.loadV39FieldSnapshot==='function'
    &&document.querySelector('.footer')?.dataset.v39Ready==='true','ゲームシステム');
  if(window.isV39MapInputLocked?.())return {ok:false,reason:'現在の処理が終わってから開始してください'};
  if(!getGameDataRows('村計画').length||!getGameDataRows('村依頼ひな型').length){
    return {ok:false,reason:'村計画データがありません。最新データを含めて再ビルドしてください。'};
  }
  window.cancelV39SelectedUnitMove?.();window.cancelV39SelectedUnitAttack?.('village-plan-test');
  const session=window.startV39LocalSession(1,{playMode:'single-test'});
  const initial=window.getV39GameState(),player=session.players[0],w=fixture.width,h=fixture.height;
  const grid=Array.from({length:h},()=>Array(w).fill('平地'));
  const map={w,h,grid,seed:'village-plan-playable',isUnderground:false,worldWrapEnabled:false,villagePlanTest:true,
    heightLevelMap:grid.map(row=>row.map(()=>0)),specialMap:[],snowCoverMap:[],lavaMap:[],fogMap:[],hazardZones:[],riverData:[],purificationByTile:{}};
  const spatial={enemies:[],enemySquads:[],enemyNests:[],enemyCombatRuntime:{},settlements:[],neutralVillages:[],wandererGroups:[],
    territoryOwnerByTile:{},territoryStateByTile:{},recoveryPercentByTile:{},dangerPercentByTile:{},facilitiesByTile:{},groundLootByTile:{},
    explorationSitesByTile:{},specialtiesByTile:{},victoryLandmarksByTile:{},worldEnvironment:{}};
  const baseTiles=footprint(fixture.base).map(key);
  const base=normalizeV39Village({...fixture.base,settlementId:fixture.base.id,placed:true,population:100,populationByRace:{只人:100},
    territoryTileKeys:baseTiles,foodStockByType:food(),materialStockByType:Object.fromEntries(MATERIAL_RESOURCE_KEYS.map(name=>[name,10000])),
    buildings:[],tileFacilityMap:{}},'只人');
  for(const tileKey of baseTiles){spatial.territoryOwnerByTile[tileKey]=player.id;spatial.territoryStateByTile[tileKey]={status:'領土',settlementId:base.id,hp:100,maxHp:100};}
  const units=[];
  for(const sample of fixture.villages){
    const tiles=footprint(sample),id=`village-plan-test-${sample.key}`;
    for(const tile of tiles){grid[tile.y][tile.x]=sample.terrain;spatial.territoryOwnerByTile[key(tile)]=id;
      spatial.territoryStateByTile[key(tile)]={status:'領土',settlementId:id,hp:100,maxHp:100};map.purificationByTile[key(tile)]=20;}
    let village=normalizeV39NeutralVillage({id,name:sample.name,x:sample.x,y:sample.y,race:'只人',level:1,population:50,
      populationByRace:{只人:50},territoryTileKeys:tiles.map(key),neutral:true,planTestKey:sample.key,
      researchLevels:{信仰Lv:1},foodStockByType:food(),materialStockByType:materials(),buildings:[],tileFacilityMap:{},constructionQueue:[],
      relationsByPlayerId:{[player.id]:0},questsByPlayerId:{},defenseUnits:[]},map);
    if(sample.key==='cemetery'){
      village.materialStockByType.木材=0;
      const corpse={...buildV39UnitEntity({id:'village-plan-corpse',name:'村人の死体',race:'只人',className:'ファイター',level:3,x:sample.x-1,y:sample.y}),
        worldId:'surface',hp:0,currentHp:0,state:'死亡',deathTurn:1,deadExpireTurn:11};
      village.defenseUnits.push(corpse);
    }
    if(sample.key==='food')village.foodStockByType.穀物=0;
    if(sample.key==='guard')village.defenseUnits=[];
    if(sample.key==='threat'){
      village.defenseUnits=village.defenseUnits.slice(0,1);
      const enemy={...buildV39UnitEntity({id:'village-plan-wolf',name:'村を脅かすウルフ',race:'ウルフ',className:'ウルフ',level:18,
        x:sample.x,y:sample.y+2,isMob:true,isNamed:false}),worldId:'surface',aggressive:true,testOnly:true};
      spatial.enemies.push(enemy);
    }
    spatial.neutralVillages.push(village);spatial.settlements.push(village);
    const unit=buildV39UnitEntity({id:`plan-visitor-${sample.key}`,name:`支援者・${sample.key==='cemetery'?'建設':sample.key==='food'?'食料':sample.key==='threat'?'討伐':'訓練'}`,
      race:'只人',className:'ファイター',level:fixture.unitLevel,x:sample.x,y:sample.y,squadId:'solo',isNamed:true,
      equipment:[{slot:'武器1',name:'剣'},{slot:'体',name:'鎧'}]});
    if(!unit.derivedCharacter?.ok)throw Error('支援者の生成に失敗しました');
    units.push({...unit,worldId:'surface',testOnly:true,testMovementMinimum:fixture.minimumMovement,isSovereign:sample.key==='cemetery'});
  }
  const settings={...window.__v39FieldRuntime?.settings,w,h};
  const faction={...player.factionState,units,visibility:{},exploration:{},settlements:[base],village:null,selectedSettlementId:base.id,
    selectedUnitId:units[0].id,villagePlacementMode:false,unitTrainingQueue:[],logisticsRoutes:[],eventDialogueById:{},squads:[{id:'solo',label:'支援者',unitIds:units.map(unit=>unit.id)}]};
  let state={...initial,...spatial,activeWorldId:'surface',players:[{...player,race:'只人',factionState:faction}],
    timeline:{...initial.timeline,turnNumber:1,phase:'player'},explorationWorlds:{surface:{map,settings,spatial,visibility:{}}}};
  state=advanceV39NeutralVillages(state,map,1).state;
  state.explorationWorlds.surface.spatial=Object.fromEntries(Object.keys(spatial).map(name=>[name,state[name]]));
  window.loadV39FieldSnapshot(map,settings,{layerChange:true});
  window.setV39GameState(state,{reason:'village-plan-playable-test',trackUnitDeaths:false});
  // A snapshot starts Phaser asynchronously. Two animation frames are not a scene-ready guarantee.
  await waitUntilReady(()=>{
    const runtime=window.__v39FieldRuntime,scene=runtime?.game?.scene?.getScenes(true)?.[0];
    return runtime?.mapData===map&&runtime.game.canvas?.isConnected&&scene?.v39Input;
  },'村テストのフィールド');
  window.refreshV39SquadDerivedUI?.();window.refreshV39MapEntities?.();window.renderV39Visibility?.();
  focusV39VillagePlanTest('cemetery');
  window.__v39FieldRuntime.game.v39InvalidateRender?.();
  await window.waitForV39MapRenderSettled();
  return {ok:true,villages:state.neutralVillages.map(village=>({key:village.planTestKey,plan:village.planSchedule?.active?.definitionId,training:village.defenseTraining}))};
}

export function startV39VillagePlanTest() {
  if(starting)return starting;
  starting=createVillagePlanTest().finally(()=>{starting=null;});
  return starting;
}

export function renderV39VillagePlanTestTools(state) {
  if(!window.__v39FieldRuntime?.mapData?.villagePlanTest)return '';
  return `<details class="v39-test-section" data-test-section="village-plans" open><summary>村の計画・支援テスト</summary><div class="v39-test-section-body"><p>村を選ぶと担当の支援者と交流欄へ切り替わります。物資は支援物資拠点に準備済み。交流欄の「村で会話・依頼」からクエストを開き、チェック選択で受注・支援報告します。</p>${fixture.villages.map(sample=>{
    const village=state.neutralVillages.find(row=>row.planTestKey===sample.key),plan=village?.planSchedule?.active;
    return `<p><button data-test-action="village-plan-${sample.key}">${escape(sample.name)}</button> ${escape(plan?`${plan.name} / ${plan.stage}${plan.remainingTurns!=null?` ⌛${plan.remainingTurns}`:''}`:'計画完了・待機')}<br>${escape(sample.hint)}</p>`;
  }).join('')}<p>左の「進行」またはターン終了付近の「1T経過」で、未行動確認をせず実際のターンを進められます。</p></div></details>`;
}
window.startV39VillagePlanTest=startV39VillagePlanTest;
window.focusV39VillagePlanTest=focusV39VillagePlanTest;
