import {getFactionSettlementById,replaceFactionSettlement} from './settlement-state.js';
import {isV39TerritoryPhase,usesV39OperationPhases} from './v39-operation-phases.js';
export function projectV39OperationTerritory(state,playerId,base){
  const owners={...state.territoryOwnerByTile},records={...state.territoryStateByTile};
  const keys=[...(base.landExpansionProjects||[]).map(plan=>plan.tileKey),...(base.operationPlans||[]).filter(plan=>plan.kind==='expansion').map(plan=>`${plan.tile.x},${plan.tile.y}`)];
  for(const key of keys)if(!owners[key]){owners[key]=playerId;records[key]={settlementId:base.settlementId,hp:100};}
  return {...state,territoryOwnerByTile:owners,territoryStateByTile:records,players:state.players.map(player=>player.id===playerId?{...player,factionState:replaceFactionSettlement(player.factionState,{...base,landExpansionProjects:[]},{ownerPlayerId:playerId,select:false})}:player)};
}

export function queueV39OperationPlan(state,playerId,settlementId,input){
  const player=state.players?.find(row=>row.id===playerId),base=getFactionSettlementById(player?.factionState,settlementId);
  if(!base?.placed||state.activePlayerId!==playerId||state.timeline?.phase!=='player'||!isV39TerritoryPhase(state))return {ok:false,state,reason:'領土運営フェーズで計画してください'};
  if(!['construction','expansion','wall','development'].includes(input?.kind)||!Number.isInteger(input.tile?.x)||!Number.isInteger(input.tile?.y)||input.tile.x<0||input.tile.y<0)return {ok:false,state,reason:'計画の種類と対象マスを指定してください'};
  const plans=base.operationPlans||[];
  const key=`${input.tile.x},${input.tile.y}`,owner=state.territoryOwnerByTile?.[key];
  if(owner&&owner!==playerId)return {ok:false,state,reason:'他勢力の土地は予約できません'};
  if(input.kind==='expansion'&&owner)return {ok:false,state,reason:'既に領有済みの土地です'};
  const assigned=state.territoryStateByTile?.[key]?.settlementId;
  if(owner===playerId&&assigned&&assigned!==settlementId)return {ok:false,state,reason:'対象マスの所属拠点を選んでください'};
  if(input.kind!=='expansion'&&!owner&&!plans.some(plan=>plan.kind==='expansion'&&`${plan.tile.x},${plan.tile.y}`===key)&&!base.landExpansionProjects?.some(plan=>plan.tileKey===key))return {ok:false,state,reason:'自領または領土拡張予定のマスを選んでください'};
  if(plans.some(row=>row.kind===input.kind&&row.tile.x===input.tile.x&&row.tile.y===input.tile.y&&row.facilityName===input.facilityName))return {ok:false,state,reason:'同じ計画が既にあります'};
  const plan={...input,...(Array.isArray(input.edges)?{edges:input.edges.map(edge=>({from:{...edge.from},to:{...edge.to}}))}:{}),
    ...(Array.isArray(input.residentialTileKeys)?{residentialTileKeys:[...input.residentialTileKeys]}:{}),
    tile:{x:input.tile.x,y:input.tile.y},id:`plan-${playerId}-${state.timeline.turnNumber}-${Number(base.operationPlanSequence||0)+1}`,
    notBeforeTurn:Math.max(state.timeline.turnNumber,Math.floor(Number(input.notBeforeTurn)||0)),status:'pending',reason:''};
  const faction=replaceFactionSettlement(player.factionState,{...base,operationPlanSequence:Number(base.operationPlanSequence||0)+1,operationPlans:[...plans,plan]},{ownerPlayerId:playerId,select:false});
  return {ok:true,plan,state:{...state,players:state.players.map(row=>row.id===playerId?{...row,factionState:faction}:row)}};
}
export function editV39OperationPlan(state,playerId,settlementId,planId,action,value,scope='all'){
  const player=state.players?.find(row=>row.id===playerId),base=getFactionSettlementById(player?.factionState,settlementId);
  if(!isV39TerritoryPhase(state)||state.activePlayerId!==playerId||state.timeline?.phase!=='player'||!base)return {ok:false,state,reason:'領土運営フェーズで編集してください'};
  const plans=[...(base.operationPlans||[])],index=plans.findIndex(row=>row.id===planId);
  if(index<0)return {ok:false,state,reason:'計画がありません'};
  if(action==='cancel')plans.splice(index,1);
  else if(action==='turn')plans[index]={...plans[index],notBeforeTurn:Math.max(state.timeline.turnNumber,Math.floor(Number(value)||state.timeline.turnNumber))};
  else if(action==='up'||action==='down'){
    const indices=plans.flatMap((plan,i)=>scope==='all'||(scope==='expansion'?plan.kind==='expansion':plan.kind!=='expansion')?[i]:[]);
    const position=indices.indexOf(index),target=indices[position+(action==='up'?-1:1)];
    if(position>=0&&target!==undefined)[plans[index],plans[target]]=[plans[target],plans[index]];
  }
  else return {ok:false,state,reason:'不明な操作です'};
  const faction=replaceFactionSettlement(player.factionState,{...base,operationPlans:plans},{ownerPlayerId:playerId,select:false});
  return {ok:true,state:{...state,players:state.players.map(row=>row.id===playerId?{...row,factionState:faction}:row)}};
}

// Dependencies are injected so the scheduler can reuse construction rules without an import cycle.
export function advanceV39OperationPlans(state,map,{construction,expansion,wall,development}){
  if(!usesV39OperationPhases(state))return state;
  const turn=state.timeline?.turnNumber||1;
  for(const player of state.players||[]){
    if(player.isPlayer===false)continue;
    for(const base of player.factionState?.settlements||[]){
      if(!base.operationPlans?.length||Number(base.lastOperationPlanTurn)>=turn)continue;
      const pending=[],history=[...(base.operationPlanHistory||[])];
      for(const plan of base.operationPlans){
        if(plan.notBeforeTurn>turn){pending.push({...plan,status:'pending',reason:`T${plan.notBeforeTurn}から着手`});continue;}
        const result=plan.kind==='development'?development(state,player.id,base.settlementId,{residentialTileKeys:plan.residentialTileKeys})
          :plan.kind==='expansion'?expansion(state,player.id,base.settlementId,plan.tile,map)
          :plan.kind==='wall'?wall(state,player.id,plan.facilityName,plan.edges,map)
          :construction(state,player.id,plan.facilityName,plan.tile,map,{confirmResidentialReplacement:plan.confirmResidentialReplacement===true});
        if(result.ok){state=result.state;history.push({...plan,status:'started',startedTurn:turn});}
        else pending.push({...plan,status:'blocked',reason:result.reason||'着手条件を満たしていません'});
      }
      const current=state.players.find(row=>row.id===player.id),latest=getFactionSettlementById(current.factionState,base.settlementId);
      const faction=replaceFactionSettlement(current.factionState,{...latest,operationPlans:pending,operationPlanHistory:history.slice(-30),lastOperationPlanTurn:turn},{ownerPlayerId:player.id,select:false});
      state={...state,players:state.players.map(row=>row.id===player.id?{...row,factionState:faction}:row)};
    }
  }
  return state;
}
