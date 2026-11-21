import fixture from '../../../../config/v39-call-test.json';
import {buildV39UnitEntity} from '../../lib/v39-unit-creation-rules.js';
import {getGameDataRows} from '../../lib/game-data-registry.js';
import {replaceFactionSettlement} from '../../lib/settlement-state.js';
import {createV39WorkshopGolem,golemRecipes,getV39GolemRecipeCost} from '../../lib/v39-golem-workshop.js';
import {canUnitEnterV39Tile} from '../../lib/v39-terrain-traversal.js';
import {getHexNeighborCoords} from '../../lib/hex-grid.js';
import {FOOD_RESOURCE_KEYS} from '../../lib/v39-economy-rules.js';
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

window.startV39GolemWorkshopTest=async()=>{
  if(!window.isV39TestMode?.())return {ok:false,reason:'テストモードで実行してください'};
  const started=window.startV39ExpeditionTest?.(false,{silentBanner:true});
  if(!started?.ok)return started;
  const state=window.getV39GameState(),playerId=state.activePlayerId;
  const player=state.players.find(row=>row.id===playerId),faction=player?.factionState;
  const base=faction?.settlements?.find(row=>row.placed);
  if(!base)return {ok:false,reason:'検証用の拠点が見つかりません'};
  const map=window.__v39FieldRuntime?.mapData;
  if(!map?.grid)return {ok:false,reason:'検証用の地上マップが見つかりません'};
  const tileKey=`${base.x},${base.y}`,name='ゴーレム工房（大）';
  const orderedRecipes=[...golemRecipes.keys()].sort((a,b)=>Number(b==='ストーンゴーレム')-Number(a==='ストーンゴーレム'));
  const grid=map.grid.map(row=>[...row]);
  const tileFacilityMap={...base.tileFacilityMap},territoryOwnerByTile={...state.territoryOwnerByTile};
  const territoryStateByTile={...state.territoryStateByTile};
  const materialStockByType={...base.materialStockByType,金:1500,銀:80};
  const foodStockByType={...base.foodStockByType};
  const crafters=[];
  for(const [index,golemName] of orderedRecipes.entries()){
    const x=index?4+4*((index-1)%5):base.x;
    const y=index?10+4*Math.floor((index-1)/5):base.y;
    const key=`${x},${y}`;
    const terrain=golemRecipes.get(golemName).必要地形[0];
    if(terrain){
      const sample=getHexNeighborCoords(map.w,map.h,x,y).find(point=>point.x>x);
      grid[sample.y][sample.x]=terrain;
    }
    tileFacilityMap[key]=[...new Set([...(tileFacilityMap[key]||[]),name])];
    territoryOwnerByTile[key]=playerId;
    territoryStateByTile[key]={...territoryStateByTile[key],status:'領土',settlementId:base.settlementId||base.id};
    const crafter=buildV39UnitEntity({id:`golem-workshop-test-crafter-${index}`,
      name:`${golemName.replace(/ゴーレム$/,'')}工房のクラフター`,
      race:'只人',className:'ゴーレムクラフター',level:10,x,y});
    if(!crafter.derivedCharacter?.ok)return {ok:false,reason:'ゴーレムクラフターを読み込めません'};
    crafters.push(crafter);
    for(const [resource,amount] of Object.entries(getV39GolemRecipeCost(golemName,2))){
      const stock=FOOD_RESOURCE_KEYS.includes(resource)?foodStockByType:materialStockByType;
      stock[resource]=(stock[resource]||0)+amount;
    }
  }
  if(!crafters.length)return {ok:false,reason:'ゴーレム作成レシピが見つかりません'};
  const units=faction.units.map(unit=>{
    if(unit.id!=='expedition-test-carrier')return unit;
    const {caveDuty,...carrier}=unit;
    return {...carrier,x:base.x-1,y:base.y,position:[base.x-1,base.y]};
  });
  const testMap={...map,grid};
  const pointKey=({x,y})=>`${x},${y}`;
  const occupied=new Set([...units,...crafters,...state.players
    .filter(row=>row.id!==playerId).flatMap(row=>row.factionState?.units||[]),
    ...(state.enemies||[]),...(state.neutralVillages||[]).flatMap(village=>village.defenseUnits||[])]
    .filter(unit=>(unit.worldId||'surface')==='surface').map(pointKey));
  const neighbors=({x,y})=>getHexNeighborCoords(map.w,map.h,x,y,map.worldWrapEnabled===true);
  const canPlace=(unit,point)=>!occupied.has(pointKey(point))&&canUnitEnterV39Tile(testMap,point.x,point.y,unit);
  const boardingUnits=[];
  const boardingPairs=[
    {golemName:'ストーンゴーレム',size:0,pilotClass:'ウィザード'},
    {golemName:'アイスゴーレム',size:1,pilotClass:'プリースト'},
    {golemName:'フレッシュゴーレム',size:2,pilotClass:'ファイター'}
  ];
  for(const {golemName,size,pilotClass} of boardingPairs){
    const settlementId=base.settlementId||base.id;
    const golem=createV39WorkshopGolem({id:`golem-workshop-test-golem-${size}`,golemName,size,
      settlementId,craftedByGolemCrafter:true,additionalSkillNames:['搭乗機能']});
    const pilot=buildV39UnitEntity({id:size?`golem-workshop-test-pilot-${size}`:'golem-workshop-test-pilot',
      name:`搭乗検証パイロット（${pilotClass}）`,race:'只人',className:'パイロット',level:20,
      prerequisiteClassLevels:{[pilotClass]:10},settlementId});
    if(!golem||!pilot.derivedCharacter?.ok)return {ok:false,reason:`${golemName}の搭乗検証ユニットを読み込めません`};
    const workshop=crafters[orderedRecipes.indexOf(golemName)]||crafters[0];
    let placed=false;
    for(const golemTile of neighbors(workshop)){
      if(!canPlace(golem,golemTile))continue;
      const pilotTile=neighbors(golemTile).find(point=>canPlace(pilot,point));
      if(!pilotTile)continue;
      boardingUnits.push({...golem,...golemTile,position:[golemTile.x,golemTile.y]},
        {...pilot,...pilotTile,position:[pilotTile.x,pilotTile.y],worldId:'surface'});
      occupied.add(pointKey(golemTile));
      occupied.add(pointKey(pilotTile));
      placed=true;
      break;
    }
    if(!placed)return {ok:false,reason:`${golemName}の搭乗検証ユニットを隣接配置できません`};
  }
  const updated={...base,buildings:[...new Set([...(base.buildings||[]),name])],
    tileFacilityMap,territoryTileKeys:[...new Set([...(base.territoryTileKeys||[]),...Object.keys(tileFacilityMap)])],
    cityLevels:{...base.cityLevels,魔法Lv:5,信仰Lv:5},materialStockByType,foodStockByType};
  const next=replaceFactionSettlement(faction,updated,{ownerPlayerId:playerId});
  const squads=(next.squads||[]).map(squad=>squad.id==='solo'
    ?{...squad,unitIds:[...(squad.unitIds||[]),...boardingUnits.map(unit=>unit.id)]}:squad);
  window.updateV39FieldData(testMap,{silent:true});
  window.setV39GameState({players:state.players.map(row=>row.id!==playerId?row:{...row,factionState:{
    ...next,squads,selectedUnitId:crafters[0].id,units:[...units,...crafters,...boardingUnits]
  }}),facilitiesByTile:{...state.facilitiesByTile,...tileFacilityMap},territoryOwnerByTile,territoryStateByTile},{reason:'golem-workshop-test'});
  await window.waitForV39MapRenderSettled?.();
  window.activateV39FooterTab?.('settlement');
  window.renderV39SettlementPanel?.();
  document.querySelector('#footSettlement [data-settlement-page-select="facility"]')?.click();
  const id=JSON.stringify(['surface',tileKey,name]);
  Array.from(document.querySelectorAll('#footSettlement [data-settlement-facility]'))
    .find(button=>button.dataset.settlementFacility===id)?.click();
  window.showV39TurnBanner?.('ゴーレム工房と、搭乗を試せるゴーレム・パイロット3組を配置しました');
  return {ok:true};
};
