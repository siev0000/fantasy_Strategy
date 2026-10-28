<script setup>
const props = defineProps({
  show: { type: Boolean, default: false },
  currentState: {
    type: Object,
    default: () => ({
      allies: [],
      enemies: [],
      log: [],
      statusText: "",
      statusClass: ""
    })
  },
  actionDisabled: { type: Boolean, default: false },
  nextDisabled: { type: Boolean, default: false },
  resetDisabled: { type: Boolean, default: false }
});

defineEmits(["close", "action"]);

function unitHpRatio(unit) {
  return Math.round((unit.hp / unit.maxHp) * 100);
}
</script>

<template>
  <aside v-if="show" class="battle-side-panel" role="complementary" aria-label="戦闘画面">
    <header class="battle-side-header">
      <div class="battle-side-title-wrap">
        <h2>戦闘画面</h2>
        <div class="battle-side-status" :class="props.currentState.statusClass || ''">
          {{ props.currentState.statusText || "行動を選択してください。" }}
        </div>
      </div>
      <button type="button" class="battle-side-close secondary" @click="$emit('close')">閉じる</button>
    </header>

    <div class="battle-side-body">
      <section class="battle-side-section">
        <h3>味方</h3>
        <div class="battle-unit-list">
          <article
            v-for="unit in props.currentState.allies"
            :key="unit.id"
            class="battle-unit-card ally"
            :class="{ dead: !unit.alive }"
          >
            <div class="battle-unit-head">
              <strong>{{ unit.name }}</strong>
              <span>{{ unit.hp }}/{{ unit.maxHp }}</span>
            </div>
            <div class="battle-unit-meta">{{ unit.race }} / ATK {{ unit.atk }}</div>
            <div class="battle-hp-wrap">
              <div class="battle-hp-bar" :style="{ width: unitHpRatio(unit) + '%' }"></div>
            </div>
          </article>
        </div>
      </section>

      <section class="battle-side-section">
        <h3>敵</h3>
        <div class="battle-unit-list">
          <article
            v-for="unit in props.currentState.enemies"
            :key="unit.id"
            class="battle-unit-card enemy"
            :class="{ dead: !unit.alive }"
          >
            <div class="battle-unit-head">
              <strong>{{ unit.name }}</strong>
              <span>{{ unit.hp }}/{{ unit.maxHp }}</span>
            </div>
            <div class="battle-unit-meta">{{ unit.race }} / ATK {{ unit.atk }}</div>
            <div class="battle-hp-wrap">
              <div class="battle-hp-bar" :style="{ width: unitHpRatio(unit) + '%' }"></div>
            </div>
          </article>
        </div>
      </section>

      <section class="battle-side-actions">
        <button type="button" @click="$emit('action', 'attack')" :disabled="props.actionDisabled">通常攻撃</button>
        <button type="button" class="secondary" @click="$emit('action', 'skill')" :disabled="props.actionDisabled">種族スキル</button>
        <button type="button" @click="$emit('action', 'next')" :disabled="props.nextDisabled">ターン終了</button>
        <button type="button" class="secondary" @click="$emit('action', 'reset')" :disabled="props.resetDisabled">リセット</button>
      </section>

      <section class="battle-side-section battle-log-section">
        <h3>ログ</h3>
        <div class="battle-log-list">
          <div v-for="(entry, idx) in props.currentState.log" :key="idx" class="battle-log-entry">
            <b v-if="entry.strong">{{ entry.text }}</b>
            <span v-else>{{ entry.text }}</span>
          </div>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.battle-side-panel {
  position: fixed;
  left: 12px;
  top: 76px;
  width: min(250px, calc(100vw - 24px));
  height: min(300px, calc(100vh - 88px));
  z-index: 1150;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 8px;
  padding: 10px;
  border: 1px solid rgba(216, 186, 131, 0.55);
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(31, 21, 13, 0.96), rgba(14, 10, 7, 0.96));
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.42);
  color: #f4ead0;
  pointer-events: auto;
}

.battle-side-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 8px;
}

.battle-side-title-wrap {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.battle-side-header h2 {
  margin: 0;
  font-size: 0.9rem;
  color: #f8e2a6;
}

.battle-side-status {
  min-height: 36px;
  padding: 6px 8px;
  border: 1px solid rgba(219, 188, 136, 0.28);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 0.68rem;
  line-height: 1.35;
}

.battle-side-close {
  min-width: 52px;
  min-height: 26px;
  align-self: start;
}

.battle-side-body {
  min-height: 0;
  display: grid;
  grid-template-rows: auto auto auto 1fr;
  gap: 6px;
}

.battle-side-section {
  min-height: 0;
  display: grid;
  gap: 4px;
}

.battle-side-section h3 {
  margin: 0;
  font-size: 0.72rem;
  color: rgba(247, 229, 182, 0.92);
}

.battle-unit-list {
  display: grid;
  gap: 4px;
  max-height: 60px;
  overflow: auto;
}

.battle-unit-card {
  display: grid;
  gap: 3px;
  padding: 5px 6px;
  border-radius: 8px;
  border: 1px solid rgba(216, 186, 131, 0.24);
  background: rgba(255, 255, 255, 0.05);
}

.battle-unit-card.dead {
  opacity: 0.5;
}

.battle-unit-card.ally {
  box-shadow: inset 0 0 0 1px rgba(121, 208, 255, 0.12);
}

.battle-unit-card.enemy {
  box-shadow: inset 0 0 0 1px rgba(255, 123, 103, 0.1);
}

.battle-unit-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
  font-size: 0.66rem;
  align-items: center;
}

.battle-unit-head strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.battle-unit-meta {
  font-size: 0.58rem;
  color: rgba(244, 233, 206, 0.78);
}

.battle-hp-wrap {
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}

.battle-hp-bar {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #d95f4d, #f0b665);
}

.battle-side-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
}

.battle-side-actions button {
  min-height: 28px;
  font-size: 0.62rem;
  padding: 4px 6px;
}

.battle-log-section {
  min-height: 0;
}

.battle-log-list {
  min-height: 0;
  height: 100%;
  overflow: auto;
  border: 1px solid rgba(220, 188, 129, 0.25);
  border-radius: 8px;
  background: rgba(6, 8, 10, 0.28);
  padding: 6px;
  display: grid;
  align-content: start;
  gap: 4px;
}

.battle-log-entry {
  font-size: 0.6rem;
  line-height: 1.35;
  color: rgba(245, 236, 214, 0.9);
}

@media (max-width: 720px) {
  .battle-side-panel {
    left: 8px;
    top: auto;
    bottom: 8px;
    width: min(250px, calc(100vw - 16px));
    height: min(300px, calc(100vh - 16px));
  }
}
</style>
