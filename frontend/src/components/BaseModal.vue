<script setup>
const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, required: true },
  subtitle: { type: String, default: "" },
  wide: { type: Boolean, default: false },
  closeOnBackdrop: { type: Boolean, default: true },
  variant: { type: String, default: "default" }
});

const emit = defineEmits(["close"]);

function handleBackdropClick() {
  if (!props.closeOnBackdrop) return;
  emit("close");
}
</script>

<template>
  <teleport to="body">
    <div
      v-if="show"
      class="modal-backdrop open vue-modal-backdrop"
      :class="{ 'vue-modal-backdrop-v39': variant === 'v39' }"
      @click.self="handleBackdropClick"
    >
      <article
        class="panel modal-card"
        :class="{
          'modal-card-wide': wide,
          'v39-vue-modal-card': variant === 'v39'
        }"
        role="dialog"
        aria-modal="true"
      >
        <header v-if="variant === 'v39'" class="v39-vue-modal-head">
          <div class="v39-vue-modal-title-wrap">
            <h2>{{ title }}</h2>
            <small v-if="subtitle">{{ subtitle }}</small>
          </div>
        </header>
        <div class="modal-body" :class="{ 'v39-vue-modal-body': variant === 'v39' }">
          <slot />
        </div>
      </article>
    </div>
  </teleport>
</template>

<style scoped>
.vue-modal-backdrop {
  display: grid;
  z-index: 10200;
}

.vue-modal-backdrop-v39 {
  padding: max(4px, var(--safe-t, 0px)) max(4px, var(--safe-r, 0px)) max(4px, var(--safe-b, 0px)) max(4px, var(--safe-l, 0px));
  background: rgba(3, 9, 12, 0.82);
  backdrop-filter: blur(4px);
}

.v39-vue-modal-card {
  --picker-bg: #0d171b;
  --picker-bg-soft: #111f24;
  --picker-bg-raised: #15272d;
  --picker-line: #344b52;
  --picker-line-soft: #294047;
  --picker-active: #71d1df;
  --picker-active-bg: #18363e;
  --picker-text: #edf3f2;
  --picker-muted: #93a4a7;
  --picker-positive: #7bd293;
  box-sizing: border-box;
  width: min(720px, calc(100vw - 12px));
  max-height: calc(100dvh - 12px);
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid #45616a;
  border-radius: 10px;
  background: linear-gradient(180deg, #111d22 0%, #0a1317 100%);
  color: var(--picker-text);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.62);
}

.v39-vue-modal-card.modal-card-wide {
  width: calc(100vw - 8px);
  height: calc(100dvh - 8px);
  max-height: calc(100dvh - 8px);
}

.v39-vue-modal-head {
  min-height: 52px;
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--picker-line);
  background: #101d22;
}

.v39-vue-modal-title-wrap {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.v39-vue-modal-title-wrap h2 {
  margin: 0;
  color: var(--picker-text);
  font-size: 18px;
  line-height: 1.2;
}

.v39-vue-modal-title-wrap small {
  color: var(--picker-muted);
  font-size: 12px;
  line-height: 1.3;
}

.v39-vue-modal-body {
  min-height: 0;
  overflow: hidden;
  padding: 10px;
  background: #0b1418;
}

@media (max-width: 760px) {
  .vue-modal-backdrop-v39 {
    padding: 4px;
  }

  .v39-vue-modal-card {
    width: 100%;
    max-height: calc(100dvh - 8px);
    border-radius: 7px;
  }

  .v39-vue-modal-card.modal-card-wide {
    width: 100%;
    height: calc(100dvh - 8px);
    max-height: calc(100dvh - 8px);
  }

  .v39-vue-modal-head {
    min-height: 46px;
    padding: 7px 9px;
  }

  .v39-vue-modal-body {
    padding: 7px;
  }
}

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
