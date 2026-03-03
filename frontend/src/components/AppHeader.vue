<script setup>
defineProps({
  activeRoomId: {
    type: String,
    default: ""
  },
  selectedRace: {
    type: String,
    default: ""
  },
  selectedClass: {
    type: String,
    default: ""
  },
  characterCount: {
    type: Number,
    default: 0
  }
});

const characterIconSrc = new URL("../../../assets/images/攻撃手段/肉体.webp", import.meta.url).href;

defineEmits(["open-modal"]);
</script>

<template>
  <header>
    <h1>Fantasy Strategy Prototype (Vue SFC)</h1>
    <div class="top-actions">
      <button class="secondary" type="button" @click="$emit('open-modal', 'room')">ルーム管理</button>
      <button type="button" @click="$emit('open-modal', 'battle')">戦闘画面</button>
      <button class="secondary" type="button" @click="$emit('open-modal', 'sim')">シミュレーター</button>
      <button type="button" @click="$emit('open-modal', 'skill', { categories: ['魔法', '軍事', '経済', '信仰'] })">
        スキルツリー
      </button>
      <button class="secondary" type="button" @click="$emit('open-modal', 'race')">種族選択</button>
      <button class="secondary" type="button" @click="$emit('open-modal', 'class')">クラス選択</button>
      <button class="secondary icon-action-btn" type="button" @click="$emit('open-modal', 'characters')">
        <img :src="characterIconSrc" alt="自キャラ" class="action-icon" />
        <span>自キャラ</span>
      </button>
      <div class="small">選択種族: {{ selectedRace || "-" }}</div>
      <div class="small">選択クラス: {{ selectedClass || "-" }}</div>
      <div class="small">自キャラ: {{ characterCount }}</div>
      <div class="small top-room">現在ルーム: {{ activeRoomId || "なし" }}</div>
    </div>
  </header>
</template>
