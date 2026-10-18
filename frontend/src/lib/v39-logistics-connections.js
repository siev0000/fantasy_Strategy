import {logisticsEndpoints} from './v39-logistics-routes.js';
import {resolveV39MineRoute} from './v39-cave-operations.js';
import {tradeBank} from './v39-trade-state.js';
import {v39HexRay} from './v39-combat-ray.js';
import display from '../../../config/v39-logistics-display.json';

// A connection shows the fixed goods flow, not the courier's walking path.
export function resolveV39LogisticsConnection(state,row,playerId=state.activePlayerId) {
  const ends=logisticsEndpoints(state,playerId),view=state.activeWorldId||'surface';
  let source,destination;
  if(row.kind==='trade') {
    if(!Object.values(row.side.goods||{}).some(n=>Number(n)>0))return null;
    const peer=row.contract.sides.find(side=>side.partyId!==row.side.partyId||side.kind!==row.side.kind);
    source=tradeBank(state,row.side);destination=peer&&tradeBank(state,peer);
    if(source)source={...source,worldId:'surface'};
    if(destination)destination={...destination,worldId:'surface'};
  } else {
    const duty=row.unit?.caveDuty||row.unit?.transportAssignment;
    const sourceId=row.kind==='route'?row.sourceId:row.unit?.caveDuty?`mine:${duty.mineWorldId}`:`settlement:${duty?.originSettlementId}`;
    const destinationId=row.kind==='route'?row.destinationId:`settlement:${duty?.settlementId||duty?.destinationSettlementId}`;
    source=ends.find(e=>e.id===sourceId);destination=ends.find(e=>e.id===destinationId);
  }
  if(!source||!destination)return null;
  const underground=[source,destination].find(e=>e.worldId!=='surface');
  const chain=underground&&resolveV39MineRoute(state.explorationWorlds,underground.worldId);
  const index=chain?.findIndex(e=>e.id===view);
  const anchor=endpoint=>{
    if(endpoint.worldId===view)return endpoint;
    if(index===undefined||index<0)return null;
    return endpoint.worldId==='surface'?chain[index].backward:chain[index].forward;
  };
  const origin=anchor(source),target=anchor(destination),map=state.explorationWorlds?.[view]?.map;
  if(!map||![origin,target].every(p=>Number.isInteger(p?.x)&&Number.isInteger(p?.y)&&map.grid?.[p.y]?.[p.x]))return null;
  return {origin,target,source,destination,projected:view==='surface'&&source.worldId!=='surface',
    path:v39HexRay({...map,worldWrapEnabled:false},origin,target),laneOffset:row.kind==='trade'?display.tradeLaneOffset:0};
}
