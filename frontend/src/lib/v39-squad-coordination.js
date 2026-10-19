import {V39_SQUAD_MOVEMENT_BALANCE as balance} from './v39-gameplay-balance.js';
import {getHexDistance,getHexNeighborCoords} from './hex-grid.js';
import {territorySettlementId} from './settlement-state.js';
import {resolveV39AutomaticRoute,resolveV39AutomaticMovementSteps} from './v39-transport-rules.js';
import {canUnitEnterV39Tile,resolveV39UnitMovementStepCost} from './v39-terrain-traversal.js';
import {applyV39DisasterMovementDamage} from './v39-disaster-damage.js';

const world=unit=>unit?.worldId || 'surface';
const alive=unit=>unit&&Number(unit.hp??unit.currentHp)>0&&unit.state!=='死亡';
const key=tile=>`${tile.x},${tile.y}`;
const solo=id=>!id||id==='solo'||id==='単独';
export const v39SquadMoveMode=unit=>['independent','gather'].includes(unit?.squadMoveMode)?unit.squadMoveMode:'follow';
export const v39SquadMoveLabel=unit=>v39SquadMoveMode(unit)==='independent'?'単独行動':v39SquadMoveMode(unit)==='gather'?'集合中':'追従';
export function v39SquadAutomaticDuty(faction,unit) {
  return !!(unit.tradeAssignment||unit.transportAssignment||unit.caveDuty)
    || [...Object.values(faction.recruitInstructorByTile||{}),...Object.values(faction.recruitInstructorTransfers||{})].some(row=>row.unitId===unit.id);
}
function distance(a,b,map) {
  if(!map?.worldWrapEnabled||map.isUnderground)return getHexDistance(a,b);
  return Math.min(...[-1,0,1].flatMap(dx=>[-1,0,1].map(dy=>getHexDistance(a,{x:b.x+dx*map.w,y:b.y+dy*map.h}))));
}
export function inspectV39SquadAssembly(state,playerId,members,map) {
  if(!members.length)return {ok:false,reason:'メンバーを選んでください'};
  if(members.some(unit=>!Number.isInteger(unit?.x)||!Number.isInteger(unit?.y)))return {ok:false,reason:'位置が確定していないユニットとは編制できません'};
  const currentWorld=state.activeWorldId||'surface';
  if(members.some(unit=>world(unit)!==currentWorld))return {ok:false,reason:'別マップのユニットとは編制できません'};
  const faction=state.players.find(player=>player.id===playerId)?.factionState;
  for(const settlement of faction?.settlements||[]) {
    if(!settlement.placed||!Number.isInteger(settlement.x)||!Number.isInteger(settlement.y)||world(settlement)!==currentWorld||settlement.ownerPlayerId&&settlement.ownerPlayerId!==playerId)continue;
    const center=key(settlement),id=settlement.settlementId||settlement.id;
    const tiles=[settlement,...Object.entries(state.territoryOwnerByTile||{}).filter(([tile,owner])=>owner===playerId
      && (territorySettlementId(state.territoryStateByTile?.[tile])===id||settlement.territoryResidentialCenterMap?.[tile]===center))
      .map(([tile])=>{const [x,y]=tile.split(',').map(Number);return {x,y};})];
    if(members.every(unit=>tiles.some(tile=>distance(unit,tile,map)<=balance.assemblyBorderRadius)))
      return {ok:true,settlementId:id,label:`${settlement.name||settlement.type||'拠点'}周辺`};
  }
  const connected=new Set([members[0].id]);
  for(let pass=0;pass<members.length;pass++)for(const unit of members)
    if(members.some(other=>connected.has(other.id)&&distance(other,unit,map)<=1))connected.add(unit.id);
  if(connected.size===members.length)return {ok:true,label:'現地（隣接）'};
  return {ok:false,reason:`同じ拠点の領土内＋周囲${balance.assemblyBorderRadius}マス、または互いに隣接する場所へ集めてください`};
}

export function orderV39SquadMovement(state,playerId,squadId,action,unitId='',point=null) {
  const fail=reason=>({ok:false,state,reason});
  if(state.activePlayerId!==playerId||state.timeline?.phase!=='player')return fail('操作ターンに指定してください');
  const player=state.players.find(row=>row.id===playerId),faction=player?.factionState;
  const squad=faction?.squads.find(row=>row.id===squadId&&!solo(row.id));
  if(!squad)return fail('部隊が見つかりません');
  if(!['independent','follow','scatter','gather','cancel'].includes(action))return fail('不明な部隊操作です');
  const members=faction.units.filter(unit=>squad.unitIds.includes(unit.id)&&alive(unit)&&world(unit)===(state.activeWorldId||'surface'));
  const eligible=members.filter(unit=>!v39SquadAutomaticDuty(faction,unit));
  const leader=eligible.find(unit=>unit.id===squad.movementLeaderId)||eligible[0];
  if(!leader)return fail('操作できるメンバーがいません');
  if(['independent','follow'].includes(action)&&!eligible.some(unit=>unit.id===unitId))return fail('このメンバーは操作できません');
  if(point&&(!Number.isInteger(point.x)||!Number.isInteger(point.y)))return fail('集合先が不正です');
  const target=point||{x:leader.x,y:leader.y};
  const units=faction.units.map(unit=>{
    if(!eligible.some(row=>row.id===unit.id))return unit;
    if(action==='independent'&&unit.id===unitId||action==='scatter'||action==='cancel'&&v39SquadMoveMode(unit)==='gather')
      return {...unit,squadMoveMode:'independent',squadGather:null};
    if(action==='gather'||action==='follow'&&unit.id===unitId)
      return {...unit,squadMoveMode:'gather',squadGather:{status:'moving',reason:'',lastProcessedTurn:0},movementHold:false};
    return unit;
  });
  const squads=faction.squads.map(row=>row.id===squadId?{...row,
    rallyPoint:action==='gather'?{...target,worldId:state.activeWorldId||'surface'}:action==='scatter'||action==='cancel'?null:row.rallyPoint}:row);
  return {ok:true,state:{...state,players:state.players.map(row=>row.id===playerId?{...row,factionState:{...faction,units,squads}}:row)}};
}

export function advanceV39SquadRallies(state,playerId,map,turn,{move=true}={}) {
  const player=state.players.find(row=>row.id===playerId),faction=player?.factionState;
  if(!faction||!map?.grid?.length)return {state,paths:[]};
  const currentWorld=state.activeWorldId||'surface',paths=[];
  let units=[...faction.units],changed=false;
  for(const squad of faction.squads.filter(row=>!solo(row.id))) {
    const members=units.filter(unit=>squad.unitIds.includes(unit.id)&&alive(unit)&&world(unit)===currentWorld&&!v39SquadAutomaticDuty(faction,unit));
    if(!members.some(unit=>v39SquadMoveMode(unit)==='gather'))continue;
    const leader=members.find(unit=>unit.id===squad.movementLeaderId&&v39SquadMoveMode(unit)!=='independent')||members.find(unit=>v39SquadMoveMode(unit)==='follow')||members.find(unit=>v39SquadMoveMode(unit)==='gather');
    const target=squad.rallyPoint?.worldId===currentWorld?squad.rallyPoint:leader;
    let radius=Math.min(balance.rallyMaximumRadius,balance.rallyRadius);
    while(1+3*radius*(radius+1)<members.length&&radius<balance.rallyMaximumRadius)radius++;
    const slots=[],queue=[{x:target.x,y:target.y,depth:0}],visited=new Set();
    for(let cursor=0;cursor<queue.length;cursor++) {
      const tile=queue[cursor];if(visited.has(key(tile)))continue;visited.add(key(tile));slots.push(tile);
      if(tile.depth<radius)for(const next of getHexNeighborCoords(map.w,map.h,tile.x,tile.y,!map.isUnderground&&map.worldWrapEnabled===true))queue.push({...next,depth:tile.depth+1});
    }
    for(const raw of members) {
      let unit=units.find(row=>row.id===raw.id);if(v39SquadMoveMode(unit)!=='gather')continue;
      const gather=unit.squadGather||{},ap=Math.max(0,Number(unit.ap??unit.currentAp??100));
      const occupied=new Set([...(state.players||[]).flatMap(row=>(row.id===playerId?units:row.factionState.units).filter(other=>world(other)===currentWorld)),...(state.enemies||[]),
        ...(state.neutralVillages||[]).flatMap(row=>row.defenseUnits||[])].filter(row=>row.id!==unit.id&&alive(row)).map(key));
      if(map.caveEventNpc)occupied.add(key(map.caveEventNpc));
      const accessible=new Set([key(target)]);
      for(let pass=0;pass<radius;pass++)for(const tile of slots)if(accessible.has(key(tile)))
        for(const next of getHexNeighborCoords(map.w,map.h,tile.x,tile.y,!map.isUnderground&&map.worldWrapEnabled===true))
          if(slots.some(slot=>key(slot)===key(next))&&Number.isFinite(resolveV39UnitMovementStepCost(map,tile.x,tile.y,next.x,next.y,unit)))accessible.add(key(next));
      const availableSlots=slots.filter(tile=>accessible.has(key(tile)));
      if(availableSlots.some(tile=>key(tile)===key(unit))&&!occupied.has(key(unit))) {
        units=units.map(row=>row.id===unit.id?{...unit,squadMoveMode:'follow',squadGather:null}:row);changed=true;continue;
      }
      if(!move)continue;
      const casting=!!faction.combatRuntime?.pendingActionsByUnitId?.[unit.id];
      const waiting=Number(unit.waitTurnNumber)===Number(turn)||unit.movementHold||casting;
      const engaged=(state.enemies||[]).some(enemy=>alive(enemy)&&distance(unit,enemy,map)<=1);
      let reason=waiting?casting?'詠唱・待機行動中です':'待機中です':engaged?'敵が隣接しています':ap<=0?'移動AP待ち':'';
      let best=null;
      if(!reason&&gather.lastProcessedTurn!==turn) {
        const scoped={...state,players:state.players.map(row=>row.id===playerId?{...row,factionState:{...faction,units}}:row),
          enemies:[...(state.enemies||[]),...(map.caveEventNpc?[{...map.caveEventNpc,id:'squad-rally-npc',hp:1}]:[])]};
        // 既存の複数到着マス対応を使い、空きスロットごとの全マップ探索を避ける。
        const candidates=availableSlots.filter(tile=>!occupied.has(key(tile))&&canUnitEnterV39Tile(map,tile.x,tile.y,unit));
        if(candidates.length)best=resolveV39AutomaticRoute(scoped,map,playerId,unit,{...candidates[0],
          territoryResidentialCenterMap:Object.fromEntries(candidates.slice(1).map(tile=>[key(tile),key(candidates[0])]))},!map.isUnderground&&map.worldWrapEnabled===true);
        if(!best)reason='集合先への経路または空きマスがありません';
      } else if(!reason)continue;
      const steps=best?resolveV39AutomaticMovementSteps(best,ap):[];
      const spent=steps.reduce((sum,step)=>sum+step.stepCost,0),end=steps.at(-1)||unit;
      const ready=steps.length&&availableSlots.some(tile=>key(tile)===key(end));
      const next=applyV39DisasterMovementDamage({...unit,ap:ap-spent,currentAp:ap-spent,actionPoint:ap-spent,
        ...(steps.length?{lastActionTurn:turn}:{}),squadMoveMode:ready?'follow':'gather',
        squadGather:ready?null:{status:reason&&reason!=='移動AP待ち'?'blocked':'waiting-ap',reason:reason||'移動AP待ち',lastProcessedTurn:turn}},steps,state,turn).unit;
      units=units.map(row=>row.id===unit.id?next:row);changed=true;
      if(steps.length)paths.push({unitId:unit.id,positions:[{id:unit.id,x:unit.x,y:unit.y},...steps.map(step=>({id:unit.id,x:step.x,y:step.y}))],apCost:spent});
    }
  }
  const squads=faction.squads.map(squad=>squad.rallyPoint?.worldId===currentWorld&&!units.some(unit=>squad.unitIds.includes(unit.id)&&v39SquadMoveMode(unit)==='gather'&&world(unit)===currentWorld)?{...squad,rallyPoint:null}:squad);
  changed ||= squads.some((squad,index)=>squad!==faction.squads[index]);
  return {state:changed?{...state,players:state.players.map(row=>row.id===playerId?{...row,factionState:{...faction,units,squads}}:row)}:state,paths};
}
