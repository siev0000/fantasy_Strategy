import { PhaserEffectPlayer } from "../../配布用/アニメーション再生機能/phaser-effect-player.mjs";
import effectList320 from "../../assets/effect/320×240/effect_list.json";
import effectListAnimation1 from "../../assets/effect/アニメーション1/effect_list.json";
import { HEX_TILE_CONFIG } from "./lib/phaser-map-panel-config.js";

const sources = new Map();

function assetUrl(folder, name) {
  return `/assets/effect/${encodeURIComponent(folder)}/${encodeURIComponent(name)}.webp`;
}

function registerSources(folder, names, sourceScaleMultiplier) {
  for (const rawName of Array.isArray(names) ? names : []) {
    const name = String(rawName || "").trim();
    if (!name || sources.has(name)) continue;
    sources.set(name, { src:assetUrl(folder, name), sourceScaleMultiplier });
  }
}

registerSources("320×240", effectList320, 1);
registerSources("アニメーション1", effectListAnimation1, 2);

let player = null;
let playerScene = null;

function text(value, fallback = "") {
  return String(value ?? "").trim() || fallback;
}

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

function effectPlayer() {
  const scene = activeScene();
  if (!scene) return null;
  if (player && playerScene === scene) return player;
  player?.destroy?.();
  playerScene = scene;
  player = new PhaserEffectPlayer(scene, { totalDurationMs:4000, sequenceGapMs:10, depth:1000000 });
  return player;
}

function resolveSequence(rawName) {
  const names = text(rawName, "斬撃").split(":").map((name) => text(name)).filter(Boolean);
  const resolved = names.map((name) => ({ name, source:sources.get(name) })).filter((entry) => entry.source);
  if (resolved.length) return resolved;
  const fallback = sources.get("斬撃");
  return fallback ? [{ name:"斬撃", source:fallback }] : [];
}

export async function playV39MapEffect(request = {}) {
  const targetPlayer = effectPlayer();
  if (!targetPlayer) return false;
  const x = number(request.x ?? request.tileX, Number.NaN);
  const y = number(request.y ?? request.tileY, Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (request.allowInFog !== true && window.isV39TileInCurrentVision?.(Math.floor(x), Math.floor(y)) === false) return false;
  const position = request.worldX !== undefined && request.worldY !== undefined
    ? { x:number(request.worldX), y:number(request.worldY) }
    : tileCenter(x, y);
  const sequence = resolveSequence(request.effectName ?? request.name ?? request.animation);
  if (!sequence.length) return false;
  const splash = Math.max(0, number(request.splash, 0));
  const scalePercent = Math.max(10, number(request.scalePercent, 50 * (1 + splash)));
  console.info("[エフェクト再生]", {
    アニメーション:sequence.map((entry) => entry.name),
    対象座標:{ x, y },
    大きさ:`${scalePercent}%`,
    角度:number(request.angleDeg, 0)
  });
  return targetPlayer.play({
    x:position.x,
    y:position.y,
    sequenceSources:sequence.map((entry) => entry.source),
    scalePercent,
    angleDeg:number(request.angleDeg, 0),
    tint:request.tint ?? null,
    colorStrengthPercent:number(request.colorStrengthPercent, 100),
    hueAnimationDegPerFrame:number(request.hueAnimationDegPerFrame, 0),
    grayscaleBase:request.grayscaleBase === true,
    renderStyle:text(request.renderStyle, "soft"),
    showPreviousFrameGhost:request.showPreviousFrameGhost !== false,
    totalDurationMs:number(request.totalDurationMs, 4000),
    sequenceGapMs:number(request.sequenceGapMs, 10),
    depth:number(request.depth, 1000000),
    displayName:"v39-effect-image"
  });
}

window.addEventListener("v39:field-generated", () => {
  player?.destroy?.();
  player = null;
  playerScene = null;
});
window.playV39MapEffect = playV39MapEffect;
window.getV39EffectCatalog = () => [...sources.keys()];
