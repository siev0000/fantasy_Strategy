<script setup>
import { computed, ref, watch } from "vue";
import BaseModal from "./BaseModal.vue";
import skillTreeDb from "../data/skill-tree-db.json";

const props = defineProps({
  show: { type: Boolean, default: false },
  categories: {
    type: Array,
    default: () => []
  }
});

defineEmits(["close"]);

const allCategoryKeys = Object.keys(skillTreeDb);
const activeCategory = ref("");
const selectedSkillId = ref("");

function normalizeCategoryName(value) {
  return String(value || "").trim();
}

function toSection(key) {
  return {
    key,
    label: skillTreeDb[key]?.name || key,
    rootSkill: skillTreeDb[key]?.rootSkill || null,
    branches: Array.isArray(skillTreeDb[key]?.branches) ? skillTreeDb[key].branches : []
  };
}

function makeSkillId(branchId, skill) {
  return `${branchId}::${skill.tier}::${skill.name}`;
}

function makeRootSkillId(sectionKey, rootSkill) {
  return `root::${sectionKey}::${rootSkill?.id || rootSkill?.name || "root"}`;
}

function firstSkillId(section) {
  if (!section) return "";
  if (section.rootSkill) return makeRootSkillId(section.key, section.rootSkill);
  for (const branch of section.branches || []) {
    const first = Array.isArray(branch.skills) ? branch.skills[0] : null;
    if (first) return makeSkillId(branch.id, first);
  }
  return "";
}

function sectionHasSkillId(section, id) {
  if (!section || !id) return false;
  if (section.rootSkill && makeRootSkillId(section.key, section.rootSkill) === id) return true;
  for (const branch of section.branches || []) {
    for (const skill of branch.skills || []) {
      if (makeSkillId(branch.id, skill) === id) return true;
    }
  }
  return false;
}

const resolvedCategories = computed(() => {
  const requested = Array.isArray(props.categories)
    ? props.categories.map(normalizeCategoryName).filter(Boolean)
    : [];
  const source = requested.length ? requested : allCategoryKeys;
  const seen = new Set();
  const ordered = [];
  for (const key of source) {
    if (seen.has(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(skillTreeDb, key)) continue;
    seen.add(key);
    ordered.push(key);
  }
  return ordered;
});

const skippedCategories = computed(() => {
  const requested = Array.isArray(props.categories)
    ? props.categories.map(normalizeCategoryName).filter(Boolean)
    : [];
  if (!requested.length) return [];
  return requested.filter(key => !Object.prototype.hasOwnProperty.call(skillTreeDb, key));
});

const activeSection = computed(() => {
  if (!activeCategory.value) return null;
  if (!Object.prototype.hasOwnProperty.call(skillTreeDb, activeCategory.value)) return null;
  return toSection(activeCategory.value);
});

const selectedSkillInfo = computed(() => {
  const section = activeSection.value;
  if (!section || !selectedSkillId.value) return null;
  if (section.rootSkill && makeRootSkillId(section.key, section.rootSkill) === selectedSkillId.value) {
    const rootTier = Number.isFinite(Number(section.rootSkill.tier))
      ? Number(section.rootSkill.tier)
      : 1;
    return {
      categoryLabel: section.label,
      branchName: "起点",
      skill: section.rootSkill,
      prerequisite: "なし",
      pointCost: rootTier * 100
    };
  }
  for (const branch of section.branches) {
    for (let i = 0; i < branch.skills.length; i += 1) {
      const skill = branch.skills[i];
      if (makeSkillId(branch.id, skill) !== selectedSkillId.value) continue;
      const prerequisite = i > 0
        ? branch.skills[i - 1].name
        : (section.rootSkill?.name || "なし");
      return {
        categoryLabel: section.label,
        branchName: branch.name,
        skill,
        prerequisite,
        pointCost: skill.tier * 100
      };
    }
  }
  return null;
});

watch(resolvedCategories, list => {
  if (!Array.isArray(list) || !list.length) {
    activeCategory.value = "";
    return;
  }
  if (!list.includes(activeCategory.value)) {
    activeCategory.value = list[0];
  }
}, { immediate: true });

watch(activeSection, section => {
  if (!section) {
    selectedSkillId.value = "";
    return;
  }
  if (!sectionHasSkillId(section, selectedSkillId.value)) {
    selectedSkillId.value = firstSkillId(section);
  }
}, { immediate: true });

function selectCategory(key) {
  activeCategory.value = key;
}

function selectSkill(branch, skill) {
  selectedSkillId.value = makeSkillId(branch.id, skill);
}

function selectRootSkill() {
  const section = activeSection.value;
  if (!section?.rootSkill) return;
  selectedSkillId.value = makeRootSkillId(section.key, section.rootSkill);
}
</script>

<template>
  <base-modal
    :show="show"
    title="スキルツリー"
    :wide="true"
    @close="$emit('close')"
  >
    <div class="skill-tree-modal">
      <p class="small skill-tree-help">
        上でカテゴリを切り替え、中央で分岐ツリーを選択、右側で詳細を確認します。
      </p>

      <div v-if="skippedCategories.length" class="skill-tree-warning">
        未登録カテゴリ: {{ skippedCategories.join(" / ") }}
      </div>

      <div class="category-tabs" role="tablist" aria-label="スキルカテゴリ">
        <button
          v-for="key in resolvedCategories"
          :key="key"
          type="button"
          class="tab-btn"
          :class="{ active: key === activeCategory }"
          @click="selectCategory(key)"
        >
          {{ skillTreeDb[key]?.name || key }}
        </button>
      </div>

      <div v-if="activeSection" class="tree-layout">
        <section class="tree-canvas">
          <header class="tree-head">
            <h3>{{ activeSection.label }} ツリー</h3>
            <div class="small">分岐数: {{ activeSection.branches.length }}</div>
          </header>

          <div v-if="activeSection.rootSkill" class="root-zone">
            <button
              type="button"
              class="skill-node root-node"
              :class="{ selected: selectedSkillId === makeRootSkillId(activeSection.key, activeSection.rootSkill) }"
              @click="selectRootSkill"
            >
              <span class="node-tier">T{{ activeSection.rootSkill.tier }}</span>
              <span class="node-name">{{ activeSection.rootSkill.name }}</span>
            </button>
            <div class="root-down-link" />
            <div class="root-split-line" />
          </div>

          <div class="branch-columns">
            <article
              v-for="branch in activeSection.branches"
              :key="branch.id"
              class="branch-column"
            >
              <div class="branch-title">{{ branch.name }}</div>
              <div class="branch-stack">
                <template v-for="(skill, idx) in branch.skills" :key="`${branch.id}:${skill.tier}:${skill.name}`">
                  <button
                    type="button"
                    class="skill-node"
                    :class="{ selected: selectedSkillId === makeSkillId(branch.id, skill) }"
                    @click="selectSkill(branch, skill)"
                  >
                    <span class="node-tier">T{{ skill.tier }}</span>
                    <span class="node-name">{{ skill.name }}</span>
                  </button>
                  <div v-if="idx < branch.skills.length - 1" class="node-link" />
                </template>
              </div>
            </article>
          </div>
        </section>

        <aside class="skill-detail">
          <template v-if="selectedSkillInfo">
            <h3>{{ selectedSkillInfo.skill.name }}</h3>
            <div class="detail-meta">
              <span>{{ selectedSkillInfo.categoryLabel }}</span>
              <span>{{ selectedSkillInfo.branchName }}</span>
              <span>T{{ selectedSkillInfo.skill.tier }}</span>
            </div>
            <p class="detail-desc">{{ selectedSkillInfo.skill.desc }}</p>
            <ul class="detail-list">
              <li>必要ポイント(仮): {{ selectedSkillInfo.pointCost }}</li>
              <li>前提スキル: {{ selectedSkillInfo.prerequisite }}</li>
              <li>状態: 未解放（取得処理は未実装）</li>
            </ul>
            <button type="button" class="acquire-btn" disabled>取得（未実装）</button>
            <p class="small detail-note">
              ポイント獲得ロジックと解放判定は後続実装で接続します。
            </p>
          </template>
          <template v-else>
            <div class="small detail-note">表示できるスキルがありません。</div>
          </template>
        </aside>
      </div>

      <div v-else class="skill-tree-empty">
        表示可能なカテゴリがありません。
      </div>
    </div>
  </base-modal>
</template>

<style scoped>
.skill-tree-modal {
  display: grid;
  gap: 12px;
}

.skill-tree-help {
  margin: 0;
  color: #ddcda0;
}

.skill-tree-warning {
  border: 1px solid rgba(240, 178, 132, 0.55);
  border-radius: 8px;
  background: rgba(74, 29, 18, 0.56);
  color: #ffd9bf;
  padding: 8px 10px;
  font-size: 0.84rem;
}

.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tab-btn {
  border: 1px solid rgba(217, 184, 122, 0.45);
  border-radius: 999px;
  padding: 6px 12px;
  background: rgba(36, 27, 18, 0.66);
  color: #ebddbe;
  font-weight: 700;
  font-size: 0.82rem;
}

.tab-btn.active {
  background: linear-gradient(160deg, rgba(134, 88, 44, 0.82), rgba(87, 55, 26, 0.9));
  border-color: rgba(239, 204, 140, 0.74);
  color: #fff5dc;
  box-shadow: 0 0 0 1px rgba(245, 221, 170, 0.28) inset;
}

.tree-layout {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(250px, 1fr);
  gap: 12px;
}

.tree-canvas {
  border: 1px solid rgba(212, 180, 122, 0.38);
  border-radius: 10px;
  padding: 10px;
  background: radial-gradient(circle at 50% 0%, rgba(41, 28, 16, 0.76), rgba(19, 14, 9, 0.82));
}

.tree-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.tree-head h3 {
  margin: 0;
  color: #f4e1b1;
  letter-spacing: 0.03em;
}

.branch-columns {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  align-items: start;
}

.branch-column {
  border: 1px solid rgba(212, 180, 122, 0.28);
  border-radius: 8px;
  background: rgba(15, 11, 8, 0.6);
  padding: 8px;
}

.branch-title {
  text-align: center;
  color: #f4e5c4;
  font-weight: 700;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(212, 180, 122, 0.24);
  font-size: 0.86rem;
}

.root-zone {
  display: grid;
  justify-items: center;
  margin-bottom: 10px;
}

.root-node {
  width: min(220px, 100%);
}

.root-down-link {
  width: 2px;
  height: 14px;
  background: linear-gradient(to bottom, rgba(169, 209, 255, 0.72), rgba(145, 176, 221, 0.4));
}

.root-split-line {
  width: min(92%, 680px);
  height: 2px;
  background: linear-gradient(to right, rgba(169, 209, 255, 0.2), rgba(169, 209, 255, 0.74), rgba(169, 209, 255, 0.2));
  margin-bottom: 6px;
}

.branch-stack {
  display: grid;
  justify-items: center;
  align-items: start;
}

.skill-node {
  width: 100%;
  border: 1px solid rgba(215, 187, 132, 0.44);
  border-radius: 10px;
  background: linear-gradient(170deg, rgba(44, 32, 20, 0.86), rgba(23, 17, 11, 0.92));
  color: #f5e8c8;
  padding: 8px;
  display: grid;
  gap: 4px;
  text-align: left;
}

.skill-node.selected {
  border-color: rgba(246, 215, 150, 0.9);
  box-shadow: 0 0 0 1px rgba(246, 215, 150, 0.35), 0 0 14px rgba(246, 215, 150, 0.25);
  background: linear-gradient(170deg, rgba(96, 64, 32, 0.92), rgba(53, 34, 19, 0.96));
}

.node-tier {
  width: fit-content;
  border: 1px solid rgba(235, 204, 140, 0.5);
  border-radius: 999px;
  padding: 1px 7px;
  font-size: 0.72rem;
  font-weight: 700;
  color: #ffeec8;
  background: rgba(97, 62, 32, 0.64);
}

.node-name {
  font-size: 0.82rem;
  font-weight: 700;
  color: #f3e8d0;
  line-height: 1.35;
}

.node-link {
  width: 2px;
  height: 18px;
  background: linear-gradient(to bottom, rgba(169, 209, 255, 0.65), rgba(145, 176, 221, 0.3));
  margin: 4px 0;
}

.skill-detail {
  border: 1px solid rgba(212, 180, 122, 0.32);
  border-radius: 10px;
  background: rgba(14, 10, 7, 0.75);
  padding: 12px;
  display: grid;
  align-content: start;
  gap: 10px;
}

.skill-detail h3 {
  margin: 0;
  color: #f6e9c8;
  letter-spacing: 0.02em;
}

.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.detail-meta span {
  border: 1px solid rgba(223, 192, 136, 0.38);
  border-radius: 999px;
  padding: 2px 8px;
  color: #edd8ad;
  font-size: 0.74rem;
  background: rgba(70, 48, 28, 0.58);
}

.detail-desc {
  margin: 0;
  color: #e7d5ac;
  font-size: 0.85rem;
  line-height: 1.5;
}

.detail-list {
  margin: 0;
  padding-left: 16px;
  color: #dbc79f;
  font-size: 0.8rem;
  line-height: 1.5;
}

.acquire-btn {
  width: 100%;
}

.detail-note {
  margin: 0;
  color: #d4c093;
}

.skill-tree-empty {
  border: 1px dashed rgba(214, 181, 122, 0.45);
  border-radius: 10px;
  padding: 14px;
  text-align: center;
  color: #d9c79f;
}

@media (max-width: 980px) {
  .tree-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .branch-columns {
    grid-template-columns: 1fr;
  }
}
</style>
