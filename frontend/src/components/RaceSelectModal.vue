<script setup>
import { computed, ref, watch } from "vue";
import BaseModal from "./BaseModal.vue";
import raceSelectionDb from "../../../data/source/export/json/種族.json";
import classDb from "../../../data/source/export/json/クラス.json";

const props = defineProps({
  show: { type: Boolean, default: false },
  selectedRace: { type: String, default: "" },
  allowedRaces: { type: Array, default: () => [] },
  setupProgressText: { type: String, default: "" }
});

const emit = defineEmits(["close", "confirm"]);

const RACE_CLASS_NAME_MAP = {
  "只人": "ヒューマン",
  "エルフ": "エルフ",
  "オーガ": "オーガ",
  "ゴブリン": "ゴブリン",
  "竜人": "ドラゴニュート",
  "悪魔": "デヴィル",
  "天使": "エンジェル",
  "ヴァンパイア": "ヴァンパイア"
};

const BASE_STATUS_FIELDS = ["HP", "攻撃", "防御", "魔力", "精神", "速度", "命中", "SIZ"];

const races = computed(() => {
  if (!Array.isArray(raceSelectionDb)) return [];
  return raceSelectionDb.filter(item => {
    return item && typeof item.key === "string" && item.key.trim().length > 0;
  });
});

const allowedRaceSet = computed(() => {
  const set = new Set();
  if (!Array.isArray(props.allowedRaces)) return set;
  for (const raw of props.allowedRaces) {
    const key = String(raw || "").trim();
    if (!key) continue;
    set.add(key);
  }
  return set;
});

const filteredRaces = computed(() => {
  if (!races.value.length) return [];
  if (!allowedRaceSet.value.size) return races.value;
  return races.value.filter(item => allowedRaceSet.value.has(item.key));
});

const activeRaceKey = ref("");

const activeRace = computed(() => {
  if (!filteredRaces.value.length) return null;
  const found = filteredRaces.value.find(item => item.key === activeRaceKey.value);
  return found || filteredRaces.value[0];
});

watch(
  [() => props.show, filteredRaces, () => props.selectedRace],
  ([isOpen, allowedRows, selectedRace]) => {
    if (!isOpen) return;
    const list = Array.isArray(allowedRows) ? allowedRows : [];
    if (!list.length) {
      activeRaceKey.value = "";
      return;
    }
    const selected = list.find(item => item.key === selectedRace);
    if (selected) {
      activeRaceKey.value = selected.key;
      return;
    }
    const current = list.find(item => item.key === activeRaceKey.value);
    if (current) return;
    activeRaceKey.value = list[0]?.key || "";
  },
  { immediate: true }
);

function selectRace(key) {
  if (allowedRaceSet.value.size && !allowedRaceSet.value.has(key)) return;
  activeRaceKey.value = key;
}

function nonEmptyText(value) {
  const text = String(value ?? "").trim();
  return text.length ? text : "";
}

function toSafeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

const classRows = computed(() => {
  if (!Array.isArray(classDb)) return [];
  return classDb.filter(row => nonEmptyText(row?.名前));
});

const activeRaceStatusRows = computed(() => {
  const raceKey = activeRace.value?.key;
  if (!raceKey) return [];
  const raceClassName = RACE_CLASS_NAME_MAP[raceKey] || raceKey;
  const classRow = classRows.value.find(row => nonEmptyText(row.名前) === raceClassName);
  if (!classRow) return [];
  return BASE_STATUS_FIELDS.map(key => ({
    key,
    value: toSafeNumber(classRow[key])
  }));
});

function confirmRace() {
  if (!activeRace.value?.key) return;
  emit("confirm", activeRace.value.key);
}
</script>

<template>
  <base-modal :show="show" title="種族選択" :subtitle="setupProgressText" :wide="true" @close="$emit('close')">
    <div v-if="filteredRaces.length" class="race-select-layout">
      <aside class="race-list">
        <button
          v-for="race in filteredRaces"
          :key="race.key"
          type="button"
          class="race-list-item"
          :class="{ active: activeRace?.key === race.key }"
          @click="selectRace(race.key)"
        >
          {{ race.name }}
        </button>
      </aside>

      <section v-if="activeRace" class="race-detail">
        <header class="race-head">
          <img :src="activeRace.icon" :alt="`${activeRace.name} アイコン`" class="race-icon" />
          <div>
            <h3>{{ activeRace.name }}</h3>
            <div class="small">基礎値: HP {{ activeRace.hp }} / ATK {{ activeRace.atk }}</div>
          </div>
        </header>

        <p class="race-summary">{{ activeRace.summary }}</p>
        <p class="race-description">{{ activeRace.detail }}</p>

        <section class="race-status">
          <h4>ステータス</h4>
          <div v-if="activeRaceStatusRows.length" class="status-grid">
            <div v-for="item in activeRaceStatusRows" :key="item.key" class="status-chip">
              <span>{{ item.key }}</span>
              <strong>{{ item.value ?? "-" }}</strong>
            </div>
          </div>
          <div v-else class="small">ステータスデータなし</div>
        </section>

        <div class="race-traits">
          <span v-for="trait in activeRace.traits || []" :key="`${activeRace.key}:${trait}`" class="race-trait">
            {{ trait }}
          </span>
        </div>

        <div class="race-actions">
          <button type="button" @click="confirmRace">この種族で決定</button>
        </div>
      </section>
    </div>

    <div v-else class="race-empty">
      {{ races.length ? "選択可能な種族がありません。自陣営の種族データを確認してください。" : "種族データがありません。`data/source/export/json/種族.json` を確認してください。" }}
    </div>
  </base-modal>
</template>

<style scoped>
.race-select-layout {
  display: grid;
  grid-template-columns: minmax(180px, 220px) minmax(0, 1fr);
  gap: 12px;
}

.race-list {
  border: 1px solid rgba(210, 178, 119, 0.38);
  border-radius: 10px;
  background: rgba(24, 18, 12, 0.66);
  padding: 8px;
  display: grid;
  gap: 6px;
  align-content: start;
}

.race-list-item {
  width: 100%;
  text-align: left;
  border: 1px solid rgba(212, 181, 126, 0.32);
  background: rgba(46, 32, 20, 0.72);
  color: #f2e4c3;
  padding: 9px 10px;
  border-radius: 8px;
  font-size: 0.86rem;
  font-weight: 700;
}

.race-list-item.active {
  border-color: rgba(243, 212, 146, 0.8);
  background: linear-gradient(160deg, rgba(139, 91, 44, 0.86), rgba(89, 57, 30, 0.9));
  box-shadow: 0 0 0 1px rgba(248, 226, 177, 0.35) inset;
}

.race-detail {
  border: 1px solid rgba(210, 178, 119, 0.38);
  border-radius: 10px;
  background: linear-gradient(170deg, rgba(27, 19, 13, 0.78), rgba(17, 12, 8, 0.82));
  padding: 12px;
  display: grid;
  gap: 10px;
}

.race-head {
  display: flex;
  gap: 10px;
  align-items: center;
}

.race-head h3 {
  margin: 0;
  color: #f4e5c2;
  letter-spacing: 0.03em;
}

.race-icon {
  width: 86px;
  height: 86px;
  border-radius: 10px;
  object-fit: cover;
  border: 1px solid rgba(222, 191, 133, 0.5);
  background: rgba(0, 0, 0, 0.18);
}

.race-summary {
  margin: 0;
  color: #f1deb4;
  font-weight: 700;
}

.race-description {
  margin: 0;
  color: #decca1;
  font-size: 0.86rem;
  line-height: 1.55;
}

.race-status {
  border: 1px solid rgba(211, 179, 121, 0.26);
  border-radius: 8px;
  padding: 8px;
  background: rgba(22, 16, 11, 0.5);
}

.race-status h4 {
  margin: 0 0 7px;
  color: #f0ddad;
  font-size: 0.85rem;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.status-chip {
  border: 1px solid rgba(218, 186, 128, 0.28);
  border-radius: 6px;
  padding: 5px 7px;
  background: rgba(48, 34, 21, 0.55);
  display: flex;
  justify-content: space-between;
  color: #e8d8b0;
  font-size: 0.78rem;
}

.status-chip strong {
  color: #fff2d3;
}

.race-traits {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.race-trait {
  border: 1px solid rgba(223, 193, 139, 0.42);
  border-radius: 999px;
  background: rgba(63, 43, 25, 0.72);
  color: #f3e4be;
  font-size: 0.78rem;
  padding: 3px 10px;
}

.race-actions {
  margin-top: 2px;
}

.race-empty {
  border: 1px dashed rgba(214, 181, 122, 0.45);
  border-radius: 10px;
  padding: 12px;
  color: #d9c79f;
}

@media (max-width: 1px) {
  .race-select-layout {
    grid-template-columns: 1fr;
  }

  .status-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
