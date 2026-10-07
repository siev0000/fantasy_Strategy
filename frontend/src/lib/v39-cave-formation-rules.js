import { getHexDistance, getHexNeighborCoords } from "./hex-grid.js";
import { canUnitEnterV39Tile } from "./v39-terrain-traversal.js";

export const V39_CAVE_FORMATIONS = Object.freeze({ column:"縦列", "front-two":"前2人" });
const key = tile => `${tile.x},${tile.y}`;
const axial = tile => ({ q:tile.x-(tile.y-(tile.y&1))/2, r:tile.y });
const offset = ({q,r}) => ({ x:q+(r-(r&1))/2, y:r });

// 入れ替え直後の狭路では、各員の隣接候補を一括割当てしてすれ違いを可能にする。
export function assignV39CaveFormationStep(map, source, goals, participants, occupied=new Set()) {
  const members=new Map(participants.map(unit=>[unit.id,unit]));
  const passable=(tile,id)=>!occupied.has(key(tile))&&canUnitEnterV39Tile(map,tile.x,tile.y,members.get(id));
  const leader=goals[0];
  if(!leader||!passable(leader,source[0].id)||getHexDistance(source[0],leader)>1)return null;
  const candidates=source.map((current,index)=>{
    if(!index)return [leader];
    const goal=goals[index],distances=new Map(),queue=[goal];
    if(!passable(goal,current.id))return [];
    distances.set(key(goal),0);
    for(let cursor=0;cursor<queue.length;cursor++)for(const tile of getHexNeighborCoords(map.w,map.h,queue[cursor].x,queue[cursor].y)) {
      if(distances.has(key(tile))||!passable(tile,current.id))continue;
      distances.set(key(tile),distances.get(key(queue[cursor]))+1);queue.push(tile);
    }
    return [current,...getHexNeighborCoords(map.w,map.h,current.x,current.y)]
      .filter(tile=>key(tile)!==key(leader)&&passable(tile,current.id)&&distances.has(key(tile)))
      .sort((a,b)=>distances.get(key(a))-distances.get(key(b)));
  });
  const assigned=new Map([[key(leader),0]]),next=[leader];
  const assign=(index,visited)=>{
    for(const tile of candidates[index]) {
      const tileKey=key(tile);
      if(visited.has(tileKey))continue;
      visited.add(tileKey);
      const previous=assigned.get(tileKey);
      if(previous===undefined||(previous!==0&&assign(previous,visited))) {
        assigned.set(tileKey,index);next[index]=tile;return true;
      }
    }
    return false;
  };
  for(let index=1;index<source.length;index++)if(!assign(index,new Set()))return null;
  return source.map((current,index)=>({id:current.id,x:next[index].x,y:next[index].y}));
}

export function resolveV39CaveFormation(squad = {}, order = squad.unitIds || []) {
  const formationType = Object.hasOwn(V39_CAVE_FORMATIONS,squad.formationType) ? squad.formationType : "column";
  const frontWidth = formationType === "front-two" ? 2 : 1;
  return { formationType, formationSlots:order.map((unitId,index)=>({unitId,row:Math.floor(index/frontWidth),column:index%frontWidth})) };
}

// 全員の移動は隣接1歩またはその場に限る。隊列変更・広い場所への復帰でもワープしない。
export function advanceV39RelativeCaveFormation(map, positions, target, group, occupied = new Set()) {
  if (!positions.length) return null;
  const members = new Map(group.participants.map(unit=>[unit.id,unit]));
  const origin = axial(positions[0]), destination = axial(target);
  const forward = { q:destination.q-origin.q, r:destination.r-origin.r };
  if (getHexDistance(positions[0],target) !== 1) return null;
  // 六角形の前衛2枠は進行方向に対して斜め横へ置く。
  const side = { q:-forward.q-forward.r, r:forward.q };
  const slots = new Map((group.formationSlots||[]).map(slot=>[slot.unitId,slot]));
  const desired = (columnOnly) => positions.map((position,index)=>{
    const slot = columnOnly ? {row:index,column:0} : slots.get(position.id)||{row:index,column:0};
    return {id:position.id,...offset({q:destination.q-slot.row*forward.q+slot.column*side.q,
      r:destination.r-slot.row*forward.r+slot.column*side.r})};
  });
  const passable = (tile,id) => !occupied.has(key(tile)) && canUnitEnterV39Tile(map,tile.x,tile.y,members.get(id));
  const greedy = (goals,source=positions) => {
    const next = [], reserved = new Set(occupied);
    for (let index=0;index<source.length;index++) {
      const current=source[index],goal=goals[index];
      if (!index) {
        if(!passable(target,current.id)) return null;
        next.push({...target,id:current.id});reserved.add(key(target));continue;
      }
      const queue=[{...current,first:current}],visited=new Set([key(current)]);
      const otherSlots=new Set(goals.slice(index+1).map(key));
      let step=null;
      for(let cursor=0;cursor<queue.length;cursor++) {
        const node=queue[cursor];
        if(key(node)===key(goal)) {step=node.first;break;}
        for(const tile of getHexNeighborCoords(map.w,map.h,node.x,node.y)) {
          if(visited.has(key(tile))||reserved.has(key(tile))||otherSlots.has(key(tile))||!passable(tile,current.id))continue;
          visited.add(key(tile));queue.push({...tile,first:cursor===0?tile:node.first});
        }
      }
      if(!step||reserved.has(key(step))||!passable(step,current.id))return null;
      next.push({id:current.id,x:step.x,y:step.y});reserved.add(key(step));
    }
    return next;
  };
  const attempt=(goals,source=positions)=>greedy(goals,source)
    ||assignV39CaveFormationStep(map,source,goals,group.participants,occupied);
  const wide=desired(false);
  // 維持できない幅はその1歩だけ縦列に縮める。保存した隊列タイプ自体は変更しない。
  if(wide.every(tile=>passable(tile,tile.id))) {
    const result=attempt(wide);
    if(result) {
      if(group.formationType==="front-two"&&result.some((tile,index)=>key(tile)!==key(wide[index]))) {
        // 狭路からの展開時は先頭を1歩分止め、後衛が追いつく。その追加移動にもAPを払う。
        const expanded=attempt(wide,result);
        if(expanded) {
          Object.defineProperty(expanded,"transitionFrames",{value:[result,expanded.map(tile=>({...tile}))]});
          return expanded;
        }
      }
      return result;
    }
  }
  return attempt(desired(true));
}
