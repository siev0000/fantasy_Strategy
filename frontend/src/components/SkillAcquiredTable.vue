<script setup>
import { computed, ref } from "vue";
import { skillData as skillInfoDb } from "../lib/game-data-registry.js";
import { getIconSrcByName, hasIconName } from "../lib/icon-library.js";
import { computeSkillScaledTriplet } from "../lib/skill-power.js";

const props = defineProps({
  skillNames: { type: Array, default: () => [] },
  showTitle: { type: Boolean, default: true },
  title: { type: String, default: "取得スキル" },
  emptyText: { type: String, default: "取得スキルなし" },
  compact: { type: Boolean, default: false },
  showFamilyIcon: { type: Boolean, default: false },
  statusSource: { type: Object, default: null },
  selectable: { type: Boolean, default: false },
  selectedName: { type: String, default: "" },
  variant: { type: String, default: "default" }
});
const emit = defineEmits(["select-skill"]);

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

function toOptionalText(value) {
  const text = nonEmptyText(value);
  return text || "";
}

function resolveActionType(value) {
  const text = nonEmptyText(value).toUpperCase();
  if (text === "P" || text === "PASSIVE" || text === "パッシブ") return "passive";
  return "action";
}

function resolveIconNameFromText(value) {
  const text = nonEmptyText(value);
  if (!text || text === "-") return "";
  if (hasIconName(text)) return text;
  const chunks = text
    .split(/[\s/／・,，\+\+]+/)
    .map(nonEmptyText)
    .filter(Boolean);
  for (const chunk of chunks) {
    if (hasIconName(chunk)) return chunk;
  }
  return "";
}

function iconSrcFromText(value) {
  const name = resolveIconNameFromText(value);
  if (!name) return "";
  return getIconSrcByName(name, "");
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
    const attackStyleRaw = toDisplayValue(row?.攻撃手段);
    const familyRaw = toDisplayValue(row?.系統);
    const actionType = resolveActionType(row?.行動);
    const scaled = computeSkillScaledTriplet(row, props.statusSource);
    return {
      name,
      ruby: toOptionalText(row?.ルビ),
      family: familyRaw,
      actionType,
      actionShort: actionType === "passive" ? "P" : "A",
      apCost: toDisplayValue(row?.AP消費),
      ct: toDisplayValue(row?.CT),
      duration: toDisplayValue(row?.効果時間),
      power: toDisplayValue(scaled.power),
      state: toDisplayValue(scaled.state),
      guard: toDisplayValue(scaled.guard),
      detail: toDisplayValue(row?.詳細),
      attackStyle: attackStyleRaw,
      attackStyleIconSrc: iconSrcFromText(attackStyleRaw),
      familyIconSrc: iconSrcFromText(familyRaw)
    };
  });
});

const normalizedSelectedName = computed(() => nonEmptyText(props.selectedName));
const expandedOperationSkill = ref("");

function isOperationVariant() {
  return props.variant === "operation";
}

function toggleOperationSkill(row) {
  const name = nonEmptyText(row?.name);
  if (!name) return;
  expandedOperationSkill.value = expandedOperationSkill.value === name ? "" : name;
}

function handleSkillRowClick(row) {
  if (!props.selectable) return;
  const name = nonEmptyText(row?.name);
  if (!name) return;
  emit("select-skill", { name, row });
}

function handleSkillRowKeydown(event, row) {
  if (!props.selectable) return;
  const key = nonEmptyText(event?.key).toLowerCase();
  if (key !== "enter" && key !== " ") return;
  event.preventDefault();
  handleSkillRowClick(row);
}
</script>

<template>
  <section class="skill-table-root" :class="{ compact }">
    <h4 v-if="showTitle">{{ title }}</h4>
    <div v-if="detailRows.length && isOperationVariant()" class="operation-technique-list">
      <article
        v-for="(row, index) in detailRows"
        :key="`operation-skill-${row.name}-${index}`"
        class="operation-technique-card"
        :class="{ expanded: expandedOperationSkill === row.name }"
        role="button"
        tabindex="0"
        :aria-expanded="expandedOperationSkill === row.name"
        @click="toggleOperationSkill(row)"
        @keydown.enter.prevent="toggleOperationSkill(row)"
        @keydown.space.prevent="toggleOperationSkill(row)"
      >
        <div class="operation-technique-summary">
          <span class="operation-technique-icon">
            <img v-if="row.attackStyleIconSrc" :src="row.attackStyleIconSrc" :alt="row.attackStyle" />
            <span v-else>{{ row.attackStyle !== '-' ? row.attackStyle.slice(0, 1) : "?" }}</span>
          </span>
          <b class="operation-technique-name">{{ row.name }}</b>
          <small class="operation-technique-ap">AP {{ row.apCost }}</small>
          <span class="operation-technique-meta">威/状/守 {{ row.power }}/{{ row.state }}/{{ row.guard }} · {{ row.family }} · CT {{ row.ct }}</span>
        </div>
        <div v-if="expandedOperationSkill === row.name" class="operation-technique-detail">
          <span>{{ row.detail }}</span>
          <small>効果 {{ row.duration }} / {{ row.actionShort }}</small>
        </div>
      </article>
    </div>

    <div v-else-if="detailRows.length" class="skill-table-wrap">
      <div class="skill-list">
        <article
          v-for="(row, index) in detailRows"
          :key="`skill-row-${row.name}-${index}`"
          class="skill-row"
          :class="[
            `action-${row.actionType}`,
            { selectable: props.selectable, selected: normalizedSelectedName && normalizedSelectedName === row.name }
          ]"
          :role="props.selectable ? 'button' : null"
          :tabindex="props.selectable ? 0 : null"
          @click="handleSkillRowClick(row)"
          @keydown="handleSkillRowKeydown($event, row)"
        >
          <div class="skill-left">
            <div class="skill-top">
              <span v-if="row.attackStyleIconSrc" class="skill-inline-icon-wrap">
                <img :src="row.attackStyleIconSrc" :alt="row.attackStyle" class="skill-inline-icon" />
              </span>
              <span v-else class="skill-inline-icon-fallback">{{ row.attackStyle !== '-' ? row.attackStyle.slice(0, 1) : "?" }}</span>
              <div class="skill-name-wrap">
                <ruby v-if="row.ruby">
                  <rb>{{ row.name }}</rb>
                  <rt>{{ row.ruby }}</rt>
                </ruby>
                <span v-else>{{ row.name }}</span>
              </div>
              <span class="skill-family-chip">
                <span v-if="showFamilyIcon && row.familyIconSrc" class="skill-inline-icon-wrap family-icon-wrap">
                  <img :src="row.familyIconSrc" :alt="row.family" class="skill-inline-icon" />
                </span>
                <span>{{ row.family }}</span>
              </span>
              <span class="action-chip">{{ row.actionShort }}</span>
            </div>
            <div class="skill-bottom">
              <span class="skill-meta-chip">威/状/守 {{ row.power }}/{{ row.state }}/{{ row.guard }}</span>
              <span class="skill-meta-chip">AP {{ row.apCost }}</span>
              <span class="skill-meta-chip">CT {{ row.ct }}</span>
              <span class="skill-meta-chip">効果 {{ row.duration }}</span>
            </div>
          </div>
          <div class="skill-detail">
            {{ row.detail }}
          </div>
        </article>
      </div>
    </div>
    <div v-else class="small">{{ emptyText }}</div>
  </section>
</template>

<style scoped>
.operation-technique-list {
  display:grid;
  gap:5px;
}

.operation-technique-card {
  min-width:0;
  border:1px solid #46565d;
  border-radius:8px;
  background:linear-gradient(180deg,#162126,#10181c);
  color:#e8efec;
  cursor:pointer;
  overflow:hidden;
}

.operation-technique-card:hover,
.operation-technique-card:focus-visible {
  border-color:#6ab8c6;
  outline:none;
}

.operation-technique-summary {
  min-width:0;
  display:grid;
  grid-template-columns:28px minmax(0,1fr) auto;
  grid-template-areas:
    "icon name ap"
    "icon meta meta";
  align-items:center;
  gap:1px 4px;
  padding:2px 3px;
}

.operation-technique-icon {
  grid-area:icon;
  width:28px;
  height:28px;
  display:grid;
  place-items:center;
  border:1px solid #40545a;
  border-radius:7px;
  background:#1b2a30;
  color:#d5e0df;
  font-size:16px;
  line-height:1;
  overflow:hidden;
}

.operation-technique-icon img {
  width:26px;
  height:26px;
  object-fit:contain;
  filter:drop-shadow(0 1px 1px rgba(0,0,0,.55));
}

.operation-technique-name {
  grid-area:name;
  min-width:0;
  margin:0;
  color:#edf4f3;
  font-size:10px;
  line-height:1.15;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}

.operation-technique-ap {
  grid-area:ap;
  margin:0;
  color:#d8c17f;
  font-size:8px;
  line-height:1;
  white-space:nowrap;
}

.operation-technique-meta {
  grid-area:meta;
  min-width:0;
  color:#aebfc2;
  font-size:8px;
  line-height:1.1;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}

.operation-technique-detail {
  display:grid;
  gap:3px;
  padding:4px 5px;
  border-top:1px solid #35464d;
  background:#0e171b;
  color:#eef4f2;
  font-size:9px;
  line-height:1.35;
}

.operation-technique-detail small {
  color:#9fb0b3;
  font-size:8px;
}

.skill-table-root h4 {
  margin: 0 0 7px;
  color: #dce8e7;
  font-size: 13px;
}

.skill-table-wrap {
  overflow: auto;
  border: 1px solid #294047;
  border-radius: 7px;
  background: #0c171b;
  scrollbar-width: thin;
  scrollbar-color: #405b63 transparent;
}

.skill-list {
  display: flex;
  flex-direction: column;
}

.skill-row {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  border-bottom: 1px solid #253b42;
  background: #0f1d22;
  color: #c9d7d8;
  font-size: 12px;
}

.skill-row:last-child {
  border-bottom: none;
}

.skill-row.selectable {
  cursor: pointer;
}

.skill-row.selectable:hover {
  background: #13262c;
}

.skill-row.selectable.selected {
  outline: 1px solid #71d1df;
  outline-offset: -1px;
  background: #16343c;
}

.skill-left {
  padding: 6px 7px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.skill-top {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
}

.skill-name-wrap {
  color: #edf4f3;
  font-weight: 800;
}

.skill-name-wrap ruby {
  ruby-position: over;
}

.skill-name-wrap rt {
  color: #82979b;
  font-size: 9px;
  line-height: 1;
}

.skill-family-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border: 1px solid #365159;
  border-radius: 999px;
  background: #13252b;
  color: #a9bec1;
  font-size: 10px;
}

.family-icon-wrap {
  width: 22px;
  height: 22px;
  border-radius: 4px;
}

.action-chip {
  margin-left: auto;
  min-width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #4a626a;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 900;
}

.action-action .action-chip {
  border-color: #8b6751;
  background: #5c3427;
  color: #ffe2d7;
}

.action-passive .action-chip {
  border-color: #47758a;
  background: #214a5b;
  color: #dff4fb;
}

.action-action .skill-left {
  border-left: 2px solid #8d5b49;
}

.action-passive .skill-left {
  border-left: 2px solid #4b879d;
}

.skill-bottom {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.skill-meta-chip {
  padding: 1px 5px;
  border: 1px solid #314951;
  border-radius: 4px;
  background: #0c181c;
  color: #9fb2b5;
  line-height: 1.35;
  font-size: 10px;
}

.skill-detail {
  padding: 7px 8px;
  border-left: 1px solid #294047;
  color: #b5c5c7;
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.45;
}

.skill-inline-icon-wrap,
.skill-inline-icon-fallback {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  border: 1px solid #45616a;
  border-radius: 5px;
  background: #17282e;
}

.skill-inline-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.skill-inline-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

.skill-inline-icon-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #9ce8f1;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
}

.compact .skill-row {
  font-size: 11px;
}

.compact .skill-left,
.compact .skill-detail {
  padding: 5px 6px;
}

@media (max-width: 760px) {
  .skill-row {
    grid-template-columns: 1fr;
  }

  .skill-detail {
    border-left: none;
    border-top: 1px solid #294047;
  }
}
</style>
