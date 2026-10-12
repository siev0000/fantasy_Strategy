import { getHexDistance } from "./hex-grid.js";
import { V39_CAVE_BALANCE } from "./v39-gameplay-balance.js";
import { hasV39WallLineOfSight } from "./v39-combat-ray.js";
import { isV39SurfaceCaveEntrance } from "./v39-cave-entrance-rules.js";

// 地下の岩壁と設置壁は同じ直線判定を使う。視界では終点の壁自体を表示する。
export function hasV39CaveLineOfSight(map,from,to,options={}) {
  return hasV39WallLineOfSight(map,from,to,options);
}
export function isV39UnitInWorld(unit,worldId="surface") {
  return (unit?.worldId||"surface")===worldId;
}

// 固定の走査順・中心からの距離で入口をまとめ、入った順で接続先を変えない。
export function groupV39SurfaceCaves(map) {
  const groups=[];
  for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++) {
    if(!isV39SurfaceCaveEntrance(map,x,y))continue;
    const tile={x,y};
    const group=groups.find(row=>row.length<V39_CAVE_BALANCE.maxSurfaceEntrances
      &&getHexDistance(row[0],tile)<=V39_CAVE_BALANCE.surfaceEntranceLinkDistance);
    if(group)group.push(tile);else groups.push([tile]);
  }
  return groups;
}
