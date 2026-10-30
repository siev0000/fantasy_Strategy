import { HEX_TILE_CONFIG } from '../../lib/phaser-map-panel-config.js';

let pendingFocus=null;
let pendingUnitSelection=false;

// Tile navigation shares one coordinate conversion and camera-boundary policy.
export function focusV39MapTile(tile, {worldId, select=false,notify=true}={}) {
  const runtime=window.__v39FieldRuntime, map=runtime?.mapData;
  const scene=runtime?.game?.scene?.getScenes(true)?.[0], camera=scene?.cameras?.main;
  const activeWorldId=window.getV39GameState?.({includeWorlds:false})?.activeWorldId||'surface';
  if(window.isV39MapInputLocked?.()||(worldId&&worldId!==activeWorldId))return false;
  // A newly added Phaser scene is not active until the next scene update.
  if(!camera||(scene.v39WorldId&&scene.v39WorldId!==activeWorldId)){
    pendingFocus={tile:{...tile},worldId:activeWorldId,select,notify};
    return true;
  }
  pendingFocus=null;
  const {x,y}=tile||{};
  if(!Number.isInteger(x)||!Number.isInteger(y)||!map?.grid?.[y]?.[x])return false;
  if(select&&!scene.v39Input?.selectTile?.(tile,false,{notify}))return false;
  const h=HEX_TILE_CONFIG, width=map.w*h.width+h.oddRowOffsetX+2, height=(map.h-1)*h.rowStep+h.height+2;
  const halfW=camera.width/camera.zoom/2, halfH=camera.height/camera.zoom/2;
  const clamp=(value,half,size)=>size<=half*2?size/2:Math.max(half,Math.min(size-half,value));
  camera.centerOn(clamp(x*h.width+(y%2?h.oddRowOffsetX:0)+h.width/2,halfW,width),
    clamp(y*h.rowStep+h.height/2,halfH,height));
  runtime.game.v39InvalidateRender?.();
  return true;
}

function syncSelectedUnitTile(){
  if(window.isV39MapInputLocked?.())return;
  const faction=window.getV39ActiveFactionState?.(),unit=faction?.units?.find(row=>row.id===faction.selectedUnitId);
  const state=window.getV39GameState?.({includeWorlds:false}),scene=window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0];
  const worldId=state?.activeWorldId||'surface';
  if(!unit||(unit.worldId||'surface')!==worldId||(scene?.v39WorldId&&scene.v39WorldId!==worldId))return;
  if(scene?.v39Input?.selectTile?.(unit,false,{notify:false}))pendingUnitSelection=false;
}
for(const type of ['v39:unit-selected','v39:unit-moved'])window.addEventListener(type,()=>{pendingUnitSelection=true;syncSelectedUnitTile();});
window.addEventListener('v39:map-input-lock-changed',()=>{if(pendingUnitSelection)syncSelectedUnitTile();});

window.addEventListener('v39:field-input-ready',()=>{
  const request=pendingFocus;
  pendingFocus=null;
  if(request)focusV39MapTile(request.tile,request);
  if(!request?.select)syncSelectedUnitTile();
});
for(const name of ['v39:field-layer-changed','v39:save-loaded']){
  window.addEventListener(name,()=>{pendingFocus=null;});
}
