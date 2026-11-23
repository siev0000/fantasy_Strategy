<script setup>
import {computed, nextTick, onBeforeUnmount, onMounted, ref} from "vue";
import {getGameDataRows} from "../lib/game-data-registry.js";
import {V39_SCREEN_ICON_TYPE, V39_SCREEN_ICON_ROWS} from "../v39/ui/v39-screen-icons.js";
import {getV39ResourceIconRows} from "../lib/v39-resource-icon-rows.js";
import {V39_TEXT_ICON_CANDIDATES} from "../lib/v39-text-icon-candidates.js";
import {V39_RESOURCE_ICON_DEFS, V39_SPECIAL_RESOURCE_ICON_CANDIDATES, V39_UI_ICON_CANDIDATES} from "../lib/resource-icon-glyphs.js";
import {V39_EQUIPMENT_ICON_SHEETS as sheets, resolveV39EquipmentIconSheet} from "../lib/v39-equipment-icon-sheets.js";
import {normalizeV39IconColor, resolveV39IconAssignment, resolveV39IconColorFilter, resolveV39IconSpriteStyle} from "../lib/v39-icon-assignment.js";

import {defaultIconRows, loadV39SharedIconSettings, saveV39SharedIconSettings, iconStorageKey, saveBrowserIconSettings} from "../lib/v39-shared-icon-settings.js";

defineProps({show:{type:Boolean,default:false}});
const emit = defineEmits(["close"]);


const types = [
  {label:"装備", key:"装備名", rows:getGameDataRows("装備")},
  {label:"資源・資材", key:"データ分類", rows:getV39ResourceIconRows()},
  {label:"道具", key:"名前", rows:getGameDataRows("道具")},
  {label:V39_SCREEN_ICON_TYPE, key:"名前", rows:V39_SCREEN_ICON_ROWS}
];
for (const type of types) {
  type.targets = new Map(type.rows.map(row => [String(row[type.key] ?? "").trim(), row]).filter(([name]) => name));
}
const targetKey = (type, name) => JSON.stringify([type.label, name]);
const glyphs = new Map([
  ...Object.entries({"盾":"🛡","弓":"🏹","斧":"🪓","槌":"🔨","篭手":"🥊","剣":"🗡","兜":"⛑","服":"🥋","靴":"👢","装飾":"💍","道具":"⚒"}),
  ...Object.entries(V39_UI_ICON_CANDIDATES),
  ...Object.entries({...V39_RESOURCE_ICON_DEFS,...V39_SPECIAL_RESOURCE_ICON_CANDIDATES}).map(([label,icon]) => [label, icon.glyph])
].map(([label,glyph]) => [glyph, label]));
for (const [glyph,label] of V39_TEXT_ICON_CANDIDATES) {
  if (!glyphs.has(glyph)) glyphs.set(glyph,label);
}
const glyphTab = "glyph";
const paletteGroups = [
  {id:"equipment", label:"武具"},
  {id:"music", label:"楽器・音楽"},
  {id:"supplies", label:"道具・資材"},
  {id:"terrain", label:"地形"},
  ...(sheets.some(sheet => sheet.group === "individual") ? [{id:"individual", label:"個別画像"}] : []),
  {id:glyphTab, label:"文字アイコン"}
];
const typeLabel = ref(types[0].label);
const selectedName = ref("");
const filename = ref(sheets[0].filename);
const candidate = ref({filename:filename.value, number:sheets[0].firstNumber});
const status = ref("");
const scroll = ref(null);
const reading = ref(false);
const sharedRevision = ref(undefined);
const loadingShared = ref(true);
const savingShared = ref(false);
let unlistedRows = [];
const sourceAssignments = new Map(types.flatMap(type => [...type.targets].flatMap(([name,row]) => {
  const icon = resolveV39IconAssignment(row);
  return icon ? [[targetKey(type,name), icon]] : [];
})));
const assignments = ref(new Map(sourceAssignments));

const type = computed(() => types.find(entry => entry.label === typeLabel.value));
const currentKey = computed(() => selectedName.value ? targetKey(type.value, selectedName.value) : "");
const assigned = computed(() => assignments.value.get(currentKey.value));
const targetItems = computed(() => [...type.value.targets.keys()].map(name => {
  const icon = assignments.value.get(targetKey(type.value, name));
  return {
    name,
    glyph:icon?.glyph,
    style:{
      ...(icon?.filename ? resolveV39IconSpriteStyle(resolveV39EquipmentIconSheet(icon.filename), icon.number) : {}),
      filter:resolveV39IconColorFilter(icon)
    }
  };
}));
const currentSheet = computed(() => resolveV39EquipmentIconSheet(filename.value));
const paletteGroup = computed(() => currentSheet.value?.group ?? glyphTab);
const groupSheets = computed(() => sheets.filter(sheet => sheet.group === paletteGroup.value));
const numbers = computed(() => currentSheet.value
  ? Array.from({length:(currentSheet.value.lastNumber ?? currentSheet.value.columns * currentSheet.value.rows) - currentSheet.value.firstNumber + 1},
    (_, index) => currentSheet.value.firstNumber + index).filter(number => !currentSheet.value.excludedNumbers?.includes(number))
  : []);
const describe = icon => icon?.glyph || (icon ? `${icon.filename} / ${icon.number}番` : "未指定");
const usersByIcon = computed(() => {
  const users = new Map();
  for (const name of type.value.targets.keys()) {
    const icon = assignments.value.get(targetKey(type.value, name));
    if (!icon) continue;
    const key = describe(icon);
    if (!users.has(key)) users.set(key, []);
    users.get(key).push(name);
  }
  return users;
});

function changeType() {
  selectedName.value = "";
  status.value = "";
}

function selectCandidate(icon) {
  candidate.value = icon;
  status.value = "";
}

function changePalette(value) {
  filename.value = value;
  selectCandidate(value === glyphTab ? {glyph:glyphs.keys().next().value}
    : {filename:value, number:currentSheet.value.firstNumber});
  if (scroll.value) scroll.value.scrollTop = 0;
}

function changePaletteGroup(group) {
  if (group === paletteGroup.value) return;
  changePalette(group === glyphTab ? glyphTab : sheets.find(sheet => sheet.group === group).filename);
}

function selectTarget(name) {
  selectedName.value = name;
  void showAssignment();
}

async function showAssignment() {
  status.value = "";
  const icon = assigned.value;
  if (!icon) return;
  filename.value = icon.glyph ? glyphTab : icon.filename;
  selectCandidate(icon);
  await nextTick();
  scroll.value?.querySelector(".equip-icon-ref-cell.selected")?.scrollIntoView({block:"nearest"});
}

function assignIcon() {
  if (!currentKey.value) return;
  const color = assigned.value?.color;
  const {glyph, filename, number} = candidate.value;
  const icon = glyph ? {glyph} : {filename, number};
  assignments.value.set(currentKey.value, {...icon, ...(color ? {color} : {})});
  status.value = `${selectedName.value}に割り当てました`;
}

function setIconColor(value) {
  const color = normalizeV39IconColor(value);
  if (assigned.value && color) {
    assignments.value.set(currentKey.value, {...assigned.value, color});
    status.value = "";
  }
}

function resetIconColor() {
  if (!assigned.value?.color) return;
  const icon = {...assigned.value};
  delete icon.color;
  assignments.value.set(currentKey.value, icon);
  status.value = "";
}

function removeIcon() {
  if (!assignments.value.delete(currentKey.value)) return;
  status.value = `${selectedName.value}の割り当てを外しました`;
}

function makeIconRow(type, name, icon) {
  return {種別:type.label, [type.key]:name, 画像ファイル:icon?.filename ?? "", 画像番号:icon?.number ?? null,
    ...(icon?.glyph ? {文字アイコン:icon.glyph} : {}),
    ...(icon?.color ? {アイコン色:icon.color} : {})};
}

function exportRows({overridesOnly = false} = {}) {
  return types.flatMap(type => [...type.targets.keys()].flatMap(name => {
    const key = targetKey(type, name);
    const row = makeIconRow(type, name, assignments.value.get(key));
    const original = makeIconRow(type, name, sourceAssignments.get(key));
    if (overridesOnly && JSON.stringify(row) === JSON.stringify(original)) return [];
    return [row];
  }));
}

function applyIconSettings(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("アイコン設定のJSONを選んでください");
  const next = new Map(assignments.value);
  const updated = new Set();
  let skipped = 0;
  for (const [i,row] of rows.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`${i + 1}件目の形式が不正です`);
    const type = types.find(entry => row.種別 === entry.label || (!row.種別 && Object.hasOwn(row, entry.key)));
    const name = type && typeof row[type.key] === "string" ? row[type.key].trim() : "";
    if (!type || !name) throw new Error(`${i + 1}件目の種別か名前が不正です`);
    if (!type.targets.has(name)) { skipped += 1; continue; }
    const key = targetKey(type,name);
    if (updated.has(key)) throw new Error(`${name}の設定が重複しています`);
    const icon = resolveV39IconAssignment(row);
    if (!icon && (row.画像ファイル || (row.画像番号 ?? "") !== "" || row.文字アイコン)) {
      throw new Error(`${name}のアイコン指定が不正です`);
    }
    if (icon?.glyph && Array.from(icon.glyph).length > 16) throw new Error(`${name}の文字アイコンが長すぎます`);
    if (row.アイコン色 != null && row.アイコン色 !== "" && (!icon || !normalizeV39IconColor(row.アイコン色))) {
      throw new Error(`${name}のアイコン色が不正です`);
    }
    if (icon) next.set(key,icon);
    else next.delete(key);
    updated.add(key);
  }
  if (!updated.size) throw new Error("現在の一覧に一致する項目がありません");
  assignments.value = next;
  return `${updated.size}件${skipped ? `（一覧にない${skipped}件を除く）` : ""}`;
}

async function saveSettings() {
  if (loadingShared.value || savingShared.value) return;
  if (sharedRevision.value !== undefined) {
    savingShared.value = true;
    try {
      const rows = [...exportRows({overridesOnly:true}), ...unlistedRows];
      const saved = await saveV39SharedIconSettings(sharedRevision.value, rows);
      sharedRevision.value = saved.revision;
      status.value = "共有JSONに保存しました。他の端末では再読み込みで反映されます";
    } catch (error) {
      status.value = error.message || "共有JSONに保存できませんでした";
    } finally {
      savingShared.value = false;
    }
    return;
  }
  try {
    saveBrowserIconSettings(exportRows());
    status.value = "このブラウザーに保存しました";
  } catch {
    status.value = "ブラウザーに保存できませんでした。JSON出力を使ってください";
  }
}

async function readJson(event) {
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;
  reading.value = true;
  try {
    const count = applyIconSettings(JSON.parse(await file.text()));
    await showAssignment();
    status.value = `${count}を読み込みました`;
  } catch (error) {
    status.value = `読み込めませんでした。 ${error.message}`;
  } finally {
    input.value = "";
    reading.value = false;
  }
}

function exportIconSettings() {
  const rows = exportRows();
  const blob = new Blob([`${JSON.stringify(rows, null, 2)}\n`], {type:"application/json;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "アイコン設定.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  status.value = `${rows.length}件のアイコン設定を出力しました`;
}

async function copySelection() {
  const {glyph, filename, number} = candidate.value;
  try {
    await navigator.clipboard.writeText(glyph || `${filename}\t${number}`);
    status.value = "選択中のアイコン指定をコピーしました";
  } catch {
    status.value = "コピーできませんでした";
  }
}

function handleKeydown(event) {
  if (event.key === "Escape") emit("close");
}

onMounted(async () => {
  window.addEventListener("keydown", handleKeydown);
  try {
    const shared = await loadV39SharedIconSettings();
    if (shared) {
      sharedRevision.value = shared.revision;
      if (shared.revision !== null) {
        const listedRows = shared.rows.filter(row => {
          const type = types.find(entry => row.種別 === entry.label);
          return type?.targets.has(String(row[type.key]).trim());
        });
        unlistedRows = shared.rows.filter(row => !listedRows.includes(row));
        if (listedRows.length) applyIconSettings(listedRows);
        status.value = "共有JSONを読み込みました";
        return;
      }
    }
    const saved = localStorage.getItem(iconStorageKey);
    if (saved) {
      const count = applyIconSettings(JSON.parse(saved));
      status.value = shared ? `このブラウザーの下書き${count}を復元しました。共有するには保存してください`
        : `保存済みの${count}を復元しました`;
    } else if (defaultIconRows.length) {
      applyIconSettings(defaultIconRows);
    }
  } catch (error) {
    status.value = error.message || "アイコン設定を復元できませんでした";
  } finally {
    loadingShared.value = false;
  }
});
onBeforeUnmount(() => window.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="equip-icon-ref-overlay" @click.self="emit('close')">
      <section class="equip-icon-ref-dialog" role="dialog" aria-modal="true" aria-label="アイコン設定">
        <header class="equip-icon-ref-header">
          <div class="equip-icon-ref-title">
            <h2>アイコン設定</h2>
            <details class="equip-icon-ref-settings">
              <summary class="equip-icon-ref-button" aria-label="設定" title="設定">⚙</summary>
              <div class="equip-icon-ref-settings-menu">
                <button class="equip-icon-ref-button" type="button" :disabled="loadingShared || savingShared || reading" @click="saveSettings">{{ sharedRevision !== undefined ? "共有JSONに保存" : "このブラウザーに保存" }}</button>
                <label class="equip-icon-ref-button equip-icon-ref-import">
                  JSON読み込み
                  <input type="file" accept=".json,application/json" :disabled="reading || loadingShared || savingShared" @change="readJson">
                </label>
                <button class="equip-icon-ref-button" type="button" @click="exportIconSettings">JSON出力</button>
              </div>
            </details>
            <button class="equip-icon-ref-button" type="button" aria-label="閉じる" @click="emit('close')">×</button>
          </div>
          <div class="equip-icon-ref-target">
            <select v-model="typeLabel" aria-label="設定する種別" @change="changeType">
              <option v-for="entry in types" :key="entry.label">{{ entry.label }}</option>
            </select>
          </div>
        </header>

        <div class="equip-icon-ref-editor">
          <section :key="typeLabel" class="equip-icon-ref-items" :aria-label="`${typeLabel}の項目`">
            <button v-for="{name, glyph, style} in targetItems" :key="name" type="button" class="equip-icon-ref-item"
              :aria-pressed="selectedName === name" @click="selectTarget(name)">
              <span class="equip-icon-ref-thumbnail" aria-hidden="true">
                <span class="equip-icon-ref-thumbnail-icon" :style="style">{{ glyph }}</span>
              </span>
              <span>{{ name }}</span>
            </button>
          </section>
          <section class="equip-icon-ref-palette" aria-label="アイコン一覧">
            <div class="equip-icon-ref-palette-controls">
              <select :value="paletteGroup" aria-label="アイコン候補の分類" @change="changePaletteGroup($event.target.value)">
                <option v-for="group in paletteGroups" :key="group.id" :value="group.id">{{ group.label }}</option>
              </select>
              <select v-if="groupSheets.length > 1 && paletteGroup !== 'individual'" :value="filename" aria-label="候補画像シート"
                @change="changePalette($event.target.value)">
                <option v-for="sheet in groupSheets" :key="sheet.filename" :value="sheet.filename">{{ sheet.label }}</option>
              </select>
            </div>
            <p v-if="currentSheet && paletteGroup !== 'individual'" class="equip-icon-ref-caption">{{ currentSheet.filename }} / {{ currentSheet.firstNumber }}〜{{ currentSheet.lastNumber ?? currentSheet.columns * currentSheet.rows }}番</p>
            <div ref="scroll" class="equip-icon-ref-scroll">
              <div v-if="paletteGroup === 'individual'" class="equip-icon-ref-grid">
                <button v-for="sheet in groupSheets" :key="sheet.filename" type="button" class="equip-icon-ref-cell"
                  :class="{selected:candidate.filename === sheet.filename}" :aria-pressed="candidate.filename === sheet.filename"
                  @click="selectCandidate({filename:sheet.filename,number:1})">
                  <span class="equip-icon-ref-pixel" :style="resolveV39IconSpriteStyle(sheet,1)" aria-hidden="true"></span>
                  <strong>{{ sheet.label }}</strong>
                  <small v-if="usersByIcon.has(describe({filename:sheet.filename,number:1}))">{{ usersByIcon.get(describe({filename:sheet.filename,number:1})).join("・") }}</small>
                </button>
              </div>
              <div v-else-if="currentSheet" class="equip-icon-ref-grid">
                <button v-for="number in numbers" :key="`${filename}:${number}`" type="button" class="equip-icon-ref-cell"
                  :class="{selected:candidate.number === number}" :aria-pressed="candidate.number === number"
                  :aria-label="`${filename} ${number}番`" @click="selectCandidate({filename,number})">
                  <span class="equip-icon-ref-pixel" :style="resolveV39IconSpriteStyle(currentSheet,number)" aria-hidden="true"></span>
                  <strong>{{ currentSheet.labels?.[number] ?? `№ ${number}` }}</strong>
                  <small v-if="usersByIcon.has(describe({filename,number}))">{{ usersByIcon.get(describe({filename,number})).join("・") }}</small>
                </button>
              </div>
              <div v-else class="equip-icon-ref-grid">
                <button v-for="[glyph,label] in glyphs" :key="glyph" type="button" class="equip-icon-ref-cell"
                  :class="{selected:candidate.glyph === glyph}" :aria-pressed="candidate.glyph === glyph"
                  :aria-label="`${label} ${glyph}`" @click="selectCandidate({glyph})">
                  <span class="equip-icon-ref-pixel equip-icon-ref-glyph" aria-hidden="true">{{ glyph }}</span>
                  <strong>{{ label }}</strong>
                  <small v-if="usersByIcon.has(glyph)">{{ usersByIcon.get(glyph).join("・") }}</small>
                </button>
              </div>
            </div>
          </section>
        </div>

        <footer class="equip-icon-ref-footer">
          <div class="equip-icon-ref-selection">
            <b>{{ selectedName || "項目を選択" }}</b>
            <span>現在 {{ describe(assigned) }} → 候補 {{ describe(candidate) }}</span>
            <div class="equip-icon-ref-color">
              <label>
                色変更
                <input type="color" aria-label="アイコンの色" :disabled="!assigned || loadingShared || savingShared" :value="assigned?.color || '#ffffff'"
                  @input="setIconColor($event.target.value)">
              </label>
              <button class="equip-icon-ref-button" type="button" :disabled="!assigned?.color || loadingShared || savingShared" @click="resetIconColor">元の色に戻す</button>
            </div>
            <small v-if="status" role="status">{{ status }}</small>
          </div>
          <div class="equip-icon-ref-actions">
            <button class="equip-icon-ref-button" type="button" @click="copySelection">コピー</button>
            <button class="equip-icon-ref-button" type="button" :disabled="!assigned || loadingShared || savingShared" @click="removeIcon">外す</button>
            <button class="equip-icon-ref-button" type="button" :disabled="!selectedName || loadingShared || savingShared" @click="assignIcon">割り当て</button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.equip-icon-ref-overlay {
  position:fixed; inset:0; z-index:2300; padding:clamp(8px,2vw,22px);
  background:rgba(0,0,0,.82); color:#eee8d8; display:grid; place-items:center;
}
.equip-icon-ref-dialog {
  width:min(1100px,100%); height:min(820px,100%); min-height:0;
  display:flex; flex-direction:column;
  border:1px solid #a98a57; border-radius:12px;
  background:#161a1d; box-shadow:0 16px 50px rgba(0,0,0,.65);
  font:15px/1.45 "Noto Sans JP","Yu Gothic",sans-serif;
}
.equip-icon-ref-header {
  display:grid; gap:7px; min-width:0; padding:10px 12px 0;
}
.equip-icon-ref-title {
  display:grid; grid-template-columns:minmax(0,1fr) auto auto; gap:6px; align-items:center;
}
.equip-icon-ref-title h2 {margin:0;font-size:20px;color:#f5d89b;}
.equip-icon-ref-target select { max-width:100%; }
.equip-icon-ref-target select,
.equip-icon-ref-palette-controls select {
  min-width:0; min-height:34px; padding:4px 6px;
  border:1px solid #55626a; border-radius:6px; background:#20282d; color:#eee8d8;
}
.equip-icon-ref-editor {
  display:grid; grid-template-columns:minmax(145px,25%) minmax(0,1fr);
  flex:1; min-height:0; margin-top:6px;
}
.equip-icon-ref-items {
  min-width:0; min-height:0; overflow:auto; overscroll-behavior:contain;
  border-right:1px solid #485258; padding:0 7px 7px;
}
.equip-icon-ref-item {
  display:grid; grid-template-columns:32px minmax(0,1fr); align-items:center; gap:6px;
  width:100%; min-height:42px; margin-bottom:4px; padding:4px;
  border:1px solid #49545c; border-radius:6px;
  background:#242a2f; color:#f4e9d8; text-align:left; overflow-wrap:anywhere; cursor:pointer;
}
.equip-icon-ref-item[aria-pressed="true"] {border-color:#e9bb68;background:#3b3225;}
.equip-icon-ref-palette {display:flex;flex-direction:column;min-width:0;min-height:0;}
.equip-icon-ref-thumbnail {
  display:grid; place-items:center; width:32px; height:32px;
  border-radius:4px; background-color:#323c42; font-size:22px;
}
.equip-icon-ref-thumbnail-icon {
  display:grid; place-items:center; width:100%; height:100%;
  background-repeat:no-repeat; image-rendering:pixelated;
}
.equip-icon-ref-button {
  min-height:34px; padding:4px 9px;
  border:1px solid #55626a; border-radius:6px;
  background:#20282d; color:#eee8d8; cursor:pointer;
}
.equip-icon-ref-button[aria-pressed="true"] {background:#63512f;border-color:#dfbf7c;color:white;}
.equip-icon-ref-button:disabled {opacity:.5;cursor:default;}
.equip-icon-ref-settings {position:relative;}
.equip-icon-ref-settings summary {list-style:none;}
.equip-icon-ref-settings summary::-webkit-details-marker {display:none;}
.equip-icon-ref-settings-menu {
  position:absolute; z-index:1; inset:calc(100% + 5px) 0 auto auto;
  display:grid; gap:5px; width:max-content; padding:6px;
  border:1px solid #827356; border-radius:8px; background:#20282d;
}
.equip-icon-ref-import {position:relative; display:grid; place-items:center;}
.equip-icon-ref-import input {position:absolute; inset:0; opacity:0; width:100%; cursor:pointer;}
.equip-icon-ref-import:focus-within,.equip-icon-ref-button:focus-visible,.equip-icon-ref-item:focus-visible,.equip-icon-ref-cell:focus-visible {
  outline:2px solid #f3d190; outline-offset:2px;
}
.equip-icon-ref-palette-controls {
  display:grid; grid-template-columns:minmax(0,10rem) minmax(0,13rem);
  gap:6px; flex-shrink:0; padding:2px 10px 5px;
}
.equip-icon-ref-palette-controls select {font:inherit;color-scheme:dark;text-overflow:ellipsis;}
.equip-icon-ref-caption {margin:0;padding:4px 12px;color:#aab5b9;font-size:13px;}
.equip-icon-ref-scroll {min-height:0;overflow:auto;flex:1;padding:4px 12px 12px;overscroll-behavior:contain;}
.equip-icon-ref-grid {display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px;}
.equip-icon-ref-cell {
  min-width:0; min-height:100px; border:1px solid #49545c; border-radius:8px;
  background:#242a2f; color:#f4e9d8; cursor:pointer; padding:6px 4px;
  display:flex; flex-direction:column; gap:2px; align-items:center;
}
.equip-icon-ref-cell.selected {outline:2px solid #e9bb68;outline-offset:-2px;background:#3b3225;}
.equip-icon-ref-pixel {
  display:grid; place-items:center; width:64px; height:64px; flex:none;
  background-repeat:no-repeat; image-rendering:pixelated;
  background-color:#323c42; border-radius:4px;
}
.equip-icon-ref-glyph {font-size:32px;}
.equip-icon-ref-cell strong {font-size:13px;line-height:1.2;}
.equip-icon-ref-cell small {
  max-width:100%; font-size:11px; white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis; color:#c2bdaf;
}
.equip-icon-ref-footer {
  display:flex; align-items:center; justify-content:space-between; gap:8px;
  padding:8px 12px; border-top:1px solid #485258; background:#202427;
}
.equip-icon-ref-selection {display:flex;flex-direction:column;gap:2px;min-width:0;overflow-wrap:anywhere;}
.equip-icon-ref-selection b {color:#f6d89b;}
.equip-icon-ref-selection span,.equip-icon-ref-selection small {font-size:13px;}
.equip-icon-ref-actions {display:flex; flex-wrap:wrap; gap:6px;}
.equip-icon-ref-color,.equip-icon-ref-color label {display:flex; align-items:center; gap:6px;}
.equip-icon-ref-color {flex-wrap:wrap; margin-top:3px;}
.equip-icon-ref-color input {width:40px; height:34px; padding:2px; background:#20282d; border:1px solid #55626a; border-radius:6px;}
.equip-icon-ref-color input:disabled {opacity:.5;}
.equip-icon-ref-color input:focus-visible {outline:2px solid #f3d190; outline-offset:2px;}
@media(max-width:600px){
  .equip-icon-ref-editor {grid-template-columns:minmax(103px,34%) minmax(0,1fr);}
  .equip-icon-ref-title h2 {font-size:17px;}
  .equip-icon-ref-grid {grid-template-columns:repeat(auto-fill,minmax(68px,1fr));gap:5px;}
  .equip-icon-ref-pixel {width:56px;height:56px;}
  .equip-icon-ref-cell {min-height:88px;}
  .equip-icon-ref-footer {flex-direction:column;align-items:stretch;}
}
</style>
