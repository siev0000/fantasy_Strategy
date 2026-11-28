import { HEX_TILE_CONFIG } from "../../lib/phaser-map-panel-config.js";
import {deferV39CombatVisualHpRefresh,holdV39CombatVisualHp,releaseV39CombatVisualHp} from '../../lib/v39-combat-visual-state.js';
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

function canRevealAttacker(event) {
  const attackerId = String(event.attackerId || event.enemyId || "").trim();
  return visibleTile(event.from) && (!attackerId || window.isV39EntityDetected?.(attackerId) !== false);
}

function focusAttackTarget(target) {
  const camera = activeScene()?.cameras?.main;
  if (!camera) return;
  const { x, y } = tileCenter(target);
  if (camera.worldView?.contains?.(x, y)) return;
  camera.pan(x, y, V39_ENEMY_TURN_PRESENTATION_CONFIG.cameraPanMs, "Sine.easeInOut", true);
}

function attackGroupKey(event) {
  if (event?.type !== "attack" || !event.target) return null;
  const attackerId = event.attackerId || event.enemyId;
  const skillName = event.skillName || event.skillRow?.名前;
  if (!attackerId || !skillName) return null;
  return JSON.stringify([attackerId, skillName, event.targetUnitId || null, event.target.x, event.target.y,
    event.from?.x, event.from?.y]);
}

function attackEntries(event) {
  return (event.combatLogs || []).flatMap(log => log.entries || []);
}

function captionText(events, revealAttacker) {
  const first = events[0];
  const targetEntry = event => attackEntries(event).find(entry => entry.targetId != null
    && String(entry.targetId) === String(event.targetUnitId));
  const attackerName = revealAttacker ? (first.attacker?.name || "敵") : "視界外の敵";
  const targetName = visibleTile(first.target)
    ? (events.map(targetEntry).find(entry => entry?.targetName)?.targetName || "対象地点")
    : "対象地点";
  const count = events.reduce((total, event) => {
    const entry = targetEntry(event);
    return total + Math.max(1, number(entry?.hitCount || entry?.hitResults?.length || entry?.hits?.length, 1));
  }, 0);
  const skillName = first.skillName || first.skillRow?.名前 || "攻撃";
  return attackerName + " → " + targetName + "　" + skillName + (count > 1 ? " ×" + count : "");
}

function groupHpEntries(entries) {
  const byTarget = new Map();
  for (const entry of entries) {
    if (entry.targetId == null || number(entry.total) <= 0) continue;
    const previous = byTarget.get(entry.targetId);
    byTarget.set(entry.targetId, previous ? {
      ...entry, beforeHp:previous.beforeHp, total:number(previous.total) + number(entry.total)
    } : entry);
  }
  return [...byTarget.values()];
}


async function playMove(event, duration) {
  if (!isAliveEnemyAiUnit((window.getV39EnemyTurnState?.()?.enemies || []).find(enemy => String(enemy?.id) === String(event.enemyId)))) return;
  const marker = window.getV39MapEntityMarker?.(event.enemyId);
  if (!marker || !event.from || !event.to) return;
  const frame = marker.getData?.("ownerFrame");
  const scene = activeScene();
  const from = tileCenter(event.from);
  const to = tileCenter(event.to);
  const map = window.__v39FieldRuntime?.mapData;
  // 視界外の経路とワールド端を横断する線は見せず、見えている到着点だけ反映する。
  if (!visibleTile(event.from) || !visibleTile(event.to)
    || Math.abs(event.to.x-event.from.x) > map?.w / 2 || Math.abs(event.to.y-event.from.y) > map?.h / 2) {
    marker.setPosition(to.x, to.y);
    frame?.setPosition(to.x,to.y);
    return;
  }
  marker.setPosition(from.x, from.y);
  frame?.setPosition(from.x,from.y);
  await new Promise(resolve => {
    scene?.tweens?.add?.({ targets:frame?[marker,frame]:marker, x:to.x, y:to.y, duration, ease:"Linear", onComplete:resolve, onStop:resolve });
    window.setTimeout(resolve, duration + 100);
    if (!scene?.tweens) resolve();
  });
}

async function playAttack(events) {
  const first = events[0];
  const target = first.target;
  if (!target) return;

  const entries = events.flatMap(attackEntries);
  const revealAttacker = canRevealAttacker(first);
  const banner = document.getElementById("v39EnemyAttackBanner");
  const feedback = [];
  const present = (phase, phaseEntries) => window.dispatchEvent(new CustomEvent("v39:combat-presentation", {
    detail:{
      attackerId:revealAttacker ? first.attackerId || first.enemyId : "",
      skillName:first.skillName, target, entries:phaseEntries, presentationPhase:phase,
      waitUntil:completion => feedback.push(completion)
    }
  }));
  let started = false;
  let impacted = false;
  const start = () => {
    if (started) return;
    started = true;
    present("start", entries);
  };
  const impact = () => {
    if (impacted) return;
    impacted = true;
    present("late", entries);
  };

  try {
    if (banner) {
      banner.textContent = captionText(events, revealAttacker);
      banner.hidden = false;
    }
    focusAttackTarget(target);
    holdV39CombatVisualHp(entries);
    try {
      await delay(V39_ENEMY_TURN_PRESENTATION_CONFIG.preAttackPauseMs);
      await window.playV39MapEffect?.({
        effectName:first.effectName || "斬撃",
        skillRow:first.skillRow, attacker:first.attacker, hitEntries:entries,
        attackerTile:first.from, tileX:target.x, tileY:target.y,
        splash:Math.max(0, number(first.skillRow?.炸裂)),
        onFrame:start, onImpactLate:impact
      });
    } finally {
      start();
      impact();
      present("end", groupHpEntries(entries));
      await Promise.all([...feedback, delay(V39_ENEMY_TURN_PRESENTATION_CONFIG.postAttackPauseMs)]);
      releaseV39CombatVisualHp(entries);
    }
  } finally {
    if (banner) banner.hidden = true;
  }
}

export async function playV39EnemyTurnPresentation(events = []) {
  const livingIds = new Set((window.getV39EnemyTurnState?.()?.enemies || []).filter(isAliveEnemyAiUnit).map(enemy => String(enemy.id)));
  const sequence = Array.isArray(events) ? events : [];
  const visibleEvents = new Set(sequence.filter(event => visibleEnemyEvent(event, livingIds)));
  const moveCounts = new Map();
  for (const event of sequence) if (visibleEvents.has(event) && event.type === "move") {
    moveCounts.set(event.enemyId, (moveCounts.get(event.enemyId) || 0) + 1);
  }
  const eventCount = sequence.reduce((count, event) => count + Number(visibleEvents.has(event)), 0);
  let previousTile = null;
  let endHpRefresh;
  let renderBatch;
  try {
    for (let index = 0; index < sequence.length; index++) {
      const event = sequence[index];
      if (!visibleEvents.has(event)) continue;
      if (event.type === "move") {
        const focus = event.to || event.from;
        await focusTile(focus, previousTile);
        await playMove(event, Math.min(V39_MOVEMENT_PRESENTATION_BALANCE.stepMs,
          V39_MOVEMENT_PRESENTATION_BALANCE.maxDurationMs / moveCounts.get(event.enemyId)));
        previousTile = focus;
      } else if (event.type === "attack") {
        if (!endHpRefresh && event.target) {
          renderBatch = window.beginV39MapRenderBatch?.("enemy-attack-presentation");
          endHpRefresh = deferV39CombatVisualHpRefresh();
        }
        const group = [event];
        const key = attackGroupKey(event);
        while (key && visibleEvents.has(sequence[index + 1]) && attackGroupKey(sequence[index + 1]) === key) {
          group.push(sequence[++index]);
        }
        await playAttack(group);
        previousTile = event.target || event.from || previousTile;
      }
    }
  } finally {
    endHpRefresh?.();
    if (renderBatch) {
      window.endV39MapRenderBatch?.(renderBatch, { reason:"enemy-attack-presentation-complete" });
    }
    window.dispatchEvent(new CustomEvent("v39:enemy-turn-presentation-complete", { detail:{ eventCount } }));
  }
  return eventCount;
}


window.playV39EnemyTurnPresentation = playV39EnemyTurnPresentation;
