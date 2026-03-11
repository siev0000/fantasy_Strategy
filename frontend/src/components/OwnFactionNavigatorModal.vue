<script setup>
import { computed, ref, watch } from "vue";

const props = defineProps({
  squadEntries: { type: Array, default: () => [] },
  unitEntries: { type: Array, default: () => [] },
  selectedUnitId: { type: String, default: "" },
  resetKey: { type: String, default: "" }
});

const emit = defineEmits(["focus-unit", "focus-squad", "open-character-status"]);

const activeTab = ref("units");
const minimized = ref(false);
const selectedLocalUnitId = ref("");

const unitCount = computed(() => (Array.isArray(props.unitEntries) ? props.unitEntries.length : 0));
const squadCount = computed(() => (Array.isArray(props.squadEntries) ? props.squadEntries.length : 0));

const selectedUnitEntry = computed(() => {
  const id = (selectedLocalUnitId.value || props.selectedUnitId || "").trim();
  const list = Array.isArray(props.unitEntries) ? props.unitEntries : [];
  if (!list.length) return null;
  return list.find(entry => (entry?.id || "") === id) || list[0];
});

watch(
  () => props.selectedUnitId,
  id => {
    if (typeof id !== "string") return;
    const normalized = id.trim();
    if (!normalized) return;
    selectedLocalUnitId.value = normalized;
  },
  { immediate: true }
);

function toggleMinimized(event) {
  const target = event?.target;
  if (target && typeof target.closest === "function") {
    if (target.closest(".own-faction-tab-btn")) return;
  }
  minimized.value = !minimized.value;
}

function switchTab(tab, event) {
  event?.stopPropagation?.();
  activeTab.value = tab === "squads" ? "squads" : "units";
}

watch(
  () => props.resetKey,
  () => {
    minimized.value = false;
    activeTab.value = "units";
    selectedLocalUnitId.value = "";
  }
);

function onFocusSquad(entry) {
  if (!entry || !entry.positioned) return;
  emit("focus-squad", { leaderId: entry.leaderId });
}

function onFocusUnit(entry) {
  if (!entry) return;
  selectedLocalUnitId.value = entry.id || "";
  if (!entry.positioned) return;
  emit("focus-unit", { unitId: entry.id });
}

function openCharacterStatus(event) {
  event?.stopPropagation?.();
  const target = selectedUnitEntry.value;
  if (!target?.id) return;
  emit("open-character-status", { unitId: target.id });
}

function hpRate(entry) {
  const max = Math.max(1, Number(entry?.hpMax) || 1);
  const cur = Math.max(0, Number(entry?.hpCurrent) || 0);
  return Math.max(0, Math.min(100, (cur / max) * 100));
}
</script>

<template>
  <aside class="own-faction-panel" :class="{ minimized }">
    <header class="own-faction-panel-head" @click="toggleMinimized">
      <strong>自陣営一覧</strong>
      <div class="own-faction-panel-tabs" @click.stop>
        <button
          type="button"
          class="own-faction-tab-btn"
          :class="{ active: activeTab === 'units' }"
          @click="switchTab('units', $event)"
        >
          キャラ {{ unitCount }}
        </button>
        <button
          type="button"
          class="own-faction-tab-btn"
          :class="{ active: activeTab === 'squads' }"
          @click="switchTab('squads', $event)"
        >
          部隊 {{ squadCount }}
        </button>
      </div>
      <span class="own-faction-panel-fold">{{ minimized ? "▽" : "△" }}</span>
    </header>

    <div v-if="!minimized" class="own-faction-panel-body">
      <div v-if="activeTab === 'units'" class="own-faction-list">
        <button
          v-for="entry in unitEntries"
          :key="`unit-row-${entry.id}`"
          type="button"
          class="own-faction-unit-row"
          :class="{ selected: selectedUnitEntry && selectedUnitEntry.id === entry.id }"
          :disabled="!entry.positioned"
          @click="onFocusUnit(entry)"
        >
          <span class="own-faction-unit-main">
            <img v-if="entry.iconSrc" :src="entry.iconSrc" :alt="`${entry.name} アイコン`" class="own-faction-icon" />
            <span v-else class="own-faction-icon-fallback">{{ entry.iconGlyph }}</span>
            <strong>{{ entry.name }}</strong>
          </span>
          <span class="own-faction-hp-line">
            <em>HP {{ entry.hpCurrent }} / {{ entry.hpMax }}</em>
            <span class="own-faction-hp-bar"><i :style="{ width: `${hpRate(entry)}%` }"></i></span>
          </span>
          <span class="own-faction-unit-sub">
            <template v-if="entry.squadName">所属: {{ entry.squadName }}</template>
            <template v-if="entry.squadName && entry.positioned"> / </template>
            <template v-if="entry.positioned">({{ entry.x }}, {{ entry.y }})</template>
          </span>
        </button>
        <div v-if="!unitEntries.length" class="own-faction-empty">キャラなし</div>
      </div>

      <div v-else class="own-faction-list">
        <button
          v-for="entry in squadEntries"
          :key="`squad-row-${entry.id}`"
          type="button"
          class="own-faction-squad-row"
          :disabled="!entry.positioned"
          @click="onFocusSquad(entry)"
        >
          <span class="own-faction-unit-main">
            <img v-if="entry.leaderIconSrc" :src="entry.leaderIconSrc" :alt="`${entry.name} アイコン`" class="own-faction-icon" />
            <span v-else class="own-faction-icon-fallback">{{ entry.leaderIconGlyph }}</span>
            <strong>{{ entry.name }}</strong>
          </span>
          <span class="own-faction-unit-sub">
            {{ entry.positioned ? `(${entry.x}, ${entry.y})` : "未配置" }} / {{ entry.totalMemberCount }}体 / 索{{ entry.scoutValue }} 隠{{ entry.stealthValue }}
          </span>
        </button>
        <div v-if="!squadEntries.length" class="own-faction-empty">部隊なし</div>
      </div>

      <section v-if="selectedUnitEntry && activeTab === 'units'" class="own-faction-detail">
        <div class="own-faction-detail-head">
          <strong>{{ selectedUnitEntry.name }}</strong>
          <button type="button" class="detail-btn" @click="openCharacterStatus">詳細</button>
        </div>
        <div class="own-faction-detail-grid">
          <div><span>種族</span><b>{{ selectedUnitEntry.race }}</b></div>
          <div><span>クラス</span><b>{{ selectedUnitEntry.className }}</b></div>
          <div><span>Lv</span><b>{{ selectedUnitEntry.level }}</b></div>
          <div><span>役割</span><b>{{ selectedUnitEntry.roleLabel }}</b></div>
          <div><span>索敵</span><b>{{ selectedUnitEntry.scoutValue }}</b></div>
          <div><span>隠密</span><b>{{ selectedUnitEntry.stealthValue }}</b></div>
          <div><span>移動</span><b>{{ selectedUnitEntry.moveRemaining }} / {{ selectedUnitEntry.moveRange }}</b></div>
          <div><span>座標</span><b>{{ selectedUnitEntry.positioned ? `(${selectedUnitEntry.x}, ${selectedUnitEntry.y})` : "未配置" }}</b></div>
          <div><span>攻撃</span><b>{{ selectedUnitEntry.status?.攻撃 }}</b></div>
          <div><span>防御</span><b>{{ selectedUnitEntry.status?.防御 }}</b></div>
          <div><span>魔力</span><b>{{ selectedUnitEntry.status?.魔力 }}</b></div>
          <div><span>速度</span><b>{{ selectedUnitEntry.status?.速度 }}</b></div>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.own-faction-panel {
  border: 1px solid rgba(235, 203, 142, 0.52);
  border-radius: 10px;
  background: linear-gradient(170deg, rgba(18, 24, 36, 0.9), rgba(12, 10, 8, 0.86));
  box-shadow: inset 0 0 0 1px rgba(255, 236, 189, 0.1);
  color: #f7e8c3;
  pointer-events: auto;
}

.own-faction-panel-head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-bottom: 1px solid rgba(235, 203, 142, 0.28);
  cursor: pointer;
  user-select: none;
}

.own-faction-panel-head strong {
  font-size: 0.76rem;
}

.own-faction-panel-tabs {
  display: inline-flex;
  gap: 6px;
  justify-content: flex-end;
}

.own-faction-tab-btn {
  border: 1px solid rgba(222, 193, 135, 0.44);
  border-radius: 7px;
  padding: 4px 7px;
  font-size: 0.68rem;
  font-weight: 700;
  color: #f8e9c4;
  background: rgba(39, 27, 18, 0.5);
  cursor: pointer;
}

.own-faction-tab-btn.active {
  color: #1f170f;
  background: linear-gradient(180deg, rgba(244, 223, 185, 0.92), rgba(213, 186, 143, 0.9));
}

.own-faction-panel-fold {
  font-size: 0.78rem;
}

.own-faction-panel-body {
  display: grid;
  gap: 7px;
  padding: 8px;
}

.own-faction-list {
  max-height: 230px;
  overflow: auto;
  display: grid;
  gap: 6px;
}

.own-faction-unit-row,
.own-faction-squad-row {
  border: 1px solid rgba(220, 188, 128, 0.26);
  border-radius: 8px;
  background: linear-gradient(170deg, rgba(24, 18, 12, 0.7), rgba(15, 12, 9, 0.72));
  color: #f7e8c3;
  text-align: left;
  padding: 6px 7px;
  display: grid;
  gap: 4px;
  cursor: pointer;
}

.own-faction-unit-row.selected {
  border-color: rgba(110, 211, 255, 0.85);
  box-shadow: 0 0 0 1px rgba(122, 221, 255, 0.36);
}

.own-faction-unit-row:disabled,
.own-faction-squad-row:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.own-faction-unit-main {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.74rem;
}

.own-faction-icon,
.own-faction-icon-fallback {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1px solid rgba(221, 185, 126, 0.62);
  background: rgba(255, 255, 255, 0.14);
}

.own-faction-icon {
  object-fit: cover;
}

.own-faction-icon-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #f5e9c8;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

.own-faction-hp-line {
  display: grid;
  gap: 4px;
}

.own-faction-hp-line em {
  font-style: normal;
  font-size: 0.64rem;
  color: rgba(247, 232, 195, 0.86);
}

.own-faction-hp-bar {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  overflow: hidden;
}

.own-faction-hp-bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #51d96f, #9aed86);
}

.own-faction-unit-sub {
  font-size: 0.64rem;
  color: rgba(247, 232, 195, 0.84);
}

.own-faction-empty {
  font-size: 0.7rem;
  color: rgba(243, 228, 193, 0.78);
  padding: 4px 1px;
}

.own-faction-detail {
  border: 1px solid rgba(220, 188, 128, 0.3);
  border-radius: 8px;
  background: rgba(13, 11, 9, 0.6);
  padding: 7px;
  display: grid;
  gap: 6px;
}

.own-faction-detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.own-faction-detail-head strong {
  font-size: 0.74rem;
}

.detail-btn {
  border: 1px solid rgba(222, 193, 135, 0.56);
  border-radius: 7px;
  background: linear-gradient(180deg, rgba(244, 223, 185, 0.92), rgba(213, 186, 143, 0.9));
  color: #2d2418;
  font-size: 0.66rem;
  font-weight: 700;
  padding: 3px 7px;
  cursor: pointer;
}

.own-faction-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 8px;
}

.own-faction-detail-grid div {
  display: grid;
  gap: 1px;
}

.own-faction-detail-grid span {
  font-size: 0.6rem;
  color: rgba(241, 228, 193, 0.76);
}

.own-faction-detail-grid b {
  font-size: 0.67rem;
  color: #fff4d2;
  font-weight: 700;
}
</style>
