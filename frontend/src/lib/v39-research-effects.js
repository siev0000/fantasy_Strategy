import { getGameDataRows } from "./game-data-registry.js";

export const V39_RESEARCH_EFFECT_FIELDS = Object.freeze(["農業", "林業", "漁業", "工業", "幸福度", "治安"]);
export const V39_PENDING_RESEARCH_EFFECT_FIELDS = Object.freeze(["統治", "交渉", "魔術", "信仰", "道路発展数", "環境安定度"]);

export function resolveV39ResearchEffects(research, rows = getGameDataRows("研究")) {
  const completed = new Set(Object.values(research?.progress?.completedByCategoryLevel || {})
    .flatMap(levels => Object.values(levels || {}).flat()).map(String));
  const modifiers = Object.fromEntries(V39_RESEARCH_EFFECT_FIELDS.map(key => [key, 0]));
  const appliedIds = new Set();
  for (const row of rows) {
    const id = String(row.ID ?? row.id ?? `${row.技術対象}:${row.Lv}:${row.項目名}`).trim();
    if (!completed.has(id) || appliedIds.has(id)) continue;
    appliedIds.add(id);
    for (const key of V39_RESEARCH_EFFECT_FIELDS) {
      const value = Number(row[key]);
      if (Number.isFinite(value)) modifiers[key] += value;
    }
  }
  return modifiers;
}
