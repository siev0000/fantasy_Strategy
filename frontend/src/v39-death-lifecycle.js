import { getSelectedSettlement } from "./lib/settlement-state.js";
import { FOOD_RESOURCE_KEYS } from "./lib/v39-economy-rules.js";
import {
  addV39CargoToFactionUnit,
  getV39SquadUnitIds,
  isV39CargoEmpty,
  mergeV39Cargo,
  normalizeV39Cargo
} from "./lib/v39-logistics-state.js";

const DEAD_UNIT_FIELD_TIMEOUT_MS = 30000;
let lifecycleTimer = 0;

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const coordKey = (unit) => `${Math.floor(number(unit?.x))},${Math.floor(number(unit?.y))}`;
const isDead = (unit) => text(unit?.state) === "死亡" || number(unit?.hp, unit?.currentHp) <= 0;
const foodResourceKeys = new Set(FOOD_RESOURCE_KEYS);

function attachCargoToUnit(units, unitId, cargo) {
  return units.map(unit => text(unit?.id) === text(unitId)
    ? { ...unit, corpseCargo:mergeV39Cargo(unit?.corpseCargo, cargo) }
    : unit);
}

function lastDeadMember(members) {
  return [...members].sort((left, right) =>
    number(right?.diedAtMs) - number(left?.diedAtMs) || text(left?.id).localeCompare(text(right?.id), "ja"))[0] || null;
}

function moveDefeatedPlayerCargoToCorpses(rawUnits, rawSquads) {
  let units = rawUnits;
  const unitById = () => new Map(units.map(unit => [text(unit?.id), unit]));
  let moved = 0;
  const squads = rawSquads.map(squad => {
    if (text(squad?.id) === "solo") {
      const cargoByUnitId = { ...(squad?.cargoByUnitId || {}) };
      for (const [unitId, cargo] of Object.entries(cargoByUnitId)) {
        const unit = unitById().get(text(unitId));
        if (!unit || !isDead(unit) || isV39CargoEmpty(cargo)) continue;
        units = attachCargoToUnit(units, unitId, cargo);
        delete cargoByUnitId[unitId];
        moved += 1;
      }
      return { ...squad, cargoByUnitId };
    }
    const members = getV39SquadUnitIds(squad).map(id => unitById().get(id)).filter(Boolean);
    if (!members.length || members.some(unit => !isDead(unit)) || isV39CargoEmpty(squad?.cargo)) return squad;
    const carrier = lastDeadMember(members);
    units = attachCargoToUnit(units, carrier.id, squad.cargo);
    moved += 1;
    return { ...squad, cargo:normalizeV39Cargo() };
  });
  return { units, squads, moved };
}

function moveDefeatedEnemyCargoToCorpses(rawEnemies, rawSquads) {
  let enemies = rawEnemies;
  const enemyById = () => new Map(enemies.map(enemy => [text(enemy?.id), enemy]));
  let moved = 0;
  const squads = rawSquads.map(squad => {
    const members = getV39SquadUnitIds(squad).map(id => enemyById().get(id)).filter(Boolean);
    if (!members.length || members.some(enemy => !isDead(enemy)) || isV39CargoEmpty(squad?.cargo)) return squad;
    const carrier = lastDeadMember(members);
    enemies = attachCargoToUnit(enemies, carrier.id, squad.cargo);
    moved += 1;
    return { ...squad, cargo:normalizeV39Cargo() };
  });
  return { enemies, squads, moved };
}

function cargoRemainingAfterCorpseExpires(rawCargo) {
  const cargo = normalizeV39Cargo(rawCargo);
  return normalizeV39Cargo({
    resourcesByType:Object.fromEntries(Object.entries(cargo.resourcesByType)
      .filter(([name]) => !foodResourceKeys.has(name))),
    equipmentInventory:cargo.equipmentInventory
  });
}

function addGroundLoot(groundLootByTile, key, cargo) {
  const remaining = cargoRemainingAfterCorpseExpires(cargo);
  if (isV39CargoEmpty(remaining)) return { value:groundLootByTile, added:false };
  const current = groundLootByTile[key] || {};
  return {
    value:{
      ...groundLootByTile,
      [key]:{
        discoveredByPlayerIds:Array.isArray(current.discoveredByPlayerIds) ? current.discoveredByPlayerIds : [],
        cargo:mergeV39Cargo(current.cargo, remaining)
      }
    },
    added:true
  };
}

function historyEntry(unit, type, now) {
  return {
    id:`death-${text(unit?.id)}-${now}-${type}`,
    unitId:text(unit?.id),
    unitName:text(unit?.name, text(unit?.id)),
    type,
    atMs:now,
    turn:Math.max(0, Math.floor(number(unit?.deathTurn, 0))),
    x:Math.floor(number(unit?.x)),
    y:Math.floor(number(unit?.y)),
    cause:text(unit?.deathCause),
    equipment:(Array.isArray(unit?.equipment) ? unit.equipment : []).map(item => ({
      id:text(item?.id),
      name:text(item?.name, text(item?.装備名)),
      slot:text(item?.slot),
      quality:text(item?.quality, text(item?.rarity))
    })),
    affiliation:{
      squadId:text(unit?.squadId),
      role:text(unit?.role),
      race:text(unit?.race),
      className:text(unit?.className)
    }
  };
}

function normalizeDeadUnit(unit, now) {
  if (!isDead(unit)) return unit;
  return {
    ...unit,
    hp:0,
    currentHp:0,
    state:"死亡",
    diedAtMs:Math.max(0, number(unit?.diedAtMs, now)),
    deadExpireAtMs:Math.max(0, number(unit?.deadExpireAtMs, now + DEAD_UNIT_FIELD_TIMEOUT_MS)),
    deathPosition:unit?.deathPosition || { x:Math.floor(number(unit?.x)), y:Math.floor(number(unit?.y)) }
  };
}

export function runV39DeathLifecycle(now = Date.now()) {
  if (document.hidden) return { collected:0, expired:0 };
  const state = window.getV39GameState?.();
  if (!state) return { collected:0, expired:0 };
  let collected = 0;
  let expired = 0;
  let cargoRecovered = 0;
  let groundLootCreated = 0;
  let changed = false;
  let groundLootByTile = { ...(state.groundLootByTile || {}) };
  let players = state.players.map((player) => {
    let faction = player.factionState;
    let sourceUnits = Array.isArray(faction?.units) ? faction.units.map((unit) => normalizeDeadUnit(unit, now)) : [];
    const defeated = moveDefeatedPlayerCargoToCorpses(sourceUnits, Array.isArray(faction?.squads) ? faction.squads : []);
    sourceUnits = defeated.units;
    let squads = defeated.squads;
    if (defeated.moved) changed = true;
    const aliveUnits = sourceUnits.filter((unit) => !isDead(unit));
    const units = [];
    const reserve = [...(Array.isArray(faction?.deadUnitReserve) ? faction.deadUnitReserve : [])];
    const history = [...(Array.isArray(faction?.deathHistory) ? faction.deathHistory : [])];
    const removedIds = new Set();
    for (const unit of sourceUnits) {
      if (!isDead(unit)) {
        units.push(unit);
        continue;
      }
      const collector = aliveUnits.find(row => coordKey(row) === coordKey(unit));
      if (collector) {
        if (!isV39CargoEmpty(unit?.corpseCargo)) {
          const result = addV39CargoToFactionUnit({ ...faction, units:sourceUnits, squads }, collector.id, unit.corpseCargo);
          if (result.ok) {
            squads = result.faction.squads;
            cargoRecovered += 1;
          }
        }
        const recoveredUnit = { ...unit, corpseCargo:normalizeV39Cargo() };
        reserve.push({ unitId:text(unit.id), unit:recoveredUnit, reason:"回収", storedAtMs:now, storedAtTurn:number(unit.deathTurn, 0) });
        history.push(historyEntry(unit, "回収", now));
        removedIds.add(text(unit.id));
        collected += 1;
        changed = true;
        continue;
      }
      if (now >= number(unit.deadExpireAtMs, now + DEAD_UNIT_FIELD_TIMEOUT_MS)) {
        const groundResult = addGroundLoot(groundLootByTile, coordKey(unit), unit?.corpseCargo);
        groundLootByTile = groundResult.value;
        if (groundResult.added) groundLootCreated += 1;
        history.push(historyEntry(unit, "消滅", now));
        removedIds.add(text(unit.id));
        expired += 1;
        changed = true;
        continue;
      }
      units.push(unit);
    }
    squads = squads.map((squad) => ({
      ...squad,
      unitIds:Array.isArray(squad?.unitIds) ? squad.unitIds.filter((id) => !removedIds.has(text(id))) : squad?.unitIds,
      memberIds:Array.isArray(squad?.memberIds) ? squad.memberIds.filter((id) => !removedIds.has(text(id))) : squad?.memberIds
    }));
    const selectedUnitId = units.some((unit) => text(unit.id) === text(faction?.selectedUnitId))
      ? text(faction.selectedUnitId)
      : text(units.find((unit) => !isDead(unit))?.id, text(units[0]?.id));
    return { ...player, factionState:{ ...faction, units, squads, deadUnitReserve:reserve, deathHistory:history, selectedUnitId } };
  });
  const normalizedEnemies = state.enemies.map(rawEnemy => normalizeDeadUnit(rawEnemy, now));
  const defeatedEnemies = moveDefeatedEnemyCargoToCorpses(normalizedEnemies, Array.isArray(state.enemySquads) ? state.enemySquads : []);
  if (defeatedEnemies.moved) changed = true;
  const enemies = [];
  for (const enemy of defeatedEnemies.enemies) {
    const collector = isDead(enemy)
      ? players.flatMap(player => player.factionState.units
        .filter(unit => !isDead(unit) && coordKey(unit) === coordKey(enemy))
        .map(unit => ({ playerId:player.id, unit }))).at(0)
      : null;
    if (collector) {
      if (!isV39CargoEmpty(enemy?.corpseCargo)) {
        players = players.map(player => {
          if (text(player?.id) !== text(collector.playerId)) return player;
          const result = addV39CargoToFactionUnit(player.factionState, collector.unit.id, enemy.corpseCargo);
          if (!result.ok) return player;
          cargoRecovered += 1;
          return { ...player, factionState:result.faction };
        });
      }
      collected += 1;
      changed = true;
    } else if (isDead(enemy) && now >= number(enemy.deadExpireAtMs, now + DEAD_UNIT_FIELD_TIMEOUT_MS)) {
      const groundResult = addGroundLoot(groundLootByTile, coordKey(enemy), enemy?.corpseCargo);
      groundLootByTile = groundResult.value;
      if (groundResult.added) groundLootCreated += 1;
      expired += 1;
      changed = true;
    } else {
      enemies.push(enemy);
    }
  }
  const livingEnemyIds = new Set(enemies.filter((enemy) => !isDead(enemy)).map((enemy) => text(enemy?.id)).filter(Boolean));
  const enemySquads = defeatedEnemies.squads.map((squad) => ({
    ...squad,
    unitIds:(Array.isArray(squad?.unitIds) ? squad.unitIds : []).map(text).filter((id) => livingEnemyIds.has(id))
  }));
  const enemyNests = (Array.isArray(state.enemyNests) ? state.enemyNests : []).map((nest) => {
    const unitIds = (Array.isArray(nest?.unitIds) ? nest.unitIds : []).map(text).filter((id) => livingEnemyIds.has(id));
    if (unitIds.length !== (Array.isArray(nest?.unitIds) ? nest.unitIds.length : 0)
      || number(nest?.population) !== unitIds.length) changed = true;
    return { ...nest, unitIds, population:unitIds.length };
  });
  if (changed) {
    window.setV39GameState({ players, enemies, enemySquads, enemyNests, groundLootByTile }, { reason:"death-lifecycle" });
    window.dispatchEvent(new CustomEvent("v39:death-lifecycle", { detail:{ collected, expired, cargoRecovered, groundLootCreated } }));
  }
  return { collected, expired, cargoRecovered, groundLootCreated };
}

export function reviveV39Unit(playerId, unitId, options = {}) {
  const state = window.getV39GameState?.();
  const player = state?.players?.find((row) => text(row.id) === text(playerId));
  if (!state || !player) return { ok:false, reason:"プレイヤーが見つかりません" };
  const reserve = [...player.factionState.deadUnitReserve];
  const index = reserve.findIndex((entry) => text(entry?.unitId) === text(unitId));
  if (index < 0) return { ok:false, reason:"死亡者一覧に対象がいません" };
  const entry = reserve[index];
  const source = entry.unit;
  const maxHp = Math.max(1, number(source?.maxHp, source?.status?.HP || 1));
  const hp = Math.max(1, Math.min(maxHp, Math.floor(number(options.hp, Math.ceil(maxHp * 0.25)))));
  const village = getSelectedSettlement(player.factionState);
  const revived = {
    ...source,
    x:Math.floor(number(options.x, village?.x ?? source?.x)),
    y:Math.floor(number(options.y, village?.y ?? source?.y)),
    hp,
    currentHp:hp,
    state:"生存"
  };
  for (const key of ["diedAtMs", "deadExpireAtMs", "deathPosition", "deathCause", "deathTurn", "corpseCargo"]) delete revived[key];
  reserve.splice(index, 1);
  const history = Array.isArray(player.factionState.deathHistory) ? player.factionState.deathHistory : [];
  const players = state.players.map((row) => row.id !== player.id ? row : ({
    ...row,
    factionState:{
      ...row.factionState,
      units:[...row.factionState.units, revived],
      deadUnitReserve:reserve,
      deathHistory:[...history, historyEntry(revived, "蘇生", Date.now())],
      selectedUnitId:text(revived.id)
    }
  }));
  window.setV39GameState({ players }, { reason:"unit-revived" });
  return { ok:true, unit:revived };
}

function install() {
  window.clearInterval(lifecycleTimer);
  lifecycleTimer = window.setInterval(() => runV39DeathLifecycle(), 500);
  window.runV39DeathLifecycle = runV39DeathLifecycle;
  window.reviveV39Unit = reviveV39Unit;
  window.getV39DeathRules = () => ({ fieldTimeoutMs:DEAD_UNIT_FIELD_TIMEOUT_MS });
}

install();
