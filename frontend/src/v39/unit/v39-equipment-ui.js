import {openV39EnchantmentColorSettings,renderV39EnchantmentMark} from "./v39-enchantment-color-settings.js";
import {getV39EnchantmentMarkColor} from "../../lib/v39-enchantment-color-state.js";
import {getV39EquipmentDisplayStats,renderV39EquipmentDisplayRow,renderV39EquipmentRarityBadge,renderV39EquipmentIcon} from "../ui/v39-equipment-display.js";
import {
  V39_EQUIPMENT_RARITIES,
  applyV39EquipmentEnchantment,
  applyV39EquipmentEnchantments,
  changeV39UnitEquipment,
  canV39ChangeUnitEquipmentSlot,
  createV39EquipmentEntry,
  previewV39EquipmentEnchantment,
  getV39EquipmentCatalog,
  inspectV39EquipmentCraftPlan,
  getV39CraftEnchantmentOptions,
  getV39EquipmentInventoryView,
  getV39EnchantmentOptions,
  getV39MissingEquipmentResources,
  getV39EquipmentEnchantCapacityForPlayer,
  getV39EquipmentEnhancementDisplay,
  getV39EquipmentProductionPointCost,
  normalizeV39EquipmentItem,
  reserveV39EquipmentCraft,
  rerollV39MobEquipment
} from "../../lib/v39-equipment-rules.js";
import {V39_WEAPON_PHYSICAL_TYPES} from "../../lib/v39-weapon-physical-power.js";
import {getSelectedSettlement} from "../../lib/settlement-state.js";
import {forecastV39ProductionWork,newV39ProductionOrder} from "../../lib/v39-production-work.js";
import { EQUIPMENT_SLOT_KEYS } from "../../constants/unitCommon.js";
import { isMobUnit } from "../../composables/unitCoreUtils.js";
import {installV39EquipmentHold} from "./v39-equipment-hold.js";
import {renderV39UnitCard} from "./v39-unit-card.js";
import {renderV39UnitAbility} from "./v39-unit-detail.js";
import { openV39EquipmentPicker } from "./v39-equipment-picker.js";
import { readV39ItemListAction, renderV39EnhancementScreen, renderV39ItemListCost, renderV39ItemListScreen1 } from "../ui/v39-item-list-screen-1.js";

import {updateV39RetainedMarkup} from "../ui/v39-retained-markup.js";

let activeTab = "inventory";
let selectedInventoryKey = "";
let selectedUnitId = "";
let selectedEnchantmentName = null;
let selectedEnchantmentFamily = "";
const plannedEnchantments=new Map();
let craftEnchantments=new Map();
let enchantTargetKey = "";
let enchantReturnTab = "inventory";
let statusText = "";
let craftRequest = {name:"", rarity:V39_EQUIPMENT_RARITIES[0]?.key, count:1};

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const escapeHtml = value => text(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const stat = (label, value, suffix = "") => number(value) === 0 ? "" : `<div class="v39-equip-stat"><span>${label}</span><b>${escapeHtml(value)}${suffix}</b></div>`;

function player() {
  return window.getV39ActivePlayer?.() ?? null;
}

function equipmentResistanceLabels(item) {
  return Object.entries(item.resistanceBonus || {}).filter(([, value]) => number(value) !== 0)
    .map(([key, value]) => `${key} ${number(value) > 0 ? "+" : ""}${value}`);
}

function itemHeading(item, {preview = false} = {}) {
  const {name,used}=getV39EquipmentEnhancementDisplay(item);
  return `<h3${preview ? ' class="v39-equip-preview-title"' : ""}>${preview ? `<span class="v39-equip-icon" aria-hidden="true">${renderV39EquipmentIcon(item, item.name)}</span>` : ""}${escapeHtml(name)}${used?` <span class="v39-equipment-enhancement-level">+${escapeHtml(used)}</span>`:""} <small${preview ? ` class="v39-equip-preview-rarity" data-quality="${escapeHtml(item.quality)}"` : ""}>[${escapeHtml(item.qualityLabel)}]</small></h3>`;
}

function itemDetail(item, changes = []) {
  if (!item) return '<p class="v39-equip-empty">装備を選択してください</p>';
  const stats=getV39EquipmentDisplayStats(item);
  const breakdown=stats.filter(([label])=>V39_WEAPON_PHYSICAL_TYPES.includes(label));
  const mainStats=stats.filter(([label])=>!V39_WEAPON_PHYSICAL_TYPES.includes(label));
  for (const {label,result,suffix} of changes) {
    if (!stats.some(([name])=>name===label) && !V39_WEAPON_PHYSICAL_TYPES.includes(label)) mainStats.push([label,result,suffix]);
  }
  const statRows=rows=>rows.map(([label,value,suffix])=>stat(label,value,suffix)).join("");
  const traits = (item.traits || []).map(value => `<span>${escapeHtml(value)}</span>`).join("");
  const resistances = equipmentResistanceLabels(item).map(label => `<span>${escapeHtml(label)}</span>`).join("");
  return `<div class="v39-equip-stats">${statRows(mainStats)}</div>
    ${breakdown.length?`<section><h4>物理威力の内訳</h4><div class="v39-equip-stats">${statRows(breakdown)}</div></section>`:""}
    ${resistances ? `<h4>耐性</h4><div class="v39-equip-chips">${resistances}</div>` : ""}
    ${(item.enchantments || []).length ? `<h4>付与</h4><div class="v39-equip-chips">${item.enchantments.map(value => `<span>${escapeHtml(value)}</span>`).join("")}</div>` : ""}
    ${traits ? `<h4>特性</h4><div class="v39-equip-chips">${traits}</div>` : ""}`;
}

function findInventorySelection(current, rows, key) {
  const direct = rows.find(row => row.key === key);
  if (direct) return direct;
  const receipts = current.factionState.namedWeaponReceipts || [];
  const receipt = receipts.findLast(entry => entry.sourceKey === key && rows.some(row => row.key === entry.id));
  return receipt && rows.find(row => row.key === receipt.id);
}

function inventoryPanel(current) {
  const rows = getV39EquipmentInventoryView(current);
  const selected = findInventorySelection(current, rows, selectedInventoryKey) ?? rows[0];
  selectedInventoryKey = selected?.key || "";
  return `<div class="v39-equip-inventory"><div class="v39-equip-list"><div class="v39-equip-grid">${rows.map(row => {
    const {name,used,applied}=getV39EquipmentEnhancementDisplay(row.item);
    const label = `${name}${used?" +"+used:""} ${row.qualityLabel} 在庫${row.remainingCount}${row.equippedCount ? ` 装備中${row.equippedCount}` : ""}`;
    return `<button type="button" class="v39-equip-tile" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" aria-pressed="${row.key === selectedInventoryKey}" data-v39-equip-item="${escapeHtml(row.key)}">
      <span class="v39-equip-tile-badges" aria-hidden="true">
        <span class="v39-equip-rank">${renderV39EquipmentRarityBadge(row.quality)}</span>
        ${applied.length?`<span class="v39-equip-enchantment-badges">
          ${used?`<span class="v39-equipment-enhancement-level">+${escapeHtml(used)}</span>`:""}
          <span class="v39-equip-enchantment-colors">${applied.map(({name})=>renderV39EnchantmentMark(name,getV39EnchantmentMarkColor(name))).join("")}</span>
        </span>`:""}
      </span>
      <span class="v39-equip-icon" aria-hidden="true">${renderV39EquipmentIcon(row.item, row.name)}</span>
      <span class="v39-equip-count" aria-hidden="true">${row.equippedCount ? "残" : ""}${row.remainingCount}</span>
    </button>`;
  }).join("") || '<p class="v39-equip-empty">装備はありません</p>'}</div></div><div class="v39-equip-detail v39-equip-inventory-detail">
    ${selected ? `<div class="v39-equip-inventory-header">
      ${itemHeading(selected.item)}
      <button type="button" data-v39-enchant-open${selected.remainingCount > 0 ? "" : " disabled"}>この装備に付与</button>
      ${selected.remainingCount > 0 ? "" : "<small>付与できる在庫がありません</small>"}
    </div>` : ""}
    <div class="v39-equip-inventory-stats">${itemDetail(selected?.item)}</div>
  </div></div>`;
}

function unitPanel(current) {
  const units = current.factionState?.units || [];
  if (!units.some(unit => unit.id === selectedUnitId)) selectedUnitId = current.factionState?.selectedUnitId || units[0]?.id || "";
  const unit = units.find(row => row.id === selectedUnitId) || units[0] || null;
  if (!unit) return '<p class="v39-equip-empty">キャラクターがいません</p>';
  selectedUnitId = unit.id;
  const equipment = (unit.equipment || []).map(normalizeV39EquipmentItem).filter(Boolean);
  const mob = isMobUnit(unit);
  const canChangeWeapons=mob&&canV39ChangeUnitEquipmentSlot(unit,"武器1");
  return `<div class="v39-equip-character">
    <div class="v39-equip-unit-bar"><label>キャラ<select id="v39-equip-unit">${units.map(row => `<option value="${escapeHtml(row.id)}"${row.id === unit.id ? " selected" : ""}>${escapeHtml(row.name)} / ${isMobUnit(row) ? "モブ" : "ネームド"}</option>`).join("")}</select></label>${canChangeWeapons ? '<b>武器は在庫装備を使用</b>' : mob ? '<b>固定プリセット装備</b>' : '<b>在庫装備を使用</b>'}</div>
    <div class="v39-equip-character-grid">
      <section class="v39-equip-character-status" aria-label="ユニットのステータス">
        ${renderV39UnitCard(unit,{portrait:true,interactive:false,collapseUnselected:false})}
        ${renderV39UnitAbility(unit,{mapData:window.__v39FieldRuntime?.mapData,statusOnly:true})}
      </section>
      <section class="v39-equip-character-slots" aria-label="現在の装備">
        <h3>現在の装備</h3>
        ${EQUIPMENT_SLOT_KEYS.map(slot => {
          const item = equipment.find(row => row.slot === slot);
          const content = item ? renderV39EquipmentDisplayRow(item,{slot:" "}) : '<span class="v39-equip-empty">なし</span>';
          const canChange = unit.hp > 0 && !unit.characterStorage && canV39ChangeUnitEquipmentSlot(unit,slot);
          return canChange
            ? `<button type="button" class="v39-equip-slot-card" data-v39-equip-change="${slot}"><small>${slot}</small>${content}</button>`
            : `<div class="v39-equip-slot-card"><small>${slot}</small>${content}</div>`;
        }).join("")}
      </section>
    </div>${mob ? `<div class="v39-equip-reroll"><label>レア度<select id="v39-equip-reroll-rarity">${V39_EQUIPMENT_RARITIES.map(row => `<option value="${row.key}">${row.label}</option>`).join("")}</select></label><button type="button" id="v39-equip-reroll">レア度一新</button></div>` : ""}</div>`;
}

function craftItemCategory(row) {
  if (row.武器分類 === "盾") return "防具";
  if (row.装備箇所 === "武器") return "武器";
  return row.装備箇所 === "装飾" ? "装飾" : "防具";
}

function openCraftItemPicker() {
  if (document.getElementById("v39-craft-item-picker")) return;
  const tabs = ["武器", "防具", "装飾"].map(name => ({id:name, label:name}));
  const catalog = getV39EquipmentCatalog().flatMap(({name, row}) => {
    const item = createV39EquipmentEntry(name, craftRequest.rarity);
    if (!item) return [];
    const metrics = [["威",item.power],["守",item.guard],["AP",item.attackAp]]
      .filter(([, value]) => number(value) !== 0).map(([label,value]) => `${label}${value}`);
    return [{id:name, label:name, item, category:craftItemCategory(row), icon:renderV39EquipmentIcon(item), metrics}];
  });
  let selected = catalog.find(row => row.id === craftRequest.name);
  let category = selected?.category ?? tabs[0].id;
  const dialog = document.createElement("dialog");
  dialog.id = "v39-craft-item-picker";
  dialog.setAttribute("aria-labelledby", "v39-craft-item-picker-title");

  function renderPicker({keepPosition = false} = {}) {
    const rows = catalog.filter(row => row.category === category);
    selected = rows.find(row => row.id === selected?.id) ?? rows[0];
    const scrollTop = keepPosition ? dialog.querySelector(".list-pane")?.scrollTop ?? 0 : 0;
    let detail = {kind:"item", selectedId:selected?.id, emptyText:"この種別の装備はありません"};
    if (selected) {
      const {item, icon, label} = selected;
      const facts = getV39EquipmentDisplayStats(item).filter(([label]) => !["威力","ガード","攻撃AP"].includes(label))
        .map(([label, value, suffix = ""]) => ({label, value:`${value}${suffix}`}));
      detail = {...detail, heading:label, icon, facts:[{label:"レア度", value:item.qualityLabel}, ...facts],
        sections:[{label:"耐性",lines:equipmentResistanceLabels(item)},{label:"特性",lines:item.traits || []}]
          .filter(({lines}) => lines.length)};
    }
    dialog.innerHTML = renderV39ItemListScreen1({
      title:"装備を選ぶ", titleId:"v39-craft-item-picker-title", tabs, activeTab:category, rows, detail,
      actions:[{id:"back",label:"戻る",destination:"craft"},{id:"confirm",label:"決定",destination:"craft",disabled:!selected}]
    });
    dialog.querySelector(".list-pane").scrollTop = scrollTop;
  }

  dialog.addEventListener("close", () => dialog.remove(), {once:true});
  dialog.addEventListener("keydown", event => { if (event.key === "Escape") event.stopPropagation(); });
  dialog.addEventListener("click", event => {
    const action = readV39ItemListAction(event.target);
    if (!action) return;
    if (action.id === "close" || action.id === "back") { dialog.close(); return; }
    if (action.id === "confirm" && selected) {
      if (craftRequest.name !== selected.id) craftEnchantments.clear();
      craftRequest.name = selected.id;
      dialog.close();
      render();
      document.querySelector("#equipmentModal [data-v39-craft-picker]")?.focus();
      return;
    }
    if (action.id === "tab") {
      category = action.value;
      renderPicker();
      dialog.querySelector('[data-v39-item-list-tab][aria-pressed="true"]')?.focus({preventScroll:true});
    }
    if (action.id === "candidate") {
      selected = catalog.find(row => row.id === action.value);
      renderPicker({keepPosition:true});
      dialog.querySelector('.v39-item-list-compact-card[aria-pressed="true"]')?.focus({preventScroll:true});
    }
  });
  document.body.append(dialog);
  renderPicker();
  dialog.showModal();
}

function craftPanel() {
  return `<div class="v39-equip-craft-layout">
    <div id="v39-equip-craft-preview" class="v39-equip-detail" aria-label="生成予定の装備"></div>
    <div class="v39-equip-craft">
    <div class="v39-equip-craft-controls"><div class="v39-equip-actions">
      <button type="button" data-v39-craft-picker>装備を選ぶ</button>
      <button type="button" id="v39-equip-craft-enchant"${craftRequest.name ? "" : " disabled"}>付与${craftEnchantments.size ? `（${craftEnchantments.size}件）` : ""}</button>
    </div>
    <div class="v39-equip-craft-fields">
      <label>レア度<select id="v39-equip-craft-rarity">${V39_EQUIPMENT_RARITIES.map(row => `<option value="${row.key}"${row.key === craftRequest.rarity ? " selected" : ""}>${escapeHtml(row.label)}</option>`).join("")}</select></label>
      <label>個数<input id="v39-equip-craft-count" type="number" min="1" max="99" value="${escapeHtml(craftRequest.count)}"></label>
    </div>
    <output id="v39-equip-craft-cost"></output></div>
    <div class="v39-equip-actions">
      <button type="button" id="v39-equip-craft">生成を予約</button>
    </div>
    </div>
  </div>`;
}

function enchantPanel(current) {
  const crafting = enchantReturnTab === "craft";
  const craftItem = crafting ? createV39EquipmentEntry(craftRequest.name, craftRequest.rarity) : null;
  const selected = crafting ? craftItem && {item:craftItem, qualityLabel:craftItem.qualityLabel}
    : findInventorySelection(current, getV39EquipmentInventoryView(current).filter(row => row.remainingCount > 0), enchantTargetKey);
  if (!crafting && selected) {
    enchantTargetKey = selected.key;
    selectedInventoryKey = selected.key;
  }
  const state=window.getV39GameState?.({includeWorlds:false});
  const turn = state?.timeline?.turnNumber;
  const options=crafting ? getV39CraftEnchantmentOptions(current,craftRequest,turn)
    : selected ? getV39EnchantmentOptions(current,selected.key,turn) : [];
  const capacity=selected&&getV39EquipmentEnchantCapacityForPlayer(current,selected.item);
  const queuedByFamily=new Map([...plannedEnchantments].map(([family,name])=>[family,options.find(option=>option.name===name)]));
  const queued=[...queuedByFamily.values()];
  const plannedLevel=queued.reduce((total,option)=>total+number(option?.cost.level),0);
  const onlyQueued=capacity?.weapon&&capacity.count+plannedEnchantments.size>=3;
  const families=new Map();
  for(const option of options){
    const family=option.row.付与系統||option.name;
    if(!families.has(family))families.set(family,[]);
    families.get(family).push(option);
  }
  for(const [name,stages] of families){
    if(!stages.some(stage=>stage.maxShortfall<=1)){families.delete(name);continue;}
    stages.sort((a,b)=>a.cost.level-b.cost.level||number(a.row.段階)-number(b.row.段階));
  }
  if(!families.has(selectedEnchantmentFamily)&&!plannedEnchantments.has(selectedEnchantmentFamily)){
    selectedEnchantmentFamily="";
    selectedEnchantmentName=null;
  }
  const family=selectedEnchantmentFamily;
  const settlement=getSelectedSettlement(current?.factionState);
  const craftCost=crafting ? inspectV39EquipmentCraftPlan(current,craftRequest,turn).cost : null;
  const stagesByFamily=new Map([...families].map(([name,entries])=>{
    const currentPlan=queuedByFamily.get(name);
    const otherLevel=plannedLevel-number(currentPlan?.cost.level);
    if(onlyQueued&&!plannedEnchantments.has(name))return [name,[]];
    const otherPlans=queued.filter(entry=>entry&&entry!==currentPlan);
    const materialStockByType={...settlement?.materialStockByType};
    const foodStockByType={...settlement?.foodStockByType};
    const usageByKey=new Map();
    for(const cost of [craftCost,...otherPlans.map(entry=>entry.cost)].filter(Boolean)){
      for(const [resource,amount] of Object.entries(cost.material??{})){
        materialStockByType[resource]=Math.round((number(materialStockByType[resource])-amount)*10)/10;
      }
      for(const [resource,amount] of Object.entries(cost.food??{})){
        foodStockByType[resource]=Math.round((number(foodStockByType[resource])-amount)*10)/10;
      }
    }
    for(const {usage} of otherPlans)usageByKey.set(usage.key,number(usageByKey.get(usage.key))+usage.cost);
    const stages=entries.filter(stage=>capacity?.total==null||capacity.used+otherLevel+stage.cost.level<=capacity.total);
    return [name,stages.map(stage=>{
      const missing=getV39MissingEquipmentResources({materialStockByType,foodStockByType},stage.cost);
      const remaining=Math.max(0,stage.usage.remaining-number(usageByKey.get(stage.usage.key)));
      const reason=stage.reason || [
        missing.length ? `素材不足 ${[...new Set(missing)].join("・")}` : "",
        !crafting&&remaining<stage.usage.cost ? `付与回数不足(${stage.usage.label}): 残り ${remaining}/${stage.usage.max} (必要${stage.usage.cost})` : ""
      ].filter(Boolean).join(" / ");
      return {...stage,reason};
    })];
  }));
  const currentPlan=queuedByFamily.get(family);
  const stages=stagesByFamily.get(family)??[];
  if(selectedEnchantmentName!==""&&!stages.some(stage=>stage.name===selectedEnchantmentName))
    selectedEnchantmentName=stages.find(stage=>stage.name===currentPlan?.name)?.name??stages.find(stage=>!stage.reason)?.name??stages[0]?.name??null;
  const option=stages.find(stage=>stage.name===selectedEnchantmentName);
  const stageIndex=stages.indexOf(option)+1;
  const previewOptions=queued.filter(Boolean).map(entry=>entry===currentPlan&&option?option:entry);
  if(option&&!currentPlan)previewOptions.push(option);
  const preview=selected?previewV39EquipmentEnchantment(selected.item,previewOptions.map(entry=>entry.row)):null;
  if(preview){
    const rows=new Map(getV39EquipmentDisplayStats(selected.item).map(([label,current,suffix=""])=>[
      label,{label,current:Number(current),result:Number(current),suffix}
    ]));
    for(const change of preview.changes)rows.set(change.label,change);
    const stats=[...rows.values()];
    preview.breakdown=stats.filter(({label})=>V39_WEAPON_PHYSICAL_TYPES.includes(label));
    preview.changes=stats.filter(({label})=>!V39_WEAPON_PHYSICAL_TYPES.includes(label));
  }
  const amounts={...craftCost?.material,...craftCost?.food};
  const pointTotals=new Map();
  if(crafting&&craftItem){
    const count=craftCost?.count??Math.min(99,Math.max(1,Math.floor(number(craftRequest.count,1))));
    pointTotals.set("製作",getV39EquipmentProductionPointCost(craftItem,count));
  }
  for(const entry of previewOptions){
    for(const bag of [entry.cost.material,entry.cost.food]){
      for(const [name,amount] of Object.entries(bag))amounts[name]=Math.round((number(amounts[name])+number(amount))*10)/10;
    }
    const {label,cost}=entry.usage;
    pointTotals.set(label,number(pointTotals.get(label))+cost);
  }
  const enchantmentNames = [...plannedEnchantments.values()];
  const check = crafting ? inspectV39EquipmentCraftPlan(current,{...craftRequest,enchantmentNames},turn,{reserve:true})
    : plannedEnchantments.size && applyV39EquipmentEnchantments(state,current?.id,{
      inventoryKey:enchantTargetKey,enchantmentNames
    });
  return renderV39EnhancementScreen({
    choices:[...new Set([...families.keys(),...plannedEnchantments.keys()])].map(name=>{
      const plannedName=plannedEnchantments.get(name);
      const level=options.find(entry=>entry.name===plannedName)?.cost.level;
      const familyStages=stagesByFamily.get(name)??[];
      const unavailable=!familyStages.some(stage=>!stage.reason);
      return {
        id:"inspect-enhancement",attribute:"data-v39-enchant-option",value:name,
        label:name,focused:name===family,planned:Boolean(plannedName),badge:level==null?undefined:`+${level}`,unavailable,
        ariaLabel:[name,plannedName?(level==null?"":"Lv"+level)+" 確定前":"",unavailable?"付与不可":""].filter(Boolean).join(" ")
      };
    }),
    capacity:capacity&&{...capacity,added:plannedLevel},
    applied:capacity?.count?{count:capacity.count,used:capacity.used,entries:capacity.applied}:null,
    emptyText:"この装備に付与できる候補はありません",
    target:selected ? {
      heading:`${getV39EquipmentEnhancementDisplay(selected.item).name}${capacity?.used?" +"+capacity.used:""} [${selected.qualityLabel}]`,
      icon:renderV39EquipmentIcon(selected.item),
      lines:[crafting ? `生成予定 ${check.count ?? craftRequest.count}個` : `在庫 ${selected.remainingCount}`]
    } : {lines:["付与できる在庫がありません"]},
    choice:family ? {
      label:family,
      level:option?.cost.level??0,
      maximumLevel:stages.at(-1)?.cost.level,
      levelIndex:stageIndex,
      stageNames:stages.length?["",...stages.map(stage=>stage.name)]:[],
      warning:option?.reason||(!stages.length?"追加できる付与Lvの余裕がありません。":""),
      action:{id:"add-enhancement",value:option?.name,label:option
        ? (currentPlan ? `${family}を Lv${option.cost.level} に変更` : `${family} Lv${option.cost.level} を追加`)
        : `${family}を${currentPlan?"変更":"追加"}`,
        disabled:!option||Boolean(option.reason)||option.name===currentPlan?.name},
      remove:plannedEnchantments.has(family)?{id:"remove-enhancement",value:family,label:"取り消す"}:null
    } : null,
    preview,
    detailMaterials:pointTotals.size?{amounts,points:[...pointTotals],
      stock:{...settlement?.materialStockByType,...settlement?.foodStockByType}}:null,
    status:statusText||(!check?.ok&&check?.reason),
    statusIsError:!statusText&&!check?.ok,
    actions:[
      {id:"back", attribute:"data-v39-enchant-back", destination:enchantReturnTab, label:"戻る"},
      {id:"apply", attribute:"data-v39-enchant-apply", label:crafting ? "付与を反映" : "付与を確定", disabled:crafting ? !selected : !check?.ok}
    ]
  });
}

function updateCraftCost() {
  const output = document.getElementById("v39-equip-craft-cost");
  if (!output) return;
  craftRequest = {
    name:craftRequest.name,
    rarity:document.getElementById("v39-equip-craft-rarity").value,
    count:document.getElementById("v39-equip-craft-count").value
  };
  const state=window.getV39GameState?.({includeWorlds:false});
  const current=player();
  const check = inspectV39EquipmentCraftPlan(current, {...craftRequest,enchantmentNames:[...craftEnchantments.values()]}, state?.timeline?.turnNumber,{reserve:true});
  const preview = document.getElementById("v39-equip-craft-preview");
  const item = check.item ?? createV39EquipmentEntry(craftRequest.name, craftRequest.rarity);
  preview.innerHTML = item ? itemHeading(item, {preview:true}) + itemDetail(item, check.changes) : '<p class="v39-equip-empty">生成する装備を選択してください</p>';
  let production="";
  if(check.ok&&state){
    const {village,count,enchantmentWork}=check;
    const workRequired=getV39EquipmentProductionPointCost(item,count);
    const order={id:"preview",workOrder:newV39ProductionOrder(village),workRequired,...enchantmentWork};
    const projected={...village,equipmentProductionQueue:[...(village.equipmentProductionQueue||[]),order]};
    const turn=forecastV39ProductionWork(current,projected,state).get(order.id);
    const points=[`製作 ${workRequired}`,enchantmentWork?.magicRequired?`魔術 ${enchantmentWork.magicRequired}`:"",
      enchantmentWork?.faithRequired?`信仰 ${enchantmentWork.faithRequired}`:""].filter(Boolean).join("　");
    production=`<div>${points}${turn?`　完成予定 T${turn}`:""}</div>`;
  }
  output.innerHTML = craftRequest.name
    ? `${check.cost ? renderV39ItemListCost("必要素材", {...check.cost.material, ...check.cost.food}) || "必要素材 なし" : ""}${check.reason ? `<span>${escapeHtml(check.reason)}</span>` : ""}`
      + production
    : "";
  document.getElementById("v39-equip-craft").disabled = !check.ok;
}

function render() {
  const modal = document.getElementById("equipmentModal");
  const body = modal?.querySelector(".modal-body");
  const current = player();
  if (!(body instanceof HTMLElement)) return;
  if (!current) {
    body.innerHTML = '<p class="v39-equip-empty">ゲーム開始後に装備を確認できます。</p>';
    return;
  }
  const tabs = [["inventory", "一覧"], ["unit", "キャラ装備"], ["craft", "生成"]];
  const scrollTop = body.querySelector(".v39-equipment-content")?.scrollTop || 0;
  const listScrollTop = body.querySelector(".v39-equip-list")?.scrollTop || 0;
  const markup = `<nav class="v39-equipment-tabs" aria-label="装備メニュー">${tabs.map(([key, label]) => `<button type="button" aria-pressed="${key === activeTab}" data-v39-equipment-tab="${key}">${label}</button>`).join("")}</nav><div class="v39-equipment-content">${activeTab === "inventory" ? inventoryPanel(current) : activeTab === "unit" ? unitPanel(current) : activeTab === "craft" ? craftPanel() : enchantPanel(current)}</div>${activeTab === "enchant" ? "" : `<output class="v39-equip-status" aria-live="polite">${escapeHtml(statusText)}</output>`}`;
  if (activeTab === "enchant") updateV39RetainedMarkup(body, markup);
  else body.innerHTML = markup;
  body.querySelector(".v39-equipment-content").scrollTop = scrollTop;
  const list = body.querySelector(".v39-equip-list");
  if (list) list.scrollTop = listScrollTop;
  if (activeTab === "craft") updateCraftCost();
}

function commit(result, success) {
  statusText = result?.ok ? success : (text(result?.reason) || "処理に失敗しました");
  if (result?.ok) {
    window.setV39GameState?.({ players:result.state.players }, { reason:"equipment-updated" });
    window.renderV39ResourceTop?.();
  }
  render();
}

function openEnchantment(targetKey, returnTab) {
  plannedEnchantments.clear();
  if (returnTab === "craft") {
    for (const [family,name] of craftEnchantments) plannedEnchantments.set(family,name);
  }
  enchantTargetKey = targetKey;
  enchantReturnTab = returnTab;
  selectedEnchantmentName = null;
  selectedEnchantmentFamily = "";
  activeTab = "enchant";
}

function install() {
  installV39EquipmentHold(unitId => {
    if (!player()?.factionState?.units?.some(unit => unit.id === unitId && unit.hp > 0)) return false;
    const modal = document.getElementById("equipmentModal");
    if (!modal) return false;
    selectedUnitId = unitId;
    activeTab = "unit";
    statusText = "";
    modal.classList.add("open");
    render();
    modal.querySelector("#v39-equip-unit")?.focus({preventScroll:true});
    return true;
  }, (unitId, slot) => openV39EquipmentPicker(unitId, slot));
  document.addEventListener("click", event => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-open="equipment"]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    statusText = "";
    document.getElementById("equipmentModal")?.classList.add("open");
    render();
  }, true);
  document.getElementById("equipmentModal")?.addEventListener("click", event => {
    const element = event.target instanceof Element ? event.target : null;
    if (element?.closest("[data-v39-enchantment-color-open]")) {
      openV39EnchantmentColorSettings({
        onSaved:() => { if (activeTab === "inventory") render(); }
      });
      return;
    }
    const tab = element?.closest("[data-v39-equipment-tab]");
    if (tab) { activeTab = tab.dataset.v39EquipmentTab; statusText = ""; element.closest(".v39-equipment-body").querySelector(".v39-equipment-content").scrollTop = 0; render(); return; }
    const crafting = element?.closest("#v39-equip-craft-enchant");
    if (crafting || element?.closest("[data-v39-enchant-open]")) {
      openEnchantment(crafting ? "" : selectedInventoryKey, crafting ? "craft" : "inventory");
      statusText = "";
      render();
      document.querySelector("#equipmentModal [data-v39-enchant-back]")?.focus();
      return;
    }
    const enchantAction = activeTab === "enchant" ? readV39ItemListAction(element) : null;
    if (enchantAction?.id === "back") {
      activeTab = enchantAction.destination;
      statusText = "";
      render();
      document.querySelector(activeTab === "craft" ? "#v39-equip-craft-enchant" : "#equipmentModal [data-v39-enchant-open]:not(:disabled)")?.focus();
      return;
    }
    if (element?.closest("[data-v39-craft-picker]")) { openCraftItemPicker(); return; }
    const row = element?.closest("[data-v39-equip-item]");
    if (row) { selectedInventoryKey = row.dataset.v39EquipItem; render(); return; }
    const change = element?.closest("[data-v39-equip-change]");
    if (change) {
      openV39EquipmentPicker(selectedUnitId, change.dataset.v39EquipChange, () => {
        statusText = "装備を更新しました";
        render();
      });
      return;
    }
    if (element?.closest("#v39-equip-reroll")) {
      const state = window.getV39GameState?.();
      const current = player();
      const rarity = document.getElementById("v39-equip-reroll-rarity")?.value;
      commit(rerollV39MobEquipment(state, current?.id, { unitId:selectedUnitId, rarity }), "固定装備のレア度を一新しました");
      return;
    }
    if (element?.closest("#v39-equip-craft")) {
      const state = window.getV39GameState?.();
      const result = reserveV39EquipmentCraft(state, player()?.id, {...craftRequest,enchantmentNames:[...craftEnchantments.values()]});
      commit(result, "装備生成を予約しました");
      return;
    }
    if (enchantAction?.id === "inspect-enhancement") {
      if(selectedEnchantmentFamily!==enchantAction.value){
        selectedEnchantmentFamily=enchantAction.value;
        selectedEnchantmentName=null;
        render();
      }
      return;
    }
    if(enchantAction?.id==="add-enhancement"){
      plannedEnchantments.set(selectedEnchantmentFamily,enchantAction.value);
      selectedEnchantmentFamily="";
      selectedEnchantmentName=null;
      statusText="";
      render();return;
    }
    if(enchantAction?.id==="remove-enhancement"){
      plannedEnchantments.delete(enchantAction.value);
      statusText="";
      render();return;
    }
    if (enchantAction?.id === "apply") {
      if (enchantReturnTab === "craft") {
        craftEnchantments = new Map(plannedEnchantments);
        activeTab = "craft";
        statusText = "";
        render();
        document.getElementById("v39-equip-craft-enchant")?.focus();
        return;
      }
      const current = player();
      const result=applyV39EquipmentEnchantments(window.getV39GameState?.(),current?.id,{
        inventoryKey:enchantTargetKey,enchantmentNames:[...plannedEnchantments.values()]
      });
      if(result.ok){
        plannedEnchantments.clear();
        enchantTargetKey=result.inventoryKey;
        selectedInventoryKey=result.inventoryKey;
        selectedEnchantmentFamily="";
        selectedEnchantmentName=null;
      }
      commit(result,"付与を実行しました");
    }
  });
  document.getElementById("equipmentModal")?.addEventListener("change", event => {
    const element = event.target instanceof Element ? event.target : null;
    if (element?.id === "v39-equip-unit") { selectedUnitId = element.value; render(); return; }
    if (element?.closest(".v39-equip-craft")) updateCraftCost();
  });
  document.getElementById("equipmentModal")?.addEventListener("input", event => {
    const input=event.target;
    if(input?.id==="v39-equip-craft-count")updateCraftCost();
    if(activeTab==="enchant"&&input instanceof HTMLInputElement&&input.dataset.enchantmentStages){
      const stages=JSON.parse(input.dataset.enchantmentStages);
      const name=stages[input.valueAsNumber];
      if(name!==undefined&&name!==selectedEnchantmentName){selectedEnchantmentName=name;render();}
    }
  });
  window.addEventListener("v39:game-state-changed", () => {
    if (document.getElementById("equipmentModal")?.classList.contains("open")) render();
  });
  window.renderV39Equipment = render;
  window.craftV39EquipmentForActivePlayer = request => {
    const current = player();
    const result = reserveV39EquipmentCraft(window.getV39GameState?.(), current?.id, request);
    if (result.ok) window.setV39GameState?.({ players:result.state.players }, { reason:"equipment-production-queued" });
    return result;
  };
  window.changeV39ActiveUnitEquipment = request => {
    const current = player();
    const result = changeV39UnitEquipment(window.getV39GameState?.(), current?.id, request);
    if (result.ok) window.setV39GameState?.({ players:result.state.players }, { reason:"equipment-updated" });
    return result;
  };
  window.rerollV39ActiveMobEquipment = request => {
    const current = player();
    const result = rerollV39MobEquipment(window.getV39GameState?.(), current?.id, request);
    if (result.ok) window.setV39GameState?.({ players:result.state.players }, { reason:"equipment-rerolled" });
    return result;
  };
  window.enchantV39EquipmentForActivePlayer = request => {
    const current = player();
    const result = applyV39EquipmentEnchantment(window.getV39GameState?.(), current?.id, request);
    if (result.ok) window.setV39GameState?.({ players:result.state.players }, { reason:"equipment-enchanted" });
    return result;
  };
}

install();
