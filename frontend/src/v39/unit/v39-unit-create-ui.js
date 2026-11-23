import {isV39TerritoryGuideActionCompleted,renderV39TerritoryGuide} from '../world/v39-operation-plan-ui.js';
import { buildV39ClassEquipment, buildV39UnitEntity, createV39Units, getV39UnitCreationOptions, inspectV39UnitCreation, buildV39UnitCreationPreview, getV39LastTrainingToolLoadout } from "../../lib/v39-unit-creation-rules.js";
import {inspectV39RecruitTraining, inspectV39RecruitTrainingQueue, getV39RecruitTrainingSlots} from "../../lib/v39-recruit-training.js";
import {resolveV39ToolSlots,getV39ConsumableDefinitions} from "../../lib/v39-consumables.js";
import {collectV39AcquiredToolNames} from "../../lib/v39-tool-knowledge.js";
import {getFactionSettlements,selectFactionSettlement} from '../../lib/settlement-state.js';
import {FOOD_RESOURCE_KEYS} from '../../lib/v39-economy-rules.js';
import {renderV39ResourceIcon} from '../ui/v39-resource-item-icon.js';
import {renderV39UnitCard} from './v39-unit-card.js';
import {renderV39UnitAbility} from './v39-unit-detail.js';
import {renderV39UnitSkills} from './v39-unit-skills.js';

import {EQUIPMENT_SLOT_KEYS} from "../../constants/unitCommon.js";
import {renderV39EquipmentDisplayRow} from "../ui/v39-equipment-display.js";
import {renderV39ScreenHelpContent} from "../ui/v39-screen-help.js";
import {V39_SCREEN_HELP_COPY} from "../ui/v39-screen-help-copy.js";
import {resolveUnitCreateModeOptions} from "../../composables/militaryUnitUtils.js";
import {V39_EQUIPMENT_RARITIES} from "../../lib/v39-equipment-rules.js";
import {readV39ItemListAction,renderV39ItemListScreen1} from "../ui/v39-item-list-screen-1.js";

let equipmentRarityBySlot = {};
let equipmentBaseKey = "";
let defaultToolLoadout = null;
let toolBaseKey = "";
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
  const toolSettings=panel.querySelector('[data-unit-tool-settings]');
  const toolRows=toolSettings&&[...toolSettings.querySelectorAll('[data-unit-tool-row]')].map(row=>({
    name:row.dataset.unitToolName,count:Number(row.dataset.unitToolCount)
  }));
  return {
    equipmentRarityBySlot,
    race:panel.querySelector("#v39-unit-race")?.value || "",
    className:panel.querySelector("#v39-unit-class")?.value || "",
    mode:panel.querySelector("#v39-unit-mode")?.value || "army",
    trainingLevel:panel.querySelector("#v39-unit-training-level")?.value || undefined,
    defaultToolLoadout:toolRows??defaultToolLoadout??undefined,
    count:Number(panel.querySelector("#v39-unit-count")?.value) || 1
  };
}

function commitTrainingToolLoadout(panel,loadout) {
  defaultToolLoadout=loadout;
  panel.querySelector('[data-unit-tool-settings]')?.remove();
  render('');
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

function getTrainingClasses(options, mode) {
  return options.classes.filter(row=>mode!=='normal'||!row.recruitmentFacility);
}

function readFixedMapUnit(panel) {
  return {
    race:panel.querySelector('#v39-unit-race')?.value,
    className:panel.querySelector('#v39-unit-class')?.value,
    name:panel.querySelector('#v39-fixed-unit-name')?.value.trim(),
    level:Number(panel.querySelector('#v39-unit-training-level')?.value),
    leader:panel.querySelector('#v39-fixed-unit-leader')?.checked ?? false
  };
}

function renderFixedMapUnitCreation(panel, player, settlementHost) {
  const options = window.getV39FixedMapUnitOptions?.();
  if (!options) return;
  if (settlementHost) settlementHost.hidden = true;
  const previous = readFixedMapUnit(panel);
  const race = options.races.includes(previous.race) ? previous.race : player.race;
  const row = options.classes.find(row => row.名前 === previous.className)
    ?? options.classes.find(row => row.名前 === 'ファイター') ?? options.classes[0];
  if (!row) return;
  const level = Math.max(1,Math.min(100,Math.floor(previous.level || 1)));
  const name = previous.name || row.名前;
  const preview = buildV39UnitEntity({race,className:row.名前,level,name,equipment:buildV39ClassEquipment(row)});
  panel.dataset.v39TerritoryGuideTarget = '';
  panel.innerHTML = `<header class="v39-unit-create-head"><strong>固定マップのユニット配置</strong></header>
    <section id="v39-create-pane" class="v39-unit-create-pane">
      <div class="v39-unit-create-columns">
        <div class="v39-unit-create-grid">
          <div>種族<input type="hidden" id="v39-unit-race" value="${escapeHtml(race)}">
            <button type="button" data-unit-acquisition="race">${escapeHtml(race)}</button></div>
          <div>職業<input type="hidden" id="v39-unit-class" value="${escapeHtml(row.名前)}">
            <button type="button" data-unit-acquisition="class">${escapeHtml(row.名前)}</button></div>
          <label>ユニット名<input id="v39-fixed-unit-name" maxlength="80" value="${escapeHtml(name)}"></label>
          <label>Lv<input id="v39-unit-training-level" type="number" min="1" max="100" value="${level}"></label>
          <div><label style="display:inline-flex"><input id="v39-fixed-unit-leader" style="width:auto;min-height:0" type="checkbox"${previous.leader ? ' checked' : ''}>君主</label></div>
        </div>
        <section class="v39-unit-create-block v39-unit-create-overview">
          ${renderV39UnitCard(preview,{portrait:true,interactive:false,snapshot:true})}
          <div class="v39-unit-preview-content">${renderV39UnitAbility(preview,{statusOnly:true})}</div>
        </section>
      </div>
    </section>
    <footer><output id="v39-unit-create-status">費用なし · 配置するマスは次に選びます。</output>
      <button type="button" id="v39-unit-create-confirm" class="v39-unit-create-confirm">配置先を選ぶ</button></footer>`;
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
  const settingsScroll = panel.querySelector('.v39-unit-create-grid')?.scrollTop ?? 0;
  const previousPreviewContent = panel.querySelector('.v39-unit-preview-content');
  const previousPreviewTab = previousPreviewContent?.dataset.previewTab;
  const previewScroll = previousPreviewContent?.scrollTop ?? 0;
  const settlementHost=document.getElementById('v39-create-settlement-host');
  if (window.isV39FixedMapEditing?.()) return renderFixedMapUnitCreation(panel,player,settlementHost);
  const focusedId=panel.contains(document.activeElement)||settlementHost?.contains(document.activeElement)?document.activeElement.id:'';
  if(settlementHost){settlementHost.hidden=true;settlementHost.replaceChildren();}
  const settlements=getFactionSettlements(player.factionState).filter(row=>row.placed);
  if(!settlements.length){
    panel.dataset.v39TerritoryGuideTarget='';
    const guide=renderV39TerritoryGuide(state,'units',{target:'training-no-base',highlightNext:true});
    const caption=guide?`<div class="v39-territory-guide-caption">${guide}</div>`:'';
    panel.innerHTML=`<header class="v39-unit-create-head">${caption}<strong>作成・訓練</strong></header><section class="v39-unit-create-pane"><p class="v39-training-empty">拠点を配置するとユニットの作成と訓練を行えます。</p></section><footer><output id="v39-unit-create-status">拠点未配置</output><button type="button" id="v39-unit-create-confirm" class="v39-unit-create-confirm" disabled>作成不可</button></footer>`;
    return;
  }
  const baseKey=`${player.id}:${player.factionState.selectedSettlementId}`;
  if(equipmentBaseKey!==baseKey){
    equipmentBaseKey=baseKey;
    equipmentRarityBySlot={};
  }
  if(toolBaseKey!==baseKey){
    toolBaseKey=baseKey;
    defaultToolLoadout=null;
    panel.querySelector('[data-unit-tool-settings]')?.remove();
  }
  const options = getV39UnitCreationOptions(player, state);
  const previous = requestFromPanel(panel);
  const race = options.races.includes(previous.race) ? previous.race : options.races[0] || player.race;
  const requestedMode=options.modes.find(row=>row.mode===previous.mode);
  const availableMode=options.modes.find(row=>!row.unavailableReason);
  const mode=requestedMode?.unavailableReason || !requestedMode
    ? availableMode?.mode ?? requestedMode?.mode ?? "army"
    : requestedMode.mode;
  const classes = getTrainingClasses(options,mode);
  const upperClassCount = classes.filter(row => row.recruitmentFacility).length;
  const baseClassCount = classes.length - upperClassCount;
  const className = classes.some(row => row.名前 === previous.className) ? previous.className : classes[0]?.名前 || "";
  if(className!==previous.className||race!==previous.race||mode!==previous.mode)equipmentRarityBySlot={};
  const count = Math.max(1, Math.min(20, previous.count || 1));
  const defaults = inspectV39UnitCreation(state, player, { race, className, mode, count });
  const trainingLevel = previous.trainingLevel === undefined ? defaults.initialLevel
    : Math.max(defaults.levelLimits.min,Math.min(defaults.levelLimits.max,Math.floor(Number(previous.trainingLevel) || defaults.initialLevel)));
  const check = inspectV39UnitCreation(state, player, { race, className, mode, count, trainingLevel, equipmentRarityBySlot });
  const highlightNext=!check.available||isV39TerritoryGuideActionCompleted('units');
  const guideTarget=!check.available?'training-conditions':highlightNext?'review':tab==='training'?'training-tab':'training';
  const guideCaption=renderV39TerritoryGuide(state,'units',{target:guideTarget,highlightNext});
  const caption=guideCaption?`<div class="v39-territory-guide-caption">${guideCaption}</div>`:'';
  panel.dataset.v39TerritoryGuideTarget=guideCaption&&!highlightNext?'training':'';
  const shortageClass = shortage => shortage ? ' class="v39-unit-create-shortage"' : '';
  const renderCost = amounts => Object.entries(amounts).map(([key, value]) => {
    const shortage = check.reasons.includes(`${key}不足`);
    const label = escapeHtml(`${key} ${value}${shortage ? "（不足）" : ""}`);
    return `<span${shortageClass(shortage)} role="img" aria-label="${label}" title="${label}">${renderV39ResourceIcon(key) || escapeHtml(key)} <b>${value}</b></span>`;
  }).join("");
  const trainingCost=renderCost(check.trainingCost);
  const equipmentCost=renderCost(check.loadout.material);
  const formation = `${check.mode.memberCount}人編成`;
  const population = `${check.populationCost}人`;
  const populationSummary = mode === "normal" ? population
    : `${count === 1 ? formation : `${population}（${formation}×${count}）`}・攻撃${check.mode.attackCount}回・HP×${check.mode.hpMultiplier}`;
  const requiredMilitaryLevel = Math.max(check.mode.requiredMilitaryLevel, check.recruitment?.requiredMilitaryLevel || 0);
  const level = check.initialLevel;
  const previewUnit = check.classRow ? buildV39UnitCreationPreview(check) : null;
  const previewTab=panel.dataset.previewTab||'ability';
  const toolSlots=resolveV39ToolSlots(previewUnit || {});
  const acquiredTools=new Set(collectV39AcquiredToolNames(player.factionState));
  const toolLoadout=(previous.defaultToolLoadout??getV39LastTrainingToolLoadout(player.factionState,previewUnit||{}))
    .filter(row=>acquiredTools.has(row.name)).slice(0,toolSlots);
  const toolDefinitions=getV39ConsumableDefinitions();
  const training = inspectV39RecruitTraining(player.factionState, check.village,
    {race, className, level, prerequisiteClassLevels:check.recruitment?.initialGrowth.prerequisiteClassLevels}, state);
  const queue = inspectV39RecruitTrainingQueue(player.factionState, state).filter(task => task.entry.settlementId === check.village.settlementId);
  const slots = getV39RecruitTrainingSlots(player.factionState, check.village, className, state);
  const occupiedSlots = queue.filter(task => slots.some(slot => slot.id === task.slot?.id)).length;
  const activeCount = queue.filter(task => task.status === "training").length;
  const waitingTotal = queue.filter(task => task.status === "waiting").length;
  const pausedCount = queue.filter(task => task.status === "paused").length;
  if(settlementHost){
    settlementHost.innerHTML=`<label class="v39-create-base-label"><select id="v39-create-settlement" aria-label="訓練拠点">${settlements.map(base=>
      `<option value="${escapeHtml(base.settlementId)}"${base.settlementId===check.village.settlementId?' selected':''}>${escapeHtml(base.name||'拠点')} (${base.x},${base.y})</option>`).join('')}</select></label>`;
    settlementHost.hidden=false;
  }
  const trainingHelp=V39_SCREEN_HELP_COPY.training;
  const overviewHelp=renderV39ScreenHelpContent(trainingHelp.overviewTitle,
    `<p>${escapeHtml(trainingHelp.overview)}</p>`);
  const modeProfiles=resolveUnitCreateModeOptions(options.militaryLevel);
  const modeHelp=renderV39ScreenHelpContent(trainingHelp.modeTitle,options.modes.map(row=>{
    const profile=modeProfiles.find(entry=>entry.mode===row.mode);
    const details=row.mode==='normal'?trainingHelp.hero:trainingHelp.army;
    const stats=profile&&row.mode!=='normal'
      ? `${profile.memberCount}人編成・攻撃${profile.attackCount}回・HP×${profile.hpMultiplier}`
      : !profile?`軍事Lv${row.requiredMilitaryLevel}で解禁`:'';
    return `<p><b>${escapeHtml(row.label)}</b>　${escapeHtml(details)} ${escapeHtml(stats)}</p>`;
  }).join(''));
  const speedHelp=renderV39ScreenHelpContent(trainingHelp.speedTitle,
    `<p>${escapeHtml(trainingHelp.speed)}</p>
    <div>毎ターン ${training.expPerTurn} EXP / 必要 ${training.requiredExp} EXP</div>
    <div>待機支援 ${escapeHtml(training.instructor?.name || "なし")}${training.instructor ? ` Lv${training.instructor.level}（+${training.instructorBonus} EXP/T・都市補正前）<br>支援ユニットは指導したターンに ${training.instructorRewardExp} EXPを獲得` : ""}</div>
    <div>${escapeHtml(trainingHelp.support)}</div>`);
  panel.innerHTML = `<header class="v39-unit-create-head">${caption}
      <div class="v39-unit-create-tab-row">
        <nav class="v39-unit-create-tabs" role="tablist" aria-label="ユニット作成と訓練状況">
          <button type="button" id="v39-create-tab" role="tab" aria-controls="v39-create-pane" data-unit-create-tab="create" title="既存・訓練中のユニット数 / 作成上限">作成 <span class="v39-unit-count-limit">${check.current}/${check.cap}</span></button>
          <button type="button" id="v39-training-tab" role="tab" aria-controls="v39-training-pane" data-unit-create-tab="training">訓練中 <span>${queue.length}</span></button>
        </nav>
        ${overviewHelp}
      </div>
    </header>
    <section id="v39-create-pane" class="v39-unit-create-pane" role="tabpanel" aria-labelledby="v39-create-tab" data-unit-create-pane="create">
      <section class="v39-unit-create-block v39-unit-create-consumption"><h3>今回の消費 <span>${count}ユニット分</span></h3>
        <dl class="v39-unit-create-rows"><div><dt>拠点人口</dt><dd${shortageClass(check.reasons.some(reason => reason.startsWith("人口不足")))}>${populationSummary}</dd></div></dl>
        <div class="v39-unit-create-costs">
          <div class="v39-unit-create-cost"><small>訓練</small>${trainingCost || "物資の消費なし"}</div>
          ${equipmentCost?`<div class="v39-unit-create-cost"><small>装備生成</small>${equipmentCost}</div>`:""}
        </div>
      </section>
    <div class="v39-unit-create-columns">
      <div class="v39-unit-create-settings">
      <section class="v39-unit-create-block v39-unit-create-summary"><h3>作成条件</h3>
        <dl class="v39-unit-create-rows"><div><dt>軍事研究</dt><dd${shortageClass(check.militaryLevel < requiredMilitaryLevel)}>必要Lv${requiredMilitaryLevel} / 現在Lv${check.militaryLevel}</dd></div>
        ${mode==="normal"?`<div><dt>英雄誕生枠</dt><dd${shortageClass(options.heroBirthSlots<count)}>${options.heroBirthSlots} / 必要${count}</dd></div>`:""}
        ${check.recruitment ? `<div><dt>必要施設</dt><dd${shortageClass(check.recruitment.reasons.includes(`${check.recruitment.facilityName}の建設完了が必要`))}>${escapeHtml(check.recruitment.facilityName)}（上位職）</dd></div>` : ""}</dl>
      </section>
      <div class="v39-unit-create-grid">
        <div><div class="v39-unit-count-label">種族 <b>${options.races.length}種</b></div>
          <input type="hidden" id="v39-unit-race" value="${escapeHtml(race)}">
          <button type="button" id="v39-unit-race-picker" data-unit-acquisition="race" aria-haspopup="dialog" aria-label="種族一覧から選択: ${escapeHtml(race)}"${options.races.length?"":" disabled"}>${escapeHtml(race || '選択')}</button></div>
        <div><div class="v39-unit-count-label">職業 <b title="基礎職 / 上位職の候補数">基${baseClassCount} 上${upperClassCount}</b></div>
          <input type="hidden" id="v39-unit-class" value="${escapeHtml(className)}">
          <button type="button" id="v39-unit-class-picker" data-unit-acquisition="class" aria-haspopup="dialog" aria-label="クラス一覧から選択: ${escapeHtml(className)}"${classes.length?"":" disabled"}>${escapeHtml(className || '選択')}</button></div>
        <div><div class="v39-unit-mode-heading"><label for="v39-unit-mode">種別</label>${modeHelp}</div>
          <select id="v39-unit-mode"${availableMode?'':' disabled'}>${options.modes.map(row =>
            `<option value="${row.mode}"${row.mode === mode ? " selected" : ""}${row.unavailableReason?' disabled':''}>${escapeHtml(row.label)}（${escapeHtml(row.unavailableReason || `あと${row.remainingCapacity}体`)}）</option>`
          ).join("")}</select></div>
        <div class="v39-unit-create-numbers"><label><span>作成数</span><input id="v39-unit-count" type="number" min="1" max="20" value="${count}"></label>
        <label><span>訓練Lv</span><input id="v39-unit-training-level" type="number" min="${check.levelLimits.min}" max="${check.levelLimits.max}" step="1" value="${level}" aria-describedby="v39-training-level-help"></label></div>
        <span id="v39-training-level-help">総合Lv ${check.levelLimits.min}〜${check.levelLimits.max}</span>
        <div class="v39-unit-create-tool-settings">
        ${renderV39ScreenHelpContent(trainingHelp.toolsTitle,
          trainingHelp.tools.map(line=>`<p>${escapeHtml(line)}</p>`).join(''),{inline:true})}
        <section class="v39-unit-create-block v39-unit-create-tools" data-unit-tool-settings>
          <h3>${escapeHtml(trainingHelp.toolsTitle)} <b>${toolLoadout.length}/${toolSlots}</b></h3>
          <div class="v39-unit-tool-list">${toolLoadout.map((row,index)=>{
            const item=toolDefinitions.find(entry=>entry.名前===row.name);
            if(!item)return '';
            return `<article class="v39-unit-tool-card" data-unit-tool-row data-unit-tool-name="${escapeHtml(item.名前)}" data-unit-tool-count="${row.count}">
              <button type="button" data-unit-tool-edit="${index}" aria-haspopup="dialog" aria-label="${escapeHtml(item.名前)} ×${row.count} を変更"><span class="v39-unit-tool-icon">${renderV39ResourceIcon(item.名前)}</span><strong>${escapeHtml(item.名前)}</strong><b>×${row.count}</b></button>
              <button type="button" data-unit-tool-remove="${index}" aria-label="${escapeHtml(item.名前)}を外す">×</button>
            </article>`;
          }).join('')}</div>
          ${toolLoadout.length<toolSlots?`<button type="button" data-unit-tool-add>＋ 道具を追加</button>`:''}
          ${toolSlots===0?'<span>初期携帯枠のある装備がありません。</span>':''}
        </section>
        </div>
      </div>
      </div>
      <section class="v39-unit-create-block v39-unit-create-overview"><h3>訓練後のユニット <b>総合Lv${level}</b></h3>
        ${previewUnit ? `<div class="v39-unit-creation-preview">
          ${renderV39UnitCard(previewUnit, {portrait:true, interactive:false, collapseUnselected:false,
            snapshot:true, position:check.mode.unitTypeLabel})}
          <div class="squad-detail-pane" style="--v39-detail-tab-count:3"><div class="squad-detail-tabs" role="group" aria-label="訓練後のユニットの表示">${[['ability','能力'],['skills','スキル'],['equipment','装備']].map(([id,label])=>
            `<button type="button" id="v39-training-preview-${id}" class="squad-detail-tab${previewTab===id?' active':''}" data-unit-preview-tab="${id}" aria-pressed="${previewTab===id}">${label}</button>`).join('')}</div>
          <div class="v39-unit-preview-content" data-preview-tab="${previewTab}">
          ${previewTab==='skills'
            ? `<div class="technique-list">${renderV39UnitSkills(previewUnit)}</div>`
            : previewTab==='equipment' ? `<div class="v39-unit-create-equipment">${EQUIPMENT_SLOT_KEYS.map((slot,index)=>{
            const item=previewUnit.equipment?.find(row=>row.slot===slot);
            if(!item)return `<div class="v39-unit-create-empty-slot"><span>${slot}</span><small>なし</small></div>`;
            return `<div class="v39-unit-create-equipment-slot">
              ${renderV39EquipmentDisplayRow(item,{slot,inline:true})}
              <select id="v39-training-rarity-${index}" data-unit-equipment-rarity="${slot}" aria-label="${slot}のレア度">
                ${V39_EQUIPMENT_RARITIES.map(rarity=>`<option value="${rarity.key}"${item.quality===rarity.key?' selected':''}>${escapeHtml(rarity.short)} ${escapeHtml(rarity.label)}</option>`).join('')}
              </select>
            </div>`;
          }).join("")}
          </div>` : renderV39UnitAbility(previewUnit, {statusOnly:true})}</div></div>
        </div>` : ""}
      </section>
    </div>
    </section>
    <section id="v39-training-pane" class="v39-unit-create-pane" role="tabpanel" aria-labelledby="v39-training-tab" data-unit-create-pane="training">
      <section class="v39-unit-create-block v39-training-totals"><h3>${escapeHtml(check.village.name || "選択中の拠点")}</h3>
        <div>訓練中 ${activeCount} · 順番待ち ${waitingTotal}${pausedCount ? ` · 停止中 ${pausedCount}` : ""}</div>
        <div>同時訓練枠 ${occupiedSlots} / ${slots.length}${slots[0]?.tileKey ? ` · ${escapeHtml(slots[0].facilityName)}1棟につき1枠` : slots.length ? " · 拠点の基礎枠" : ""}</div>
      </section>
      ${queue.length ? queue.map(renderTrainingCard).join("") : '<p class="v39-training-empty">訓練中のユニットはありません。<br>「作成」タブで訓練を予約できます。</p>'}
    </section>
    <footer><output id="v39-unit-create-status">${escapeHtml(panelMessage || (check.available ? (guideCaption ? "訓練を予約できます" : "訓練を開始できます") : check.reasons.join(" / ")))}</output>${speedHelp}<button type="button" id="v39-unit-create-confirm" class="v39-unit-create-confirm"${check.available ? "" : " disabled"}>${check.available ? `${guideCaption ? "訓練を予約 " : "訓練開始"}⌛${training.turns}` : "作成不可"}</button></footer>`;
  switchTab(panel, tab);
  panel.querySelector(`[data-unit-create-pane="${tab}"]`).scrollTop=scrollTop;
  panel.querySelector('.v39-unit-create-grid').scrollTop=settingsScroll;
  const previewContent=panel.querySelector('.v39-unit-preview-content');
  if(previewContent&&previousPreviewTab===previewTab){
    previewContent.scrollTop=previewScroll;
  }
  if(focusedId)document.getElementById(focusedId)?.focus({preventScroll:true});
}

function open() {
  return window.openV39CharacterModal?.({tab:'create'});
}

export function mountV39UnitCreatePanel(host,visible){
  const panel=ensurePanel(host);if(!panel)return;
  panel.hidden=!visible;
  if(visible)render();
  else {
    const settlementHost=document.getElementById('v39-create-settlement-host');
    if(settlementHost)settlementHost.hidden=true;
  }
}

function create() {
  if(window.isV39MapInputLocked?.())return;
  const panel = ensurePanel();
  const state = window.getV39GameState?.();
  const player = window.getV39ActivePlayer?.();
  if (!panel || !state || !player) return;
  if (window.isV39FixedMapEditing?.()) {
    const unit = readFixedMapUnit(panel);
    if (!unit.name || !Number.isInteger(unit.level) || unit.level < 1 || unit.level > 100) {
      panel.querySelector('#v39-unit-create-status').textContent = '名前とLv（1〜100）を確認してください。';
      return;
    }
    if (window.queueV39FixedMapUnit?.(unit)) document.querySelector('#characterModal .modal-head [data-close]')?.click();
    return;
  }
  const result = createV39Units(state, player.id, requestFromPanel(panel));
  if (!result.ok) return render(result.reason);
  equipmentRarityBySlot = {};
  window.setV39GameState?.({ players:result.state.players }, { reason:"units-created" });
  window.renderV39ResourceTop?.();
  render(`${result.queuedUnits.length}体の訓練を予約しました`);
}

function installStyles() {
  const style = document.createElement("style");
  style.textContent = `.v39-unit-create-panel{width:100%;height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(auto,1fr) auto;gap:8px;overflow:auto;color:#e8efec}.v39-unit-create-panel[hidden],.v39-unit-create-panel [hidden]{display:none!important}.v39-unit-create-pane{display:grid;gap:8px;align-content:start;min-width:0}.v39-unit-create-head{position:sticky;top:0;z-index:2;align-self:start;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:4px 0;background:#0b171b}.v39-unit-create-head button,.v39-unit-create-confirm{min-height:36px;border:1px solid #4b6871;border-radius:7px;background:#173039;color:#edf5f3;padding:5px 11px}.v39-unit-create-head strong{font-size:var(--font-size-16)}.v39-unit-create-tabs{display:flex;gap:6px;width:100%}.v39-unit-create-tabs button{flex:1;font-size:var(--font-body);background:#101c21;color:#aebdc0}.v39-unit-create-tabs button[aria-selected=true]{border-color:#77ccdf;background:#173039;color:#edf5f3;font-weight:700}.v39-unit-create-tabs span{margin-left:5px;color:#e8c76c}.v39-training-card{border:1px solid #384c53;border-radius:7px;padding:8px;display:grid;gap:5px;font-size:var(--font-body);min-width:0}.v39-training-card header{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:5px}.v39-training-card strong{overflow-wrap:anywhere}.v39-training-card strong span{color:#e8c76c}.v39-training-card header b{color:#9bdda6}.v39-training-card[data-training-status=waiting] header b{color:#e8c76c}.v39-training-card[data-training-status=paused] header b{color:#efa48b}.v39-training-card>div{overflow-wrap:anywhere;color:#aebdc0}.v39-training-card .v39-training-card-time{color:#edf5f3}.v39-training-card progress{width:100%;height:10px;accent-color:#78ce97}.v39-training-empty{margin:0;padding:12px 8px;color:#aebdc0;font-size:var(--font-body);line-height:1.6}.v39-unit-create-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:7px;align-items:start}
.v39-unit-create-grid{display:grid;align-content:start;gap:7px;min-width:0}
.v39-unit-create-tab-row{display:flex;align-items:center;gap:6px;width:100%;min-width:0}
.v39-unit-create-tab-row>.v39-unit-create-tabs{min-width:0;flex:1}
.v39-unit-create-grid label{display:grid;gap:4px;min-width:0}
.v39-unit-create-overview .squad-detail-pane{min-width:0;padding:0}
.v39-unit-create-cost>small{color:#aebdc0;align-self:center}
.v39-unit-create-costs{display:flex;flex-wrap:wrap;align-items:baseline;gap:5px 16px}
.v39-unit-create-columns{min-height:0;align-items:stretch}
.v39-unit-create-settings{display:grid;grid-template-rows:auto minmax(0,1fr);gap:7px;min-width:0;min-height:0}
.v39-unit-create-grid{min-height:0;overflow:auto;overscroll-behavior:contain}
.v39-unit-create-overview,.v39-unit-creation-preview,.v39-unit-creation-preview>.squad-detail-pane{
  display:grid;grid-template-rows:auto minmax(0,1fr);min-height:0;min-width:0;overflow:hidden;
}
.v39-unit-preview-content{min-height:0;min-width:0;overflow:auto;overscroll-behavior:contain}
.v39-unit-create-grid span{font-size:var(--font-body)}.v39-unit-count-label{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:4px}.v39-unit-count-limit{color:#e8c76c;white-space:nowrap;font-weight:600}.v39-unit-create-grid select,.v39-unit-create-grid input{box-sizing:border-box;width:100%;min-width:0;min-height:38px;border:1px solid #425860;border-radius:7px;background:#101c21;color:#edf5f3;padding:6px;font-size:var(--font-body)}.v39-unit-create-block{min-width:0;border:1px solid #384c53;border-radius:7px;padding:8px;font-size:var(--font-body)}.v39-unit-create-block h3{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:4px;margin:0 0 6px;font-size:var(--font-body);color:#b8c7c9}.v39-unit-create-block h3 b{color:#e8c76c}.v39-unit-create-block h3 span{font-weight:400}.v39-unit-create-rows{margin:0;display:grid;gap:5px}.v39-unit-create-rows>div{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:4px 10px}.v39-unit-create-rows dt{color:#aebdc0}.v39-unit-create-rows dd{margin:0;color:#edf5f3;overflow-wrap:anywhere}.v39-unit-create-cost{display:flex;flex-wrap:wrap;gap:5px 12px;margin-top:6px}.v39-unit-create-cost>span{white-space:nowrap;color:#edf5f3}.v39-unit-create-cost .v39-resource-item-sprite{margin-inline-end:.25em}.v39-unit-create-block .v39-unit-create-shortage{color:#ff9b9b}.v39-unit-create-panel footer{position:sticky;bottom:0;align-self:end;display:flex;align-items:center;gap:8px;min-height:46px;padding:5px 0;background:#0b171b;z-index:1}.v39-unit-create-panel output{flex:1;font-size:var(--font-body);color:#b8c7c9}.v39-unit-create-confirm{min-width:100px;font-size:var(--font-body);font-weight:800;border-color:#b99337;background:#5b4618;color:#fff4c4}.v39-unit-create-confirm:disabled{border-color:#50636a;background:#1a292e;color:#aebdc0;opacity:1}`;
  style.textContent += `
.v39-unit-create-numbers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.v39-unit-create-panel [data-unit-acquisition]{width:100%;min-height:34px;text-align:left;color:#edf5f3;background:#101c21;border:1px solid #425860;border-radius:6px;padding:5px;font:inherit;overflow-wrap:anywhere}
.v39-unit-tool-list{display:grid;gap:6px}
.v39-unit-create-panel [data-unit-acquisition]{display:flex;justify-content:space-between;align-items:center;gap:5px}
.v39-unit-create-panel [data-unit-acquisition]::after{content:'›';color:#8bd8e4;font-size:1.3em}
.v39-unit-tool-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px}
.v39-unit-tool-icon{display:grid;place-items:center;font-size:22px}
.v39-unit-tool-icon .v39-resource-item-sprite{width:24px;height:24px;object-fit:contain}
.v39-unit-tool-card>button,.v39-unit-create-tools>[data-unit-tool-add]{min-height:34px;border:1px solid #52747d;border-radius:6px;background:#19353f;color:#eef5f4;padding:4px 6px;font:inherit}
.v39-unit-tool-card>[data-unit-tool-edit]{display:grid;grid-template-columns:24px minmax(0,1fr) auto;align-items:center;gap:5px;text-align:left;overflow-wrap:anywhere}
.v39-unit-create-tools>[data-unit-tool-add]{width:100%;margin-top:6px}
.v39-training-tool-picker-dialog{padding:0;border:0;background:transparent;max-width:96vw;max-height:94svh;overflow:visible}
.v39-unit-mode-heading{display:flex;align-items:center;gap:5px;margin-bottom:3px}
.v39-unit-create-equipment{display:grid;gap:3px;margin-top:4px;min-width:0}
.v39-unit-create-equipment-slot{display:grid;grid-template-columns:minmax(0,1fr) 54px;gap:3px;align-items:center}
.v39-unit-create-empty-slot{display:flex;align-items:center;justify-content:space-between;gap:4px;min-height:26px;padding:2px 5px}
.v39-unit-create-equipment .v39-equipment-display-row{display:block;min-width:0}
.v39-unit-create-equipment .v39-equipment-display-summary{grid-template-columns:20px minmax(0,1fr) auto;min-height:26px;padding:2px 4px;gap:3px}
.v39-unit-create-equipment .v39-equipment-display-rarity{display:none}
.v39-unit-create-equipment select{width:100%;min-width:0;min-height:28px;color:#edf5f3;background:#101c21;border:1px solid #52747d;border-radius:5px;font:inherit}
.v39-unit-create-tool-settings{position:relative;min-width:0}
.v39-unit-create-tool-settings>.v39-screen-help-inline{inset:4px 4px auto auto}
.v39-unit-create-tool-settings .v39-unit-create-tools>h3{min-height:18px;align-items:center;gap:4px;padding-inline-end:25px;color:#aadddf}
`;
  document.head.appendChild(style);
}

function openTrainingAcquisition(panel, kind) {
  if (window.isV39FixedMapEditing?.()) {
    const options = window.getV39FixedMapUnitOptions?.();
    const request = readFixedMapUnit(panel);
    const input = panel.querySelector(kind==='race' ? '#v39-unit-race' : '#v39-unit-class');
    if (!options || !input) return;
    window.openV39AcquisitionPicker?.({kind,selected:input.value,race:request.race,
      choices:kind==='race' ? options.races : options.classes.map(row => row.名前),
      onConfirm(name) { input.value = name; render(); }
    });
    return;
  }
  const player=window.getV39ActivePlayer?.();
  const state=window.getV39GameState?.();
  const request=requestFromPanel(panel);
  const options=getV39UnitCreationOptions(player,state);
  const choices=kind==='race'?options.races:getTrainingClasses(options,request.mode).map(row=>row.名前);
  const input=panel.querySelector(kind==='race'?'#v39-unit-race':'#v39-unit-class');
  function getTrainingQuote(className) {
    const sameClass=className===request.className;
    const check=inspectV39UnitCreation(state,player,{
      ...request,className,
      trainingLevel:sameClass?request.trainingLevel:undefined,
      equipmentRarityBySlot:sameClass?request.equipmentRarityBySlot:{}
    });
    const resourceRows=amounts=>Object.entries(amounts).map(([name,required])=>{
      const stock=FOOD_RESOURCE_KEYS.includes(name)?check.village?.foodStockByType:check.village?.materialStockByType;
      return {name,required,stock:Number(stock?.[name])||0,shortage:check.reasons.includes(`${name}不足`)};
    });
    return {
      count:check.count,
      population:{
        required:check.populationCost,
        stock:Number(check.village?.populationByRace?.[check.race])||0,
        shortage:check.reasons.some(reason=>reason.startsWith('人口不足')||reason.endsWith('の人口がいません'))
      },
      training:resourceRows(check.trainingCost),
      equipment:resourceRows(check.loadout.material)
    };
  }
  window.openV39AcquisitionPicker?.({kind,choices,selected:input.value,race:request.race,
    getTrainingQuote:kind==='class'?getTrainingQuote:undefined,onConfirm(name){
    if(name===input.value)return;
    input.value=name;
    panel.querySelector('#v39-unit-training-level').value='';
    equipmentRarityBySlot={};
    render('');
  }});
}

function openTrainingToolPicker(panel,index=null) {
  const state=window.getV39GameState?.(),player=window.getV39ActivePlayer?.();
  if(!state||!player)return;
  const previewCheck=inspectV39UnitCreation(state,player,requestFromPanel(panel));
  const preview=previewCheck.classRow?buildV39UnitCreationPreview(previewCheck):null;
  const acquiredTools=new Set(collectV39AcquiredToolNames(player.factionState));
  const definitions=getV39ConsumableDefinitions().filter(item=>acquiredTools.has(item.名前));
  const loadout=(requestFromPanel(panel).defaultToolLoadout??getV39LastTrainingToolLoadout(player.factionState,preview||{})).map(row=>({...row}));
  const current=index==null?null:loadout[index];
  let selected=definitions.find(item=>item.名前===current?.name)||null;
  let quantity=current?.count||1;
  const dialog=document.createElement('dialog');dialog.id='v39-training-tool-picker';dialog.className='v39-training-tool-picker-dialog';
  const stockFor=name=>Math.max(0,Math.floor(Number(previewCheck.village?.toolStockByType?.[name])||0));
  const catalog=()=>definitions.filter(item=>!loadout.some((row,rowIndex)=>row.name===item.名前&&rowIndex!==index)).map(item=>({
    id:item.名前,label:item.名前,icon:renderV39ResourceIcon(item.名前),metrics:[`在庫 ${stockFor(item.名前)}`,`携帯上限 ${item.携帯上限||1}`]
  }));
  function draw(keepPosition=false){
    const scroll=keepPosition?dialog.querySelector('.list-pane')?.scrollTop||0:0;
    const max=Math.max(1,Number(selected?.携帯上限)||1);
    quantity=Math.min(max,quantity);
    const controls=selected?[{id:'quantity',label:'個数（1体あたり）',value:quantity,
      options:Array.from({length:max},(_,i)=>({value:i+1,label:`${i+1} / ${max}`}))}]:[];
    const facts=selected?[{label:'訓練拠点の在庫',value:stockFor(selected.名前)},{label:'効果',value:selected.効果||'—'},{label:'使用AP',value:selected.AP消費??'—'}]:[];
    dialog.innerHTML=renderV39ItemListScreen1({
      title:'初期携帯品を選ぶ',titleId:'v39-training-tool-picker-title',rows:catalog(),help:V39_SCREEN_HELP_COPY.training.tools,
      detail:{kind:'item',selectedId:selected?.名前,candidateAttribute:'data-training-tool-option',
        emptyText:'追加できる入手済みの道具がありません',heading:selected?.名前||'道具を選択',
        icon:selected?renderV39ResourceIcon(selected.名前):'',controls,facts,
        sections:selected?[{label:'効果の詳細',lines:[selected.詳細||selected.効果||'効果の説明はありません']}]:[]},
      actions:[{id:'cancel',label:'戻る'},{id:'confirm',label:'この道具を設定',disabled:!selected}]
    });
    const list=dialog.querySelector('.list-pane');if(list)list.scrollTop=scroll;
  }
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});
  dialog.addEventListener('change',event=>{
    const action=readV39ItemListAction(event.target);
    if(action?.id==='quantity')quantity=Number(action.value);
  });
  dialog.addEventListener('click',event=>{
    const action=readV39ItemListAction(event.target);if(!action)return;
    if(action.id==='close'||action.id==='cancel'){dialog.close();return;}
    if(action.id==='candidate'){
      if(selected?.名前===action.value)return;
      selected=definitions.find(item=>item.名前===action.value)||null;
      quantity=current&&selected?.名前===current.name?current.count:1;
      draw(true);
      dialog.querySelector('button[data-training-tool-option][aria-pressed="true"]')?.focus({preventScroll:true});
      return;
    }
    if(action.id==='confirm'&&selected){
      const entry={name:selected.名前,count:quantity};
      if(index==null)loadout.push(entry);
      else loadout[index]=entry;
      dialog.close();commitTrainingToolLoadout(panel,loadout);
    }
  });
  document.body.append(dialog);draw();dialog.showModal();
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
    if(tab){
      switchTab(panel,tab.dataset.unitCreateTab);
      if(panel.querySelector('.v39-territory-guide'))render();
      return;
    }
    const previewTab=element?.closest('[data-unit-preview-tab]');
    if(previewTab&&panel.dataset.previewTab!==previewTab.dataset.unitPreviewTab){
      panel.dataset.previewTab=previewTab.dataset.unitPreviewTab;
      render();
      return;
    }
    const acquisition=element?.closest('[data-unit-acquisition]');
    if(acquisition)openTrainingAcquisition(panel,acquisition.dataset.unitAcquisition);
    if(element?.closest('[data-unit-tool-add]'))openTrainingToolPicker(panel);
    const editTool=element?.closest('[data-unit-tool-edit]');
    if(editTool)openTrainingToolPicker(panel,Number(editTool.dataset.unitToolEdit));
    const removeTool=element?.closest('[data-unit-tool-remove]');
    if(removeTool){const rows=requestFromPanel(panel).defaultToolLoadout||[];rows.splice(Number(removeTool.dataset.unitToolRemove),1);commitTrainingToolLoadout(panel,rows);}
    if (element?.closest("#v39-unit-create-confirm")) create();
  });
  document.addEventListener("keydown", event => {
    const panel=document.getElementById('v39-unit-create-panel');
    if(!panel?.contains(event.target))return;
    if (!event.target.matches?.("[data-unit-create-tab]") || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tab = event.key === "Home" ? "create" : event.key === "End" ? "training" : panel.dataset.tab === "create" ? "training" : "create";
    switchTab(panel, tab);
    if(panel.querySelector('.v39-territory-guide'))render();
    panel.querySelector(`[data-unit-create-tab="${tab}"]`).focus();
  });
  document.addEventListener("change", event => {
    const panel=document.getElementById('v39-unit-create-panel');
    if(!panel||panel.hidden||(!panel.contains(event.target)&&event.target.id!=='v39-create-settlement'))return;
    if(event.target.id==='v39-create-settlement'){
      if(window.isV39MapInputLocked?.())return;
      const player=window.getV39ActivePlayer();
      equipmentRarityBySlot={};
      defaultToolLoadout=null;
      panel.querySelector('[data-unit-tool-settings]')?.remove();
      window.updateV39ActiveFactionState(selectFactionSettlement(player.factionState,event.target.value),{reason:'unit-create-base-selected'});
    }
    if (event.target.id==="v39-unit-mode") {
      equipmentRarityBySlot={};
      panel.querySelector("#v39-unit-training-level").value = "";
    }
    const raritySlot=event.target.dataset.unitEquipmentRarity;
    if(raritySlot)equipmentRarityBySlot[raritySlot]=event.target.value;
    render('');
  });
  window.addEventListener("v39:turn-advanced", () => render());
  for(const event of ['v39:field-generated','v39:save-loaded']){
    window.addEventListener(event,()=>{
      toolBaseKey='';
      render();
    });
  }
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
