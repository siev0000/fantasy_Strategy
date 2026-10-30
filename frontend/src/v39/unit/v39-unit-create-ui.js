import {renderV39TerritoryGuide} from '../world/v39-operation-plan-ui.js';
import { createV39Units, getV39UnitCreationOptions, inspectV39UnitCreation, buildV39UnitCreationPreview } from "../../lib/v39-unit-creation-rules.js";
import {inspectV39RecruitTraining, inspectV39RecruitTrainingQueue, getV39RecruitTrainingSlots} from "../../lib/v39-recruit-training.js";
import {getV39RecruitInstructorCandidates, assignV39RecruitInstructor, advanceV39RecruitInstructorMovement} from "../../lib/v39-recruit-instructor.js";
import {getV39ToolLoadout,resolveV39ToolSlots,getV39ConsumableDefinitions} from "../../lib/v39-consumables.js";
import {getFactionSettlements,selectFactionSettlement} from '../../lib/settlement-state.js';

const escapeHtml = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

let panelMessage='';
function ensurePanel(host=document.getElementById('v39-character-create-host')) {
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
    trainingLevel:panel.querySelector("#v39-unit-training-level")?.value || undefined,
    defaultToolLoadout:panel.querySelector('[data-unit-tool-row]')?[...panel.querySelectorAll('[data-unit-tool-row]')].map(row=>({name:row.querySelector('select').value,count:Number(row.querySelector('input').value)})).filter(row=>row.name):undefined,
    count:Number(panel.querySelector("#v39-unit-count")?.value) || 1
  };
}

function switchTab(panel, tab) {
  panel.dataset.tab = tab === "training" ? "training" : "create";
  for (const button of panel.querySelectorAll("[data-unit-create-tab]")) {
    const selected = button.dataset.unitCreateTab === panel.dataset.tab;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
  for (const pane of panel.querySelectorAll("[data-unit-create-pane]")) {
    pane.hidden = pane.dataset.unitCreatePane !== panel.dataset.tab;
  }
  panel.querySelector("footer").hidden = panel.dataset.tab !== "create";
  panel.scrollTop = 0;
  const pane=panel.querySelector(`[data-unit-create-pane="${panel.dataset.tab}"]`);
  if(pane)pane.scrollTop=0;
}

function renderTrainingCard(task) {
  const {entry, training, slot} = task;
  const progress = Math.max(0, Math.min(entry.requiredExp, Number(entry.progressExp) || 0));
  const percent = Math.floor(progress / Math.max(1, entry.requiredExp) * 100);
  const status = task.status === "training" ? "訓練中" : task.status === "waiting" ? "順番待ち" : "停止中";
  return `<article class="v39-training-card" data-training-status="${task.status}">
    <header><strong>${escapeHtml(entry.unit.name)} <span>Lv${entry.unit.level}</span></strong><b>${status}</b></header>
    <div>${escapeHtml(entry.unit.race)} / ${escapeHtml(entry.unit.className)}</div>
    <div class="v39-training-card-time">${training ? `残り ⌛${Math.ceil((entry.requiredExp-progress)/training.expPerTurn)}` : escapeHtml(task.reason)}</div>
    <progress max="${entry.requiredExp}" value="${progress}" aria-label="${escapeHtml(entry.unit.name)}の訓練進捗"></progress>
    <div>進捗 ${percent}% · ${Math.floor(progress)} / ${entry.requiredExp} EXP</div>
    ${slot ? `<div>訓練場所: ${escapeHtml(slot.facilityName)}${slot.tileKey ? ` (${escapeHtml(slot.tileKey)})` : ""}</div><div>教官: ${escapeHtml(training.instructor?.name || "なし")} · 毎ターン${training.expPerTurn} EXP</div>` : ""}
  </article>`;
}

function render(statusText) {
  if(statusText!==undefined)panelMessage=statusText;
  const panel = ensurePanel();
  if (!panel || panel.hidden||!document.getElementById('characterModal')?.classList.contains('open')) return;
  const state = window.getV39GameState?.();
  const player = window.getV39ActivePlayer?.();
  if (!state || !player) return;
  const tab = panel.dataset.tab || "create";
  const scrollTop = panel.querySelector('[data-unit-create-pane]:not([hidden])')?.scrollTop||0;
  const focusedId=panel.contains(document.activeElement)?document.activeElement.id:'';
  const settlements=getFactionSettlements(player.factionState).filter(row=>row.placed);
  if(!settlements.length){
    panel.innerHTML='<header class="v39-unit-create-head"><strong>作成・訓練</strong></header><section class="v39-unit-create-pane"><p class="v39-training-empty">拠点を配置するとユニットの作成と訓練を行えます。</p></section><footer><output id="v39-unit-create-status">拠点未配置</output><button type="button" id="v39-unit-create-confirm" class="v39-unit-create-confirm" disabled>作成不可</button></footer>';
    return;
  }
  const options = getV39UnitCreationOptions(player, state);
  const upperClassCount = options.classes.filter(row => row.recruitmentFacility).length;
  const baseClassCount = options.classes.length - upperClassCount;
  const previous = requestFromPanel(panel);
  const race = options.races.includes(previous.race) ? previous.race : options.races[0] || player.race;
  const className = options.classes.some(row => row.名前 === previous.className) ? previous.className : options.classes[0]?.名前 || "";
  const mode = options.modes.some(row => row.mode === previous.mode) ? previous.mode : "army";
  const count = Math.max(1, Math.min(20, previous.count || 1));
  const defaults = inspectV39UnitCreation(state, player, { race, className, mode, count });
  const trainingLevel = previous.trainingLevel === undefined ? defaults.initialLevel
    : Math.max(defaults.levelLimits.min,Math.min(defaults.levelLimits.max,Math.floor(Number(previous.trainingLevel) || defaults.initialLevel)));
  const check = inspectV39UnitCreation(state, player, { race, className, mode, count, trainingLevel });
  const cost = Object.entries(check.cost).map(([key, value]) => `<span>${escapeHtml(key)} <b>${value}</b></span>`).join("");
  const requiredMilitaryLevel = Math.max(check.mode.requiredMilitaryLevel, check.recruitment?.requiredMilitaryLevel || 0);
  const level = check.initialLevel;
  const previewUnit = check.classRow ? buildV39UnitCreationPreview(check) : null;
  const derived = previewUnit?.derivedCharacter;
  const classes = derived ? [...Object.entries(derived.prerequisiteClassLevels || {}), [className, derived.classLevels],
    ...(derived.secondClassName ? [[derived.secondClassName, 1]] : [])] : [];
  const growthRows = derived ? [[`種族 ${race}`, derived.raceLevels],
    ...classes.map(([name, lv], index) => [`クラス${classes.length > 1 ? index + 1 : ""} ${name}`, lv])] : [];
  const training = inspectV39RecruitTraining(player.factionState, check.village,
    {race, className, level, prerequisiteClassLevels:check.recruitment?.initialGrowth.prerequisiteClassLevels}, state);
  const instructorOptions = getV39RecruitInstructorCandidates(state, player, check.village, className);
  const transfer = player.factionState.recruitInstructorTransfers?.[instructorOptions.facility.tileKey];
  const transferUnit = player.factionState.units.find(unit => unit.id === transfer?.unitId);
  const queue = inspectV39RecruitTrainingQueue(player.factionState, state).filter(task => task.entry.settlementId === check.village.settlementId);
  const slots = getV39RecruitTrainingSlots(player.factionState, check.village, className, state);
  const occupiedSlots = queue.filter(task => slots.some(slot => slot.id === task.slot?.id)).length;
  const waitingCount = Math.max(0, count - (slots.length - occupiedSlots));
  const activeCount = queue.filter(task => task.status === "training").length;
  const waitingTotal = queue.filter(task => task.status === "waiting").length;
  const pausedCount = queue.filter(task => task.status === "paused").length;
  panel.innerHTML = `<header class="v39-unit-create-head">${renderV39TerritoryGuide(state,'units')}<label class="v39-create-base-label">訓練拠点<select id="v39-create-settlement" aria-label="訓練拠点">${settlements.length?settlements.map(base=>`<option value="${escapeHtml(base.settlementId)}"${base.settlementId===check.village.settlementId?' selected':''}>${escapeHtml(base.name||'拠点')} (${base.x},${base.y})</option>`).join(''):'<option value="">配置済みの拠点がありません</option>'}</select></label>
      <nav class="v39-unit-create-tabs" role="tablist" aria-label="ユニット作成と訓練状況">
        <button type="button" id="v39-create-tab" role="tab" aria-controls="v39-create-pane" data-unit-create-tab="create" title="既存・訓練中のユニット数 / 作成上限">作成 <span class="v39-unit-count-limit">${check.current}/${check.cap}</span></button>
        <button type="button" id="v39-training-tab" role="tab" aria-controls="v39-training-pane" data-unit-create-tab="training">訓練中 <span>${queue.length}</span></button>
      </nav>
    </header>
    <section id="v39-create-pane" class="v39-unit-create-pane" role="tabpanel" aria-labelledby="v39-create-tab" data-unit-create-pane="create">
    <div class="v39-unit-create-grid">
      <div class="v39-unit-create-group">
      <label><span class="v39-unit-count-label">種族 <b>${options.races.length}種</b></span><select id="v39-unit-race">${options.races.map(value => `<option${value === race ? " selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select></label>
      <label><span class="v39-unit-count-label">職業 <b title="基礎職 / 上位職の候補数">基${baseClassCount} 上${upperClassCount}</b></span><select id="v39-unit-class">${options.classes.map(row => `<option value="${escapeHtml(row.名前)}"${row.名前 === className ? " selected" : ""}>${escapeHtml(row.名前)}${row.recruitmentFacility ? ` [${escapeHtml(row.recruitmentFacility)}]` : ""}</option>`).join("")}</select></label>
      </div><div class="v39-unit-create-group">
      <label><span>種別</span><select id="v39-unit-mode">${options.modes.map(row => {
        return `<option value="${row.mode}"${row.mode === mode ? " selected" : ""}>${escapeHtml(row.label)}</option>`;
      }).join("")}</select></label>
      <div class="v39-unit-create-numbers">
      <label><span>作成数</span><input id="v39-unit-count" type="number" min="1" max="20" value="${count}"></label>
      <label><span>訓練Lv</span><input id="v39-unit-training-level" type="number" min="${check.levelLimits.min}" max="${check.levelLimits.max}" step="1" value="${level}" aria-describedby="v39-training-level-help"></label>
      </div>
      <details class="v39-unit-create-block"><summary>初期携帯・補充設定（道具枠${resolveV39ToolSlots(previewUnit || {})}）</summary><p>訓練完了時に拠点の完成品在庫から支給。不足しても訓練は完了します。</p>
        ${Array.from({length:resolveV39ToolSlots(previewUnit || {})},(_,index)=>{
          const desired=(previous.defaultToolLoadout ?? getV39ToolLoadout(previewUnit))[index];
          return `<label data-unit-tool-row><select aria-label="初期携帯枠${index+1}"><option value="">なし</option>${getV39ConsumableDefinitions().map(item=>`<option value="${escapeHtml(item.名前)}"${desired?.name===item.名前?' selected':''}>${escapeHtml(item.名前)}</option>`).join('')}</select><input type="number" min="1" aria-label="初期携帯個数${index+1}" value="${desired?.count || 1}"></label>`;
        }).join('')}
      </details>
      <span id="v39-training-level-help">総合Lv ${check.levelLimits.min}〜${check.levelLimits.max}</span>
      </div>
      <details class="v39-instructor-picker"><summary>教官: ${escapeHtml(training.instructor?.name || "なし")}${transferUnit ? ` / ${escapeHtml(transferUnit.name)} 到着待ち` : ""}</summary>
        <div>${escapeHtml(instructorOptions.facility.facilityName)} ${escapeHtml(instructorOptions.facility.tileKey || "未建設")}${transfer?.reason ? ` / ${escapeHtml(transfer.reason)}` : ""}</div>
        <button type="button" data-v39-instructor-id="">設定解除</button>
        ${instructorOptions.candidates.map(({unit,available,reasons}) => `<button type="button" data-v39-instructor-id="${escapeHtml(unit.id)}"${available ? "" : " disabled"}><strong>${escapeHtml(unit.name)} Lv${unit.level}</strong><span>${escapeHtml(unit.className)} (${unit.x ?? "—"},${unit.y ?? "—"})${reasons.length ? ` / ${escapeHtml(reasons.join("・"))}` : ""}</span></button>`).join("")}
      </details>
    </div>
    <div class="v39-unit-create-overview">
      <section class="v39-unit-create-block"><h3>訓練後のユニット <b>総合Lv${level}</b></h3>
        <dl class="v39-unit-create-growth">${growthRows.map(([name,lv]) => `<div><dt>${escapeHtml(name)}</dt><dd>Lv${lv}</dd></div>`).join("")}</dl>
        ${mode !== "normal" ? `<details class="v39-unit-create-extra"><summary>軍隊の性能 · 1ユニット${check.mode.memberCount || check.mode.populationCost}人</summary><div>HPは単体の${check.mode.hpMultiplier}倍 / 攻撃は${check.mode.attackCount}回</div></details>` : ""}
      </section>
      <section class="v39-unit-create-block v39-unit-create-summary"><h3>作成条件</h3>
        <dl class="v39-unit-create-rows"><div><dt>軍事研究</dt><dd>必要Lv${requiredMilitaryLevel} / 現在Lv${check.militaryLevel}</dd></div>
        <div><dt>${mode === "normal" ? "ヒーロー" : "軍隊"}作成枠</dt><dd>既存・訓練中 ${check.current} / 上限 ${check.cap}</dd></div>
        ${check.recruitment ? `<div><dt>必要施設</dt><dd>${escapeHtml(check.recruitment.facilityName)}（上位職）</dd></div>` : ""}</dl>
      </section>
      <section class="v39-unit-create-block"><h3>今回の消費 <span>${count}ユニット分</span></h3>
        <dl class="v39-unit-create-rows"><div><dt>拠点人口</dt><dd>${check.populationCost}人</dd></div></dl>
        <div class="v39-unit-create-cost">${cost || "物資の消費なし"}</div>
      </section>
    </div>
    <section class="v39-unit-training v39-unit-create-block"><h3>訓練時間 <b>⌛${training.turns}</b></h3>
      <div>開始後の1ユニット分（順番待ちは含みません）</div>
      <div>同時訓練枠 ${occupiedSlots} / ${slots.length}${slots[0]?.tileKey ? ` · ${escapeHtml(instructorOptions.facility.facilityName)}1棟につき1枠` : " · 拠点の基礎枠"}</div>
      ${waitingCount ? `<div>今回の${count}ユニット中、${waitingCount}ユニットは順番待ちです。</div>` : ""}
      <div>教官: ${escapeHtml(training.instructor?.name || "なし")}${transferUnit ? "（新しい教官は到着待ち）" : ""}</div>
      <details class="v39-unit-create-extra"><summary>訓練速度の詳細</summary><div>毎ターン ${training.expPerTurn} EXP / 必要 ${training.requiredExp} EXP${training.instructor ? `<br>教官も毎ターン ${training.instructorRewardExp} EXP獲得` : ""}<br>教官の到着・交代で見込み時間が変わります。</div></details>
    </section></section>
    <section id="v39-training-pane" class="v39-unit-create-pane" role="tabpanel" aria-labelledby="v39-training-tab" data-unit-create-pane="training">
      <section class="v39-unit-create-block v39-training-totals"><h3>${escapeHtml(check.village.name || "選択中の拠点")}</h3>
        <div>訓練中 ${activeCount} · 順番待ち ${waitingTotal}${pausedCount ? ` · 停止中 ${pausedCount}` : ""}</div>
      </section>
      ${queue.length ? queue.map(renderTrainingCard).join("") : '<p class="v39-training-empty">訓練中のユニットはありません。<br>「作成」タブで訓練を予約できます。</p>'}
    </section>
    <footer><output id="v39-unit-create-status">${escapeHtml(panelMessage || (check.available ? "訓練を開始できます" : check.reasons.join(" / ")))}</output><button type="button" id="v39-unit-create-confirm" class="v39-unit-create-confirm"${check.available ? "" : " disabled"}>${check.available ? `訓練開始⌛${training.turns}` : "作成不可"}</button></footer>`;
  switchTab(panel, tab);
  panel.querySelector(`[data-unit-create-pane="${tab}"]`).scrollTop=scrollTop;
  if(focusedId)panel.querySelector(`#${CSS.escape(focusedId)}`)?.focus({preventScroll:true});
}

function open() {
  return window.openV39CharacterModal?.({tab:'create'});
}

export function mountV39UnitCreatePanel(host,visible){
  const panel=ensurePanel(host);if(!panel)return;
  panel.hidden=!visible;
  if(visible)render();
}

function create() {
  if(window.isV39MapInputLocked?.())return;
  const panel = ensurePanel();
  const state = window.getV39GameState?.();
  const player = window.getV39ActivePlayer?.();
  if (!panel || !state || !player) return;
  const result = createV39Units(state, player.id, requestFromPanel(panel));
  if (!result.ok) return render(result.reason);
  window.setV39GameState?.({ players:result.state.players }, { reason:"units-created" });
  window.renderV39ResourceTop?.();
  render(`${result.queuedUnits.length}体の訓練を予約しました`);
}

function installStyles() {
  const style = document.createElement("style");
  style.textContent = `.v39-unit-create-panel{width:100%;height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(auto,1fr) auto;gap:8px;overflow:auto;color:#e8efec}.v39-unit-create-panel[hidden],.v39-unit-create-panel [hidden]{display:none!important}.v39-unit-create-pane{display:grid;gap:8px;align-content:start;min-width:0}.v39-unit-create-head{position:sticky;top:0;z-index:2;align-self:start;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:4px 0;background:#0b171b}.v39-unit-create-head button,.v39-unit-create-confirm{min-height:36px;border:1px solid #4b6871;border-radius:7px;background:#173039;color:#edf5f3;padding:5px 11px}.v39-unit-create-head strong{font-size:var(--font-size-16)}.v39-unit-create-tabs{display:flex;gap:6px;width:100%}.v39-unit-create-tabs button{flex:1;font-size:var(--font-body);background:#101c21;color:#aebdc0}.v39-unit-create-tabs button[aria-selected=true]{border-color:#77ccdf;background:#173039;color:#edf5f3;font-weight:700}.v39-unit-create-tabs span{margin-left:5px;color:#e8c76c}.v39-training-card{border:1px solid #384c53;border-radius:7px;padding:8px;display:grid;gap:5px;font-size:var(--font-body);min-width:0}.v39-training-card header{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:5px}.v39-training-card strong{overflow-wrap:anywhere}.v39-training-card strong span{color:#e8c76c}.v39-training-card header b{color:#9bdda6}.v39-training-card[data-training-status=waiting] header b{color:#e8c76c}.v39-training-card[data-training-status=paused] header b{color:#efa48b}.v39-training-card>div{overflow-wrap:anywhere;color:#aebdc0}.v39-training-card .v39-training-card-time{color:#edf5f3}.v39-training-card progress{width:100%;height:10px;accent-color:#78ce97}.v39-training-empty{margin:0;padding:12px 8px;color:#aebdc0;font-size:var(--font-body);line-height:1.6}.v39-unit-create-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.v39-unit-create-group{display:grid;align-content:start;gap:7px;min-width:0}.v39-unit-create-overview{display:grid;gap:8px}.v39-unit-create-growth{margin:0;padding:6px 8px;border:1px solid #384c53;border-radius:6px;font-size:var(--font-body)}.v39-unit-create-growth>div{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:3px 0}.v39-unit-create-growth dt{overflow-wrap:anywhere}.v39-unit-create-growth dd{margin:0;white-space:nowrap;color:#e8c76c;font-weight:700}.v39-unit-create-grid label{display:grid;gap:4px}.v39-unit-create-grid span{font-size:var(--font-body)}.v39-unit-count-label{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:4px}.v39-unit-count-limit{color:#e8c76c;white-space:nowrap;font-weight:600}.v39-unit-create-numbers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.v39-unit-create-numbers label{min-width:0}.v39-unit-create-numbers input{min-width:0;box-sizing:border-box}.v39-unit-create-grid select,.v39-unit-create-grid input{width:100%;min-height:38px;border:1px solid #425860;border-radius:7px;background:#101c21;color:#edf5f3;padding:6px;font-size:var(--font-body)}.v39-unit-create-block{min-width:0;border:1px solid #384c53;border-radius:7px;padding:8px;font-size:var(--font-body)}.v39-unit-create-block h3{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:4px;margin:0 0 6px;font-size:var(--font-body);color:#b8c7c9}.v39-unit-create-block h3 b{color:#e8c76c}.v39-unit-create-block h3 span{font-weight:400}.v39-unit-create-block .v39-unit-create-growth{padding:0;border:0}.v39-unit-create-rows{margin:0;display:grid;gap:5px}.v39-unit-create-rows>div{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:4px 10px}.v39-unit-create-rows dt{color:#aebdc0}.v39-unit-create-rows dd{margin:0;color:#edf5f3;overflow-wrap:anywhere}.v39-unit-create-cost{display:flex;flex-wrap:wrap;gap:5px 12px;margin-top:6px}.v39-unit-create-cost span{white-space:nowrap;color:#aebdc0}.v39-unit-create-cost b{color:#edf5f3}.v39-unit-create-extra{margin-top:6px;color:#aebdc0;font-size:var(--font-body)}.v39-unit-create-extra summary{cursor:pointer}.v39-unit-create-extra>div{margin-top:5px;line-height:1.5}.v39-instructor-picker{grid-column:1/-1;min-width:0;font-size:var(--font-body);border:1px solid #425860;border-radius:7px;padding:0 6px}.v39-instructor-picker summary{min-height:38px;display:list-item;align-content:center}.v39-instructor-picker[open]{padding-bottom:6px}.v39-instructor-picker summary{cursor:pointer;padding:5px 0;overflow-wrap:anywhere}.v39-instructor-picker button{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;border:1px solid #425860;border-radius:6px;background:#173039;color:#edf5f3;padding:6px;margin-top:4px;font-size:var(--font-body)}.v39-instructor-picker button:disabled{background:#080f12;color:#718187;opacity:.55;cursor:not-allowed}.v39-unit-create-panel footer{position:sticky;bottom:0;align-self:end;display:flex;align-items:center;gap:8px;min-height:46px;padding:5px 0;background:#0b171b;z-index:1}.v39-unit-create-panel output{flex:1;font-size:var(--font-body);color:#b8c7c9}.v39-unit-create-confirm{min-width:100px;font-size:var(--font-body);font-weight:800;border-color:#b99337;background:#5b4618;color:#fff4c4}.v39-unit-create-confirm:disabled{border-color:#50636a;background:#1a292e;color:#aebdc0;opacity:1}@media(max-width:700px){.v39-unit-create-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}`;
  document.head.appendChild(style);
}

function install() {
  installStyles();
  document.addEventListener("click", event => {
    const element = event.target instanceof Element ? event.target.closest("[data-open=\"unitCreate\"]") : null;
    if (!element) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    open();
  }, true);
  document.addEventListener("click", event => {
    const panel=document.getElementById('v39-unit-create-panel');
    if(!panel?.contains(event.target))return;
    const element = event.target instanceof Element ? event.target : null;
    const tab = element?.closest("[data-unit-create-tab]");
    if (tab) switchTab(panel, tab.dataset.unitCreateTab);
    if (element?.closest("#v39-unit-create-confirm")) create();
    const instructor = element?.closest("[data-v39-instructor-id]");
    if (instructor && !instructor.disabled) {
      if (window.isV39MapInputLocked?.()) return;
      const state = window.getV39GameState();
      const player = window.getV39ActivePlayer();
      const request = requestFromPanel(panel);
      const check = inspectV39UnitCreation(state, player, request);
      const result = assignV39RecruitInstructor(state, player.id, check.village.settlementId, request.className, instructor.dataset.v39InstructorId);
      if (result.ok) {
        window.cancelV39SelectedUnitMove?.();
        const moved = advanceV39RecruitInstructorMovement(result.state, player.id, window.__v39FieldRuntime?.mapData, state.timeline.turnNumber);
        window.setV39GameState({players:moved.state.players}, {reason:"recruit-instructor-assigned"});
      }
      render(result.ok ? (instructor.dataset.v39InstructorId ? "教官を設定しました。到着後に指導を開始します" : "教官設定を解除しました") : result.reason);
    }
  });
  document.addEventListener("keydown", event => {
    const panel=document.getElementById('v39-unit-create-panel');
    if(!panel?.contains(event.target))return;
    if (!event.target.matches?.("[data-unit-create-tab]") || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tab = event.key === "Home" ? "create" : event.key === "End" ? "training" : panel.dataset.tab === "create" ? "training" : "create";
    switchTab(panel, tab);
    panel.querySelector(`[data-unit-create-tab="${tab}"]`).focus();
  });
  document.addEventListener("change", event => {
    const panel=document.getElementById('v39-unit-create-panel');
    if(!panel?.contains(event.target))return;
    if(event.target.id==='v39-create-settlement'){
      if(window.isV39MapInputLocked?.())return;
      const player=window.getV39ActivePlayer();
      window.updateV39ActiveFactionState(selectFactionSettlement(player.factionState,event.target.value),{reason:'unit-create-base-selected'});
    }
    if (["v39-unit-race", "v39-unit-class", "v39-unit-mode"].includes(event.target.id)) {
      panel.querySelector("#v39-unit-training-level").value = "";
    }
    render('');
  });
  window.addEventListener("v39:turn-advanced", () => render());
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
