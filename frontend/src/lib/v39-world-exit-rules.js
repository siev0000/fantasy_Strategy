import {getHexNeighborCoords} from './hex-grid.js';
import {canUnitEnterV39Tile} from './v39-terrain-traversal.js';

const living=unit=>unit&&unit.state!=='死亡'&&Number(unit.hp??unit.currentHp)>0;
const worldOf=unit=>unit.worldId||'surface';

// Resolve only after enemy actions and world effects have finished for the requested turn.
export function advanceV39WorldExits(state,worlds,turn){
  let players=state.players,viewWorldId=null;
  const notices=[],requests=new Map();
  for(const player of players)for(const unit of player.factionState.units){
    const request=unit.pendingWorldExit;
    if(request&&turn>=request.readyTurn)requests.set(`${player.id}:${request.actorId}`,{playerId:player.id,request});
  }
  for(const {playerId,request} of requests.values()){
    const player=players.find(row=>row.id===playerId),faction=player.factionState;
    const actor=faction.units.find(unit=>unit.id===request.actorId);
    const members=faction.units.filter(unit=>unit.pendingWorldExit?.actorId===request.actorId&&unit.pendingWorldExit?.worldId===request.worldId);
    const outgoing=members.filter(unit=>living(unit)&&worldOf(unit)===request.worldId);
    const destination=worlds[request.destination],source=worlds[request.worldId];
    let reason='';
    if(!living(actor)||worldOf(actor)!==request.worldId||actor.x!==request.x||actor.y!==request.y)reason='先頭が出口にいないため退出を中止';
    else if(!source?.map?.hegemonyInterior||!destination?.map)reason='移動先がないため退出を中止';
    const positions=new Map();
    if(!reason){
      const occupied=new Set([...players.flatMap(row=>row.factionState.units).filter(unit=>living(unit)&&worldOf(unit)===request.destination),
        ...(destination.spatial?.enemies||[]).filter(living)].map(unit=>`${unit.x},${unit.y}`));
      const queue=[request.anchor],seen=new Set([`${request.anchor.x},${request.anchor.y}`]);
      for(const unit of [...outgoing].sort((a,b)=>Number(b.id===actor.id)-Number(a.id===actor.id))){
        for(let i=0;i<queue.length;i++)for(const next of getHexNeighborCoords(destination.map.w,destination.map.h,queue[i].x,queue[i].y)){
          if(seen.has(next.key)||destination.map.grid?.[next.y]?.[next.x]==='岩壁')continue;
          seen.add(next.key);queue.push(next);
        }
        const point=queue.find(tile=>!occupied.has(`${tile.x},${tile.y}`)&&canUnitEnterV39Tile(destination.map,tile.x,tile.y,unit));
        if(!point){reason='地上の出口が塞がれているため退出を中止';break;}
        positions.set(unit.id,point);occupied.add(`${point.x},${point.y}`);
      }
    }
    players=players.map(row=>row.id!==playerId?row:{...row,factionState:{...row.factionState,units:row.factionState.units.map(unit=>{
      if(!members.some(member=>member.id===unit.id))return unit;
      const next={...unit,pendingWorldExit:null},position=!reason&&positions.get(unit.id);
      return position?{...next,worldId:request.destination,x:position.x,y:position.y,position:[position.x,position.y],
        locationsByWorld:{...unit.locationsByWorld,[request.worldId]:{x:unit.x,y:unit.y}}}:next;
    })}});
    if(!reason&&state.activeWorldId===request.worldId&&state.activePlayerId===playerId&&positions.has(faction.selectedUnitId))viewWorldId=request.destination;
    notices.push({playerId,message:reason||`出口で${request.readyTurn-request.startedTurn}ターン待機し、地上へ戻りました。`});
  }
  return {players,viewWorldId,notices};
}
