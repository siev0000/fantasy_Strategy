<script setup>
import { DEFAULT_ICON_SRC } from "../lib/icon-library.js";

const skillCategoryButtons = [
  { label: "魔法", categories: ["魔法"] },
  { label: "軍事", categories: ["軍事"] },
  { label: "経済", categories: ["経済"] },
  { label: "信仰", categories: ["信仰"] }
];
const characterIconSrc = DEFAULT_ICON_SRC;

defineEmits(["open-modal"]);
</script>

<template>
  <section class="panel menu-panel">
    <h2>画面メニュー</h2>
    <div class="menu-buttons">
      <button type="button" @click="$emit('open-modal', 'game-start')">ゲーム開始</button>
      <button class="secondary" type="button" @click="$emit('open-modal', 'race')">種族選択を開く</button>
      <button class="secondary" type="button" @click="$emit('open-modal', 'class')">クラス選択を開く</button>
      <button class="secondary" type="button" @click="$emit('open-modal', 'name')">名前設定を開く</button>
      <button class="secondary" type="button" @click="$emit('open-modal', 'room')">ルーム管理を開く</button>
      <button type="button" @click="$emit('open-modal', 'battle')">戦闘画面を開く</button>
      <button class="secondary" type="button" @click="$emit('open-modal', 'sim')">シミュレーターを開く</button>
      <button class="secondary icon-action-btn" type="button" @click="$emit('open-modal', 'characters')">
        <img :src="characterIconSrc" alt="自キャラ" class="action-icon" />
        <span>自キャラ一覧を開く</span>
      </button>
      <button type="button" @click="$emit('open-modal', 'skill', { categories: ['魔法', '軍事', '経済', '信仰'] })">
        スキルツリーを開く
      </button>
    </div>
    <div class="skill-shortcuts">
      <div class="small">カテゴリ別</div>
      <div class="skill-shortcut-buttons">
        <button
          v-for="item in skillCategoryButtons"
          :key="item.label"
          class="secondary"
          type="button"
          @click="$emit('open-modal', 'skill', { categories: item.categories })"
        >
          {{ item.label }}
        </button>
      </div>
    </div>
    <div class="small">地形は上で生成し、各画面はモーダルで操作します。</div>
  </section>
</template>
