import { V39_CAVE_BALANCE as balance } from "./v39-gameplay-balance.js";

// 接続グラフは形状データを利用し、部屋の位置・輪郭・向きは生成ごとに組み直す。
export function createV39CaveLayout(template, random) {
  if (template.生成方式 === "固定") return template;
  const w=balance.mapWidth,h=balance.mapHeight;
  const rotation=Math.floor(random()*4),mirror=random()<0.5;
  const transform=([x,y])=>{
    let u=x/(template.幅-1),v=y/(template.高さ-1);
    if(mirror)u=1-u;
    for(let i=0;i<rotation;i++)[u,v]=[1-v,u];
    return [Math.round(1+u*(w-3)),Math.round(1+v*(h-3))];
  };
  const clamp=(value,max)=>Math.max(1,Math.min(max-2,value));
  const rooms=template.部屋.map(room=>{
    const center=transform(room);
    const radii=rotation%2?[room[3],room[2]]:[room[2],room[3]];
    const scale=()=>balance.roomRadiusScaleMin+random()*(balance.roomRadiusScaleMax-balance.roomRadiusScaleMin);
    const rx=Math.max(2,Math.round(radii[0]*scale()));
    const ry=Math.max(2,Math.round(radii[1]*(h/w)*scale()));
    const jitter=()=>Math.round((random()*2-1)*balance.roomPositionJitter);
    const x=Math.max(rx+1,Math.min(w-rx-2,center[0]+jitter()));
    const y=Math.max(ry+1,Math.min(h-ry-2,center[1]+jitter()));
    return [x,y,rx,ry];
  });
  const ports=template.部屋接続口.map((entries,index)=>Object.fromEntries(Object.entries(entries).map(([name,point])=>{
    const oldCenter=transform(template.部屋[index]),edge=transform(point),room=rooms[index];
    const dx=edge[0]-oldCenter[0],dy=edge[1]-oldCenter[1];
    const norm=Math.hypot(dx/room[2],dy/room[3])||1;
    return [name,[clamp(Math.round(room[0]+dx/norm),w),clamp(Math.round(room[1]+dy/norm),h)]];
  })));
  const point=value=>Array.isArray(value)?transform(value):value;
  return {...template,幅:w,高さ:h,部屋:rooms,部屋接続口:ports,
    部屋輪郭:rooms.map(()=>({phase:random()*Math.PI*2,irregular:random()<balance.irregularRoomRate})),
    通路:template.通路.map(row=>({...row,経路:row.経路.map(point)})),
    // テスト1階の入口右上に鍛冶師を置く既存仕様の余白も確保する。
    出入口:template.出入口.map((entry,index)=>{
      const position=transform(entry);
      return index===0?[Math.min(w-3,position[0]),Math.max(3,position[1])]:position;
    }),入口接続:template.入口接続.map(point)};
}

export function isV39CaveRoomFloor(x,y,room,outline) {
  const dx=(x-room[0])/room[2],dy=(y-room[1])/room[3];
  const angle=Math.atan2(dy,dx);
  const edge=outline.irregular?1+balance.roomOutlineVariation*Math.sin(angle*3+outline.phase):1;
  return Math.hypot(dx,dy)<=edge;
}
