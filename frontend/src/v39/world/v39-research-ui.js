import {renderV39ScreenIcon} from "../ui/v39-screen-icons.js";
import { V39_RESEARCH_EFFECT_FIELDS, V39_PENDING_RESEARCH_EFFECT_FIELDS } from "../../lib/v39-research-effects.js";
import {resolveV39CityUnitModifiers} from '../../lib/v39-city-specialization-rules.js';
import {collectV39WaitingSupportUnits} from '../../lib/v39-production-unit-support.js';
import {getFactionSettlementById} from '../../lib/settlement-state.js';
import {
  RESEARCH_CATEGORY_ORDER,
  getResearchCategoryMeta,
  normalizeResearchCategoryName,
  researchTreeData
} from "../../lib/research-tree-config.js";
import {
  addResearchExperience,
  findResearchItem,
  isResearchCompleted,
  inspectResearchUnlock,
  normalizeResearchState,
  researchExperiencePerTurn,
  RESEARCH_EXP_PER_TURN,
  requiredResearchExp,
  resolveCompletedResearchLevel,
  resolveV39ResearchSettlement,
  selectResearch
} from "../../lib/research-progress.js";
import { grantV39ActionExperience, resolveV39ResearchExpReward } from "../../lib/v39-unit-experience.js";
import { getV39ResearchDiscoveryTargets } from "../../lib/v39-research-discovery.js";
import { facilitiesUnlockedByResearch } from "../../lib/v39-construction-research.js";
import { facilityDefinitions } from "../../lib/v39-economy-rules.js";
import { layoutResearchFlow } from "../../lib/research-flow-layout.js";
import { updateV39RetainedMarkup } from "../ui/v39-retained-markup.js";

let activeCategory = RESEARCH_CATEGORY_ORDER.find(key => researchTreeData.categories[key]) || "";
let inspectedItemId = "";
let renderedCategory = "";
let researchView = "list";
let renderedView = "";
const boardScrollPositions = new Map();
let renderedItemId = "";
const compactResearch = () => window.matchMedia("(max-width:760px)").matches;

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

function researchSupport(player, waitingUnits, category, item) {
  let unit = null;
  let experience = RESEARCH_EXP_PER_TURN;
  for (const candidate of waitingUnits || []) {
    const amount = researchExperiencePerTurn(candidate,category,researchTreeData,item,resolveV39CityUnitModifiers(player,candidate));
    if (amount > experience) {
      experience = amount;
      unit = candidate;
    }
  }
  return {unit,experience,bonus:experience-RESEARCH_EXP_PER_TURN};
}

function categoryRows(categoryKey) {
  return researchTreeData.categories?.[categoryKey]?.levels || [];
}

function firstInspectableId(categoryKey, research = currentResearch()) {
  const selected = String(research.selection?.[categoryKey] || "");
  if (selected) return selected;
  const items=categoryRows(categoryKey).flatMap(row=>row.items || []);
  return String(items.find(item=>!isResearchCompleted(research,categoryKey,item.level,item.id)
    && inspectResearchUnlock(research,item.id).unlocked)?.id || items[0]?.id || "");
}

function updateFactionResearch(nextResearch, reason) {
  if (!activeFaction()) return false;
  window.updateV39ActiveFactionState?.({ research:normalizeResearchState(nextResearch) }, { reason });
  return true;
}

function selectResearchForActivePlayer(categoryKey, itemId) {
  const category = normalizeResearchCategoryName(categoryKey);
  const research = currentResearch();
  const base = resolveV39ResearchSettlement(activeFaction());
  const result = selectResearch(research, category, itemId, null, researchTreeData, base?.settlementId);
  if (result.changed) {
    inspectedItemId = String(itemId || "");
    updateFactionResearch(result.state, "research-selection");
    window.dispatchEvent(new CustomEvent("v39:research-selected", { detail:{ category, itemId } }));
  }
  renderAll();
  return result;
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
  updateV39RetainedMarkup(rail, RESEARCH_CATEGORY_ORDER
    .filter(key => researchTreeData.categories[key])
    .map(key => {
      const meta = getResearchCategoryMeta(key);
      const progress = categoryProgress(key, research);
      const level = Math.min(7, resolveCompletedResearchLevel(research, key) + 1);
      const selected = research.selection?.[key] ? " active" : "";
      return `<button class="research-rail-btn${selected}" data-v39-research-category="${key}" style="--p:${progress.ratio}%;--accent:${meta.accent}" title="${meta.label} Lv${level} / EXP ${progress.current}/${progress.required}" aria-label="${meta.label} Lv${level}"><span class="gauge"><b>${renderV39ScreenIcon("研究・"+meta.label)||meta.icon}</b></span><span class="lv">${level}</span></button>`;
    }).join(""), {preserveInput:true});
}

function itemDetails(item) {
  const details = (item?.details || []).map(row => {
    const suffix = V39_RESEARCH_EFFECT_FIELDS.includes(row.key)
      ? (["幸福度", "治安"].includes(row.key) ? "（目標値加算）" : "（生産技能加算）")
      : row.key==='薬即時回復'?'（即時回復HP加算）':row.key==='薬生成量'?'（製造1回の個数加算）':V39_PENDING_RESEARCH_EFFECT_FIELDS.includes(row.key) ? "（未接続）" : "";
    return `<li><span>${escapeHtml(row.key + suffix)}</span><b>${escapeHtml(row.value)}</b></li>`;
  }).join("");
  const targets = getV39ResearchDiscoveryTargets(item?.category, item?.level, item?.id);
  const discovery = targets.length ? `<section class="v39-research-discovery-targets" data-research-discovery-targets><b>新たに発見できる対象</b><p>${targets.map(escapeHtml).join("・")}</p><small>研究完了で調査済みマスの対象を自動発見します。未調査マスは調査が必要です。</small></section>` : "";
  const facilities = facilitiesUnlockedByResearch(item?.id, facilityDefinitions());
  const construction = facilities.length ? `<section class="v39-research-discovery-targets" data-research-construction-targets><b>建設を解禁する施設</b><p>${facilities.map(row => escapeHtml(row.name)).join("・")}</p><small>必要研究Lv・資材・拠点段階・土地条件も満たす必要があります。</small></section>` : "";
  return discovery + construction + (details ? `<ul class="v39-research-details">${details}</ul>` : "");
}

function researchCardStatus(done, picked, unlocked) {
  if (done) return {state:"completed", label:"完了"};
  if (picked) return {state:"running", label:"研究中"};
  return unlocked ? {state:"available", label:"研究可能"} : {state:"locked", label:"未解禁"};
}

function renderLevelList(research, selectedId) {
  return categoryRows(activeCategory).map(levelRow => {
    const cards = (levelRow.items || []).map(item => {
      const check = inspectResearchUnlock(research, item.id);
      const done = isResearchCompleted(research, activeCategory, item.level, item.id);
      const picked = item.id === selectedId;
      const active = item.id === inspectedItemId;
      const exp = Math.max(0, Number(research.progress.targetExpMap[item.id]) || 0);
      const required = requiredResearchExp(item.level);
      const status = researchCardStatus(done,picked,check.unlocked);
      return `<button class="v39-research-item${active ? " active" : ""}${picked ? " picked" : ""}${done ? " completed" : ""}" data-research-status="${status.state}" data-research-item="${escapeHtml(item.id)}" data-research-locked="${!check.unlocked}" aria-pressed="${active}"><strong>${escapeHtml(item.name)}</strong><span class="v39-research-item-progress"><i style="width:${Math.min(100, exp / required * 100)}%"></i></span><small>${status.label} / ${exp}/${required}</small></button>`;
    }).join("");
    return `<section class="v39-research-level"><header><b>Lv${levelRow.level}</b><small>必要研究Lv ${Math.min(...levelRow.items.map(item => item.requiredResearchLevel))}</small></header><div>${cards}</div></section>`;
  }).join("");
}

function renderFlow(research, selectedId) {
  const body = document.querySelector("#researchModal .modal-body");
  const compact = compactResearch();
  // 非表示のモーダルを開く直前も、0pxの幅で図を生成しない。
  const bodyWidth = body?.clientWidth || (compact ? window.innerWidth - 2 : Math.min(1200,window.innerWidth*0.96)-2);
  const available = bodyWidth - (compact ? 20 : 360);
  const columns = compact ? (available >= 280 ? 2 : 1) : Math.max(1,Math.min(3,Math.floor(available / 190)));
  const width = Math.max(110,Math.min(180,Math.floor((available - 24 - (columns - 1)*14) / columns)));
  const height = Math.max(78,Math.ceil(Number.parseFloat(getComputedStyle(body).fontSize)*5.5) || 78);
  const flow=layoutResearchFlow(categoryRows(activeCategory).flatMap(row=>row.items || []),{width,height,maxColumns:columns});
  const cards=flow.nodes.map(node=>{
    const item=node.item, check=inspectResearchUnlock(research,item.id);
    const done=isResearchCompleted(research,activeCategory,item.level,item.id), picked=item.id===selectedId;
    const exp=Number(research.progress.targetExpMap[item.id])||0, required=requiredResearchExp(item.level);
    const status=researchCardStatus(done,picked,check.unlocked);
    return `<button class="v39-research-item v39-research-node${done?" completed":""}${picked?" picked":""}${item.id===inspectedItemId?" active":""}" data-research-status="${status.state}" data-research-item="${escapeHtml(item.id)}" data-research-locked="${!check.unlocked}" aria-pressed="${item.id===inspectedItemId}" style="left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px" title="${escapeHtml(check.reasons.join(" / ") || status.label)}"><small class="v39-research-node-status">Lv${item.level} <b>${status.label}</b></small><strong>${escapeHtml(item.name)}</strong><span class="v39-research-item-progress"><i style="width:${Math.min(100,exp/required*100)}%"></i></span><small>${exp} / ${required} EXP</small></button>`;
  }).join("");
  const edges=flow.edges.map(({from,to})=>{
    const x1=from.x+from.width/2,y1=from.y+from.height,x2=to.x+to.width/2,y2=to.y;
    const completed=isResearchCompleted(research,activeCategory,from.item.level,from.item.id);
    const adjacent = Math.abs(y2-y1) <= 40;
    const path = adjacent ? `M ${x1} ${y1} L ${x2} ${y2}`
      : `M ${x1} ${y1} L ${to.x-8} ${y1+10} L ${to.x-8} ${y2-10} L ${x2} ${y2}`;
    return `<path data-research-edge="${escapeHtml(from.item.id)}" class="${completed?"complete":""}" d="${path}" marker-end="url(#research-arrow)"/>`;
  }).join("");
  return `<div class="v39-research-flow" style="width:${flow.width}px;height:${flow.height}px"><svg class="v39-research-connections" width="${flow.width}" height="${flow.height}" aria-hidden="true"><defs><marker id="research-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 Z" fill="#80a6ae"/></marker></defs>${edges}</svg>${cards}</div>`;
}

function renderModal() {
  const backdrop = document.getElementById("researchModal");
  const modal = backdrop?.querySelector(":scope > .modal");
  if (!(backdrop instanceof HTMLElement) || !(modal instanceof HTMLElement)) return;
  modal.classList.add("research-modal-shell");
  const head = modal.querySelector(":scope > .modal-head");
  const body = modal.querySelector(":scope > .modal-body");
  if (!(head instanceof HTMLElement) || !(body instanceof HTMLElement)) return;
  const previousBoard = body.querySelector(".v39-research-board");
  const previousDetail = body.querySelector(".v39-research-detail-content");
  if (previousBoard?.clientHeight) boardScrollPositions.set(`${renderedCategory}:${renderedView}`, {left:previousBoard.scrollLeft,top:previousBoard.scrollTop});
  const preserveScroll = renderedCategory === activeCategory && renderedView === researchView;
  const savedScroll = boardScrollPositions.get(`${activeCategory}:${researchView}`);
  const scrollLeft = savedScroll?.left || 0;
  const scrollTop = savedScroll?.top || 0;
  const detailScrollTop = preserveScroll && renderedItemId === inspectedItemId ? previousDetail?.scrollTop || 0 : 0;
  const heading = head.querySelector("h2");
  if (heading) heading.textContent = "研究";
  let viewSelect = head.querySelector("[data-research-view]");
  if (!viewSelect) {
    viewSelect = document.createElement("select");
    viewSelect.dataset.researchView = "";
    viewSelect.className = "v39-research-view";
    viewSelect.setAttribute("aria-label", "研究の表示形式");
    viewSelect.innerHTML = '<option value="list">研究一覧</option><option value="flow">フローチャート</option>';
    heading?.after(viewSelect);
  }
  viewSelect.value = researchView;
  body.dataset.researchLayoutMode = researchView;

  const research = currentResearch();
  if (!researchTreeData.categories[activeCategory]) activeCategory = RESEARCH_CATEGORY_ORDER.find(key => researchTreeData.categories[key]) || "";
  if (!inspectedItemId || !categoryRows(activeCategory).some(row => (row.items || []).some(item => item.id === inspectedItemId))) {
    inspectedItemId = firstInspectableId(activeCategory, research);
  }
  const inspected = categoryRows(activeCategory).flatMap(row => row.items || []).find(item => item.id === inspectedItemId) || null;
  const selectedId = String(research.selection?.[activeCategory] || "");
  const selected = inspected?.id === selectedId;
  const completed = inspected ? isResearchCompleted(research, activeCategory, inspected.level, inspected.id) : false;
  const unlockCheck=inspectResearchUnlock(research,inspected?.id);
  const unlocked=unlockCheck.unlocked;
  const currentExp = inspected ? Math.max(0, Number(research.progress.targetExpMap?.[inspected.id]) || 0) : 0;
  const requiredExp = requiredResearchExp(inspected?.level || 1);

  const categoryButtons = RESEARCH_CATEGORY_ORDER.filter(key => researchTreeData.categories[key]).map(key => {
    const meta = getResearchCategoryMeta(key);
    const level = Math.min(7, resolveCompletedResearchLevel(research, key) + 1);
    const active = key === activeCategory;
    return `<button class="v39-research-category${active ? " active" : ""}" data-research-category="${key}" style="--cat-accent:${meta.accent}" aria-pressed="${active}"><b>${renderV39ScreenIcon("研究・"+meta.label)||meta.icon}</b><span>${meta.label}</span><small>Lv${level}${active ? " 選択中" : ""}</small></button>`;
  }).join("");

  const levels = researchView === "flow" ? renderFlow(research, selectedId) : renderLevelList(research, selectedId);

  const actionLabel = completed ? "研究完了" : (selected ? "研究中" : "研究として選択");
  const state = window.getV39GameState?.();
  const player = window.getV39ActivePlayer?.();
  const selectedBase = resolveV39ResearchSettlement(player?.factionState);
  const baseId = (selected && research.settlementIdByCategory[activeCategory]) || selectedBase?.settlementId;
  const base = baseId && getFactionSettlementById(player?.factionState,baseId);
  const waiting = state && baseId ? collectV39WaitingSupportUnits(player,state,Number(state.timeline?.turnNumber)).get(baseId) : [];
  const support = researchSupport(player,waiting,activeCategory,inspected);
  const conditions = inspected ? `<section class="v39-research-requirement"><b>解禁条件</b><div class="${unlockCheck.currentLevel >= unlockCheck.requiredLevel ? 'met' : 'unmet'}">${unlockCheck.currentLevel >= unlockCheck.requiredLevel ? '✓' : '×'} 研究Lv ${unlockCheck.requiredLevel} が必要（現在Lv${unlockCheck.currentLevel}）</div>${unlockCheck.prerequisites.map(row=>`<div class="${row.completed ? 'met' : 'unmet'}">${row.completed ? '✓' : '×'} ${escapeHtml(row.name)} <b>${row.completed ? '完了' : '未完了'}</b></div>`).join('')}${unlockCheck.prerequisites.length ? '' : '<div class="met">✓ 前提研究なし</div>'}${(inspected.prerequisiteErrors || []).map(error=>`<div class="unmet">${escapeHtml(error)}</div>`).join('')}</section>` : '';
  updateV39RetainedMarkup(body, `<div class="v39-research-overview"><nav class="v39-research-categories">${categoryButtons}</nav><p class="v39-research-guide">${researchView === 'flow' ? '上から下へ研究が進みます。矢印は前提研究です。' : 'Lv別の研究一覧です。'} 項目を選ぶと効果と条件を確認できます。</p></div><div class="v39-research-layout"><div class="v39-research-board">${levels || '研究データがありません。'}</div><aside class="v39-research-detail"><div class="v39-research-detail-content">${inspected ? `<div class="v39-research-detail-head"><div class="v39-research-title-line"><b>${escapeHtml(inspected.name)}</b><strong>${completed ? requiredExp : currentExp}/${requiredExp} EXP</strong></div></div><p>${escapeHtml(inspected.desc || '説明なし')}</p>${conditions}${itemDetails(inspected)}` : '研究項目を選択してください。'}<div class="v39-research-support"><span>${escapeHtml(base?.name || (baseId ? "研究拠点" : "拠点未配置"))}</span><small>基本 +${RESEARCH_EXP_PER_TURN} / 待機支援 +${support.bonus} EXP/T</small></div><details class="v39-research-efficiency"><summary>研究速度の内訳</summary><p>短縮技能 ${escapeHtml(researchTreeData.timeReductionSkills?.[activeCategory] || '-')}<br>支援ユニット ${support.unit ? escapeHtml(unitName(support.unit)) : "なし"}</p></details></div><footer class="v39-research-detail-footer"><button class="v39-research-select" data-select-research ${(!unlocked || completed || selected) ? 'disabled' : ''}>${!unlocked && !completed && !selected ? '条件未達成' : actionLabel}</button></footer></aside></div>`, {preserveInput:true,preserveDetails:()=>preserveScroll && renderedItemId === inspectedItemId});
  const board = body.querySelector(".v39-research-board");
  const detail = body.querySelector(".v39-research-detail-content");
  if (board) { board.scrollLeft = scrollLeft; board.scrollTop = scrollTop; }
  if (detail) detail.scrollTop = detailScrollTop;
  renderedCategory = activeCategory;
  renderedView = researchView;
  renderedItemId = inspectedItemId;
}

function renderAll() {
  renderRail();
  renderModal();
}

function openCategory(categoryKey) {
  const normalized = normalizeResearchCategoryName(categoryKey);
  const category = researchTreeData.categories[normalized] ? normalized
    : Object.keys(researchTreeData.categories).find(key=>categoryRows(key).some(row=>row.items.some(item=>item.id.startsWith(`${normalized}:`))));
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
    if (event.target.matches?.("[data-research-view]")) {
      researchView = event.target.value === "flow" ? "flow" : "list";
      renderModal();
      return;
    }
  });
  window.addEventListener("v39:game-state-changed", renderAll);
  window.addEventListener("resize", renderModal);
  window.addEventListener("v39:turn-stage-research", advanceAllPlayerResearch);
}

function advanceAllPlayerResearch() {
  const state = window.getV39GameState?.();
  if (!state) return;
  const turnNumber = Math.max(1, Math.floor(Number(state?.timeline?.turnNumber) || 1));
  let changed = false;
  const levelUps = [];
  const players = (state.players || []).map(player => {
    let playerChanged = false;
    let research = normalizeResearchState(player?.factionState?.research);
    if (research.lastProcessedTurn >= turnNumber) return player;
    let units = player?.factionState?.units || [];
    const waiting = collectV39WaitingSupportUnits(player,state,turnNumber);
    const selectedBase = resolveV39ResearchSettlement(player.factionState);
    const activityLog = [...(player.factionState.activityLog || [])];
    for (const category of Object.keys(research.selection)) {
      const baseId = research.settlementIdByCategory[category] || selectedBase?.settlementId;
      if (baseId) research.settlementIdByCategory[category] = baseId;
      const itemId = research.selection[category];
      const found = findResearchItem(itemId);
      const beforeExp = Number(research.progress.targetExpMap[itemId]) || 0;
      const {unit,experience} = researchSupport(player,waiting.get(baseId),category,found?.item);
      const result = addResearchExperience(research, category, experience);
      research = result.state;
      if (result.changed && found && unit) {
        const assignedId = unitId(unit);
        const progress = (research.progress.targetExpMap[itemId] - beforeExp) / requiredResearchExp(found.level);
        const reward = resolveV39ResearchExpReward({ researchLevel:found.level, requiredResearchExp:requiredResearchExp(found.level), progressRate:progress });
        const award = grantV39ActionExperience(units.find(row => unitId(row) === assignedId) || unit, "research", reward.rawExp);
        units = units.map(row => unitId(row) === assignedId ? award.unit : row);
        activityLog.push({ type:"research-experience", turn:turnNumber, unitId:assignedId,
          message:`研究: ${found.item.name || itemId} / ${unitName(unit)} EXP +${award.amount}${award.leveledUp ? ` / Lv${award.toLevel}` : ""}` });
        if (award.leveledUp) levelUps.push({ playerId:player.id, unitId:assignedId, unitName:unitName(unit), fromLevel:award.fromLevel, toLevel:award.toLevel });
      }
      playerChanged ||= result.changed;
      changed ||= result.changed;
    }
    research.lastProcessedTurn = turnNumber;
    playerChanged = true;
    changed = true;
    return playerChanged ? { ...player, factionState:{ ...player.factionState, research, units, activityLog:activityLog.slice(-200) } } : player;
  });
  if (changed) window.setV39GameState?.({ players }, { reason:"research-turn-progress" });
  for (const detail of levelUps) window.dispatchEvent(new CustomEvent("v39:unit-level-up", { detail }));
}

function installStyles() {
  if (document.getElementById("v39-research-ui-style")) return;
  const style = document.createElement("style");
  style.id = "v39-research-ui-style";
  style.textContent = `
#researchModal .modal{width:min(1200px,96vw);height:min(820px,94svh);background:#0d171b;border:1px solid #53646a}
#researchModal .modal-body{display:grid;grid-template-rows:auto minmax(0,1fr);height:100%;min-height:0;min-width:0;box-sizing:border-box;padding:8px;overflow:hidden;font-size:var(--font-body)}
.v39-research-overview{min-width:0;overflow:hidden}
#researchModal .modal-head{gap:12px;flex-shrink:0}
.v39-research-view{margin-left:auto;max-width:50%;padding:7px 10px;background:#152226;color:#dce4e4;border:1px solid #53646a;border-radius:6px;font-size:var(--font-body)}
.v39-research-categories{display:flex;gap:4px;overflow-x:auto;padding-bottom:3px}
.v39-research-category{flex:1 0 auto;min-width:64px;min-height:34px;padding:4px 8px;display:flex;align-items:center;justify-content:center;gap:5px;color:#c9d4d5;background:#152226;border:1px solid #405057;border-radius:6px;font-size:var(--font-body);font-weight:800}
.v39-research-category b{color:var(--cat-accent)}
.v39-research-category small{font-size:var(--font-secondary);color:#91a1a5}
.v39-research-category.active{border:2px solid var(--cat-accent);background:#243035;color:#fff}
.v39-research-guide{margin:9px 0;color:#aebabc;font-size:var(--font-body)}
.v39-research-layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:12px;min-height:0;min-width:0}
.v39-research-board{display:block;min-height:0;min-width:0;overflow:auto;overscroll-behavior:contain;border:1px solid #31454b;border-radius:8px;background:#101c20}
#researchModal [data-research-layout-mode="list"] .v39-research-board{display:grid;align-content:start;gap:8px;padding:6px}
.v39-research-flow{position:relative}
.v39-research-connections{position:absolute;inset:0;pointer-events:none}
.v39-research-connections>path{fill:none;stroke:#80a6ae;stroke-width:2}
.v39-research-connections>path.complete{stroke:#73cf9a;stroke-width:3}
.v39-research-node{position:absolute;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column}
.v39-research-node-status{display:flex!important;justify-content:space-between;gap:5px}
.v39-research-node-status b{padding:2px 5px;border-radius:4px;background:#293b42;color:#dce4e4;font-size:var(--font-secondary)}
.v39-research-node strong{margin-top:3px;overflow-wrap:anywhere}
.v39-research-node .v39-research-item-progress{margin-top:auto;flex-shrink:0}
.v39-research-level{min-width:0;border:0;border-bottom:1px solid #3d4e54;background:#111e22;padding:5px}
.v39-research-level>header{display:flex;justify-content:space-between;gap:5px;align-items:center;margin-bottom:8px;color:#e8dcc1}
.v39-research-level>header small{font-size:var(--font-secondary);color:#a6b3b5}
.v39-research-level>div{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:5px}
.v39-research-item{min-height:54px;min-width:0;padding:6px;text-align:left;color:#d8e0e0;background:#17252a;border:1px solid #45575e;border-radius:6px}
.v39-research-item strong{display:block;font-size:var(--font-body);line-height:1.45}
.v39-research-item small{display:block;margin-top:4px;font-size:var(--font-secondary);color:#b9c5c8;line-height:1.4}
.v39-research-item-progress{display:block;height:4px;margin-top:5px;background:#091114;border:1px solid #435158;border-radius:8px;overflow:hidden}
.v39-research-item-progress i{display:block;height:100%;background:#d1aa61}
.v39-research-item[data-research-status="locked"]{background:#20272a;border-color:#59636a;color:#d2d8db}
.v39-research-item[data-research-status="available"]{background:#163447;border-color:#4b8cab;color:#e5f5ff}
.v39-research-item[data-research-status="available"] small{color:#b8e0f4}
.v39-research-item[data-research-status="running"]{background:#3c3019;border-color:#c7a856;color:#fff1be}
.v39-research-item[data-research-status="running"] small{color:#f4d486}
.v39-research-item[data-research-status="completed"]{background:#1c2c28;border-color:#546f66;color:#d5e5df}
.v39-research-item[data-research-status="completed"] .v39-research-item-progress i{background:#719d8e}
.v39-research-item.active{outline:2px solid #eaf6fb;outline-offset:-2px}
.v39-research-detail{display:grid;grid-template-rows:minmax(0,1fr) auto;min-height:0;min-width:0;overflow:hidden;border:1px solid #44555b;border-radius:9px;background:#142126;color:#dce4e4}
.v39-research-detail-content{min-height:0;overflow:auto;padding:14px;overscroll-behavior:contain}
.v39-research-title-line{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.v39-research-detail-head b{display:block;font-size:var(--font-heading);color:#fff;line-height:1.5;overflow-wrap:anywhere}
.v39-research-title-line>strong{flex-shrink:0;white-space:nowrap;font-size:var(--font-secondary);color:#e6c66e}
.v39-research-detail p{font-size:var(--font-body);line-height:1.7;overflow-wrap:anywhere}
.v39-research-requirement{display:grid;gap:8px;padding:12px;margin:14px 0;border:1px solid #405057;border-radius:7px;font-size:var(--font-body);line-height:1.6}
.v39-research-requirement .met{color:#91d5b0}
.v39-research-requirement .unmet{color:#f0c58b}
.v39-research-support{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:6px;margin-top:12px;padding-top:8px;border-top:1px solid #405057;font-size:var(--font-body);font-weight:800}
.v39-research-support small{font-size:var(--font-secondary);color:#77ce96}
.v39-research-efficiency{margin-top:12px;font-size:var(--font-secondary);color:#aebabc}
.v39-research-efficiency summary{cursor:pointer;padding:8px 0}
.v39-research-detail-footer{padding:10px 14px;background:#142126;border-top:1px solid #405057}
.v39-research-select{width:100%;min-height:44px;border:1px solid #c7a856;border-radius:7px;background:#3b321d;color:#fff1be;font-size:var(--font-body);font-weight:900}
.v39-research-select:disabled{color:#bfc8c9;background:#263034;border-color:#53646a}
.v39-research-discovery-targets{padding:10px;border:1px solid #405057;border-radius:7px;background:#152226;margin:10px 0;font-size:var(--font-body)}
.v39-research-discovery-targets p{margin:6px 0;color:#a8dec4}
.v39-research-discovery-targets small{font-size:var(--font-secondary);line-height:1.6;color:#aebabc;display:block}
.v39-research-details{display:grid;gap:6px;padding:0;list-style:none}
.v39-research-details li{display:flex;justify-content:space-between;gap:7px;padding:6px 8px;background:#1b2b30;border-radius:5px;font-size:var(--font-body)}
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
.research-rail-btn .gauge b{font-size:var(--font-secondary)!important;line-height:1!important;color:var(--accent,#70b7c6)!important}
.research-rail-btn small{display:none!important}
.research-rail-btn .lv{
  position:static!important;inset:auto!important;min-width:0!important;width:auto!important;height:auto!important;
  border:0!important;border-radius:0!important;background:transparent!important;
  display:block!important;font-size:var(--font-size-9)!important;font-weight:900!important;line-height:9px!important;color:#e8e4d5!important
}
.research-rail-btn.active::after{display:none!important}
.research-rail-btn.active{border-color:#f0cf76!important;background:rgba(37,33,22,.86)!important}
@media(max-width:760px){
#researchModal{padding:0}
#researchModal .modal{box-sizing:border-box}
.research-rail{top:4px!important;width:36px!important;padding:3px 2px!important;gap:3px!important}
.research-rail-btn{width:31px!important;height:38px!important;min-width:31px!important;min-height:38px!important;grid-template-rows:24px 9px!important}
.research-rail-btn .gauge{width:23px!important;height:23px!important}
.research-rail-btn .gauge b{font-size:var(--font-size-14)!important}
.research-rail-btn .lv{font-size:var(--font-size-8)!important;line-height:8px!important}
#researchModal .modal{width:100vw;height:100svh;max-height:100svh;border-radius:0}
#researchModal .modal-body{padding:8px}
.v39-research-categories{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}
.v39-research-category{min-height:34px;gap:4px;font-size:var(--font-body)}
.v39-research-category small{display:none}
.v39-research-layout{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) minmax(0,1fr);gap:8px}
.v39-research-detail-content{padding:10px}
.v39-research-detail-footer{padding:6px 10px}
#researchModal [data-research-layout-mode="list"] .v39-research-board{display:block}
.v39-research-level{margin-bottom:12px}
}
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

export { addExperienceForActivePlayer, openCategory, selectResearchForActivePlayer };
