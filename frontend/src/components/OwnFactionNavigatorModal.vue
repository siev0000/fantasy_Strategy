<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { TURN_SECONDS } from "../lib/phaser-map-panel-config.js";

const props = defineProps({
  squadEntries: { type: Array, default: () => [] },
  unitEntries: { type: Array, default: () => [] },
  selectedUnitId: { type: String, default: "" },
  selectedTileCoord: { type: Object, default: null },
  canUseMoveMode: { type: Boolean, default: false },
  resetKey: { type: String, default: "" }
});

const emit = defineEmits(["focus-unit", "focus-squad", "open-character-status", "select-move-unit", "select-attack-unit"]);

const activeTab = ref("formation");
const minimized = ref(false);
const selectedGroupKey = ref("");
const selectedLocalUnitId = ref("");
const selectedLocalTileUnitId = ref("");
const panelRef = ref(null);
const actionPopupRef = ref(null);
const actionPopupTop = ref(0);
const actionPopupLeft = ref(-54);
let actionPopupFrameId = 0;
let windowResizeHandler = null;

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
    const sovereignMoveDisplay = resolveMoveDisplayValue(sovereign);
    rows.push({
      key: "governor",
      type: "governor",
      title: `統治者: ${sovereign.name}`,
      badge: `Lv${sovereign.level || 1}`,
      subText: sovereign.positioned ? `(${sovereign.x}, ${sovereign.y}) / 移動${sovereignMoveDisplay}` : "未配置",
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
  const exactRow = rows.find(row => row.key === key);
  if (exactRow) return exactRow;
  const selectableRows = rows.filter(row => row?.type !== "governor");
  return selectableRows[0] || rows[0];
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
    const id = (selectedLocalTileUnitId.value || "").trim();
    if (!id) return null;
    return list.find(entry => (entry?.id || "") === id) || null;
  }
  const list = selectedFormationUnits.value;
  if (!list.length) return null;
  const id = (selectedLocalUnitId.value || "").trim();
  if (!id) return null;
  return list.find(entry => (entry?.id || "") === id) || null;
});

const isActionPopupVisible = computed(() => {
  const unitId = typeof selectedUnitEntry.value?.id === "string" ? selectedUnitEntry.value.id.trim() : "";
  return !minimized.value && !!unitId;
});

const selectedDetailEntry = computed(() => {
  const entry = selectedUnitEntry.value;
  if (!entry) return null;
  if (entry.isSovereign || entry.roleLabel === "統治者") return null;
  return entry;
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
    const fallbackRow = rows.find(row => row?.type !== "governor") || rows[0];
    if (!fallbackRow) {
      selectedGroupKey.value = "";
      return;
    }
    const key = (selectedGroupKey.value || "").trim();
    if (!rows.some(row => row.key === key)) {
      selectedGroupKey.value = fallbackRow.key;
    }
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
  activeTab.value = tab === "tile" ? "tile" : "formation";
}

function onSelectFormationRow(row) {
  if (!row) return;
  selectedGroupKey.value = row.key || "";
  if (row.type === "governor") {
    selectedLocalUnitId.value = row?.unitId || "";
    if (row.positioned && row.unitId) {
      emit("focus-unit", { unitId: row.unitId });
    }
    return;
  }
  selectedGroupKey.value = row.key;
  selectedLocalUnitId.value = "";
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

function canSelectMoveForEntry(entry) {
  return !!entry?.id && !!props.canUseMoveMode;
}

function canSelectAttackForEntry(entry) {
  return !!entry?.id && !!entry?.positioned;
}

function isActionTargetRow(entry) {
  const id = typeof entry?.id === "string" ? entry.id.trim() : "";
  const selectedId = typeof selectedUnitEntry.value?.id === "string" ? selectedUnitEntry.value.id.trim() : "";
  return !!id && !!selectedId && id === selectedId;
}

function updateActionPopupPosition() {
  if (!isActionPopupVisible.value || minimized.value) return;
  const root = panelRef.value;
  const popup = actionPopupRef.value;
  if (!root || !popup || typeof root.querySelector !== "function") return;
  const selectedRow = root.querySelector(".own-faction-group-row.selected, .own-faction-unit-row.selected");
  if (!selectedRow || typeof selectedRow.getBoundingClientRect !== "function") return;
  const panelRect = root.getBoundingClientRect();
  const rowRect = selectedRow.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  const nextTop = Math.round(rowRect.top - panelRect.top + ((rowRect.height - popupRect.height) / 2));
  const nextLeft = Math.round(rowRect.left - panelRect.left - popupRect.width - 6);
  actionPopupTop.value = Math.max(4, nextTop);
  actionPopupLeft.value = nextLeft;
}

function requestActionPopupPositionUpdate() {
  if (actionPopupFrameId) {
    window.cancelAnimationFrame(actionPopupFrameId);
  }
  actionPopupFrameId = window.requestAnimationFrame(() => {
    actionPopupFrameId = 0;
    nextTick(() => {
      updateActionPopupPosition();
    });
  });
}

watch(
  [() => selectedUnitEntry.value?.id || "", () => activeTab.value, () => minimized.value, () => selectedFormationRow.value?.key || "", () => selectedTileUnits.value.length, () => selectedFormationUnits.value.length],
  () => {
    requestActionPopupPositionUpdate();
  },
  { immediate: true }
);

onMounted(() => {
  windowResizeHandler = () => {
    requestActionPopupPositionUpdate();
  };
  window.addEventListener("resize", windowResizeHandler);
});

onBeforeUnmount(() => {
  if (actionPopupFrameId) {
    window.cancelAnimationFrame(actionPopupFrameId);
    actionPopupFrameId = 0;
  }
  if (windowResizeHandler) {
    window.removeEventListener("resize", windowResizeHandler);
    windowResizeHandler = null;
  }
});

function selectMoveUnit(entry, event) {
  event?.stopPropagation?.();
  if (!canSelectMoveForEntry(entry)) return;
  const unitId = typeof entry?.id === "string" ? entry.id.trim() : "";
  if (!unitId) return;
  emit("select-move-unit", { unitId });
}

function selectAttackUnit(entry, event) {
  event?.stopPropagation?.();
  if (!canSelectAttackForEntry(entry)) return;
  const unitId = typeof entry?.id === "string" ? entry.id.trim() : "";
  if (!unitId) return;
  emit("select-attack-unit", { unitId });
}

function hpRate(entry) {
  const max = Math.max(1, Number(entry?.hpMax) || 1);
  const cur = Math.max(0, Number(entry?.hpCurrent) || 0);
  return Math.max(0, Math.min(100, (cur / max) * 100));
}

function resolveMoveDisplayValue(entry) {
  if (!entry) return 0;
  if (entry.isMoving && Number.isFinite(Number(entry?.moveTilesRemaining))) {
    return Math.max(0, Math.floor(Number(entry.moveTilesRemaining)));
  }
  return Math.max(0, Math.floor(Number(entry?.moveRemaining) || 0));
}

function resolveSurveyRemainingText(entry) {
  if (!entry?.isSurveying) return "";
  if (Number.isFinite(Number(entry?.surveyTotalTurns))) {
    const totalTurns = Math.max(0, Math.floor(Number(entry.surveyTotalTurns)));
    return `${totalTurns * TURN_SECONDS}秒`;
  }
  return Number.isFinite(Number(entry?.surveyDangerPercent))
    ? `${Math.max(0, Math.floor(Number(entry.surveyDangerPercent)))}%`
    : "?";
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
  <aside ref="panelRef" class="own-faction-panel" :class="{ minimized }">
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
      <span class="own-faction-panel-fold">{{ minimized ? "▽" : "△" }}</span>
    </header>

    <div
      v-if="isActionPopupVisible && !minimized"
      ref="actionPopupRef"
      class="own-faction-floating-action-popup"
      :style="{ top: `${actionPopupTop}px`, left: `${actionPopupLeft}px` }"
      @click.stop
    >
      <button
        type="button"
        class="own-faction-side-action-btn own-faction-side-action-attack"
        :disabled="!canSelectAttackForEntry(selectedUnitEntry)"
        @click="selectAttackUnit(selectedUnitEntry, $event)"
      >
        攻撃
      </button>
      <button
        type="button"
        class="own-faction-side-action-btn own-faction-side-action-move"
        :disabled="!canSelectMoveForEntry(selectedUnitEntry)"
        @click="selectMoveUnit(selectedUnitEntry, $event)"
      >
        移動
      </button>
    </div>

    <div v-if="!minimized" class="own-faction-panel-body">
      <div class="own-faction-panel-main">
      <template v-if="activeTab === 'formation'">
        <div class="own-faction-list own-faction-group-list" @scroll.passive="updateActionPopupPosition">
          <button
            v-for="row in formationRows"
            :key="`formation-row-${row.key}`"
            type="button"
            class="own-faction-group-row"
            :class="[
              row.type === 'governor' ? 'own-faction-unit-row own-faction-group-governor own-faction-unit-card' : 'own-faction-squad-row',
              {
                selected: row.type === 'governor'
                  ? isActionTargetRow({ id: row.unitId })
                  : (selectedFormationRow && selectedFormationRow.key === row.key)
              }
            ]"
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
            <span v-if="row.type === 'governor' && sovereignEntry" class="own-faction-hp-line">
              <span class="own-faction-hp-label">HP:</span>
              <span class="own-faction-hp-bar">
                <i :style="{ width: `${hpRate(sovereignEntry)}%` }"></i>
                <b>{{ sovereignEntry.hpCurrent }} / {{ sovereignEntry.hpMax }}</b>
              </span>
            </span>
            <span class="own-faction-unit-sub">
              {{ row.subText }}
              <span v-if="row.type === 'governor' && sovereignEntry" class="own-faction-status-list">
                <span
                  v-if="sovereignEntry.isMoving"
                  class="own-faction-status-chip own-faction-status-chip-move own-faction-moving-footprint"
                  title="移動中"
                  aria-label="移動中"
                >👣</span>
                <span
                  v-if="sovereignEntry.isSurveying"
                  class="own-faction-status-chip own-faction-status-chip-survey"
                  :title="`調査時間 ${resolveSurveyRemainingText(sovereignEntry)}`"
                  aria-label="調査中"
                >🔍{{ resolveSurveyRemainingText(sovereignEntry) }}</span>
                <img
                  v-if="sovereignEntry.isInBattle && sovereignEntry.battleIconSrc"
                  :src="sovereignEntry.battleIconSrc"
                  alt="戦闘中"
                  class="own-faction-battle-icon"
                  title="戦闘中"
                />
              </span>
            </span>
          </button>
        </div>

        <div class="own-faction-list own-faction-member-list" @scroll.passive="updateActionPopupPosition">
          <button
            v-for="entry in selectedFormationUnits"
            :key="`formation-unit-${entry.id}`"
            type="button"
            class="own-faction-unit-row own-faction-unit-card"
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
              <template v-if="entry.positioned">
                ({{ entry.x }}, {{ entry.y }}) / 移動{{ resolveMoveDisplayValue(entry) }}
                <span class="own-faction-status-list">
                  <span
                    v-if="entry.isMoving"
                    class="own-faction-status-chip own-faction-status-chip-move own-faction-moving-footprint"
                    title="移動中"
                    aria-label="移動中"
                  >👣</span>
                  <span
                    v-if="entry.isSurveying"
                    class="own-faction-status-chip own-faction-status-chip-survey"
                    :title="`調査時間 ${resolveSurveyRemainingText(entry)}`"
                    aria-label="調査中"
                  >🔍{{ resolveSurveyRemainingText(entry) }}</span>
                  <img
                    v-if="entry.isInBattle && entry.battleIconSrc"
                    :src="entry.battleIconSrc"
                    alt="戦闘中"
                    class="own-faction-battle-icon"
                    title="戦闘中"
                  />
                </span>
              </template>
              <template v-else>未配置</template>
            </span>
          </button>
          <div v-if="!selectedFormationUnits.length" class="own-faction-empty">表示対象なし</div>
        </div>
      </template>

      <div v-else class="own-faction-list own-faction-member-list" @scroll.passive="updateActionPopupPosition">
        <button
          v-for="entry in selectedTileUnits"
          :key="`tile-unit-${entry.id}`"
          type="button"
          class="own-faction-unit-row own-faction-unit-card"
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
          <span class="own-faction-unit-sub">
            ({{ entry.x }}, {{ entry.y }}) / 移動{{ resolveMoveDisplayValue(entry) }}
            <span class="own-faction-status-list">
              <span
                v-if="entry.isMoving"
                class="own-faction-status-chip own-faction-status-chip-move own-faction-moving-footprint"
                title="移動中"
                aria-label="移動中"
              >👣</span>
              <span
                v-if="entry.isSurveying"
                class="own-faction-status-chip own-faction-status-chip-survey"
                :title="`調査時間 ${resolveSurveyRemainingText(entry)}`"
                aria-label="調査中"
              >🔍{{ resolveSurveyRemainingText(entry) }}</span>
              <img
                v-if="entry.isInBattle && entry.battleIconSrc"
                :src="entry.battleIconSrc"
                alt="戦闘中"
                class="own-faction-battle-icon"
                title="戦闘中"
              />
            </span>
          </span>
        </button>
        <div v-if="!selectedTileUnits.length" class="own-faction-empty">このマスに自勢力ユニットはいません</div>
      </div>

      <section v-if="selectedDetailEntry" class="own-faction-detail">
        <button type="button" class="detail-icon-btn" title="詳細" aria-label="詳細" @click="openCharacterStatus">📝</button>
        <div class="own-faction-detail-grid">
          <div><span>種族</span><b>{{ selectedDetailEntry.race }}</b></div>
          <div><span>クラス</span><b>{{ selectedDetailEntry.className }}</b></div>
          <div class="paired-stat-row">
            <span class="paired-item"><span>Lv:</span><b>{{ selectedDetailEntry.level }}</b></span>
            <span class="paired-item paired-item-text"><span>役割:</span><b>{{ selectedDetailEntry.roleLabel }}</b></span>
          </div>
          <div class="paired-stat-row">
            <span class="paired-item"><span>索敵:</span><b>{{ selectedDetailEntry.scoutValue }}</b></span>
            <span class="paired-item"><span>隠密:</span><b>{{ selectedDetailEntry.stealthValue }}</b></span>
          </div>
          <div class="paired-stat-row">
            <span class="paired-item"><span>攻撃:</span><b>{{ selectedDetailEntry.status?.攻撃 }}</b></span>
            <span class="paired-item"><span>防御:</span><b>{{ selectedDetailEntry.status?.防御 }}</b></span>
          </div>
          <div class="paired-stat-row">
            <span class="paired-item"><span>魔力:</span><b>{{ selectedDetailEntry.status?.魔力 }}</b></span>
            <span class="paired-item"><span>精神:</span><b>{{ selectedDetailEntry.status?.精神 ?? "-" }}</b></span>
          </div>
          <div class="paired-stat-row">
            <span class="paired-item"><span>命中:</span><b>{{ selectedDetailEntry.status?.命中 ?? "-" }}</b></span>
            <span class="paired-item"><span>速度:</span><b>{{ selectedDetailEntry.status?.速度 }}</b></span>
          </div>
        </div>
      </section>
      </div>
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
  position: relative;
  overflow: visible;
}

.own-faction-panel-head {
  display: grid;
  grid-template-columns: 1fr auto;
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

.own-faction-panel-fold {
  font-size: 0.7rem;
  color: rgba(238, 249, 255, 0.96);
}

.own-faction-panel-body {
  display: grid;
  gap: 4px;
  padding: 5px;
  min-width: 0;
  overflow: visible;
}

.own-faction-floating-action-popup {
  position: absolute;
  width: 46px;
  display: grid;
  grid-template-rows: repeat(2, 1fr);
  gap: 3px;
  z-index: 8;
}

.own-faction-side-action-btn {
  min-width: 44px;
  min-height: 24px;
  border-radius: 8px;
  border: 1px solid rgba(210, 176, 120, 0.65);
  padding: 2px 2px;
  font-size: 0.64rem;
  font-weight: 800;
  color: #fff0c9;
  text-align: center;
  letter-spacing: 0.02em;
  cursor: pointer;
}

.own-faction-side-action-move {
  background: linear-gradient(180deg, rgba(48, 95, 131, 0.9), rgba(23, 64, 96, 0.9));
  border-color: rgba(137, 219, 255, 0.75);
}

.own-faction-side-action-attack {
  background: linear-gradient(180deg, rgba(140, 60, 48, 0.9), rgba(96, 36, 29, 0.9));
  border-color: rgba(255, 162, 140, 0.75);
}

.own-faction-side-action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.own-faction-panel-main {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.own-faction-list {
  min-height: 0;
  max-height: calc((var(--own-faction-row-height) * 4) + 6px);
  display: grid;
  gap: 2px;
  overflow-y: auto;
  overflow-x: hidden;
}

.own-faction-group-list {
  max-height: calc((var(--own-faction-row-height) * 3) + 6px);
}

.own-faction-unit-row,
.own-faction-squad-row {
  position: relative;
  isolation: isolate;
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

.own-faction-unit-row {
  overflow: visible;
}

.own-faction-squad-row {
  overflow: hidden;
}

.own-faction-group-row {
  min-height: 54px;
}

.own-faction-group-governor {
  min-height: var(--own-faction-row-height);
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
  border-color: rgba(132, 232, 255, 0.98);
  border-width: 2px;
  box-shadow: 0 0 0 1px rgba(133, 222, 255, 0.52), 0 0 16px rgba(58, 172, 220, 0.38), inset 0 0 12px rgba(120, 228, 255, 0.12);
}

.own-faction-unit-card.selected {
  z-index: 2;
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

.own-faction-status-list {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 4px;
  vertical-align: middle;
}

.own-faction-status-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 14px;
  padding: 0 4px;
  border-radius: 6px;
  font-size: 0.6rem;
  line-height: 1;
}

.own-faction-status-chip-move {
  color: #1f1206;
  background: linear-gradient(180deg, rgba(255, 223, 134, 0.95), rgba(232, 158, 66, 0.95));
  box-shadow: 0 0 0 1px rgba(255, 234, 176, 0.58), 0 0 8px rgba(255, 188, 88, 0.45);
  text-shadow: none;
}

.own-faction-status-chip-survey {
  color: #f5fff3;
  background: rgba(27, 81, 38, 0.86);
  box-shadow: 0 0 0 1px rgba(140, 243, 160, 0.34);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
}

.own-faction-battle-icon {
  width: 14px;
  height: 14px;
  object-fit: contain;
  image-rendering: auto;
  filter: drop-shadow(0 0 2px rgba(255, 108, 78, 0.7));
}

.own-faction-moving-footprint {
  display: inline-block;
  margin-left: 0;
  font-size: 0.72rem;
  line-height: 1;
  filter: drop-shadow(0 0 1px rgba(255, 245, 220, 0.95));
  animation: own-faction-moving-footprint-blink 0.9s ease-in-out infinite;
}

@keyframes own-faction-moving-footprint-blink {
  0%,
  100% {
    opacity: 0.25;
    transform: translateY(0);
  }
  50% {
    opacity: 1;
    transform: translateY(-0.5px);
  }
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
