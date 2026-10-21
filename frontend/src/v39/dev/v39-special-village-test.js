import {startV39NegotiationHubTest,focusV39NegotiationHubTest} from './v39-negotiation-hub-test.js';
import {normalizeV39NeutralVillage} from '../../lib/v39-neutral-village-rules.js';

export async function startV39SpecialVillageTest(){
  const result=await startV39NegotiationHubTest();if(!result?.ok)return result;
  window.closeV39VillageMenu?.();
  const state=window.getV39GameState(),player=state.players[0],map=window.__v39FieldRuntime.mapData;
  const races=['天使','悪魔','ヴァンパイア'];
  const villages=state.neutralVillages.map((village,index)=>{
    if(index>=races.length)return village;
    const race=races[index];
    const special=normalizeV39NeutralVillage({...village,name:`${race}の特殊村`,race,combatRaceName:race,factionDataName:race,
      neutral:true,leader:undefined,population:20,populationByRace:{[race]:20},className:'ファイター',
      defenseUnits:[],hadDefenseUnits:false,defenseRosterInitialized:false,offeringByPlayerId:{},
      relationsByPlayerId:{[player.id]:0},planSchedule:undefined},map,
      {occupiedTileKeys:new Set(state.players.flatMap(p=>p.factionState.units.map(u=>`${u.x},${u.y}`)))});
    // Leave arrival spaces for the three contract armies in this focused fixture.
    return {...special,defenseUnits:special.defenseUnits.slice(0,1)};
  });
  const banks=player.factionState.settlements.map(base=>({...base,population:100,populationByRace:{只人:100}}));
  const byId=new Map(villages.map(v=>[v.id,v]));
  window.setV39GameState({...state,players:state.players.map(p=>p.id===player.id?{...p,factionState:{...p.factionState,settlements:banks}}:p),
    neutralVillages:villages,settlements:state.settlements.map(base=>byId.get(base.id)||banks.find(b=>b.id===base.id)||base)},
    {reason:'special-village-test'});
  window.refreshV39MapEntities?.();await window.waitForV39MapRenderSettled?.();
  focusV39NegotiationHubTest('standard');
  return {ok:true};
}

window.startV39SpecialVillageTest=startV39SpecialVillageTest;
