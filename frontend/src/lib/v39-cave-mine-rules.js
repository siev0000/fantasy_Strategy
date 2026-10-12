import { V39_CAVE_MINE_BALANCE as balance } from "./v39-gameplay-balance.js";

const alive = unit => Number(unit?.hp ?? unit?.currentHp ?? 0) > 0;
const positive = value => Math.max(0, Number(value) || 0);

export function inspectV39CaveMine(map, enemies = [], rules = balance) {
  if (!map?.isUnderground) return { eligible:false, reason:"洞窟内でのみ鉱床化できます" };
  if (map.caveMine) return { eligible:false, reason:"鉱床化済みです" };
  const bossIds = map.caveBossIds || enemies.filter(unit => unit.isCaveBoss).map(unit => unit.id);
  if (!bossIds.length) return { eligible:false, reason:"ボスのいる奥地を攻略してください" };
  if (enemies.some(unit => bossIds.includes(unit.id) && alive(unit))) return { eligible:false, reason:"奥地のボスを倒してください" };
  if (rules.requireAllEnemiesDefeated && enemies.some(alive)) return { eligible:false, reason:"奥地の残敵を倒してください" };
  if (!(map.caveSites || []).some(site => rules.productionBySiteKind[site.kind])) return { eligible:false, reason:"採掘できる鉱石・宝石がありません" };
  return { eligible:true, reason:"" };
}

export function createV39CaveMine(map, enemies, ownerPlayerId, turnNumber, rules = balance) {
  const inspection = inspectV39CaveMine(map, enemies, rules);
  if (!inspection.eligible) throw new Error(inspection.reason);
  if (!ownerPlayerId || !Number.isInteger(turnNumber) || turnNumber < 1) throw new Error("鉱床の所有者またはターンが不正です");
  const resourcesPerCycle = {};
  // 手動採取で枯渇していても鉱床化は可能。有限の地点採取と継続採掘は別扱い。
  for (const kind of new Set(map.caveSites.map(site => site.kind))) {
    const row = rules.productionBySiteKind[kind];
    if (row?.resource && positive(row.amount)) resourcesPerCycle[row.resource] = (resourcesPerCycle[row.resource] || 0) + positive(row.amount);
  }
  return { ownerPlayerId, claimedTurn:turnNumber, lastProcessedTurn:turnNumber, productionProgress:0,
    resourcesPerCycle, stockByResource:{}, suspended:false };
}

export function advanceV39CaveMine(mine, enemies, turnNumber, rules = balance) {
  if (!mine || !Number.isInteger(turnNumber) || turnNumber < 1 || turnNumber <= (mine.lastProcessedTurn || mine.claimedTurn)) return mine;
  const next = { ...mine, stockByResource:{ ...mine.stockByResource }, lastProcessedTurn:turnNumber,
    suspended:rules.pauseWhileEnemiesPresent && enemies.some(alive) };
  if (next.suspended) return next;
  // 経過ターンの敵状況を推測して遡及採掘しない。実際のターン解決1回で1進捗。
  next.productionProgress = positive(mine.productionProgress) + 1;
  const interval = Math.max(1, Math.floor(positive(rules.productionIntervalTurns)));
  if (next.productionProgress >= interval) {
    next.productionProgress -= interval;
    for (const [resource, amount] of Object.entries(mine.resourcesPerCycle || {})) {
      next.stockByResource[resource] = positive(next.stockByResource[resource]) + positive(amount);
    }
  }
  return next;
}
