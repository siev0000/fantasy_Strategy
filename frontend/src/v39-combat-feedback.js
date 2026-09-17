import { HEX_TILE_CONFIG } from "./lib/phaser-map-panel-config.js";

const POPUP_DEPTH = 1000010;
const BAR_DEPTH = 1000005;
const BAR_WIDTH = 34;
const BAR_HEIGHT = 4;
const castTweens = new Map();

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

function showDamagePopups(scene, entry, center) {
  if (number(entry?.missCount) > 0 && number(entry?.missCount) >= (Array.isArray(entry?.hits) ? entry.hits.length : 1)) {
    const label = scene.add.text(center.x, center.y - 24, "Miss", {
      fontFamily:"Noto Sans JP, Meiryo, sans-serif", fontSize:"18px", fontStyle:"bold", color:"#bde8ff", stroke:"#102a38", strokeThickness:4
    }).setOrigin(0.5).setDepth(POPUP_DEPTH);
    scene.tweens.add({ targets:label, y:center.y-42, alpha:{ from:1, to:0 }, duration:1400, onComplete:() => label.destroy() });
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
    }).setOrigin(0.5).setDepth(POPUP_DEPTH).setAlpha(0);
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
    .setStrokeStyle(1, 0xd6e0dc, 0.9).setDepth(BAR_DEPTH);
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
  if (detail?.attackerId && (detail?.entries?.length || 0) > 0) stopCastBlink(detail.attackerId);
  if ((detail?.entries?.length || 0) > 0) lungeMarker(detail?.attackerId, detail?.target);
  for (const entry of Array.isArray(detail?.entries) ? detail.entries : []) showEntry(entry);
}

window.addEventListener("v39:combat-log", event => {
  if (window.__v39SuppressCombatEffects === true) return;
  showCombatFeedback(event?.detail);
});
window.addEventListener("v39:combat-presentation", event => showCombatFeedback(event?.detail));
window.addEventListener("v39:cast-started", (event) => startCastBlink(event?.detail?.unitId));
window.addEventListener("v39:cast-ended", (event) => stopCastBlink(event?.detail?.unitId));
window.addEventListener("v39:terrain-damage", (event) => {
  for (const entry of Array.isArray(event?.detail?.entries) ? event.detail.entries : []) showEntry(entry);
});
