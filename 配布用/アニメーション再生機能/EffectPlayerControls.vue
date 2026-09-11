<script setup>
import { computed, ref, watch } from "vue";

const props = defineProps({
  effects: {
    type: Array,
    default: () => []
  },
  disabled: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(["play"]);
const selectedName = ref("");
const angleDeg = ref(0);
const scalePercent = ref(50);
const tint = ref("#ffffff");
const colorStrengthPercent = ref(100);
const renderStyle = ref("soft");

const normalizedEffects = computed(() => props.effects
  .map(effect => typeof effect === "string" ? { name: effect, src: effect } : effect)
  .filter(effect => effect?.name && effect?.src));
const selectedEffect = computed(() => normalizedEffects.value.find(effect => effect.name === selectedName.value) || null);

watch(normalizedEffects, effects => {
  if (!effects.some(effect => effect.name === selectedName.value)) {
    selectedName.value = effects[0]?.name || "";
  }
}, { immediate: true });

function play() {
  if (props.disabled || !selectedEffect.value) return;
  emit("play", {
    src: selectedEffect.value.src,
    name: selectedEffect.value.name,
    sourceScaleMultiplier: Number(selectedEffect.value.sourceScaleMultiplier) || 1,
    angleDeg: Number(angleDeg.value) || 0,
    scalePercent: Number(scalePercent.value) || 50,
    tint: tint.value,
    colorStrengthPercent: Number(colorStrengthPercent.value) || 0,
    renderStyle: renderStyle.value
  });
}
</script>

<template>
  <section class="effect-controls">
    <label>
      エフェクト
      <select v-model="selectedName" :disabled="disabled || normalizedEffects.length === 0">
        <option v-for="effect in normalizedEffects" :key="effect.name" :value="effect.name">
          {{ effect.name }}
        </option>
      </select>
    </label>
    <label>
      向き
      <input v-model.number="angleDeg" type="number" min="0" max="360" step="1">
    </label>
    <label>
      大きさ
      <input v-model.number="scalePercent" type="number" min="10" max="400" step="10">
      <span>%</span>
    </label>
    <label>
      色
      <input v-model="tint" type="color">
    </label>
    <label>
      色の強さ
      <input v-model.number="colorStrengthPercent" type="range" min="0" max="100" step="1">
    </label>
    <label>
      表示
      <select v-model="renderStyle">
        <option value="soft">周囲をぼかす</option>
        <option value="rect">四角</option>
        <option value="none">加工なし</option>
      </select>
    </label>
    <button type="button" :disabled="disabled || !selectedEffect" @click="play">
      再生
    </button>
  </section>
</template>

<style scoped>
.effect-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 8px;
  padding: 10px;
  color: #f4ead1;
  background: #24272b;
  border: 1px solid #77705f;
  font-family: "Yu Mincho", "Hiragino Mincho ProN", serif;
}

label {
  display: grid;
  gap: 3px;
  font-size: 12px;
}

select,
input,
button {
  min-height: 30px;
  box-sizing: border-box;
}

select,
input[type="number"] {
  color: #f4ead1;
  background: #151719;
  border: 1px solid #77705f;
}

button {
  padding: 0 18px;
  color: #171510;
  background: #e0c36f;
  border: 1px solid #fff0b0;
  cursor: pointer;
  font-weight: 700;
}

button:disabled {
  cursor: default;
  opacity: 0.45;
}
</style>
