import { normalizeResearchCategoryName, researchTreeData } from "./research-tree-config.js";
import { V39_RESEARCH_BALANCE } from "./v39-gameplay-balance.js";

export const RESEARCH_EXP_BASE = V39_RESEARCH_BALANCE.baseRequiredExp;
export const RESEARCH_EXP_PER_TURN = V39_RESEARCH_BALANCE.baseExpPerTurn;

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
    completedByCategoryLevel[key] ||= {};
    for (const [level, ids] of Object.entries(levels)) {
      const normalizedIds = normalizeCompletedResearchIds(ids);
      for (const id of normalizedIds) {
        const found=findResearchItem(id);
        const target=found?.categoryKey || key, targetLevel=found?.level || Math.max(1,Math.floor(Number(level)||1));
        completedByCategoryLevel[target] ||= {};
        const ids=completedByCategoryLevel[target][targetLevel] ||= [];
        if (!ids.includes(id)) ids.push(id);
      }
    }
  }
  const carryByCategory = {};
  for (const [key,value] of Object.entries(progress.carryByCategory || {})) {
    const category=researchTreeData.categories?.調査Lv && ["地質調査Lv","生態調査Lv","地下探索Lv"].includes(key)
      ? "調査Lv" : normalizeResearchCategoryName(key);
    if (category) carryByCategory[category]=(carryByCategory[category] || 0)+asCount(value);
  }
  const selection = {}, assignedUnitIdByCategory = {};
  for (const [key,value] of Object.entries(source?.selection || {})) {
    const id=asText(value?.itemId || value?.id || value), target=findResearchItem(id)?.categoryKey || normalizeResearchCategoryName(key);
    if (target && id && !selection[target]) {
      selection[target]=id;
      assignedUnitIdByCategory[target]=asText(source?.assignedUnitIdByCategory?.[key]);
    }
  }
  for (const [key,value] of Object.entries(source?.assignedUnitIdByCategory || {})) {
    const target=normalizeResearchCategoryName(key);
    if (!assignedUnitIdByCategory[target]) assignedUnitIdByCategory[target]=asText(value);
  }
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
  const all=Object.values(tree?.categories || {}).flatMap(cat=>(cat.levels || []).flatMap(row=>row.items || []));
  // 旧調査系統の問い合わせはIDの枝を絞る。地質完了で生態まで解禁しない。
  const items=tree?.categories?.[category]?.levels?.flatMap(row=>row.items || [])
    || all.filter(item=>asText(item.id).startsWith(`${category}:`));
  const done=new Set(Object.values(research.progress.completedByCategoryLevel).flatMap(levels=>Object.values(levels).flat()));
  let completedLevel = 0;
  for (const item of items) if (done.has(item.id)) completedLevel=Math.max(completedLevel,Number(item.level)||0);
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
  // 第4引数は既存呼出しとの互換用。担当Lvは解禁条件に使わない。
  return lv <= previousDone + 1;
}

export function inspectResearchUnlock(state, itemId, tree = researchTreeData) {
  const found=findResearchItem(itemId,tree), reasons=[];
  if (!found) return {unlocked:false,reasons:["研究項目がありません"],currentLevel:0,requiredLevel:0,prerequisites:[]};
  const currentLevel=resolveCompletedResearchLevel(state,found.categoryKey,tree)+1;
  const requiredLevel=Math.max(1,Number(found.item.requiredResearchLevel ?? found.level)||1);
  if (currentLevel<requiredLevel) reasons.push(`必要研究Lv ${currentLevel}/${requiredLevel}`);
  const prerequisites=(found.item.prerequisiteIds || []).map(id=>{
    const parent=findResearchItem(id,tree);
    const completed=!!parent && isResearchCompleted(state,parent.categoryKey,parent.level,id);
    if (!completed) reasons.push(`前提未完了: ${parent?.item?.name || id}`);
    return {id,name:parent?.item?.name || id,completed};
  });
  reasons.push(...(found.item.prerequisiteErrors || []));
  return {unlocked:reasons.length===0,reasons,currentLevel,requiredLevel,prerequisites};
}

export function selectResearch(state, categoryKey, itemId, assignedUnit = null, tree = researchTreeData) {
  const current = normalizeResearchState(state);
  const category = normalizeResearchCategoryName(categoryKey);
  const found = findResearchItem(itemId, tree);
  if (!found || found.categoryKey !== category) return { state:current, changed:false, reason:"not-found" };
  if (!assignedUnit || !inspectResearchUnlock(current,itemId,tree).unlocked) return { state:current, changed:false, reason:"locked" };
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
  if (!inspectResearchUnlock(current,itemId,tree).unlocked) return {state:current,changed:false,reason:"locked"};
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

export function researchLevelEfficiency(unit, item, tree = researchTreeData) {
  const recommended = Math.max(0, Number(item?.recommendedUnitLevel
    ?? tree?.recommendedUnitLevels?.[item?.level]) || 0);
  if (!recommended) return 1;
  const level = Math.max(0, Number(unit?.level ?? unit?.Lv ?? unit?.レベル) || 0);
  return Math.min(1, level / recommended) ** V39_RESEARCH_BALANCE.levelEfficiencyExponent;
}

export function researchExperiencePerTurn(unit, categoryKey, tree = researchTreeData, item = null) {
  if (!unit) return 0;
  const category = normalizeResearchCategoryName(categoryKey);
  const skillName = asText(tree?.timeReductionSkills?.[category]);
  const fallbackSkill = skillName === "魔法技術" ? "魔術" : "";
  const skillLevel = Math.max(0, Number(unit?.skillLevels?.[skillName] ?? unit?.skillLevels?.[fallbackSkill]) || 0);
  return Math.max(V39_RESEARCH_BALANCE.minimumExpPerTurn,
    Math.floor(RESEARCH_EXP_PER_TURN * (1 + skillLevel / 100) * researchLevelEfficiency(unit, item, tree)));
}
