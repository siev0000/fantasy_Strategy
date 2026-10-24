import fixture from '../../../../config/v39-call-test.json';
import {buildV39UnitEntity} from '../../lib/v39-unit-creation-rules.js';
import {getGameDataRows} from '../../lib/game-data-registry.js';
import {replaceFactionSettlement} from '../../lib/settlement-state.js';
import {getV39FacilitySummonSlots} from '../../lib/v39-facility-summoning.js';

window.isV39CallTestReady=()=>{
  const state=window.getV39GameState(),player=state.players?.find(p=>p.id===state.activePlayerId);
  return !!player?.factionState?.settlements?.some(base=>base.placed)
    &&player.factionState.units.some(unit=>unit.id==='expedition-test-king'
      &&fixture.召喚者.testSkillNames.every(name=>unit.testSkillNames?.includes(name)));
};

window.startV39RitualTest=async stage=>{
  if(!window.isV39TestMode?.())return {ok:false,reason:'テストモードで実行してください'};
  if(!Number.isInteger(stage)||stage<0||stage>3)return {ok:false,reason:'儀式段階は0〜3です'};
  if(!window.isV39CallTestReady()){
    const started=window.startV39CallTest?.();
    if(!started?.ok)return {ok:false,reason:started?.reason||'召喚テストを準備できませんでした'};
  }
  if((window.getV39GameState().activeWorldId||'surface')!=='surface'
    &&!window.viewV39ExpeditionTestWorld?.('surface'))return {ok:false,reason:'テストの地上マップを表示できませんでした'};
  const result=window.setV39RitualTestStage(stage);
  if(!result.ok)return result;
  await window.waitForV39MapRenderSettled?.();
  window.activateV39FooterTab?.('settlement');window.renderV39SettlementPanel?.();
  document.querySelector('#footSettlement [data-settlement-page-select="facility"]')?.click();
  if(stage>0){
    const state=window.getV39GameState();
    const slot=getV39FacilitySummonSlots(state,state.activePlayerId).find(slot=>slot.row.召喚系統==='火精霊');
    if(slot)window.openV39FacilitySummonModal?.(slot.id);
  }
  return result;
};

window.setV39RitualTestStage=stage=>{
  if(!window.isV39TestMode?.())return {ok:false};
  const state=window.getV39GameState(),id=state.activePlayerId,player=state.players.find(p=>p.id===id);
  if(!player?.factionState)return {ok:false,reason:'先に召喚・呼集テストを開始してください'};
  const definitions=getGameDataRows('施設').filter(row=>row.召喚系統),names=new Set(definitions.map(row=>row.施設名));
  const limits=[0,10,20,25],limit=limits[stage];
  if(limit==null)return {ok:false};
  const chains=new Map();
  for(const row of definitions.filter(row=>Number(row.召喚上限Lv)<=limit)){
    const previous=chains.get(row.施設召喚枠ID);
    if(!previous||Number(row.召喚上限Lv)>Number(previous.召喚上限Lv))chains.set(row.施設召喚枠ID,row);
  }
  const selected=[...chains.values()].map(row=>row.施設名);
  const faction=player.factionState,base=faction.settlements.find(base=>base.placed);
  if(!base)return {ok:false,reason:'配置済みのテスト拠点が必要です'};
  const buildings=[...(base.buildings||[]).filter(name=>!names.has(name)),...selected];
  const tileFacilityMap=Object.fromEntries(Object.entries(base.tileFacilityMap||{})
    .map(([key,list])=>[key,list.filter(name=>!names.has(name))]));
  const tiles=(base.territoryTileKeys||[]).filter(key=>state.territoryOwnerByTile[key]===id);
  if(!tiles.length)tiles.push(`${base.x},${base.y}`);
  selected.forEach((name,index)=>{const key=tiles[index%tiles.length];tileFacilityMap[key]=[...(tileFacilityMap[key]||[]),name];});
  const updated={...base,buildings,tileFacilityMap};
  window.setV39GameState({players:state.players.map(p=>p.id===id?{...p,
    factionState:replaceFactionSettlement(faction,updated,{ownerPlayerId:id})}:p),
    facilitiesByTile:{...state.facilitiesByTile,...tileFacilityMap}},
    {reason:'ritual-test-stage'});
  window.showV39TurnBanner?.(`儀式施設 ${stage===0?'なし':`段階${stage}`} / 召喚上限Lv${limit||10}`);
  return {ok:true,stage,buildings:selected};
};

window.startV39CallTest=()=>{
  const result=window.startV39ExpeditionTest?.();
  if(!result?.ok)return result;
  const state=window.getV39GameState(),sourceFaction=window.getV39ActiveFactionState(),casterId='expedition-test-king';
  const base=sourceFaction.settlements.find(row=>row.placed),test=fixture.召喚素材テスト;
  const faction=base&&test?replaceFactionSettlement(sourceFaction,{...base,
    materialStockByType:{...base.materialStockByType,...test.所持},summonMaterialTestCosts:structuredClone(test.候補)},
    {ownerPlayerId:state.activePlayerId,select:false}):sourceFaction;
  const owner={...state.territoryOwnerByTile},units=fixture.動物.map(row=>{
    if(row.owned)owner[`${row.x},${row.y}`]=state.activePlayerId;
    else delete owner[`${row.x},${row.y}`];
    return {...buildV39UnitEntity({...row,className:row.race,level:5,isNamed:false,unitType:'通常ユニット'}),x:row.x,y:row.y,position:[row.x,row.y],worldId:'surface',squadId:'solo',testOnly:true};
  });
  window.setV39GameState({territoryOwnerByTile:owner,players:state.players.map(player=>player.id!==state.activePlayerId?player:{...player,factionState:{...faction,
    selectedUnitId:casterId,units:[...faction.units.map(unit=>unit.id===casterId?{...unit,...fixture.召喚者,position:[fixture.召喚者.x,fixture.召喚者.y],squadId:'solo',testOnly:true}:unit),...units],
    squads:faction.squads.map(row=>({...row,unitIds:row.id==='solo'?[...row.unitIds,casterId,...units.map(unit=>unit.id)]:row.unitIds.filter(id=>id!==casterId)}))}})},{reason:'call-test-started'});
  window.activateV39FooterTab('squad');window.refreshV39SquadDerivedUI?.();document.querySelector('[data-squad-detail-tab="action"]')?.click();
  return {ok:true};
};
