import {listV39Trades,tradeUnits} from './v39-trade-state.js';

// Participation is required even in debug visibility mode. Intelligence rules are not defined yet.
export function getV39VisibleTradeLogistics(state,viewerId) {
  return listV39Trades(state).filter(contract=>contract.sides.some(side=>side.kind==='player'&&side.partyId===viewerId))
    .flatMap(contract=>contract.sides.filter(side=>side.kind==='player').flatMap(side=>{
      const unit=tradeUnits(state,side).find(u=>u.id===side.unitId);
      if(!unit||unit.tradeAssignment?.contractId!==contract.id)return [];
      return [{contract,side,unit,ownerPlayerId:side.partyId,foreign:side.partyId!==viewerId}];
    }));
}
