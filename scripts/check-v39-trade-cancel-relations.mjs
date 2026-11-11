import assert from 'node:assert/strict';
import {createServer} from 'vite';

const server=await createServer({configFile:false,root:'frontend',server:{middlewareMode:true},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
try{
  const {stopV39Trade}=await server.ssrLoadModule('/src/lib/v39-trade-state.js');
  const {getV39DiplomacyRelation}=await server.ssrLoadModule('/src/lib/v39-diplomacy-rules.js');
  const contract={id:'trade-1',ownerId:'a',status:'active',sides:['a','b'].map(partyId=>({kind:'player',partyId,unitId:'',memberIds:[],goods:{},reserved:{},stage:'waiting'}))};
  const state={activePlayerId:'a',timeline:{turnNumber:3},players:['a','b'].map(id=>({id,factionState:{units:[],squads:[],tradeContracts:id==='a'?[contract]:[]}})),neutralVillages:[],settlements:[],diplomacyRelations:{}};
  const pairKey=getV39DiplomacyRelation(state,'a','b').pairKey;
  const normal=stopV39Trade(state,'a',contract.id,true);
  assert.equal(normal.ok,true);
  assert.equal(normal.state.diplomacyRelations[pairKey].relationValue,-10);
  assert.equal(stopV39Trade(normal.state,'a',contract.id,true).ok,false);
  const disaster=stopV39Trade(state,'a',contract.id,true,{reason:'disaster'});
  assert.equal(disaster.ok,true);
  assert.equal(disaster.state.diplomacyRelations[pairKey].relationValue,-5);
  assert.equal(disaster.state.players[0].factionState.tradeContracts[0].cancellationReason,'disaster');
  const proposed={...state,players:state.players.map(player=>player.id==='a'?{...player,factionState:{...player.factionState,tradeContracts:[{...contract,status:'proposed'}]}}:player)};
  assert.equal(stopV39Trade(proposed,'a',contract.id,true).state.diplomacyRelations[pairKey],undefined);
  const villageContract={...contract,sides:[contract.sides[0],{...contract.sides[1],kind:'village',partyId:'village'}]};
  const village={id:'village',name:'村',defenseUnits:[],relationsByPlayerId:{a:12}};
  const villageState={...state,neutralVillages:[village],settlements:[village],players:state.players.map(player=>player.id==='a'?{...player,factionState:{...player.factionState,tradeContracts:[villageContract]}}:player)};
  const villageCancel=stopV39Trade(villageState,'a',contract.id,true,{reason:'disaster'});
  assert.equal(villageCancel.ok,true);
  assert.equal(villageCancel.state.neutralVillages[0].relationsByPlayerId.a,7);
  console.log('PASS: normal/disaster trade cancellation relation loss and no duplicate/proposal penalty');
}finally{await server.close();}
