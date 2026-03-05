<script setup>
const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, required: true },
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
        <h2>{{ title }}</h2>
        <button type="button" class="secondary" @click="$emit('close')">閉じる</button>
      </header>
      <div class="modal-body">
        <slot />
      </div>
    </article>
  </div>
</template>
