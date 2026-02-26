<script setup>
import { onBeforeUnmount, onMounted } from "vue";
import {
  fitMapGrid,
  generateIslandShapeOnly,
  generateTerrainMap,
  handleMapClick
} from "../lib/map-generator.js";

let resizeHandler = null;

onMounted(() => {
  resizeHandler = () => fitMapGrid();
  window.addEventListener("resize", resizeHandler);
  generateIslandShapeOnly();
});

onBeforeUnmount(() => {
  if (resizeHandler) {
    window.removeEventListener("resize", resizeHandler);
  }
});
</script>

<template>
  <section class="panel simulator map-top">
    <h2>地形ランダム生成</h2>
    <div class="map-tools">
      <label>マップサイズ
        <select id="mapSize">
          <option value="24x24">小 (24x24 = 144マス)</option>
          <option value="36x36" selected>中 (36x36 = 324マス / 推奨)</option>
          <option value="54x54">大 (54x54 = 576マス)</option>
        </select>
      </label>
      <label>島形状パターン
        <select id="islandPattern">
          <option value="realistic" selected>リアル島</option>
          <option value="balanced">標準諸島</option>
          <option value="continent">大陸型</option>
          <option value="archipelago">多島海</option>
          <option value="twins">双子島</option>
          <option value="chain">列島型</option>
        </select>
      </label>
      <button id="generateShapeBtn" class="secondary" type="button" @click="generateIslandShapeOnly">島形状のみ</button>
      <button id="generateMapBtn" class="secondary" type="button" @click="generateTerrainMap">生成</button>
    </div>
    <div class="map-meta">
      <div id="mapSizeInfo">サイズ: -</div>
      <div id="mapCenterInfo">中央座標: -</div>
      <div id="mapClickInfo">クリック座標: -</div>
    </div>
    <div id="mapStats">地形未生成</div>
    <div id="mapGrid" @click="handleMapClick"></div>
  </section>
</template>
