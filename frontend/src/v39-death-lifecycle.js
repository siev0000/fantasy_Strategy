const DEAD_UNIT_FIELD_TIMEOUT_MS = 30000;
let lifecycleTimer = 0;

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const coordKey = (unit) => `${Math.floor(number(unit?.x))},${Math.floor(number(unit?.y))}`;
const isDead = (unit) => text(unit?.state) === "死亡" || number(unit?.hp, unit?.currentHp) <= 0;

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
  let changed = false;
  const players = state.players.map((player) => {
    const faction = player.factionState;
    const sourceUnits = Array.isArray(faction?.units) ? faction.units.map((unit) => normalizeDeadUnit(unit, now)) : [];
    const aliveTiles = new Set(sourceUnits.filter((unit) => !isDead(unit)).map(coordKey));
    const units = [];
    const reserve = [...(Array.isArray(faction?.deadUnitReserve) ? faction.deadUnitReserve : [])];
    const history = [...(Array.isArray(faction?.deathHistory) ? faction.deathHistory : [])];
    const removedIds = new Set();
    for (const unit of sourceUnits) {
      if (!isDead(unit)) {
        units.push(unit);
        continue;
      }
      if (aliveTiles.has(coordKey(unit))) {
        reserve.push({ unitId:text(unit.id), unit:{ ...unit }, reason:"回収", storedAtMs:now, storedAtTurn:number(unit.deathTurn, 0) });
        history.push(historyEntry(unit, "回収", now));
        removedIds.add(text(unit.id));
        collected += 1;
        changed = true;
        continue;
      }
      if (now >= number(unit.deadExpireAtMs, now + DEAD_UNIT_FIELD_TIMEOUT_MS)) {
        history.push(historyEntry(unit, "消滅", now));
        removedIds.add(text(unit.id));
        expired += 1;
        changed = true;
        continue;
      }
      units.push(unit);
    }
    const squads = (Array.isArray(faction?.squads) ? faction.squads : []).map((squad) => ({
      ...squad,
      unitIds:Array.isArray(squad?.unitIds) ? squad.unitIds.filter((id) => !removedIds.has(text(id))) : squad?.unitIds,
      memberIds:Array.isArray(squad?.memberIds) ? squad.memberIds.filter((id) => !removedIds.has(text(id))) : squad?.memberIds
    }));
    const selectedUnitId = units.some((unit) => text(unit.id) === text(faction?.selectedUnitId))
      ? text(faction.selectedUnitId)
      : text(units.find((unit) => !isDead(unit))?.id, text(units[0]?.id));
    return { ...player, factionState:{ ...faction, units, squads, deadUnitReserve:reserve, deathHistory:history, selectedUnitId } };
  });
  const enemies = [];
  for (const rawEnemy of state.enemies) {
    const enemy = normalizeDeadUnit(rawEnemy, now);
    if (isDead(enemy) && now >= number(enemy.deadExpireAtMs, now + DEAD_UNIT_FIELD_TIMEOUT_MS)) {
      expired += 1;
      changed = true;
    } else {
      enemies.push(enemy);
    }
  }
  if (changed) {
    window.setV39GameState({ players, enemies }, { reason:"death-lifecycle" });
    window.dispatchEvent(new CustomEvent("v39:death-lifecycle", { detail:{ collected, expired } }));
  }
  return { collected, expired };
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
  const village = player.factionState.village;
  const revived = {
    ...source,
    x:Math.floor(number(options.x, village?.x ?? source?.x)),
    y:Math.floor(number(options.y, village?.y ?? source?.y)),
    hp,
    currentHp:hp,
    state:"生存"
  };
  for (const key of ["diedAtMs", "deadExpireAtMs", "deathPosition", "deathCause", "deathTurn"]) delete revived[key];
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
