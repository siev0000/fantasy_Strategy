import {
  advanceV39DiplomacyTurn,
  calculateV39NationPolicyModifiers,
  canV39FactionAttack,
  declareV39War,
  endV39War,
  getV39DiplomacyRelation,
  getV39DiplomacyRelationLabel,
  getV39NationPolicyOptions,
  improveV39DiplomacyRelation,
  isV39DemonFactionPair,
  cancelV39Treaty,
  signV39Treaty,
  V39_TREATY_TYPES
} from "./lib/v39-diplomacy-rules.js";
import { getGameDataRecordId } from "./lib/game-data-registry.js";

const escapeHtml = value => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

let activeSection = "policy";

function ensurePanel() {
  const host = document.getElementById("footManage");
  if (!(host instanceof HTMLElement)) return null;
  let panel = document.getElementById("v39-nation-panel");
  if (panel) return panel;
  panel = document.createElement("section");
  panel.id = "v39-nation-panel";
  panel.className = "v39-nation-panel";
  panel.hidden = true;
  panel.setAttribute("aria-hidden", "true");
  host.appendChild(panel);
  return panel;
}

function optionMarkup(table, rows, selectedId) {
  return ['<option value="">未選択</option>', ...rows.map(row => {
    const id = getGameDataRecordId(table, row);
    return `<option value="${escapeHtml(id)}"${id === selectedId ? " selected" : ""}>${escapeHtml(row?.項目名)}</option>`;
  })].join("");
}

function renderPolicy(player) {
  const options = getV39NationPolicyOptions();
  const policy = player?.factionState?.nationPolicy || {};
  const government = Object.entries(options.governmentByCategory).map(([category, rows]) => `
    <label class="v39-nation-field"><span>${escapeHtml(category)}</span>
      <select data-v39-government="${escapeHtml(category)}">${optionMarkup("体制", rows, policy.governmentSelections?.[category])}</select>
    </label>`).join("");
  const organizations = options.organizations.map(row => {
    const id = getGameDataRecordId("組織", row);
    const checked = policy.organizationIds?.includes(id) ? " checked" : "";
    return `<label class="v39-nation-check"><input type="checkbox" data-v39-organization="${escapeHtml(id)}"${checked}><span>${escapeHtml(row?.項目名)}</span></label>`;
  }).join("");
  const modifierText = Object.entries(policy.modifiers || {}).map(([key, value]) => `${key} ${Number(value) > 0 ? "+" : ""}${value}`).join(" / ") || "補正なし";
  return `<div class="v39-nation-policy-grid">
    <section class="v39-nation-card"><h4>国家体制</h4>${government || '<p class="v39-nation-muted">定義なし</p>'}</section>
    <section class="v39-nation-card"><h4>外交姿勢</h4><label class="v39-nation-field"><span>姿勢</span><select id="v39-diplomacy-stance">${optionMarkup("外交姿勢", options.diplomacyStances, policy.diplomacyStanceId)}</select></label><p class="v39-nation-modifiers">${escapeHtml(modifierText)}</p></section>
    <section class="v39-nation-card"><h4>組織</h4><div class="v39-nation-checks">${organizations || '<p class="v39-nation-muted">定義なし</p>'}</div></section>
  </div>`;
}

function renderDiplomacy(state, player) {
  const others = state.players.filter(row => row.id !== player?.id);
  if (!others.length) return '<p class="v39-nation-empty">ほかの勢力はまだありません。</p>';
  return `<div class="v39-diplomacy-list">${others.map(target => {
    const relation = getV39DiplomacyRelation(state, player.id, target.id);
    const atWar = relation.status === "war";
    const exempt = isV39DemonFactionPair(player, target);
    const penalty = Number(relation.diplomacyPenalty) || 0;
    const relationValue = Number(relation.relationValue) || 0;
    const treaties = Object.values(relation.treaties || {}).filter(row => row?.active && Number(row.expiresAtTurn) > Number(state.timeline?.turnNumber));
    const detail = exempt ? "魔族同士: 宣戦不要・評価低下なし" : penalty ? `宣戦ペナルティ ${penalty} / T${relation.penaltyUntilTurn}まで` : "宣戦ペナルティなし";
    const treatyButtons = Object.entries(V39_TREATY_TYPES).map(([type, definition]) => {
      const active = treaties.some(row => row.type === type);
      return `<button type="button" data-v39-treaty-action="${active ? "cancel" : "sign"}" data-v39-treaty-type="${type}" data-v39-target-player="${escapeHtml(target.id)}">${active ? `${escapeHtml(definition.label)}解除` : escapeHtml(definition.label)}</button>`;
    }).join("");
    return `<article class="v39-diplomacy-row">
      <div><strong>${escapeHtml(target.label)}</strong><span>${escapeHtml(target.race || "種族未設定")}</span></div>
      <div><b class="${atWar ? "war" : "peace"}">${atWar ? "戦争中" : `${getV39DiplomacyRelationLabel(relationValue)} ${relationValue}`}</b><small>${escapeHtml(detail)}</small><small>${escapeHtml(treaties.map(row => `${row.label}:T${row.expiresAtTurn}`).join(" / ") || "条約なし")}</small></div>
      <div class="v39-diplomacy-actions"><button type="button" data-v39-diplomacy-action="friendly" data-v39-target-player="${escapeHtml(target.id)}">親善</button><button type="button" data-v39-diplomacy-action="${atWar ? "peace" : "war"}" data-v39-target-player="${escapeHtml(target.id)}">${atWar ? "停戦" : "宣戦"}</button>${treatyButtons}</div>
    </article>`;
  }).join("")}</div>`;
}

function render() {
  const panel = ensurePanel();
  if (!panel || panel.hidden) return;
  const state = window.getV39GameState?.();
  const player = window.getV39ActivePlayer?.();
  if (!state || !player) return;
  panel.innerHTML = `
    <header class="v39-nation-head"><button type="button" id="v39-nation-back">← 管理</button><strong>国家・外交</strong><span>${escapeHtml(player.label)}</span></header>
    <nav class="v39-nation-tabs"><button data-v39-nation-tab="policy" class="${activeSection === "policy" ? "active" : ""}">国家方針</button><button data-v39-nation-tab="diplomacy" class="${activeSection === "diplomacy" ? "active" : ""}">外交</button></nav>
    <div class="v39-nation-body">${activeSection === "policy" ? renderPolicy(player) : renderDiplomacy(state, player)}</div>`;
}

function openPanel() {
  const panel = ensurePanel();
  const menu = document.getElementById("v39-manage-menu");
  if (!panel || !menu) return;
  menu.hidden = true;
  panel.hidden = false;
  panel.setAttribute("aria-hidden", "false");
  render();
}

function closePanel() {
  const panel = ensurePanel();
  const menu = document.getElementById("v39-manage-menu");
  if (!panel || !menu) return;
  panel.hidden = true;
  panel.setAttribute("aria-hidden", "true");
  menu.hidden = false;
}

function savePolicyFromPanel() {
  const player = window.getV39ActivePlayer?.();
  const panel = document.getElementById("v39-nation-panel");
  if (!player || !panel) return;
  const governmentSelections = Object.fromEntries([...panel.querySelectorAll("[data-v39-government]")].map(select => [select.dataset.v39Government, select.value]).filter(([, value]) => value));
  const organizationIds = [...panel.querySelectorAll("[data-v39-organization]:checked")].map(input => input.dataset.v39Organization).filter(Boolean);
  const nationPolicy = {
    governmentSelections,
    diplomacyStanceId:document.getElementById("v39-diplomacy-stance")?.value || "",
    organizationIds
  };
  nationPolicy.modifiers = calculateV39NationPolicyModifiers(nationPolicy);
  window.updateV39ActiveFactionState?.({ nationPolicy }, { reason:"nation-policy" });
}

function updateDiplomacy(action, targetId) {
  const state = window.getV39GameState?.();
  const player = window.getV39ActivePlayer?.();
  if (!state || !player || !targetId) return;
  if (action === "friendly") {
    const result = improveV39DiplomacyRelation(state, player.id, targetId, state.timeline?.turnNumber);
    if (!result.ok) window.showV39TurnBanner?.(result.reason);
    else window.setV39GameState?.({ diplomacyRelations:result.state.diplomacyRelations }, { reason:"diplomacy-friendly" });
    render();
    return;
  }
  const next = action === "war" ? declareV39War(state, player.id, targetId, state.timeline?.turnNumber) : endV39War(state, player.id, targetId, state.timeline?.turnNumber);
  if (action === "war" && getV39DiplomacyRelation(next, player.id, targetId).status !== "war") {
    window.showV39TurnBanner?.("不可侵条約または同盟の有効中は宣戦できません");
    return;
  }
  window.setV39GameState?.({ diplomacyRelations:next.diplomacyRelations }, { reason:action === "war" ? "war-declared" : "war-ended" });
  render();
}

function updateTreaty(action, type, targetId) {
  const state = window.getV39GameState?.();
  const player = window.getV39ActivePlayer?.();
  if (!state || !player || !targetId) return;
  const result = action === "cancel"
    ? cancelV39Treaty(state, player.id, targetId, type, state.timeline?.turnNumber)
    : signV39Treaty(state, player.id, targetId, type, state.timeline?.turnNumber);
  if (!result.ok) window.showV39TurnBanner?.(result.reason);
  else {
    window.setV39GameState?.({ diplomacyRelations:result.state.diplomacyRelations }, { reason:`diplomacy-treaty-${action}` });
    window.showV39TurnBanner?.(action === "cancel" ? "条約を解除しました" : `${V39_TREATY_TYPES[type]?.label || "条約"}を締結しました`);
  }
  render();
}

function updateDiplomacyPair(action, firstPlayerId, secondPlayerId) {
  const state = window.getV39GameState?.();
  if (!state || !firstPlayerId || !secondPlayerId) return null;
  const next = action === "war"
    ? declareV39War(state, firstPlayerId, secondPlayerId, state.timeline?.turnNumber)
    : endV39War(state, firstPlayerId, secondPlayerId, state.timeline?.turnNumber);
  return window.setV39GameState?.({ diplomacyRelations:next.diplomacyRelations }, { reason:action === "war" ? "war-declared" : "war-ended" });
}

function installStyles() {
  if (document.getElementById("v39-nation-style")) return;
  const style = document.createElement("style");
  style.id = "v39-nation-style";
  style.textContent = `
.manage-menu-grid[hidden]{display:none!important}.v39-nation-panel{width:100%;height:100%;min-height:0;display:grid;grid-template-rows:auto auto minmax(0,1fr);gap:6px;overflow:hidden;color:#e8efec}.v39-nation-panel[hidden]{display:none!important}
.v39-nation-head{display:flex;align-items:center;gap:8px}.v39-nation-head button,.v39-nation-tabs button,.v39-diplomacy-row button{min-height:34px;border:1px solid #46606a;border-radius:7px;background:#17252a;color:#e8efec;padding:5px 10px}.v39-nation-head strong{font-size:15px}.v39-nation-head span{margin-left:auto;color:#a9bdc1;font-size:13px}
.v39-nation-tabs{display:flex;gap:5px}.v39-nation-tabs button.active{border-color:#6fd1e1;background:#18363c}.v39-nation-body{min-height:0;overflow:auto}.v39-nation-policy-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.v39-nation-card{min-width:0;border:1px solid #374b52;border-radius:8px;background:#121e23;padding:8px}.v39-nation-card h4{margin:0 0 7px;font-size:15px}.v39-nation-field{display:grid;gap:4px;margin-bottom:7px}.v39-nation-field span,.v39-nation-check span{font-size:13px}.v39-nation-field select{width:100%;min-height:32px;border:1px solid #435860;border-radius:6px;background:#0d181c;color:#e8efec;padding:4px 7px}.v39-nation-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.v39-nation-check{display:flex;align-items:center;gap:6px;min-height:32px}.v39-nation-check input{width:20px;height:20px}.v39-nation-modifiers,.v39-nation-muted,.v39-nation-empty{font-size:13px;color:#a7b8bb}
.v39-diplomacy-list{display:grid;gap:6px}.v39-diplomacy-row{display:grid;grid-template-columns:minmax(100px,.8fr) minmax(160px,1fr) minmax(220px,1.4fr);align-items:center;gap:8px;border:1px solid #374b52;border-radius:8px;background:#121e23;padding:7px}.v39-diplomacy-row>div{display:grid;gap:2px}.v39-diplomacy-row strong{font-size:15px}.v39-diplomacy-row span,.v39-diplomacy-row small{font-size:13px;color:#9eb1b5}.v39-diplomacy-row b{font-size:13px}.v39-diplomacy-row b.war{color:#ff927c}.v39-diplomacy-row b.peace{color:#7fd5a0}.v39-diplomacy-row button{border-color:#8a6842}.v39-diplomacy-actions{display:flex!important;flex-wrap:wrap;justify-content:flex-end;gap:4px}.v39-diplomacy-actions button{font-size:13px;padding:4px 7px}
@media(max-width:700px){.v39-nation-policy-grid{grid-template-columns:1fr}.v39-diplomacy-row{grid-template-columns:minmax(80px,.7fr) minmax(130px,1.3fr)}.v39-diplomacy-actions{grid-column:1/-1;justify-content:flex-start}.v39-nation-checks{grid-template-columns:1fr}}
`;
  document.head.appendChild(style);
}

function install() {
  ensurePanel();
  installStyles();
  document.getElementById("v39-manage-nation")?.addEventListener("click", openPanel);
  document.getElementById("v39-nation-panel")?.addEventListener("click", event => {
    const element = event.target instanceof Element ? event.target : null;
    if (element?.closest("#v39-nation-back")) return closePanel();
    const tab = element?.closest("[data-v39-nation-tab]");
    if (tab) { activeSection = tab.dataset.v39NationTab || "policy"; render(); return; }
    const action = element?.closest("[data-v39-diplomacy-action]");
    if (action) updateDiplomacy(action.dataset.v39DiplomacyAction, action.dataset.v39TargetPlayer);
    const treaty = element?.closest("[data-v39-treaty-action]");
    if (treaty) updateTreaty(treaty.dataset.v39TreatyAction, treaty.dataset.v39TreatyType, treaty.dataset.v39TargetPlayer);
  });
  document.getElementById("v39-nation-panel")?.addEventListener("change", savePolicyFromPanel);
  window.addEventListener("v39:game-state-changed", render);
window.addEventListener("v39:turn-stage-diplomacy", event => {
    const state = window.getV39GameState?.();
    if (!state) return;
    const next = advanceV39DiplomacyTurn(state, event.detail?.turnNumber);
    window.setV39GameState?.({ players:next.players, diplomacyRelations:next.diplomacyRelations }, { reason:"diplomacy-turn" });
    for (const report of next.reports || []) window.appendV39ActivityLog?.(report.playerId || state.activePlayerId, "外交", report.type, report);
  });
  window.canV39AttackFaction = (attackerId, targetId) => canV39FactionAttack(window.getV39GameState?.(), attackerId, targetId);
  window.declareV39War = (attackerId, targetId) => updateDiplomacyPair("war", attackerId, targetId);
  window.endV39War = (firstId, secondId) => updateDiplomacyPair("peace", firstId, secondId);
  window.getV39DiplomacyRelation = (firstId, secondId) => getV39DiplomacyRelation(window.getV39GameState?.(), firstId, secondId);
}

install();
