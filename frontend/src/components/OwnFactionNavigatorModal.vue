<script setup>
import { computed, ref, watch } from "vue";

const props = defineProps({
  squadEntries: { type: Array, default: () => [] },
  unitEntries: { type: Array, default: () => [] },
  selectedUnitId: { type: String, default: "" },
  selectedTileCoord: { type: Object, default: null },
  canUseMoveMode: { type: Boolean, default: false },
  moveModeEnabled: { type: Boolean, default: false },
  resetKey: { type: String, default: "" }
});

const emit = defineEmits(["focus-unit", "focus-squad", "open-character-status", "select-move-unit"]);

const activeTab = ref("formation");
const minimized = ref(false);
const selectedGroupKey = ref("");
const selectedLocalUnitId = ref("");
const selectedLocalTileUnitId = ref("");

const unitByIdMap = computed(() => {
  const map = new Map();
  for (const entry of Array.isArray(props.unitEntries) ? props.unitEntries : []) {
    const id = typeof entry?.id === "string" ? entry.id.trim() : "";
    if (!id) continue;
    map.set(id, entry);
  }
  return map;
});

const normalizedTileCoord = computed(() => {
  const x = Number(props?.selectedTileCoord?.x);
  const y = Number(props?.selectedTileCoord?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: Math.floor(x),
    y: Math.floor(y)
  };
});

const sovereignEntry = computed(() => {
  const list = Array.isArray(props.unitEntries) ? props.unitEntries : [];
  return list.find(entry => !!entry?.isSovereign || entry?.roleLabel === "統治者") || null;
});

const squadCount = computed(() => (Array.isArray(props.squadEntries) ? props.squadEntries.length : 0));

const soloEntries = computed(() => {
  const list = Array.isArray(props.unitEntries) ? props.unitEntries : [];
  return list.filter(entry => {
    if (!entry) return false;
    if (entry.isSovereign || entry.roleLabel === "統治者") return false;
    const squadName = typeof entry?.squadName === "string" ? entry.squadName.trim() : "";
    return !squadName;
  });
});

const formationRows = computed(() => {
  const rows = [];
  const sovereign = sovereignEntry.value;
  if (sovereign) {
    rows.push({
      key: "governor",
      type: "governor",
      title: `統治者: ${sovereign.name}`,
      badge: `Lv${sovereign.level || 1}`,
      subText: sovereign.positioned ? `(${sovereign.x}, ${sovereign.y}) / 移動${sovereign.moveRemaining}` : "未配置",
      iconSrc: sovereign.iconSrc || "",
      iconGlyph: sovereign.iconGlyph || "統",
      positioned: !!sovereign.positioned,
      unitId: sovereign.id
    });
  }
  const squads = Array.isArray(props.squadEntries) ? props.squadEntries : [];
  for (const squad of squads) {
    rows.push({
      key: `squad:${squad.id || ""}`,
      type: "squad",
      title: squad.name || "部隊",
      badge: `${Math.max(1, Number(squad.totalMemberCount) || 1)}体`,
      subText: squad.positioned ? `(${squad.x}, ${squad.y}) / 索${squad.scoutValue} 隠${squad.stealthValue}` : "未配置",
      iconSrc: squad.iconSrc || "",
      iconGlyph: squad.iconGlyph || "隊",
      positioned: !!squad.positioned,
      squadId: squad.id || "",
      leaderId: squad.leaderId || ""
    });
  }
  const solo = soloEntries.value;
  rows.push({
    key: "solo",
    type: "solo",
    title: "単独",
    badge: `${solo.length}体`,
    subText: solo.length ? "部隊未所属キャラクター" : "部隊未所属キャラクターなし",
    iconSrc: solo[0]?.iconSrc || "",
    iconGlyph: solo[0]?.iconGlyph || "単",
    positioned: solo.some(entry => !!entry?.positioned)
  });
  return rows;
});

const selectedFormationRow = computed(() => {
  const rows = formationRows.value;
  if (!rows.length) return null;
  const key = (selectedGroupKey.value || "").trim();
  return rows.find(row => row.key === key) || rows[0];
});

function toDisplayUnitFromMember(member) {
  const hpMax = Math.max(1, Math.floor(Number(member?.hpMax) || 1));
  const hpCurrent = Math.max(0, Math.floor(Number(member?.hpCurrent) || hpMax));
  return {
    id: `${member?.id || member?.name || "member"}`,
    name: member?.name || "メンバー",
    roleLabel: member?.isLeader ? "リーダー" : "メンバー",
    race: member?.race || "-",
    className: member?.className || "-",
    level: Math.max(1, Math.floor(Number(member?.level) || 1)),
    hpCurrent,
    hpMax,
    moveRemaining: 0,
    positioned: false,
    iconSrc: "",
    iconGlyph: "兵"
  };
}

const selectedFormationUnits = computed(() => {
  const row = selectedFormationRow.value;
  if (!row) return [];
  if (row.type === "governor") {
    return sovereignEntry.value ? [sovereignEntry.value] : [];
  }
  if (row.type === "solo") {
    return soloEntries.value;
  }
  if (row.type === "squad") {
    const squad = (Array.isArray(props.squadEntries) ? props.squadEntries : []).find(entry => entry?.id === row.squadId) || null;
    const members = Array.isArray(squad?.members) ? squad.members : [];
    const map = unitByIdMap.value;
    return members.map(member => {
      const id = typeof member?.id === "string" ? member.id.trim() : "";
      if (id && map.has(id)) return map.get(id);
      return toDisplayUnitFromMember(member);
    });
  }
  return [];
});

const selectedTileUnits = computed(() => {
  const coord = normalizedTileCoord.value;
  if (!coord) return [];
  const list = Array.isArray(props.unitEntries) ? props.unitEntries : [];
  return list.filter(entry => !!entry?.positioned && Number(entry?.x) === coord.x && Number(entry?.y) === coord.y);
});

const tileUnitCount = computed(() => selectedTileUnits.value.length);
const unitCount = computed(() => (Array.isArray(props.unitEntries) ? props.unitEntries.length : 0));

const selectedUnitEntry = computed(() => {
  if (activeTab.value === "tile") {
    const list = selectedTileUnits.value;
    if (!list.length) return null;
    const id = (selectedLocalTileUnitId.value || props.selectedUnitId || "").trim();
    return list.find(entry => (entry?.id || "") === id) || list[0];
  }
  const list = selectedFormationUnits.value;
  if (!list.length) return null;
  const id = (selectedLocalUnitId.value || props.selectedUnitId || "").trim();
  return list.find(entry => (entry?.id || "") === id) || list[0];
});

const selectedSquadEntry = computed(() => {
  const row = selectedFormationRow.value;
  if (!row || row.type !== "squad") return null;
  return (Array.isArray(props.squadEntries) ? props.squadEntries : []).find(entry => entry?.id === row.squadId) || null;
});

watch(
  () => props.selectedUnitId,
  id => {
    if (typeof id !== "string") return;
    const normalized = id.trim();
    if (!normalized) return;
    selectedLocalUnitId.value = normalized;
    selectedLocalTileUnitId.value = normalized;
  },
  { immediate: true }
);

watch(
  () => props.resetKey,
  () => {
    minimized.value = false;
    activeTab.value = "formation";
    selectedGroupKey.value = "";
    selectedLocalUnitId.value = "";
    selectedLocalTileUnitId.value = "";
  }
);

watch(
  formationRows,
  rows => {
    if (!rows.length) {
      selectedGroupKey.value = "";
      return;
    }
    const key = (selectedGroupKey.value || "").trim();
    if (!rows.some(row => row.key === key)) {
      selectedGroupKey.value = rows[0].key;
    }
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
  activeTab.value = tab === "tile" ? "tile" : "formation";
}

function onSelectFormationRow(row) {
  if (!row) return;
  selectedGroupKey.value = row.key;
  const units = selectedFormationUnits.value;
  if (units.length) {
    selectedLocalUnitId.value = units[0]?.id || "";
  }
  if (row.type === "squad" && row.positioned && row.leaderId) {
    emit("focus-squad", { leaderId: row.leaderId });
  } else if (row.type === "governor" && row.positioned && row.unitId) {
    emit("focus-unit", { unitId: row.unitId });
  }
}

function onSelectUnit(entry, source = "formation") {
  if (!entry) return;
  if (source === "tile") {
    selectedLocalTileUnitId.value = entry.id || "";
  } else {
    selectedLocalUnitId.value = entry.id || "";
  }
  if (!entry.positioned) return;
  emit("focus-unit", { unitId: entry.id });
}

function openCharacterStatus(event) {
  event?.stopPropagation?.();
  const target = selectedUnitEntry.value;
  if (!target?.id) return;
  emit("open-character-status", { unitId: target.id });
}

const canSelectMove = computed(() => {
  if (activeTab.value === "formation" && selectedFormationRow.value?.type === "squad") {
    return !!selectedSquadEntry.value?.leaderId;
  }
  return !!selectedUnitEntry.value?.id && !!props.canUseMoveMode;
});

function selectMoveUnitFromHead(event) {
  event?.stopPropagation?.();
  if (!canSelectMove.value) return;
  if (activeTab.value === "formation" && selectedFormationRow.value?.type === "squad") {
    const leaderId = (selectedSquadEntry.value?.leaderId || "").trim();
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
      <div class="own-faction-panel-tabs" @click.stop>
        <button
          type="button"
          class="own-faction-tab-btn"
          :class="{ active: activeTab === 'formation' }"
          @click="switchTab('formation', $event)"
        >
          編成 {{ squadCount }}
        </button>
        <button
          type="button"
          class="own-faction-tab-btn"
          :class="{ active: activeTab === 'tile' }"
          @click="switchTab('tile', $event)"
        >
          選択マス {{ tileUnitCount }}
        </button>
      </div>
      <div class="own-faction-panel-head-actions" @click.stop>
        <button
          type="button"
          class="own-faction-head-action-btn"
          :class="{ active: moveModeEnabled }"
          :disabled="!canSelectMove"
          @click="selectMoveUnitFromHead"
        >
          移動
        </button>
      </div>
      <span class="own-faction-panel-fold">{{ minimized ? "▽" : "△" }}</span>
    </header>

    <div v-if="!minimized" class="own-faction-panel-body">
      <template v-if="activeTab === 'formation'">
        <div class="own-faction-list own-faction-group-list">
          <button
            v-for="row in formationRows"
            :key="`formation-row-${row.key}`"
            type="button"
            class="own-faction-squad-row own-faction-group-row"
            :class="{ selected: selectedFormationRow && selectedFormationRow.key === row.key }"
            @click="onSelectFormationRow(row)"
          >
            <div class="own-faction-row-head">
              <span class="own-faction-unit-main">
                <img v-if="row.iconSrc" :src="row.iconSrc" :alt="`${row.title} アイコン`" class="own-faction-icon" />
                <span v-else class="own-faction-icon-fallback">{{ row.iconGlyph }}</span>
                <strong>{{ row.title }}</strong>
              </span>
              <span class="own-faction-level-tag">{{ row.badge }}</span>
            </div>
            <span class="own-faction-unit-sub">{{ row.subText }}</span>
          </button>
        </div>

        <div class="own-faction-list own-faction-member-list">
          <button
            v-for="entry in selectedFormationUnits"
            :key="`formation-unit-${entry.id}`"
            type="button"
            class="own-faction-unit-row"
            :class="{ selected: selectedUnitEntry && selectedUnitEntry.id === entry.id }"
            :style="rowBackgroundStyle(entry)"
            :disabled="!entry.positioned"
            @click="onSelectUnit(entry, 'formation')"
          >
            <div class="own-faction-row-head">
              <span class="own-faction-unit-main">
                <img v-if="entry.iconSrc" :src="entry.iconSrc" :alt="`${entry.name} アイコン`" class="own-faction-icon" />
                <span v-else class="own-faction-icon-fallback">{{ entry.iconGlyph }}</span>
                <strong>{{ entry.name }}</strong>
              </span>
              <span class="own-faction-level-tag">Lv{{ entry.level }}</span>
            </div>
            <span class="own-faction-hp-line">
              <span class="own-faction-hp-label">HP:</span>
              <span class="own-faction-hp-bar">
                <i :style="{ width: `${hpRate(entry)}%` }"></i>
                <b>{{ entry.hpCurrent }} / {{ entry.hpMax }}</b>
              </span>
            </span>
            <span class="own-faction-unit-sub">
              <template v-if="entry.positioned">({{ entry.x }}, {{ entry.y }}) / 移動{{ entry.moveRemaining }}</template>
              <template v-else>未配置</template>
            </span>
          </button>
          <div v-if="!selectedFormationUnits.length" class="own-faction-empty">表示対象なし</div>
        </div>
      </template>

      <div v-else class="own-faction-list own-faction-member-list">
        <button
          v-for="entry in selectedTileUnits"
          :key="`tile-unit-${entry.id}`"
          type="button"
          class="own-faction-unit-row"
          :class="{ selected: selectedUnitEntry && selectedUnitEntry.id === entry.id }"
          :style="rowBackgroundStyle(entry)"
          :disabled="!entry.positioned"
          @click="onSelectUnit(entry, 'tile')"
        >
          <div class="own-faction-row-head">
            <span class="own-faction-unit-main">
              <img v-if="entry.iconSrc" :src="entry.iconSrc" :alt="`${entry.name} アイコン`" class="own-faction-icon" />
              <span v-else class="own-faction-icon-fallback">{{ entry.iconGlyph }}</span>
              <strong>{{ entry.name }}</strong>
            </span>
            <span class="own-faction-level-tag">Lv{{ entry.level }}</span>
          </div>
          <span class="own-faction-hp-line">
            <span class="own-faction-hp-label">HP:</span>
            <span class="own-faction-hp-bar">
              <i :style="{ width: `${hpRate(entry)}%` }"></i>
              <b>{{ entry.hpCurrent }} / {{ entry.hpMax }}</b>
            </span>
          </span>
          <span class="own-faction-unit-sub">({{ entry.x }}, {{ entry.y }}) / 移動{{ entry.moveRemaining }}</span>
        </button>
        <div v-if="!selectedTileUnits.length" class="own-faction-empty">このマスに自勢力ユニットはいません</div>
      </div>

      <section v-if="selectedUnitEntry" class="own-faction-detail">
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
  grid-template-columns: 1fr auto auto;
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

.own-faction-panel-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  min-width: 0;
}

.own-faction-tab-btn {
  border: 1px solid rgba(222, 193, 135, 0.44);
  border-radius: 7px;
  width: 100%;
  min-height: 22px;
  padding: 2px 4px;
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1.15;
  color: rgba(247, 233, 201, 0.78);
  background: linear-gradient(180deg, rgba(33, 24, 17, 0.68), rgba(20, 15, 11, 0.7));
  cursor: pointer;
}

.own-faction-tab-btn.active {
  color: #e9fbff;
  border-color: rgba(132, 239, 255, 0.96);
  background: linear-gradient(180deg, rgba(20, 88, 105, 0.92), rgba(14, 56, 70, 0.92));
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
  color: rgba(255, 238, 203, 0.96);
  background: linear-gradient(180deg, rgba(73, 54, 34, 0.85), rgba(51, 37, 24, 0.88));
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
}

.own-faction-panel-fold {
  font-size: 0.7rem;
  color: rgba(238, 249, 255, 0.96);
}

.own-faction-panel-body {
  display: grid;
  gap: 4px;
  padding: 5px;
  min-width: 0;
  overflow: hidden;
}

.own-faction-list {
  min-height: 0;
  max-height: calc((var(--own-faction-row-height) * 4) + 6px);
  overflow: auto;
  display: grid;
  gap: 2px;
}

.own-faction-group-list {
  max-height: calc((var(--own-faction-row-height) * 3) + 6px);
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
  padding: 2px 4px;
  min-height: var(--own-faction-row-height);
  display: grid;
  gap: 3px;
  cursor: pointer;
}

.own-faction-group-row {
  min-height: 54px;
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
  pointer-events: none;
  z-index: 0;
}

.own-faction-unit-row > *,
.own-faction-squad-row > * {
  position: relative;
  z-index: 1;
}

.own-faction-unit-row.selected,
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

.own-faction-row-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
}

.own-faction-unit-main strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.own-faction-level-tag {
  justify-self: end;
  min-width: 42px;
  padding: 1px 6px;
  border: 1px solid rgba(222, 193, 135, 0.48);
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(40, 30, 20, 0.82), rgba(24, 19, 12, 0.88));
  color: #f8ebc8;
  font-size: 0.62rem;
  font-weight: 800;
  text-align: center;
}

.own-faction-icon,
.own-faction-icon-fallback {
  width: var(--own-faction-icon-size);
  height: var(--own-faction-icon-size);
  border-radius: 4px;
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
  font-weight: 700;
  color: #f6f0df;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.75);
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
  padding: 3px 2px 2px;
  position: relative;
  display: none;
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
}

.own-faction-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px 8px;
}

.own-faction-detail-grid span {
  font-size: 12px;
  color: rgba(241, 228, 193, 0.76);
}

.own-faction-detail-grid b {
  font-size: 12px;
  color: #fff4d2;
  font-weight: 700;
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
}

.own-faction-detail-grid .paired-item b {
  text-align: right;
}

.own-faction-detail-grid .paired-item.paired-item-text {
  grid-template-columns: max-content max-content;
}

.own-faction-detail-grid .paired-item.paired-item-text b {
  text-align: left;
}
</style>
