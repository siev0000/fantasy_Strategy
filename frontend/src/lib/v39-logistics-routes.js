import {getHexDistance,getHexOffsetNeighbors} from './hex-grid.js';
import {resolveV39AutomaticRoute,isV39UnitInsideSettlement,V39_TRANSPORT_RESOURCE_KEYS,getV39TransportCargo,loadV39SettlementResource} from './v39-transport-rules.js';
import {resolveV39MineRoute} from './v39-cave-operations.js';
import {resolveV39SquadMovementGroup,advanceV39CaveFormation,applyV39SquadMovement} from './v39-squad-movement-rules.js';
import {resolveV39UnitMovementStepCost,canUnitEnterV39Tile} from './v39-terrain-traversal.js';
import {normalizeV39Cargo,resolveV39CargoLoad,resolveV39UnitCargoCapacity} from './v39-logistics-state.js';
import {replaceFactionSettlement} from './settlement-state.js';
import {FOOD_RESOURCE_KEYS} from './v39-economy-rules.js';
import {V39_CAVE_MINE_BALANCE} from './v39-gameplay-balance.js';

const alive=u=>Number(u?.hp??u?.currentHp)>0&&u.state!=='死亡';
const world=u=>u?.worldId||'surface';
const key=u=>`${u.x},${u.y}`;
const faction=(s,id)=>s.players.find(p=>p.id===id)?.factionState;
const failure=(state,reason)=>({ok:false,state,reason});
const field=name=>FOOD_RESOURCE_KEYS.includes(name)?'foodStockByType':'materialStockByType';
export const V39_LOGISTICS_RESOURCES=V39_TRANSPORT_RESOURCE_KEYS;
export function logisticsEndpoints(state,playerId){
  return [...(faction(state,playerId)?.settlements||[]).filter(s=>s.placed).map(s=>({id:`settlement:${s.settlementId||s.id}`,kind:'settlement',settlementId:s.settlementId||s.id,name:s.name||s.id,worldId:'surface',x:s.x,y:s.y})),
    ...Object.entries(state.explorationWorlds||{}).filter(([id,w])=>w.map?.caveMine?.ownerPlayerId===playerId&&resolveV39MineRoute(state.explorationWorlds,id)).map(([id,w])=>({id:`mine:${id}`,kind:'mine',name:w.map.caveMine.name||`鉱床 ${w.map.caveFloor||id}`,worldId:id,x:w.map.entrances[0].x,y:w.map.entrances[0].y}))];
}
export function logisticsGroups(f){
  const groups=(f.squads||[]).filter(s=>!['solo','単独'].includes(s.id)).map(s=>({id:`squad:${s.id}`,name:s.name||s.label||s.id,memberIds:(s.unitIds||s.memberIds||[]).filter(id=>f.units.some(u=>u.id===id&&alive(u)))}));
  const assigned=new Set(groups.flatMap(g=>g.memberIds));
  return [...groups,...f.units.filter(u=>alive(u)&&!assigned.has(u.id)).map(u=>({id:`unit:${u.id}`,name:u.name,memberIds:[u.id]}))].filter(g=>g.memberIds.length);
}
function write(state,id,f){return {...state,players:state.players.map(p=>p.id===id?{...p,factionState:f}:p)};}
function mark(f,route,remove=false){return {...f,units:f.units.map(u=>{
  if(!route.memberIds.includes(u.id))return u;
  if(remove){if(u.transportAssignment?.logisticsRouteId!==route.id)return u;const next={...u};delete next.transportAssignment;return next;}
  return {...u,transportAssignment:{logisticsRouteId:route.id,enabled:route.enabled,status:!route.enabled?'paused':route.status==='停止'?'blocked':'delivering',reason:route.reason}};
})};}
export function configureLogisticsRoute(state,playerId,request){
  if(state.activePlayerId!==playerId||state.timeline?.phase!=='player')return failure(state,'自分の操作ターンに設定してください');
  const f=faction(state,playerId);if(!f)return failure(state,'操作する勢力がありません');
  const group=logisticsGroups(f).find(g=>g.id===request.groupId),ends=logisticsEndpoints(state,playerId);
  const source=ends.find(e=>e.id===request.sourceId),destination=ends.find(e=>e.id===request.destinationId&&e.kind==='settlement');
  if(!group||!source||!destination||source.id===destination.id)return failure(state,'担当部隊・運搬元・別の搬送先を選んでください');
  if(!V39_LOGISTICS_RESOURCES.includes(request.resource)||!Number.isFinite(Number(request.amount))||Number(request.amount)<1)return failure(state,'物資と1以上の数量を指定してください');
  const members=group.memberIds.map(id=>f.units.find(u=>u.id===id));
  const instructors=[...Object.values(f.recruitInstructorByTile||{}),...Object.values(f.recruitInstructorTransfers||{})].map(r=>r.unitId);
  if(members.some(u=>u.transportAssignment||u.tradeAssignment||u.caveDuty||u.summon||u.movementHold||u.squadMoveMode&&u.squadMoveMode!=='follow'||instructors.includes(u.id)))return failure(state,'他の任務・散開・その場待機・教官・召喚体を含む部隊は指定できません');
  if(members.some(u=>world(u)!==world(members[0])||getHexDistance(u,members[0])>2))return failure(state,'同じ世界の周囲2マス以内へ部隊を集合してください');
  if(members.some(u=>resolveV39CargoLoad(getV39TransportCargo(f,u.id))>0)||resolveV39CargoLoad(f.squads.find(s=>(s.unitIds||[]).includes(members[0].id))?.cargo)>0)return failure(state,'既存の荷物を降ろしてから設定してください');
  const route={id:`logistics-${playerId}-${Number(f.logisticsSerial||0)+1}`,name:group.name,groupId:group.id,memberIds:group.memberIds,leaderId:members[0].id,
    sourceId:source.id,destinationId:destination.id,resource:request.resource,amount:Math.floor(Number(request.amount)),repeat:request.repeat!==false,phase:'fetch',enabled:true,status:'運搬元へ移動',reason:''};
  return {ok:true,route,state:write(state,playerId,mark({...f,logisticsSerial:Number(f.logisticsSerial||0)+1,logisticsRoutes:[...(f.logisticsRoutes||[]),route]},route))};
}
export function controlLogisticsRoute(state,playerId,id,action){
  if(state.activePlayerId!==playerId||state.timeline?.phase!=='player')return failure(state,'自分の操作ターンに操作してください');
  const f=faction(state,playerId),source=f.logisticsRoutes?.find(r=>r.id===id);
  if(!source)return failure(state,'輸送任務がありません');
  let route={...source};
  if(action==='pause')Object.assign(route,{enabled:false,status:'中断中',reason:'手動再開待ち'});
  else if(action==='resume'||action==='return'){
    if(route.memberIds.some(id=>{const u=f.units.find(u=>u.id===id);return !alive(u)||u.transportAssignment&&u.transportAssignment.logisticsRouteId!==route.id||u.tradeAssignment||u.caveDuty;}))return failure(state,'担当部隊の死亡・別任務を確認してください');
    Object.assign(route,{enabled:true,returning:action==='return'||route.returning,status:action==='return'?'帰還中':'再開',reason:''});
  }else if(action==='remove'){
    if(resolveV39CargoLoad(getV39TransportCargo(f,route.leaderId))>0)return failure(state,'積荷があります。帰還して搬入してから解除してください');
    return {ok:true,state:write(state,playerId,mark({...f,logisticsRoutes:f.logisticsRoutes.filter(r=>r.id!==id)},route,true))};
  }else return failure(state,'操作が不正です');
  return {ok:true,state:write(state,playerId,mark({...f,logisticsRoutes:f.logisticsRoutes.map(r=>r.id===id?route:r)},route))};
}
export function logisticsTarget(state,playerId,route){
  const ends=logisticsEndpoints(state,playerId),source=ends.find(e=>e.id===route.sourceId),destination=ends.find(e=>e.id===route.destinationId);
  return route.returning?(source?.kind==='mine'?destination:source):route.phase==='fetch'?source:destination;
}
export function logisticsLeg(state,playerId,route){
  const f=faction(state,playerId),unit=f.units.find(u=>u.id===route.leaderId),target=logisticsTarget(state,playerId,route);
  if(!unit||!target)return null;
  const current=world(unit);
  if(current===target.worldId)return {worldId:current,target};
  const chain=resolveV39MineRoute(state.explorationWorlds,current==='surface'?target.worldId:current);
  const i=chain?.findIndex(e=>e.id===current),j=chain?.findIndex(e=>e.id===target.worldId);
  if(i<0||j<0||i===undefined||j===undefined)return null;
  const forward=j>i,entry=chain[i],next=chain[i+(forward?1:-1)];
  return {worldId:current,target:forward?entry.forward:entry.backward,cross:{worldId:next.id,tile:forward?next.backward:entry.exit}};
}
function groupFor(f,route){
  const ids=new Set(route.memberIds);
  const original=f.squads.find(s=>(s.unitIds||s.memberIds||[]).includes(route.leaderId));
  return resolveV39SquadMovementGroup({...f,units:f.units.map(u=>ids.has(u.id)?{...u,transportAssignment:null}:u),
    squads:[{...original,id:original?.id||'solo',unitIds:route.memberIds,movementLeaderId:route.leaderId},...f.squads.filter(s=>s.id!==original?.id)]},route.leaderId,{followFormation:true});
}
function scoped(state,mapWorld){return {...state,...state.explorationWorlds?.[mapWorld]?.spatial,players:state.players};}
export function logisticsPath(state,playerId,route){
  const leg=logisticsLeg(state,playerId,route),f=faction(state,playerId),unit=f.units.find(u=>u.id===route.leaderId),map=state.explorationWorlds?.[leg?.worldId]?.map;
  if(!leg||!map||!unit)return {leg,path:null};
  return {leg,path:resolveV39AutomaticRoute(scoped(state,leg.worldId),map,playerId,unit,leg.target,map.worldWrapEnabled===true,route.memberIds)};
}
export function advanceLogisticsRoutes(state,playerId,turn){
  let f=faction(state,playerId);if(!f?.logisticsRoutes?.some(r=>r.enabled))return state;
  let worlds={...state.explorationWorlds};
  for(const raw of f.logisticsRoutes){
    if(!raw.enabled||raw.lastProcessedTurn>=turn)continue;
    const r={...raw,lastProcessedTurn:turn,reason:''};
    const stop=reason=>{r.enabled=false;r.status='停止';r.reason=reason;};
    const members=r.memberIds.map(id=>f.units.find(u=>u.id===id));
    if(members.some(u=>!alive(u)||u.transportAssignment?.logisticsRouteId!==r.id)){r.enabled=false;stop('部隊員が死亡・離脱しました。手動で確認してください');}
    else if(members.some(u=>world(u)!==world(members[0]))){stop('部隊が別の世界へ分散しています');}
    else if(members.some(u=>u.waitTurnNumber===turn||u.movementHold)){r.status='待機';r.reason='部隊員が待機中です';}
    else{
      for(let stage=0;stage<8;stage++){
        const currentState=write({...state,explorationWorlds:worlds},playerId,f),leg=logisticsLeg(currentState,playerId,r),group=groupFor(f,r);
        if(!leg||!group.ok||group.participantIds?.length!==r.memberIds.length){stop(group.reason||'運搬先・接続・部隊の編制を確認してください');break;}
        const map=worlds[leg.worldId]?.map,scopedState=scoped(currentState,leg.worldId);
        const path=resolveV39AutomaticRoute(scopedState,map,playerId,group.leader,leg.target,map?.worldWrapEnabled===true,r.memberIds);
        if(!path){stop('通行可能な経路がありません');break;}
        let failed=false;
        for(const step of path){
          const g=groupFor(f,r),occupied=new Set([...scopedState.players.flatMap(p=>p.factionState.units),...(scopedState.enemies||[]),...(scopedState.neutralVillages||[]).flatMap(v=>v.defenseUnits||[])]
            .filter(u=>alive(u)&&world(u)===leg.worldId&&!r.memberIds.includes(u.id)).map(key));
          const positions=advanceV39CaveFormation(map,g.positions,step,g,occupied);
          if(!positions){stop('部隊が通過できない・進路が塞がれています');failed=true;break;}
          const cost=Math.max(...positions.map(p=>{const u=g.participants.find(u=>u.id===p.id);return resolveV39UnitMovementStepCost(map,u.x,u.y,p.x,p.y,u);}));
          if(cost>g.moveAp){r.status='AP待ち';failed=true;break;}
          const moved=applyV39SquadMovement(f,g,{x:step.x,y:step.y,positions},cost,scopedState);
          if(!moved.ok){stop(moved.reason);failed=true;break;}f=moved.faction;
          if(r.memberIds.some(id=>!alive(f.units.find(u=>u.id===id)))){stop('災害で部隊員が死亡しました');failed=true;break;}
        }
        if(failed)break;
        const leader=f.units.find(u=>u.id===r.leaderId);
        if(path.waitingForFriendlyUnitId){r.status='待機';r.reason='味方ユニットの移動待ち';break;}
        if(leg.cross){
          const nextMap=worlds[leg.cross.worldId]?.map,occupied=new Set([...currentState.players.flatMap(p=>p.id===playerId?f.units:p.factionState.units),...(worlds[leg.cross.worldId]?.spatial?.enemies||[]),...(worlds[leg.cross.worldId]?.spatial?.neutralVillages||[]).flatMap(v=>v.defenseUnits||[])].filter(u=>alive(u)&&world(u)===leg.cross.worldId&&!r.memberIds.includes(u.id)).map(key));
          const placements=[],costs=new Map();
          for(const id of r.memberIds){
            const u=f.units.find(u=>u.id===id),approach=resolveV39AutomaticRoute(scopedState,map,playerId,u,leg.target,map.worldWrapEnabled===true,r.memberIds);
            const cost=approach?approach.reduce((n,s)=>n+s.stepCost,0)+V39_CAVE_MINE_BALANCE.crossingApCost:Infinity;
            if(cost>Number(u.ap)){
              // Let trailing members catch up physically instead of waiting forever behind a narrow entrance.
              const occupiedHere=new Set(f.units.filter(v=>v.id!==id&&alive(v)&&world(v)===leg.worldId).map(key));
              let spent=0,best=null;
              for(const step of approach||[]){if(spent+step.stepCost>Number(u.ap))break;spent+=step.stepCost;if(!occupiedHere.has(key(step)))best={...step,spent};}
              if(best)f={...f,units:f.units.map(v=>v.id===id?{...v,x:best.x,y:best.y,position:[best.x,best.y],ap:v.ap-best.spent,currentAp:v.ap-best.spent,lastActionTurn:turn}:v)};
              r.status='入口でAP待ち';failed=true;break;
            }
            const tile=[leg.cross.tile,...getHexOffsetNeighbors(leg.cross.tile.x,leg.cross.tile.y)].find(t=>nextMap?.grid?.[t.y]?.[t.x]&&!occupied.has(key(t))&&canUnitEnterV39Tile(nextMap,t.x,t.y,u)&&Number.isFinite(resolveV39UnitMovementStepCost(nextMap,leg.cross.tile.x,leg.cross.tile.y,t.x,t.y,u)));
            if(!tile){stop('入口の配置先が塞がれています');failed=true;break;}
            const total=cost+resolveV39UnitMovementStepCost(nextMap,leg.cross.tile.x,leg.cross.tile.y,tile.x,tile.y,u);
            if(total>Number(u.ap)){r.status='入口でAP待ち';failed=true;break;}
            occupied.add(key(tile));placements.push({id,...tile});costs.set(id,total);
          }
          if(failed)break;
          f={...f,units:f.units.map(u=>{const t=placements.find(p=>p.id===u.id);return t?{...u,x:t.x,y:t.y,position:[t.x,t.y],worldId:leg.cross.worldId,ap:u.ap-costs.get(u.id),currentAp:u.ap-costs.get(u.id),lastActionTurn:turn}:u;})};continue;
        }
        const target=logisticsTarget(currentState,playerId,r),squad=f.squads.find(s=>(s.unitIds||[]).includes(r.leaderId));
        if(!squad){stop('所属部隊がありません');break;}
        let cargo=getV39TransportCargo(f,r.leaderId);
        if(target.kind==='settlement'&&!isV39UnitInsideSettlement(leader,f.settlements.find(s=>(s.settlementId||s.id)===target.settlementId))){stop('拠点へ到着できません');break;}
        if(r.phase==='fetch'&&!r.returning){
          const capacity=members.reduce((n,u)=>n+resolveV39UnitCargoCapacity(u,state),0),amountLimit=Math.min(r.amount,Math.max(0,capacity-resolveV39CargoLoad(cargo)));
          if(target.kind==='mine'){
            const entry=worlds[target.worldId],mine=entry.map.caveMine;
            const alias=r.resource==='鉄'&&mine.stockByResource.鉱石!==undefined?'鉱石':r.resource;
            const amount=Math.max(0,Math.min(Number(mine.stockByResource[alias])||0,amountLimit));
            cargo.resourcesByType[r.resource]=(cargo.resourcesByType[r.resource]||0)+amount;
            worlds[target.worldId]={...entry,map:{...entry.map,caveMine:{...mine,stockByResource:{...mine.stockByResource,[alias]:(mine.stockByResource[alias]||0)-amount}}}};
          }else{
            const source=f.settlements.find(s=>(s.settlementId||s.id)===target.settlementId);
            const loaded=loadV39SettlementResource(source,state.players.find(player=>player.id===playerId)?.race,r.resource,cargo,capacity,{maxAmount:r.amount});
            cargo=loaded.cargo;
            f=replaceFactionSettlement(f,loaded.settlement,{ownerPlayerId:playerId,select:false});
          }
          r.phase=resolveV39CargoLoad(cargo)>0?'deliver':'fetch';r.status=r.phase==='deliver'?'積込完了':'物資待ち';
        }else{
          const home=f.settlements.find(s=>(s.settlementId||s.id)===target.settlementId),next={...home,foodStockByType:{...home.foodStockByType},materialStockByType:{...home.materialStockByType}};
          for(const [name,amount] of Object.entries(cargo.resourcesByType))next[field(name)][name]=(Number(next[field(name)][name])||0)+amount;
          f=replaceFactionSettlement(f,next,{ownerPlayerId:playerId,select:false});cargo=normalizeV39Cargo();r.phase='fetch';r.status='搬入完了';
          if(!r.repeat||r.returning){r.enabled=false;r.status='完了';}
        }
        f={...f,squads:f.squads.map(s=>s.id===squad.id?{...s,cargoByUnitId:{...s.cargoByUnitId,[r.leaderId]:cargo}}:s)};break;
      }
    }
    f=mark({...f,logisticsRoutes:f.logisticsRoutes.map(route=>route.id===r.id?r:route)},r,!r.enabled&&r.status==='完了');
  }
  return write({...state,explorationWorlds:worlds},playerId,f);
}
