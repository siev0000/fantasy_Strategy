<script setup>
import { computed, ref, watch } from "vue";

const props = defineProps({
  squadEntries: { type: Array, default: () => [] },
  unitEntries: { type: Array, default: () => [] },
  selectedUnitId: { type: String, default: "" },
  canUseMoveMode: { type: Boolean, default: false },
  moveModeEnabled: { type: Boolean, default: false },
  resetKey: { type: String, default: "" }
});

const emit = defineEmits(["focus-unit", "focus-squad", "open-character-status", "select-move-unit"]);

const activeTab = ref("units");
const minimized = ref(false);
const selectedLocalUnitId = ref("");
const selectedLocalSquadId = ref("");

const unitCount = computed(() => (Array.isArray(props.unitEntries) ? props.unitEntries.length : 0));
const squadCount = computed(() => (Array.isArray(props.squadEntries) ? props.squadEntries.length : 0));

const selectedUnitEntry = computed(() => {
  const id = (selectedLocalUnitId.value || props.selectedUnitId || "").trim();
  const list = Array.isArray(props.unitEntries) ? props.unitEntries : [];
  if (!list.length) return null;
  return list.find(entry => (entry?.id || "") === id) || list[0];
});

const selectedSquadEntry = computed(() => {
  const id = (selectedLocalSquadId.value || "").trim();
  const list = Array.isArray(props.squadEntries) ? props.squadEntries : [];
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
    if (target.closest(".own-faction-head-action-btn")) return;
  }
  minimized.value = !minimized.value;
}

function switchTab(tab, event) {
  event?.stopPropagation?.();
  activeTab.value = tab === "squads" ? "squads" : "units";
  if (activeTab.value === "squads" && !selectedLocalSquadId.value) {
    selectedLocalSquadId.value = selectedSquadEntry.value?.id || "";
  }
}

watch(
  () => props.resetKey,
  () => {
    minimized.value = false;
    activeTab.value = "units";
    selectedLocalUnitId.value = "";
    selectedLocalSquadId.value = "";
  }
);

function onFocusSquad(entry) {
  if (!entry) return;
  selectedLocalSquadId.value = entry.id || "";
  if (!entry.positioned) return;
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

function selectMoveUnitFromHead(event) {
  event?.stopPropagation?.();
  if (activeTab.value === "squads") {
    const squad = selectedSquadEntry.value;
    const leaderId = (squad?.leaderId || "").trim();
    if (!leaderId) return;
    emit("select-move-unit", { unitId: leaderId });
    return;
  }
  const target = selectedUnitEntry.value;
  if (!target?.id) return;
  emit("select-move-unit", { unitId: target.id });
}

function hpRate(entry) {
  const max = Math.max(1, Number(entry?.hpMax) || 1);
  const cur = Math.max(0, Number(entry?.hpCurrent) || 0);
  return Math.max(0, Math.min(100, (cur / max) * 100));
}

function rowBackgroundStyle(entry) {
  const src = typeof entry?.subIconSrc === "string" ? entry.subIconSrc.trim() : "";
  if (!src) return null;
  return {
    "--own-faction-sub-icon-image": `url("${src}")`
  };
}
</script>

<template>
  <aside class="own-faction-panel" :class="{ minimized }">
    <header class="own-faction-panel-head" @click="toggleMinimized">
      <!-- <strong>自陣営一覧</strong> -->
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
      <div class="own-faction-panel-head-actions" @click.stop>
        <button
          type="button"
          class="own-faction-head-action-btn"
          :class="{ active: moveModeEnabled }"
          :disabled="(activeTab === 'units' && (!selectedUnitEntry || !canUseMoveMode)) || (activeTab === 'squads' && !selectedSquadEntry?.leaderId)"
          @click="selectMoveUnitFromHead"
        >
          {{ activeTab === "squads" ? "移動/隊" : "移動" }}
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
          :style="rowBackgroundStyle(entry)"
          :disabled="!entry.positioned"
          @click="onFocusUnit(entry)"
        >
          <span class="own-faction-unit-main">
            <img v-if="entry.iconSrc" :src="entry.iconSrc" :alt="`${entry.name} アイコン`" class="own-faction-icon" />
            <span v-else class="own-faction-icon-fallback">{{ entry.iconGlyph }}</span>
            <strong>{{ entry.name }}</strong>
          </span>
          <span class="own-faction-hp-line">
            <span class="own-faction-hp-label">HP:</span>
            <span class="own-faction-hp-bar">
              <i :style="{ width: `${hpRate(entry)}%` }"></i>
              <b>{{ entry.hpCurrent }} / {{ entry.hpMax }}</b>
            </span>
          </span>
          <span class="own-faction-unit-sub">
            <template v-if="entry.squadName">所属: {{ entry.squadName }}</template>
            <template v-if="entry.squadName && entry.positioned"> / </template>
            <template v-if="entry.positioned">({{ entry.x }}, {{ entry.y }}) 移動{{ entry.moveRemaining }}</template>
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
          :class="{ selected: selectedSquadEntry && selectedSquadEntry.id === entry.id }"
          :style="rowBackgroundStyle(entry)"
          @click="onFocusSquad(entry)"
          >
            <span class="own-faction-unit-main">
              <img v-if="entry.iconSrc" :src="entry.iconSrc" :alt="`${entry.name} アイコン`" class="own-faction-icon" />
              <span v-else class="own-faction-icon-fallback">{{ entry.iconGlyph || entry.leaderIconGlyph }}</span>
              <strong>{{ entry.name }}</strong>
            </span>
          <span class="own-faction-unit-sub">
            {{ entry.positioned ? `(${entry.x}, ${entry.y})` : "未配置" }} / {{ entry.totalMemberCount }}体 / 索{{ entry.scoutValue }} 隠{{ entry.stealthValue }}
          </span>
        </button>
        <div v-if="!squadEntries.length" class="own-faction-empty">部隊なし</div>
      </div>

      <section v-if="selectedUnitEntry && activeTab === 'units'" class="own-faction-detail">
        <button type="button" class="detail-icon-btn" title="詳細" aria-label="詳細" @click="openCharacterStatus">📝</button>
        <div class="own-faction-detail-grid">
          <div><span>種族</span><b>{{ selectedUnitEntry.race }}</b></div>
          <div><span>クラス</span><b>{{ selectedUnitEntry.className }}</b></div>
          <div class="paired-stat-row">
            <span class="paired-item"><span>Lv:</span><b>{{ selectedUnitEntry.level }}</b></span>
            <span class="paired-item paired-item-text"><span>役割:</span><b>{{ selectedUnitEntry.roleLabel }}</b></span>
          </div>
          <div class="paired-stat-row">
            <span class="paired-item"><span>索敵:</span><b>{{ selectedUnitEntry.scoutValue }}</b></span>
            <span class="paired-item"><span>隠密:</span><b>{{ selectedUnitEntry.stealthValue }}</b></span>
          </div>
          <div class="paired-stat-row">
            <span class="paired-item"><span>攻撃:</span><b>{{ selectedUnitEntry.status?.攻撃 }}</b></span>
            <span class="paired-item"><span>防御:</span><b>{{ selectedUnitEntry.status?.防御 }}</b></span>
          </div>
          <div class="paired-stat-row">
            <span class="paired-item"><span>魔力:</span><b>{{ selectedUnitEntry.status?.魔力 }}</b></span>
            <span class="paired-item"><span>精神:</span><b>{{ selectedUnitEntry.status?.精神 ?? "-" }}</b></span>
          </div>
          <div class="paired-stat-row">
            <span class="paired-item"><span>命中:</span><b>{{ selectedUnitEntry.status?.命中 ?? "-" }}</b></span>
            <span class="paired-item"><span>速度:</span><b>{{ selectedUnitEntry.status?.速度 }}</b></span>
          </div>
        </div>
      </section>

      <section v-if="selectedSquadEntry && activeTab === 'squads'" class="own-faction-detail own-faction-squad-detail">
        <div class="own-faction-squad-head">
          <strong>{{ selectedSquadEntry.name }}</strong>
          <span>{{ selectedSquadEntry.positioned ? `(${selectedSquadEntry.x}, ${selectedSquadEntry.y})` : "未配置" }}</span>
        </div>
        <div class="own-faction-squad-summary">
          <span>人数: {{ selectedSquadEntry.totalMemberCount }}</span>
          <span>索敵: {{ selectedSquadEntry.scoutValue }}</span>
          <span>隠密: {{ selectedSquadEntry.stealthValue }}</span>
        </div>
        <div class="own-faction-squad-member-list">
          <div
            v-for="(member, index) in selectedSquadEntry.members || []"
            :key="`squad-member-${selectedSquadEntry.id}-${member.id || member.name}-${index}`"
            class="own-faction-squad-member-row"
          >
            <div class="own-faction-squad-member-main">
              <span class="member-name">{{ member.isLeader ? `★${member.name}` : member.name }}</span>
              <span>{{ member.race || "-" }}</span>
              <span>{{ member.className }}</span>
            </div>
            <div class="own-faction-squad-member-sub">
              <span class="member-level">Lv {{ member.level }}</span>
              <span class="own-faction-hp-line own-faction-hp-line-compact">
                <span class="own-faction-hp-label">HP:</span>
                <span class="own-faction-hp-bar">
                  <i :style="{ width: `${Math.max(0, Math.min(100, Math.round((member.hpCurrent / Math.max(1, member.hpMax)) * 100)))}%` }"></i>
                  <b>{{ member.hpCurrent }} / {{ member.hpMax }}</b>
                </span>
              </span>
            </div>
          </div>
          <div v-if="!(selectedSquadEntry.members || []).length" class="own-faction-empty">メンバー情報なし</div>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.own-faction-panel {
  --own-faction-head-height: 34px;
  --own-faction-row-height: 64px;
  --own-faction-detail-value-width: 25px;
  --own-faction-icon-size: 24px;
  --own-faction-sub-icon-size: 60px;
  --own-faction-sub-icon-opacity: 0.38;
  border: 1px solid rgba(235, 203, 142, 0.52);
  border-radius: 10px;
  background: linear-gradient(170deg, rgba(18, 24, 36, 0.9), rgba(12, 10, 8, 0.86));
  box-shadow: inset 0 0 0 1px rgba(255, 236, 189, 0.1);
  color: #f7e8c3;
  pointer-events: auto;
  overflow: hidden;
}

.own-faction-panel-head {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 4px;
  height: var(--own-faction-head-height);
  min-height: var(--own-faction-head-height);
  padding: 4px 6px;
  border-bottom: 1px solid rgba(235, 203, 142, 0.28);
  background: linear-gradient(180deg, rgba(7, 24, 41, 0.88), rgba(8, 17, 30, 0.92));
  box-shadow: inset 0 -1px 0 rgba(255, 237, 204, 0.08);
  cursor: pointer;
  user-select: none;
}

.own-faction-panel-head strong {
  font-size: 0.62rem;
  letter-spacing: 0.02em;
  white-space: nowrap;
  color: rgba(255, 245, 218, 0.98);
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.72);
}

.own-faction-panel-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  min-width: 0;
  width: 100%;
  align-items: stretch;
}

.own-faction-tab-btn {
  border: 1px solid rgba(222, 193, 135, 0.44);
  border-radius: 7px;
  width: 100%;
  min-width: 0;
  min-height: 22px;
  padding: 2px 4px;
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1.15;
  color: rgba(247, 233, 201, 0.78);
  background: linear-gradient(180deg, rgba(33, 24, 17, 0.68), rgba(20, 15, 11, 0.7));
  box-shadow: inset 0 0 0 1px rgba(255, 238, 203, 0.05);
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease, color 120ms ease, box-shadow 120ms ease, transform 120ms ease;
}

.own-faction-tab-btn:hover {
  border-color: rgba(169, 232, 245, 0.74);
  color: #f5fdff;
}

.own-faction-tab-btn.active {
  color: #e9fbff;
  border-color: rgba(132, 239, 255, 0.96);
  background: linear-gradient(180deg, rgba(20, 88, 105, 0.92), rgba(14, 56, 70, 0.92));
  box-shadow:
    inset 0 0 0 1px rgba(190, 247, 255, 0.38),
    0 0 8px rgba(71, 206, 238, 0.38);
}

.own-faction-tab-btn:not(.active) {
  opacity: 0.82;
}

.own-faction-panel-fold {
  font-size: 0.7rem;
  color: rgba(238, 249, 255, 0.96);
}

.own-faction-panel-head-actions {
  display: inline-flex;
  align-items: center;
}

.own-faction-head-action-btn {
  border: 1px solid rgba(199, 168, 114, 0.7);
  border-radius: 7px;
  min-height: 22px;
  padding: 2px 6px;
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1.15;
  color: rgba(255, 238, 203, 0.96);
  background: linear-gradient(180deg, rgba(73, 54, 34, 0.85), rgba(51, 37, 24, 0.88));
  box-shadow: inset 0 0 0 1px rgba(255, 236, 197, 0.08);
  cursor: pointer;
}

.own-faction-head-action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.own-faction-head-action-btn.active {
  border-color: rgba(126, 237, 255, 0.96);
  color: #eaffff;
  background: linear-gradient(180deg, rgba(25, 96, 112, 0.94), rgba(17, 66, 82, 0.94));
  box-shadow:
    inset 0 0 0 1px rgba(191, 248, 255, 0.36),
    0 0 8px rgba(74, 210, 242, 0.36);
}

.own-faction-panel-body {
  display: grid;
  gap: 1px;
  padding: 5px;
  min-width: 0;
  overflow: hidden;
}

.own-faction-list {
  min-height: 0;
  max-height: calc((var(--own-faction-row-height) * 4) + 4px);
  overflow: auto;
  display: grid;
  gap: 1px;
}

.own-faction-unit-row,
.own-faction-squad-row {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border: 1px solid rgba(220, 188, 128, 0.26);
  border-radius: 8px;
  background: linear-gradient(170deg, rgba(24, 18, 12, 0.7), rgba(15, 12, 9, 0.72));
  color: #f7e8c3;
  text-align: left;
  padding: 1px 2px;
  min-height: var(--own-faction-row-height);
  display: grid;
  gap: 3px;
  cursor: pointer;
}

.own-faction-unit-row::before,
.own-faction-squad-row::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: var(--own-faction-sub-icon-image, none);
  background-repeat: no-repeat;
  background-position: right 5px center;
  background-size: var(--own-faction-sub-icon-size) var(--own-faction-sub-icon-size);
  opacity: var(--own-faction-sub-icon-opacity);
  filter: saturate(0.9) brightness(0.95);
  pointer-events: none;
  z-index: 0;
}

.own-faction-unit-row > *,
.own-faction-squad-row > * {
  position: relative;
  z-index: 1;
}

.own-faction-unit-row.selected {
  border-color: rgba(110, 211, 255, 0.85);
  box-shadow: 0 0 0 1px rgba(122, 221, 255, 0.36);
}

.own-faction-squad-row.selected {
  border-color: rgba(110, 211, 255, 0.85);
  box-shadow: 0 0 0 1px rgba(122, 221, 255, 0.36);
}

.own-faction-unit-row:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.own-faction-unit-main {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.74rem;
  min-width: 0;
}

.own-faction-unit-main strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.own-faction-icon,
.own-faction-icon-fallback {
  width: var(--own-faction-icon-size);
  height: var(--own-faction-icon-size);
  border-radius: 4px;
  /* border: 1px solid rgba(221, 185, 126, 0.62);
  background: rgba(255, 255, 255, 0.44); */
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
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.own-faction-hp-label {
  flex: 0 0 auto;
  font-size: 0.58rem;
  line-height: 1;
  color: rgba(247, 232, 195, 0.86);
}

.own-faction-hp-bar {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  height: 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  overflow: hidden;
}

.own-faction-hp-bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #3bb75d, #8ae58f);
}

.own-faction-hp-bar b {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  font-size: 0.58rem;
  line-height: 1;
  font-weight: 700;
  color: #f6f0df;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.75);
  white-space: nowrap;
  pointer-events: none;
}

.own-faction-unit-sub {
  font-size: 0.64rem;
  color: rgba(247, 232, 195, 0.84);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  padding: 3px 1px 2px;
  position: relative;
  display: grid;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  max-height: 175px;
  overflow-x: hidden;
  overflow-y: auto;
}

.detail-icon-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 20px;
  height: 20px;
  border: 1px solid rgba(222, 193, 135, 0.56);
  border-radius: 6px;
  background: linear-gradient(180deg, rgba(244, 223, 185, 0.92), rgba(213, 186, 143, 0.9));
  color: #2d2418;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  z-index: 1;
}

.own-faction-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px 8px;
  min-width: 0;
}

.own-faction-detail-grid div {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.own-faction-detail-grid span {
  font-size: 12px;
  color: rgba(241, 228, 193, 0.76);
}

.own-faction-detail-grid b {
  font-size: 12px;
  color: #fff4d2;
  font-weight: 700;
  min-width: 0;
  line-height: 1.25;
  white-space: normal;
  overflow-wrap: anywhere;
}

.own-faction-detail-grid .paired-stat-row {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 14px;
}

.own-faction-detail-grid .paired-item {
  display: grid;
  grid-template-columns: max-content var(--own-faction-detail-value-width);
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.own-faction-detail-grid .paired-item span,
.own-faction-detail-grid .paired-item b {
  white-space: nowrap;
  min-width: 25px;
}

.own-faction-detail-grid .paired-item b {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.own-faction-detail-grid .paired-item.paired-item-text {
  grid-template-columns: max-content max-content;
}

.own-faction-detail-grid .paired-item.paired-item-text b {
  text-align: left;
  font-variant-numeric: normal;
}

.own-faction-squad-detail {
  gap: 6px;
}

.own-faction-squad-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.7rem;
}

.own-faction-squad-head strong {
  color: #fff4d2;
}

.own-faction-squad-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 0.66rem;
  color: rgba(241, 228, 193, 0.82);
}

.own-faction-squad-member-list {
  display: grid;
  gap: 4px;
}

.own-faction-squad-member-row {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
  font-size: 0.66rem;
  color: #f7e8c3;
  border: 1px solid rgba(220, 188, 128, 0.22);
  border-radius: 6px;
  padding: 4px 6px;
  background: rgba(255, 255, 255, 0.06);
}

.own-faction-squad-member-main {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 0.7fr) minmax(0, 0.9fr);
  align-items: center;
  gap: 6px;
}

.own-faction-squad-member-main span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.own-faction-squad-member-row .member-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 700;
}

.own-faction-squad-member-sub {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 6px;
}

.member-level {
  min-width: 34px;
  font-weight: 700;
  color: rgba(240, 224, 178, 0.94);
}

.own-faction-hp-line-compact {
  justify-content: flex-start;
  gap: 4px;
}

.own-faction-hp-line-compact .own-faction-hp-label {
  min-width: 16px;
}

.own-faction-hp-line-compact .own-faction-hp-bar {
  width: 100%;
  max-width: none;
}
</style>
