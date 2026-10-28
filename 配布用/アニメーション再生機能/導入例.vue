<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import Phaser from "phaser";
import EffectPlayerControls from "./EffectPlayerControls.vue";
import PhaserEffectPlayer from "./phaser-effect-player.mjs";
import { effectCatalog } from "./effect-catalog.example.js";

const gameHost = ref(null);
const isReady = ref(false);
let game = null;
let effectPlayer = null;
let target = { x: 320, y: 180 };

onMounted(() => {
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: gameHost.value,
    width: 640,
    height: 360,
    transparent: true,
    scene: {
      create() {
        effectPlayer = new PhaserEffectPlayer(this);
        isReady.value = true;
        this.input.on("pointerdown", pointer => {
          target = { x: pointer.worldX, y: pointer.worldY };
        });
      }
    }
  });
});

onBeforeUnmount(() => {
  isReady.value = false;
  effectPlayer?.destroy();
  game?.destroy(true);
});

function playEffect(settings) {
  void effectPlayer?.play({
    ...settings,
    x: target.x,
    y: target.y
  });
}
</script>

<template>
  <div ref="gameHost" class="game-host" />
  <EffectPlayerControls :effects="effectCatalog" :disabled="!isReady" @play="playEffect" />
</template>

<style scoped>
.game-host {
  width: 640px;
  max-width: 100%;
  aspect-ratio: 16 / 9;
  background: #384348;
}
</style>
