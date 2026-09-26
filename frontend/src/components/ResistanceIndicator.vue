<script setup>
import { computed } from "vue";
import { formatResistanceValue, getResistanceIconSrc, resistanceValueTone } from "../lib/resistance-display.js";

const props = defineProps({
  resistanceKey: { type:String, required:true },
  value: { type:[Number, String], required:true },
  variant: { type:String, default:"dark" }
});

const iconSrc = computed(() => getResistanceIconSrc(props.resistanceKey));
const valueText = computed(() => formatResistanceValue(props.value));
const tone = computed(() => resistanceValueTone(props.value));
const ariaLabel = computed(() => `${props.resistanceKey} ${valueText.value}`);
</script>

<template>
  <button
    type="button"
    class="resistance-indicator"
    :class="[tone, `variant-${variant}`]"
    :aria-label="ariaLabel"
    :title="resistanceKey"
  >
    <img
      v-if="iconSrc"
      :src="iconSrc"
      alt=""
      class="resistance-indicator-icon"
      aria-hidden="true"
    />
    <span v-else class="resistance-indicator-icon-fallback" aria-hidden="true">?</span>
    <span class="resistance-indicator-name">{{ resistanceKey }}</span>
    <strong>{{ valueText }}</strong>
  </button>
</template>

<style scoped>
.resistance-indicator {
  width:100%;
  min-width:0;
  min-height:34px;
  display:flex;
  align-items:center;
  gap:6px;
  padding:4px 7px;
  border-radius:7px;
  font:inherit;
  text-align:left;
  cursor:default;
  outline:none;
}

.resistance-indicator-icon,
.resistance-indicator-icon-fallback {
  width:20px;
  height:20px;
  flex:0 0 auto;
  border-radius:4px;
}

.resistance-indicator-icon {
  object-fit:contain;
}

.resistance-indicator-icon-fallback {
  display:inline-flex;
  align-items:center;
  justify-content:center;
  font-size:11px;
  font-weight:900;
}

.resistance-indicator-name {
  min-width:0;
  max-width:0;
  opacity:0;
  overflow:hidden;
  white-space:nowrap;
  text-overflow:ellipsis;
  transition:max-width .14s ease, opacity .14s ease;
}

.resistance-indicator:hover .resistance-indicator-name,
.resistance-indicator:focus .resistance-indicator-name,
.resistance-indicator:focus-visible .resistance-indicator-name {
  max-width:110px;
  opacity:1;
}

.resistance-indicator strong {
  margin-left:auto;
  flex:0 0 auto;
  font-size:13px;
}

.variant-dark {
  border:1px solid #3d4d54;
  background:#121c20;
  color:#a7b4b7;
}

.variant-dark .resistance-indicator-icon-fallback {
  background:#223138;
  color:#dce8e7;
}

.variant-dark.positive {
  border-color:rgba(104,205,139,.5);
  background:rgba(25,59,39,.72);
}

.variant-dark.positive strong {
  color:#7de0a0;
}

.variant-dark.negative {
  border-color:rgba(224,116,99,.52);
  background:rgba(67,31,29,.72);
}

.variant-dark.negative strong {
  color:#f08f7f;
}

.variant-light {
  border:1px solid rgba(206,180,135,.62);
  background:rgba(255,255,255,.82);
  color:#3f3428;
}

.variant-light .resistance-indicator-icon-fallback {
  background:rgba(235,226,211,.9);
  color:#4a3926;
}

.variant-light.positive {
  border-color:rgba(78,164,101,.72);
  background:rgba(229,247,233,.9);
}

.variant-light.positive strong {
  color:#25723b;
}

.variant-light.negative {
  border-color:rgba(185,86,72,.72);
  background:rgba(252,232,228,.9);
}

.variant-light.negative strong {
  color:#a13e31;
}
</style>
