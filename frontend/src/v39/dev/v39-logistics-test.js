import fixture from '../../../../config/v39-logistics-test.json';
import {buildV39UnitEntity} from '../../lib/v39-unit-creation-rules.js';
import {normalizeV39Village,FOOD_RESOURCE_KEYS,MATERIAL_RESOURCE_KEYS} from '../../lib/v39-economy-rules.js';
import {replaceFactionSettlement} from '../../lib/settlement-state.js';
import {getHexDistance} from '../../lib/hex-grid.js';
import {assignV39MineDuty} from '../../lib/v39-cave-operations.js';
import {configureLogisticsRoute,advanceLogisticsRoutes} from '../../lib/v39-logistics-routes.js';
import international from '../../../../config/v39-international-logistics-test.json';
import {createPlayerRecord} from '../../lib/player-state.js';
import {proposeV39Trade,acceptV39Trade,reserveV39TradeFromStock} from '../../lib/v39-trade-state.js';
import {advanceV39TradeLogistics} from '../../lib/v39-trade-logistics.js';

function startDomesticLogisticsTest(){
  const started=window.startV39ExpeditionTest?.();if(!started?.ok)return started;
  let state=window.getV39GameState();
  const cleared=assignV39MineDuty(state,state.activePlayerId,'','expedition-test-carrier','none');
  if(!cleared.ok)return cleared;state=cleared.state;
  const worlds=window.captureV39ExplorationWorlds(),surface=worlds.surface,map=surface.map;
  const spatial={...surface.spatial,territoryOwnerByTile:{...surface.spatial.territoryOwnerByTile},territoryStateByTile:{...surface.spatial.territoryStateByTile}};
  map.grid=map.grid.map(row=>[...row]);map.logisticsTestFixture=true;
  const id=state.activePlayerId;
  let faction=state.players.find(p=>p.id===id).factionState;
  for(const row of fixture.settlements){
    const town=row.type==='町',center=`${row.x},${row.y}`,residential=town?[center,`${row.x+1},${row.y}`]:[center],territory=[];
    for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++)if(getHexDistance(row,{x,y})<=(town?2:1)){
      const key=`${x},${y}`;territory.push(key);
      spatial.territoryOwnerByTile[key]=id;spatial.territoryStateByTile[key]={status:'占領',settlementId:row.id,hp:100,maxHp:100};
      if(row.forest)map.grid[y][x]='森';
    }
    const settlement=normalizeV39Village({...row,settlementId:row.id,placed:true,scaleKey:town?'town':'village',scaleLevel:town?2:1,
      populationByRace:{只人:row.population},territoryTileKeys:territory,
      territoryResidentialLevelMap:Object.fromEntries(residential.map(key=>[key,town?2:1])),
      territoryResidentialCenterMap:Object.fromEntries(residential.map(key=>[key,center])),
      foodStockByType:Object.fromEntries(FOOD_RESOURCE_KEYS.map(key=>[key,1000])),
      materialStockByType:Object.fromEntries(MATERIAL_RESOURCE_KEYS.map(key=>[key,key==='木材'?200:100])),
      tileFacilityMap:{},buildings:[]},'只人');
    faction=replaceFactionSettlement(faction,settlement,{ownerPlayerId:id,select:false});
  }
  const units=[],squads=[];
  for(const route of fixture.routes){
    const squadId=`logistics-test-${route.id}`,members=route.members.map((position,index)=>{
      const unit=buildV39UnitEntity({id:`${squadId}-${index+1}`,name:`${route.name}${index+1}`,race:'只人',className:'ファイター',level:10,
        squadId,...position,isNamed:false,equipment:[{slot:'武器1',name:'剣'},{slot:'体',name:'鎧'}]});
      if(!unit.derivedCharacter?.ok)throw Error(`輸送担当を生成できません: ${route.name}`);
      return {...unit,worldId:route.worldId||'surface',ap:100,currentAp:100};
    });
    units.push(...members);squads.push({id:squadId,name:route.name,label:route.name,unitIds:members.map(u=>u.id)});
  }
  faction={...faction,units:[...faction.units.map(u=>u.id==='expedition-test-carrier'?{...u,x:3,y:1,position:[3,1]}:u),...units],
    squads:[...faction.squads,...squads],logisticsRoutes:[],logisticsSerial:0};
  state={...state,...spatial,explorationWorlds:{...worlds,surface:{...surface,map,spatial}},players:state.players.map(p=>p.id===id?{...p,factionState:faction}:p)};
  for(const route of fixture.routes){
    const result=configureLogisticsRoute(state,id,{...route,groupId:`squad:logistics-test-${route.id}`,repeat:true});
    if(!result.ok)throw Error(`輸送ルートを設定できません: ${route.name} / ${result.reason}`);
    state=result.state;
  }
  // Use the real loading step so the initial view already shows delivery paths and cargo.
  state=advanceLogisticsRoutes(state,id,state.timeline.turnNumber);
  window.loadV39FieldSnapshot(map,window.__v39FieldRuntime.settings,{layerChange:true});
  window.setV39GameState(state,{reason:'logistics-test-started',trackUnitDeaths:false});
  window.refreshV39SquadDerivedUI?.();window.refreshV39MapEntities?.();window.activateV39FooterTab?.('logistics');
  return {ok:true,settlements:faction.settlements.length,routes:fixture.routes.length,members:units.length};
};

function startCombinedLogisticsTest(){
  const started=startDomesticLogisticsTest();if(!started?.ok)return started;
  let state=window.getV39GameState();
  const self=state.activePlayerId,worlds=window.captureV39ExplorationWorlds(),map=worlds.surface.map;
  const owners={...state.territoryOwnerByTile},territories={...state.territoryStateByTile};
  const courier=(id,name,position)=>({...buildV39UnitEntity({id,name,race:'只人',className:'ファイター',level:10,
    ...position,squadId:'solo',isNamed:true,equipment:[{slot:'武器1',name:'剣'}]}),worldId:'surface',ap:100,currentAp:100});
  const ownCourier=courier('international-own-courier','自国の交易使節',international.ownCourier);
  state={...state,players:state.players.map(p=>p.id===self?{...p,factionState:{...p.factionState,
    units:[...p.factionState.units,ownCourier],squads:p.factionState.squads.map(s=>s.id==='solo'?{...s,unitIds:[...s.unitIds,ownCourier.id]}:s)}}:p)};
  for(const row of international.players){
    const territory=[];
    for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++)if(getHexDistance(row,{x,y})<=1){
      const key=`${x},${y}`;territory.push(key);owners[key]=row.id;territories[key]={status:'占領',settlementId:row.settlementId,hp:100,maxHp:100};
    }
    const bank=normalizeV39Village({settlementId:row.settlementId,name:`${row.label}の拠点`,x:row.x,y:row.y,placed:true,
      populationByRace:{只人:50},territoryTileKeys:territory,foodStockByType:Object.fromEntries(FOOD_RESOURCE_KEYS.map(k=>[k,1000])),
      materialStockByType:Object.fromEntries(MATERIAL_RESOURCE_KEYS.map(k=>[k,300]))},'只人');
    const units=row.couriers.map((point,i)=>courier(`${row.id}-courier-${i}`,`${row.label}の使節${i+1}`,point));
    const player=createPlayerRecord({id:row.id,label:row.label,race:'只人',isPlayer:true,controllerParticipantId:'local-1',
      factionState:{units,squads:[{id:'solo',label:'単独',unitIds:units.map(u=>u.id)}],settlements:[bank],selectedSettlementId:row.settlementId}},state.players.length);
    state={...state,players:[...state.players,player]};
  }
  state={...state,territoryOwnerByTile:owners,territoryStateByTile:territories};
  const contracts=[];
  for(const row of international.trades){
    const from=row.from==='self'?self:row.from,to=row.to;
    const side=(id,index,goods)=>({kind:'player',partyId:id,settlementId:state.players.find(p=>p.id===id).factionState.settlements[0].settlementId,
      unitId:id===self?ownCourier.id:`${id}-courier-${index}`,center:row.meeting,radius:1,goods});
    const proposal=proposeV39Trade({...state,activePlayerId:from},from,{sides:[side(from,row.fromCourier,{[row.give]:row.amount}),side(to,row.toCourier,{[row.receive]:row.amount})],
      dueTurn:state.timeline.turnNumber+international.dueAfterTurns,grace:international.graceTurns,period:0,cycles:1});
    if(!proposal.ok)throw Error(proposal.reason);
    const accepted=acceptV39Trade({...proposal.state,activePlayerId:to},to,proposal.contract.id);
    if(!accepted.ok)throw Error(accepted.reason);state=accepted.state;contracts.push(proposal.contract.id);
    for(const id of [from,to]){
      const reserved=reserveV39TradeFromStock({...state,activePlayerId:id},id,proposal.contract.id);
      if(!reserved.ok)throw Error(reserved.reason);state=reserved.state;
    }
  }
  for(const id of [self,...international.players.map(p=>p.id)])state=advanceV39TradeLogistics({...state,activePlayerId:id},id,map).state;
  map.internationalLogisticsTestFixture=true;
  state={...state,activePlayerId:self,explorationWorlds:{...worlds,surface:{...worlds.surface,map,spatial:{...worlds.surface.spatial,
    territoryOwnerByTile:owners,territoryStateByTile:territories}}}};
  window.loadV39FieldSnapshot(map,window.__v39FieldRuntime.settings,{layerChange:true});
  window.setV39GameState(state,{reason:'international-logistics-test-started',trackUnitDeaths:false});
  window.refreshV39MapEntities?.();window.activateV39FooterTab('logistics');
  window.showV39TurnBanner?.('物流テスト：洞窟・森・村・町の4便と国家間取引を配置。自国に関係しない取引は非公開です。');
  return {...started,players:state.players.length,contracts};
};

window.startV39LogisticsTest=startCombinedLogisticsTest;
// Keep the previous test entry compatible without duplicating initialization.
window.startV39InternationalLogisticsTest=startCombinedLogisticsTest;
