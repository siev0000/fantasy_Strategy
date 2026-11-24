const persistentCounters = new Set(["食事"]);

function counterSpec(value) {
  const match = typeof value === "string" && value.trim().match(/^(.+)_(\d+)$/u);
  if (!match) return null;
  const amount = Number(match[2]);
  return Number.isSafeInteger(amount) && amount > 0 ? {name:match[1], amount} : null;
}

function counterCount(unit, name) {
  return Number(unit?.skillCounters?.[name]?.count) || 0;
}

export function inspectV39SkillCounterRequirements(unit, row) {
  const required = new Map();
  for (const field of ["条件カウンター", "消費カウンター"]) {
    const spec = counterSpec(row?.[field]);
    if (spec) required.set(spec.name, Math.max(required.get(spec.name) ?? 0, spec.amount));
  }
  return Array.from(required, ([name, amount]) => ({name, amount, count:counterCount(unit, name)}));
}

export function getV39SkillCounterBlock(unit, row) {
  if (!row?.条件カウンター && !row?.消費カウンター) return "";
  return inspectV39SkillCounterRequirements(unit, row)
    .filter(({count, amount}) => count < amount)
    .map(({name, count, amount}) => `${name} ${count}/${amount}`).join(" / ");
}

export function applyV39SkillCounters(unit, row, passives, defeatedCount, turn) {
  const spend = counterSpec(row?.消費カウンター);
  const gains = new Map();
  for (const source of [row, ...passives]) {
    for (const [field, times] of [["加算カウンター", 1], ["撃破時カウンター", defeatedCount]]) {
      const spec = counterSpec(source?.[field]);
      if (spec && times > 0) gains.set(spec.name, (gains.get(spec.name) ?? 0) + spec.amount * times);
    }
  }
  if ((!spend && !gains.size) || getV39SkillCounterBlock(unit, row)) return unit;
  const counters = new Map(Object.entries(unit.skillCounters ?? {}));
  if (spend) {
    const count = counterCount(unit, spend.name) - spend.amount;
    if (count > 0) counters.set(spend.name, {...counters.get(spend.name), count});
    else counters.delete(spend.name);
  }
  for (const [name, amount] of gains) {
    counters.set(name, {count:(counters.get(name)?.count ?? 0) + amount, idleTurns:0, lastCombatTurn:turn});
  }
  return {...unit, skillCounters:Object.fromEntries(counters)};
}

export function markV39SkillCounterCombat(unit, turn) {
  if (!unit.skillCounters) return unit;
  const counters = Object.entries(unit.skillCounters ?? {});
  if (!counters.some(([name, counter]) => !persistentCounters.has(name) && counter.lastCombatTurn !== turn)) return unit;
  return {...unit, skillCounters:Object.fromEntries(counters.map(([name, counter]) => [
    name, persistentCounters.has(name) ? counter : {...counter, idleTurns:0, lastCombatTurn:turn}
  ]))};
}

export function advanceV39SkillCounters(unit, turn, holdTurns) {
  if (!unit.skillCounters) return unit;
  const counters = Object.entries(unit.skillCounters ?? {});
  const next = new Map(counters);
  let changed = false;
  for (const [name, counter] of counters) {
    if (persistentCounters.has(name) || counter.lastCombatTurn === turn || counter.lastCountedTurn === turn) continue;
    const idleTurns = (counter.idleTurns ?? 0) + 1;
    if (idleTurns >= holdTurns) next.delete(name);
    else next.set(name, {...counter, idleTurns, lastCountedTurn:turn});
    changed = true;
  }
  return changed ? {...unit, skillCounters:Object.fromEntries(next)} : unit;
}

export function describeV39SkillCounters(unit, holdTurns) {
  return Object.entries(unit?.skillCounters ?? {}).map(([name, counter]) => ({
    name, count:counter.count,
    remainingTurns:persistentCounters.has(name) ? null : Math.max(0, holdTurns - (counter.idleTurns ?? 0))
  }));
}
