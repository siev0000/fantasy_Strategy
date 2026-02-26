<script setup>
defineProps({
  activeRoomId: {
    type: String,
    default: ""
  }
});

defineEmits(["open-modal"]);
</script>

<template>
  <header>
    <h1>Fantasy Strategy Prototype (Vue SFC)</h1>
    <div class="top-actions">
      <button class="secondary" type="button" @click="$emit('open-modal', 'room')">ルーム管理</button>
      <button type="button" @click="$emit('open-modal', 'battle')">戦闘画面</button>
      <button class="secondary" type="button" @click="$emit('open-modal', 'sim')">シミュレーター</button>
      <div class="small top-room">現在ルーム: {{ activeRoomId || "なし" }}</div>
    </div>
  </header>
</template>
