import { createV39Units, getV39UnitCreationOptions, inspectV39UnitCreation } from "../../lib/v39-unit-creation-rules.js";

const escapeHtml = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function ensurePanel() {
  const host = document.getElementById("footSquad");
  if (!host) return null;
  let panel = document.getElementById("v39-unit-create-panel");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "v39-unit-create-panel";
    panel.className = "v39-unit-create-panel";
    panel.hidden = true;
    host.appendChild(panel);
  }
  return panel;
}

function requestFromPanel(panel) {
  return {
    race:panel.querySelector("#v39-unit-race")?.value || "",
    className:panel.querySelector("#v39-unit-class")?.value || "",
    mode:panel.querySelector("#v39-unit-mode")?.value || "army",
    count:Number(panel.querySelector("#v39-unit-count")?.value) || 1
  };
}

function render(statusText = "") {
  const panel = ensurePanel();
  if (!panel || panel.hidden) return;
  const state = window.getV39GameState?.();
  const player = window.getV39ActivePlayer?.();
  if (!state || !player) return;
  const options = getV39UnitCreationOptions(player);
  const previous = requestFromPanel(panel);
  const race = options.races.includes(previous.race) ? previous.race : options.races[0] || player.race;
  const className = options.classes.some(row => row.名前 === previous.className) ? previous.className : options.classes[0]?.名前 || "";
  const mode = options.modes.some(row => row.mode === previous.mode) ? previous.mode : "army";
  const count = Math.max(1, Math.min(20, previous.count || 1));
  const check = inspectV39UnitCreation(state, player, { race, className, mode, count });
  const cost = Object.entries(check.cost).map(([key, value]) => `${key}${value}`).join(" / ");
  panel.innerHTML = `<header class="v39-unit-create-head"><button type="button" id="v39-unit-create-back">← 部隊</button><strong>ユニット作成</strong><span>軍事Lv${options.militaryLevel}</span></header>
    <div class="v39-unit-create-grid">
      <label><span>種族</span><select id="v39-unit-race">${options.races.map(value => `<option${value === race ? " selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select></label>
      <label><span>初期職業</span><select id="v39-unit-class">${options.classes.map(row => `<option${row.名前 === className ? " selected" : ""}>${escapeHtml(row.名前)}</option>`).join("")}</select></label>
      <label><span>種別</span><select id="v39-unit-mode">${options.modes.map(row => `<option value="${row.mode}"${row.mode === mode ? " selected" : ""}>${escapeHtml(row.label)} / 軍事Lv${row.requiredMilitaryLevel}</option>`).join("")}</select></label>
      <label><span>作成数</span><input id="v39-unit-count" type="number" min="1" max="20" value="${count}"></label>
    </div>
    <div class="v39-unit-create-summary"><span>上限 ${check.current}/${check.cap}</span><span>人口 -${check.populationCost}</span><span>${escapeHtml(cost)}</span></div>
    <footer><output id="v39-unit-create-status">${escapeHtml(statusText || (check.available ? "生成できます" : check.reasons.join(" / ")))}</output><button type="button" id="v39-unit-create-confirm" class="v39-unit-create-confirm"${check.available ? "" : " disabled"}>${check.available ? "生成" : "生成不可"}</button></footer>`;
}

function open() {
  const panel = ensurePanel();
  const squad = document.getElementById("footSquad");
  if (!panel || !squad) return;
  document.getElementById("unitCreateModal")?.classList.remove("open");
  window.activateV39FooterTab?.("squad");
  document.getElementById("v39-squad-main")?.setAttribute("hidden", "");
  document.getElementById("v39-squad-content")?.setAttribute("hidden", "");
  squad.classList.add("is-unit-create-open");
  panel.hidden = false;
  render();
}

function close() {
  const panel = ensurePanel();
  const squad = document.getElementById("footSquad");
  if (!panel || !squad) return;
  panel.hidden = true;
  document.getElementById("v39-squad-main")?.removeAttribute("hidden");
  document.getElementById("v39-squad-content")?.removeAttribute("hidden");
  squad.classList.remove("is-unit-create-open");
}

function create() {
  const panel = ensurePanel();
  const state = window.getV39GameState?.();
  const player = window.getV39ActivePlayer?.();
  if (!panel || !state || !player) return;
  const result = createV39Units(state, player.id, requestFromPanel(panel));
  if (!result.ok) return render(result.reason);
  window.setV39GameState?.({ players:result.state.players }, { reason:"units-created" });
  window.renderV39ResourceTop?.();
  window.dispatchEvent(new CustomEvent("v39:units-created", { detail:{ playerId:player.id, units:result.createdUnits } }));
  render(`${result.createdUnits.length}体作成しました`);
}

function installStyles() {
  const style = document.createElement("style");
  style.textContent = `.v39-unit-create-panel{width:100%;height:100%;min-height:0;display:grid;grid-template-rows:auto auto auto minmax(42px,1fr);gap:8px;overflow:auto;color:#e8efec}.v39-unit-create-panel[hidden]{display:none!important}.v39-unit-create-head{display:flex;align-items:center;gap:8px}.v39-unit-create-head button,.v39-unit-create-confirm{min-height:36px;border:1px solid #4b6871;border-radius:7px;background:#173039;color:#edf5f3;padding:5px 11px}.v39-unit-create-head strong{font-size:16px}.v39-unit-create-head span{margin-left:auto;font-size:14px;color:#9eb3b7}.v39-unit-create-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.v39-unit-create-grid label{display:grid;gap:4px}.v39-unit-create-grid span{font-size:15px}.v39-unit-create-grid select,.v39-unit-create-grid input{width:100%;min-height:38px;border:1px solid #425860;border-radius:7px;background:#101c21;color:#edf5f3;padding:6px;font-size:15px}.v39-unit-create-summary{display:flex;gap:8px;overflow:auto}.v39-unit-create-summary span{white-space:nowrap;border:1px solid #384c53;border-radius:6px;padding:6px 8px;font-size:14px}.v39-unit-create-panel footer{position:sticky;bottom:0;align-self:end;display:flex;align-items:center;gap:8px;min-height:46px;padding:5px 0;background:#0b171b;z-index:1}.v39-unit-create-panel output{flex:1;font-size:15px;color:#b8c7c9}.v39-unit-create-confirm{min-width:100px;font-size:15px;font-weight:800;border-color:#b99337;background:#5b4618;color:#fff4c4}.v39-unit-create-confirm:disabled{border-color:#50636a;background:#1a292e;color:#aebdc0;opacity:1}@media(max-width:700px){.v39-unit-create-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}`;
  document.head.appendChild(style);
}

function install() {
  const panel = ensurePanel();
  installStyles();
  document.addEventListener("click", event => {
    const element = event.target instanceof Element ? event.target.closest("#v39-squad-unit-create, [data-open=\"unitCreate\"]") : null;
    if (!element) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    open();
  }, true);
  panel?.addEventListener("click", event => {
    const element = event.target instanceof Element ? event.target : null;
    if (element?.closest("#v39-unit-create-back")) close();
    if (element?.closest("#v39-unit-create-confirm")) create();
  });
  panel?.addEventListener("change", () => render());
  window.openV39UnitCreate = open;
  window.createV39Units = request => {
    const state = window.getV39GameState?.();
    const player = window.getV39ActivePlayer?.();
    const result = createV39Units(state, player?.id, request);
    if (result.ok) window.setV39GameState?.({ players:result.state.players }, { reason:"units-created" });
    return result;
  };
}

install();
