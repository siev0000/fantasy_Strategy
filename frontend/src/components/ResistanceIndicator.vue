<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { formatResistanceValue, getResistanceIconSrc, resistanceValueTone } from "../lib/resistance-display.js";

const props = defineProps({
  resistanceKey: { type:String, required:true },
  value: { type:[Number, String], required:true },
  variant: { type:String, default:"dark" }
});

const buttonRef = ref(null);
const hovered = ref(false);
const focused = ref(false);
const tappedOpen = ref(false);
const popupPosition = ref({ left:0, top:0, placement:"top" });

const iconSrc = computed(() => getResistanceIconSrc(props.resistanceKey));
const valueText = computed(() => formatResistanceValue(props.value));
const tone = computed(() => resistanceValueTone(props.value));
const ariaLabel = computed(() => `${props.resistanceKey} ${valueText.value}`);
const popupVisible = computed(() => hovered.value || focused.value || tappedOpen.value);
const popupStyle = computed(() => ({
  left:`${popupPosition.value.left}px`,
  top:`${popupPosition.value.top}px`
}));

function updatePopupPosition() {
  const button = buttonRef.value;
  if (!(button instanceof HTMLElement)) return;
  const rect = button.getBoundingClientRect();
  const useBottom = rect.top < 52;
  popupPosition.value = {
    left:Math.max(12, Math.min(window.innerWidth - 12, rect.left + rect.width / 2)),
    top:useBottom ? rect.bottom + 7 : rect.top - 7,
    placement:useBottom ? "bottom" : "top"
  };
}

function showHover() {
  hovered.value = true;
  nextTick(updatePopupPosition);
}

function hideHover() {
  hovered.value = false;
}

function handleFocus() {
  focused.value = true;
  nextTick(updatePopupPosition);
}

function handleBlur() {
  focused.value = false;
  tappedOpen.value = false;
}

function toggleTap() {
  tappedOpen.value = !tappedOpen.value;
  nextTick(updatePopupPosition);
}

function handleWindowChange() {
  if (popupVisible.value) updatePopupPosition();
}

onMounted(() => {
  window.addEventListener("resize", handleWindowChange);
  window.addEventListener("scroll", handleWindowChange, true);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleWindowChange);
  window.removeEventListener("scroll", handleWindowChange, true);
});
</script>

<template>
  <button
    ref="buttonRef"
    type="button"
    class="resistance-indicator"
    :class="[tone, `variant-${variant}`]"
    :aria-label="ariaLabel"
    @mouseenter="showHover"
    @mouseleave="hideHover"
    @focus="handleFocus"
    @blur="handleBlur"
    @click="toggleTap"
  >
    <img
      v-if="iconSrc"
      :src="iconSrc"
      alt=""
      class="resistance-indicator-icon"
      aria-hidden="true"
    />
    <span v-else class="resistance-indicator-icon-fallback" aria-hidden="true">?</span>
    <strong>{{ valueText }}</strong>
  </button>

  <teleport to="body">
    <div
      v-if="popupVisible"
      class="resistance-name-popover"
      :class="`placement-${popupPosition.placement}`"
      :style="popupStyle"
      role="tooltip"
    >
      {{ resistanceKey }}
    </div>
  </teleport>
</template>

<style scoped>
.resistance-indicator {
  width:100%;
  min-width:0;
  min-height:32px;
  display:flex;
  align-items:center;
  gap:6px;
  padding:1px 7px;
  border-radius:7px;
  font:inherit;
  text-align:left;
  cursor:pointer;
  outline:none;
}

.resistance-indicator-icon,
.resistance-indicator-icon-fallback {
  width:28px;
  height:28px;
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

.resistance-indicator strong {
  margin-left:auto;
  flex:0 0 auto;
  font-size:13px;
}

.resistance-name-popover {
  position:fixed;
  z-index:100000;
  max-width:min(220px, calc(100vw - 24px));
  padding:5px 9px;
  border:1px solid rgba(112, 144, 153, .9);
  border-radius:6px;
  background:#0d171b;
  color:#eef7f6;
  box-shadow:0 5px 16px rgba(0,0,0,.36);
  font-size:12px;
  font-weight:800;
  line-height:1.2;
  white-space:nowrap;
  pointer-events:none;
}

.resistance-name-popover.placement-top {
  transform:translate(-50%, -100%);
}

.resistance-name-popover.placement-bottom {
  transform:translate(-50%, 0);
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
