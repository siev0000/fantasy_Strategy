import {getHexNeighborCoords} from './hex-grid.js';
import {collectV39FactionVision} from './v39-faction-intelligence-rules.js';
import {resolveV39AutomaticRoute} from './v39-transport-rules.js';
import {resolveV39UnitMovementStepCost} from './v39-terrain-traversal.js';
import {resolveV39SquadMovementGroup,applyV39SquadMovement} from './v39-squad-movement-rules.js';
import {applyV39DisasterMovementDamage} from './v39-disaster-damage.js';
import balance from '../../../config/v39-npc-faction-ai.json';

const key=tile=>`${tile.x},${tile.y}`;
export function rememberV39ResourceTeamVision(state,playerId,map){
  const vision=collectV39FactionVision(state,playerId,map).visible;
  return {...state,players:state.players.map(player=>player.id!==playerId?player:{...player,factionState:{...player.factionState,
    visibility:{...player.factionState.visibility,visibleTileKeys:[...vision],
      exploredTileKeys:[...new Set([...(player.factionState.visibility?.exploredTileKeys||[]),...vision])]}}})};
}
export function moveV39ResourceTeam(state,playerId,actorId,objective,map){
  const player=state.players.find(row=>row.id===playerId),actor=player.factionState.units.find(unit=>unit.id===actorId);
  const group=resolveV39SquadMovementGroup(player.factionState,actorId);
  if(!group.ok||group.moveAp<=0||!actor)return null;
  const ids=new Set(group.participantIds);
  const blocked=new Set([...(state.players||[]).flatMap(row=>row.factionState.units||[]),...(state.enemies||[]),
    ...(state.neutralVillages||[]).flatMap(row=>row.defenseUnits||[])].filter(unit=>!ids.has(unit.id)&&Number(unit.hp??unit.currentHp)>0
      &&(unit.worldId||'surface')==='surface').map(key));
  const positions=target=>group.participants.map((unit,index)=>({id:unit.id,x:index?group.participants[index-1].x:target.x,y:index?group.participants[index-1].y:target.y}));
  const costFor=target=>{
    const next=positions(target);
    if(new Set(next.map(key)).size!==next.length||next.some(tile=>blocked.has(key(tile))))return Infinity;
    return Math.max(...group.participants.map(unit=>{const to=next.find(row=>row.id===unit.id);
      return resolveV39UnitMovementStepCost(map,unit.x,unit.y,to.x,to.y,unit);}));
  };
  let target;
  if(objective.type==='resource-team-search'){
    const explored=new Set(player.factionState.visibility?.exploredTileKeys||[]),queue=[{x:group.x,y:group.y,first:null}],seen=new Set([key(group)]);
    for(let index=0;index<queue.length&&index<balance.scouting.searchNodeLimit&&!target;index++){
      const current=queue[index];
      for(const tile of getHexNeighborCoords(map.w,map.h,current.x,current.y,map.worldWrapEnabled===true)){
        if(seen.has(tile.key)||blocked.has(tile.key))continue;
        seen.add(tile.key);
        const cost=resolveV39UnitMovementStepCost(map,current.x,current.y,tile.x,tile.y,actor);
        if(!Number.isFinite(cost))continue;
        const first=current.first||tile;
        if(!current.first&&costFor(first)>group.moveAp)continue;
        if(!explored.has(tile.key)){target=first;break;}
        queue.push({...tile,first});
      }
    }
  }else{
    if(group.x===objective.x&&group.y===objective.y)return null;
    target=resolveV39AutomaticRoute(state,map,playerId,actor,objective,map.worldWrapEnabled===true,group.participantIds)?.[0];
  }
  if(!target)return null;
  const cost=costFor(target);
  if(!Number.isFinite(cost)||cost>group.moveAp)return null;
  const moved=applyV39SquadMovement(player.factionState,group,{...target,positions:positions(target)},cost,state);
  if(!moved.ok)return null;
  const faction={...moved.faction,units:moved.faction.units.map(unit=>ids.has(unit.id)?applyV39DisasterMovementDamage(unit,[{x:unit.x,y:unit.y}],state,state.timeline?.turnNumber).unit:unit)};
  return rememberV39ResourceTeamVision({...state,players:state.players.map(row=>row.id===playerId?{...row,factionState:faction}:row)},playerId,map);
}
