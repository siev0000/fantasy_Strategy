import { HEX_TILE_CONFIG } from "../../lib/phaser-map-panel-config.js";
import { addV39FieldSymbol } from "../map/v39-field-symbols.js";

const POPUP_DEPTH = 1000010;
const BAR_DEPTH = 1000005;
const BAR_WIDTH = 34;
const BAR_HEIGHT = 4;
const castTweens = new Map();
let pendingHazardFeedback = [];

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function activeScene() {
  return window.__v39FieldRuntime?.game?.scene?.getScenes?.(true)?.[0] || null;
}

function tileCenter(x, y) {
  const width = number(HEX_TILE_CONFIG?.width, 40);
  const height = number(HEX_TILE_CONFIG?.height, 48);
  const rowStep = number(HEX_TILE_CONFIG?.rowStep, 36);
  const oddRowOffsetX = number(HEX_TILE_CONFIG?.oddRowOffsetX, width / 2);
  return {
    x:(Math.floor(number(x)) * width) + (Math.floor(number(y)) % 2 ? oddRowOffsetX : 0) + width / 2,
    y:(Math.floor(number(y)) * rowStep) + height / 2
  };
}

function flashMarker(targetId) {
  window.setTimeout(() => {
    const scene = activeScene();
    const marker = window.getV39MapEntityMarker?.(targetId);
    if (!scene?.tweens || !marker?.scene) return;
    scene.tweens.add({ targets:marker, alpha:0.25, duration:90, yoyo:true, repeat:3 });
  }, 30);
}

function stopCastBlink(unitId) {
  const key = String(unitId || "");
  const tween = castTweens.get(key);
  if (tween) tween.stop();
  castTweens.delete(key);
  const marker = window.getV39MapEntityMarker?.(key);
  marker?.setAlpha?.(1);
}

function startCastBlink(unitId) {
  const key = String(unitId || "");
  window.setTimeout(() => {
    stopCastBlink(key);
    const scene = activeScene();
    const marker = window.getV39MapEntityMarker?.(key);
    if (!scene?.tweens || !marker?.scene) return;
    castTweens.set(key, scene.tweens.add({ targets:marker, alpha:0.25, duration:260, yoyo:true, repeat:-1 }));
  }, 80);
}

function lungeMarker(attackerId, target) {
  window.setTimeout(() => {
    const scene = activeScene();
    const marker = window.getV39MapEntityMarker?.(attackerId);
    if (!scene?.tweens || !marker?.scene || !Number.isFinite(Number(target?.x)) || !Number.isFinite(Number(target?.y))) return;
    const destination = tileCenter(target.x, target.y);
    const dx = destination.x-marker.x;
    const dy = destination.y-marker.y;
    const length = Math.max(1, Math.hypot(dx,dy));
    scene.tweens.add({
      targets:marker,
      x:marker.x+(dx/length)*8,
      y:marker.y+(dy/length)*8,
      duration:90,
      yoyo:true,
      ease:"Quad.Out"
    });
  }, 30);
}

function showOutcomePopup(scene, center, message) {
  const label = addV39FieldSymbol(scene,null,message==='Miss'?'miss':'blocked',center.x,center.y-24,22,
    {color:0xbde8ff,name:'v39-combat-outcome-icon',label:message}).setDepth(POPUP_DEPTH);
  scene.tweens.add({ targets:label, y:center.y-42, alpha:{ from:1, to:0 }, duration:1400, onComplete:() => label.destroy() });
}

function showDamagePopups(scene, entry, center) {
  if (number(entry?.missCount) > 0 && number(entry?.missCount) >= (Array.isArray(entry?.hits) ? entry.hits.length : 1)) {
    showOutcomePopup(scene, center, "Miss");
    return;
  }
  const hits = (Array.isArray(entry?.hits) ? entry.hits : []).map((value) => Math.max(0, Math.floor(number(value))));
  if (!hits.length) return;
  let cumulative = 0;
  hits.forEach((hit, index) => {
    cumulative += hit;
    const final = index === hits.length - 1;
    const label = scene.add.text(center.x, center.y - 24, String(cumulative), {
      fontFamily:"Noto Sans JP, Meiryo, sans-serif",
      fontSize:"18px",
      fontStyle:"bold",
      color:final ? "#fff4ef" : "#ffd15a",
      stroke:"#38100b",
      strokeThickness:4
    }).setOrigin(0.5).setDepth(POPUP_DEPTH).setAlpha(0)
      .setName('v39-damage-popup').setData('targetId',entry.targetId).setData('damage',cumulative);
    scene.tweens.add({
      targets:label,
      alpha:{ from:0, to:1 },
      y:center.y - 42,
      delay:index * 260,
      duration:220,
      hold:1250,
      yoyo:true,
      onComplete:() => label.destroy()
    });
  });
}

function showDelayedHpBar(scene, entry, center) {
  if (number(entry?.total) <= 0) return;
  const maxHp = Math.max(1, number(entry?.maxHp, 1));
  const beforeRate = Math.max(0, Math.min(1, number(entry?.beforeHp) / maxHp));
  const afterRate = Math.max(0, Math.min(1, number(entry?.afterHp) / maxHp));
  const left = center.x - BAR_WIDTH / 2;
  const y = center.y + 27;
  const objects = [];
  const background = scene.add.rectangle(center.x, y, BAR_WIDTH + 2, BAR_HEIGHT + 2, 0x101719, 0.96)
    .setStrokeStyle(1, 0xd6e0dc, 0.9).setDepth(BAR_DEPTH)
    .setName('v39-damage-hp-bar').setData('targetId',entry.targetId).setData('beforeHp',entry.beforeHp).setData('afterHp',entry.afterHp);
  const remaining = scene.add.rectangle(left, y, BAR_WIDTH * afterRate, BAR_HEIGHT, afterRate <= 0.2 ? 0xd34235 : afterRate <= 0.5 ? 0xd5b438 : 0x55c878)
    .setOrigin(0, 0.5).setDepth(BAR_DEPTH + 1);
  const lostWidth = Math.max(0, BAR_WIDTH * (beforeRate - afterRate));
  const lost = scene.add.rectangle(left + BAR_WIDTH * afterRate, y, lostWidth, BAR_HEIGHT, 0xe4473b)
    .setOrigin(0, 0.5).setDepth(BAR_DEPTH + 2);
  objects.push(background, remaining, lost);
  scene.tweens.add({
    targets:lost,
    scaleX:0,
    delay:1000,
    duration:650,
    ease:"Cubic.In",
    onComplete:() => scene.time.delayedCall(350, () => objects.forEach((object) => object.destroy()))
  });
}

function showEntry(entry) {
  const scene = activeScene();
  if (!scene || !Number.isFinite(Number(entry?.x)) || !Number.isFinite(Number(entry?.y))) return;
  const center = tileCenter(entry.x, entry.y);
  flashMarker(entry.targetId);
  showDamagePopups(scene, entry, center);
  showDelayedHpBar(scene, entry, center);
}

function showCombatFeedback(detail) {
  const scene = activeScene(), obstruction = detail?.obstruction;
  if (scene && obstruction && Number.isFinite(obstruction.x) && Number.isFinite(obstruction.y)) {
    showOutcomePopup(scene, tileCenter(obstruction.x, obstruction.y), obstruction.message);
  }
  if (detail?.attackerId && (detail?.entries?.length || 0) > 0) stopCastBlink(detail.attackerId);
  if ((detail?.entries?.length || 0) > 0) lungeMarker(detail?.attackerId, detail?.target);
  for (const entry of Array.isArray(detail?.entries) ? detail.entries : []) showEntry(entry);
}

window.addEventListener("v39:combat-log", event => {
  if (window.__v39SuppressCombatEffects === true) return;
  showCombatFeedback(event?.detail);
});
window.addEventListener("v39:combat-presentation", event => showCombatFeedback(event?.detail));
window.addEventListener("v39:cast-started", (event) => {if(!window.__v39BackgroundWorldTurn&&!event?.detail?.aimAfterCast)startCastBlink(event?.detail?.unitId);});
window.addEventListener("v39:cast-ended", (event) => stopCastBlink(event?.detail?.unitId));

function showHazardFeedback(entries,worldId) {
  if(window.__v39AiSimulationRunning)return;
  if(!entries?.length||window.__v39BackgroundWorldTurn)return;
  const state=window.getV39EnemyTurnState?.()||window.getV39GameState?.({includeWorlds:false});
  const visibleWorld=state?.activeWorldId||'surface';
  if(worldId&&worldId!==visibleWorld)return;
  const units=[...(state?.players||[]).flatMap(player=>player.factionState?.units||[]),...(state?.enemies||[]),
    ...(state?.neutralVillages||[]).flatMap(village=>village.defenseUnits||[])];
  const byId=new Map(units.map(unit=>[unit.id,unit]));
  for(const entry of entries||[]){
    if(entry.visibleAtDamage===false)continue;
    const targetId=entry.targetId||entry.unitId,unit=byId.get(targetId);
    if(!targetId||!Number.isFinite(Number(entry.x))||!Number.isFinite(Number(entry.y)))continue;
    if(entry.visibleAtDamage!==true&&window.isV39TestMode?.()!==true
      &&!state?.players?.find(player=>player.id===state.activePlayerId)?.factionState?.units?.some(row=>row.id===targetId)
      &&!(window.isV39TileInCurrentVision?.(entry.x,entry.y)===true&&unit&&window.isV39EntityDetected?.(unit)!==false))continue;
    const normalized={...entry,targetId,total:number(entry.total,number(entry.damage)),
      maxHp:Math.max(1,number(entry.maxHp,number(unit?.maxHp,number(entry.beforeHp,1)))),
      hits:Array.isArray(entry.hits)?entry.hits:[number(entry.damage)],worldId:visibleWorld};
    if(state?.timeline?.phase==='resolution')pendingHazardFeedback.push(normalized);
    else showEntry(normalized);
  }
}

window.flushV39HazardFeedback=()=>{
  const worldId=window.getV39EnemyTurnState?.()?.activeWorldId||'surface',grouped=new Map();
  for(const entry of pendingHazardFeedback){
    if(entry.worldId!==worldId)continue;
    const previous=grouped.get(entry.targetId);
    grouped.set(entry.targetId,previous?{...entry,beforeHp:previous.beforeHp,total:previous.total+entry.total,hits:[...previous.hits,...entry.hits]}:entry);
  }
  pendingHazardFeedback=[];
  for(const entry of grouped.values())showEntry(entry);
  return grouped.size;
};
window.addEventListener('v39:field-generated',()=>{pendingHazardFeedback=[];});
window.addEventListener('v39:natural-events-resolved',event=>showHazardFeedback(event.detail?.damageEntries,event.detail?.worldId));
window.addEventListener('v39:terrain-damage',event=>showHazardFeedback(event.detail?.entries,event.detail?.worldId));
