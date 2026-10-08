import { HEX_TILE_CONFIG } from "../../lib/phaser-map-panel-config.js";
import { isAliveEnemyAiUnit } from "../../lib/v39-enemy-ai-planner.js";
import { V39_ENEMY_TURN_PRESENTATION_CONFIG } from "../../lib/v39-enemy-ai-config.js";
import { V39_MOVEMENT_PRESENTATION_BALANCE } from "../../lib/v39-gameplay-balance.js";

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const delay = ms => new Promise(resolve => window.setTimeout(resolve, ms));

function activeScene() {
  return window.__v39FieldRuntime?.game?.scene?.getScenes?.(true)?.[0] || null;
}

function tileCenter(tile) {
  const width = number(HEX_TILE_CONFIG?.width, 40);
  const height = number(HEX_TILE_CONFIG?.height, 48);
  const rowStep = number(HEX_TILE_CONFIG?.rowStep, 36);
  const y = Math.floor(number(tile?.y));
  return {
    x:Math.floor(number(tile?.x)) * width + (y % 2 ? number(HEX_TILE_CONFIG?.oddRowOffsetX, width / 2) : 0) + width / 2,
    y:y * rowStep + height / 2
  };
}

function visibleTile(tile) {
  return tile && window.isV39TileInCurrentVision?.(Math.floor(number(tile.x)), Math.floor(number(tile.y))) === true;
}

function visibleEnemyEvent(event, livingIds) {
  const enemyId = String(event?.enemyId || event?.attackerId || "").trim();
  // 計算後に死亡した敵の過去の移動演出で、死体を動かさない。
  if (event?.type === "move" && !livingIds.has(enemyId)) return false;
  const visibleAttackTarget = event?.type === "attack" && visibleTile(event?.target);
  // 移動などは未発見の敵を見せない。攻撃だけは、攻撃先が視界内なら
  // 攻撃者が未発見でも着弾エフェクトを描画し、被攻撃を視覚的に伝える。
  if (enemyId && window.isV39EntityDetected?.(enemyId) === false && !visibleAttackTarget) return false;
  return event?.visible === true || visibleAttackTarget || visibleTile(event?.to) || visibleTile(event?.target) || visibleTile(event?.from);
}

async function focusTile(tile, previousTile) {
  const scene = activeScene();
  const camera = scene?.cameras?.main;
  if (!camera || !tile) return;
  const nearPrevious = previousTile
    && Math.abs(number(previousTile.x)-number(tile.x)) <= 2
    && Math.abs(number(previousTile.y)-number(tile.y)) <= 2;
  if (nearPrevious) return;
  const center = tileCenter(tile);
  camera.pan(center.x, center.y, 220, "Sine.easeInOut");
  await delay(240);
}

function pairTileDistance(from, target) {
  if (!from || !target) return Number.POSITIVE_INFINITY;
  const map = window.__v39FieldRuntime?.mapData;
  let dx = Math.abs(Math.floor(number(from.x))-Math.floor(number(target.x)));
  let dy = Math.abs(Math.floor(number(from.y))-Math.floor(number(target.y)));
  const mapW = Math.max(0, Math.floor(number(map?.w)));
  const mapH = Math.max(0, Math.floor(number(map?.h)));
  if (mapW > 0) dx = Math.min(dx, Math.max(0, mapW-dx));
  if (mapH > 0) dy = Math.min(dy, Math.max(0, mapH-dy));
  return Math.max(dx, dy);
}

function canRevealAttacker(event) {
  const attackerId = String(event?.attackerId || event?.enemyId || "").trim();
  if (!event?.from || !visibleTile(event.from)) return false;
  return !attackerId || window.isV39EntityDetected?.(attackerId) !== false;
}

function resolveAttackFrame(camera, event) {
  const target = event?.target;
  if (!camera || !target) return null;
  const targetCenter = tileCenter(target);
  const attackerVisible = canRevealAttacker(event);
  const nearZoom = Math.max(0.08, number(V39_ENEMY_TURN_PRESENTATION_CONFIG.nearAttackZoom, 1.5));
  if (!attackerVisible || !event?.from) {
    return { center:targetCenter, zoom:nearZoom, mode:"target-only" };
  }

  const fromCenter = tileCenter(event.from);
  const center = {
    x:(fromCenter.x + targetCenter.x) / 2,
    y:(fromCenter.y + targetCenter.y) / 2
  };
  const distance = pairTileDistance(event.from, target);
  if (distance <= Math.max(1, number(V39_ENEMY_TURN_PRESENTATION_CONFIG.nearAttackDistanceTiles, 3))) {
    return { center, zoom:nearZoom, mode:"near" };
  }

  const tileWidth = Math.max(1, number(HEX_TILE_CONFIG?.width, 40));
  const tileHeight = Math.max(1, number(HEX_TILE_CONFIG?.height, 48));
  const paddingTiles = Math.max(0, number(V39_ENEMY_TURN_PRESENTATION_CONFIG.farAttackPaddingTiles, 2));
  const spanW = Math.abs(fromCenter.x-targetCenter.x) + tileWidth * paddingTiles * 2;
  const spanH = Math.abs(fromCenter.y-targetCenter.y) + tileHeight * paddingTiles * 2;
  const scene = activeScene();
  const viewW = Math.max(1, number(camera.width, number(scene?.scale?.width, window.innerWidth || 1)));
  const viewH = Math.max(1, number(camera.height, number(scene?.scale?.height, window.innerHeight || 1)));
  const fitZoom = Math.min(viewW / Math.max(1, spanW), viewH / Math.max(1, spanH), nearZoom);
  return { center, zoom:Math.max(0.08, fitZoom), mode:"far" };
}

async function applyAttackFrame(event) {
  const scene = activeScene();
  const camera = scene?.cameras?.main;
  const frame = resolveAttackFrame(camera, event);
  if (!camera || !frame) return false;

  const panMs = Math.max(0, number(V39_ENEMY_TURN_PRESENTATION_CONFIG.cameraPanMs, 220));
  const zoomMs = Math.max(0, number(V39_ENEMY_TURN_PRESENTATION_CONFIG.cameraZoomMs, 220));
  const zoomThreshold = Math.max(0, number(V39_ENEMY_TURN_PRESENTATION_CONFIG.zoomChangeThreshold, 0.12));
  const currentZoom = Math.max(0.01, number(camera.zoom, 1));
  const zoomDelta = frame.zoom-currentZoom;
  const shouldChangeZoom = frame.mode === "far"
    ? (zoomDelta < -0.01 || zoomDelta > zoomThreshold)
    : Math.abs(zoomDelta) > zoomThreshold;

  if (typeof camera.pan === "function") {
    camera.pan(frame.center.x, frame.center.y, panMs, "Sine.easeInOut", true);
  } else {
    camera.centerOn?.(frame.center.x, frame.center.y);
  }

  if (shouldChangeZoom) {
    if (typeof camera.zoomTo === "function") {
      camera.zoomTo(frame.zoom, zoomMs, "Sine.easeInOut", true);
    } else {
      camera.setZoom?.(frame.zoom);
    }
  }

  await delay(Math.max(panMs, shouldChangeZoom ? zoomMs : 0) + 20);
  return shouldChangeZoom;
}

async function restorePresentationZoom(camera, initialZoom, changed) {
  if (!camera || !changed) return;
  const targetZoom = Math.max(0.01, number(initialZoom, camera.zoom || 1));
  if (Math.abs(number(camera.zoom, targetZoom)-targetZoom) <= 0.01) return;
  const duration = Math.max(0, number(V39_ENEMY_TURN_PRESENTATION_CONFIG.restoreZoomMs, 220));
  if (typeof camera.zoomTo === "function") {
    camera.zoomTo(targetZoom, duration, "Sine.easeInOut", true);
    await delay(duration + 20);
  } else {
    camera.setZoom?.(targetZoom);
  }
}

async function playMove(event, duration) {
  if (!isAliveEnemyAiUnit((window.getV39EnemyTurnState?.()?.enemies || []).find(enemy => String(enemy?.id) === String(event.enemyId)))) return;
  const marker = window.getV39MapEntityMarker?.(event.enemyId);
  if (!marker || !event.from || !event.to) return;
  const scene = activeScene();
  const from = tileCenter(event.from);
  const to = tileCenter(event.to);
  const map = window.__v39FieldRuntime?.mapData;
  // 視界外の経路とワールド端を横断する線は見せず、見えている到着点だけ反映する。
  if (!visibleTile(event.from) || !visibleTile(event.to)
    || Math.abs(event.to.x-event.from.x) > map?.w / 2 || Math.abs(event.to.y-event.from.y) > map?.h / 2) {
    marker.setPosition(to.x, to.y);
    return;
  }
  marker.setPosition(from.x, from.y);
  await new Promise(resolve => {
    scene?.tweens?.add?.({ targets:marker, x:to.x, y:to.y, duration, ease:"Linear", onComplete:resolve, onStop:resolve });
    window.setTimeout(resolve, duration + 100);
    if (!scene?.tweens) resolve();
  });
}

async function playAttack(event) {
  const target = event.target;
  if (!target) return false;
  const zoomChanged = await applyAttackFrame(event);
  await delay(Math.max(0, number(V39_ENEMY_TURN_PRESENTATION_CONFIG.preAttackPauseMs, 500)));
  await window.playV39MapEffect?.({
    effectName:event.effectName || "斬撃",
    tileX:target.x,
    tileY:target.y,
    splash:Math.max(0, number(event.skillRow?.炸裂))
  });
  for (const detail of Array.isArray(event.combatLogs) ? event.combatLogs : []) {
    window.dispatchEvent(new CustomEvent("v39:combat-presentation", { detail }));
  }
  return zoomChanged;
}

export async function playV39EnemyTurnPresentation(events = []) {
  const livingIds = new Set((window.getV39EnemyTurnState?.()?.enemies || []).filter(isAliveEnemyAiUnit).map(enemy => String(enemy.id)));
  const visibleEvents = (Array.isArray(events) ? events : []).filter(event => visibleEnemyEvent(event, livingIds));
  const moveCounts = new Map();
  for (const event of visibleEvents) if (event.type === "move") {
    moveCounts.set(event.enemyId, (moveCounts.get(event.enemyId) || 0) + 1);
  }
  const presentationCamera = activeScene()?.cameras?.main || null;
  const initialZoom = presentationCamera ? number(presentationCamera.zoom, 1) : 1;
  let presentationZoomChanged = false;
  let previousTile = null;
  try {
    for (const event of visibleEvents) {
      if (event.type === "move") {
        const focus = event.to || event.from;
        await focusTile(focus, previousTile);
        await playMove(event, Math.min(V39_MOVEMENT_PRESENTATION_BALANCE.stepMs,
          V39_MOVEMENT_PRESENTATION_BALANCE.maxDurationMs / moveCounts.get(event.enemyId)));
        previousTile = focus;
        continue;
      }
      if (event.type === "attack") {
        presentationZoomChanged = await playAttack(event) || presentationZoomChanged;
        previousTile = event.target || event.from || previousTile;
      }
    }
  } finally {
    await restorePresentationZoom(presentationCamera, initialZoom, presentationZoomChanged);
    window.dispatchEvent(new CustomEvent("v39:enemy-turn-presentation-complete", { detail:{ eventCount:visibleEvents.length } }));
  }
  return visibleEvents.length;
}

window.playV39EnemyTurnPresentation = playV39EnemyTurnPresentation;
