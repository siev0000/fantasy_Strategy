<script setup>
import { ref, watch } from "vue";
import BaseModal from "./BaseModal.vue";

const props = defineProps({
  show: { type: Boolean, default: false },
  selectedName: { type: String, default: "" },
  selectedVillageName: { type: String, default: "" },
  setupProgressText: { type: String, default: "" }
});

const emit = defineEmits(["close", "confirm"]);
const draftName = ref("");
const draftVillageName = ref("");

watch(
  [() => props.show, () => props.selectedName, () => props.selectedVillageName],
  ([isOpen, name, villageName]) => {
    if (!isOpen) return;
    draftName.value = String(name || "").trim();
    draftVillageName.value = String(villageName || "").trim();
  },
  { immediate: true }
);

function sanitizeName(raw) {
  return String(raw || "").trim().slice(0, 20);
}

function confirmName() {
  const characterName = sanitizeName(draftName.value);
  const villageName = sanitizeName(draftVillageName.value);
  if (!characterName || !villageName) return;
  emit("confirm", { characterName, villageName });
}
</script>

<template>
  <base-modal :show="show" title="名前設定" :subtitle="setupProgressText" :close-on-backdrop="false" variant="v39" @close="$emit('close')">
    <div class="name-form">
      <label class="name-label">
        <span>キャラ名 (20文字まで)</span>
        <input
          v-model="draftName"
          type="text"
          maxlength="20"
          placeholder="例: アルド"
          @keydown.enter.prevent
        />
      </label>
      <label class="name-label">
        <span>村名 (20文字まで)</span>
        <input
          v-model="draftVillageName"
          type="text"
          maxlength="20"
          placeholder="例: リグナ村"
          @keydown.enter.prevent="confirmName"
        />
      </label>
      <div class="name-actions">
        <button
          type="button"
          :disabled="!String(draftName || '').trim() || !String(draftVillageName || '').trim()"
          @click="confirmName"
        >
          決定
        </button>
      </div>
    </div>
  </base-modal>
</template>

<style scoped>
.name-form {
  display: grid;
  gap: 12px;
  width: min(560px, 100%);
  margin: 0 auto;
  padding: 4px 0;
}

.name-label {
  display: grid;
  gap: 5px;
}

.name-label span {
  color: #b7c7c9;
  font-size: 12px;
  font-weight: 800;
}

.name-label input {
  width: 100%;
  min-height: 42px;
  border: 1px solid #3d5961;
  border-radius: 7px;
  padding: 8px 10px;
  background: #101f24;
  color: #edf3f2;
  font-size: 14px;
  outline: none;
}

.name-label input::placeholder {
  color: #677d82;
}

.name-label input:focus {
  border-color: var(--picker-active);
  box-shadow: 0 0 0 2px rgba(113, 209, 223, .12);
  background: #13262c;
}

.name-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 2px;
}

.name-actions button {
  min-width: 120px;
  min-height: 38px;
  padding: 6px 14px;
  border: 1px solid var(--picker-active);
  border-radius: 7px;
  background: #1a4b55;
  color: #f2fbfa;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
}

.name-actions button:hover:not(:disabled) {
  background: #205964;
}

.name-actions button:disabled {
  border-color: #344b52;
  background: #111d22;
  color: #64777b;
  cursor: not-allowed;
}

@media (max-width: 600px) {
  .name-form {
    width: 100%;
  }

  .name-actions button {
    width: 100%;
  }
}
</style>
