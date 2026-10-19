import {getHexDistance,getHexNeighborCoords} from './hex-grid.js';
import {resolveV39AutomaticRoute} from './v39-transport-rules.js';
import {advanceV39CaveFormation} from './v39-squad-movement-rules.js';
import {resolveV39UnitMovementStepCost,canUnitEnterV39Tile} from './v39-terrain-traversal.js';
import {resolveV39CargoLoad} from './v39-logistics-state.js';
import {listV39Trades,updateV39Trade,tradeBank,changeTradeBank,tradeMembers,tradeAlive,tradeTurn,
  updateTradeUnits,getTradeCargo,setTradeCargo,tradeCapacity,tradeSpeed,tradeReserveAmount,V39_TRADE_RESOURCES} from './v39-trade-state.js';
import {getV39SpecialtyAccess} from './v39-specialty-rules.js';
import {applyV39DisasterMovementDamage} from './v39-disaster-damage.js';
const n=value=>Number(value)||0;
const pointKey=row=>`${row.x},${row.y}`;
const hasGoods=(bag,goods)=>Object.entries(goods).every(([resource,amount])=>n(bag?.[resource])+0.01>=amount);
function assign(state,side,id,automatic) {
  return updateTradeUnits(state,side,unit=>side.memberIds.includes(unit.id)?{...unit,tradeAssignment:id?{contractId:id,automatic}:undefined}:unit);
}
function occupied(state,side) {
  const own=new Set(side.memberIds);
  return new Set([...(state.players||[]).flatMap(row=>row.factionState.units||[]),...(state.enemies||[]),
    ...(state.neutralVillages||[]).flatMap(row=>row.defenseUnits||[])].filter(unit=>tradeAlive(unit)&&!own.has(unit.id)&&(unit.worldId||'surface')==='surface').map(pointKey));
}
function inMeeting(unit,contract) {return !!unit&&contract.sides.every(side=>getHexDistance(unit,side.center)<=side.radius);}
export function resolveV39TradeMovementPath(state,side,contract,map,home){
  const members=tradeMembers(state,side),actor=members.find(row=>row.id===side.unitId),bank=tradeBank(state,side);
  if(!actor||!bank||!map?.grid)return null;
  const peer=contract.sides.find(row=>row!==side&&row.stage==='waiting');
  const peerActor=peer?tradeMembers(state,peer).find(row=>row.id===peer.unitId&&tradeAlive(row)):null;
  const cohesive=members.every(unit=>getHexDistance(unit,actor)<=Math.max(1,members.length-1));
  if(cohesive&&(home?getHexDistance(actor,bank)<=1:inMeeting(actor,contract)&&(!peerActor||getHexDistance(actor,peerActor)<=1)))return [];
  const blocked=occupied(state,side);
  let goals=[];
  if(home)goals=[bank,...getHexNeighborCoords(map.w,map.h,bank.x,bank.y,false)];
  else for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++){const tile={x,y};if(inMeeting(tile,contract))goals.push(tile);}
  goals=goals.filter(tile=>!blocked.has(pointKey(tile))&&canUnitEnterV39Tile(map,tile.x,tile.y,actor)&&(!peerActor||home||getHexDistance(tile,peerActor)<=1))
    .sort((a,b)=>getHexDistance(actor,a)-getHexDistance(actor,b));
  let path=null;
  for(const goal of goals.slice(0,20)) {path=resolveV39AutomaticRoute(state,map,side.kind==='player'?side.partyId:'',actor,goal,false,side.memberIds);if(path?.length)break;path=null;}
  return path;
}
function moveParty(state,side,contract,map,home) {
  let members=tradeMembers(state,side);const actor=members.find(row=>row.id===side.unitId);
  const bank=tradeBank(state,side);if(!actor||!bank)return {state,arrived:false,reason:'担当者または出発拠点がありません'};
  const peer=contract.sides.find(row=>row!==side&&row.stage==='waiting');
  const peerActor=peer?tradeMembers(state,peer).find(row=>row.id===peer.unitId&&tradeAlive(row)):null;
  const done=()=>{const lead=members.find(row=>row.id===side.unitId),cohesive=members.every(unit=>getHexDistance(unit,lead)<=Math.max(1,members.length-1));
    return cohesive&&(home?getHexDistance(lead,bank)<=1:inMeeting(lead,contract)&&(!peerActor||getHexDistance(lead,peerActor)<=1));};
  if(done())return {state,arrived:true};
  const blocked=occupied(state,side),path=resolveV39TradeMovementPath(state,side,contract,map,home);
  if(!path)return {state,arrived:false,reason:'通行可能な待ち合わせ/帰還経路がありません'};
  const load=resolveV39CargoLoad(getTradeCargo(state,side)),speed=tradeSpeed(members,load);
  if(speed<=0)return {state,arrived:false,reason:'積載超過で移動速度0%です'};
  let formation=members.map(unit=>({id:unit.id,x:unit.x,y:unit.y}));
  // 指定担当者を先頭にし、既存の狭路対応の追従形成を使う。
  formation.sort((a,b)=>a.id===side.unitId?-1:b.id===side.unitId?1:0);
  const moved=[];
  for(const step of path) {
    const positions=advanceV39CaveFormation(map,formation,step,{participants:members},blocked);if(!positions)break;
    const costs=positions.map(position=>{const unit=members.find(row=>row.id===position.id);return Math.ceil(resolveV39UnitMovementStepCost(map,unit.x,unit.y,position.x,position.y,unit)/speed);});
    if(costs.some((cost,index)=>!Number.isFinite(cost)||cost>n(members.find(row=>row.id===positions[index].id).ap)))break;
    members=members.map(unit=>{const index=positions.findIndex(row=>row.id===unit.id),position=positions[index],ap=Math.max(0,n(unit.ap)-costs[index]);return applyV39DisasterMovementDamage({...unit,ap,currentAp:ap,lastActionTurn:tradeTurn(state)},[position],state).unit;});
    if(members.some(unit=>!tradeAlive(unit))){const byId=new Map(members.map(unit=>[unit.id,unit]));return {state:updateTradeUnits(state,side,unit=>byId.get(unit.id)||unit),arrived:false,reason:'災害で部隊員が死亡しました',path:[...moved,step]};}
    formation=positions;moved.push({x:step.x,y:step.y});if(done())break;
  }
  const byId=new Map(members.map(unit=>[unit.id,unit]));
  return {state:updateTradeUnits(state,side,unit=>byId.get(unit.id)||unit),arrived:done(),reason:moved.length?'':'AP不足または通路の空き待ち',path:moved};
}
function interrupt(state,contract,reason) {
  contract.status='interrupted';contract.reason=reason;contract.resumeApprovals=[];
  for(const side of contract.sides)state=assign(state,side,contract.id,false);
  return updateV39Trade(state,contract);
}
export function advanceV39TradeLogistics(state,playerId,map,turn=tradeTurn(state),npcOnly=false) {
  if(!map?.grid||(state.activeWorldId||'surface')!=='surface')return {state,reports:[]};
  let next=state;const reports=[];
  for(const source of listV39Trades(state)) {
    if(!['active','cancelling'].includes(source.status))continue;
    let contract=structuredClone(source);
    for(const side of contract.sides) {
      if(npcOnly?side.kind!=='village':side.kind!=='player'||side.partyId!==playerId)continue;
      if(side.lastMoveTurn>=turn)continue;
      side.lastMoveTurn=turn;
      const members=tradeMembers(next,side);
      if(members.length!==side.memberIds.length||members.some(unit=>!tradeAlive(unit))) {
        if(contract.status==='cancelling'){side.stage='returned';continue;}
        next=interrupt(next,contract,'担当者の死亡/消失。取引前の交換を停止しました');contract=structuredClone(listV39Trades(next).find(row=>row.id===source.id));break;
      }
      const bank=tradeBank(next,side),actor=members.find(row=>row.id===side.unitId);
      if(!bank){next=interrupt(next,contract,'出発拠点を失いました');break;}
      if(side.stage==='collecting') {
        const home=moveParty(next,side,contract,map,true);next=home.state;
        if(home.arrived&&hasGoods(side.reserved,side.goods)) {
          next=setTradeCargo(next,side,{resourcesByType:side.reserved});side.reserved={};side.stage='outbound';
          reports.push({contractId:contract.id,message:'取引用の予約物資を積み込みました'});
        } else side.reason=home.reason||'次回分の収入確保待ち';
      }
      if(side.stage==='outbound') {
        const movement=moveParty(next,side,contract,map,false);next=movement.state;side.reason=movement.reason;
        if(movement.arrived)side.stage='waiting';
        if(movement.path?.length)reports.push({contractId:contract.id,unitId:side.unitId,path:movement.path,message:'取引場所へ移動'});
      }
      if(side.stage==='returning') {
        const movement=moveParty(next,side,contract,map,true);next=movement.state;side.reason=movement.reason;
        if(movement.arrived) {
          const cargo=getTradeCargo(next,side),deposit=changeTradeBank(next,side,cargo.resourcesByType,1);
          if(!deposit.ok){side.reason=deposit.reason;continue;}
          next=setTradeCargo(deposit.state,side,{});side.stage='returned';reports.push({contractId:contract.id,message:'帰還して荷下ろししました'});
        }
      }
    }
    if(contract.status==='active'&&contract.sides.every(side=>side.stage==='waiting')&&turn>=contract.dueTurn&&turn<=contract.dueTurn+contract.grace) {
      const cargos=contract.sides.map(side=>getTradeCargo(next,side));
      const members=contract.sides.map(side=>tradeMembers(next,side));
      if(contract.sides.some((side,index)=>!hasGoods(cargos[index].resourcesByType,side.goods)||members[index].length!==side.memberIds.length||members[index].some(unit=>!tradeAlive(unit)||(unit.worldId||'surface')!=='surface')||!inMeeting(members[index].find(unit=>unit.id===side.unitId),contract))
        ||getHexDistance(members[0].find(unit=>unit.id===contract.sides[0].unitId),members[1].find(unit=>unit.id===contract.sides[1].unitId))>1) {
        next=interrupt(next,contract,'交換前の物資/到着条件が変わりました');continue;
      }
      if(contract.sides.some((side,index)=>Object.values(contract.sides[1-index].goods).reduce((sum,value)=>sum+n(value),0)>tradeCapacity(members[index]))) {
        next=interrupt(next,contract,'受け取る荷物を一度に運べません');continue;
      }
      // 双方を検証してから、同じstateの書込みで交換する。
      const loans=[];let invalid=false;
      for(let i=0;i<2;i++)for(const [name,count] of Object.entries(contract.sides[i].goods))if(V39_TRADE_RESOURCES.find(row=>row.name===name)?.specialty) {
        const side=contract.sides[i],owned=getV39SpecialtyAccess(next,side.partyId,{settlementId:side.settlementId,includeBorrowed:false}).find(row=>row.name===name)?.count||0;
        if(owned<n(tradeBank(next,side)?.specialtyReservedByType?.[name]))invalid=true;
        loans.push({name,count,from:i,startTurn:turn,endTurn:turn+(contract.specialtyTurns||10)});
      }
      if(invalid){next=interrupt(next,contract,'特産品の保有マスを失いました');continue;}
      contract.specialtyLoans=[...(contract.specialtyLoans||[]),...loans];next=updateV39Trade(next,contract);
      for(let i=0;i<2;i++) {
        const release=Object.fromEntries(loans.filter(loan=>loan.from===i).map(loan=>[loan.name,loan.count]));
        if(Object.keys(release).length)next=changeTradeBank(next,contract.sides[i],release,1).state;
      }
      for(let i=0;i<2;i++) {
        const bag={...cargos[i].resourcesByType};
        for(const [name,amount] of Object.entries(contract.sides[i].goods))bag[name]=Math.max(0,n(bag[name])-amount);
        for(const [name,amount] of Object.entries(contract.sides[1-i].goods))if(!V39_TRADE_RESOURCES.find(row=>row.name===name)?.specialty)bag[name]=n(bag[name])+amount;
        next=setTradeCargo(next,contract.sides[i],{...cargos[i],resourcesByType:bag});contract.sides[i].stage='returning';
      }
      contract.completedCycles++;contract.history.push({turn,cycle:contract.completedCycles,goods:contract.sides.map(side=>({...side.goods}))});
      reports.push({contractId:contract.id,message:`同時交換を完了しました (${contract.completedCycles}/${contract.cycles})`});
    }
    if(contract.status==='active'&&turn>contract.dueTurn+contract.grace&&contract.completedCycles===contract.history.length&&contract.sides.some(side=>!['returning','returned'].includes(side.stage))) {
      next=interrupt(next,contract,'猶予期限切れ。取引画面で再協議してください');continue;
    }
    if(contract.sides.every(side=>side.stage==='returned')) {
      if(contract.status==='cancelling'||contract.completedCycles>=contract.cycles) {
        contract.status=contract.status==='cancelling'?'cancelled':'complete';
        for(const side of contract.sides)next=assign(next,side,null,false);
      } else {
        const staged=next;let funded=next;const reserves=[];let reason='';
        for(const side of contract.sides) {
          const reserved=Object.fromEntries(Object.entries(side.goods).map(([resource,amount])=>[resource,tradeReserveAmount(resource,amount)]));
          const payment=changeTradeBank(funded,side,reserved,-1);if(!payment.ok){reason=payment.reason;break;}funded=payment.state;reserves.push(reserved);
        }
        contract.dueTurn+=contract.period;
        if(reason||contract.dueTurn<turn) {contract.needsCycleReserve=true;next=interrupt(staged,contract,reason||'次回の取引日までに往復できません');continue;}
        next=funded;contract.sides.forEach((side,i)=>{side.stage='collecting';side.reserved=reserves[i];});
      }
    }
    next=updateV39Trade(next,contract);
  }
  return {state:next,reports};
}
