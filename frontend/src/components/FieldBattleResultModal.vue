<script setup>
const props = defineProps({
  show: { type: Boolean, default: false },
  state: { type: Object, default: null }
});

const emit = defineEmits(["close", "resolve"]);

function resolveBattle(result) {
  emit("resolve", result);
}
</script>

<template>
  <div v-if="props.show" class="field-battle-result-backdrop">
    <div class="field-battle-result-modal">
      <h3>{{ props.state?.surveyContext ? "敵を発見" : "戦闘結果" }}</h3>
      <div v-if="props.state?.enemyImageSrc" class="field-battle-result-enemy-visual">
        <img :src="props.state.enemyImageSrc" :alt="props.state?.enemyLabel || '敵'" />
      </div>
      <div class="small">{{ props.state?.message || "戦闘結果を選択してください。" }}</div>
      <div class="small">戦闘参加: {{ props.state?.attackerLabel || "-" }}</div>
      <div v-if="props.state?.surveyContext" class="small field-battle-result-note">
        攻撃する場合は結果を選択し、回避する場合は逃走を選択してください。
      </div>
      <div class="field-battle-result-summary">{{ props.state?.summary || "-" }}</div>
      <div class="setting-actions field-battle-result-actions">
        <button type="button" class="secondary" @click="resolveBattle('victory')">{{ props.state?.surveyContext ? "攻撃(勝利)" : "勝利" }}</button>
        <button type="button" class="secondary" @click="resolveBattle('defeat')">{{ props.state?.surveyContext ? "攻撃(敗北)" : "敗北" }}</button>
        <button v-if="props.state?.allowRetreat" type="button" class="secondary" @click="resolveBattle('retreat')">逃走</button>
        <button type="button" class="secondary" @click="emit('close')">閉じる</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.field-battle-result-backdrop {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1200;
}

.field-battle-result-modal {
  position: absolute;
  top: 76px;
  left: 12px;
  width: min(360px, calc(100vw - 24px));
  max-height: min(330px, calc(100vh - 88px));
  border: 1px solid rgba(218, 184, 121, 0.55);
  border-radius: 12px;
  background: linear-gradient(170deg, rgba(56, 40, 22, 0.96), rgba(20, 14, 9, 0.96));
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.44);
  display: grid;
  grid-template-rows: auto auto auto auto auto auto;
  gap: 8px;
  padding: 10px;
  color: #f4ebd2;
  overflow: auto;
  pointer-events: auto;
}

.field-battle-result-modal h3 {
  margin: 0;
  color: #f6e6b5;
  font-size: 0.9rem;
}

.field-battle-result-enemy-visual {
  border: 1px solid rgba(228, 197, 139, 0.36);
  border-radius: 10px;
  background: linear-gradient(160deg, rgba(19, 13, 9, 0.78), rgba(12, 9, 7, 0.72));
  min-height: 88px;
  max-height: 110px;
  display: grid;
  place-items: center;
  overflow: hidden;
}

.field-battle-result-enemy-visual img {
  width: 100%;
  max-height: 100px;
  object-fit: contain;
  image-rendering: auto;
}

.small {
  font-size: 0.66rem;
  line-height: 1.35;
}

.field-battle-result-summary {
  color: #f1e6ca;
  border: 1px solid rgba(222, 188, 129, 0.35);
  border-radius: 8px;
  background: linear-gradient(165deg, rgba(22, 18, 13, 0.74), rgba(17, 13, 10, 0.65));
  padding: 7px 8px;
  font-size: 0.64rem;
  line-height: 1.35;
}

.field-battle-result-note {
  color: rgba(243, 232, 202, 0.88);
}

.field-battle-result-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.field-battle-result-actions :deep(button) {
  min-height: 28px;
  font-size: 0.62rem;
  padding: 4px 6px;
}

@media (max-width: 720px) {
  .field-battle-result-modal {
    top: auto;
    bottom: 8px;
    left: 8px;
    width: min(250px, calc(100vw - 16px));
    max-height: min(300px, calc(100vh - 16px));
  }
}
</style>
