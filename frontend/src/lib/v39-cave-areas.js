import {getHexNeighborCoords} from "./hex-grid.js";
import {isV39CaveRoomFloor} from "./v39-cave-layout.js";

// 部屋の床を固定し、通路は最寄りの部屋から同時に広げて境界を保存する。
export function ensureV39CaveAreas(map) {
  if(!map?.isUnderground || map.caveAreaByTile)return map?.caveAreaByTile || {};
  const areas={},queue=[],floor=(x,y)=>!!map.grid?.[y]?.[x]&&!['岩壁','壁'].includes(map.grid[y][x]);
  for(let index=0;index<(map.rooms || []).length;index++) {
    const room=map.rooms[index],id=`room-${index+1}`,outline=map.roomOutlines?.[index];
    for(let y=Math.max(0,Math.floor(room[1]-room[3]-1));y<Math.min(map.h,room[1]+room[3]+2);y++)
      for(let x=Math.max(0,Math.floor(room[0]-room[2]-1));x<Math.min(map.w,room[0]+room[2]+2);x++) {
        const inside=outline?isV39CaveRoomFloor(x,y,room,outline):Math.abs(x-room[0])<=room[2]&&Math.abs(y-room[1])<=room[3];
        const key=`${x},${y}`;
        if(inside&&floor(x,y)&&!areas[key]){areas[key]=id;queue.push({x,y,id});}
      }
  }
  const expand=()=>{for(let i=0;i<queue.length;i++)for(const next of getHexNeighborCoords(map.w,map.h,queue[i].x,queue[i].y)) {
    if(!floor(next.x,next.y)||areas[next.key])continue;
    areas[next.key]=queue[i].id;queue.push({...next,id:queue[i].id});
  }};
  expand();
  // 旧セーブ・テスト用の部屋情報なしマップも、接続した床ごとに移行する。
  let fallback=0;
  for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++)if(floor(x,y)&&!areas[`${x},${y}`]) {
    const id=`area-${++fallback}`;areas[`${x},${y}`]=id;queue.length=0;queue.push({x,y,id});expand();
  }
  map.caveAreaByTile=areas;map.caveAreas={};
  for(const [key,id] of Object.entries(areas))(map.caveAreas[id] ||= []).push(key);
  return areas;
}
