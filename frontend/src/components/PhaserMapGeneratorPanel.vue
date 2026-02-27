<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Phaser from "phaser";
import {
  createIslandShapeData,
  createTerrainMapData,
  hexCenter,
  parseCoordKey,
  terrainDefinitions
} from "../lib/map-generator.js";

const mapSize = ref("36x36");
const patternId = ref("realistic");
const mountainMode = ref("random");
const showIslandCustomModal = ref(false);
const useIslandCustomSettings = ref(false);
const customLargeIslandCount = ref(2);
const customIsletCountMin = ref(1);
const customIsletCountMax = ref(4);
const customTargetLandPercent = ref(50);
const customLargeIslandMinGap = ref(6);
const showHeightNumbers = ref(true);
const heightNumberFontSize = ref(23);
const heightNumberOutlineWidth = ref(3);
const useHeightShading = ref(true);
const showSpecialTilesAlways = ref(true);
const showWaterfallEffects = ref(true);
const showSettingsModal = ref(false);
const mapSizeInfo = ref("サイズ: -");
const mapCenterInfo = ref("中央座標: -");
const mapTerrainProfileInfo = ref("地形比率: -");
const mapClickInfo = ref("クリック座標: -");
const mapStats = ref("地形未生成");
const gameRoot = ref(null);
const currentData = ref(null);

let game = null;
let scene = null;
let baseLayer = null;
let riverLayer = null;
let markerLayer = null;
let labelTexts = [];
let hitAreas = [];
let selectedTileKey = "";
let resizeHandler = null;

const terrainMap = computed(() => {
  const m = new Map();
  terrainDefinitions.forEach(def => m.set(def.key, def));
  return m;
});

function parseMapSizeValue(value) {
  const [w, h] = String(value || "36x36").split("x").map(Number);
  return { w: w || 36, h: h || 36 };
}

function normalizeIntRange(minValue, maxValue, hardMin, hardMax, fallbackMin, fallbackMax) {
  const rawMin = Number.isFinite(minValue) ? minValue : Number(minValue);
  const rawMax = Number.isFinite(maxValue) ? maxValue : Number(maxValue);
  const min = Number.isFinite(rawMin) ? Math.floor(rawMin) : fallbackMin;
  const max = Number.isFinite(rawMax) ? Math.floor(rawMax) : fallbackMax;
  const clampedMin = Math.max(hardMin, Math.min(hardMax, Math.min(min, max)));
  const clampedMax = Math.max(clampedMin, Math.min(hardMax, Math.max(min, max)));
  return { min: clampedMin, max: clampedMax };
}

function normalizeCustomIslandSettings() {
  const large = normalizeIntRange(customLargeIslandCount.value, customLargeIslandCount.value, 1, 8, 2, 2);
  customLargeIslandCount.value = large.min;
  const isletRange = normalizeIntRange(customIsletCountMin.value, customIsletCountMax.value, 0, 12, 1, 4);
  customIsletCountMin.value = isletRange.min;
  customIsletCountMax.value = isletRange.max;
  const gapRange = normalizeIntRange(customLargeIslandMinGap.value, customLargeIslandMinGap.value, 2, 12, 6, 6);
  customLargeIslandMinGap.value = gapRange.min;
  const ratioRaw = Number.isFinite(customTargetLandPercent.value)
    ? customTargetLandPercent.value
    : Number(customTargetLandPercent.value);
  const ratioPct = Number.isFinite(ratioRaw) ? ratioRaw : 50;
  customTargetLandPercent.value = Math.max(25, Math.min(60, Math.round(ratioPct)));
}

function buildIslandCustomSettings() {
  if (!useIslandCustomSettings.value) return null;
  normalizeCustomIslandSettings();
  return {
    enabled: true,
    largeIslandCount: customLargeIslandCount.value,
    isletCountMin: customIsletCountMin.value,
    isletCountMax: customIsletCountMax.value,
    targetLandRatio: customTargetLandPercent.value / 100,
    largeIslandMinGap: customLargeIslandMinGap.value
  };
}

function mapPixelSize(w, h) {
  return {
    width: (w * 40) + 20,
    height: ((h - 1) * 36) + 48
  };
}

function toColorInt(hex) {
  if (!hex || !hex.startsWith("#")) return 0x000000;
  return Number.parseInt(hex.slice(1), 16);
}

function shadeColorByHeight(hex, level) {
  if (!hex || !hex.startsWith("#") || !Number.isFinite(level)) return hex;
  const minLevel = -2;
  const maxLevel = 8;
  const t = Math.max(0, Math.min(1, (level - minLevel) / (maxLevel - minLevel)));
  // low level -> brighter, high level -> darker
  const brightness = 1.18 + ((0.74 - 1.18) * t);
  const raw = Number.parseInt(hex.slice(1), 16);
  const r = (raw >> 16) & 0xff;
  const g = (raw >> 8) & 0xff;
  const b = raw & 0xff;
  const nr = Math.max(0, Math.min(255, Math.round(r * brightness)));
  const ng = Math.max(0, Math.min(255, Math.round(g * brightness)));
  const nb = Math.max(0, Math.min(255, Math.round(b * brightness)));
  return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
}

function buildHexPoints(x, y) {
  const offsetX = (y % 2 === 1) ? 20 : 0;
  const left = (x * 40) + offsetX;
  const top = y * 36;
  return [
    { x: left + 20, y: top + 0 },
    { x: left + 40, y: top + 12 },
    { x: left + 40, y: top + 36 },
    { x: left + 20, y: top + 48 },
    { x: left + 0, y: top + 36 },
    { x: left + 0, y: top + 12 }
  ];
}

function drawSplitHex(graphics, points, leftHexColor, rightHexColor) {
  if (!graphics || !points || points.length < 6) return;
  const p0 = points[0];
  const p1 = points[1];
  const p2 = points[2];
  const p3 = points[3];
  const p4 = points[4];
  const p5 = points[5];
  graphics.fillStyle(toColorInt(leftHexColor), 1);
  graphics.fillPoints([p0, p5, p4, p3], true);
  graphics.fillStyle(toColorInt(rightHexColor), 1);
  graphics.fillPoints([p0, p1, p2, p3], true);
}

function tileVisual(tileKey, shapeOnly) {
  if (shapeOnly) {
    if (tileKey === "海") {
      return { key: "海", color: "#355f87", short: "海" };
    }
    return { key: "陸地", color: "#748b57", short: "陸" };
  }
  return terrainMap.value.get(tileKey) || terrainDefinitions[0];
}

function specialVisual(specialKey, caveScale = "") {
  if (specialKey === "沼地") {
    return {
      key: "沼地",
      short: "沼",
      overlayColor: "#5a6640",
      overlayAlpha: 0.42,
      textColor: "#e4efc3"
    };
  }
  if (specialKey === "峡谷") {
    return {
      key: "峡谷",
      short: "峡",
      overlayColor: "#6d5846",
      overlayAlpha: 0.45,
      textColor: "#ffe5c2"
    };
  }
  if (specialKey === "洞窟") {
    const isLarge = caveScale === "large";
    const isMedium = caveScale === "medium";
    return {
      key: "洞窟",
      short: isLarge ? "大洞" : isMedium ? "中洞" : "洞",
      overlayColor: isLarge ? "#3f364f" : isMedium ? "#4a445c" : "#4b4658",
      overlayAlpha: isLarge ? 0.62 : isMedium ? 0.55 : 0.48,
      textColor: "#e6ddff"
    };
  }
  return null;
}

function updateMeta(data) {
  const { w, h, patternName, terrainRatioProfile } = data;
  const centerX = Math.floor((w - 1) / 2);
  const centerY = Math.floor((h - 1) / 2);
  mapSizeInfo.value = `サイズ: ${w} x ${h} (${w * h}マス)`;
  mapCenterInfo.value = `中央座標: (${centerX}, ${centerY})${patternName ? ` / ${patternName}` : ""}`;
  const terrainRatioLabel = terrainRatioProfile?.summary || terrainRatioProfile?.name;
  mapTerrainProfileInfo.value = terrainRatioLabel
    ? `地形比率: ${terrainRatioLabel}`
    : "地形比率: -";
  mapClickInfo.value = "クリック座標: -";
  mapStats.value = buildStatsText(data);
}

function buildStatsText(data) {
  const { w, h, grid, shapeOnly, patternName, terrainRatioProfile, riverData, heightLevelMap, specialCounts, mountainProfile, reliefMap, strongMonsterStats, forestTargetCount, islandGenerationInfo } = data;
  const lines = [`サイズ: ${w}x${h} (${w * h}マス)`];
  if (patternName) lines.push(`パターン: ${patternName}`);
  if (islandGenerationInfo?.largeIslandRequested > 0) {
    const modeLabel = islandGenerationInfo.customApplied ? "カスタム" : "拡張";
    const targetPct = Number.isFinite(islandGenerationInfo.targetLandRatio)
      ? ` / 目標陸地: ${Math.round(islandGenerationInfo.targetLandRatio * 100)}%`
      : "";
    lines.push(
      `島構成(${modeLabel}): 大島 ${islandGenerationInfo.largeIslandActual}/${islandGenerationInfo.largeIslandRequested} / 孤島 ${islandGenerationInfo.isletActual}/${islandGenerationInfo.isletRequested} (${islandGenerationInfo.isletMinSize}〜${islandGenerationInfo.isletMaxSize}マス)${targetPct}`
    );
  }
  const terrainRatioLabel = terrainRatioProfile?.summary || terrainRatioProfile?.name;
  if (terrainRatioLabel) lines.push(`地形比率: ${terrainRatioLabel}`);
  if (mountainProfile?.modeName) {
    const modeLabel = mountainProfile.modeSelection === "fixed"
      ? `${mountainProfile.modeName} (固定)`
      : `${mountainProfile.modeName} (ランダム)`;
    lines.push(
      `山岳モード: ${modeLabel} / 塊数: ${mountainProfile.massSizes?.length || 0} / 最小距離: ${mountainProfile.minGap}`
    );
    lines.push(
      `山塊サイズ: ${(mountainProfile.massSizes || []).join(", ")} / 山岳: ${mountainProfile.actualMountainCount || 0}`
    );
    const foothillPct = Number.isFinite(mountainProfile.foothillHillChance)
      ? `${Math.round(mountainProfile.foothillHillChance * 100)}%`
      : "-";
    lines.push(
      `山麓丘陵化: ${foothillPct} / 山麓丘陵化数: ${mountainProfile.foothillHillPlaced || 0}`
    );
    lines.push(`島起伏保証(追加): ${mountainProfile.islandReliefPlaced || 0}`);
  }

  let seaCount = 0;
  let landCount = 0;
  const counts = {};
  terrainDefinitions.forEach(t => { counts[t.key] = 0; });

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const key = grid[y][x];
      if (key === "海") seaCount += 1;
      else landCount += 1;
      if (!shapeOnly && Object.prototype.hasOwnProperty.call(counts, key)) {
        counts[key] += 1;
      }
    }
  }

  if (shapeOnly) {
    lines.push(`陸地: ${landCount} (${((landCount / (w * h)) * 100).toFixed(1)}%)`);
    lines.push(`海: ${seaCount} (${((seaCount / (w * h)) * 100).toFixed(1)}%)`);
    return lines.join("\n");
  }

  terrainDefinitions.forEach(t => {
    const c = counts[t.key] || 0;
    const pct = ((c / (w * h)) * 100).toFixed(1);
    lines.push(`${t.key}: ${c} (${pct}%)`);
  });
  if (Number.isFinite(forestTargetCount)) {
    lines.push(`森林目標: ${forestTargetCount} / 実績: ${counts.森 || 0}`);
  }

  if (reliefMap) {
    let forestHill = 0;
    let forestMountain = 0;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (grid[y][x] !== "森") continue;
        const relief = reliefMap[y][x];
        if (relief === "丘陵") forestHill += 1;
        if (relief === "山岳") forestMountain += 1;
      }
    }
    lines.push(`複合地形: 森+丘 ${forestHill} / 森+山 ${forestMountain}`);
  }

  if (riverData?.riverSet) {
    lines.push(`川(重なり): ${riverData.riverSet.size} (${((riverData.riverSet.size / (w * h)) * 100).toFixed(1)}%)`);
    lines.push(`源流: ${riverData.sourceSet.size} / 分岐: ${riverData.branchSet.size} / 終点: ${riverData.mouthSet.size}`);
    lines.push(`滝: ${riverData.waterfallSet?.size || 0}タイル / 滝経路: ${riverData.waterfallEdgeSet?.size || 0}`);
  }
  if (specialCounts) {
    lines.push(`隠し特殊: 沼地 ${specialCounts.沼地 || 0} / 峡谷 ${specialCounts.峡谷 || 0} / 洞窟 ${specialCounts.洞窟 || 0}`);
    lines.push(`洞窟規模(マス): 小 ${specialCounts.洞窟_小 || 0} / 中 ${specialCounts.洞窟_中 || 0} / 大 ${specialCounts.洞窟_大 || 0}`);
  }
  if (strongMonsterStats?.有効) {
    const byRule = strongMonsterStats.条件別 || {};
    lines.push(`強敵候補: ${strongMonsterStats.配置数 || 0}`);
    lines.push(
      `条件別: 森中央 ${byRule.森中央 || 0} / オアシス ${byRule.砂漠オアシス || 0} / 大森林外周 ${byRule.大森林外周 || 0} / 森環丘山 ${byRule.森環丘山 || 0}`
    );
  }

  if (heightLevelMap) {
    let minLevel = Number.POSITIVE_INFINITY;
    let maxLevel = Number.NEGATIVE_INFINITY;
    let sumLevel = 0;
    let count = 0;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (grid[y][x] === "海") continue;
        const lv = heightLevelMap[y][x];
        minLevel = Math.min(minLevel, lv);
        maxLevel = Math.max(maxLevel, lv);
        sumLevel += lv;
        count += 1;
      }
    }
    if (count > 0) {
      lines.push(`高度Lv: min ${minLevel} / max ${maxLevel} / avg ${(sumLevel / count).toFixed(2)}`);
    }
  }

  return lines.join("\n");
}

function drawRiverOverlay(data) {
  if (!riverLayer) return;
  riverLayer.clear();
  const riverData = data.riverData;
  if (!riverData) return;
  const riverSet = riverData.riverSet || new Set();

  const levelOfKey = key => {
    const p = parseCoordKey(key);
    return data.heightLevelMap?.[p.y]?.[p.x];
  };

  const riverAdj = new Map();
  for (const key of riverSet) {
    riverAdj.set(key, new Set());
  }
  for (const ek of riverData.edgeSet || []) {
    const [a, b] = ek.split("|");
    if (!riverAdj.has(a)) riverAdj.set(a, new Set());
    if (!riverAdj.has(b)) riverAdj.set(b, new Set());
    riverAdj.get(a).add(b);
    riverAdj.get(b).add(a);
  }

  const mouthDistance = new Map();
  const queue = [];
  const pushMouthSeed = key => {
    if (!riverSet.has(key) || mouthDistance.has(key)) return;
    mouthDistance.set(key, 0);
    queue.push(key);
  };
  for (const key of riverData.mouthSet || []) pushMouthSeed(key);
  for (const wk of riverData.waterLinkSet || []) {
    const [a, b] = wk.split("|");
    if (riverSet.has(a) && !riverSet.has(b)) pushMouthSeed(a);
    if (riverSet.has(b) && !riverSet.has(a)) pushMouthSeed(b);
  }
  while (queue.length) {
    const cur = queue.shift();
    const curDist = mouthDistance.get(cur) || 0;
    for (const nx of riverAdj.get(cur) || []) {
      if (mouthDistance.has(nx)) continue;
      mouthDistance.set(nx, curDist + 1);
      queue.push(nx);
    }
  }

  const directedPair = (a, b) => {
    const da = mouthDistance.get(a);
    const db = mouthDistance.get(b);
    if (Number.isFinite(da) && Number.isFinite(db) && da !== db) {
      return da > db ? [a, b] : [b, a];
    }

    const al = levelOfKey(a);
    const bl = levelOfKey(b);
    if (Number.isFinite(al) && Number.isFinite(bl) && al !== bl) {
      return al > bl ? [a, b] : [b, a];
    }
    return null;
  };

  const drawFlowArrow = (fromKey, toKey, color, alpha = 0.95) => {
    const pa = parseCoordKey(fromKey);
    const pb = parseCoordKey(toKey);
    const ca = hexCenter(pa.x, pa.y);
    const cb = hexCenter(pb.x, pb.y);
    const dx = cb.cx - ca.cx;
    const dy = cb.cy - ca.cy;
    const len = Math.hypot(dx, dy);
    if (len < 8) return;

    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    const tip = {
      x: ca.cx + ux * Math.min(len - 2, len * 0.62),
      y: ca.cy + uy * Math.min(len - 2, len * 0.62)
    };
    const headLen = 6.2;
    const wing = 3.1;
    const base = { x: tip.x - ux * headLen, y: tip.y - uy * headLen };
    const p2 = { x: base.x + px * wing, y: base.y + py * wing };
    const p3 = { x: base.x - px * wing, y: base.y - py * wing };
    riverLayer.fillStyle(color, alpha);
    riverLayer.fillPoints([tip, p2, p3], true);
  };

  riverLayer.lineStyle(5, 0x9ed3ff, 0.95);
  for (const ek of riverData.edgeSet || []) {
    const [a, b] = ek.split("|");
    const pa = parseCoordKey(a);
    const pb = parseCoordKey(b);
    const ca = hexCenter(pa.x, pa.y);
    const cb = hexCenter(pb.x, pb.y);
    riverLayer.strokeLineShape(new Phaser.Geom.Line(ca.cx, ca.cy, cb.cx, cb.cy));
  }

  riverLayer.lineStyle(3.4, 0x6ab7ff, 0.82);
  for (const wk of riverData.waterLinkSet || []) {
    const [a, b] = wk.split("|");
    const pa = parseCoordKey(a);
    const pb = parseCoordKey(b);
    const ca = hexCenter(pa.x, pa.y);
    const cb = hexCenter(pb.x, pb.y);
    riverLayer.strokeLineShape(new Phaser.Geom.Line(ca.cx, ca.cy, cb.cx, cb.cy));
  }

  for (const ek of riverData.edgeSet || []) {
    const [a, b] = ek.split("|");
    const dir = directedPair(a, b);
    if (dir) drawFlowArrow(dir[0], dir[1], 0xf4fbff, 0.94);
  }
  for (const wk of riverData.waterLinkSet || []) {
    const [a, b] = wk.split("|");
    const aRiver = riverSet.has(a);
    const bRiver = riverSet.has(b);
    if (aRiver && !bRiver) drawFlowArrow(a, b, 0xcbeaff, 0.9);
    else if (bRiver && !aRiver) drawFlowArrow(b, a, 0xcbeaff, 0.9);
    else {
      const dir = directedPair(a, b);
      if (dir) drawFlowArrow(dir[0], dir[1], 0xcbeaff, 0.9);
    }
  }

  const drawNode = (key, radius, color) => {
    const p = parseCoordKey(key);
    const c = hexCenter(p.x, p.y);
    riverLayer.fillStyle(color, 1);
    riverLayer.fillCircle(c.cx, c.cy, radius);
  };

  for (const key of riverData.riverSet || []) drawNode(key, 3.1, 0xb9e2ff);
  for (const key of riverData.sourceSet || []) drawNode(key, 4.4, 0xd7f0ff);
  for (const key of riverData.branchSet || []) drawNode(key, 3.9, 0x9ed3ff);
  for (const key of riverData.mouthSet || []) drawNode(key, 3.9, 0x6ab7ff);

  if (showWaterfallEffects.value) {
    riverLayer.lineStyle(6.1, 0xf8fcff, 0.74);
    for (const ek of riverData.waterfallEdgeSet || []) {
      const [a, b] = ek.split("|");
      const pa = parseCoordKey(a);
      const pb = parseCoordKey(b);
      const ca = hexCenter(pa.x, pa.y);
      const cb = hexCenter(pb.x, pb.y);
      riverLayer.strokeLineShape(new Phaser.Geom.Line(ca.cx, ca.cy, cb.cx, cb.cy));
    }

    riverLayer.lineStyle(3.4, 0x8bd6ff, 0.95);
    for (const ek of riverData.waterfallEdgeSet || []) {
      const [a, b] = ek.split("|");
      const pa = parseCoordKey(a);
      const pb = parseCoordKey(b);
      const ca = hexCenter(pa.x, pa.y);
      const cb = hexCenter(pb.x, pb.y);
      riverLayer.strokeLineShape(new Phaser.Geom.Line(ca.cx, ca.cy, cb.cx, cb.cy));
    }

    for (const key of riverData.waterfallSet || []) {
      drawNode(key, 4.4, 0xf7fbff);
      drawNode(key, 2.4, 0x87d0ff);
    }
  }
}

function clearLabels() {
  labelTexts.forEach(t => t.destroy());
  labelTexts = [];
}

function renderMapWithPhaser() {
  if (!scene || !baseLayer || !gameRoot.value || !currentData.value) return;

  const data = currentData.value;
  const { width: worldW, height: worldH } = mapPixelSize(data.w, data.h);
  const viewW = Math.max(360, Math.floor(gameRoot.value.clientWidth || 360));
  const viewH = Math.max(340, Math.floor(gameRoot.value.clientHeight || 340));
  game.scale.resize(viewW, viewH);

  const camera = scene.cameras.main;
  camera.setBounds(0, 0, worldW, worldH);
  const zoom = Math.min(viewW / worldW, viewH / worldH, 1) * 0.96;
  camera.setZoom(Math.max(zoom, 0.16));
  camera.centerOn(worldW / 2, worldH / 2);

  baseLayer.clear();
  markerLayer.clear();
  clearLabels();
  hitAreas = [];

  baseLayer.fillStyle(0x101623, 1);
  baseLayer.fillRect(0, 0, worldW, worldH);

  const totalCells = data.w * data.h;
  const drawTerrainSymbol = totalCells <= 900;
  const drawHeightNumber = !!showHeightNumbers.value;
  const autoShrink = totalCells > 2000 ? 2 : totalCells > 1200 ? 1 : 0;
  const numberFontSize = Math.max(8, Number(heightNumberFontSize.value || 0) - autoShrink);
  const outlineWidth = Math.max(0, Number(heightNumberOutlineWidth.value || 0));

  for (let y = 0; y < data.h; y += 1) {
    for (let x = 0; x < data.w; x += 1) {
      const tileKey = `${x},${y}`;
      const rawKey = data.grid[y][x];
      const reliefKey = data.reliefMap?.[y]?.[x] || "";
      const strongInfo = data.strongMonsterInfoMap?.[y]?.[x] || null;
      const visual = tileVisual(rawKey, data.shapeOnly);
      const level = data.heightLevelMap?.[y]?.[x];
      const caveScale = data.caveScaleMap?.[y]?.[x] || "";
      const special = specialVisual(data.specialMap?.[y]?.[x], caveScale);
      const revealSpecial = !!special && (showSpecialTilesAlways.value || selectedTileKey === tileKey);
      const isWaterfall = !data.shapeOnly && !!data.riverData?.waterfallSet?.has(tileKey);
      const points = buildHexPoints(x, y);
      const polygon = new Phaser.Geom.Polygon(points);
      const mixedForestRelief = (
        !data.shapeOnly
        && rawKey === "森"
        && (reliefKey === "丘陵" || reliefKey === "山岳")
      );

      if (mixedForestRelief) {
        const reliefVisual = tileVisual(reliefKey, false);
        const forestColor = useHeightShading.value ? shadeColorByHeight(visual.color, level) : visual.color;
        const reliefColor = useHeightShading.value ? shadeColorByHeight(reliefVisual.color, level) : reliefVisual.color;
        drawSplitHex(baseLayer, points, forestColor, reliefColor);
      } else {
        const tileColor = useHeightShading.value ? shadeColorByHeight(visual.color, level) : visual.color;
        baseLayer.fillStyle(toColorInt(tileColor), 1);
        baseLayer.fillPoints(points, true);
      }
      if (revealSpecial) {
        baseLayer.fillStyle(toColorInt(special.overlayColor), special.overlayAlpha);
        baseLayer.fillPoints(points, true);
      }
      baseLayer.lineStyle(1.25, 0x2f3848, 0.88);
      baseLayer.strokePoints(points, true);

      const center = hexCenter(x, y);
      const symbolShouldDraw = drawTerrainSymbol || revealSpecial;
      if (symbolShouldDraw) {
        const terrainShort = mixedForestRelief
          ? (reliefKey === "山岳" ? "森山" : "森丘")
          : visual.short;
        const symbolLabel = scene.add.text(center.cx, center.cy - 6, revealSpecial ? special.short : terrainShort, {
          fontFamily: "Times New Roman, Yu Mincho, serif",
          fontSize: revealSpecial ? (special.key === "洞窟" ? "16px" : "18px") : "19px",
          color: revealSpecial ? special.textColor : "#f8f5e8"
        });
        symbolLabel.setOrigin(0.5);
        labelTexts.push(symbolLabel);
      }

      if (showWaterfallEffects.value && isWaterfall) {
        const fallLabel = scene.add.text(center.cx, symbolShouldDraw ? center.cy - 20 : center.cy - 10, "滝", {
          fontFamily: "Noto Sans JP, Hiragino Kaku Gothic ProN, Meiryo, sans-serif",
          fontStyle: "700",
          fontSize: "11px",
          color: "#ecf8ff"
        });
        fallLabel.setStroke("#153a52", 3);
        fallLabel.setShadow(0, 0, "#000000", 3, false, true);
        fallLabel.setOrigin(0.5);
        labelTexts.push(fallLabel);
      }

      if (strongInfo) {
        baseLayer.fillStyle(0xa83232, 0.94);
        baseLayer.fillCircle(center.cx + 13, center.cy - 14, 4.3);
        baseLayer.lineStyle(1.2, 0xffe8d6, 0.9);
        baseLayer.strokeCircle(center.cx + 13, center.cy - 14, 4.3);
        const eliteLabel = scene.add.text(center.cx + 13, center.cy - 24, "強", {
          fontFamily: "Noto Sans JP, Hiragino Kaku Gothic ProN, Meiryo, sans-serif",
          fontStyle: "700",
          fontSize: "10px",
          color: "#ffe9d1"
        });
        eliteLabel.setStroke("#4f1111", 2);
        eliteLabel.setOrigin(0.5);
        labelTexts.push(eliteLabel);
      }

      if (drawHeightNumber && Number.isFinite(level)) {
        const levelText = level >= 0 ? `+${level}` : `${level}`;
        const outlineColor = level >= 0 ? "#3a280f" : "#13273f";
        const levelLabel = scene.add.text(center.cx, symbolShouldDraw ? center.cy + 9 : center.cy + 1, levelText, {
          fontFamily: "Noto Sans JP, Hiragino Kaku Gothic ProN, Meiryo, sans-serif",
          fontStyle: "700",
          fontSize: `${numberFontSize}px`,
          color: level >= 0 ? "#fff2bf" : "#c7d8ff"
        });
        if (outlineWidth > 0) {
          levelLabel.setStroke(outlineColor, outlineWidth);
        }
        levelLabel.setShadow(0, 0, "#000000", outlineWidth >= 3 ? 4 : 2, false, true);
        levelLabel.setOrigin(0.5);
        labelTexts.push(levelLabel);
      }

      const river = !data.shapeOnly && !!data.riverData?.riverSet?.has(tileKey);
      const waterfall = isWaterfall;
      hitAreas.push({
        x,
        y,
        terrain: visual.key,
        river,
        waterfall,
        special: data.specialMap?.[y]?.[x] || "",
        relief: reliefKey,
        strongInfo,
        caveScale,
        caveSize: data.caveSizeMap?.[y]?.[x] || 0,
        polygon
      });
    }
  }

  drawRiverOverlay(data);

  if (selectedTileKey) {
    const match = hitAreas.find(t => `${t.x},${t.y}` === selectedTileKey);
    if (match) {
      markerLayer.lineStyle(2.8, 0xffe1a8, 1);
      markerLayer.strokePoints(match.polygon.points, true);
      markerLayer.fillStyle(0xffe1a8, 0.15);
      markerLayer.fillPoints(match.polygon.points, true);
    }
  }
}

function applyMapData(data) {
  currentData.value = data;
  selectedTileKey = "";
  updateMeta(data);
  renderMapWithPhaser();
}

function generateShapeMap() {
  const { w, h } = parseMapSizeValue(mapSize.value);
  const islandCustomSettings = buildIslandCustomSettings();
  const data = createIslandShapeData({
    w,
    h,
    patternId: patternId.value,
    islandCustomSettings
  });
  applyMapData(data);
}

function generateTerrainMap() {
  const { w, h } = parseMapSizeValue(mapSize.value);
  const islandCustomSettings = buildIslandCustomSettings();
  const data = createTerrainMapData({
    w,
    h,
    patternId: patternId.value,
    mountainMode: mountainMode.value,
    islandCustomSettings
  });
  applyMapData(data);
}

function handlePointerDown(pointer) {
  const picked = hitAreas.find(area => Phaser.Geom.Polygon.Contains(area.polygon, pointer.worldX, pointer.worldY));
  if (!picked || !currentData.value) return;
  selectedTileKey = `${picked.x},${picked.y}`;
  const heightRaw = currentData.value.heightMap?.[picked.y]?.[picked.x];
  const heightLevel = currentData.value.heightLevelMap?.[picked.y]?.[picked.x];
  const river = picked.river ? "あり" : "なし";
  const waterfall = picked.waterfall ? "あり" : "なし";
  const special = picked.special || "-";
  const relief = picked.relief && picked.relief !== picked.terrain ? picked.relief : "-";
  const strong = picked.strongInfo
    ? `候補(Lv${picked.strongInfo.level}, ${Array.isArray(picked.strongInfo.rules) ? picked.strongInfo.rules.join("+") : "-"})`
    : "なし";
  const caveScale = picked.special === "洞窟"
    ? (picked.caveScale === "large" ? "大" : picked.caveScale === "medium" ? "中" : "小")
    : "-";
  const caveSize = picked.special === "洞窟" ? picked.caveSize : "-";
  mapClickInfo.value = `クリック座標: (${picked.x}, ${picked.y}) / 地形: ${picked.terrain} / 地勢: ${relief} / 強敵: ${strong} / 特殊: ${special} / 洞窟規模: ${caveScale}(${caveSize}) / 川: ${river} / 滝: ${waterfall} / 高度Lv: ${Number.isFinite(heightLevel) ? heightLevel : "-"} / 高度Raw: ${Number.isFinite(heightRaw) ? heightRaw : "-"}`;
  renderMapWithPhaser();
}

onMounted(async () => {
  await nextTick();
  if (!gameRoot.value) return;

  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: gameRoot.value,
    width: 960,
    height: 640,
    transparent: true,
    scene: {
      create() {
        scene = this;
        baseLayer = this.add.graphics();
        riverLayer = this.add.graphics();
        markerLayer = this.add.graphics();
        this.input.on("pointerdown", handlePointerDown);
        generateShapeMap();
      }
    }
  });

  resizeHandler = () => renderMapWithPhaser();
  window.addEventListener("resize", resizeHandler);
});

onBeforeUnmount(() => {
  if (resizeHandler) window.removeEventListener("resize", resizeHandler);
  if (game) {
    game.destroy(true);
    game = null;
  }
});

watch([showHeightNumbers, heightNumberFontSize, heightNumberOutlineWidth, useHeightShading, showSpecialTilesAlways, showWaterfallEffects], () => {
  renderMapWithPhaser();
});
</script>

<template>
  <section class="panel simulator map-top phaser-map-panel">
    <h2>地形ランダム生成 (Phaser)</h2>
    <div class="map-tools">
      <label>マップサイズ
        <select v-model="mapSize">
          <option value="24x24">小 (24x24 = 144マス)</option>
          <option value="36x36">中 (36x36 = 324マス / 推奨)</option>
          <option value="54x54">大 (54x54 = 576マス)</option>
        </select>
      </label>
      <label>島形状パターン
        <select v-model="patternId">
          <option value="realistic">リアル島</option>
          <option value="balanced">標準諸島</option>
          <option value="continent">大陸型</option>
          <option value="archipelago">多島海</option>
          <option value="twins">双子島</option>
          <option value="chain">列島型</option>
        </select>
      </label>
      <button type="button" class="secondary" @click="showIslandCustomModal = true">島カスタム設定</button>
      <button type="button" class="secondary" @click="showSettingsModal = true">設定</button>
      <button id="generateShapeBtn" class="secondary" type="button" @click="generateShapeMap">島形状のみ</button>
      <button id="generateMapBtn" class="secondary" type="button" @click="generateTerrainMap">生成</button>
    </div>
    <div id="mapClickInfo" class="map-click-info">{{ mapClickInfo }}</div>

    <div id="mapGrid" ref="gameRoot" class="phaser-map-canvas"></div>
    <div class="small phaser-help">クリックで座標・地形・高度を表示します。</div>
    <section class="generation-details">
      <div class="map-meta">
        <div id="mapSizeInfo">{{ mapSizeInfo }}</div>
        <div id="mapCenterInfo">{{ mapCenterInfo }}</div>
        <div id="mapTerrainProfileInfo">{{ mapTerrainProfileInfo }}</div>
      </div>
      <pre id="mapStats" class="phaser-map-stats">{{ mapStats }}</pre>
    </section>

    <div v-if="showSettingsModal" class="settings-backdrop" @click.self="showSettingsModal = false">
      <div class="settings-modal">
        <h3>表示設定</h3>
        <label class="setting-row">
          <input v-model="showHeightNumbers" type="checkbox" />
          タイル上に高度Lvを表示する
        </label>
        <label class="setting-row">
          <input v-model="useHeightShading" type="checkbox" />
          高度で色を補正する（低いほど明るい）
        </label>
        <label class="setting-row">
          <input v-model="showSpecialTilesAlways" type="checkbox" />
          隠し特殊地形を常時表示する
        </label>
        <label class="setting-row">
          <input v-model="showWaterfallEffects" type="checkbox" />
          滝エフェクトを表示する
        </label>
        <label class="setting-column">
          <span>山岳モード</span>
          <select v-model="mountainMode">
            <option value="random">ランダム (単峰/群峰/混合)</option>
            <option value="single">単峰 固定</option>
            <option value="multi">群峰 固定</option>
            <option value="mixed">混合 固定</option>
          </select>
        </label>
        <label class="setting-column">
          <span>高度Lv文字サイズ: {{ heightNumberFontSize }}px</span>
          <input v-model.number="heightNumberFontSize" type="range" min="10" max="28" step="1" />
        </label>
        <label class="setting-column">
          <span>高度Lv枠線の太さ: {{ heightNumberOutlineWidth }}px</span>
          <input v-model.number="heightNumberOutlineWidth" type="range" min="0" max="6" step="1" />
        </label>
        <div class="setting-note">
          隠し特殊地形は通常時は見えず、クリック時のみ判明します。常時表示をONで最初から見えます。
        </div>
        <div class="setting-actions">
          <button type="button" class="secondary" @click="showSettingsModal = false">閉じる</button>
        </div>
      </div>
    </div>

    <div v-if="showIslandCustomModal" class="settings-backdrop" @click.self="showIslandCustomModal = false">
      <div class="settings-modal">
        <h3>島カスタム設定</h3>
        <label class="setting-row">
          <input v-model="useIslandCustomSettings" type="checkbox" />
          カスタム島生成を使用する
        </label>
        <label class="setting-column">
          <span>大島の数</span>
          <input v-model.number="customLargeIslandCount" type="number" min="1" max="8" step="1" :disabled="!useIslandCustomSettings" />
        </label>
        <label class="setting-column">
          <span>孤島数 (最小〜最大)</span>
          <div class="inline-pair">
            <input v-model.number="customIsletCountMin" type="number" min="0" max="12" step="1" :disabled="!useIslandCustomSettings" />
            <span>〜</span>
            <input v-model.number="customIsletCountMax" type="number" min="0" max="12" step="1" :disabled="!useIslandCustomSettings" />
          </div>
        </label>
        <label class="setting-column">
          <span>大島間の最小距離</span>
          <input v-model.number="customLargeIslandMinGap" type="number" min="2" max="12" step="1" :disabled="!useIslandCustomSettings" />
        </label>
        <label class="setting-column">
          <span>目標陸地率: {{ customTargetLandPercent }}%</span>
          <input v-model.number="customTargetLandPercent" type="range" min="25" max="60" step="1" :disabled="!useIslandCustomSettings" />
        </label>
        <div class="setting-note">
          カスタムON時は、島形状パターンを土台にしつつ大島/孤島配置を上書きします。孤島サイズは孤島数に応じて自動調整し、目標陸地率(初期50%)に寄せて生成します。
        </div>
        <div class="setting-actions">
          <button type="button" class="secondary" @click="showIslandCustomModal = false">閉じる</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.phaser-map-panel {
  border-color: #8f7449;
  background:
    linear-gradient(165deg, rgba(69, 49, 24, 0.86), rgba(21, 17, 12, 0.9)),
    url("/assets/images/background-image.webp") center / cover no-repeat;
  color: #f8f0d8;
  box-shadow: 0 12px 28px rgba(15, 10, 5, 0.45);
  font-size: 25px;
}

.phaser-map-panel h2 {
  margin-top: 0;
  color: #f5e7b7;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  letter-spacing: 0.04em;
}

.phaser-map-stats {
  margin: 8px 0;
  white-space: pre-wrap;
  border: 1px solid rgba(201, 169, 109, 0.5);
  border-radius: 8px;
  background: rgba(32, 23, 14, 0.66);
  color: #f6eecf;
  padding: 8px;
  font-family: "Times New Roman", "Yu Mincho", serif;
}

.phaser-map-canvas {
  width: 100%;
  height: min(68vh, 760px);
  border-radius: 10px;
  border: 1px solid rgba(214, 183, 124, 0.4);
  background: radial-gradient(circle at 30% 20%, #1d2835, #0f141f);
  overflow: hidden;
}

.phaser-help {
  margin-top: 6px;
  color: #ddcda0;
}

.map-click-info {
  margin-top: 8px;
  margin-bottom: 8px;
  border: 1px solid rgba(235, 203, 142, 0.52);
  border-radius: 8px;
  padding: 9px 10px;
  color: #fff4cf;
  background: linear-gradient(170deg, rgba(26, 33, 48, 0.85), rgba(20, 15, 10, 0.75));
  box-shadow: inset 0 0 0 1px rgba(255, 236, 189, 0.12);
  font-size: 0.96rem;
  font-weight: 600;
  line-height: 1.38;
  word-break: break-word;
}

.generation-details {
  margin-top: 10px;
}

.settings-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(10, 7, 4, 0.5);
  display: grid;
  place-items: center;
  padding: 14px;
  z-index: 1200;
}

.settings-modal {
  width: min(420px, 100%);
  background: linear-gradient(170deg, rgba(56, 40, 22, 0.96), rgba(20, 14, 9, 0.96));
  border: 1px solid rgba(218, 184, 121, 0.55);
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.44);
}

.settings-modal h3 {
  margin: 0 0 8px;
  color: #f6e6b5;
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #f4ebd2;
}

.setting-note {
  margin-top: 8px;
  color: #dccfa8;
  font-size: 0.86rem;
}

.setting-column {
  display: grid;
  gap: 6px;
  margin-top: 10px;
  color: #f4ebd2;
}

.setting-column input[type="range"] {
  accent-color: #d3b277;
}

.inline-pair {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 8px;
  align-items: center;
}

.setting-actions {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
}
</style>
