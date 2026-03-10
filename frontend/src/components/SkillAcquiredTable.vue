<script setup>
import { computed } from "vue";
import skillInfoDb from "../../../data/source/export/json/スキル一覧.json";

const props = defineProps({
  skillNames: { type: Array, default: () => [] },
  showTitle: { type: Boolean, default: true },
  title: { type: String, default: "取得スキル" },
  emptyText: { type: String, default: "取得スキルなし" },
  compact: { type: Boolean, default: false }
});

function nonEmptyText(value) {
  const text = String(value ?? "").trim();
  return text.length ? text : "";
}

function toDisplayValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  const num = Number(value);
  if (Number.isFinite(num)) return String(num);
  const text = nonEmptyText(value);
  return text || "-";
}

const skillInfoMap = computed(() => {
  const map = new Map();
  if (!Array.isArray(skillInfoDb)) return map;
  for (const row of skillInfoDb) {
    const name = nonEmptyText(row?.名前);
    if (!name) continue;
    map.set(name, row);
  }
  return map;
});

const normalizedSkillNames = computed(() => {
  const source = Array.isArray(props.skillNames) ? props.skillNames : [];
  const seen = new Set();
  const out = [];
  for (const raw of source) {
    const name = nonEmptyText(raw);
    if (!name || name === "0" || name === "-" || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
});

const detailRows = computed(() => {
  return normalizedSkillNames.value.map(name => {
    const row = skillInfoMap.value.get(name);
    return {
      name,
      ruby: toDisplayValue(row?.ルビ),
      family: toDisplayValue(row?.系統),
      action: toDisplayValue(row?.行動),
      hpCost: toDisplayValue(row?.HP消費),
      apCost: toDisplayValue(row?.AP消費),
      ct: toDisplayValue(row?.CT),
      duration: toDisplayValue(row?.効果時間),
      detail: toDisplayValue(row?.詳細),
      attackStyle: toDisplayValue(row?.攻撃手段)
    };
  });
});
</script>

<template>
  <section class="skill-table-root" :class="{ compact }">
    <h4 v-if="showTitle">{{ title }}</h4>
    <div v-if="detailRows.length" class="skill-table-wrap">
      <table class="skill-table">
        <thead>
          <tr>
            <th>名前</th>
            <th>ルビ</th>
            <th>系統</th>
            <th>行動</th>
            <th>HP消費</th>
            <th>AP消費</th>
            <th>CT</th>
            <th>効果時間</th>
            <th>詳細</th>
            <th>攻撃手段</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in detailRows" :key="`skill-row-${row.name}-${index}`">
            <td class="name">{{ row.name }}</td>
            <td>{{ row.ruby }}</td>
            <td>{{ row.family }}</td>
            <td>{{ row.action }}</td>
            <td>{{ row.hpCost }}</td>
            <td>{{ row.apCost }}</td>
            <td>{{ row.ct }}</td>
            <td>{{ row.duration }}</td>
            <td class="detail">{{ row.detail }}</td>
            <td>{{ row.attackStyle }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="small">{{ emptyText }}</div>
  </section>
</template>

<style scoped>
.skill-table-root h4 {
  margin: 0 0 8px;
  color: #f0ddad;
  font-size: 0.85rem;
}

.skill-table-wrap {
  overflow-x: auto;
  border: 1px solid rgba(218, 186, 128, 0.24);
  border-radius: 8px;
  background: rgba(28, 20, 13, 0.45);
}

.skill-table {
  width: 100%;
  min-width: 860px;
  border-collapse: collapse;
  font-size: 0.77rem;
  color: #eadab3;
}

.skill-table th,
.skill-table td {
  border-bottom: 1px solid rgba(218, 186, 128, 0.2);
  padding: 6px 8px;
  text-align: left;
  vertical-align: top;
}

.skill-table th {
  background: rgba(58, 41, 24, 0.68);
  color: #fff1d2;
  font-weight: 700;
  white-space: nowrap;
}

.skill-table .name {
  color: #f5e5bd;
  font-weight: 700;
}

.skill-table .detail {
  min-width: 260px;
}

.compact .skill-table {
  font-size: 0.73rem;
}
</style>
