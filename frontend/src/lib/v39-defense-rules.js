import { getHexOffsetNeighbors, getHexDistance } from "./hex-grid.js";
import { parseV39TurnCount } from "./v39-turn-timing.js";
import { V39_DEFENSE_BALANCE } from "./v39-gameplay-balance.js";
import {resolveV39WallStepStructures} from './v39-wall-edges.js';

const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const key = point => `${point.x},${point.y}`;

export function resolveV39DefenseReducedPower(power, defense) {
  return Math.max(0, number(power)) / (1 + Math.max(0, number(defense)) / 100);
}

export function resolveV39DefenseKind(row) {
  const effects = String(row?.効果 || "").split(/[\s,:：;；/／|｜、]+/u);
  return ["壁", "結界", "盾", "障壁"].find(effect => effects.includes(effect)) || "";
}

export function grantV39PersonalDefense(row, caster, turn) {
  const kind = resolveV39DefenseKind(row);
  if (!["盾", "障壁"].includes(kind)) return {};
  const maximum = Math.max(0, Math.floor(number(row?.ガード)
    * (kind === "盾" ? 1 + Math.max(0, number(caster?.status?.精神)) / 100 : 1)));
  const duration = parseV39TurnCount(row?.効果時間, V39_DEFENSE_BALANCE.personalDefaultTurns);
  const effect = { skillName:String(row?.名前 || kind), maximum, remaining:maximum,
    expiresAtTurn:turn + duration, refreshedAtTurn:turn };
  return { [kind === "盾" ? "shield" : "barrier"]:maximum > 0 ? effect : null };
}

export function advanceV39PersonalDefenses(unit, turn) {
  const next = { ...unit };
  for (const field of ["shield", "barrier"]) {
    const effect = unit?.[field];
    if (!effect) continue;
    if (effect.expiresAtTurn <= turn || (field === "barrier" && effect.remaining <= 0)) next[field] = null;
    else if (field === "shield" && effect.refreshedAtTurn < turn) next.shield = {
      ...effect, remaining:effect.maximum, refreshedAtTurn:turn
    };
  }
  return next;
}

export function v39DefenseDamagePatch(unit, damage) {
  const patch = {};
  if (unit?.shield && Number.isFinite(damage?.shieldRemaining)) patch.shield = {
    ...unit.shield, remaining:damage.shieldRemaining
  };
  if (unit?.barrier && Number.isFinite(damage?.barrierRemaining)) patch.barrier = damage.barrierRemaining > 0
    ? { ...unit.barrier, remaining:damage.barrierRemaining } : null;
  return patch;
}

// 隣接点を画面上の時計回りに並べる。hex-gridの配列順は方角順ではない。
export function v39DefenseNeighbors(point) {
  return getHexOffsetNeighbors(point.x, point.y).sort((a, b) => {
    const angle = p => Math.atan2((p.y - point.y) * 0.75,
      p.x - point.x + ((p.y & 1) - (point.y & 1)) * 0.5);
    return angle(a) - angle(b);
  });
}

export function resolveV39DefenseFootprint(map, center, row, facing = 0) {
  const inside = p => !!map?.grid?.[p.y]?.[p.x];
  if (row?.範囲 === "三角形") {
    const adjacent = v39DefenseNeighbors(center);
    const index = ((Math.floor(number(facing)) % 6) + 6) % 6;
    return [center, adjacent[index], adjacent[(index + 1) % 6]].filter(inside);
  }
  const radius = row?.範囲 === "周囲"
    ? Math.floor(Math.max(0, number(row?.炸裂)) / V39_DEFENSE_BALANCE.blastPerRing) : 0;
  const tiles = [], seen = new Set([key(center)]), queue = [{ ...center, distance:0 }];
  for (let index = 0; index < queue.length; index++) {
    const point = queue[index];
    if (inside(point)) tiles.push({ x:point.x, y:point.y });
    if (point.distance >= radius) continue;
    for (const neighbor of getHexOffsetNeighbors(point.x, point.y)) {
      if (!inside(neighbor) || seen.has(key(neighbor))) continue;
      seen.add(key(neighbor));
      queue.push({ ...neighbor, distance:point.distance + 1 });
    }
  }
  return tiles;
}

export function createV39DefenseStructure(map, center, row, caster, turn, facing = 0) {
  const kind = resolveV39DefenseKind(row);
  if (!["壁", "結界"].includes(kind) || !map?.grid?.[center.y]?.[center.x]) return null;
  const hp = Math.max(0, Math.floor(number(row?.ガード)));
  if (!hp) return null;
  const duration = parseV39TurnCount(row?.効果時間);
  const edge = kind === "壁" && row?.範囲 === "辺";
  const adjacent = v39DefenseNeighbors(center)[((Math.floor(number(facing)) % 6) + 6) % 6];
  if (edge && !map?.grid?.[adjacent.y]?.[adjacent.x]) return null;
  return {
    id:`defense-${caster.id}-${turn}-${center.x}-${center.y}-${kind}-${facing}`,
    kind, name:String(row?.名前 || kind), ownerId:caster.ownerPlayerId || caster.playerId || "",
    x:center.x, y:center.y, hp, maxHp:hp, height:V39_DEFENSE_BALANCE.wallHeight,
    barrierAttached:kind === "壁" && /障壁/u.test(String(row?.効果 || "")),
    edge:edge ? { from:{ ...center }, to:adjacent } : null,
    tiles:kind === "結界" ? resolveV39DefenseFootprint(map, center, row, facing) : [{ ...center }],
    expiresAtTurn:duration ? turn + duration : 0
  };
}

export function v39WallStepHeight(map, from, to, {ownerId='',isFriendlyOwner=null} = {}) {
  let height = 0;
  for (const wall of resolveV39WallStepStructures(map,from,to)) {
    if (ownerId && wall.ownerId && (wall.ownerId===ownerId || isFriendlyOwner?.(wall.ownerId))) continue;
    if (wall.barrierAttached) return Infinity;
    height = Math.max(height, wall.height);
  }
  return height;
}

export function v39DefenseCovers(structure, point) {
  return structure.hp > 0 && structure.tiles.some(tile => getHexDistance(tile, point) === 0);
}
