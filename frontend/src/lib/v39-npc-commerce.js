import balance from '../../../config/v39-npc-faction-ai.json';
import {getSelectedSettlement} from './settlement-state.js';
import {getHexDistance} from './hex-grid.js';
import {collectV39FactionVision} from './v39-faction-intelligence-rules.js';
import {listV39NeutralVillageQuests} from './v39-neutral-village-rules.js';
import {listV39Trades,proposeV39Trade,acceptV39Trade,reserveV39TradeFromStock,tradeCapacity,tradeMembers,tradeBankAmount,V39_TRADE_RESOURCES} from './v39-trade-state.js';
import {advanceV39TradeLogistics} from './v39-trade-logistics.js';
import {getV39NpcResourceUnitIds,getV39NpcUnitCargo} from './v39-npc-resource-teams.js';
import {isV39CargoEmpty} from './v39-logistics-state.js';
import {getV39SquadMemberRestriction} from './v39-squad-edit-rules.js';
import {getV39KnownTradeResources} from './v39-trade-resource-availability.js';
import {inspectV39NeutralVillageEconomy} from './v39-economy-rules.js';

const n=value=>Number(value)||0;
const playerOf=(state,id)=>state.players.find(row=>row.id===id);
const remember=(state,id,patch)=>({...state,players:state.players.map(row=>row.id!==id?row:{...row,factionState:{...row.factionState,
  aiState:{...row.factionState.aiState,...patch}}})});

// Gifts are physical mail, not automatic quest completion: a village can use the delivered stock in its plan.
export function advanceV39NpcCommerce(source,playerId,map,turn,development,random=Math.random){
  let state=source,player=playerOf(state,playerId);const commands=[],cfg=balance.commerce,context={aiTurn:true,turnNumber:turn};
  if(player?.isPlayer!==false||(state.activeWorldId||'surface')!=='surface')return {state,commands};
  const active=listV39Trades(state).filter(row=>row.ownerId===playerId&&row.status==='active');
  for(const contract of active){
    for(const npc of [false,true]){
      const side=contract.sides[npc?1:0];
      if(side.stage!=='collecting'||!Object.entries(side.goods).some(([name,total])=>n(side.reserved[name])<total))continue;
      const owner=playerOf(state,playerId),base=owner.factionState.settlements.find(row=>(row.settlementId||row.id)===contract.sides[0].settlementId);
      const reserves=development.supplyBudgetBySettlement?.[contract.sides[0].settlementId]||{};
      if(!npc&&Object.entries(side.goods).some(([name,total])=>total-n(side.reserved[name])>tradeBankAmount(base,name)-n(reserves[name])))continue;
      const reserved=reserveV39TradeFromStock(state,playerId,contract.id,npc,random,context);
      if(reserved.ok){state=reserved.state;commands.push(`取引確保:${reserved.message}`);}
    }
  }
  const moving=advanceV39TradeLogistics(state,playerId,map,turn);
  state=moving.state;commands.push(...moving.reports.map(row=>`村取引:${row.message}`));player=playerOf(state,playerId);
  if(!cfg.enabled)return {state,commands};
  if(active.length>=cfg.maxActive||listV39Trades(state).some(row=>row.ownerId===playerId&&['interrupted','cancelling'].includes(row.status)))return {state,commands};
  if(player.factionState.aiState?.lastCommerceTurn&&turn<n(player.factionState.aiState.lastCommerceTurn)+cfg.cooldownTurns)return {state,commands};
  const base=getSelectedSettlement(player.factionState);if(!base?.placed)return {state,commands};
  const settlementId=base.settlementId||base.id,reserve=development.supplyBudgetBySettlement?.[settlementId]||{};
  const surplus=name=>Math.floor(Math.max(0,tradeBankAmount(base,name)-n(reserve[name])));
  const known=getV39KnownTradeResources(state,playerId);
  const resources=V39_TRADE_RESOURCES.filter(row=>known.has(row.name)&&!row.specialty&&!['魂','死体'].includes(row.name));
  const workers=getV39NpcResourceUnitIds(player);
  const actor=player.factionState.units.find(unit=>n(unit.hp??unit.currentHp)>0&&(unit.worldId||'surface')==='surface'
    &&!unit.movementHold&&!unit.surveyTask&&!player.factionState.aiState?.growthPlan?.busyIds?.includes(unit.id)&&!workers.has(unit.id)&&n(unit.ap??unit.currentAp)>=20
    &&!getV39SquadMemberRestriction(player.factionState,unit,'surface')&&isV39CargoEmpty(getV39NpcUnitCargo(player,unit)));
  if(!actor)return {state,commands};
  const own={kind:'player',partyId:playerId,settlementId,unitId:actor.id,center:{x:base.x,y:base.y},radius:1,goods:{}};
  const capacity=Math.floor(tradeCapacity(tradeMembers(state,own),state));if(capacity<1)return {state,commands};
  const visible=collectV39FactionVision(state,playerId,map).visible;
  const villages=(state.neutralVillages||[]).filter(village=>!village.abandoned&&!village.vassalPlayerId
    &&!village.hostilePlayerIds?.includes(playerId)&&n(village.relationsByPlayerId?.[playerId])>=cfg.minimumRelation
    &&(village.contactedByPlayerIds?.includes(playerId)||visible.has(`${village.x},${village.y}`)))
    .sort((a,b)=>getHexDistance(actor,a)-getHexDistance(actor,b)||a.id.localeCompare(b.id));
  for(const village of villages){
    const wants=development.resourceGoals.filter(goal=>goal.settlementId===settlementId&&goal.missing>0)
      .sort((a,b)=>n(b.priority)-n(a.priority)||b.missing-a.missing);
    // Never buy the village's last food or the resource it is itself requesting.
    const delivery=listV39NeutralVillageQuests(state,playerId,village.id,map).filter(row=>row.type==='delivery');
    const economy=inspectV39NeutralVillageEconomy(village,map,state);
    const villageSurplus=name=>Math.max(0,tradeBankAmount(village,name)-n(economy.maintenance[name])*balance.resourceTeams.stockReserveTurns);
    const requested=wants.find(goal=>resources.some(row=>row.name===goal.name)&&villageSurplus(goal.name)>=2
      &&!delivery.some(quest=>quest.resourceKey===goal.name));
    const offer=resources.filter(row=>row.name!==requested?.name&&surplus(row.name)>0)
      .sort((a,b)=>surplus(b.name)-surplus(a.name)||a.name.localeCompare(b.name))[0];
    let goods={},incoming={};
    if(requested&&offer){
      const quantity=Math.floor(Math.min(cfg.maxQuantity,capacity,requested.missing,villageSurplus(requested.name)/2,surplus(offer.name)));
      if(quantity>0){goods={[offer.name]:quantity};incoming={[requested.name]:quantity};}
    }else{
      const need=delivery.find(quest=>surplus(quest.resourceKey)>0);
      if(need){const quantity=Math.floor(Math.min(cfg.maxQuantity,capacity,n(need.required)-n(need.progress),surplus(need.resourceKey)));if(quantity>0)goods={[need.resourceKey]:quantity};}
    }
    if(!Object.keys(goods).length)continue;
    const proposal=proposeV39Trade(state,playerId,{deliveryMode:'proposer',method:Object.keys(incoming).length?'exchange':'mail',
      sides:[{...own,goods},{kind:'village',partyId:village.id,unitId:'',center:{x:village.x,y:village.y},radius:1,goods:incoming}],
      dueTurn:turn+Math.max(2,Math.ceil((getHexDistance(actor,base)+getHexDistance(base,village))/2)),grace:cfg.graceTurns,period:0,cycles:1},context);
    if(!proposal.ok)continue;
    const accepted=acceptV39Trade(proposal.state,playerId,proposal.contract.id,random,context);
    if(!accepted.ok)continue;
    state=remember(accepted.state,playerId,{lastCommerceTurn:turn});
    commands.push(`${Object.keys(incoming).length?'村と物資取引':'村へ物資支援'}:${village.name} / ${Object.entries(goods).map(([key,value])=>`${key}${value}`).join('・')} / ${accepted.message}`);
    break;
  }
  return {state,commands};
}
