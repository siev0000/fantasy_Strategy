import { getHexDistance } from "./hex-grid.js";
import { V39_CAVE_BALANCE } from "./v39-gameplay-balance.js";

const cube = ({x,y}) => { const q=x-(y-(y&1))/2; return [q,-q-y,y]; };
function roundedTile(values) {
  const rounded=values.map(Math.round),errors=rounded.map((value,i)=>Math.abs(value-values[i]));
  const index=errors.indexOf(Math.max(...errors));
  rounded[index]=-rounded[(index+1)%3]-rounded[(index+2)%3];
  const y=rounded[2];
  return {x:rounded[0]+(y-(y&1))/2,y};
}

// 地下の直線上の岩壁で遮断する。視界だけは終点の壁そのものを表示する。
export function hasV39CaveLineOfSight(map,from,to,{showWall=false}={}) {
  if(!map?.isUnderground)return true;
  const a=cube(from),b=cube(to),steps=getHexDistance(from,to);
  for(let i=1;i<=steps;i++) {
    const tile=roundedTile(a.map((value,j)=>value+(b[j]-value)*i/steps));
    if(map.grid?.[tile.y]?.[tile.x]!=="洞窟")return showWall&&i===steps;
  }
  return showWall||map.grid?.[to.y]?.[to.x]==="洞窟";
}

export function isV39UnitInWorld(unit,worldId="surface") {
  return (unit?.worldId||"surface")===worldId;
}

// 固定の走査順・中心からの距離で入口をまとめ、入った順で接続先を変えない。
export function groupV39SurfaceCaves(map) {
  const groups=[];
  for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++) {
    if(map.grid?.[y]?.[x]!=="洞窟")continue;
    const tile={x,y};
    const group=groups.find(row=>row.length<V39_CAVE_BALANCE.maxSurfaceEntrances
      &&getHexDistance(row[0],tile)<=V39_CAVE_BALANCE.surfaceEntranceLinkDistance);
    if(group)group.push(tile);else groups.push([tile]);
  }
  return groups;
}
