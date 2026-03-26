<script setup>
const props = defineProps({
  show: { type: Boolean, default: false },
  state: { type: Object, default: null }
});

const emit = defineEmits(["close", "resolve"]);

function resolveBattle(isVictory) {
  emit("resolve", !!isVictory);
}
</script>

<template>
  <div v-if="props.show" class="field-battle-result-backdrop" @click.self="emit('close')">
    <div class="field-battle-result-modal">
      <h3>戦闘結果</h3>
      <div v-if="props.state?.enemyImageSrc" class="field-battle-result-enemy-visual">
        <img :src="props.state.enemyImageSrc" :alt="props.state?.enemyLabel || '敵'" />
      </div>
      <div class="small">{{ props.state?.message || "戦闘結果を選択してください。" }}</div>
      <div class="small">戦闘参加: {{ props.state?.attackerLabel || "-" }}</div>
      <div class="field-battle-result-summary">{{ props.state?.summary || "-" }}</div>
      <div class="setting-actions field-battle-result-actions">
        <button type="button" class="secondary" @click="resolveBattle(true)">勝利</button>
        <button type="button" class="secondary" @click="resolveBattle(false)">敗北</button>
        <button type="button" class="secondary" @click="emit('close')">閉じる</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.field-battle-result-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(10, 7, 4, 0.5);
  display: grid;
  place-items: center;
  padding: 14px;
  z-index: 1200;
}

.field-battle-result-modal {
  width: min(480px, 100%);
  border: 1px solid rgba(218, 184, 121, 0.55);
  border-radius: 12px;
  background: linear-gradient(170deg, rgba(56, 40, 22, 0.96), rgba(20, 14, 9, 0.96));
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.44);
  display: grid;
  gap: 10px;
  padding: 12px;
  color: #f4ebd2;
}

.field-battle-result-modal h3 {
  margin: 0;
  color: #f6e6b5;
}

.field-battle-result-enemy-visual {
  border: 1px solid rgba(228, 197, 139, 0.36);
  border-radius: 10px;
  background: linear-gradient(160deg, rgba(19, 13, 9, 0.78), rgba(12, 9, 7, 0.72));
  min-height: 120px;
  display: grid;
  place-items: center;
  overflow: hidden;
}

.field-battle-result-enemy-visual img {
  width: 100%;
  max-height: 180px;
  object-fit: contain;
  image-rendering: auto;
}

.field-battle-result-summary {
  color: #f1e6ca;
  border: 1px solid rgba(222, 188, 129, 0.35);
  border-radius: 8px;
  background: linear-gradient(165deg, rgba(22, 18, 13, 0.74), rgba(17, 13, 10, 0.65));
  padding: 8px 10px;
}

.field-battle-result-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
