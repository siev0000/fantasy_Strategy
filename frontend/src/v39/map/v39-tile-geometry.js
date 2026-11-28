import { HEX_TILE_CONFIG } from "../../lib/phaser-map-panel-config.js";
import {getV39UnitFootprint} from "../../lib/v39-unit-footprint.js";

export function tileMetrics() {
  const width = Number(HEX_TILE_CONFIG?.width) || 40;
  const height = Number(HEX_TILE_CONFIG?.height) || 48;
  const rowStep = Number(HEX_TILE_CONFIG?.rowStep) || 36;
  const oddRowOffsetX = Number(HEX_TILE_CONFIG?.oddRowOffsetX) || width / 2;
  return { width, height, rowStep, oddRowOffsetX };
}

export function tileCenter(x, y) {
  const { width, height, rowStep, oddRowOffsetX } = tileMetrics();
  return {
    x: (x * width) + (y % 2 === 1 ? oddRowOffsetX : 0) + width / 2,
    y: (y * rowStep) + height / 2
  };
}

export function resolveV39UnitVisualOffset(unit,state) {
  if(unit.state==="死亡"||Number(unit.hp??unit.currentHp)<=0)return {x:0,y:0};
  // Use adjacent coordinates before wrapping so the sprite stays close to its anchor at map seams.
  const tiles=getV39UnitFootprint(unit,null,state);
  if(tiles.length===1)return {x:0,y:0};
  const anchor=tileCenter(unit.x,unit.y);
  const points=tiles.map(tile=>tileCenter(tile.x,tile.y));
  return {
    x:points.reduce((sum,point)=>sum+point.x-anchor.x,0)/points.length,
    y:points.reduce((sum,point)=>sum+point.y-anchor.y,0)/points.length
  };
}
