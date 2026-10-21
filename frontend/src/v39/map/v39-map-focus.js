import { HEX_TILE_CONFIG } from '../../lib/phaser-map-panel-config.js';

// Tile navigation shares one coordinate conversion and camera-boundary policy.
export function focusV39MapTile(tile, {worldId, select=false}={}) {
  const runtime=window.__v39FieldRuntime, map=runtime?.mapData;
  const scene=runtime?.game?.scene?.getScenes(true)?.[0], camera=scene?.cameras?.main;
  const activeWorldId=window.getV39GameState?.({includeWorlds:false})?.activeWorldId||'surface';
  if(!camera||window.isV39MapInputLocked?.()||(worldId&&worldId!==activeWorldId))return false;
  const {x,y}=tile||{};
  if(!Number.isInteger(x)||!Number.isInteger(y)||!map?.grid?.[y]?.[x])return false;
  if(select&&!scene.v39Input?.selectTile?.(tile))return false;
  const h=HEX_TILE_CONFIG, width=map.w*h.width+h.oddRowOffsetX+2, height=(map.h-1)*h.rowStep+h.height+2;
  const halfW=camera.width/camera.zoom/2, halfH=camera.height/camera.zoom/2;
  const clamp=(value,half,size)=>size<=half*2?size/2:Math.max(half,Math.min(size-half,value));
  camera.centerOn(clamp(x*h.width+(y%2?h.oddRowOffsetX:0)+h.width/2,halfW,width),
    clamp(y*h.rowStep+h.height/2,halfH,height));
  runtime.game.v39InvalidateRender?.();
  return true;
}
