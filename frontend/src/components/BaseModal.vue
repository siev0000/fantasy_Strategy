<script setup>
const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, required: true },
  subtitle: { type: String, default: "" },
  wide: { type: Boolean, default: false },
  closeOnBackdrop: { type: Boolean, default: true }
});

const emit = defineEmits(["close"]);

function handleBackdropClick() {
  if (!props.closeOnBackdrop) return;
  emit("close");
}
</script>

<template>
  <div v-if="show" class="modal-backdrop" @click.self="handleBackdropClick">
    <article class="panel modal-card" :class="{ 'modal-card-wide': wide }" role="dialog" aria-modal="true">
      <header class="modal-head">
        <div class="modal-title-wrap">
          <h2>{{ title }}</h2>
          <div v-if="subtitle" class="modal-subtitle">{{ subtitle }}</div>
        </div>
        <button type="button" class="secondary" @click="$emit('close')">閉じる</button>
      </header>
      <div class="modal-body">
        <slot />
      </div>
    </article>
  </div>
</template>

<style scoped>
.modal-title-wrap {
  display: grid;
  gap: 2px;
}

.modal-subtitle {
  font-size: 0.8rem;
  color: rgba(248, 230, 190, 0.92);
  letter-spacing: 0.01em;
}
</style>
