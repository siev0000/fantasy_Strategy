import { HEX_TILE_CONFIG } from "./phaser-map-panel-config.js";

// 再生エフェクトと常設結界で共通の、全対象マスを包む重心・外接円。
export function resolveV39EffectAreaGeometry(tiles, coverageScale = 1) {
  const {width,height,rowStep,oddRowOffsetX} = HEX_TILE_CONFIG;
  const centers = tiles.map(tile=>({
    x:tile.x*width+(tile.y%2 ? oddRowOffsetX : 0)+width/2,
    y:tile.y*rowStep+height/2
  }));
  const x=centers.reduce((sum,p)=>sum+p.x,0)/centers.length;
  const y=centers.reduce((sum,p)=>sum+p.y,0)/centers.length;
  const corners=[[0,-height/2],[width/2,height/2-rowStep],[width/2,rowStep-height/2],
    [0,height/2],[-width/2,rowStep-height/2],[-width/2,height/2-rowStep]];
  const radius=Math.max(...centers.flatMap(center=>corners.map(([dx,dy])=>Math.hypot(center.x+dx-x,center.y+dy-y))));
  return {x,y,diameter:radius*2*coverageScale};
}
