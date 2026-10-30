import { HEX_TILE_CONFIG } from '../../lib/phaser-map-panel-config.js';
import { MAP_ENTITY_SIZE_RULES, tileRelativePx,resolveV39UnitImageScale } from '../../lib/map-entity-size-rules.js';
import { resolveV39EffectTransform, resolveV39EffectBeam } from '../../lib/v39-effect-transform.js';
import {resolveV39EffectAreaGeometry} from '../../lib/v39-effect-area-geometry.js';
import {getHexDistance,getHexOffsetNeighbors} from '../../lib/hex-grid.js';
import {v39HexRay} from '../../lib/v39-combat-ray.js';
import {resolveV39PowerEffectScale} from '../../lib/v39-terrain-destruction.js';
import {resolveV39PowerAreaScale} from '../../lib/v39-effect-power-scale.js';
export const getV39PreviewPowerScale=()=>resolveV39PowerEffectScale(Number(document.getElementById('v39-effect-preview-power')?.value)||0);

const fighter=new URL('../../../../assets/images/units/只人/ファイター.webp',import.meta.url).href;
const knight=new URL('../../../../assets/images/units/只人/ホーリーナイト.webp',import.meta.url).href;
export const V39_EFFECT_PREVIEW_LIMITS=Object.freeze({maximumDistance:8,maximumAreaRadius:4,minimumGridRadius:2,defaultZoomPercent:100,minimumZoomPercent:5,maximumZoomPercent:200});
const origin={x:20,y:20},key=tile=>`${tile.x},${tile.y}`;
const directions={'0':{x:1,y:0},'60':{x:0,y:1},'120':{x:-1,y:1},'180':{x:-1,y:0},'240':{x:-1,y:-1},'300':{x:0,y:-1}};
const previewMap={w:64,h:64,grid:Array.from({length:64},()=>Array(64).fill('平地')),worldWrapEnabled:false};
let selectedTile=null,selectionKey='';
const control=id=>document.getElementById(`v39-effect-preview-${id}`);
const clamp=(value,max,fallback=0)=>Math.min(max,Math.max(0,Math.floor(Number.isFinite(Number(value))?Number(value):fallback)));
const absolute=tile=>({x:origin.x+tile.x,y:origin.y+tile.y});
const relative=tile=>({x:tile.x-origin.x,y:tile.y-origin.y});
function within(center,radius){
  const found=new Map([[key(center),center]]),queue=[{tile:center,distance:0}];
  for(let i=0;i<queue.length;i++){
    const {tile,distance}=queue[i];if(distance>=radius)continue;
    for(const neighbor of getHexOffsetNeighbors(tile.x,tile.y))if(!found.has(key(neighbor))){found.set(key(neighbor),neighbor);queue.push({tile:neighbor,distance:distance+1});}
  }
  return [...found.values()];
}
function targetFromControls(){
  const direction=control('direction')?.value||'0',distance=Math.max(1,clamp(control('distance')?.value,V39_EFFECT_PREVIEW_LIMITS.maximumDistance,1));
  const nextKey=`${direction}:${distance}`;
  if(nextKey!==selectionKey||!selectedTile){
    selectionKey=nextKey;
    const step=directions[direction]||directions['0'];
    selectedTile=direction==='self'?{x:0,y:0}:relative(v39HexRay(previewMap,origin,absolute(step),distance).at(-1));
  }
  return selectedTile;
}
export function getV39EffectPreviewFootprint(target,shape='single',radius=0){
  if(shape==='circle')return within(absolute(target),clamp(radius,V39_EFFECT_PREVIEW_LIMITS.maximumAreaRadius)).map(relative);
  if(shape==='line'){
    const tiles=v39HexRay(previewMap,origin,absolute(target)).map(relative);return tiles.length?tiles:[target];
  }
  return [target];
}
function pixel(tile){const {width,rowStep,oddRowOffsetX}=HEX_TILE_CONFIG;return {x:tile.x*width+(tile.y%2?oddRowOffsetX:0),y:tile.y*rowStep};}
function previewLayout(stage){
  const tile=targetFromControls(),shape=control('shape')?.value||'single',radius=clamp(control('radius')?.value,V39_EFFECT_PREVIEW_LIMITS.maximumAreaRadius);
  const areaTiles=getV39EffectPreviewFootprint(tile,shape,radius);
  const gridRadius=Math.max(V39_EFFECT_PREVIEW_LIMITS.minimumGridRadius,...areaTiles.map(point=>getHexDistance(origin,absolute(point))));
  const {width,height}=HEX_TILE_CONFIG;
  const points=[...within(origin,V39_EFFECT_PREVIEW_LIMITS.minimumGridRadius).map(relative),...areaTiles,tile].map(pixel);
  const left=Math.min(...points.map(point=>point.x))-width/2,right=Math.max(...points.map(point=>point.x))+width/2;
  const top=Math.min(...points.map(point=>point.y))-height/2,bottom=Math.max(...points.map(point=>point.y))+height/2;
  const cameraToolbarHeight=32,viewHeight=Math.max(1,stage.clientHeight-cameraToolbarHeight);
  const fitZoom=Math.max(.01,Math.min((stage.clientWidth-24)/(right-left),(viewHeight-24)/(bottom-top)));
  const zoom=Math.max(V39_EFFECT_PREVIEW_LIMITS.minimumZoomPercent,clamp(control('zoom')?.value,V39_EFFECT_PREVIEW_LIMITS.maximumZoomPercent,V39_EFFECT_PREVIEW_LIMITS.defaultZoomPercent))/100;
  return {tile,shape,radius,areaTiles,gridRadius,zoom,fitZoom,
    attacker:{x:(stage.clientWidth-(right-left)*zoom)/2-left*zoom,y:cameraToolbarHeight+(viewHeight-(bottom-top)*zoom)/2-top*zoom}};
}
export function effectPreviewGeometry(stage,setting={}){
  const layout={...previewLayout(stage),powerScale:getV39PreviewPowerScale(),powerScaleAxis:setting.powerScaleAxis}, {attacker,zoom,tile,areaTiles}=layout;
  const center=areaTiles.length>1?resolveV39EffectAreaGeometry(areaTiles,MAP_ENTITY_SIZE_RULES.defenseField.coverageScale):null;
  const targetOffset=pixel(tile),offset=center?{x:center.x-HEX_TILE_CONFIG.width/2,y:center.y-HEX_TILE_CONFIG.height/2}:targetOffset;
  const beam=resolveV39EffectBeam(setting,{x:0,y:0},targetOffset);
  if(beam)return {...layout,...beam,x:attacker.x+beam.x*zoom,y:attacker.y+beam.y*zoom,
    stretchLengthPx:beam.stretchLengthPx*zoom,target:{x:attacker.x+targetOffset.x*zoom,y:attacker.y+targetOffset.y*zoom},self:false};
  const transformed=resolveV39EffectTransform(center?{...setting,offsetX:0,offsetY:0}:setting,offset,Math.atan2(offset.y,offset.x)*180/Math.PI);
  const fitDiameterPx=center?center.diameter*zoom*resolveV39PowerAreaScale(Number(setting.scaleMultiplierPercent||100)/100,1):undefined;
  return {...layout,x:attacker.x+transformed.x*zoom,y:attacker.y+transformed.y*zoom,fitDiameterPx,
    angleDeg:transformed.angleDeg,target:{x:attacker.x+targetOffset.x*zoom,y:attacker.y+targetOffset.y*zoom},self:tile.x===0&&tile.y===0};
}
export function getV39EffectPreviewMapRequest(map){
  const attackerTile={x:Math.floor(map.w/2),y:Math.floor(map.h/2)&~1},tile=targetFromControls();
  const area=getV39EffectPreviewFootprint(tile,control('shape')?.value||'single',Number(control('radius')?.value)||0);
  const translate=point=>({x:attackerTile.x+point.x,y:attackerTile.y+point.y});
  const inMap=point=>point.x>=0&&point.y>=0&&point.x<map.w&&point.y<map.h;
  const target=translate(tile);if(!inMap(target))return null;
  return {attackerTile,tileX:target.x,tileY:target.y,areaTiles:area.map(translate).filter(inMap),power:Number(control('power')?.value)||0};
}
export function renderEffectPreviewCombatants(stage){
  if(!stage)return;
  let layer=stage.querySelector('.v39-effect-preview-combatants');
  if(!layer){
    layer=document.createElement('div');layer.className='v39-effect-preview-combatants';
    layer.addEventListener('click',event=>{
      const button=event.target.closest('[data-preview-cell]');if(!button||button.disabled)return;
      const tile={x:Number(button.dataset.tileX),y:Number(button.dataset.tileY)},point=pixel(tile);
      const distance=getHexDistance(origin,absolute(tile));
      const direction=distance===0?'self':String((Math.round(Math.atan2(point.y,point.x)*180/Math.PI/60)*60+360)%360);
      control('direction').value=direction;control('distance').value=String(Math.max(1,distance));
      selectedTile=tile;selectionKey=`${direction}:${Math.max(1,distance)}`;
      control('direction').dispatchEvent(new Event('change',{bubbles:true}));
    });stage.appendChild(layer);
  }
  const geometry=effectPreviewGeometry(stage),{attacker,zoom,gridRadius}=geometry;
  if(layer.dataset.radius!==String(gridRadius)){
    const neighbors=new Map(Object.entries(directions).map(([id,tile])=>[key(tile),id]));
    layer.innerHTML=within(origin,gridRadius).map(relative).map(tile=>{
      const id=tile.x===0&&tile.y===0?'self':neighbors.get(key(tile))||key(tile),distance=getHexDistance(origin,absolute(tile));
      return `<button type="button" data-preview-cell="${id}" data-tile-x="${tile.x}" data-tile-y="${tile.y}" aria-label="対象マス：距離${distance} (${tile.x},${tile.y})"${distance>V39_EFFECT_PREVIEW_LIMITS.maximumDistance?' disabled':''}><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polygon/></svg></button>`;
    }).join('')+`<div data-preview-attacker><img src="${fighter}" alt="攻撃キャラ"></div><div data-preview-target><img src="${knight}" alt="受けるキャラ"></div>`;
    layer.dataset.radius=String(gridRadius);
  }
  const areaKeys=new Set(geometry.areaTiles.map(key)),{width,height,rowStep}=HEX_TILE_CONFIG;
  for(const node of layer.querySelectorAll('[data-preview-cell]')){
    const tile={x:Number(node.dataset.tileX),y:Number(node.dataset.tileY)},offset=pixel(tile);
    Object.assign(node.style,{left:`${attacker.x+offset.x*zoom}px`,top:`${attacker.y+offset.y*zoom}px`,width:`${width*zoom}px`,height:`${height*zoom}px`});
    const upper=(height-rowStep)/height*100,lower=rowStep/height*100;
    node.querySelector('polygon').setAttribute('points',`50,0 100,${upper} 100,${lower} 50,100 0,${lower} 0,${upper}`);
    node.style.clipPath=`polygon(50% 0,100% ${upper}%,100% ${lower}%,50% 100%,0 ${lower}%,0 ${upper}%)`;
    node.setAttribute('aria-pressed',String(key(tile)===key(geometry.tile)));node.classList.toggle('is-attack-area',areaKeys.has(key(tile)));
  }
  for(const [selector,point] of [['[data-preview-attacker]',attacker],['[data-preview-target]',geometry.target]]){
    const node=layer.querySelector(selector),size=tileRelativePx(MAP_ENTITY_SIZE_RULES.unit.diameterTiles)*MAP_ENTITY_SIZE_RULES.unit.imageFill*zoom
      *resolveV39UnitImageScale({SIZ:MAP_ENTITY_SIZE_RULES.unit.previewSiz});
    Object.assign(node.style,{left:`${point.x}px`,top:`${point.y}px`,width:`${size}px`,height:`${size}px`});
  }
  layer.querySelector('[data-preview-target]').hidden=geometry.self;
  control('distance').disabled=geometry.self;control('radius').disabled=geometry.shape!=='circle';
  if(!geometry.self)control('distance').value=String(getHexDistance(origin,absolute(geometry.tile)));
  control('radius').value=String(geometry.radius);
  control('zoom').value=String(Math.round(zoom*100));
  stage.dataset.attackDirection=control('direction').value;stage.dataset.previewZoom=String(zoom);
  stage.dataset.previewDistance=String(getHexDistance(origin,absolute(geometry.tile)));stage.dataset.previewAreaCount=String(geometry.areaTiles.length);
  control('summary').textContent=`距離${stage.dataset.previewDistance}マス / 対象${geometry.areaTiles.length}マス / ${Math.round(zoom*100)}%`;
}
