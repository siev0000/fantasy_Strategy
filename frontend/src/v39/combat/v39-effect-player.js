import { PhaserEffectPlayer } from "../../../../配布用/アニメーション再生機能/phaser-effect-player.mjs";
import effectList320 from "../../../../assets/effect/320×240/effect_list.json";
import effectListAnimation1 from "../../../../assets/effect/アニメーション1/effect_list.json";
import { HEX_TILE_CONFIG } from "../../lib/phaser-map-panel-config.js";
import { resolveV39EffectPlaybackSettings, setV39EffectSettingsCatalog } from "../../lib/v39-effect-settings.js";
import { normalizeV39EffectTransform, resolveV39EffectTransform, resolveV39EffectBeam, V39_EFFECT_BASE_SCALE_PERCENT } from "../../lib/v39-effect-transform.js";
import { getV39EffectCategories } from "../../lib/v39-effect-category-settings.js";
import { getV39EffectAttributes } from "../../lib/v39-effect-attribute-settings.js";
import { resolveV39CombatEffect } from "../../lib/v39-combat-effect-rules.js";
import { resolveV39EffectAreaGeometry } from "../../lib/v39-effect-area-geometry.js";
import { MAP_ENTITY_SIZE_RULES } from "../../lib/map-entity-size-rules.js";

const sources = new Map();
const EFFECT_TOTAL_DURATION_MS = 1500;

function assetUrl(folder, name) {
  const baseUrl = String(import.meta.env.BASE_URL || "/");
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}assets/effect/${encodeURIComponent(folder)}/${encodeURIComponent(name)}.webp`;
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
const extraImages = import.meta.glob("../../../../assets/effect/アニメーション追記/*.webp", { eager:true, query:"?url", import:"default" });
for (const [path, src] of Object.entries(extraImages)) {
  const name = path.split("/").at(-1).replace(/\.webp$/i, "");
  if (!sources.has(name)) sources.set(name, { src, sourceScaleMultiplier:1 });
}
setV39EffectSettingsCatalog([...sources.keys()]);

export function getV39EffectImageSource(name) {
  return sources.get(name) || null;
}

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
  player = new PhaserEffectPlayer(scene, { totalDurationMs:EFFECT_TOTAL_DURATION_MS, sequenceGapMs:10, depth:1000000 });
  const ownedPlayer=player;
  const release=()=>{
    scene.events.off('sleep',release);scene.events.off('shutdown',release);
    ownedPlayer.destroy();
    if(player===ownedPlayer){player=null;playerScene=null;}
  };
  scene.events.once('sleep',release);scene.events.once('shutdown',release);
  return player;
}

function resolveSequence(rawName) {
  const names = text(rawName, "斬撃").split(":").map((name) => text(name)).filter(Boolean);
  const resolved = names.map((name) => ({ name, source:sources.get(name) })).filter((entry) => entry.source);
  if (resolved.length) return resolved;
  const fallback = sources.get("斬撃");
  return fallback ? [{ name:"斬撃", source:fallback }] : [];
}

export function resolveV39EffectPlaybackDescriptor(rawName) {
  const requestedEffectName = text(rawName, "斬撃");
  const playbackSettings = resolveV39EffectPlaybackSettings(requestedEffectName);
  const sequence = resolveSequence(playbackSettings.sequenceName);
  if (!sequence.length) return null;
  return {
    requestedEffectName,
    sequenceName:playbackSettings.sequenceName,
    sequenceSources:sequence.map((entry) => ({ ...entry.source })),
    tint:playbackSettings.tint || null,
    gradientEnabled:playbackSettings.gradientEnabled === true,
    orientToAttack:playbackSettings.orientToAttack === true,
    ...normalizeV39EffectTransform(playbackSettings),
    gradientColorA:playbackSettings.gradientColorA,
    gradientColorB:playbackSettings.gradientColorB,
    gradientDirection:playbackSettings.gradientDirection,
    gradientMotionMode:playbackSettings.gradientMotionMode,
    gradientStartPercent:playbackSettings.gradientStartPercent,
    gradientEndPercent:playbackSettings.gradientEndPercent,
    colorStrengthPercent:playbackSettings.colorStrengthPercent,
    gradientSpeedPercentPerSecond:number(playbackSettings.gradientSpeedPercentPerSecond, 0),
    scaleMultiplierPercent:number(playbackSettings.scaleMultiplierPercent, 100)
  };
}

function requestValue(request, key, fallback) {
  return Object.prototype.hasOwnProperty.call(request, key) ? request[key] : fallback;
}

export async function playV39MapEffect(request = {}) {
  const targetPlayer = effectPlayer();
  if (!targetPlayer) return false;
  const x = number(request.x ?? request.tileX, Number.NaN);
  const y = number(request.y ?? request.tileY, Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const areaTiles=request.areaTiles || [];
  const area=areaTiles.length>1 || (request.fitArea && areaTiles.length)
    ? resolveV39EffectAreaGeometry(areaTiles,MAP_ENTITY_SIZE_RULES.defenseField.coverageScale) : null;
  const visionTiles=areaTiles.length ? areaTiles : [{x,y}];
  if (request.allowInFog !== true && !visionTiles.some(tile=>window.isV39TileInCurrentVision?.(tile.x,tile.y) !== false)) return false;
  const position = area || (request.worldX !== undefined && request.worldY !== undefined
    ? { x:number(request.worldX), y:number(request.worldY) }
    : tileCenter(x, y));
  const combatEffect = request.skillRow ? resolveV39CombatEffect(request.skillRow, request.attacker,
    getV39EffectCategories(), getV39EffectAttributes()) : null;
  const requestedEffectName = combatEffect?.effectName || text(request.effectName ?? request.name ?? request.animation, "斬撃");
  const playbackSettings = { ...resolveV39EffectPlaybackSettings(requestedEffectName), ...combatEffect?.settings };
  const origin = request.attackerTile ? tileCenter(request.attackerTile.x, request.attackerTile.y) : null;
  const attackAngle = origin ? Math.atan2(position.y - origin.y, position.x - origin.x) * 180 / Math.PI : 0;
  const endpoint=request.worldX !== undefined && request.worldY !== undefined ? {x:number(request.worldX),y:number(request.worldY)} : tileCenter(x,y);
  const beam=resolveV39EffectBeam(playbackSettings,origin,endpoint);
  const transform = beam || resolveV39EffectTransform(area ? {...playbackSettings,offsetX:0,offsetY:0} : playbackSettings, position, attackAngle, request.angleDeg);
  const angleDeg = transform.angleDeg;
  const sequence = resolveSequence(playbackSettings.sequenceName);
  if (!sequence.length) return false;
  const splash = Math.max(0, number(request.splash, 0));
  const requestedScalePercent = Math.max(10, number(request.scalePercent, V39_EFFECT_BASE_SCALE_PERCENT * (1 + splash)));
  const scaleMultiplier = Math.max(0.1, number(playbackSettings.scaleMultiplierPercent, 100) / 100);
  const scalePercent = Math.max(10, requestedScalePercent * scaleMultiplier);
  const tint = requestValue(request, "tint", playbackSettings.tint || null);
  const gradientEnabled = requestValue(request, "gradientEnabled", playbackSettings.gradientEnabled === true) === true;
  const gradientColorA = requestValue(request, "gradientColorA", playbackSettings.gradientColorA);
  const gradientColorB = requestValue(request, "gradientColorB", playbackSettings.gradientColorB);
  const gradientDirection = requestValue(request, "gradientDirection", playbackSettings.gradientDirection);
  const gradientMotionMode = requestValue(request, "gradientMotionMode", playbackSettings.gradientMotionMode);
  const gradientStartPercent = requestValue(request, "gradientStartPercent", playbackSettings.gradientStartPercent);
  const gradientEndPercent = requestValue(request, "gradientEndPercent", playbackSettings.gradientEndPercent);
  const gradientSpeedPercentPerSecond = requestValue(
    request,
    "gradientSpeedPercentPerSecond",
    playbackSettings.gradientSpeedPercentPerSecond
  );
  console.info("[エフェクト再生]", {
    元アニメーション:requestedEffectName,
    選択方法:combatEffect?.reason || "直接指定",
    基本カテゴリ:combatEffect?.categoryId || "",
    着色属性:combatEffect?.attributeName || "",
    アニメーション:sequence.map((entry) => entry.name),
    対象座標:{ x, y },
    大きさ:`${scalePercent}%`,
    角度:angleDeg,
    表示位置:{ x:transform.x, y:transform.y },
    範囲マス数:areaTiles.length,
    範囲表示直径:area ? area.diameter * Math.max(1,scaleMultiplier) : null,
    tint,
    gradient:gradientEnabled ? {
      colorA:gradientColorA,
      colorB:gradientColorB,
      direction:gradientDirection,
      motionMode:gradientMotionMode,
      speedPercentPerSecond:gradientSpeedPercentPerSecond
    } : null
  });
  const endRender = activeScene()?.game?.v39BeginEffectRender?.();
  try {
    return await targetPlayer.play({
      x:transform.x,
      y:transform.y,
      sequenceSources:sequence.map((entry) => entry.source),
      scalePercent,
      fitDiameterPx:!beam && area ? area.diameter * Math.max(1,scaleMultiplier) : undefined,
      stretchLengthPx:beam?.stretchLengthPx,
      stretchAxis:beam?.stretchAxis,
      angleDeg,
      tint,
      gradientEnabled,
      gradientColorA,
      gradientColorB,
      gradientDirection,
      gradientMotionMode,
      gradientStartPercent,
      gradientEndPercent,
      gradientSpeedPercentPerSecond:number(gradientSpeedPercentPerSecond, 0),
      colorStrengthPercent:number(requestValue(request, "colorStrengthPercent", playbackSettings.colorStrengthPercent), 100),
      hueAnimationDegPerFrame:number(request.hueAnimationDegPerFrame, 0),
      grayscaleBase:request.grayscaleBase === true,
      renderStyle:text(request.renderStyle, "soft"),
      showPreviousFrameGhost:request.showPreviousFrameGhost !== false,
      totalDurationMs:number(request.totalDurationMs, EFFECT_TOTAL_DURATION_MS),
      sequenceGapMs:number(request.sequenceGapMs, 10),
      depth:number(request.depth, 1000000),
      displayName:"v39-effect-image",
      onFrame:request.onFrame
    });
  } finally { endRender?.(); }
}

window.addEventListener("v39:field-generated", () => {
  player?.destroy?.();
  player = null;
  playerScene = null;
});
window.playV39MapEffect = playV39MapEffect;
window.getV39EffectCatalog = () => [...sources.keys()];
