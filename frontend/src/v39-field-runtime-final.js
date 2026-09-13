import Phaser from "phaser";
import { createTerrainMapData, terrainDefinitions } from "./lib/map-generator.js";
import { HEX_TILE_CONFIG } from "./lib/phaser-map-panel-config.js";

const DEFAULT_MAX_ZOOM_FACTOR = 10;
const terrainColorMap = new Map(
  (Array.isArray(terrainDefinitions) ? terrainDefinitions : []).map(row => [String(row?.key || ""), String(row?.color || "#607078")])
);

let playfield = null;
let referenceMap = null;
let host = null;
let game = null;
let currentData = null;
let currentSettings = null;

function tileMetrics() {
  const width = Number(HEX_TILE_CONFIG?.width) || 40;
  const height = Number(HEX_TILE_CONFIG?.height) || 48;
  const rowStep = Number(HEX_TILE_CONFIG?.rowStep) || 36;
  const oddRowOffsetX = Number(HEX_TILE_CONFIG?.oddRowOffsetX) || width / 2;
  return { width, height, rowStep, oddRowOffsetX };
}

function worldSize(data = currentData) {
  const { width, height, rowStep, oddRowOffsetX } = tileMetrics();
  const w = Math.max(1, Number(data?.w) || 1);
  const h = Math.max(1, Number(data?.h) || 1);
  return {
    width: (w * width) + oddRowOffsetX + 2,
    height: ((h - 1) * rowStep) + height + 2
  };
}

function hexPoints(x, y) {
  const { width, height, rowStep, oddRowOffsetX } = tileMetrics();
  const halfW = width / 2;
  const upperY = height - rowStep;
  const lowerY = rowStep;
  const left = (x * width) + (y % 2 === 1 ? oddRowOffsetX : 0);
  const top = y * rowStep;
  return [
    left + halfW, top,
    left + width, top + upperY,
    left + width, top + lowerY,
    left + halfW, top + height,
    left, top + lowerY,
    left, top + upperY
  ];
}

function tileCenter(x, y) {
  const { width, height, rowStep, oddRowOffsetX } = tileMetrics();
  return {
    x: (x * width) + (y % 2 === 1 ? oddRowOffsetX : 0) + width / 2,
    y: (y * rowStep) + height / 2
  };
}

function colorNumber(hex) {
  try {
    return Phaser.Display.Color.HexStringToColor(String(hex || "#607078")).color;
  } catch {
    return 0x607078;
  }
}

function shadeColorByHeight(hex, level) {
  if (!hex?.startsWith?.("#") || !Number.isFinite(level)) return hex;
  const t = Phaser.Math.Clamp((level + 2) / 10, 0, 1);
  const brightness = 1.18 + ((0.74 - 1.18) * t);
  const raw = Number.parseInt(hex.slice(1), 16);
  const r = Phaser.Math.Clamp(Math.round(((raw >> 16) & 0xff) * brightness), 0, 255);
  const g = Phaser.Math.Clamp(Math.round(((raw >> 8) & 0xff) * brightness), 0, 255);
  const b = Phaser.Math.Clamp(Math.round((raw & 0xff) * brightness), 0, 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function shadeSeaColorByDepth(hex, level) {
  if (!hex?.startsWith?.("#") || !Number.isFinite(level)) return hex;
  const raw = Number.parseInt(hex.slice(1), 16);
  const brightness = 1 - Math.min(0.62, Math.max(0, -Math.floor(level)) * 0.09);
  const r = Phaser.Math.Clamp(Math.round(((raw >> 16) & 0xff) * brightness), 0, 255);
  const g = Phaser.Math.Clamp(Math.round(((raw >> 8) & 0xff) * brightness), 0, 255);
  const b = Phaser.Math.Clamp(Math.round((raw & 0xff) * brightness), 0, 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function readDisplaySettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("v39-display-settings-v1") || "null") || {};
    return {
      heightOutlineOnly: saved.heightOutlineOnly !== false,
      heightShading: saved.heightShading !== false,
      maxZoomFactor: Phaser.Math.Clamp(Number(saved.maxZoomFactor) || DEFAULT_MAX_ZOOM_FACTOR, 6, 16)
    };
  } catch {
    return { heightOutlineOnly: true, heightShading: true, maxZoomFactor: DEFAULT_MAX_ZOOM_FACTOR };
  }
}

function drawTerrain(scene, data, graphics = scene.add.graphics()) {
  const display = readDisplaySettings();
  graphics.clear();
  for (let y = 0; y < data.h; y += 1) {
    for (let x = 0; x < data.w; x += 1) {
      const terrain = String(data.grid?.[y]?.[x] || "海");
      const base = terrainColorMap.get(terrain) || "#607078";
      const level = Number(data.heightLevelMap?.[y]?.[x]);
      const color = display.heightShading
        ? (terrain === "海" ? shadeSeaColorByDepth(base, level) : shadeColorByHeight(base, level))
        : base;
      const p = hexPoints(x, y);
      graphics.fillStyle(colorNumber(color), 1);
      graphics.fillPoints([
        { x:p[0], y:p[1] }, { x:p[2], y:p[3] }, { x:p[4], y:p[5] },
        { x:p[6], y:p[7] }, { x:p[8], y:p[9] }, { x:p[10], y:p[11] }
      ], true);
      if (!display.heightOutlineOnly) {
        graphics.lineStyle(1, 0x26353b, 0.95);
        graphics.strokePoints([
          { x:p[0], y:p[1] }, { x:p[2], y:p[3] }, { x:p[4], y:p[5] },
          { x:p[6], y:p[7] }, { x:p[8], y:p[9] }, { x:p[10], y:p[11] }
        ], true);
      }
    }
  }
  return graphics;
}

function parsePoint(raw) {
  const [x, y] = String(raw || "").split(",").map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
function parseEdge(raw) {
  const [a, b] = String(raw || "").split("|");
  const pa = parsePoint(a); const pb = parsePoint(b);
  return pa && pb ? { a:pa, b:pb } : null;
}
function drawRivers(scene, riverData) {
  const g = scene.add.graphics().setDepth(3);
  g.lineStyle(3, 0x5aa9de, 0.95);
  const edges = new Set([
    ...(riverData?.cornerEdgeSet instanceof Set ? riverData.cornerEdgeSet : []),
    ...(riverData?.cornerWaterLinkSet instanceof Set ? riverData.cornerWaterLinkSet : [])
  ]);
  for (const raw of edges) {
    const e = parseEdge(raw); if (e) g.lineBetween(e.a.x, e.a.y, e.b.x, e.b.y);
  }
  const falls = riverData?.cornerWaterfallEdgeSet instanceof Set ? riverData.cornerWaterfallEdgeSet : new Set();
  g.lineStyle(5, 0xd9f5ff, 1);
  for (const raw of falls) {
    const e = parseEdge(raw); if (!e) continue;
    g.lineBetween(e.a.x, e.a.y, e.b.x, e.b.y);
    g.fillStyle(0xffffff, 0.95); g.fillCircle((e.a.x + e.b.x)/2, (e.a.y + e.b.y)/2, 3);
  }
}

function drawSpecialTerrain(scene, data) {
  const labels = { "沼地":"沼", "峡谷":"峡", "洞窟":"洞" };
  for (let y = 0; y < data.h; y += 1) for (let x = 0; x < data.w; x += 1) {
    const label = labels[String(data.specialMap?.[y]?.[x] || "")];
    if (!label) continue;
    const c = tileCenter(x, y);
    scene.add.text(c.x, c.y, label, { fontSize:"11px", fontStyle:"bold", color:"#f6f0d2", stroke:"#071014", strokeThickness:3 })
      .setOrigin(0.5).setDepth(4);
  }
}

function fitCamera(scene) {
  const camera = scene.cameras.main;
  const size = worldSize();
  const fit = Math.max(0.05, Math.min(camera.width / size.width, camera.height / size.height) * 0.97);
  camera.removeBounds();
  camera.setZoom(fit);
  camera.centerOn(size.width / 2, size.height / 2);
  scene.v39FitZoom = fit;
  scene.v39RequestedZoom = fit;
}

function clampCamera(scene) {
  const camera = scene.cameras.main;
  camera.preRender();
  const size = worldSize();
  const a = camera.getWorldPoint(0, 0);
  const b = camera.getWorldPoint(camera.width, camera.height);
  const vw = b.x - a.x, vh = b.y - a.y;
  if (vw < size.width) {
    if (a.x < 0) camera.scrollX += -a.x;
    else if (b.x > size.width) camera.scrollX += size.width - b.x;
  }
  if (vh < size.height) {
    if (a.y < 0) camera.scrollY += -a.y;
    else if (b.y > size.height) camera.scrollY += size.height - b.y;
  }
}

function resolveTileAtWorld(data, wx, wy) {
  const { width, rowStep, oddRowOffsetX } = tileMetrics();
  const row = Math.floor(wy / rowStep);
  for (let y = row - 1; y <= row + 1; y += 1) {
    if (y < 0 || y >= data.h) continue;
    const col = Math.floor((wx - (y % 2 ? oddRowOffsetX : 0)) / width);
    for (let x = col - 1; x <= col + 1; x += 1) {
      if (x < 0 || x >= data.w) continue;
      const p = hexPoints(x, y);
      let inside = false;
      for (let i = 0, j = 10; i < 12; j = i, i += 2) {
        const xi=p[i], yi=p[i+1], xj=p[j], yj=p[j+1];
        if (((yi > wy) !== (yj > wy)) && wx < ((xj-xi)*(wy-yi))/((yj-yi)||Number.EPSILON)+xi) inside = !inside;
      }
      if (inside) return { x, y };
    }
  }
  return null;
}

function installInput(scene, data) {
  const camera = scene.cameras.main;
  const pointers = new Map();
  const selection = scene.add.graphics().setDepth(20);
  let dragged = false;
  let lastTouchTap = null;

  const clientPoint = (cx, cy) => {
    const rect = host.getBoundingClientRect();
    return { x:(cx-rect.left)*(camera.width/rect.width), y:(cy-rect.top)*(camera.height/rect.height) };
  };
  const zoomAt = (cx, cy, factor) => {
    const p = clientPoint(cx, cy);
    const before = camera.getWorldPoint(p.x, p.y);
    const display = readDisplaySettings();
    const min = Number(scene.v39FitZoom) || camera.zoom;
    const current = Number(scene.v39RequestedZoom) || camera.zoom;
    scene.v39RequestedZoom = Phaser.Math.Clamp(current * factor, min, min * display.maxZoomFactor);
    camera.setZoom(scene.v39RequestedZoom); camera.preRender();
    const after = camera.getWorldPoint(p.x, p.y);
    camera.scrollX += before.x - after.x; camera.scrollY += before.y - after.y;
    clampCamera(scene);
  };
  const selectAt = (cx, cy) => {
    const p = clientPoint(cx, cy); const w = camera.getWorldPoint(p.x, p.y);
    const tile = resolveTileAtWorld(data, w.x, w.y); if (!tile) return;
    const hp = hexPoints(tile.x, tile.y);
    selection.clear().lineStyle(4, 0xffdd72, 1).strokePoints([
      {x:hp[0],y:hp[1]},{x:hp[2],y:hp[3]},{x:hp[4],y:hp[5]},
      {x:hp[6],y:hp[7]},{x:hp[8],y:hp[9]},{x:hp[10],y:hp[11]}
    ], true);
    const selected = {
      x:tile.x, y:tile.y,
      terrain:String(data.grid?.[tile.y]?.[tile.x] || "海"),
      height:Number(data.heightLevelMap?.[tile.y]?.[tile.x]) || 0,
      special:String(data.specialMap?.[tile.y]?.[tile.x] || "")
    };
    scene.v39SelectedTile = selected;
    const landTerrain = document.getElementById("landTerrain"); if (landTerrain) landTerrain.textContent = selected.special || selected.terrain;
    window.dispatchEvent(new CustomEvent("v39:tile-selected", { detail:selected }));
  };

  host.addEventListener("wheel", e => { e.preventDefault(); zoomAt(e.clientX,e.clientY,e.deltaY<0?1.16:1/1.16); }, { passive:false });
  host.addEventListener("pointerdown", e => { if (e.pointerType==="mouse" && e.button!==0) return; pointers.set(e.pointerId,{x:e.clientX,y:e.clientY}); host.setPointerCapture?.(e.pointerId); dragged=false; });
  host.addEventListener("pointermove", e => {
    const prev=pointers.get(e.pointerId); if(!prev)return;
    const old=[...pointers.values()]; pointers.set(e.pointerId,{x:e.clientX,y:e.clientY}); const next=[...pointers.values()];
    if(next.length>=2){ const od=Math.hypot(old[0].x-old[1].x,old[0].y-old[1].y), nd=Math.hypot(next[0].x-next[1].x,next[0].y-next[1].y); if(od>0&&nd>0){zoomAt((next[0].x+next[1].x)/2,(next[0].y+next[1].y)/2,nd/od);dragged=true;} return; }
    const dx=e.clientX-prev.x,dy=e.clientY-prev.y; if(Math.abs(dx)+Math.abs(dy)<1)return;
    camera.scrollX-=dx/camera.zoom; camera.scrollY-=dy/camera.zoom; clampCamera(scene); dragged=true;
  });
  const finish=e=>{ const touch=e.pointerType!=="mouse", select=!dragged&&pointers.size===1; pointers.delete(e.pointerId); host.releasePointerCapture?.(e.pointerId); if(select)selectAt(e.clientX,e.clientY); if(touch&&!dragged&&!pointers.size){const now=performance.now();if(lastTouchTap&&now-lastTouchTap.time<320&&Math.hypot(e.clientX-lastTouchTap.x,e.clientY-lastTouchTap.y)<28){zoomAt(e.clientX,e.clientY,1.5);lastTouchTap=null;}else lastTouchTap={time:now,x:e.clientX,y:e.clientY};} if(!pointers.size)dragged=false;};
  host.addEventListener("pointerup",finish); host.addEventListener("pointercancel",finish);
  host.addEventListener("dblclick",e=>{e.preventDefault();zoomAt(e.clientX,e.clientY,1.5);});

  document.getElementById("v39-map-camera-controls")?.remove();
  const controls=document.createElement("div"); controls.id="v39-map-camera-controls";
  controls.innerHTML='<button type="button" data-map-zoom="in" aria-label="地図を拡大">＋</button><button type="button" data-map-zoom="out" aria-label="地図を縮小">−</button>';
  Object.assign(controls.style,{position:"absolute",left:"6px",bottom:"6px",zIndex:"24",display:"grid",gap:"4px"});
  controls.querySelectorAll("button").forEach(b=>Object.assign(b.style,{width:"38px",height:"38px",border:"1px solid #597078",borderRadius:"7px",background:"rgba(13,27,32,.94)",color:"#e8efec",fontSize:"23px"}));
  const centerZoom=f=>{const r=host.getBoundingClientRect();zoomAt(r.left+r.width/2,r.top+r.height/2,f);};
  controls.querySelector('[data-map-zoom="in"]')?.addEventListener("click",()=>centerZoom(1.3));
  controls.querySelector('[data-map-zoom="out"]')?.addEventListener("click",()=>centerZoom(1/1.3));
  playfield.appendChild(controls);
}

function createGame(data) {
  game = new Phaser.Game({
    type:Phaser.AUTO,parent:host,transparent:false,backgroundColor:"#081115",
    scale:{mode:Phaser.Scale.RESIZE,width:Math.max(1,host.clientWidth),height:Math.max(1,host.clientHeight)},
    scene:{create(){
      const terrainGraphics=drawTerrain(this,data); drawRivers(this,data.riverData); drawSpecialTerrain(this,data); fitCamera(this); installInput(this,data);
      const redraw=()=>drawTerrain(this,data,terrainGraphics); window.addEventListener("v39:display-settings-changed",redraw);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>window.removeEventListener("v39:display-settings-changed",redraw));
      this.scale.on("resize",()=>{const oldZoom=Number(this.v39RequestedZoom)||this.cameras.main.zoom;const size=worldSize(data);const fit=Math.max(.05,Math.min(this.cameras.main.width/size.width,this.cameras.main.height/size.height)*.97);this.v39FitZoom=fit;const max=fit*readDisplaySettings().maxZoomFactor;this.v39RequestedZoom=Phaser.Math.Clamp(oldZoom,fit,max);this.cameras.main.setZoom(this.v39RequestedZoom);clampCamera(this);});
    }}
  });
  return game;
}

function normalizeSettings(input={}) {
  const w=Phaser.Math.Clamp(Math.round(Number(input.w)||60),30,83);
  const h=Phaser.Math.Clamp(Math.round(Number(input.h)||60),30,83);
  const allowedPatterns=new Set(["realistic","balanced","continent","archipelago","twins","chain"]);
  const allowedMountains=new Set(["random","single","multi","mixed"]);
  const custom=input.islandCustomSettings&&typeof input.islandCustomSettings==="object"?input.islandCustomSettings:{};
  const min=Math.min(Number(custom.isletCountMin)||1,Number(custom.isletCountMax)||4),max=Math.max(Number(custom.isletCountMin)||1,Number(custom.isletCountMax)||4);
  return {
    w,h,
    patternId:allowedPatterns.has(input.patternId)?input.patternId:"realistic",
    mountainMode:allowedMountains.has(input.mountainMode)?input.mountainMode:"random",
    islandCustomSettings:{
      enabled:!!custom.enabled,
      largeIslandCount:Phaser.Math.Clamp(Math.round(Number(custom.largeIslandCount)||2),1,8),
      isletCountMin:Phaser.Math.Clamp(Math.round(min),0,12),
      isletCountMax:Phaser.Math.Clamp(Math.round(max),0,12),
      riverPerContinentMin:Phaser.Math.Clamp(Math.round(Math.min(Number(custom.riverPerContinentMin)||3,Number(custom.riverPerContinentMax)||4)),1,12),
      riverPerContinentMax:Phaser.Math.Clamp(Math.round(Math.max(Number(custom.riverPerContinentMin)||3,Number(custom.riverPerContinentMax)||4)),1,12),
      targetLandRatio:Phaser.Math.Clamp(Number(custom.targetLandRatio)||0.5,0.25,0.60),
      largeIslandMinGap:Phaser.Math.Clamp(Math.round(Number(custom.largeIslandMinGap)||6),2,12),
      worldWrapEnabled:custom.worldWrapEnabled!==false
    }
  };
}

export function generateFieldFromSettings(input={}) {
  if (!host) throw new Error("v39 field host is not ready");
  const settings=normalizeSettings(input);
  currentSettings=settings;
  currentData=createTerrainMapData(settings);
  if(game){ game.destroy(true); game=null; host.replaceChildren(); }
  document.getElementById("v39-map-camera-controls")?.remove();
  createGame(currentData);
  const chip=playfield.querySelector(".map-chip");
  if(chip) chip.textContent=`${settings.w}×${settings.h} / ${settings.patternId} / ${settings.mountainMode}`;
  window.__v39FieldRuntime={game,mapData:currentData,settings,mapWidth:settings.w,mapHeight:settings.h,patternId:settings.patternId,mountainMode:settings.mountainMode};
  window.dispatchEvent(new CustomEvent("v39:field-generated",{detail:{settings,mapData:currentData}}));
  return currentData;
}

async function boot(){
  while(!(document.querySelector(".playfield") instanceof HTMLElement)||!document.getElementById("map")) await new Promise(r=>setTimeout(r,25));
  playfield=document.querySelector(".playfield"); referenceMap=document.getElementById("map");
  document.getElementById("v39-phaser-field")?.remove();
  host=document.createElement("div"); host.id="v39-phaser-field"; Object.assign(host.style,{position:"absolute",inset:"0",zIndex:"1",overflow:"hidden",background:"#081115",touchAction:"none"});
  referenceMap.style.visibility="hidden"; referenceMap.style.pointerEvents="none"; playfield.prepend(host);
  const chip=playfield.querySelector(".map-chip"); if(chip) chip.textContent="フィールド未生成 / 管理 → フィールド設定";
  window.generateFieldFromSettings=generateFieldFromSettings;
  window.__v39FieldRuntime={game:null,mapData:null,settings:null};
  window.render_game_to_text=()=>JSON.stringify({screen:"v39-field",generated:!!currentData,settings:currentSettings,selectedTile:game?.scene?.getScenes(true)?.[0]?.v39SelectedTile||null});
  window.advanceTime=()=>window.render_game_to_text();
  window.dispatchEvent(new Event("v39:field-runtime-ready"));
}
boot().catch(error=>console.error("[v39-field-runtime-final] boot failed",error));
