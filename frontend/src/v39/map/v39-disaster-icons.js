import { HEX_TILE_CONFIG } from "../../lib/phaser-map-panel-config.js";
import { V39_PROVISIONAL_DISASTER_BALANCE } from "../../lib/v39-gameplay-balance.js";
import {resolveV39DisasterIcon} from '../../lib/disaster-icon-artwork.js';
import {isV39AtmosphereDisaster,isV39AtmosphereMarkerHidden} from '../../lib/v39-atmosphere-display.js';
import {V39_DISASTER_FIELD_ARTWORK,isV39DisasterFieldArtwork,collectV39DisasterFieldImages,positionV39DisasterFieldImage} from '../../lib/v39-disaster-field-display.js';
import {v39AtmosphereOpacityPercent} from '../../lib/v39-atmosphere-opacity.js';
import {isV39VortexDisaster} from '../../lib/v39-vortex-display.js';
import {isV39TornadoDisaster} from '../../lib/v39-tornado-display.js';
import {isV39LightningDisaster,collectV39LightningTiles} from '../../lib/v39-lightning-display.js';
import {drawV39LightningLayer,playV39LightningStrikes} from './v39-lightning-layer.js';
import {createV39HexFootprintMask} from './v39-hex-footprint-mask.js';

const OVERLAY_NAME = "v39-disaster-icon-overlay";
const STRIKE_OVERLAY_NAME = "v39-disaster-strike-overlay";
const FIELD_OVERLAY_NAME = "v39-disaster-field-artwork";
const OVERLAY_DEPTH = 11;
const RETRY_MS = 16;
const RETRY_LIMIT = 180;
let renderRequestId = 0;
let lastSignature = null;
let sheetImage = null;
let sheetFailed = false;

function ensureSheet(scene, artwork) {
  if(scene.textures.exists(artwork.textureKey))return scene.textures.get(artwork.textureKey);
  if(sheetFailed)return null;
  if(!sheetImage){
    sheetImage=new Image();
    sheetImage.onload=()=>{lastSignature=null;scheduleRender();};
    sheetImage.onerror=()=>{sheetFailed=true;};
    sheetImage.src=artwork.src;
  }
  if(!sheetImage.complete||!sheetImage.naturalWidth)return null;
  return scene.textures.addImage(artwork.textureKey,sheetImage);
}

function ensureFrame(scene,artwork){
  const texture=artwork?ensureSheet(scene,artwork):null;if(!texture)return null;
  const frameKey=`disaster-${artwork.slot}`,width=texture.getSourceImage().width/artwork.columns,height=texture.getSourceImage().height/artwork.rows;
  if(!texture.has(frameKey))texture.add(frameKey,0,artwork.column*width,artwork.row*height,width,height);
  return {frameKey,width,height};
}

const text = value => String(value ?? "").trim();
const integer = value => Math.floor(Number(value) || 0);

function tileMetrics() {
  const width = Number(HEX_TILE_CONFIG?.width) || 40;
  const height = Number(HEX_TILE_CONFIG?.height) || 48;
  const rowStep = Number(HEX_TILE_CONFIG?.rowStep) || 36;
  const oddRowOffsetX = Number(HEX_TILE_CONFIG?.oddRowOffsetX) || width / 2;
  return { width, height, rowStep, oddRowOffsetX };
}

function tileCenter(x, y) {
  const { width, height, rowStep, oddRowOffsetX } = tileMetrics();
  return {
    x:(x * width) + (y % 2 === 1 ? oddRowOffsetX : 0) + width / 2,
    y:(y * rowStep) + height / 2
  };
}

function activeScene() {
  const game = window.__v39FieldRuntime?.game;
  const scenes = game?.scene?.getScenes?.(true) || [];
  return scenes.find(scene => scene?.sys?.isActive?.() !== false) || scenes[0] || null;
}

function currentTurn(state) {
  return Math.max(1, integer(state?.timeline?.turnNumber));
}

function activeEvents(state) {
  const turn = currentTurn(state);
  return (state?.worldEnvironment?.activeDisasters || []).filter(event => (
    event && integer(event?.expiresAtTurn) >= turn && Array.isArray(event?.tileKeys)
  ));
}

function eventIcon(event) {
  return text(event?.icon)
    || text(V39_PROVISIONAL_DISASTER_BALANCE.rulesById?.[text(event?.disasterId)]?.icon)
    || "!";
}

function collectMarkers(state) {
  const byTile = new Map();
  const testMode=window.isV39TestMode?.()===true;
  for (const event of activeEvents(state)) {
    if(isV39LightningDisaster(event.disasterId)||isV39DisasterFieldArtwork(event.disasterId)||isV39AtmosphereMarkerHidden(event.disasterId)||isV39VortexDisaster(event.disasterId)||isV39TornadoDisaster(event.disasterId))continue;
    for (const key of event.tileKeys) {
      if((event.persistentHazard||isV39AtmosphereDisaster(event.disasterId))&&key!==(event.anchorKey||`${event.x},${event.y}`))continue;
      const [x, y] = text(key).split(",").map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const visible=window.isV39TileInCurrentVision?.(x,y)===true;
      if(!testMode&&!visible)continue;
      const marker = byTile.get(key);
      if (marker) {
        marker.count += 1;
        marker.names.push(text(event?.name) || "災害");
      } else {
        byTile.set(key, {
          key, x:integer(x), y:integer(y), icon:eventIcon(event), count:1,
          names:[text(event?.name) || "災害"],artwork:resolveV39DisasterIcon(event),alpha:visible?1:0.6
        });
      }
    }
  }
  return [...byTile.values()].sort((left, right) => left.key.localeCompare(right.key, "ja"));
}

function signature(markers) {
  return markers.map(marker => `${marker.key}:${marker.icon}:${marker.count}:${marker.artwork?.slot}:${marker.alpha}:${marker.names.join("/")}`).join("|");
}

function destroyOverlay(scene) {
  for (const child of [...(scene?.children?.list || [])]) {
    if ([OVERLAY_NAME,STRIKE_OVERLAY_NAME,FIELD_OVERLAY_NAME].includes(child?.name)) child.destroy();
  }
  for(const entry of scene.v39DisasterFieldMasks||[])entry.destroy();
  scene.v39DisasterFieldMasks=[];
}

function hasOverlay(scene) {
  return [OVERLAY_NAME,FIELD_OVERLAY_NAME].every(name=>(scene?.children?.list||[]).some(child=>child?.name===name));
}

function addMarker(scene, container, marker) {
  const { width, height } = tileMetrics();
  const center = tileCenter(marker.x, marker.y);
  const radius = Math.max(6, Math.min(width, height) * 0.18);
  const x = center.x + (width * 0.24);
  const y = center.y - (height * 0.24);
  const circle = scene.add.circle(x, y, radius, 0x30130f, 0.92)
    .setStrokeStyle(Math.max(1, radius * 0.16), 0xffc969, 1)
    .setName(`v39-disaster-icon:${marker.key}`)
    .setData("disasterNames", marker.names);
  const artwork=marker.artwork,frame=ensureFrame(scene,artwork);
  let label;
  if(frame){
    label=scene.add.image(x,y,artwork.textureKey,frame.frameKey).setDisplaySize(radius*2.8,radius*2.8)
      .setName(`v39-disaster-icon-label:${marker.key}`).setData('disasterImageSlot',artwork.slot);
  }else label = scene.add.text(x, y - 0.5, marker.icon, {
    fontFamily:"sans-serif",
    fontSize:`${Math.max(10, Math.floor(radius * 1.45))}px`,
    fontStyle:"bold",
    color:"#fff1b2",
    stroke:"#1a0c0a",
    strokeThickness:2
  }).setOrigin(0.5).setName(`v39-disaster-icon-label:${marker.key}`);
  circle.setAlpha(marker.alpha);label.setAlpha(marker.alpha);
  container.add([circle, label]);
  if (marker.count > 1) {
    const count = scene.add.text(x + radius * 0.72, y + radius * 0.72, String(marker.count), {
      fontFamily:"sans-serif", fontSize:`${Math.max(8, Math.floor(radius))}px`, fontStyle:"bold", color:"#ffffff",
      stroke:"#1a0c0a", strokeThickness:2
    }).setOrigin(0.5);
    container.add(count);
  }
}

function render() {
  const state = window.getV39GameState?.({includeWorlds:false});
  const scene = activeScene();
  if (!state || !scene?.add) return false;
  if(!scene.v39DisasterFieldCleanup&&scene.events?.once){
    scene.v39DisasterFieldCleanup=true;
    scene.events.once('shutdown',()=>{destroyOverlay(scene);scene.v39DisasterFieldCleanup=false;});
  }
  drawV39LightningLayer(scene,collectV39LightningTiles(window.__v39FieldRuntime?.mapData,state,
    (x,y)=>window.isV39TileInCurrentVision?.(x,y)===true,window.isV39TestMode?.()===true));
  const markers = collectMarkers(state);
  const fields=collectV39DisasterFieldImages(state,{testMode:window.isV39TestMode?.()===true,isVisible:(x,y)=>window.isV39TileInCurrentVision?.(x,y)===true,
    opacity:kind=>v39AtmosphereOpacityPercent(kind,window.getV39DisplaySettings?.()||{})/100}).map(marker=>({...marker,artwork:resolveV39DisasterIcon(marker.event)}));
  const nextSignature = signature(markers)+JSON.stringify(fields.map(marker=>[marker.id,marker.x,marker.y,marker.event.radius,marker.tileKeys,marker.alpha,marker.artwork?.slot,marker.style]));
  if (nextSignature === lastSignature && hasOverlay(scene)) return true;
  lastSignature = nextSignature;
  destroyOverlay(scene);
  const container = scene.add.container(0, 0).setDepth(OVERLAY_DEPTH).setName(OVERLAY_NAME);
  const fieldContainer=scene.add.container(0,0).setDepth(V39_DISASTER_FIELD_ARTWORK.depth).setName(FIELD_OVERLAY_NAME);
  for(const marker of fields){
    const frame=ensureFrame(scene,marker.artwork);if(!frame)continue;
    const placement=positionV39DisasterFieldImage(marker,tileMetrics(),frame.width,frame.height);
    const image=scene.add.image(placement.x,placement.y,marker.artwork.textureKey,frame.frameKey).setOrigin(.5,marker.style.singleImage ? 0.5 : 1)
      .setDisplaySize(placement.width,placement.height).setAlpha(marker.alpha).setName(`v39-disaster-field:${marker.id}`)
      .setData('disasterNames',[marker.event.name]).setData('disasterImageSlot',marker.artwork.slot);
    if(marker.style.singleImage){
      const entry=createV39HexFootprintMask(scene,marker.tileKeys,tileMetrics());
      image.setMask(entry.mask);scene.v39DisasterFieldMasks.push(entry);
    }
    fieldContainer.add(image);
  }
  for (const marker of markers) addMarker(scene, container, marker);
  window.__v39DisasterIconStatus = { rendered:true, markerCount:markers.length, fieldImageCount:fieldContainer.list.length, activeEventCount:activeEvents(state).length };
  scene.game?.v39InvalidateRender?.();
  return true;
}

function scheduleRender() {
  const requestId = ++renderRequestId;
  let attempts = 0;
  const tryRender = () => {
    if (requestId !== renderRequestId) return;
    if (render()) return;
    attempts += 1;
    if (attempts < RETRY_LIMIT && window.__v39FieldRuntime?.mapData) window.setTimeout(tryRender, RETRY_MS);
  };
  tryRender();
}

function install() {
  window.addEventListener("v39:field-generated", () => { lastSignature = null; scheduleRender(); });
  window.addEventListener("v39:game-state-changed", scheduleRender);
  window.addEventListener("v39:natural-events-resolved", event=>{
    scheduleRender();
    const state=window.getV39GameState?.({includeWorlds:false}),map=window.__v39FieldRuntime?.mapData,scene=activeScene();
    if(!scene||map?.isUnderground||map?.hegemonyInterior||event.detail?.worldId!==(state?.activeWorldId||'surface'))return;
    const strikes=(event.detail?.lightningStrikes||[]).filter(tile=>window.isV39TestMode?.()===true||window.isV39TileInCurrentVision?.(tile.x,tile.y)===true);
    playV39LightningStrikes(scene,strikes);
  });
  window.addEventListener("v39:map-render-batch-ended", scheduleRender);
  window.addEventListener('v39:visibility-rendered',scheduleRender);
  window.addEventListener('v39:display-settings-changed',scheduleRender);
  window.renderV39DisasterIcons = scheduleRender;
  window.getV39DisasterIconStatus = () => ({ ...(window.__v39DisasterIconStatus || {}) });
  if (window.__v39FieldRuntime?.mapData) scheduleRender();
}

install();
