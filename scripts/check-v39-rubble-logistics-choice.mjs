import assert from 'node:assert/strict';
import {createServer} from 'vite';

const server=await createServer({configFile:false,root:'frontend',server:{middlewareMode:true},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
try{
  const {advanceLogisticsRoutes,controlLogisticsRoute}=await server.ssrLoadModule('/src/lib/v39-logistics-routes.js');
  const {advanceV39TradeLogistics}=await server.ssrLoadModule('/src/lib/v39-trade-logistics.js');
  const grid=Array.from({length:8},()=>Array(8).fill('平地'));
  const map={w:8,h:8,grid,terrainDamage:{rubbleByTile:{'3,3':{hp:50,maxHp:50}}}};
  const unit={id:'worker',name:'撤去役',x:3,y:2,worldId:'surface',hp:100,ap:100,currentAp:100,status:{攻撃:20},transportAssignment:{logisticsRouteId:'route-1',enabled:true}};
  const route={id:'route-1',leaderId:'worker',memberIds:['worker'],enabled:true,status:'撤去中',clearTarget:{x:3,y:3,key:'3,3',worldId:'surface'},sourceId:'settlement:home',destinationId:'settlement:away',phase:'deliver',amount:1,resource:'木材'};
  const faction={units:[unit],squads:[{id:'solo',unitIds:['worker'],cargoByUnitId:{}}],logisticsRoutes:[route],settlements:[{id:'home',settlementId:'home',placed:true,x:2,y:2},{id:'away',settlementId:'away',placed:true,x:6,y:6}]};
  const state={activePlayerId:'a',activeWorldId:'surface',timeline:{phase:'player',turnNumber:3},players:[{id:'a',factionState:faction}],explorationWorlds:{surface:{map,spatial:{enemies:[]}}},enemies:[],neutralVillages:[]};
  const progressed=advanceLogisticsRoutes(state,'a',3);
  assert.equal(progressed.explorationWorlds.surface.map.terrainDamage.rubbleByTile['3,3'].hp,30);
  assert.equal(progressed.players[0].factionState.units[0].ap,80);
  assert.equal(progressed.players[0].factionState.logisticsRoutes[0].status,'撤去中');
  const nearlyClear={...state,explorationWorlds:{surface:{...state.explorationWorlds.surface,map:{...map,terrainDamage:{rubbleByTile:{'3,3':{hp:20,maxHp:50}}}}}}};
  const reopened=advanceLogisticsRoutes(nearlyClear,'a',3);
  assert.equal(reopened.explorationWorlds.surface.map.terrainDamage.rubbleByTile['3,3'],undefined);
  assert.equal(reopened.players[0].factionState.logisticsRoutes[0].clearTarget,null);
  const blocked={...state,players:[{...state.players[0],factionState:{...faction,logisticsRoutes:[{...route,enabled:false,clearTarget:null,blockedRubble:{x:3,y:3,key:'3,3',worldId:'surface'}}]}}]};
  const chosen=controlLogisticsRoute(blocked,'a','route-1','clear');
  assert.equal(chosen.ok,true);
  assert.equal(chosen.state.players[0].factionState.logisticsRoutes[0].clearTarget.key,'3,3');
  const detour=controlLogisticsRoute(blocked,'a','route-1','detour');
  assert.equal(detour.ok,true);
  assert.equal(detour.state.players[0].factionState.logisticsRoutes[0].status,'迂回中');
  const tradeUnit={...unit,transportAssignment:null,tradeAssignment:{contractId:'trade-1',automatic:true}};
  const contract={id:'trade-1',ownerId:'a',status:'active',sides:[{kind:'player',partyId:'a',unitId:'worker',memberIds:['worker'],stage:'outbound',lastMoveTurn:2,goods:{},reserved:{},clearTarget:{x:3,y:3,key:'3,3'}},{kind:'player',partyId:'b',unitId:'peer',memberIds:['peer'],stage:'waiting',goods:{},reserved:{}}]};
  const tradeState={...state,players:[{...state.players[0],factionState:{...faction,units:[tradeUnit],logisticsRoutes:[],tradeContracts:[contract]}},{id:'b',factionState:{units:[],squads:[],tradeContracts:[]}}]};
  const traded=advanceV39TradeLogistics(tradeState,'a',structuredClone(map),3);
  assert.equal(traded.state.players[0].factionState.units[0].ap,80);
  assert.equal(traded.state.players[0].factionState.tradeContracts[0].sides[0].clearTarget.key,'3,3');
  console.log('PASS: route and trade workers consume AP and reduce rubble after explicit clear choice');
}finally{await server.close();}
