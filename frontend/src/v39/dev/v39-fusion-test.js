import {buildV39UnitEntity} from '../../lib/v39-unit-creation-rules.js';
import {getGameDataRows} from '../../lib/game-data-registry.js';
import {getHexDistance,getHexOffsetNeighbors} from '../../lib/hex-grid.js';
import {resolveMonsterSheetArtwork} from '../../lib/monster-sheet-artwork.js';
import fixture from '../../../../config/v39-fusion-test.json';
import {getSelectedSettlement,replaceFactionSettlement,normalizeTerritoryStateRecord} from '../../lib/settlement-state.js';
import {applyV39DerivedCharacterData} from '../unit/v39-character-derived-rules.js';
import {collectV39Soul} from '../../lib/v39-soul-storage.js';
import {resolveV39FusionRequirementNames} from '../../lib/v39-fusion-material-types.js';

window.startV39FusionTest=()=>{
  const result=window.startV39ExpeditionTest?.();if(!result?.ok)return result;
  const state=window.getV39GameState(),player=state.players.find(p=>p.id===state.activePlayerId),faction=player.factionState;
  const actorId='expedition-test-king';
  const {tileKey,name:facilityName}=fixture.storageFacility,[storageX,storageY]=tileKey.split(',').map(Number);
  const actor=fixture.actorPosition,classes=new Set(getGameDataRows('クラス').map(row=>row.名前)),counts=new Map(),skippedSpecies=[];
  for(const race of fixture.additionalMaterialSpecies||[])counts.set(race,fixture.minimumCopies);
  for(const recipe of getGameDataRows('モンスター合成')){
    const perRecipe=new Map();
    for(const part of String(recipe.素材||'').split(/[,、\n]/)){
      const match=/^(.+)_([1-9]\d*)$/.exec(part.trim());if(!match)continue;
      for(const name of resolveV39FusionRequirementNames(match[1]))perRecipe.set(name,(perRecipe.get(name)||0)+Number(match[2]));
    }
    for(const [race,count] of perRecipe)counts.set(race,Math.max(counts.get(race)||fixture.minimumCopies,count));
  }
  const occupied=new Set(faction.units.filter(u=>(u.worldId||'surface')==='surface'&&u.id!==actorId).map(u=>`${u.x},${u.y}`));
  for(const key of [fixture.storageFacility.tileKey,fixture.corpseStorageFacility.tileKey,'3,4','2,4'])occupied.add(key);
  occupied.add(`${actor.x},${actor.y}`);
  const makeUnit=row=>{
    const {id,level,x,y}=row,race=fixture.attributeMaterialSpecies?.[row.race]||row.race;
    let unit=buildV39UnitEntity({id,name:`素材${race}${race!==row.race?`（${row.race}）`:''}${row.copy>1?row.copy:''}`,race,className:race,level,x,y,isNamed:false,unitType:'通常ユニット'});
    if(race!==row.race){
      unit=applyV39DerivedCharacterData({...unit,strongAnimalClassName:row.race,strongAnimalClassLevel:Math.min(level-1,fixture.attributeMaterialLevel)});
      unit={...unit,hp:unit.maxHp,currentHp:unit.maxHp};
    }
    const frame=resolveMonsterSheetArtwork(unit)?.sheetFrame;
    return {...unit,worldId:'surface',testOnly:true,fusionTestMaterial:true,fusionTestRequirementName:row.race,
      ...(row.imageFile?{画像ファイル:row.imageFile,画像番号:row.imageIndex}:frame?{画像ファイル:frame.fileName,画像番号:frame.slotNumber}:{})};
  };
  const units=fixture.fixedMaterials.map(makeUnit);for(const unit of units)occupied.add(`${unit.x},${unit.y}`);
  const deploymentTile=getHexOffsetNeighbors(actor.x,actor.y).find(tile=>!occupied.has(`${tile.x},${tile.y}`));
  if(deploymentTile)occupied.add(`${deploymentTile.x},${deploymentTile.y}`);
  const corpseTiles=getHexOffsetNeighbors(actor.x,actor.y).filter(tile=>!occupied.has(`${tile.x},${tile.y}`)).slice(0,2);
  for(const tile of corpseTiles)occupied.add(`${tile.x},${tile.y}`);
  const map=window.__v39FieldRuntime.mapData,territoryKeys=[];
  for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++){
    const key=`${x},${y}`,owner=state.territoryOwnerByTile[key];
    if(owner&&owner!==player.id)continue;
    const distance=getHexDistance(fixture.territoryCenter,{x,y});
    if(distance<=fixture.territoryRadius)territoryKeys.push(key);
  }
  for(const [race,count] of counts){
    if(!classes.has(race)){skippedSpecies.push(race);continue;}
    const existing=units.filter(u=>u.fusionTestRequirementName===race).length;
    for(let copy=existing+1;copy<=count;copy++){
      const unit=makeUnit({id:`fusion-material-${race}-${copy}`,race,level:fixture.defaultLevel,x:storageX,y:storageY,copy});
      if(!unit.derivedCharacter?.ok)throw new Error(`合体テスト素材を生成できません: ${race}`);
      units.push(unit);
    }
  }
  const corpses=fixture.fixedMaterials.map((row,index)=>{
    const tile=corpseTiles[index];
    return {...applyV39DerivedCharacterData({...row,...tile,id:`soul-test-corpse-${index}`,name:`魂回収用${row.race}`,
      className:row.race,equipment:[],worldId:'surface'}),hp:0,currentHp:0,state:'死亡',deadExpireTurn:state.timeline.turnNumber+100,soulTestCorpse:true};
  });
  const [morgueX,morgueY]=fixture.corpseStorageFacility.tileKey.split(',').map(Number);
  corpses.push({...makeUnit({...fixture.fixedMaterials[0],...fixture.recoveryCorpsePosition}),id:'mausoleum-test-corpse',name:'霊廟保管用ホース',
    hp:0,currentHp:0,state:'死亡',deadExpireTurn:state.timeline.turnNumber+10,mausoleumTestCorpse:true});
  const deadUnitReserve=fixture.storedCorpses.map(row=>({unitId:row.id,unit:{...makeUnit({...row,x:morgueX,y:morgueY}),name:row.name,
    hp:0,currentHp:0,ap:0,currentAp:0,actionPoint:0,state:'死亡',deadExpireTurn:state.timeline.turnNumber+30,mausoleumTestCorpse:true},
    reason:'霊廟保管',storedAtTurn:state.timeline.turnNumber,storedAtMs:Date.now(),corpseStorage:{tileKey:fixture.corpseStorageFacility.tileKey,
      facilityName:fixture.corpseStorageFacility.name,worldId:'surface',remainingTurns:30}}));
  const fixedIds=new Set(fixture.fixedMaterials.map(row=>row.id)),activeMaterials=units.filter(unit=>fixedIds.has(unit.id));
  const facilityStorage=units.filter(unit=>!fixedIds.has(unit.id)).map(unit=>{
    return {unit:{...unit,x:storageX,y:storageY,position:[storageX,storageY]},tileKey,facilityName,worldId:'surface',runtimeByKey:{}};
  });
  let next={...faction,soulStorage:[],facilityStorage,deadUnitReserve,selectedUnitId:actorId,units:[...faction.units.map(u=>u.id===actorId?{...u,x:actor.x,y:actor.y,position:[actor.x,actor.y],fusionTestFixture:true,testSkillNames:[...new Set([...(u.testSkillNames||[]),'TEST_魂回収'])],ap:100,currentAp:100}:u),...activeMaterials],
    squads:faction.squads.map(s=>({...s,unitIds:s.id==='solo'?[...s.unitIds,...activeMaterials.map(u=>u.id)]:s.unitIds}))};
  const base=getSelectedSettlement(next),territoryOwnerByTile={...state.territoryOwnerByTile},territoryStateByTile={...state.territoryStateByTile};
  for(const key of territoryKeys){
    territoryOwnerByTile[key]=player.id;
    territoryStateByTile[key]=normalizeTerritoryStateRecord({status:'領土',...territoryStateByTile[key],settlementId:base.settlementId});
  }
  const facilitiesByTile={...state.facilitiesByTile,[tileKey]:[facilityName],'3,4':['魂の保管庫'],'2,4':['兵舎']};
  facilitiesByTile[fixture.corpseStorageFacility.tileKey]=[fixture.corpseStorageFacility.name];
  for(const entry of facilityStorage)facilitiesByTile[entry.tileKey]=[entry.facilityName];
  const tileFacilityMap={...base.tileFacilityMap};
  for(const [key,names] of Object.entries(facilitiesByTile))if(territoryOwnerByTile[key]===player.id&&territoryStateByTile[key]?.settlementId===base.settlementId)tileFacilityMap[key]=names;
  next=replaceFactionSettlement(next,{...base,tileFacilityMap,buildings:Object.values(tileFacilityMap).flat(),territoryTileKeys:[...new Set([...(base.territoryTileKeys||[]),...territoryKeys])]},{ownerPlayerId:player.id});
  // Seed already-collected souls through the normal validation/identity builder.
  let soulState={...state,facilitiesByTile,territoryOwnerByTile,players:state.players.map(p=>p.id===player.id?{...p,factionState:next}:p)};
  for(const row of fixture.storedSouls){
    const source={...makeUnit({...row,...actor}),name:row.name,state:'死亡',hp:0,currentHp:0,equipment:[]};
    const collected=collectV39Soul({...soulState,enemies:[source]},player.id,source);
    if(!collected.ok)throw new Error(`初期保管魂を生成できません: ${row.name} / ${collected.reason}`);
    soulState=collected.state;
  }
  next=soulState.players.find(p=>p.id===player.id).factionState;
  window.setV39GameState({players:state.players.map(p=>p.id===player.id?{...p,factionState:next}:p),territoryOwnerByTile,territoryStateByTile,
    enemies:[...state.enemies,...corpses],facilitiesByTile},{reason:'fusion-test-started'});
  window.activateV39FooterTab('squad');window.refreshV39SquadDerivedUI?.();document.querySelector('[data-squad-detail-tab="action"]')?.click();
  void (async()=>{
    await window.waitForV39MapRenderSettled?.();
    if(window.__v39FieldRuntime?.mapData!==map)return;
    window.refreshV39MapEntities?.();
    const scene=window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0];
    const nodes=scene?.children.list.flatMap(node=>[node,...(node.list||[])])||[];
    const facilities=nodes.filter(node=>node.name==='v39-facility-marker'&&[tileKey,fixture.corpseStorageFacility.tileKey].includes(node.getData('tileKey')));
    if(facilities.length===2){
      scene.cameras.main.setZoom(fixture.previewZoom);
      scene.v39RequestedZoom=fixture.previewZoom;
      scene.cameras.main.centerOn((facilities[0].x+facilities[1].x)/2,(facilities[0].y+facilities[1].y)/2);
    }
  })();
  return {ok:true,materialCount:units.length,fieldMaterialCount:activeMaterials.length,storedMaterialCount:facilityStorage.length,storedCorpseCount:deadUnitReserve.length,storedSoulCount:next.soulStorage.length,deploymentTile,speciesCount:new Set(units.map(u=>u.race)).size,territoryCount:territoryKeys.length,skippedSpecies};
};
