import { HEX_TILE_CONFIG } from "../../lib/phaser-map-panel-config.js";
import { isAliveEnemyAiUnit } from "../../lib/v39-enemy-ai-planner.js";
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
  if (enemyId && window.isV39EntityDetected?.(enemyId) === false) return false;
  return event?.visible === true || visibleTile(event?.to) || visibleTile(event?.target) || visibleTile(event?.from);
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
  if (!target) return;
  await window.playV39MapEffect?.({
    effectName:event.effectName || "斬撃",
    tileX:target.x,
    tileY:target.y,
    splash:Math.max(0, number(event.skillRow?.炸裂))
  });
  for (const detail of Array.isArray(event.combatLogs) ? event.combatLogs : []) {
    window.dispatchEvent(new CustomEvent("v39:combat-presentation", { detail }));
  }
}

export async function playV39EnemyTurnPresentation(events = []) {
  const livingIds = new Set((window.getV39EnemyTurnState?.()?.enemies || []).filter(isAliveEnemyAiUnit).map(enemy => String(enemy.id)));
  const visibleEvents = (Array.isArray(events) ? events : []).filter(event => visibleEnemyEvent(event, livingIds));
  const moveCounts = new Map();
  for (const event of visibleEvents) if (event.type === "move") {
    moveCounts.set(event.enemyId, (moveCounts.get(event.enemyId) || 0) + 1);
  }
  let previousTile = null;
  for (const event of visibleEvents) {
    const focus = event.target || event.to || event.from;
    await focusTile(focus, previousTile);
    if (event.type === "move") await playMove(event, Math.min(V39_MOVEMENT_PRESENTATION_BALANCE.stepMs,
      V39_MOVEMENT_PRESENTATION_BALANCE.maxDurationMs / moveCounts.get(event.enemyId)));
    if (event.type === "attack") await playAttack(event);
    previousTile = focus;
  }
  window.dispatchEvent(new CustomEvent("v39:enemy-turn-presentation-complete", { detail:{ eventCount:visibleEvents.length } }));
  return visibleEvents.length;
}

window.playV39EnemyTurnPresentation = playV39EnemyTurnPresentation;
