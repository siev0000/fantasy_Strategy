<script setup>
import { computed } from "vue";
import SkillAcquiredTable from "./SkillAcquiredTable.vue";

const props = defineProps({
  statusRows: { type:Array, default:() => [] },
  skillRows: { type:Array, default:() => [] },
  skillNames: { type:Array, default:() => [] },
  statusSource: { type:Object, default:null },
  activeTab: { type:String, default:"status" },
  skillTitle: { type:String, default:"スキル" }
});

const emit = defineEmits(["update:activeTab"]);

const normalizedTab = computed(() => (
  ["status", "skills", "abilities"].includes(props.activeTab) ? props.activeTab : "status"
));

const flatStatusRows = computed(() => (
  (Array.isArray(props.statusRows) ? props.statusRows : [])
    .flatMap(row => Array.isArray(row?.fields) ? row.fields : [])
));

function setTab(tab) {
  if (!["status", "skills", "abilities"].includes(tab)) return;
  emit("update:activeTab", tab);
}
</script>

<template>
  <section class="selection-detail-panel">
    <nav class="detail-tabs operation-detail-tabs" role="tablist" aria-label="選択詳細">
      <button type="button" role="tab" :aria-selected="normalizedTab === 'status'" :class="{ active: normalizedTab === 'status' }" @click="setTab('status')">ステータス</button>
      <button type="button" role="tab" :aria-selected="normalizedTab === 'skills'" :class="{ active: normalizedTab === 'skills' }" @click="setTab('skills')">技能</button>
      <button type="button" role="tab" :aria-selected="normalizedTab === 'abilities'" :class="{ active: normalizedTab === 'abilities' }" @click="setTab('abilities')">スキル</button>
    </nav>

    <div class="operation-detail-content">
      <section v-if="normalizedTab === 'status'" class="operation-detail-panel" role="tabpanel">
        <section class="operation-detail-section">
          <header class="operation-detail-section-title">ステータス</header>
          <div class="operation-detail-section-body">
            <div class="operation-status-grid">
              <div v-for="item in flatStatusRows" :key="item.key" class="operation-detail-stat">
                <span>{{ item.key }}</span>
                <b>{{ item.value ?? "-" }}</b>
              </div>
            </div>
          </div>
        </section>
      </section>

      <section v-else-if="normalizedTab === 'skills'" class="operation-detail-panel" role="tabpanel">
        <section class="operation-detail-section">
          <header class="operation-detail-section-title">技能</header>
          <div class="operation-detail-section-body">
            <div v-if="skillRows.length" class="operation-proficiency-grid">
              <div
                v-for="item in skillRows"
                :key="item.key"
                class="operation-proficiency-item"
                :title="item.desc || `${item.label}: 詳細なし`"
              >
                <span>{{ item.label }}</span>
                <b>{{ item.value }}</b>
              </div>
            </div>
            <div v-else class="operation-empty">技能データなし</div>
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
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:0;
  padding:0;
  border:1px solid #394b52;
  border-radius:6px 6px 0 0;
  overflow:hidden;
  background:#0d171b;
}

.operation-detail-tabs button {
  min-width:0;
  min-height:32px;
  border:0;
  border-right:1px solid #394b52;
  border-radius:0;
  background:#121d22;
  color:#93a5a9;
  padding:4px 5px;
  font:inherit;
  font-size:10px;
  font-weight:800;
  cursor:pointer;
}

.operation-detail-tabs button:last-child {
  border-right:0;
}

.operation-detail-tabs button.active {
  background:#193038;
  color:#eff8f6;
  box-shadow:inset 0 -2px 0 #71cbd8;
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
  min-height:24px;
  display:flex;
  align-items:center;
  padding:4px 7px;
  background:#132126;
  color:#c6d3d5;
  font-size:11px;
  font-weight:800;
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
  font-size:10px;
  line-height:1;
}

.operation-detail-stat b {
  color:#f0f5f3;
  font-size:13px;
  line-height:1.1;
}

.operation-proficiency-grid {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:2px;
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
  font-size:10px;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}

.operation-proficiency-item b {
  flex:0 0 auto;
  color:#f0f5f3;
  font-size:12px;
}

.operation-empty {
  padding:7px;
  color:#829397;
  font-size:10px;
}

@media (max-width:760px) {
  .operation-detail-tabs button {
    min-height:28px;
    padding:3px 3px;
    font-size:9px;
  }

  .operation-status-grid {
    grid-template-columns:repeat(3,minmax(0,1fr));
  }

  .operation-detail-stat {
    min-height:44px;
    padding:4px 3px;
  }

  .operation-detail-stat span {
    font-size:8px;
  }

  .operation-detail-stat b {
    font-size:12px;
  }

  .operation-proficiency-item {
    min-height:32px;
    padding:4px 5px;
  }

  .operation-proficiency-item span {
    font-size:8px;
  }

  .operation-proficiency-item b {
    font-size:11px;
  }
}

@media (max-width:430px) {
  .operation-status-grid {
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
}
</style>
