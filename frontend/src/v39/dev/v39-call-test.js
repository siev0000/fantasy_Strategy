import fixture from '../../../../config/v39-call-test.json';
import {buildV39UnitEntity} from '../../lib/v39-unit-creation-rules.js';

window.startV39CallTest=()=>{
  const result=window.startV39ExpeditionTest?.();
  if(!result?.ok)return result;
  const state=window.getV39GameState(),faction=window.getV39ActiveFactionState(),casterId='expedition-test-king';
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
