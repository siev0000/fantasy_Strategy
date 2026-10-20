import {V39_CORPSE_LIFETIME_BALANCE} from './v39-gameplay-balance.js';
import {resolveV39CorpseKind} from './v39-corpse-types.js';

export function resolveV39CorpseLifetimeTurns(unit) {
  return Math.max(1, Math.floor(resolveV39CorpseKind(unit)==='remains'
    ? V39_CORPSE_LIFETIME_BALANCE.remainsTurns : V39_CORPSE_LIFETIME_BALANCE.organicTurns));
}

export function resolveV39CorpseExpiry(unit, turn) {
  const duration=resolveV39CorpseLifetimeTurns(unit);
  const died=Math.max(1, Number(unit.diedAtTurn || unit.deathTurn) || turn);
  const deadline=Number(unit.deadExpireTurn);
  // Stored/released bodies retain their unspent lifetime; migrate older field bodies once.
  if(unit.corpseLifetimeVersion===1 && deadline>0)return deadline;
  return deadline>0 ? Math.min(deadline,died+duration) : died+duration;
}

export function normalizeV39CorpseResourceBatches(loot) {
  const amount=Math.max(0,Number(loot?.cargo?.resourcesByType?.死体)||0);
  const batches=(Array.isArray(loot?.corpseResourceBatches)?loot.corpseResourceBatches:[])
    .filter(row=>Number(row.amount)>0).map(row=>({amount:Number(row.amount),
      expiresAtTurn:Number(row.expiresAtTurn)>0?Number(row.expiresAtTurn):null}));
  let difference=batches.reduce((sum,row)=>sum+row.amount,0)-amount;
  // Consumption removes the oldest batch first; additions never refresh older bodies.
  for(const row of batches){const take=Math.min(row.amount,Math.max(0,difference));row.amount-=take;difference-=take;}
  if(difference<0)batches.push({amount:-difference,expiresAtTurn:null});
  return batches.filter(row=>row.amount>0);
}

export function expireV39GroundCorpses(groundLootByTile, turn) {
  const next={};let changed=false,expiredAmount=0;
  for(const [key,loot] of Object.entries(groundLootByTile || {})){
    const batches=normalizeV39CorpseResourceBatches(loot).map(row=>({...row,
      expiresAtTurn:row.expiresAtTurn ?? turn+V39_CORPSE_LIFETIME_BALANCE.organicTurns}));
    const retained=batches.filter(row=>row.expiresAtTurn>turn);
    const amount=retained.reduce((sum,row)=>sum+row.amount,0);
    const oldAmount=Number(loot.cargo?.resourcesByType?.死体)||0;
    expiredAmount+=oldAmount-amount;
    if(JSON.stringify(loot.corpseResourceBatches || [])!==JSON.stringify(retained)||amount!==oldAmount)changed=true;
    const resourcesByType={...loot.cargo?.resourcesByType};
    if(amount>0)resourcesByType.死体=amount;else delete resourcesByType.死体;
    if(Object.keys(resourcesByType).length || loot.cargo?.equipmentInventory?.length){
      next[key]={...loot,corpseResourceBatches:retained,cargo:{...loot.cargo,resourcesByType}};
    }else changed=true;
  }
  return {groundLootByTile:next,changed,expiredAmount};
}
