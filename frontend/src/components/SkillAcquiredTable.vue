<script setup>
import { computed } from "vue";
import skillInfoDb from "../../../data/source/export/json/スキル一覧.json";
import { getIconSrcByName, hasIconName } from "../lib/icon-library.js";
import { computeSkillScaledTriplet } from "../lib/skill-power.js";

const props = defineProps({
  skillNames: { type: Array, default: () => [] },
  showTitle: { type: Boolean, default: true },
  title: { type: String, default: "取得スキル" },
  emptyText: { type: String, default: "取得スキルなし" },
  compact: { type: Boolean, default: false },
  showFamilyIcon: { type: Boolean, default: false },
  statusSource: { type: Object, default: null }
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
</script>

<template>
  <section class="skill-table-root" :class="{ compact }">
    <h4 v-if="showTitle">{{ title }}</h4>
    <div v-if="detailRows.length" class="skill-table-wrap">
      <div class="skill-list">
        <article
          v-for="(row, index) in detailRows"
          :key="`skill-row-${row.name}-${index}`"
          class="skill-row"
          :class="`action-${row.actionType}`"
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
.skill-table-root h4 {
  margin: 0 0 8px;
  color: #f0ddad;
  font-size: 0.85rem;
}

.skill-table-wrap {
  overflow-x: hidden;
  overflow-y: auto;
  border: 1px solid rgba(218, 186, 128, 0.24);
  border-radius: 8px;
  background: rgba(28, 20, 13, 0.45);
}

.skill-list {
  display: flex;
  flex-direction: column;
}

.skill-row {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  border-bottom: 1px solid rgba(218, 186, 128, 0.22);
  color: #eadab3;
  font-size: 13px;
}

.skill-row:last-child {
  border-bottom: none;
}

.skill-left {
  padding: 5px 2px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.skill-top {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 20px;
}

.skill-name-wrap {
  color: #f5e5bd;
  font-weight: 700;
}

.skill-name-wrap ruby {
  ruby-position: over;
}

.skill-name-wrap rt {
  font-size: 0.56rem;
  color: rgba(242, 227, 191, 0.76);
  line-height: 1;
}

.skill-family-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border: 1px solid rgba(216, 186, 132, 0.4);
  border-radius: 999px;
  color: #e8d6ad;
  background: rgba(52, 39, 24, 0.62);
}

.family-icon-wrap {
  width: 24px;
  height: 24px;
  border-radius: 4px;
}

.action-chip {
  margin-left: auto;
  min-width: 19px;
  height: 19px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
  font-weight: 800;
  border: 1px solid rgba(255, 255, 255, 0.25);
}

.action-action .action-chip {
  background: rgba(182, 95, 42, 0.72);
  color: #fff2dd;
}

.action-passive .action-chip {
  background: rgba(44, 117, 161, 0.72);
  color: #e5f7ff;
}

.action-action .skill-left {
  background: linear-gradient(90deg, rgba(90, 49, 28, 0.36), rgba(90, 49, 28, 0.06));
}

.action-passive .skill-left {
  background: linear-gradient(90deg, rgba(35, 77, 95, 0.35), rgba(35, 77, 95, 0.06));
}

.skill-bottom {
  display: flex;
  flex-wrap: wrap;
  gap: 0px 0px;
}

.skill-meta-chip {
  padding: 1px 6px;
  border-radius: 5px;
  border: 1px solid rgba(218, 186, 128, 0.24);
  background: rgba(17, 12, 7, 0.48);
  color: #e9dbb9;
  line-height: 1.35;
}

.skill-detail {
  padding: 7px 8px;
  border-left: 1px solid rgba(218, 186, 128, 0.16);
  color: #eadfca;
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.45;
}

.skill-inline-icon-wrap {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border: 1px solid rgba(232, 201, 145, 0.64);
  background: rgba(255, 255, 255, 0.14);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.skill-inline-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.skill-inline-icon-fallback {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border: 1px solid rgba(232, 201, 145, 0.48);
  background: rgba(255, 255, 255, 0.08);
  color: #f2e3bf;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.62rem;
  line-height: 1;
  flex: 0 0 auto;
}

.compact .skill-row {
  font-size: 0.7rem;
}

.compact .skill-left,
.compact .skill-detail {
  padding: 6px 7px;
}

@media (max-width: 1px) {
  .skill-row {
    grid-template-columns: 1fr;
  }

  .skill-detail {
    border-left: none;
    border-top: 1px solid rgba(218, 186, 128, 0.16);
  }
}
</style>
