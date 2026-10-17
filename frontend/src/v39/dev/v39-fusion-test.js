import {buildV39UnitEntity} from '../../lib/v39-unit-creation-rules.js';
import {getGameDataRows} from '../../lib/game-data-registry.js';
import {getHexDistance,getHexOffsetNeighbors} from '../../lib/hex-grid.js';
import {resolveMonsterSheetArtwork} from '../../lib/monster-sheet-artwork.js';
import fixture from '../../../../config/v39-fusion-test.json';
import {getSelectedSettlement,replaceFactionSettlement,normalizeTerritoryStateRecord} from '../../lib/settlement-state.js';
import {applyV39DerivedCharacterData} from '../unit/v39-character-derived-rules.js';

window.startV39FusionTest=()=>{
  const result=window.startV39ExpeditionTest?.();if(!result?.ok)return result;
  const state=window.getV39GameState(),player=state.players.find(p=>p.id===state.activePlayerId),faction=player.factionState;
  const actorId='expedition-test-king';
  const actor=fixture.actorPosition,classes=new Set(getGameDataRows('クラス').map(row=>row.名前)),counts=new Map(),skippedSpecies=[];
  for(const recipe of getGameDataRows('モンスター合成')){
    const perRecipe=new Map();
    for(const part of String(recipe.素材||'').split(/[,、\n]/)){
      const match=/^(.+)_([1-9]\d*)$/.exec(part.trim());if(!match)continue;
      perRecipe.set(match[1],(perRecipe.get(match[1])||0)+Number(match[2]));
    }
    for(const [race,count] of perRecipe)counts.set(race,Math.max(counts.get(race)||fixture.minimumCopies,count));
  }
  const occupied=new Set(faction.units.filter(u=>(u.worldId||'surface')==='surface'&&u.id!==actorId).map(u=>`${u.x},${u.y}`));
  occupied.add(`${actor.x},${actor.y}`);
  const makeUnit=row=>{
    const {id,race,level,x,y}=row,frame=resolveMonsterSheetArtwork({race,className:race})?.sheetFrame;
    return {...buildV39UnitEntity({id,name:`素材${race}${row.copy>1?row.copy:''}`,race,className:race,level,x,y,isNamed:false,unitType:'通常ユニット'}),worldId:'surface',testOnly:true,fusionTestMaterial:true,
      ...(row.imageFile?{画像ファイル:row.imageFile,画像番号:row.imageIndex}:frame?{画像ファイル:frame.fileName,画像番号:frame.slotNumber}:{})};
  };
  const units=fixture.fixedMaterials.map(makeUnit);for(const unit of units)occupied.add(`${unit.x},${unit.y}`);
  const corpseTiles=getHexOffsetNeighbors(actor.x,actor.y).filter(tile=>!occupied.has(`${tile.x},${tile.y}`)).slice(0,2);
  for(const tile of corpseTiles)occupied.add(`${tile.x},${tile.y}`);
  const map=window.__v39FieldRuntime.mapData,tiles=[],territoryKeys=[];
  for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++){
    const key=`${x},${y}`,owner=state.territoryOwnerByTile[key];
    if(owner&&owner!==player.id)continue;
    const distance=getHexDistance(actor,{x,y});
    if(distance<=fixture.territoryRadius)territoryKeys.push(key);
    if(distance<=Math.min(fixture.materialRadius,fixture.territoryRadius)&&!occupied.has(key))tiles.push({x,y});
  }
  tiles.sort((a,b)=>getHexDistance(actor,a)-getHexDistance(actor,b)||a.y-b.y||a.x-b.x);
  for(const [race,count] of counts){
    if(!classes.has(race)){skippedSpecies.push(race);continue;}
    const existing=units.filter(u=>u.race===race).length;
    for(let copy=existing+1;copy<=count;copy++){
      const tile=tiles.shift();if(!tile)throw new Error('合体テスト素材の配置場所が足りません');
      const unit=makeUnit({id:`fusion-material-${race}-${copy}`,race,level:fixture.defaultLevel,...tile,copy});
      if(!unit.derivedCharacter?.ok)throw new Error(`合体テスト素材を生成できません: ${race}`);
      units.push(unit);
    }
  }
  const corpses=fixture.fixedMaterials.map((row,index)=>{
    const tile=corpseTiles[index];
    return {...applyV39DerivedCharacterData({...row,...tile,id:`soul-test-corpse-${index}`,name:`魂回収用${row.race}`,
      className:row.race,equipment:[],worldId:'surface'}),hp:0,currentHp:0,state:'死亡',deadExpireTurn:state.timeline.turnNumber+100,soulTestCorpse:true};
  });
  let next={...faction,soulStorage:[],selectedUnitId:actorId,units:[...faction.units.map(u=>u.id===actorId?{...u,x:actor.x,y:actor.y,position:[actor.x,actor.y],fusionTestFixture:true,testSkillNames:[...new Set([...(u.testSkillNames||[]),'TEST_魂回収'])],ap:100,currentAp:100}:u),...units],
    squads:faction.squads.map(s=>({...s,unitIds:s.id==='solo'?[...s.unitIds,...units.map(u=>u.id)]:s.unitIds}))};
  const base=getSelectedSettlement(next),territoryOwnerByTile={...state.territoryOwnerByTile},territoryStateByTile={...state.territoryStateByTile};
  for(const key of territoryKeys){
    territoryOwnerByTile[key]=player.id;
    territoryStateByTile[key]=normalizeTerritoryStateRecord({status:'領土',...territoryStateByTile[key],settlementId:base.settlementId});
  }
  next=replaceFactionSettlement(next,{...base,territoryTileKeys:[...new Set([...(base.territoryTileKeys||[]),...territoryKeys])]},{ownerPlayerId:player.id});
  window.setV39GameState({players:state.players.map(p=>p.id===player.id?{...p,factionState:next}:p),territoryOwnerByTile,territoryStateByTile,
    enemies:[...state.enemies,...corpses],facilitiesByTile:{...state.facilitiesByTile,'4,4':['魔術工房'],'3,4':['魂の保管庫']}},{reason:'fusion-test-started'});
  window.activateV39FooterTab('squad');window.refreshV39SquadDerivedUI?.();document.querySelector('[data-squad-detail-tab="action"]')?.click();
  return {ok:true,materialCount:units.length,speciesCount:new Set(units.map(u=>u.race)).size,territoryCount:territoryKeys.length,skippedSpecies};
};
