<script setup>
import { computed, ref } from "vue";
import SkillAcquiredTable from "./SkillAcquiredTable.vue";

const props = defineProps({
  statusRows: { type:Array, default:() => [] },
  skillRows: { type:Array, default:() => [] },
  resistanceRows: { type:Array, default:() => [] },
  skillNames: { type:Array, default:() => [] },
  statusSource: { type:Object, default:null },
  activeTab: { type:String, default:"status" },
  skillTitle: { type:String, default:"スキル" }
});

const emit = defineEmits(["update:activeTab"]);

const collapsedSections = ref({
  status:false,
  skills:false,
  resistances:false
});

const normalizedTab = computed(() => {
  if (props.activeTab === "abilities") return "abilities";
  return "status";
});

const flatStatusRows = computed(() => (
  (Array.isArray(props.statusRows) ? props.statusRows : [])
    .flatMap(row => Array.isArray(row?.fields) ? row.fields : [])
));

function setTab(tab) {
  if (!["status", "abilities"].includes(tab)) return;
  emit("update:activeTab", tab);
}

function toggleSection(key) {
  if (!Object.prototype.hasOwnProperty.call(collapsedSections.value, key)) return;
  collapsedSections.value = {
    ...collapsedSections.value,
    [key]:!collapsedSections.value[key]
  };
}

function signedValue(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  const rounded = Math.round(num);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}
</script>

<template>
  <section class="selection-detail-panel">
    <nav class="detail-tabs operation-detail-tabs" role="tablist" aria-label="選択詳細">
      <button type="button" role="tab" :aria-selected="normalizedTab === 'status'" :class="{ active: normalizedTab === 'status' }" @click="setTab('status')">ステータス技能</button>
      <button type="button" role="tab" :aria-selected="normalizedTab === 'abilities'" :class="{ active: normalizedTab === 'abilities' }" @click="setTab('abilities')">スキル</button>
    </nav>

    <div class="operation-detail-content">
      <section v-if="normalizedTab === 'status'" class="operation-detail-panel" role="tabpanel">
        <section class="operation-detail-section">
          <button
            type="button"
            class="operation-detail-section-title"
            :aria-expanded="!collapsedSections.status"
            @click="toggleSection('status')"
          >
            <span>ステータス</span>
            <span class="operation-section-toggle">{{ collapsedSections.status ? "▸" : "▾" }}</span>
          </button>
          <div v-if="!collapsedSections.status" class="operation-detail-section-body">
            <div class="operation-status-grid">
              <div v-for="item in flatStatusRows" :key="item.key" class="operation-detail-stat">
                <span>{{ item.key }}</span>
                <b>{{ item.value ?? "-" }}</b>
              </div>
            </div>
          </div>
        </section>

        <section class="operation-detail-section">
          <button
            type="button"
            class="operation-detail-section-title"
            :aria-expanded="!collapsedSections.skills"
            @click="toggleSection('skills')"
          >
            <span>技能</span>
            <span class="operation-section-toggle">{{ collapsedSections.skills ? "▸" : "▾" }}</span>
          </button>
          <div v-if="!collapsedSections.skills" class="operation-detail-section-body">
            <div
              v-if="skillRows.length"
              class="operation-proficiency-grid"
              style="display:grid !important;grid-template-columns:repeat(2,minmax(0,1fr)) !important;"
            >
              <div
                v-for="item in skillRows"
                :key="item.key"
                class="operation-proficiency-item"
                style="grid-column:auto !important;width:auto !important;"
                :title="item.desc || `${item.label}: 詳細なし`"
              >
                <span>{{ item.label }}</span>
                <b>{{ item.value }}</b>
              </div>
            </div>
            <div v-else class="operation-empty">技能データなし</div>
          </div>
        </section>

        <section class="operation-detail-section">
          <button
            type="button"
            class="operation-detail-section-title"
            :aria-expanded="!collapsedSections.resistances"
            @click="toggleSection('resistances')"
          >
            <span>耐性</span>
            <span class="operation-section-toggle">{{ collapsedSections.resistances ? "▸" : "▾" }}</span>
          </button>
          <div v-if="!collapsedSections.resistances" class="operation-detail-section-body">
            <div v-if="resistanceRows.length" class="operation-resistance-grid">
              <div v-for="item in resistanceRows" :key="item.key" class="operation-resistance-item">
                <span>{{ item.key }}</span>
                <b>{{ signedValue(item.value) }}</b>
              </div>
            </div>
            <div v-else class="operation-empty">耐性補正なし</div>
          </div>
        </section>
      </section>

      <section v-else class="operation-detail-panel" role="tabpanel">
        <section class="operation-detail-section">
          <header class="operation-detail-section-title">{{ skillTitle }}</header>
          <div class="operation-detail-section-body">
            <skill-acquired-table
              :skill-names="skillNames"
              :status-source="statusSource"
              :show-title="false"
              empty-text="取得スキルなし"
              variant="operation"
            />
          </div>
        </section>
      </section>
    </div>
  </section>
</template>

<style scoped>
.selection-detail-panel {
  min-width:0;
  min-height:0;
  height:100%;
  display:grid;
  grid-template-rows:auto minmax(0,1fr);
  overflow:hidden;
}

.operation-detail-tabs {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:4px;
  padding:4px 7px;
  border-bottom:1px solid #2f3b3f;
  background:#0c1417;
}

.operation-detail-tabs button {
  min-width:0;
  min-height:30px;
  border:1px solid #425159;
  border-radius:7px;
  background:#172126;
  color:#93a5a9;
  padding:3px 10px;
  font:inherit;
  font-size:12px;
  font-weight:700;
  cursor:pointer;
}

.operation-detail-tabs button:hover {
  border-color:#5c7780;
  color:#dbe7e8;
}

.operation-detail-tabs button.active {
  border-color:#77d8e7;
  background:#174653;
  color:#eff8f6;
}

.operation-detail-content {
  min-width:0;
  min-height:0;
  height:100%;
  overflow:hidden;
  border:1px solid #394b52;
  border-top:0;
  border-radius:0 0 6px 6px;
  background:#10191d;
}

.operation-detail-panel {
  width:100%;
  height:100%;
  min-height:0;
  display:grid;
  align-content:start;
  gap:3px;
  overflow-y:auto;
  overflow-x:hidden;
  overscroll-behavior:contain;
  padding:3px;
  scrollbar-width:none;
}

.operation-detail-panel::-webkit-scrollbar {
  display:none;
  width:0;
  height:0;
}

.operation-detail-section {
  min-width:0;
  border:1px solid #2f4148;
  border-radius:5px;
  background:#0d171b;
  overflow:hidden;
}

.operation-detail-section-title {
  width:100%;
  min-height:24px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:6px;
  padding:3px 5px;
  border:0;
  background:#132126;
  color:#91a1a5;
  font:inherit;
  font-size:10px;
  font-weight:800;
  letter-spacing:.03em;
  text-align:left;
  cursor:pointer;
}

.operation-detail-section-title:hover {
  background:#17282e;
  color:#d7e3e3;
}

.operation-section-toggle {
  flex:0 0 auto;
  color:#77d8e7;
  font-size:12px;
}

.operation-detail-section-body {
  min-width:0;
  padding:3px;
}

.operation-status-grid {
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:2px;
}

.operation-detail-stat {
  min-width:0;
  min-height:48px;
  display:grid;
  place-items:center;
  align-content:center;
  gap:2px;
  padding:5px 4px;
  border:1px solid #3b4b52;
  border-radius:8px;
  background:#131c21;
  text-align:center;
}

.operation-detail-stat span {
  min-width:0;
  color:#94a3a7;
  font-size:11px;
  line-height:1;
}

.operation-detail-stat b {
  color:#f0f5f3;
  font-size:14px;
  line-height:1.1;
}

.operation-resistance-grid {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:2px;
}

.operation-resistance-item {
  min-width:0;
  min-height:34px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:4px;
  padding:4px 6px;
  border:1px solid #3d4d54;
  border-radius:7px;
  background:#121c20;
}

.operation-resistance-item span {
  min-width:0;
  color:#a7b4b7;
  font-size:11px;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}

.operation-resistance-item b {
  flex:0 0 auto;
  color:#f0f5f3;
  font-size:13px;
}

.operation-proficiency-grid {
  display:grid !important;
  grid-template-columns:repeat(2,minmax(0,1fr)) !important;
  grid-auto-flow:row !important;
  gap:2px;
}

.operation-proficiency-grid > .operation-proficiency-item {
  grid-column:auto !important;
  width:auto !important;
}

.operation-proficiency-item {
  min-width:0;
  min-height:34px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:4px;
  padding:4px 6px;
  border:1px solid #3d4d54;
  border-radius:7px;
  background:#121c20;
}

.operation-proficiency-item span {
  min-width:0;
  color:#a7b4b7;
  font-size:11px;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}

.operation-proficiency-item b {
  flex:0 0 auto;
  color:#f0f5f3;
  font-size:13px;
}

.operation-empty {
  padding:6px;
  color:#829397;
  font-size:11px;
}

@media (max-width:430px) {
  .operation-detail-tabs {
    padding:4px;
  }

  .operation-detail-tabs button {
    padding:3px 5px;
    font-size:12px;
  }
}
</style>
