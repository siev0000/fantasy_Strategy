<script setup>
import ResistanceIndicator from "./ResistanceIndicator.vue";

defineProps({
  rows: { type:Array, default:() => [] },
  variant: { type:String, default:"dark" }
});
</script>

<template>
  <div class="resistance-grid">
    <resistance-indicator
      v-for="row in rows"
      :key="row.key"
      :resistance-key="row.key"
      :value="row.value"
      :variant="variant"
    />
  </div>
</template>

<style scoped>
.resistance-grid {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:2px;
}
</style>
