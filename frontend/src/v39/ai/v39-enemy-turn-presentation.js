import { HEX_TILE_CONFIG } from "../../lib/phaser-map-panel-config.js";

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
  return tile && window.isV39TileInCurrentVision?.(Math.floor(number(tile.x)), Math.floor(number(tile.y))) !== false;
}

function visibleEnemyEvent(event) {
  const enemyId = String(event?.enemyId || event?.attackerId || "").trim();
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

async function playMove(event) {
  const marker = window.getV39MapEntityMarker?.(event.enemyId);
  if (!marker || !event.from || !event.to) return;
  const scene = activeScene();
  const from = tileCenter(event.from);
  const to = tileCenter(event.to);
  marker.setPosition(from.x, from.y);
  await new Promise(resolve => {
    scene?.tweens?.add?.({ targets:marker, x:to.x, y:to.y, duration:180, ease:"Sine.easeInOut", onComplete:resolve });
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
  const visibleEvents = (Array.isArray(events) ? events : []).filter(event => {
    if (event?.type === "move" && event?.combatApproach !== true) return false;
    return visibleEnemyEvent(event);
  });
  let previousTile = null;
  for (const event of visibleEvents) {
    const focus = event.target || event.to || event.from;
    await focusTile(focus, previousTile);
    if (event.type === "move") await playMove(event);
    if (event.type === "attack") await playAttack(event);
    previousTile = focus;
  }
  window.dispatchEvent(new CustomEvent("v39:enemy-turn-presentation-complete", { detail:{ eventCount:visibleEvents.length } }));
  return visibleEvents.length;
}

window.playV39EnemyTurnPresentation = playV39EnemyTurnPresentation;
