<script setup>
const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: "" },
  modalType: { type: String, default: "form" },
  fields: {
    type: Array,
    default: () => []
  },
  message: { type: String, default: "" },
  notes: {
    type: Array,
    default: () => []
  },
  closeText: { type: String, default: "閉じる" },
  wide: { type: Boolean, default: false }
});

const emit = defineEmits(["close", "field-change"]);

function onFieldInput(field, rawValue) {
  let value = rawValue;
  if (field.kind === "number" || field.kind === "range") {
    value = Number(rawValue);
  }
  emit("field-change", { key: field.key, value });
}

function fieldLabel(field) {
  if (field.kind === "range" && field.suffix) {
    return `${field.label}: ${field.value}${field.suffix}`;
  }
  return field.label;
}
</script>

<template>
  <div v-if="props.show" class="generic-modal-backdrop" @click.self="emit('close')">
    <div class="generic-modal" :class="{ 'generic-modal-wide': props.wide }">
      <h3 v-if="props.title">{{ props.title }}</h3>

      <div v-if="props.modalType === 'form'" class="generic-form">
        <template v-for="field in props.fields" :key="field.key">
          <div v-if="field.kind === 'header'" class="generic-header">{{ field.label }}</div>

          <label v-else-if="field.kind === 'checkbox'" class="generic-row">
            <input
              type="checkbox"
              :checked="!!field.value"
              :disabled="!!field.disabled"
              @change="onFieldInput(field, $event.target.checked)"
            />
            {{ field.label }}
          </label>

          <label v-else-if="field.kind === 'select'" class="generic-column">
            <span>{{ field.label }}</span>
            <select
              :value="field.value"
              :disabled="!!field.disabled"
              @change="onFieldInput(field, $event.target.value)"
            >
              <option
                v-for="opt in field.options || []"
                :key="`${field.key}:${opt.value}`"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </label>

          <label v-else-if="field.kind === 'range'" class="generic-column">
            <span>{{ fieldLabel(field) }}</span>
            <input
              type="range"
              :value="field.value"
              :min="field.min"
              :max="field.max"
              :step="field.step ?? 1"
              :disabled="!!field.disabled"
              @input="onFieldInput(field, $event.target.value)"
            />
          </label>

          <label v-else class="generic-column">
            <span>{{ field.label }}</span>
            <input
              :type="field.kind === 'number' ? 'number' : 'text'"
              :value="field.value"
              :min="field.min"
              :max="field.max"
              :step="field.step ?? 1"
              :disabled="!!field.disabled"
              @input="onFieldInput(field, $event.target.value)"
            />
          </label>

          <div v-if="field.help" class="generic-help">{{ field.help }}</div>
        </template>
      </div>

      <div v-else class="generic-message">{{ props.message }}</div>

      <div v-if="props.notes.length" class="generic-notes">
        <div v-for="(note, idx) in props.notes" :key="idx">{{ note }}</div>
      </div>

      <div class="generic-actions">
        <button type="button" class="secondary" @click="emit('close')">{{ props.closeText }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.generic-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(10, 7, 4, 0.5);
  display: grid;
  place-items: center;
  padding: 14px;
  z-index: 1200;
}

.generic-modal {
  width: min(420px, 100%);
  background: linear-gradient(170deg, rgba(56, 40, 22, 0.96), rgba(20, 14, 9, 0.96));
  border: 1px solid rgba(218, 184, 121, 0.55);
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.44);
  font-size: 1rem;
  line-height: 1.35;
  transform: scale(var(--game-modal-scale, 1));
  transform-origin: center center;
}

.generic-modal-wide {
  width: min(560px, 100%);
}

.generic-modal h3 {
  margin: 0 0 8px;
  color: #f6e6b5;
}

.generic-form {
  display: grid;
  gap: 10px;
}

.generic-row {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #f4ebd2;
}

.generic-column {
  display: grid;
  gap: 6px;
  color: #f4ebd2;
}

.generic-column input[type="range"] {
  accent-color: #d3b277;
}

.generic-help {
  margin-top: -6px;
  color: #dccfa8;
  font-size: 0.8rem;
}

.generic-header {
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px solid rgba(226, 191, 130, 0.3);
  color: #f6e6b5;
  font-size: 0.84rem;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.generic-message {
  color: #f4ebd2;
}

.generic-notes {
  margin-top: 8px;
  color: #dccfa8;
  font-size: 0.86rem;
  display: grid;
  gap: 4px;
}

.generic-actions {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
}
</style>
