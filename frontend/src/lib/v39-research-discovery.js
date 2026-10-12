import { getGameDataRows } from "./game-data-registry.js";
import { resolveCompletedResearchLevel } from "./research-progress.js";

const text = value => String(value ?? "").trim();
const specialtyDefinitions = new Map(getGameDataRows("特産品").map(row => [text(row.名前), row]));
const terrainDefinitions = new Map(getGameDataRows("地形").map(row => [text(row.地形), row]));

export function getV39DiscoveryRequirement(definition) {
  if (["洞窟","薬草","薬草の群生地"].includes(text(definition?.地形 || definition?.名前 || definition?.name))) return {category:"",level:0};
  return {
    category:text(definition?.発見研究区分),
    level:Math.max(0, Math.floor(Number(definition?.必要発見研究Lv) || 0))
  };
}

// 発見条件を正本として表示一覧を逆引きする。研究側へ対象名を重複定義しない。
export function getV39ResearchDiscoveryTargets(category, level, itemId = "") {
  // 統合前から維持したIDは発見系統の枝を識別する。通常の研究IDから効果を推測しない。
  const legacyBranch=text(itemId).split(":")[0];
  const targetCategory = (["地質調査Lv","生態調査Lv","地下探索Lv"].includes(legacyBranch)
    ? legacyBranch : text(category)).replace(/Lv$/, "");
  const targetLevel = Math.floor(Number(level) || 0);
  if (!targetCategory || targetLevel <= 0) return [];
  const rows = [...specialtyDefinitions.values(), ...terrainDefinitions.values()];
  return [...new Set(rows.filter(row => {
    const requirement = getV39DiscoveryRequirement(row);
    return requirement.category.replace(/Lv$/, "") === targetCategory && requirement.level === targetLevel;
  }).map(row => text(row.名前 || row.地形)).filter(Boolean))];
}

// 同じ調査範囲内では研究Lvを一度だけ計算する。未完了の研究進捗は解禁に使わない。
export function createV39DiscoveryCheck(faction) {
  const levels = new Map();
  const allowed = definition => {
    const requirement = getV39DiscoveryRequirement(definition);
    if (requirement.level === 0) return true;
    if (!requirement.category) return false;
    if (!levels.has(requirement.category)) {
      levels.set(requirement.category, resolveCompletedResearchLevel(faction?.research, requirement.category));
    }
    return levels.get(requirement.category) >= requirement.level;
  };
  return {
    feature:definition => allowed(definition?.source || definition),
    specialty:site => allowed(specialtyDefinitions.get(text(site?.name)) || site),
    cave:() => allowed(terrainDefinitions.get("洞窟"))
  };
}
