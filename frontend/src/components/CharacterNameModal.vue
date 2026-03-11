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
  <base-modal :show="show" title="キャラ名設定" :subtitle="setupProgressText" :close-on-backdrop="false" @close="$emit('close')">
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
  gap: 10px;
}

.name-label {
  display: grid;
  gap: 6px;
}

.name-label input {
  border: 1px solid #c8ad81;
  border-radius: 6px;
  padding: 8px;
  font-size: 0.95rem;
  background: #fff;
}

.name-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
