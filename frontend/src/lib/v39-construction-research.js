import defaults from "../../../config/v39-construction-research-defaults.json";
import { V39_RESEARCH_BALANCE } from "./v39-gameplay-balance.js";
import { findResearchItem, isResearchCompleted } from "./research-progress.js";

export function requiredFacilityResearchIds(definition) {
  const source = definition?.requiredResearchIds
    ?? defaults.facilityResearchIds?.[definition?.name] ?? [];
  const ids = Array.isArray(source) ? source : String(source).split(/[、,\n]/u);
  return [...new Set(ids.map(value => String(value ?? "").trim()).filter(Boolean))];
}

export function inspectFacilityResearch(research, definition, mode = V39_RESEARCH_BALANCE.constructionUnlockMode) {
  if (mode !== "item") return { mode:"level", reasons:[], requirements:[] };
  const ids = requiredFacilityResearchIds(definition);
  const requirements = ids.map(id => {
    const found = findResearchItem(id);
    return { id, name:found?.item?.name || id,
      completed:!!found && isResearchCompleted(research, found.categoryKey, found.level, id) };
  });
  // 未設定をLv方式へ黙って戻さず、必要Lvのある施設は対応の設定待ちにする。
  const reasons = !ids.length && Object.values(definition?.requirements || {}).some(value => Number(value) > 0)
    ? ["解禁研究が未設定です"] : [];
  for (const row of requirements) if (!row.completed) reasons.push(`研究未完了: ${row.name}`);
  return { mode, reasons, requirements };
}

export function facilitiesUnlockedByResearch(itemId, definitions) {
  if (V39_RESEARCH_BALANCE.constructionUnlockMode !== "item") return [];
  return definitions.filter(definition => requiredFacilityResearchIds(definition).includes(itemId));
}
