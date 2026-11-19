<script setup>
import {computed, onBeforeUnmount, onMounted, ref} from "vue";
import {equipmentData} from "../lib/game-data-registry.js";
import weaponsImage from "../../../assets/images/units/1ファイルまとめ/weapons.png";
import armoryImage from "../../../assets/images/units/1ファイルまとめ/armory.png";
import extraImage from "../../../assets/images/units/1ファイルまとめ/武具追加分.webp";

defineProps({show:{type:Boolean,default:false}});
const emit = defineEmits(["close"]);

const sheets = Object.freeze([
  {filename:"weapons.png", label:"武器", columns:10, rows:10, src:weaponsImage},
  {filename:"armory.png", label:"防具・装飾", columns:10, rows:5, src:armoryImage},
  {filename:"武具追加分.webp", label:"追加装備", columns:4, rows:3, src:extraImage}
]);

const currentFilename = ref(sheets[0].filename);
const selectedNumber = ref(1);
const copyStatus = ref("");
const currentSheet = computed(() => sheets.find(sheet => sheet.filename === currentFilename.value) || sheets[0]);
const selectedRow = computed(() => Math.floor((selectedNumber.value - 1) / currentSheet.value.columns) + 1);
const selectedColumn = computed(() => (selectedNumber.value - 1) % currentSheet.value.columns + 1);

// 「装備.json」の割り当て状況。Google Sheets 原本の未変換変更はここに反映されない。
const assignments = new Map();
for (const row of Array.isArray(equipmentData) ? equipmentData : []) {
  const filename = String(row?.画像ファイル || "").trim();
  const number = Number(row?.画像番号);
  const name = String(row?.装備名 || "").trim();
  if (!filename || !Number.isInteger(number) || number < 1 || !name) continue;
  const key = `${filename}:${number}`;
  if (!assignments.has(key)) assignments.set(key, []);
  assignments.get(key).push(name);
}

function mappedNames(number) {
  return assignments.get(`${currentSheet.value.filename}:${number}`) || [];
}

function spriteStyle(number) {
  const {src, columns, rows} = currentSheet.value;
  const x = (number - 1) % columns;
  const y = Math.floor((number - 1) / columns);
  return {
    backgroundImage: `url("${src}")`,
    backgroundSize: `${columns * 100}% ${rows * 100}%`,
    backgroundPosition: `${columns > 1 ? x / (columns - 1) * 100 : 0}% ${rows > 1 ? y / (rows - 1) * 100 : 0}%`
  };
}

function changeSheet(filename) {
  currentFilename.value = filename;
  selectedNumber.value = 1;
  copyStatus.value = "";
}

function selectIcon(number) {
  selectedNumber.value = number;
  copyStatus.value = "";
}

async function copySelection() {
  const text = `${currentSheet.value.filename}\t${selectedNumber.value}`;
  try {
    await navigator.clipboard.writeText(text);
    copyStatus.value = "ファイル名と番号をコピーしました";
  } catch {
    copyStatus.value = "コピーできませんでした。表示されているファイル名と番号を使用してください";
  }
}

function handleKeydown(event) {
  if (event.key === "Escape") emit("close");
}
onMounted(() => window.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="equip-icon-ref-overlay" @click.self="emit('close')">
      <section class="equip-icon-ref-dialog" role="dialog" aria-modal="true" aria-label="装備アイコン番号一覧">
        <header class="equip-icon-ref-header">
          <div>
            <h2>装備アイコン番号一覧</h2>
            <p>左上が1番、右へ順に数えます。アイコンを選ぶとファイル名と番号を確認できます。</p>
          </div>
          <button type="button" class="equip-icon-ref-close" aria-label="閉じる" @click="emit('close')">×</button>
        </header>
        <nav class="equip-icon-ref-tabs" aria-label="画像ファイルの切り替え">
          <button v-for="sheet in sheets" :key="sheet.filename" type="button"
            :aria-pressed="currentFilename === sheet.filename"
            :class="{active:currentFilename === sheet.filename}"
            @click="changeSheet(sheet.filename)">
            {{ sheet.label }} ({{ sheet.columns * sheet.rows }})
          </button>
        </nav>
        <p class="equip-icon-ref-caption">
          {{ currentSheet.filename }} — {{ currentSheet.columns }}列×{{ currentSheet.rows }}行 / 全{{ currentSheet.columns * currentSheet.rows }}件
        </p>
        <div class="equip-icon-ref-scroll">
          <div class="equip-icon-ref-grid">
            <button v-for="number in currentSheet.columns * currentSheet.rows"
              :key="currentSheet.filename + ':' + number"
              type="button" class="equip-icon-ref-cell"
              :class="{selected:selectedNumber === number}"
              :aria-pressed="selectedNumber === number"
              :aria-label="`${currentSheet.filename} ${number}番`"
              @click="selectIcon(number)">
              <span class="equip-icon-ref-pixel" :style="spriteStyle(number)" aria-hidden="true"></span>
              <strong>№ {{ number }}</strong>
              <small v-if="mappedNames(number).length" :title="mappedNames(number).join('・')">{{ mappedNames(number).join('・') }}</small>
            </button>
          </div>
        </div>
        <footer class="equip-icon-ref-footer">
          <div class="equip-icon-ref-selection">
            <b>選択中：{{ currentSheet.filename }} / {{ selectedNumber }}番</b>
            <span>位置：{{ selectedRow }}行・{{ selectedColumn }}列</span>
            <small>装備名はGitHubの生成JSONにある現在の割り当てです。変更先は @game_data の「装備」シートです。</small>
            <small v-if="copyStatus" role="status">{{ copyStatus }}</small>
          </div>
          <button type="button" class="equip-icon-ref-copy" @click="copySelection">ファイル名と番号をコピー</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.equip-icon-ref-overlay {
  position:fixed; inset:0; z-index:2300; padding:clamp(8px,2vw,22px);
  background:rgba(0,0,0,.82); color:#eee8d8;
  display:grid; place-items:center;
}
.equip-icon-ref-dialog {
  width:min(1100px,100%); max-height:100%; min-height:0;
  display:flex; flex-direction:column;
  border:1px solid #a98a57; border-radius:12px;
  background:#161a1d; box-shadow:0 16px 50px rgba(0,0,0,.65);
  font: 15px/1.45 "Noto Sans JP","Yu Gothic",sans-serif;
}
.equip-icon-ref-header {
  display:flex; justify-content:space-between; gap:14px;
  padding:14px 16px 8px; align-items:flex-start;
}
.equip-icon-ref-header h2 {margin:0 0 4px;font-size:20px;color:#f5d89b;}
.equip-icon-ref-header p {margin:0;color:#b6c0c2;font-size:13px;}
.equip-icon-ref-close {
  flex:none; border:1px solid #8a785d; border-radius:6px;
  background:#33291c; color:white; width:38px;height:38px;font-size:25px;cursor:pointer;
}
.equip-icon-ref-tabs {display:flex;flex-wrap:wrap;gap:6px;padding:6px 16px;}
.equip-icon-ref-tabs button {
  padding:8px 13px;border:1px solid #55626a;border-radius:7px;
  background:#20282d;color:#e8e8e8;cursor:pointer;
}
.equip-icon-ref-tabs button.active {background:#63512f;border-color:#dfbf7c;color:white;font-weight:700;}
.equip-icon-ref-caption {margin:0;padding:4px 16px 8px;color:#aab5b9;font-size:13px;}
.equip-icon-ref-scroll {min-height:0;overflow:auto;flex:1;padding:4px 16px 16px;overscroll-behavior:contain;}
.equip-icon-ref-grid {display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px;}
.equip-icon-ref-cell {
  min-width:0;min-height:112px;border:1px solid #49545c;border-radius:8px;
  background:#242a2f;color:#f4e9d8;cursor:pointer;padding:6px 4px;
  display:flex;flex-direction:column;gap:2px;align-items:center;
}
.equip-icon-ref-cell.selected {outline:2px solid #e9bb68;outline-offset:-2px;background:#3b3225;}
.equip-icon-ref-cell:focus-visible,.equip-icon-ref-copy:focus-visible,.equip-icon-ref-tabs button:focus-visible {
  outline:2px solid #f3d190;outline-offset:2px;
}
.equip-icon-ref-pixel {
  display:block;width:70px;height:70px;flex:none;
  background-repeat:no-repeat;image-rendering:pixelated;
  background-color:#323c42;
  border:1px solid #434b4d;border-radius:4px;
}
.equip-icon-ref-cell strong {font-size:13px;line-height:1.2;}
.equip-icon-ref-cell small {
  display:block;max-width:100%;font-size:10px;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;color:#c2bdaf;
}
.equip-icon-ref-footer {
  display:flex;align-items:center;justify-content:space-between;gap:14px;
  padding:12px 16px;border-top:1px solid #485258;background:#202427;
}
.equip-icon-ref-selection {display:flex;flex-direction:column;gap:3px;min-width:0;}
.equip-icon-ref-selection b {overflow-wrap:anywhere;color:#f6d89b;}
.equip-icon-ref-selection span {font-size:13px;}
.equip-icon-ref-selection small {font-size:11px;color:#b5b7b9;}
.equip-icon-ref-copy {
  flex:none;min-height:38px;padding:8px 12px;
  border:1px solid #ba965b;border-radius:6px;background:#594127;color:#f7e9c8;cursor:pointer;
}
@media(max-width:600px){
  .equip-icon-ref-header {padding:10px 10px 6px;}
  .equip-icon-ref-header h2 {font-size:17px;}
  .equip-icon-ref-tabs,.equip-icon-ref-caption {padding-left:10px;padding-right:10px;}
  .equip-icon-ref-scroll {padding:4px 10px 10px;}
  .equip-icon-ref-grid {grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:6px;}
  .equip-icon-ref-pixel {width:60px;height:60px;}
  .equip-icon-ref-cell {min-height:101px;}
  .equip-icon-ref-footer {padding:10px;flex-direction:column;align-items:stretch;}
}
</style>
