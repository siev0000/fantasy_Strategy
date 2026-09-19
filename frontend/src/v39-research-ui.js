import {
  RESEARCH_CATEGORY_ORDER,
  normalizeResearchCategoryName,
  researchTreeData
} from "./lib/research-tree-config.js";
import {
  addResearchExperience,
  isResearchCompleted,
  isResearchLevelUnlocked,
  normalizeResearchState,
  researchExperiencePerTurn,
  requiredResearchExp,
  resolveCompletedResearchLevel,
  selectResearch
} from "./lib/research-progress.js";

const CATEGORY_META = {
  鍛冶Lv: { label:"鍛冶", icon:"⚒", accent:"#d9b56b" },
  魔法Lv: { label:"魔法", icon:"✦", accent:"#a980de" },
  信仰Lv: { label:"信仰", icon:"✚", accent:"#e9de8b" },
  軍事Lv: { label:"軍事", icon:"⚔", accent:"#cf705e" },
  経済Lv: { label:"経済", icon:"◆", accent:"#79c88f" }
};

function categoryMeta(categoryKey) {
  return CATEGORY_META[categoryKey] || {
    label:String(categoryKey || "研究").replace(/Lv$/, ""),
    icon:"◆",
    accent:"#70b7c6"
  };
}

let activeCategory = RESEARCH_CATEGORY_ORDER.find(key => researchTreeData.categories[key]) || "";
let inspectedItemId = "";

const escapeHtml = value => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function activeFaction() {
  return window.getV39ActiveFactionState?.() || null;
}

function currentResearch() {
  return normalizeResearchState(activeFaction()?.research);
}

function unitId(unit) {
  return String(unit?.id ?? unit?.unitId ?? "");
}

function unitName(unit) {
  return String(unit?.name ?? unit?.名前 ?? unit?.label ?? "名称未設定");
}

function aliveUnits() {
  return (activeFaction()?.units || []).filter(unit => Number(unit?.hp ?? unit?.HP ?? 1) > 0 && unitId(unit));
}

function defaultAssignee(categoryKey, research = currentResearch()) {
  const assignedId = String(research.assignedUnitIdByCategory?.[categoryKey] || "");
  const units = aliveUnits();
  return units.find(unit => unitId(unit) === assignedId)
    || units.find(unit => unitId(unit) === String(activeFaction()?.selectedUnitId || ""))
    || units.slice().sort((a, b) => Number(b?.level ?? b?.Lv ?? 0) - Number(a?.level ?? a?.Lv ?? 0))[0]
    || null;
}

function categoryRows(categoryKey) {
  return researchTreeData.categories?.[categoryKey]?.levels || [];
}

function firstInspectableId(categoryKey, research = currentResearch()) {
  const selected = String(research.selection?.[categoryKey] || "");
  if (selected) return selected;
  const assignee = defaultAssignee(categoryKey, research);
  const assigneeLevel = Number(assignee?.level ?? assignee?.Lv ?? assignee?.レベル) || 0;
  const row = categoryRows(categoryKey).find(levelRow => isResearchLevelUnlocked(research, categoryKey, levelRow.level, assigneeLevel));
  return String(row?.items?.[0]?.id || categoryRows(categoryKey)?.[0]?.items?.[0]?.id || "");
}

function updateFactionResearch(nextResearch, reason) {
  if (!activeFaction()) return false;
  window.updateV39ActiveFactionState?.({ research:normalizeResearchState(nextResearch) }, { reason });
  return true;
}

function selectResearchForActivePlayer(categoryKey, itemId) {
  const category = normalizeResearchCategoryName(categoryKey);
  const research = currentResearch();
  const result = selectResearch(research, category, itemId, defaultAssignee(category, research));
  if (result.changed) {
    inspectedItemId = String(itemId || "");
    updateFactionResearch(result.state, "research-selection");
    window.dispatchEvent(new CustomEvent("v39:research-selected", { detail:{ category, itemId } }));
  }
  renderAll();
  return result;
}

function assignResearchUnit(categoryKey, assignedUnitId) {
  const category = normalizeResearchCategoryName(categoryKey);
  const unit = aliveUnits().find(row => unitId(row) === String(assignedUnitId || ""));
  if (!unit) return false;
  const research = currentResearch();
  research.assignedUnitIdByCategory[category] = unitId(unit);
  updateFactionResearch(research, "research-assignee");
  renderAll();
  return true;
}

function addExperienceForActivePlayer(categoryKey, amount) {
  const category = normalizeResearchCategoryName(categoryKey);
  const result = addResearchExperience(currentResearch(), category, amount);
  if (result.changed) {
    updateFactionResearch(result.state, "research-progress");
    window.dispatchEvent(new CustomEvent("v39:research-progress", {
      detail:{ category, amount:Math.floor(Number(amount) || 0), completed:result.completed === true }
    }));
  }
  renderAll();
  return result;
}

function categoryProgress(categoryKey, research) {
  const selectedId = String(research.selection?.[categoryKey] || "");
  if (!selectedId) return { current:0, required:requiredResearchExp(resolveCompletedResearchLevel(research, categoryKey) + 1), ratio:0 };
  const item = categoryRows(categoryKey).flatMap(row => row.items || []).find(row => row.id === selectedId);
  const current = Math.max(0, Number(research.progress.targetExpMap?.[selectedId]) || 0);
  const required = requiredResearchExp(item?.level || 1);
  return { current, required, ratio:Math.min(100, Math.round((current / Math.max(1, required)) * 100)) };
}

function renderRail() {
  const rail = document.getElementById("researchRail");
  if (!(rail instanceof HTMLElement)) return;
  const research = currentResearch();
  rail.innerHTML = RESEARCH_CATEGORY_ORDER
    .filter(key => researchTreeData.categories[key])
    .map(key => {
      const meta = categoryMeta(key);
      const progress = categoryProgress(key, research);
      const level = Math.min(7, resolveCompletedResearchLevel(research, key) + 1);
      const selected = research.selection?.[key] ? " active" : "";
      return `<button class="research-rail-btn${selected}" data-v39-research-category="${key}" style="--p:${progress.ratio}%;--accent:${meta.accent}" title="${meta.label} Lv${level} / EXP ${progress.current}/${progress.required}" aria-label="${meta.label} Lv${level}"><span class="gauge"><b>${meta.icon}</b></span><span class="lv">${level}</span></button>`;
    }).join("");
}

function itemDetails(item) {
  const details = (item?.details || []).map(row => `<li><span>${escapeHtml(row.key)}</span><b>${escapeHtml(row.value)}</b></li>`).join("");
  return details ? `<ul class="v39-research-details">${details}</ul>` : "";
}

function renderModal() {
  const backdrop = document.getElementById("researchModal");
  const modal = backdrop?.querySelector(":scope > .modal");
  if (!(backdrop instanceof HTMLElement) || !(modal instanceof HTMLElement)) return;
  modal.classList.add("research-modal-shell");
  const head = modal.querySelector(":scope > .modal-head");
  const body = modal.querySelector(":scope > .modal-body");
  if (!(head instanceof HTMLElement) || !(body instanceof HTMLElement)) return;
  const heading = head.querySelector("h2");
  if (heading) heading.textContent = "研究";

  const research = currentResearch();
  if (!researchTreeData.categories[activeCategory]) activeCategory = RESEARCH_CATEGORY_ORDER.find(key => researchTreeData.categories[key]) || "";
  if (!inspectedItemId || !categoryRows(activeCategory).some(row => (row.items || []).some(item => item.id === inspectedItemId))) {
    inspectedItemId = firstInspectableId(activeCategory, research);
  }
  const assignee = defaultAssignee(activeCategory, research);
  const assigneeLevel = Number(assignee?.level ?? assignee?.Lv ?? assignee?.レベル) || 0;
  const inspected = categoryRows(activeCategory).flatMap(row => row.items || []).find(item => item.id === inspectedItemId) || null;
  const selectedId = String(research.selection?.[activeCategory] || "");
  const selected = inspected?.id === selectedId;
  const completed = inspected ? isResearchCompleted(research, activeCategory, inspected.level, inspected.id) : false;
  const unlocked = inspected ? isResearchLevelUnlocked(research, activeCategory, inspected.level, assigneeLevel) : false;
  const currentExp = inspected ? Math.max(0, Number(research.progress.targetExpMap?.[inspected.id]) || 0) : 0;
  const requiredExp = requiredResearchExp(inspected?.level || 1);
  const progressRatio = Math.min(100, Math.round((currentExp / Math.max(1, requiredExp)) * 100));

  const categoryButtons = RESEARCH_CATEGORY_ORDER.filter(key => researchTreeData.categories[key]).map(key => {
    const meta = categoryMeta(key);
    const level = Math.min(7, resolveCompletedResearchLevel(research, key) + 1);
    const active = key === activeCategory;
    return `<button class="v39-research-category${active ? " active" : ""}" data-research-category="${key}" style="--cat-accent:${meta.accent}" aria-pressed="${active}"><b>${meta.icon}</b><span>${meta.label}</span><small>Lv${level}${active ? " 選択中" : ""}</small></button>`;
  }).join("");

  const levels = categoryRows(activeCategory).map(levelRow => {
    const levelUnlocked = isResearchLevelUnlocked(research, activeCategory, levelRow.level, assigneeLevel);
    const unitRequirement = Number(researchTreeData.levelRequirements?.[levelRow.level]) || 0;
    const cards = (levelRow.items || []).map(item => {
      const done = isResearchCompleted(research, activeCategory, levelRow.level, item.id);
      const picked = item.id === selectedId;
      const active = item.id === inspectedItemId;
      const exp = Math.max(0, Number(research.progress.targetExpMap?.[item.id]) || 0);
      const required = requiredResearchExp(levelRow.level);
      const ratio = Math.min(100, Math.round((exp / Math.max(1, required)) * 100));
      const stateText = done ? "完了 100%" : !levelUnlocked ? `未解放 / ${exp}/${required}` : picked ? `研究中 / ${exp}/${required}` : active ? `選択中 / ${exp}/${required}` : `${exp}/${required}`;
      return `<button class="v39-research-item${active ? " active" : ""}${picked ? " picked" : ""}${done ? " completed" : ""}" data-research-item="${escapeHtml(item.id)}" aria-pressed="${active}" ${levelUnlocked ? "" : "disabled"}><strong>${escapeHtml(item.name)}</strong><span class="v39-research-item-progress"><i style="width:${ratio}%"></i></span><small>${stateText}</small></button>`;
    }).join("");
    return `<section class="v39-research-level${levelUnlocked ? "" : " locked"}"><header><b>Lv${levelRow.level}</b><small>必要ユニットLv ${unitRequirement}</small></header><div>${cards}</div></section>`;
  }).join("");

  const actionLabel = completed ? "研究完了" : (selected ? "研究中" : "研究として選択");
  const assigneeOptions = aliveUnits().map(unit => `<option value="${escapeHtml(unitId(unit))}" ${unitId(unit) === unitId(assignee) ? "selected" : ""}>${escapeHtml(unitName(unit))} Lv${Number(unit?.level ?? unit?.Lv ?? 0)}</option>`).join("");
  const perTurn = assignee ? researchExperiencePerTurn(assignee, activeCategory) : 0;
  body.innerHTML = `<nav class="v39-research-categories">${categoryButtons}</nav><div class="v39-research-layout"><div class="v39-research-board">${levels || "研究データがありません。"}</div><aside class="v39-research-detail"><label class="v39-research-assignee">担当ユニット<select data-research-assignee>${assigneeOptions || '<option value="">担当可能ユニットなし</option>'}</select><small>1ターン +${perTurn} EXP</small></label>${inspected ? `<div class="v39-research-detail-head"><div><b>${escapeHtml(inspected.name)}</b><small>${categoryMeta(activeCategory).label} Lv${inspected.level}</small></div><strong class="${completed ? "completed" : ""}">${completed ? "100%" : `${progressRatio}%`}</strong></div><div class="v39-research-large-progress"><i style="width:${progressRatio}%"></i><span>${currentExp} / ${requiredExp}</span></div><p>${escapeHtml(inspected.desc || "-")}</p>${itemDetails(inspected)}<p class="v39-research-requirement">必要ユニットLv ${researchTreeData.levelRequirements?.[inspected.level] || "-"}<br>短縮技能: ${escapeHtml(researchTreeData.timeReductionSkills?.[activeCategory] || "-")}</p><button class="v39-research-select" data-select-research ${(!unlocked || completed || selected) ? "disabled" : ""}>${actionLabel}</button>` : "研究項目を選択してください。"}</aside></div>`;
}

function renderAll() {
  renderRail();
  renderModal();
}

function openCategory(categoryKey) {
  const category = normalizeResearchCategoryName(categoryKey);
  if (!researchTreeData.categories[category]) return;
  activeCategory = category;
  inspectedItemId = firstInspectableId(category);
  renderAll();
  document.getElementById("researchModal")?.classList.add("open");
}

function installEvents() {
  document.addEventListener("click", event => {
    const railButton = event.target.closest?.("[data-v39-research-category]");
    if (railButton) {
      event.preventDefault();
      openCategory(railButton.dataset.v39ResearchCategory);
      return;
    }
    const categoryButton = event.target.closest?.("[data-research-category]");
    if (categoryButton) {
      activeCategory = normalizeResearchCategoryName(categoryButton.dataset.researchCategory);
      inspectedItemId = firstInspectableId(activeCategory);
      renderModal();
      return;
    }
    const itemButton = event.target.closest?.("[data-research-item]");
    if (itemButton) {
      inspectedItemId = String(itemButton.dataset.researchItem || "");
      renderModal();
      return;
    }
    if (event.target.closest?.("[data-select-research]")) selectResearchForActivePlayer(activeCategory, inspectedItemId);
  });
  document.addEventListener("change", event => {
    if (event.target.matches?.("[data-research-assignee]")) assignResearchUnit(activeCategory, event.target.value);
  });
  window.addEventListener("v39:game-state-changed", renderAll);
  window.addEventListener("v39:turn-stage-research", advanceAllPlayerResearch);
}

function advanceAllPlayerResearch() {
  const state = window.getV39GameState?.();
  if (!state) return;
  const turnNumber = Math.max(1, Math.floor(Number(state?.timeline?.turnNumber) || 1));
  let changed = false;
  const players = (state.players || []).map(player => {
    let playerChanged = false;
    let research = normalizeResearchState(player?.factionState?.research);
    if (research.lastProcessedTurn >= turnNumber) return player;
    const units = player?.factionState?.units || [];
    for (const category of Object.keys(research.selection)) {
      const assignedId = String(research.assignedUnitIdByCategory?.[category] || "");
      const unit = units.find(row => unitId(row) === assignedId && Number(row?.hp ?? row?.HP ?? 1) > 0);
      if (!unit) continue;
      const result = addResearchExperience(research, category, researchExperiencePerTurn(unit, category));
      research = result.state;
      playerChanged ||= result.changed;
      changed ||= result.changed;
    }
    research.lastProcessedTurn = turnNumber;
    playerChanged = true;
    changed = true;
    return playerChanged ? { ...player, factionState:{ ...player.factionState, research } } : player;
  });
  if (changed) window.setV39GameState?.({ players }, { reason:"research-turn-progress" });
}

function installStyles() {
  if (document.getElementById("v39-research-ui-style")) return;
  const style = document.createElement("style");
  style.id = "v39-research-ui-style";
  style.textContent = `
#researchModal .modal{width:min(1040px,94vw);height:min(720px,90vh);background:#0d171b;border:1px solid #53646a}
#researchModal .modal-body{display:grid;grid-template-rows:auto minmax(0,1fr);height:100%;min-height:0;padding:10px;overflow:hidden}
.v39-research-categories{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin-bottom:8px}
.v39-research-category{min-height:48px;display:flex;align-items:center;justify-content:center;gap:7px;color:#c9d4d5;background:#152226;border:1px solid #405057;border-radius:8px;font-size:15px;font-weight:800}
.v39-research-category b{color:var(--cat-accent);font-size:21px}.v39-research-category small{font-size:13px;color:#91a1a5}
.v39-research-category.active{border:2px solid var(--cat-accent);background:#243035;color:#fff}
.v39-research-layout{display:grid;grid-template-columns:minmax(0,2fr) minmax(270px,1fr);gap:9px;min-height:0}
.v39-research-board{display:flex;gap:8px;min-width:0;overflow:auto;padding:2px 2px 8px}
.v39-research-level{flex:0 0 170px;border:1px solid #3d4e54;border-radius:8px;background:#111e22;padding:6px}
.v39-research-level>header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;color:#e8dcc1}.v39-research-level>header small{font-size:13px;color:#a6b3b5}
.v39-research-level>div{display:grid;gap:6px}.v39-research-level.locked{opacity:.42}
.v39-research-item{position:relative;min-height:86px;padding:8px;text-align:left;color:#d8e0e0;background:#17252a;border:1px solid #45575e;border-radius:7px}
.v39-research-item strong{display:block;font-size:15px;line-height:1.25}.v39-research-item small{display:block;margin-top:4px;font-size:13px;color:#aab6b8}
.v39-research-item-progress{display:block;height:7px;margin-top:11px;background:#091114;border:1px solid #435158;border-radius:8px;overflow:hidden}.v39-research-item-progress i{display:block;height:100%;background:#d1aa61}
.v39-research-item.active{border:3px solid #f1d080;padding:6px;background:#2b2a20}.v39-research-item.picked{background:#27362f;box-shadow:inset 0 0 0 2px #78c894}.v39-research-item.completed{background:#173a2a;border-color:#63c184;color:#e7fff0}.v39-research-item.completed .v39-research-item-progress i{background:#62d18d}
.v39-research-detail{min-width:0;overflow:auto;padding:12px;border:1px solid #44555b;border-radius:9px;background:#142126;color:#dce4e4}
.v39-research-assignee{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:5px 8px;margin-bottom:12px;padding:8px;border:1px solid #3f5056;border-radius:7px;font-size:13px;font-weight:800}.v39-research-assignee select{min-width:0;height:32px;background:#0c171b;border:1px solid #52646a;border-radius:5px;color:#e5eded;padding:0 6px;font-size:13px}.v39-research-assignee small{grid-column:2;color:#77ce96}
.v39-research-detail-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.v39-research-detail-head b{display:block;font-size:20px;color:#fff}.v39-research-detail-head small{display:block;margin-top:3px;color:#aebabc}.v39-research-detail-head>strong{font-size:20px;color:#e6c66e}.v39-research-detail-head>strong.completed{color:#69d18d}
.v39-research-large-progress{position:relative;height:22px;margin:12px 0;background:#091216;border:1px solid #53656a;border-radius:7px;overflow:hidden}.v39-research-large-progress i{display:block;height:100%;background:linear-gradient(90deg,#9d7839,#e3c36a)}.v39-research-large-progress span{position:absolute;inset:0;display:grid;place-items:center;font-size:13px;font-weight:900;color:#fff;text-shadow:0 1px 2px #000}
.v39-research-detail p{font-size:15px;line-height:1.55}.v39-research-details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;padding:0;list-style:none}.v39-research-details li{display:flex;justify-content:space-between;gap:7px;padding:5px 7px;background:#1b2b30;border-radius:5px;font-size:13px}.v39-research-requirement{color:#aebabc!important;font-size:13px!important}
.v39-research-select{width:100%;min-height:42px;margin-top:8px;border:1px solid #c7a856;border-radius:7px;background:#3b321d;color:#fff1be;font-size:15px;font-weight:900}.v39-research-select:disabled{opacity:.55}

/* Compact field research rail: screen-left, icon + level only. */
.research-rail{
  left:0!important;right:auto!important;top:6px!important;bottom:auto!important;
  width:38px!important;display:grid!important;gap:3px!important;padding:4px 3px!important;
  border-left:0!important;border-radius:0 8px 8px 0!important;
  background:rgba(9,16,19,.68)!important;box-shadow:0 5px 16px rgba(0,0,0,.24)!important;
  backdrop-filter:blur(4px)!important
}
.research-rail-title{display:none!important}
.research-rail-btn{
  width:32px!important;height:40px!important;min-width:32px!important;min-height:40px!important;
  display:grid!important;grid-template-rows:25px 10px!important;place-items:center!important;gap:1px!important;
  padding:2px!important;border-radius:7px!important;background:rgba(18,28,32,.78)!important
}
.research-rail-btn .gauge{width:24px!important;height:24px!important}
.research-rail-btn .gauge b{font-size:13px!important;line-height:1!important}
.research-rail-btn small{display:none!important}
.research-rail-btn .lv{
  position:static!important;inset:auto!important;min-width:0!important;width:auto!important;height:auto!important;
  border:0!important;border-radius:0!important;background:transparent!important;
  display:block!important;font-size:9px!important;font-weight:900!important;line-height:9px!important;color:#e8e4d5!important
}
.research-rail-btn.active::after{display:none!important}
.research-rail-btn.active{border-color:#f0cf76!important;background:rgba(37,33,22,.86)!important}
@media(max-width:760px){
.research-rail{top:4px!important;width:36px!important;padding:3px 2px!important;gap:3px!important}
.research-rail-btn{width:31px!important;height:38px!important;min-width:31px!important;min-height:38px!important;grid-template-rows:24px 9px!important}
.research-rail-btn .gauge{width:23px!important;height:23px!important}
.research-rail-btn .gauge b{font-size:12px!important}
.research-rail-btn .lv{font-size:8px!important;line-height:8px!important}
#researchModal .modal{width:98vw;height:94vh}.v39-research-categories{grid-template-columns:repeat(5,1fr)}.v39-research-category{min-height:42px;padding:3px;font-size:13px;gap:3px}.v39-research-category b{font-size:15px}.v39-research-category small{display:none}.v39-research-layout{grid-template-columns:minmax(0,1.45fr) minmax(200px,1fr)}.v39-research-level{flex-basis:145px}.v39-research-item{min-height:75px}.v39-research-detail{padding:8px}.v39-research-detail-head b{font-size:16px}}
`;
  document.head.appendChild(style);
}

installStyles();
installEvents();
renderAll();

window.openV39Research = openCategory;
window.getV39ResearchState = currentResearch;
window.selectV39Research = selectResearchForActivePlayer;
window.addV39ResearchExperience = addExperienceForActivePlayer;
window.assignV39ResearchUnit = assignResearchUnit;

export { addExperienceForActivePlayer, openCategory, selectResearchForActivePlayer };
