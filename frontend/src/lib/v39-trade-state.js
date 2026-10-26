import config from '../../../config/v39-trade.json';
import {chargeV39Negotiation,resolveV39NegotiationSkill} from './v39-negotiation-rules.js';
import {getGameDataRows} from './game-data-registry.js';
import {v39SpecialtyDefinitions,getV39SpecialtyAccess} from './v39-specialty-rules.js';
import {V39_SPECIALTY_BALANCE} from './v39-gameplay-balance.js';
import {getHexDistance,getHexOffsetNeighbors} from './hex-grid.js';
import {resolveV39UnitCargoCapacity,resolveV39CargoLoad,normalizeV39Cargo} from './v39-logistics-state.js';

export const V39_TRADE_CONFIG=config;
export const V39_TRADE_RESOURCES=[...new Map([
  ...v39SpecialtyDefinitions().filter(row=>row.分類!=='特殊資源').map(row=>[row.名前,{name:row.名前,field:'specialtyStockByType',specialty:true}]),
  ...getGameDataRows('都市基本データ').filter(row=>['食料','特殊資源','木材','石材','金属','貴金属','宝石'].includes(row.分類)).map(row=>[row.データ分類,{name:row.データ分類,field:['食料','特殊資源'].includes(row.分類)?'foodStockByType':'materialStockByType'}])
]).values()];
const n=value=>Number.isFinite(Number(value))?Number(value):0;
const round=value=>Math.round(value*10)/10;
export const tradeAlive=unit=>n(unit?.hp??unit?.currentHp)>0&&unit.state!=='死亡';
const failure=(state,reason)=>({ok:false,state,reason});
export const tradeTurn=state=>Math.max(1,n(state.timeline?.turnNumber));
// Old saves without a delivery mode keep their two-party rendezvous behavior.
export const tradeCourierIndex=contract=>contract.deliveryMode==='proposer'?0:contract.deliveryMode==='partner'?1:-1;
export const listV39Trades=state=>(state.players||[]).flatMap(player=>player.factionState.tradeContracts||[]).sort((a,b)=>(a.acceptedOrder??a.sequence)-(b.acceptedOrder??b.sequence));
export function updateV39Trade(state,contract) {
  return {...state,players:state.players.map(player=>player.id!==contract.ownerId?player:{...player,factionState:{...player.factionState,
    tradeContracts:[...(player.factionState.tradeContracts||[]).filter(row=>row.id!==contract.id),contract]}})};
}
export function tradeBank(state,side) {
  const bank=side.kind==='village'?state.neutralVillages?.find(row=>row.id===side.partyId):state.players.find(row=>row.id===side.partyId)?.factionState.settlements?.find(row=>(row.settlementId||row.id)===side.settlementId);
  if(!bank||bank.abandoned)return null;
  const holdings=getV39SpecialtyAccess(state,side.partyId,{settlementId:side.settlementId,includeBorrowed:false});
  return {...bank,specialtyStockByType:Object.fromEntries(holdings.map(row=>[row.name,Math.max(0,row.count-n(bank.specialtyReservedByType?.[row.name]))]))};
}
export function updateTradeBank(state,side,bank) {
  bank={...bank};delete bank.specialtyStockByType;
  if(side.kind==='village')return {...state,neutralVillages:state.neutralVillages.map(row=>row.id===side.partyId?bank:row),settlements:(state.settlements||[]).map(row=>row.id===side.partyId?bank:row)};
  return {...state,players:state.players.map(player=>player.id!==side.partyId?player:{...player,factionState:{...player.factionState,
    settlements:player.factionState.settlements.map(row=>(row.settlementId||row.id)===side.settlementId?bank:row)}})};
}
export function tradeBankAmount(bank,resource) {
  const field=V39_TRADE_RESOURCES.find(row=>row.name===resource)?.field;
  return field?n(bank?.[field]?.[resource]):0;
}
export function changeTradeBank(state,side,goods,sign) {
  const bank=tradeBank(state,side);if(!bank)return failure(state,'取引拠点がありません');
  const next={...bank,foodStockByType:{...bank.foodStockByType},materialStockByType:{...bank.materialStockByType},specialtyStockByType:{...bank.specialtyStockByType}};
  next.specialtyReservedByType={...bank.specialtyReservedByType};
  for(const [resource,amount] of Object.entries(goods)) {
    if(V39_TRADE_RESOURCES.find(row=>row.name===resource)?.specialty){
      if(!Number.isInteger(amount)||amount<0||sign<0&&tradeBankAmount(bank,resource)<amount)return failure(state,`${resource}の利用可能な保有マスが不足しています`);
      next.specialtyReservedByType[resource]=Math.max(0,n(next.specialtyReservedByType[resource])-sign*amount);continue;
    }
    const field=V39_TRADE_RESOURCES.find(row=>row.name===resource)?.field;
    if(!field||!Number.isFinite(amount)||amount<0||n(next[field][resource])+sign*amount<-0.01)return failure(state,`${resource}が不足しています`);
    next[field][resource]=round(Math.max(0,n(next[field][resource])+sign*amount));
  }
  return {ok:true,state:updateTradeBank(state,side,next)};
}
export const tradeReserveAmount=(name,amount)=>V39_TRADE_RESOURCES.find(row=>row.name===name)?.specialty?amount:Math.ceil(amount/config.initialReserveDivisor);
export function tradeUnits(state,side) {
  return side.kind==='village'?state.neutralVillages?.find(row=>row.id===side.partyId)?.defenseUnits||[]:state.players.find(row=>row.id===side.partyId)?.factionState.units||[];
}
export function tradeMembers(state,side) {
  const units=tradeUnits(state,side),actor=units.find(row=>row.id===side.unitId);
  if(!actor)return [];
  if(side.memberIds)return side.memberIds.map(id=>units.find(row=>row.id===id)).filter(Boolean);
  if(side.kind==='village'||actor.squadId==='solo')return [actor];
  const squad=state.players.find(row=>row.id===side.partyId)?.factionState.squads?.find(row=>row.id!=='solo'&&row.unitIds?.includes(actor.id));
  return squad?units.filter(row=>squad.unitIds.includes(row.id)):[actor];
}
export function updateTradeUnits(state,side,transform) {
  if(side.kind==='village') {
    const village=tradeBank(state,side);return updateTradeBank(state,side,{...village,defenseUnits:village.defenseUnits.map(transform)});
  }
  return {...state,players:state.players.map(player=>player.id!==side.partyId?player:{...player,factionState:{...player.factionState,units:player.factionState.units.map(transform)}})};
}
export function getTradeCargo(state,side) {
  if(side.kind==='village')return normalizeV39Cargo(tradeUnits(state,side).find(row=>row.id===side.unitId)?.tradeCargo);
  const faction=state.players.find(row=>row.id===side.partyId)?.factionState;
  return normalizeV39Cargo(faction?.squads?.find(row=>row.unitIds?.includes(side.unitId))?.cargoByUnitId?.[side.unitId]);
}
export function setTradeCargo(state,side,cargo) {
  if(side.kind==='village')return updateTradeUnits(state,side,unit=>unit.id===side.unitId?{...unit,tradeCargo:normalizeV39Cargo(cargo)}:unit);
  return {...state,players:state.players.map(player=>player.id!==side.partyId?player:{...player,factionState:{...player.factionState,
    squads:player.factionState.squads.map(squad=>squad.unitIds?.includes(side.unitId)?{...squad,cargoByUnitId:{...squad.cargoByUnitId,[side.unitId]:normalizeV39Cargo(cargo)}}:squad)}})};
}
export function tradeCapacity(members,state) {return round(members.filter(tradeAlive).reduce((sum,unit)=>sum+resolveV39UnitCargoCapacity(unit,state),0));}
export function tradeSpeed(members,load,state) {
  const capacity=tradeCapacity(members,state),normal=members.filter(unit=>tradeAlive(unit)&&!unit.isTransportVehicle);
  const attack=normal.length?normal.reduce((sum,unit)=>sum+n(unit.status?.攻撃),0)/normal.length:0;
  return capacity>0?Math.max(0,Math.min(1,2-load/capacity+attack/1000)):load>0?0:1;
}
function hasAdjacentMeetingTiles(sides) {
  const a=sides[0],inside=tile=>tile.x>=0&&tile.y>=0&&sides.every(side=>getHexDistance(tile,side.center)<=side.radius);
  for(let dy=-a.radius;dy<=a.radius;dy++)for(let dx=-a.radius;dx<=a.radius;dx++){
    const tile={x:a.center.x+dx,y:a.center.y+dy};
    if(inside(tile)&&getHexOffsetNeighbors(tile.x,tile.y).some(inside))return true;
  }
  return false;
}
function validateSide(state,side,assign=false,travels=true) {
  const bank=tradeBank(state,side),members=tradeMembers(state,side);
  if(!bank)return '取引拠点を選択してください';
  if(travels&&(!members.length||members.some(unit=>!tradeAlive(unit)||(unit.worldId||'surface')!=='surface')))return '地上の生存担当者と取引拠点を選択してください';
  if(!side.center||![side.center.x,side.center.y,side.radius].every(Number.isSafeInteger)||side.center.x<0||side.center.y<0||side.radius<0||side.radius>config.maxRadius)return '待ち合わせマス・範囲が不正です';
  const entries=Object.entries(side.goods||{});
  if(entries.some(([resource,amount])=>!V39_TRADE_RESOURCES.some(row=>row.name===resource)||!Number.isInteger(amount)||amount<1))return '物資と整数の数量を指定してください';
  if(travels&&entries.reduce((sum,[,amount])=>sum+amount,0)>tradeCapacity(members,state))return '1回の取引量が部隊の積載量を超えています';
  if(assign&&travels) {
    if(members.some(unit=>unit.tradeAssignment||unit.transportAssignment||unit.caveDuty||unit.movementHold||unit.isSummoned))return '部隊に他の任務中・その場待機・召喚のメンバーがいます';
    if(side.kind==='player') {
      const faction=state.players.find(row=>row.id===side.partyId).factionState;
      const instructors=new Set([...Object.values(faction.recruitInstructorByTile||{}),...Object.values(faction.recruitInstructorTransfers||{})].map(row=>row.unitId));
      if(members.some(unit=>instructors.has(unit.id)))return '教官任務と取引は兼任できません';
      const ids=new Set(members.map(unit=>unit.id));
      if((faction.squads||[]).some(squad=>squad.unitIds?.some(id=>ids.has(id))&&(resolveV39CargoLoad(squad.cargo)>0||Object.entries(squad.cargoByUnitId||{}).some(([id,cargo])=>ids.has(id)&&resolveV39CargoLoad(cargo)>0))))return '担当部隊の荷物を先に荷下ろししてください';
    }
  }
  return '';
}
function isNpcTradeTurn(state,playerId,context) {
  return context.aiTurn===true&&state.players.find(row=>row.id===playerId)?.isPlayer===false&&state.timeline?.phase==='resolution';
}
export function proposeV39Trade(state,playerId,request,context={}) {
  if((!isNpcTradeTurn(state,playerId,context)&&(state.activePlayerId!==playerId||state.timeline?.phase!=='player'))||(state.activeWorldId||'surface')!=='surface')return failure(state,'地上の操作中プレイヤーから提案してください');
  const sides=(request.sides||[]).map(side=>({kind:side.kind,partyId:side.partyId,settlementId:side.settlementId,unitId:side.unitId,
    center:structuredClone(side.center),radius:side.radius,goods:structuredClone(side.goods||{})}));
  if(sides.length!==2||sides[0].kind!=='player'||sides[0].partyId!==playerId||sides[0].partyId===sides[1].partyId)return failure(state,'相手を選択してください');
  const deliveryMode=request.deliveryMode??'meeting',courier=tradeCourierIndex({deliveryMode});
  if(!['proposer','partner','meeting'].includes(deliveryMode))return failure(state,'使者の配送方式が不正です');
  if(courier>=0){
    const receiver=tradeBank(state,sides[1-courier]);if(!receiver)return failure(state,'受渡拠点がありません');
    sides.forEach(side=>{side.center={x:receiver.x,y:receiver.y};side.radius=1;});sides[1-courier].unitId='';
  }else if(request.deliveryMode==='meeting'){
    sides[1].center=structuredClone(sides[0].center);sides[1].radius=sides[0].radius;
  }
  const dueTurn=n(request.dueTurn),grace=n(request.grace),period=n(request.period),cycles=n(request.cycles);
  const specialtyTurns=request.specialtyTurns??V39_SPECIALTY_BALANCE.tradeLoanTurns;
  if(!Number.isInteger(specialtyTurns)||specialtyTurns<1||specialtyTurns>100)return failure(state,'特産品の貸出期間は1〜100ターンで指定してください');
  if(!Number.isInteger(dueTurn)||dueTurn<=tradeTurn(state)||!Number.isInteger(grace)||grace<3||grace>config.maxGrace||!Number.isInteger(period)||period<0||!Number.isInteger(cycles)||cycles<1||cycles>100)return failure(state,'取引日・猶予・周期・回数が不正です');
  if(period&&period<=grace)return failure(state,'定期取引の周期は猶予より長くしてください');
  if(getHexDistance(sides[0].center||{},sides[1].center||{})>n(sides[0].radius)+n(sides[1].radius))return failure(state,'指定範囲が重なりません');
  for(let i=0;i<2;i++){const reason=validateSide(state,sides[i],true,courier<0||courier===i);if(reason)return failure(state,reason);}
  if(courier<0&&!hasAdjacentMeetingTiles(sides))return failure(state,'共通範囲に双方が停止できる隣接2マスが必要です。許容範囲を広げてください');
  if(!sides.some(side=>Object.keys(side.goods).length))return failure(state,'取引する物資を指定してください');
  if(request.method==='mail'&&Object.keys(sides[1].goods).length)return failure(state,'郵送の受取側は提供数量を0にしてください');
  for(let i=0;i<2;i++)if((courier<0||courier===i)&&Object.values(sides[1-i].goods).reduce((sum,value)=>sum+value,0)>tradeCapacity(tradeMembers(state,sides[i]),state))return failure(state,'受け取る物資が担当部隊の積載量を超えています');
  const firstReserve=Object.fromEntries(Object.entries(sides[0].goods).map(([name,amount])=>[name,tradeReserveAmount(name,amount)]));
  if(Object.entries(firstReserve).some(([name,amount])=>tradeBankAmount(tradeBank(state,sides[0]),name)<amount))return failure(state,'手持ちから次回分の1/3を確保できません');
  const books=listV39Trades(state),sequence=Math.max(0,...books.map(row=>row.sequence))+1;
  const contract={id:`trade-${playerId}-${sequence}`,ownerId:playerId,sequence,status:'proposed',sides,dueTurn,grace,period,cycles:period?cycles:1,completedCycles:0,method:request.method==='mail'?'mail':'exchange',negotiation:request.negotiation==='intimidation'?'intimidation':'normal',createdTurn:tradeTurn(state),history:[]};
  contract.deliveryMode=deliveryMode;
  contract.negotiatorId=request.negotiatorId||request.sides[0].unitId;
  contract.specialtyTurns=specialtyTurns;
  return {ok:true,state:updateV39Trade(state,contract),contract,message:'取引条件を提案しました。相手の承諾待ちです'};
}
export function acceptV39Trade(state,playerId,id,random=Math.random,context={}) {
  const source=listV39Trades(state).find(row=>row.id===id);
  const npcTurn=isNpcTradeTurn(state,playerId,context);
  if(source?.status!=='proposed'||(source.sides[1].kind==='player'?playerId!==source.sides[1].partyId:playerId!==source.ownerId)||(!npcTurn&&state.activePlayerId!==playerId))return failure(state,'この提案を承諾できません');
  if((!npcTurn&&state.timeline?.phase!=='player')||source.dueTurn<=tradeTurn(state))return failure(state,'操作ターンに、未来の取引日で再提案してください');
  const contract=structuredClone(source);let next=state;
  const courier=tradeCourierIndex(contract);
  contract.negotiatorId ||= contract.sides[0].unitId;
  for(let i=0;i<2;i++)if((courier<0||courier===i)&&Object.values(contract.sides[1-i].goods).reduce((sum,value)=>sum+value,0)>tradeCapacity(tradeMembers(state,contract.sides[i]),state))return failure(state,'受け取る物資が現在の部隊積載量を超えています');
  for(const [i,side] of contract.sides.entries()) {
    const travels=courier<0||courier===i,reason=validateSide(next,side,true,travels);if(reason)return failure(state,reason);
    if(!travels)side.unitId='';
    side.memberIds=travels?tradeMembers(next,side).map(unit=>unit.id):[];side.stage='collecting';side.reserved={};
    for(const [resource,amount] of Object.entries(side.goods))side.reserved[resource]=tradeReserveAmount(resource,amount);
    const payment=changeTradeBank(next,side,side.reserved,-1);if(!payment.ok)return failure(state,side.kind==='village'?'相手はこの条件の物資を用意できません':payment.reason);next=payment.state;
  }
  if(contract.sides[1].kind==='village') {
    const terms=[contract.negotiation,contract.method,contract.deliveryMode,contract.specialtyTurns,contract.dueTurn,contract.grace,contract.period,contract.cycles,contract.sides.map(side=>[side.settlementId,[side.center.x,side.center.y],side.radius,Object.entries(side.goods).sort()])];
    const charged=chargeV39Negotiation(state,playerId,contract.negotiatorId,contract.sides[1].partyId,terms,context);if(!charged.ok)return charged;
    state=charged.state;
    next={...next,players:next.players.map(row=>{const paid=state.players.find(p=>p.id===row.id);return row.id!==playerId?row:{...row,factionState:{...row.factionState,units:paid.factionState.units,negotiationAttempts:paid.factionState.negotiationAttempts}};})};
    const village=tradeBank(state,contract.sides[1]),unit=state.players.find(p=>p.id===playerId).factionState.units.find(row=>row.id===contract.negotiatorId);
    const skill=resolveV39NegotiationSkill(state,playerId,unit,contract.negotiation==='intimidation'?'威圧':'交渉');
    const offered=Object.values(contract.sides[0].goods).reduce((a,b)=>a+b,0),requested=Object.values(contract.sides[1].goods).reduce((a,b)=>a+b,0);
    const stockBurden=Object.entries(contract.sides[1].goods).reduce((sum,[name,amount])=>sum+amount/Math.max(1,tradeBankAmount(village,name)),0);
    const burden=requested/Math.max(1,offered)*(contract.cycles>1?Math.max(1,5/contract.period):1)+stockBurden;
    const chance=Math.max(.05,Math.min(.95,config.npcBaseChance+(skill+n(village.relationsByPlayerId?.[playerId]))/config.npcSkillDivisor-burden*config.npcBurdenRate));
    contract.npcChance=chance;
    if(random()>=chance){contract.status='rejected';return {ok:true,state:updateV39Trade(state,contract),message:'村が条件を拒否しました'};}
    if(contract.negotiation==='intimidation')next=updateTradeBank(next,contract.sides[1],{...tradeBank(next,contract.sides[1]),relationsByPlayerId:{...village.relationsByPlayerId,[playerId]:Math.max(-100,n(village.relationsByPlayerId?.[playerId])-10)}});
  }
  contract.status='active';contract.acceptedTurn=tradeTurn(state);contract.acceptedOrder=Math.max(0,...listV39Trades(state).map(row=>n(row.acceptedOrder)))+1;
  for(const side of contract.sides)next=updateTradeUnits(next,side,unit=>side.memberIds.includes(unit.id)?{...unit,tradeAssignment:{contractId:id,automatic:true}}:unit);
  return {ok:true,state:updateV39Trade(next,contract),message:'取引成立 / 次回分の1/3を確保しました'};
}
// 生産・採取の実収入のみから、契約成立順に確保する。通常在庫や維持費からは補填しない。
export function divertV39TradeIncome(state,kind,partyId,settlementId,income,turn) {
  const remaining={...income};let next=state;const reserved={};
  for(const source of listV39Trades(state)) {
    if(source.status!=='active')continue;
    const contract=structuredClone(source);let changed=false;
    for(const side of contract.sides) {
      if(side.kind!==kind||side.partyId!==partyId||kind==='player'&&side.settlementId!==settlementId||side.stage!=='collecting'||side.lastIncomeTurn>=turn)continue;
      for(const [resource,total] of Object.entries(side.goods)) {
        const missing=round(Math.max(0,total-n(side.reserved?.[resource])));
        const target=Math.ceil(missing/Math.max(1,contract.dueTurn-turn+1));
        const amount=round(Math.min(missing,target,Math.max(0,n(remaining[resource]))));
        side.reserved[resource]=round(n(side.reserved[resource])+amount);remaining[resource]=round(Math.max(0,n(remaining[resource])-amount));reserved[resource]=round(n(reserved[resource])+amount);
      }
      side.lastIncomeTurn=turn;changed=true;
    }
    if(changed)next=updateV39Trade(next,contract);
  }
  return {state:next,income:remaining,reserved};
}
export function stopV39Trade(state,playerId,id,cancel=false) {
  const source=listV39Trades(state).find(row=>row.id===id);
  if(!source||!source.sides.some(side=>side.kind==='player'&&side.partyId===playerId)||state.activePlayerId!==playerId||['complete','cancelled','rejected'].includes(source.status))return failure(state,'この取引は操作できません');
  const contract=structuredClone(source);let next=state;
  if(source.status==='proposed'){contract.status='rejected';return {ok:true,state:updateV39Trade(next,contract),message:'提案を取り下げ/拒否しました'};}
  contract.status=cancel?'cancelling':'interrupted';contract.reason=cancel?'中止・未交換の荷物は帰還':'手動中断';contract.resumeApprovals=[];
  for(const side of contract.sides) {
    if(cancel){
      const pendingRights=Object.fromEntries(Object.entries(side.goods).filter(([name])=>V39_TRADE_RESOURCES.find(row=>row.name===name)?.specialty&&!['returning','returned'].includes(side.stage)).map(([name,count])=>[name,Math.max(0,count-n(side.reserved?.[name]))]));
      if(Object.values(side.reserved||{}).some(amount=>amount>0)){const refund=changeTradeBank(next,side,side.reserved,1);if(!refund.ok)return failure(state,'予約物資の返却先を失っています。拠点を回復してから中止してください');next=refund.state;}
      if(Object.values(pendingRights).some(value=>value>0)){const refund=changeTradeBank(next,side,pendingRights,1);if(refund.ok)next=refund.state;}
      const cargo=getTradeCargo(next,side);next=setTradeCargo(next,side,{...cargo,resourcesByType:Object.fromEntries(Object.entries(cargo.resourcesByType).filter(([name])=>!V39_TRADE_RESOURCES.find(row=>row.name===name)?.specialty))});
      side.reserved={};side.stage='returning';
    }
    next=updateTradeUnits(next,side,unit=>side.memberIds.includes(unit.id)?{...unit,tradeAssignment:{contractId:id,automatic:cancel}}:unit);
  }
  return {ok:true,state:updateV39Trade(next,contract),message:cancel?'取引を中止。未積載の予約解除・担当者は引き返します（受領済み分は返却交渉が必要）':'取引を中断しました。再開は双方の確認が必要です'};
}
export function reserveV39TradeFromStock(state,playerId,id,npc=false,random=Math.random,context={}) {
  const source=listV39Trades(state).find(row=>row.id===id);
  if(source?.status!=='active'||(!isNpcTradeTurn(state,playerId,context)&&state.activePlayerId!==playerId))return failure(state,'操作中の取引を選択してください');
  const side=source.sides.find(row=>npc?row.kind==='village'&&source.ownerId===playerId:row.kind==='player'&&row.partyId===playerId);
  if(!side||side.stage!=='collecting')return failure(state,'収入確保中の当事者だけが追加確保できます');
  if(npc){const charged=chargeV39Negotiation(state,playerId,source.negotiatorId||source.sides[0].unitId,side.partyId,['追加確保',source.sides.map(row=>Object.entries(row.goods).sort())],context);if(!charged.ok)return charged;state=charged.state;
    if(random()>=(source.npcChance??config.npcBaseChance))return {ok:true,state,message:'村が備蓄からの追加確保を拒否しました（AP20消費）'};}
  const contract=structuredClone(source),index=source.sides.indexOf(side),target=contract.sides[index];
  const payment=Object.fromEntries(Object.entries(side.goods).map(([name,total])=>[name,Math.max(0,Math.min(total-n(side.reserved[name]),tradeBankAmount(tradeBank(state,side),name)))]));
  if(!Object.values(payment).some(amount=>amount>0))return failure(state,'確保できる手持ち物資がありません');
  const result=changeTradeBank(state,side,payment,-1);if(!result.ok)return result;
  for(const [name,amount] of Object.entries(payment))target.reserved[name]=round(n(target.reserved[name])+amount);
  return {ok:true,state:updateV39Trade(result.state,contract),message:`${npc?'村の備蓄':'手持ち'}から取引用に追加確保しました`};
}
export function resumeV39Trade(state,playerId,id,dueTurn,grace,random=Math.random) {
  const source=listV39Trades(state).find(row=>row.id===id);
  if(source?.status!=='interrupted'||state.activePlayerId!==playerId||!source.sides.some(side=>side.kind==='player'&&side.partyId===playerId))return failure(state,'中断した取引の当事者が操作してください');
  if(!Number.isInteger(dueTurn)||dueTurn<=tradeTurn(state)||!Number.isInteger(grace)||grace<3||grace>config.maxGrace)return failure(state,'次回の取引日と猶予を指定してください');
  const contract=structuredClone(source),changed=contract.dueTurn!==dueTurn||contract.grace!==grace;
  if(changed)contract.resumeApprovals=[];
  contract.dueTurn=dueTurn;contract.grace=grace;contract.resumeApprovals=[...new Set([...(contract.resumeApprovals||[]),playerId])];
  const participants=contract.sides.filter(side=>side.kind==='player').map(side=>side.partyId);
  if(contract.sides.some(side=>tradeMembers(state,side).length!==side.memberIds.length||tradeMembers(state,side).some(unit=>!tradeAlive(unit))))return failure(state,'担当者が失われています。中止・荷物回収後に新しい担当者で再提案してください');
  if(participants.every(id=>contract.resumeApprovals.includes(id))){
    const npc=contract.sides.find(side=>side.kind==='village');
    if(npc){const charged=chargeV39Negotiation(state,playerId,contract.negotiatorId||contract.sides[0].unitId,npc.partyId,['再開',dueTurn,grace,contract.sides.map(row=>Object.entries(row.goods).sort())]);if(!charged.ok)return charged;state=charged.state;
      if(random()>=(contract.npcChance??config.npcBaseChance))return {ok:true,state,message:'村が再開条件を拒否しました（AP20消費）'};}
    if(contract.needsCycleReserve){let funded=state;const reserves=[];
      for(const side of contract.sides){const reserved=Object.fromEntries(Object.entries(side.goods).map(([name,amount])=>[name,tradeReserveAmount(name,amount)]));
        const payment=changeTradeBank(funded,side,reserved,-1);if(!payment.ok)return failure(state,payment.reason);funded=payment.state;reserves.push(reserved);}
      state=funded;contract.sides.forEach((side,i)=>{side.reserved=reserves[i];side.stage='collecting';});contract.needsCycleReserve=false;
    }
    contract.status='active';contract.reason='';
    for(const side of contract.sides)state=updateTradeUnits(state,side,unit=>side.memberIds.includes(unit.id)?{...unit,tradeAssignment:{contractId:id,automatic:true}}:unit);
  }
  return {ok:true,state:updateV39Trade(state,contract),message:contract.status==='active'?'取引を手動再開しました':'再開条件を提示しました。相手の確認待ちです'};
}
