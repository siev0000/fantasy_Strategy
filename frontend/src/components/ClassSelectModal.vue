<script setup>
import { computed, ref, watch } from "vue";
import BaseModal from "./BaseModal.vue";
import SkillAcquiredTable from "./SkillAcquiredTable.vue";
import classDb from "../../../data/source/export/json/クラス.json";
import skillDescDb from "../../../data/source/export/json/説明.json";

const props = defineProps({
  show: { type: Boolean, default: false },
  selectedRace: { type: String, default: "" },
  selectedClass: { type: String, default: "" }
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

const SKILL_FIELDS = [
  "指揮",
  "威圧",
  "看破",
  "早業",
  "技術",
  "隠密",
  "索敵",
  "農業",
  "林業",
  "漁業",
  "工業",
  "統治",
  "交渉",
  "魔法技術",
  "信仰"
];

const BASE_STATUS_FIELDS = ["HP", "攻撃", "防御", "魔力", "精神", "速度", "命中", "SIZ"];
const RESIST_FIELDS = [
  "物理耐性",
  "魔法耐性",
  "炎耐性",
  "氷耐性",
  "雷耐性",
  "毒耐性",
  "光耐性",
  "闇耐性",
  "精神耐性",
  "怯み耐性",
  "出血耐性",
  "拘束耐性",
  "幻覚耐性",
  "Cr率耐性",
  "Cr威力耐性"
];
const ACQUIRED_SKILL_FIELDS = ["Skill1", "Skill2", "Skill3", "Skill4", "Skill5", "Skill6", "Skill7", "Skill8", "Skill9", "Skill10"];

function toSafeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function nonEmptyText(value) {
  const text = String(value ?? "").trim();
  return text.length ? text : "";
}

function isPlaceholderSkillName(value) {
  const text = nonEmptyText(value).toLowerCase();
  if (!text) return true;
  return text === "0" || text === "-" || text === "－" || text === "なし" || text === "null";
}

const allClasses = computed(() => {
  if (!Array.isArray(classDb)) return [];
  return classDb.filter(row => nonEmptyText(row?.名前));
});

const skillDescMap = computed(() => {
  const map = new Map();
  if (!Array.isArray(skillDescDb)) return map;
  for (const row of skillDescDb) {
    const name = nonEmptyText(row?.技能名);
    if (!name) continue;
    map.set(name, nonEmptyText(row?.説明));
  }
  return map;
});

const classCandidates = computed(() => {
  const race = nonEmptyText(props.selectedRace);
  if (!race) return [];
  const raceClassName = RACE_CLASS_NAME_MAP[race] || race;
  const raceBase = allClasses.value.filter(row => nonEmptyText(row.名前) === raceClassName);
  const jobs = allClasses.value.filter(row => nonEmptyText(row.種類) === "職業");
  const merged = [...raceBase, ...jobs];
  const seen = new Set();
  return merged.filter(row => {
    const key = nonEmptyText(row.名前);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
});

const activeClassName = ref("");

const activeClass = computed(() => {
  if (!classCandidates.value.length) return null;
  return classCandidates.value.find(row => nonEmptyText(row.名前) === activeClassName.value) || classCandidates.value[0];
});

const baseStatusRows = computed(() => {
  const row = activeClass.value;
  if (!row) return [];
  return BASE_STATUS_FIELDS.map(key => ({ key, value: toSafeNumber(row[key]) }));
});

const resistRows = computed(() => {
  const row = activeClass.value;
  if (!row) return [];
  return RESIST_FIELDS.map(key => ({ key, value: toSafeNumber(row[key]) }))
    .filter(item => item.value !== null);
});

const skillRows = computed(() => {
  const row = activeClass.value;
  if (!row) return [];
  return SKILL_FIELDS.map(key => {
    const value = toSafeNumber(row[key]);
    return {
      key,
      value: value ?? 0,
      desc: skillDescMap.value.get(key) || ""
    };
  }).filter(item => item.value > 0);
});

const acquiredSkillNames = computed(() => {
  const row = activeClass.value;
  if (!row) return [];
  if (nonEmptyText(row.種類) === "人族") return [];
  const list = [];
  const seen = new Set();
  for (const key of ACQUIRED_SKILL_FIELDS) {
    const name = nonEmptyText(row[key]);
    if (isPlaceholderSkillName(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    list.push(name);
  }
  return list;
});

const showAcquiredSkills = computed(() => {
  const row = activeClass.value;
  if (!row) return false;
  return nonEmptyText(row.種類) !== "人族";
});

watch([() => props.show, classCandidates, () => props.selectedClass], ([isOpen, candidates, selectedClass]) => {
  if (!isOpen) return;
  const selected = nonEmptyText(selectedClass);
  if (selected && candidates.some(row => nonEmptyText(row.名前) === selected)) {
    activeClassName.value = selected;
    return;
  }
  if (!candidates.length) {
    activeClassName.value = "";
    return;
  }
  activeClassName.value = nonEmptyText(candidates[0].名前);
}, { immediate: true });

function selectClass(name) {
  activeClassName.value = name;
}

function confirmClass() {
  const row = activeClass.value;
  if (!row) return;
  emit("confirm", {
    race: props.selectedRace,
    className: nonEmptyText(row.名前),
    classType: nonEmptyText(row.種類)
  });
}
</script>

<template>
  <base-modal :show="show" title="クラス選択" :wide="true" @close="$emit('close')">
    <div v-if="selectedRace && classCandidates.length" class="class-layout">
      <aside class="class-list">
        <div class="small class-list-head">種族: {{ selectedRace }}</div>
        <button
          v-for="row in classCandidates"
          :key="row.名前"
          type="button"
          class="class-item"
          :class="{ active: activeClass?.名前 === row.名前 }"
          @click="selectClass(row.名前)"
        >
          <span>{{ row.名前 }}</span>
          <span class="class-kind">{{ row.種類 }}</span>
        </button>
      </aside>

      <section v-if="activeClass" class="class-detail">
        <header class="class-title">
          <h3>{{ activeClass.名前 }}</h3>
          <div class="small">種別: {{ activeClass.種類 }} / 合計: {{ activeClass.合計 || "-" }}</div>
          <p class="class-text">{{ activeClass.詳細 || "詳細説明は未設定です。" }}</p>
        </header>

        <section class="detail-block">
          <h4>ステータス</h4>
          <div class="status-grid">
            <div v-for="item in baseStatusRows" :key="item.key" class="status-chip">
              <span>{{ item.key }}</span>
              <strong>{{ item.value ?? "-" }}</strong>
            </div>
          </div>
        </section>

        <section class="detail-block">
          <h4>技能</h4>
          <div v-if="skillRows.length" class="skill-grid">
            <article v-for="item in skillRows" :key="item.key" class="skill-card">
              <div class="skill-head">
                <strong>{{ item.key }}</strong>
                <span>Lv {{ item.value }}</span>
              </div>
              <p class="small">{{ item.desc || "説明なし" }}</p>
            </article>
          </div>
          <div v-else class="small">技能データなし</div>
        </section>

        <section v-if="showAcquiredSkills" class="detail-block">
          <skill-acquired-table
            :skill-names="acquiredSkillNames"
            :show-title="true"
            title="取得スキル"
            empty-text="取得スキルなし"
          />
        </section>

        <details v-if="resistRows.length" class="resist-box">
          <summary>耐性詳細</summary>
          <div class="resist-grid">
            <div v-for="item in resistRows" :key="item.key" class="small">
              {{ item.key }}: {{ item.value }}
            </div>
          </div>
        </details>

        <div class="class-actions">
          <button type="button" @click="confirmClass">このクラスで決定</button>
        </div>
      </section>
    </div>

    <div v-else class="class-empty">
      <p v-if="!selectedRace">先に種族を選択してください。</p>
      <p v-else>この種族に対応するクラスデータがありません。</p>
    </div>
  </base-modal>
</template>

<style scoped>
.class-layout {
  display: grid;
  grid-template-columns: minmax(200px, 240px) minmax(0, 1fr);
  gap: 12px;
}

.class-list {
  border: 1px solid rgba(210, 178, 119, 0.38);
  border-radius: 10px;
  background: rgba(24, 18, 12, 0.66);
  padding: 8px;
  display: grid;
  gap: 6px;
  align-content: start;
}

.class-list-head {
  color: #f3e4be;
  margin-bottom: 4px;
}

.class-item {
  width: 100%;
  text-align: left;
  border: 1px solid rgba(212, 181, 126, 0.32);
  background: rgba(46, 32, 20, 0.72);
  color: #f2e4c3;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 0.84rem;
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.class-item.active {
  border-color: rgba(243, 212, 146, 0.8);
  background: linear-gradient(160deg, rgba(139, 91, 44, 0.86), rgba(89, 57, 30, 0.9));
}

.class-kind {
  opacity: 0.86;
  font-size: 0.74rem;
}

.class-detail {
  max-height: 700px;
  border: 1px solid rgba(210, 178, 119, 0.38);
  border-radius: 10px;
  background: linear-gradient(170deg, rgba(27, 19, 13, 0.78), rgba(17, 12, 8, 0.82));
  padding: 12px;
  display: grid;
  gap: 10px;
  overflow-y: scroll;
}

.class-title h3 {
  margin: 0;
  color: #f4e5c2;
}

.class-text {
  margin: 6px 0 0;
  color: #decca1;
  font-size: 0.84rem;
  line-height: 1.5;
}

.detail-block {
  border: 1px solid rgba(211, 179, 121, 0.26);
  border-radius: 8px;
  padding: 8px;
  background: rgba(22, 16, 11, 0.5);
}

.detail-block h4 {
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

.skill-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.skill-card {
  border: 1px solid rgba(218, 186, 128, 0.24);
  border-radius: 6px;
  padding: 6px;
  background: rgba(42, 30, 19, 0.48);
}

.skill-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: #f1e0b7;
  font-size: 0.8rem;
}

.skill-card p {
  margin: 6px 0 0;
  color: #dac79d;
}

.resist-box {
  border: 1px solid rgba(210, 178, 119, 0.24);
  border-radius: 8px;
  background: rgba(22, 16, 11, 0.44);
  padding: 6px 8px;
  color: #e3d2aa;
}

.resist-grid {
  margin-top: 6px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px 8px;
}

.class-actions {
  display: flex;
  justify-content: flex-end;
}

.class-empty {
  border: 1px dashed rgba(214, 181, 122, 0.45);
  border-radius: 10px;
  padding: 12px;
  color: #d9c79f;
}

@media (max-width: 980px) {
  .class-layout {
    grid-template-columns: 1fr;
  }

  .status-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .skill-grid {
    grid-template-columns: 1fr;
  }

  .resist-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
