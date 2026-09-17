import { normalizeResearchCategoryName, researchTreeData } from "./research-tree-config.js";

export const RESEARCH_EXP_BASE = 100;
export const RESEARCH_EXP_PER_TURN = 10;

const asText = value => String(value ?? "").trim();
const asCount = value => Math.max(0, Math.floor(Number(value) || 0));

export function requiredResearchExp(level) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  return RESEARCH_EXP_BASE * (2 ** (lv - 1));
}

export function normalizeCompletedResearchIds(value) {
  const rows = Array.isArray(value)
    ? value
    : (value && typeof value === "object" ? Object.values(value) : [value]);
  return [...new Set(rows.map(asText).filter(Boolean))];
}

export function normalizeResearchState(source = {}) {
  const progress = source?.progress && typeof source.progress === "object" ? source.progress : {};
  const targetExpMap = Object.fromEntries(Object.entries(progress.targetExpMap || {})
    .map(([key, value]) => [asText(key), asCount(value)])
    .filter(([key]) => key));
  const completedByCategoryLevel = {};
  for (const [category, levels] of Object.entries(progress.completedByCategoryLevel || {})) {
    const key = normalizeResearchCategoryName(category);
    if (!key || !levels || typeof levels !== "object") continue;
    completedByCategoryLevel[key] = {};
    for (const [level, ids] of Object.entries(levels)) {
      const normalizedIds = normalizeCompletedResearchIds(ids);
      if (normalizedIds.length) completedByCategoryLevel[key][Math.max(1, Math.floor(Number(level) || 1))] = normalizedIds;
    }
  }
  const carryByCategory = Object.fromEntries(Object.entries(progress.carryByCategory || {})
    .map(([key, value]) => [normalizeResearchCategoryName(key), asCount(value)])
    .filter(([key]) => key));
  const selection = Object.fromEntries(Object.entries(source?.selection || {})
    .map(([key, value]) => [normalizeResearchCategoryName(key), asText(value?.itemId || value?.id || value)])
    .filter(([key, value]) => key && value));
  const assignedUnitIdByCategory = Object.fromEntries(Object.entries(source?.assignedUnitIdByCategory || {})
    .map(([key, value]) => [normalizeResearchCategoryName(key), asText(value)])
    .filter(([key, value]) => key && value));
  return {
    progress:{ targetExpMap, completedByCategoryLevel, carryByCategory },
    selection,
    assignedUnitIdByCategory,
    lastProcessedTurn:asCount(source?.lastProcessedTurn)
  };
}

export function findResearchItem(itemId, tree = researchTreeData) {
  const id = asText(itemId);
  if (!id) return null;
  for (const [categoryKey, category] of Object.entries(tree?.categories || {})) {
    for (const levelRow of category?.levels || []) {
      const item = (levelRow?.items || []).find(row => asText(row?.id) === id);
      if (item) return { categoryKey, level:Number(levelRow.level) || 1, item };
    }
  }
  return null;
}

export function isResearchCompleted(state, categoryKey, level, itemId) {
  const research = normalizeResearchState(state);
  const category = normalizeResearchCategoryName(categoryKey);
  return normalizeCompletedResearchIds(research.progress.completedByCategoryLevel?.[category]?.[level]).includes(asText(itemId));
}

export function resolveCompletedResearchLevel(state, categoryKey, tree = researchTreeData) {
  const research = normalizeResearchState(state);
  const category = normalizeResearchCategoryName(categoryKey);
  const levels = tree?.categories?.[category]?.levels || [];
  let completedLevel = 0;
  for (const row of levels) {
    const itemIds = (row?.items || []).map(item => asText(item?.id)).filter(Boolean);
    const done = normalizeCompletedResearchIds(research.progress.completedByCategoryLevel?.[category]?.[row.level]);
    if (!itemIds.length || !itemIds.every(id => done.includes(id))) break;
    completedLevel = Number(row.level) || completedLevel;
  }
  return completedLevel;
}

export function resolveCurrentResearchLevel(state, categoryKey, tree = researchTreeData) {
  const category = normalizeResearchCategoryName(categoryKey);
  const levels = tree?.categories?.[category]?.levels || [];
  const maxLevel = levels.reduce((max, row) => Math.max(max, Number(row?.level) || 0), 1);
  return Math.max(1, Math.min(maxLevel, resolveCompletedResearchLevel(state, category, tree) + 1));
}

export function isResearchLevelUnlocked(state, categoryKey, level, maxUnitLevel = Infinity, tree = researchTreeData) {
  const category = normalizeResearchCategoryName(categoryKey);
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const previousDone = resolveCompletedResearchLevel(state, category, tree);
  const requiredUnitLevel = Number(tree?.levelRequirements?.[lv]) || 0;
  return lv <= previousDone + 1 && Number(maxUnitLevel) >= requiredUnitLevel;
}

export function selectResearch(state, categoryKey, itemId, assignedUnit = null, tree = researchTreeData) {
  const current = normalizeResearchState(state);
  const category = normalizeResearchCategoryName(categoryKey);
  const found = findResearchItem(itemId, tree);
  if (!found || found.categoryKey !== category) return { state:current, changed:false, reason:"not-found" };
  const assignedLevel = Number(assignedUnit?.level ?? assignedUnit?.Lv ?? assignedUnit?.レベル) || 0;
  if (!assignedUnit || !isResearchLevelUnlocked(current, category, found.level, assignedLevel, tree)) return { state:current, changed:false, reason:"locked" };
  if (isResearchCompleted(current, category, found.level, found.item.id)) return { state:current, changed:false, reason:"completed" };
  const next = normalizeResearchState(current);
  next.selection[category] = found.item.id;
  next.assignedUnitIdByCategory[category] = asText(assignedUnit?.id ?? assignedUnit?.unitId);
  const carry = asCount(next.progress.carryByCategory[category]);
  next.progress.carryByCategory[category] = 0;
  return carry > 0 ? addResearchExperience(next, category, carry, tree) : { state:next, changed:true, reason:"selected" };
}

export function addResearchExperience(state, categoryKey, amount, tree = researchTreeData) {
  const current = normalizeResearchState(state);
  const category = normalizeResearchCategoryName(categoryKey);
  const delta = Math.floor(Number(amount) || 0);
  const itemId = asText(current.selection[category]);
  const found = findResearchItem(itemId, tree);
  if (!delta || !found || found.categoryKey !== category) return { state:current, changed:false, reason:"no-selection" };
  if (isResearchCompleted(current, category, found.level, itemId)) return { state:current, changed:false, reason:"completed" };
  const required = requiredResearchExp(found.level);
  const oldExp = asCount(current.progress.targetExpMap[itemId]);
  const rawNext = Math.max(0, oldExp + delta);
  const nextExp = Math.min(required, rawNext);
  current.progress.targetExpMap[itemId] = nextExp;
  let completed = false;
  if (nextExp >= required) {
    const levelMap = { ...(current.progress.completedByCategoryLevel[category] || {}) };
    const ids = normalizeCompletedResearchIds(levelMap[found.level]);
    if (!ids.includes(itemId)) ids.push(itemId);
    levelMap[found.level] = ids;
    current.progress.completedByCategoryLevel[category] = levelMap;
    current.progress.carryByCategory[category] = asCount(current.progress.carryByCategory[category]) + Math.max(0, rawNext - required);
    delete current.selection[category];
    completed = true;
  }
  return { state:current, changed:nextExp !== oldExp || completed, reason:completed ? "completed" : "progress", completed };
}

export function researchExperiencePerTurn(unit, categoryKey, tree = researchTreeData) {
  const category = normalizeResearchCategoryName(categoryKey);
  const skillName = asText(tree?.timeReductionSkills?.[category]);
  const fallbackSkill = skillName === "魔法技術" ? "魔術" : "";
  const skillLevel = Math.max(0, Number(unit?.skillLevels?.[skillName] ?? unit?.skillLevels?.[fallbackSkill]) || 0);
  return Math.max(1, Math.floor(RESEARCH_EXP_PER_TURN * (1 + skillLevel / 100)));
}
