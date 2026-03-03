<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Phaser from "phaser";
import GenericModal from "./GenericModal.vue";
import { getGameAudioController } from "../lib/audio-player.js";
import {
  advanceTerrainTurn,
  createIslandShapeData,
  createTerrainMapData,
  hexCenter,
  parseCoordKey,
  terrainDefinitions
} from "../lib/map-generator.js";
import classDb from "../../../data/source/export/json/クラス.json";
import equipmentDb from "../../../data/source/export/json/装備.json";

const props = defineProps({
  selectedRace: { type: String, default: "" },
  selectedClass: { type: String, default: "" }
});
const emit = defineEmits(["character-state-change"]);

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
const showHeightNumbers = ref(false);
const heightNumberFontSize = ref(23);
const heightNumberOutlineWidth = ref(3);
const useHeightShading = ref(true);
const showSpecialTilesAlways = ref(true);
const showWaterfallEffects = ref(true);
const showStrongEnemyMarkers = ref(false);
const showSettingsModal = ref(false);
const showEventControlModal = ref(false);
const eventActionType = ref("normal");
const showEventModal = ref(false);
const eventModalMessage = ref("");
const eventModalNotes = ref([]);
const mapSizeInfo = ref("サイズ: -");
const mapCenterInfo = ref("中央座標: -");
const mapTerrainProfileInfo = ref("地形比率: -");
const mapClickInfo = ref("クリック座標: -");
const mapStats = ref("地形未生成");
const gameRoot = ref(null);
const currentData = ref(null);
const zoomPercent = ref(100);
const isDevBuild = import.meta.env.DEV;
const showDevInfo = ref(isDevBuild);
const clockNowMs = ref(Date.now());
const mapClockStartMs = ref(Date.now());
const villageState = ref(null);
const unitList = ref([]);
const selectedUnitId = ref("");
const unitMoveMode = ref(false);
const villageInfoText = ref("初期村: -");
const unitInfoText = ref("選択ユニット: -");
const unitRulesInfoText = ref("部隊生成ルール: 一般兵 6-10 / ネームド 1");
const audio = getGameAudioController();
const initialAudioVolumes = audio.getVolumeSettings();
const masterVolumePercent = ref(Math.round((initialAudioVolumes.masterVolume ?? 0.5) * 100));
const bgmVolumePercent = ref(Math.round((initialAudioVolumes.bgmVolume ?? 0.5) * 100));
const seVolumePercent = ref(Math.round((initialAudioVolumes.seVolume ?? 0.5) * 100));

let game = null;
let scene = null;
let baseLayer = null;
let riverLayer = null;
let lavaLayer = null;
let unitLayer = null;
let scoutLayer = null;
let markerLayer = null;
let labelTexts = [];
let hitAreas = [];
let selectedTileKey = "";
let resizeHandler = null;
let clockIntervalId = null;
let firstGestureHandler = null;

const terrainMap = computed(() => {
  const m = new Map();
  terrainDefinitions.forEach(def => m.set(def.key, def));
  return m;
});

const customTargetLandTilesLabel = computed(() => {
  const { w, h } = parseMapSizeValue(mapSize.value);
  const total = w * h;
  const raw = Number.isFinite(customTargetLandPercent.value)
    ? customTargetLandPercent.value
    : Number(customTargetLandPercent.value);
  const pct = Math.max(25, Math.min(60, Number.isFinite(raw) ? raw : 50));
  return `${Math.round((total * pct) / 100)} / ${total} マス`;
});

const fieldResourceSummary = computed(() => {
  const data = currentData.value;
  if (!data?.grid || !Number.isFinite(data.w) || !Number.isFinite(data.h)) {
    return {
      food: "-",
      material: "-"
    };
  }
  const counts = {};
  terrainDefinitions.forEach(t => { counts[t.key] = 0; });
  for (let y = 0; y < data.h; y += 1) {
    for (let x = 0; x < data.w; x += 1) {
      const key = data.grid[y][x];
      if (Object.prototype.hasOwnProperty.call(counts, key)) {
        counts[key] += 1;
      }
    }
  }
  const food = (
    (counts.平地 || 0) * 2
    + (counts.森 || 0) * 1
    + (counts.丘陵 || 0) * 1
    + (counts.河川 || 0) * 2
    + (counts.湖 || 0) * 2
    + (counts.山岳 || 0) * 0
    + (counts.砂漠 || 0) * 0
  );
  const material = (
    (counts.平地 || 0) * 0
    + (counts.森 || 0) * 1
    + (counts.丘陵 || 0) * 2
    + (counts.山岳 || 0) * 3
    + (counts.河川 || 0) * 0
    + (counts.湖 || 0) * 0
    + (counts.砂漠 || 0) * 1
  );
  return {
    food,
    material
  };
});

function formatElapsedClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const turnDurationSec = 60;

const elapsedSeconds = computed(() => {
  const elapsedSec = Math.floor((clockNowMs.value - mapClockStartMs.value) / 1000);
  return Math.max(0, elapsedSec);
});

const elapsedClockText = computed(() => {
  return formatElapsedClock(elapsedSeconds.value);
});

const turnClockCycleSeconds = computed(() => {
  return elapsedSeconds.value % turnDurationSec;
});

const turnClockRemainingSeconds = computed(() => {
  return turnDurationSec - turnClockCycleSeconds.value;
});

const turnClockHandDeg = computed(() => {
  return (turnClockCycleSeconds.value / turnDurationSec) * 360;
});

const turnClockTurnNumber = computed(() => {
  return Math.floor(elapsedSeconds.value / turnDurationSec) + 1;
});

const mapTurnNumber = computed(() => {
  const turn = Number(currentData.value?.turnState?.turnNumber || 0);
  return Math.max(0, Math.floor(turn));
});

const eventModeOptions = [
  { value: "normal", label: "通常", desc: "確率で噴火・溶岩を判定" },
  { value: "eruption", label: "噴火のみ", desc: "山岳を優先して火山化" },
  { value: "lava", label: "溶岩のみ", desc: "既存火山から溶岩のみ進行" },
  { value: "both", label: "噴火+溶岩", desc: "同ターンで噴火と溶岩を実行" }
];

function eventModeLabel(mode) {
  if (mode === "eruption") return "噴火のみ";
  if (mode === "lava") return "溶岩のみ";
  if (mode === "both") return "噴火 + 溶岩";
  return "通常";
}

function kickOffBgm() {
  void audio.startDefaultBgm();
}

function lavaStopReasonLabel(reason) {
  if (reason === "river_hit") return "川衝突";
  if (reason === "random_stop") return "ランダム停止";
  if (reason === "direction_blocked") return "進行方向維持不可";
  if (reason === "no_path") return "進路なし";
  if (reason === "source_lost") return "火山源消失";
  return reason || "-";
}

const displaySettingsFields = computed(() => ([
  {
    key: "section_display",
    kind: "header",
    label: "表示設定"
  },
  {
    key: "showHeightNumbers",
    kind: "checkbox",
    label: "タイル上に高度Lvを表示する",
    value: showHeightNumbers.value
  },
  {
    key: "useHeightShading",
    kind: "checkbox",
    label: "高度で色を補正する（低いほど明るい）",
    value: useHeightShading.value
  },
  {
    key: "showSpecialTilesAlways",
    kind: "checkbox",
    label: "隠し特殊地形を常時表示する",
    value: showSpecialTilesAlways.value
  },
  {
    key: "showWaterfallEffects",
    kind: "checkbox",
    label: "滝エフェクトを表示する",
    value: showWaterfallEffects.value
  },
  {
    key: "showStrongEnemyMarkers",
    kind: "checkbox",
    label: "強敵候補を表示する",
    value: showStrongEnemyMarkers.value
  },
  {
    key: "mountainMode",
    kind: "select",
    label: "山岳モード",
    value: mountainMode.value,
    options: [
      { label: "ランダム (単峰/群峰/混合)", value: "random" },
      { label: "単峰 固定", value: "single" },
      { label: "群峰 固定", value: "multi" },
      { label: "混合 固定", value: "mixed" }
    ]
  },
  {
    key: "heightNumberFontSize",
    kind: "range",
    label: "高度Lv文字サイズ",
    suffix: "px",
    value: heightNumberFontSize.value,
    min: 10,
    max: 28,
    step: 1
  },
  {
    key: "heightNumberOutlineWidth",
    kind: "range",
    label: "高度Lv枠線の太さ",
    suffix: "px",
    value: heightNumberOutlineWidth.value,
    min: 0,
    max: 6,
    step: 1
  },
  {
    key: "section_audio",
    kind: "header",
    label: "音声設定"
  },
  {
    key: "masterVolumePercent",
    kind: "range",
    label: "全体音量",
    suffix: "%",
    value: masterVolumePercent.value,
    min: 0,
    max: 100,
    step: 1
  },
  {
    key: "bgmVolumePercent",
    kind: "range",
    label: "BGM音量",
    suffix: "%",
    value: bgmVolumePercent.value,
    min: 0,
    max: 100,
    step: 1
  },
  {
    key: "seVolumePercent",
    kind: "range",
    label: "SE音量",
    suffix: "%",
    value: seVolumePercent.value,
    min: 0,
    max: 100,
    step: 1
  }
]));

const displaySettingsNotes = [
  "隠し特殊地形は通常時は見えず、クリック時のみ判明します。常時表示をONで最初から見えます。",
  "音量は 全体 x BGM/SE の乗算で適用されます。"
];

const RACE_CLASS_NAME_MAP = {
  "只人": "ヒューマン",
  "エルフ": "エルフ",
  "オーガ": "オーガ",
  "ゴブリン": "ゴブリン",
  "竜人": "ドラゴニュート",
  "悪魔": "デヴィル",
  "天使": "エンジェル",
  "ヴァンパイア": "ヴァンパイア"
};

const STATUS_FIELDS = ["HP", "攻撃", "防御", "魔力", "精神", "速度", "命中", "SIZ"];
const STATUS_GROWTH_FIELDS = ["HP", "攻撃", "防御", "魔力", "精神", "速度", "命中"];
const ACQUIRED_SKILL_FIELDS = ["Skill1", "Skill2", "Skill3", "Skill4", "Skill5", "Skill6", "Skill7", "Skill8", "Skill9", "Skill10"];
const NAMED_POOL = ["アレス", "リリア", "ガルド", "セレス", "ノクス", "フレア", "ヴェルク", "イリス"];
const VILLAGE_NAME_POOL = ["開拓村アスタ", "辺境村ノルド", "河畔村エイル", "森縁村リグナ", "丘陵村ブラム"];
const INITIAL_LEVEL_MIN = 5;
const INITIAL_LEVEL_MAX = 10;
const BASE_RACE_LEVEL = 5;
const BONUS_RACE_LEVEL = 5;
const HUMAN_CLASS_BONUS_LEVEL = 5;
const STATUS_GROWTH_DIVISOR = 10;

const classRows = computed(() => {
  if (!Array.isArray(classDb)) return [];
  return classDb.filter(row => nonEmptyText(row?.名前));
});

const jobClassRows = computed(() => {
  return classRows.value.filter(row => nonEmptyText(row?.種類) === "職業");
});

const equipmentRows = computed(() => {
  if (!Array.isArray(equipmentDb)) return [];
  return equipmentDb.filter(row => nonEmptyText(row?.装備名));
});

const selectedUnit = computed(() => {
  return unitList.value.find(unit => unit.id === selectedUnitId.value) || null;
});

function nonEmptyText(value) {
  const text = String(value ?? "").trim();
  return text.length ? text : "";
}

function toSafeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function randomInt(min, max) {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function randomPick(arr, fallback = null) {
  if (!Array.isArray(arr) || !arr.length) return fallback;
  return arr[Math.floor(Math.random() * arr.length)] ?? fallback;
}

function coordKey(x, y) {
  return `${x},${y}`;
}

function parseMapSizeValue(value) {
  const [w, h] = String(value || "36x36").split("x").map(Number);
  return { w: w || 36, h: h || 36 };
}

function getHexNeighborCoordsBySize(w, h, x, y) {
  const isOddRow = y % 2 === 1;
  const deltas = isOddRow
    ? [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]]
    : [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];
  const result = [];
  for (const [dx, dy] of deltas) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    result.push({ x: nx, y: ny });
  }
  return result;
}

function isPassableTerrain(terrain) {
  return terrain !== "海" && terrain !== "湖";
}

function hexDistance(a, b) {
  const toCube = ({ x, y }) => {
    const q = x - ((y - (y & 1)) / 2);
    const r = y;
    const cx = q;
    const cz = r;
    const cy = -cx - cz;
    return { cx, cy, cz };
  };
  const ca = toCube(a);
  const cb = toCube(b);
  return Math.max(
    Math.abs(ca.cx - cb.cx),
    Math.abs(ca.cy - cb.cy),
    Math.abs(ca.cz - cb.cz)
  );
}

function findPathDistance(data, sx, sy, tx, ty, maxDistance) {
  if (!data?.grid) return null;
  if (sx === tx && sy === ty) return 0;
  const visited = new Set([coordKey(sx, sy)]);
  const queue = [{ x: sx, y: sy, d: 0 }];
  while (queue.length) {
    const cur = queue.shift();
    if (cur.d >= maxDistance) continue;
    const neighbors = getHexNeighborCoordsBySize(data.w, data.h, cur.x, cur.y);
    for (const n of neighbors) {
      const k = coordKey(n.x, n.y);
      if (visited.has(k)) continue;
      if (!isPassableTerrain(data.grid[n.y][n.x])) continue;
      const nd = cur.d + 1;
      if (n.x === tx && n.y === ty) return nd;
      visited.add(k);
      queue.push({ x: n.x, y: n.y, d: nd });
    }
  }
  return null;
}

function resolveRaceBaseClassName(raceKey) {
  const race = nonEmptyText(raceKey);
  return RACE_CLASS_NAME_MAP[race] || race || "ヒューマン";
}

function findClassRowByName(name) {
  const target = nonEmptyText(name);
  if (!target) return null;
  return classRows.value.find(row => nonEmptyText(row?.名前) === target) || null;
}

function choosePrimaryClassForGeneration() {
  const fromSelection = findClassRowByName(props.selectedClass);
  if (fromSelection) return fromSelection;
  return randomPick(jobClassRows.value, null);
}

function chooseRaceBaseRowForSelection() {
  const raceName = resolveRaceBaseClassName(props.selectedRace);
  return findClassRowByName(raceName);
}

function raceIsHumanType(raceRow) {
  return nonEmptyText(raceRow?.種類) === "人族";
}

function rowStatusVector(row, fields = STATUS_GROWTH_FIELDS) {
  const out = {};
  for (const key of fields) {
    const raw = Math.max(0, toSafeNumber(row?.[key], 0));
    out[key] = Math.max(0, Math.round(raw / STATUS_GROWTH_DIVISOR));
  }
  return out;
}

function multiplyStatusVector(vector, factor) {
  const out = {};
  const scale = Math.max(0, Math.round(toSafeNumber(factor, 0)));
  for (const key of Object.keys(vector || {})) {
    out[key] = Math.max(0, Math.round(toSafeNumber(vector[key], 0) * scale));
  }
  return out;
}

function addStatusVectors(...vectors) {
  const out = {};
  for (const field of STATUS_GROWTH_FIELDS) out[field] = 0;
  for (const vec of vectors) {
    if (!vec) continue;
    for (const field of STATUS_GROWTH_FIELDS) {
      out[field] += Math.max(0, Math.round(toSafeNumber(vec[field], 0)));
    }
  }
  return out;
}

function formatStatusCompact(status) {
  if (!status) return "-";
  return `HP${status.HP} 攻${status.攻撃} 防${status.防御} 魔${status.魔力} 精${status.精神} 速${status.速度} 命${status.命中} SIZ${status.SIZ}`;
}

function buildCharacterStatusFromRules(raceRow, classRow, level) {
  const safeLevel = Math.max(INITIAL_LEVEL_MIN, Math.min(INITIAL_LEVEL_MAX, Math.round(toSafeNumber(level, INITIAL_LEVEL_MIN))));
  const raceLevels = BASE_RACE_LEVEL + BONUS_RACE_LEVEL;
  const classPerLevelGain = Math.max(0, safeLevel - 1);
  const classBonus = raceIsHumanType(raceRow) ? HUMAN_CLASS_BONUS_LEVEL : 0;
  const classLevels = classPerLevelGain + classBonus;

  const raceGrowth = multiplyStatusVector(rowStatusVector(raceRow), raceLevels);
  const classGrowth = multiplyStatusVector(rowStatusVector(classRow), classLevels);
  const mergedGrowth = addStatusVectors(raceGrowth, classGrowth);
  const sizBase = Math.max(1, Math.round(toSafeNumber(raceRow?.SIZ, toSafeNumber(classRow?.SIZ, 100))));
  const status = {
    ...mergedGrowth,
    SIZ: sizBase
  };
  return {
    level: safeLevel,
    raceLevels,
    classLevels,
    classBonus,
    classPerLevelGain,
    status
  };
}

function pickVillageCoord(data) {
  if (!data?.grid || !Number.isFinite(data?.w) || !Number.isFinite(data?.h)) return null;
  const cx = (data.w - 1) / 2;
  const cy = (data.h - 1) / 2;
  let best = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let y = 0; y < data.h; y += 1) {
    for (let x = 0; x < data.w; x += 1) {
      const terrain = data.grid[y][x];
      if (!isPassableTerrain(terrain)) continue;
      if (terrain === "火山") continue;
      const dist = Math.hypot(x - cx, y - cy);
      let score = -dist;
      if (terrain === "平地") score += 3.5;
      else if (terrain === "森") score += 3.2;
      else if (terrain === "丘陵") score += 2.8;
      else if (terrain === "河川") score += 2.2;
      else if (terrain === "山岳") score += 0.5;
      else if (terrain === "砂漠") score -= 0.8;
      score += (Math.random() * 0.6);
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  return best;
}

function clearCharacterGenerationState() {
  villageState.value = null;
  unitList.value = [];
  selectedUnitId.value = "";
  updateVillageInfoText();
  updateUnitInfoText();
  emitCharacterStateChange();
}

function pickClassRowForCharacter(raceRow) {
  let selected = choosePrimaryClassForGeneration();
  if (raceIsHumanType(raceRow) && nonEmptyText(selected?.種類) !== "職業") {
    selected = randomPick(jobClassRows.value, selected);
  }
  if (!selected) {
    selected = randomPick(jobClassRows.value, null);
  }
  return selected;
}

function createVillageAndInitialUnit(data) {
  if (!data || data.shapeOnly) {
    clearCharacterGenerationState();
    return;
  }
  const villageCoord = pickVillageCoord(data);
  if (!villageCoord) {
    clearCharacterGenerationState();
    return;
  }
  const raceRow = chooseRaceBaseRowForSelection() || findClassRowByName("ヒューマン") || classRows.value[0] || null;
  const classRow = pickClassRowForCharacter(raceRow) || raceRow;
  const level = randomInt(INITIAL_LEVEL_MIN, INITIAL_LEVEL_MAX);
  const built = buildCharacterStatusFromRules(raceRow, classRow, level);

  villageState.value = {
    id: `village-${villageCoord.x}-${villageCoord.y}`,
    name: randomPick(VILLAGE_NAME_POOL, "開拓村"),
    x: villageCoord.x,
    y: villageCoord.y,
    population: randomInt(90, 180),
    foodStock: randomInt(170, 280),
    materialStock: randomInt(120, 240)
  };

  const unit = {
    id: `unit-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    unitType: "ネームド",
    name: randomPick(NAMED_POOL, "ネームド"),
    race: nonEmptyText(props.selectedRace) || nonEmptyText(raceRow?.名前) || "未設定",
    className: nonEmptyText(classRow?.名前) || "未設定",
    level: built.level,
    x: villageCoord.x,
    y: villageCoord.y,
    moveRange: 4,
    scoutRange: 4,
    equipment: chooseEquipmentForClass(classRow, true),
    status: built.status,
    growthRule: {
      raceLevels: built.raceLevels,
      classLevels: built.classLevels,
      classBonus: built.classBonus,
      classPerLevelGain: built.classPerLevelGain
    },
    skills: buildUnitSkillsFromClass(classRow)
  };

  unitList.value = [unit];
  selectedUnitId.value = unit.id;
  updateVillageInfoText();
  unitRulesInfoText.value = `キャラ生成ルール: 初期Lv ${INITIAL_LEVEL_MIN}-${INITIAL_LEVEL_MAX} / 種族Lv ${BASE_RACE_LEVEL}+${BONUS_RACE_LEVEL}(スキルなし) / 人族クラス補正 +${HUMAN_CLASS_BONUS_LEVEL}Lv / 成長係数 1/${STATUS_GROWTH_DIVISOR}`;
  updateUnitInfoText(`ステータス ${formatStatusCompact(unit.status)} / 種族Lv${built.raceLevels} + クラスLv${built.classLevels}`);
  emitCharacterStateChange();
}

function emitCharacterStateChange() {
  emit("character-state-change", {
    village: villageState.value
      ? { ...villageState.value }
      : null,
    units: unitList.value.map(unit => ({
      ...unit,
      status: unit?.status ? { ...unit.status } : null,
      growthRule: unit?.growthRule ? { ...unit.growthRule } : null,
      equipment: Array.isArray(unit?.equipment) ? unit.equipment.map(e => ({ ...e })) : [],
      skills: Array.isArray(unit?.skills) ? [...unit.skills] : []
    })),
    selectedUnitId: selectedUnitId.value || "",
    ruleText: unitRulesInfoText.value || ""
  });
}

function createEquipmentEntry(row, isNamed) {
  const quality = isNamed ? randomPick(["rare", "epic"], "rare") : randomPick(["common", "uncommon"], "common");
  const qualityBonus = quality === "epic" ? 8 : quality === "rare" ? 4 : quality === "uncommon" ? 2 : 0;
  const power = toSafeNumber(row?.威力, 0);
  const guard = toSafeNumber(row?.ガード, 0);
  const traits = [row?.特性1, row?.特性2, row?.特性3, row?.特性4]
    .map(v => nonEmptyText(v))
    .filter(Boolean);
  return {
    name: nonEmptyText(row?.装備名) || "装備なし",
    quality,
    power,
    guard,
    atkBonus: Math.max(0, Math.floor(power / 8) + qualityBonus),
    defBonus: Math.max(0, Math.floor(guard / 10) + Math.floor(qualityBonus / 2)),
    traits
  };
}

function chooseEquipmentForClass(classRow, isNamed) {
  if (!equipmentRows.value.length) return [];
  const atk = toSafeNumber(classRow?.攻撃, 0);
  const mag = toSafeNumber(classRow?.魔力, 0);
  let pool = equipmentRows.value;
  if (mag > atk + 12) {
    pool = equipmentRows.value.filter(row => nonEmptyText(row.装備名).includes("杖"));
  } else if (atk > mag + 8) {
    pool = equipmentRows.value.filter(row => ["短剣", "剣", "長剣", "槍", "斧", "戦槌", "棍棒", "弓", "銃"].includes(nonEmptyText(row.装備名)));
  }
  const primaryRow = randomPick(pool, randomPick(equipmentRows.value, null));
  const loadout = [];
  if (primaryRow) loadout.push(createEquipmentEntry(primaryRow, isNamed));
  const shieldPool = equipmentRows.value.filter(row => ["盾", "大盾"].includes(nonEmptyText(row.装備名)));
  const shieldChance = isNamed ? 0.65 : 0.35;
  if (Math.random() < shieldChance) {
    const shield = randomPick(shieldPool, null);
    if (shield) loadout.push(createEquipmentEntry(shield, isNamed));
  }
  return loadout;
}

function buildUnitSkillsFromClass(classRow) {
  const skills = [];
  for (const field of ACQUIRED_SKILL_FIELDS) {
    const name = nonEmptyText(classRow?.[field]);
    if (!name || name === "0") continue;
    skills.push(name);
  }
  return [...new Set(skills)];
}

function updateVillageInfoText() {
  const v = villageState.value;
  if (!v) {
    villageInfoText.value = "初期村: -";
    return;
  }
  villageInfoText.value = `初期村: ${v.name} / 座標 (${v.x}, ${v.y}) / 人口 ${v.population} / 食料 ${v.foodStock} / 資材 ${v.materialStock}`;
}

function updateUnitInfoText(extra = "") {
  const unit = selectedUnit.value;
  if (!unit) {
    unitInfoText.value = "選択ユニット: -";
    return;
  }
  const eqText = unit.equipment.length
    ? unit.equipment.map(e => `${e.name}[${e.quality}]`).join(", ")
    : "なし";
  const note = extra ? ` / ${extra}` : "";
  unitInfoText.value = `選択ユニット: ${unit.name}(${unit.unitType}) / Lv${unit.level} / 種族:${unit.race} / クラス:${unit.className} / 位置(${unit.x}, ${unit.y}) / 移動${unit.moveRange} / 索敵${unit.scoutRange} / 装備:${eqText}${note}`;
}

function unitsAt(x, y) {
  return unitList.value.filter(unit => unit.x === x && unit.y === y);
}

function normalizeVolumePercent(value, fallback = 100) {
  const raw = Number.isFinite(value) ? value : Number(value);
  const safe = Number.isFinite(raw) ? Math.round(raw) : fallback;
  return Math.max(0, Math.min(100, safe));
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

function nudgeCustomIslandInt(key, delta) {
  const step = Number.isFinite(delta) ? Math.trunc(delta) : Number(delta);
  if (!Number.isFinite(step) || step === 0) return;
  if (key === "largeIslandCount") {
    customLargeIslandCount.value = Number(customLargeIslandCount.value) + step;
  } else if (key === "largeIslandMinGap") {
    customLargeIslandMinGap.value = Number(customLargeIslandMinGap.value) + step;
  } else if (key === "isletCountMin") {
    customIsletCountMin.value = Number(customIsletCountMin.value) + step;
  } else if (key === "isletCountMax") {
    customIsletCountMax.value = Number(customIsletCountMax.value) + step;
  }
  normalizeCustomIslandSettings();
}

function applyDisplaySettingChange(payload) {
  if (!payload || !payload.key) return;
  const { key, value } = payload;
  if (key === "section_display" || key === "section_audio") return;
  if (key === "showHeightNumbers") showHeightNumbers.value = !!value;
  else if (key === "useHeightShading") useHeightShading.value = !!value;
  else if (key === "showSpecialTilesAlways") showSpecialTilesAlways.value = !!value;
  else if (key === "showWaterfallEffects") showWaterfallEffects.value = !!value;
  else if (key === "showStrongEnemyMarkers") showStrongEnemyMarkers.value = !!value;
  else if (key === "mountainMode") mountainMode.value = String(value || "random");
  else if (key === "heightNumberFontSize") {
    const raw = Number(value);
    heightNumberFontSize.value = Number.isFinite(raw) ? Math.max(10, Math.min(28, Math.round(raw))) : 23;
  } else if (key === "heightNumberOutlineWidth") {
    const raw = Number(value);
    heightNumberOutlineWidth.value = Number.isFinite(raw) ? Math.max(0, Math.min(6, Math.round(raw))) : 3;
  } else if (key === "masterVolumePercent") {
    const pct = normalizeVolumePercent(value, masterVolumePercent.value);
    masterVolumePercent.value = pct;
    audio.setMasterVolume(pct / 100);
  } else if (key === "bgmVolumePercent") {
    const pct = normalizeVolumePercent(value, bgmVolumePercent.value);
    bgmVolumePercent.value = pct;
    audio.setBgmVolume(pct / 100);
  } else if (key === "seVolumePercent") {
    const pct = normalizeVolumePercent(value, seVolumePercent.value);
    seVolumePercent.value = pct;
    audio.setSeVolume(pct / 100);
  }
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

function normalizeZoomPercent(value) {
  const raw = Number.isFinite(value) ? value : Number(value);
  const safe = Number.isFinite(raw) ? Math.round(raw) : 100;
  return Math.max(50, Math.min(220, safe));
}

function setZoomPercent(value) {
  zoomPercent.value = normalizeZoomPercent(value);
  renderMapWithPhaser();
}

function zoomIn() {
  setZoomPercent(zoomPercent.value + 10);
}

function zoomOut() {
  setZoomPercent(zoomPercent.value - 10);
}

function zoomReset() {
  setZoomPercent(100);
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

function blendHexColors(hexA, hexB, ratio = 0.5) {
  if (!hexA?.startsWith("#")) return hexB;
  if (!hexB?.startsWith("#")) return hexA;
  const t = Math.max(0, Math.min(1, Number(ratio)));
  const a = Number.parseInt(hexA.slice(1), 16);
  const b = Number.parseInt(hexB.slice(1), 16);
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + ((br - ar) * t));
  const g = Math.round(ag + ((bg - ag) * t));
  const bch = Math.round(ab + ((bb - ab) * t));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bch.toString(16).padStart(2, "0")}`;
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
  const {
    w,
    h,
    grid,
    shapeOnly,
    patternName,
    terrainRatioProfile,
    riverData,
    heightLevelMap,
    specialCounts,
    mountainProfile,
    reliefMap,
    strongMonsterStats,
    forestTargetCount,
    islandGenerationInfo,
    coastInfo,
    lavaMap,
    turnState
  } = data;
  const lines = [`サイズ: ${w}x${h} (${w * h}マス)`];
  lines.push(`ターン: ${Math.max(0, Math.floor(Number(turnState?.turnNumber || 0)))}`);
  if (turnState?.lastEventMode) {
    lines.push(`ターン実行モード: ${eventModeLabel(turnState.lastEventMode)}`);
  }
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
  if (coastInfo && Number.isFinite(coastInfo.count)) {
    lines.push(`海辺: ${coastInfo.count} (海接触 ${coastInfo.directCount || 0})`);
  }
  if (lavaMap) {
    let lavaCount = 0;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (lavaMap?.[y]?.[x]) lavaCount += 1;
      }
    }
    lines.push(`溶岩流: ${lavaCount}マス`);
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
  if (showStrongEnemyMarkers.value && strongMonsterStats?.有効) {
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

function drawLavaOverlay(data) {
  if (!lavaLayer) return;
  lavaLayer.clear();
  const flow = data?.lavaFlowData;
  if (!flow) return;
  const edgeKeys = Array.isArray(flow.edgeKeys) ? flow.edgeKeys : [];
  const nodeKeys = Array.isArray(flow.nodeKeys) ? flow.nodeKeys : [];
  const sourceKeys = Array.isArray(flow.sourceKeys) ? flow.sourceKeys : [];
  if (!edgeKeys.length && !nodeKeys.length && !sourceKeys.length) return;

  lavaLayer.lineStyle(8.6, 0x7c1e08, 0.78);
  for (const ek of edgeKeys) {
    const [a, b] = String(ek).split("|");
    if (!a || !b) continue;
    const pa = parseCoordKey(a);
    const pb = parseCoordKey(b);
    const ca = hexCenter(pa.x, pa.y);
    const cb = hexCenter(pb.x, pb.y);
    lavaLayer.strokeLineShape(new Phaser.Geom.Line(ca.cx, ca.cy, cb.cx, cb.cy));
  }

  lavaLayer.lineStyle(5.1, 0xe2672c, 0.96);
  for (const ek of edgeKeys) {
    const [a, b] = String(ek).split("|");
    if (!a || !b) continue;
    const pa = parseCoordKey(a);
    const pb = parseCoordKey(b);
    const ca = hexCenter(pa.x, pa.y);
    const cb = hexCenter(pb.x, pb.y);
    lavaLayer.strokeLineShape(new Phaser.Geom.Line(ca.cx, ca.cy, cb.cx, cb.cy));
  }

  for (const key of nodeKeys) {
    const p = parseCoordKey(key);
    const c = hexCenter(p.x, p.y);
    lavaLayer.fillStyle(0xffbc6f, 1);
    lavaLayer.fillCircle(c.cx, c.cy, 3.3);
    lavaLayer.fillStyle(0xd04f1f, 0.95);
    lavaLayer.fillCircle(c.cx, c.cy, 2.1);
  }
  for (const key of sourceKeys) {
    const p = parseCoordKey(key);
    const c = hexCenter(p.x, p.y);
    lavaLayer.fillStyle(0xffd598, 0.98);
    lavaLayer.fillCircle(c.cx, c.cy, 4.4);
    lavaLayer.fillStyle(0xe86d30, 0.98);
    lavaLayer.fillCircle(c.cx, c.cy, 2.8);
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
  const baseZoom = Math.min(viewW / worldW, viewH / worldH, 1) * 0.96;
  const finalZoom = Math.max(baseZoom * (normalizeZoomPercent(zoomPercent.value) / 100), 0.08);
  camera.setZoom(finalZoom);
  camera.centerOn(worldW / 2, worldH / 2);

  baseLayer.clear();
  if (lavaLayer) lavaLayer.clear();
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
  const seaVisual = tileVisual("海", data.shapeOnly);
  const seaSplitColor = useHeightShading.value ? shadeColorByHeight(seaVisual.color, -2) : seaVisual.color;

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
      const isLava = !data.shapeOnly && !!data.lavaMap?.[y]?.[x];
      const coastType = !data.shapeOnly ? (data.coastTypeMap?.[y]?.[x] || "") : "";
      const isCoastTile = coastType === "direct";
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
        if (isCoastTile) {
          const mixedLandColor = blendHexColors(forestColor, reliefColor, 0.5);
          drawSplitHex(baseLayer, points, mixedLandColor, seaSplitColor);
        } else {
          drawSplitHex(baseLayer, points, forestColor, reliefColor);
        }
      } else {
        const tileColor = useHeightShading.value ? shadeColorByHeight(visual.color, level) : visual.color;
        if (isCoastTile) {
          drawSplitHex(baseLayer, points, tileColor, seaSplitColor);
        } else {
          baseLayer.fillStyle(toColorInt(tileColor), 1);
          baseLayer.fillPoints(points, true);
        }
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

      if (showStrongEnemyMarkers.value && strongInfo) {
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
        coast: isCoastTile,
        coastType,
        lava: isLava,
        strongInfo,
        caveScale,
        caveSize: data.caveSizeMap?.[y]?.[x] || 0,
        polygon
      });
    }
  }

  drawRiverOverlay(data);
  drawLavaOverlay(data);

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

function formatTurnEventMessage(turn, events, mode = "normal") {
  if (!events?.length) {
    return `ターン ${turn} (${eventModeLabel(mode)}): イベントなし`;
  }
  const eruptionCount = events.filter(e => e?.type === "eruption").length;
  const lavaCount = events.filter(e => e?.type === "lava").length;
  return `ターン ${turn} (${eventModeLabel(mode)}): 噴火 ${eruptionCount}件 / 溶岩流 ${lavaCount}件`;
}

function formatTurnEventNotes(events) {
  if (!events?.length) return ["発生イベントはありません。"];
  const notes = [];
  const eruptions = events.filter(e => e?.type === "eruption");
  const lavaFlows = events.filter(e => e?.type === "lava");
  for (const e of eruptions.slice(0, 6)) {
    notes.push(`噴火: (${e.x}, ${e.y}) 山岳 -> 火山${e.forced ? " [テスト強制]" : ""}`);
  }
  for (const f of lavaFlows.slice(0, 6)) {
    const stopNote = f.stopped && f.stopReason ? ` / 停止:${lavaStopReasonLabel(f.stopReason)}` : "";
    notes.push(`溶岩流: (${f.from.x}, ${f.from.y}) から ${f.length}マス -> (${f.to.x}, ${f.to.y})${stopNote}`);
  }
  if (events.length > 12) {
    notes.push(`ほか ${events.length - 12} 件`);
  }
  return notes;
}

function runNextTurn(options = {}) {
  kickOffBgm();
  if (options?.playSe !== false) audio.playSe("confirm");
  if (!currentData.value || currentData.value.shapeOnly) {
    eventModalMessage.value = "地形マップ生成後にターンを進めてください。";
    eventModalNotes.value = ["「島形状のみ」ではターンイベントは動作しません。"];
    showEventModal.value = true;
    return;
  }
  const mode = String(options?.eventMode || "normal");
  const result = advanceTerrainTurn(currentData.value, {
    eventMode: mode
  });
  applyMapData(result.data, { resetClock: false, rebuildCharacters: false });
  const turn = Number(result.data?.turnState?.turnNumber || 0);
  eventModalMessage.value = formatTurnEventMessage(turn, result.events, mode);
  eventModalNotes.value = formatTurnEventNotes(result.events);
  showEventModal.value = true;
}

function runManagedEventTurn() {
  runNextTurn({ eventMode: eventActionType.value, playSe: false });
  showEventControlModal.value = false;
}

function openSettingsModal() {
  kickOffBgm();
  audio.playSe("open");
  showSettingsModal.value = true;
}

function closeSettingsModal() {
  audio.playSe("cancel");
  showSettingsModal.value = false;
}

function openIslandCustomModal() {
  kickOffBgm();
  audio.playSe("open");
  showIslandCustomModal.value = true;
}

function closeIslandCustomModal() {
  audio.playSe("cancel");
  showIslandCustomModal.value = false;
}

function openEventControlModal() {
  kickOffBgm();
  audio.playSe("open");
  showEventControlModal.value = true;
}

function closeEventControlModal() {
  audio.playSe("cancel");
  showEventControlModal.value = false;
}

function closeEventResultModal() {
  audio.playSe("cancel");
  showEventModal.value = false;
}

function selectEventActionType(mode) {
  const next = String(mode || "normal");
  if (eventActionType.value === next) return;
  kickOffBgm();
  audio.playSe("change");
  eventActionType.value = next;
}

function applyMapData(data, options = {}) {
  currentData.value = data;
  selectedTileKey = "";
  if (options.rebuildCharacters !== false) {
    createVillageAndInitialUnit(data);
  }
  if (options.resetClock !== false) {
    mapClockStartMs.value = Date.now();
    clockNowMs.value = mapClockStartMs.value;
  }
  updateMeta(data);
  renderMapWithPhaser();
}

function generateShapeMap(options = {}) {
  if (options.playSe !== false) {
    kickOffBgm();
    audio.playSe("confirm");
  }
  const { w, h } = parseMapSizeValue(mapSize.value);
  const islandCustomSettings = buildIslandCustomSettings();
  const data = createIslandShapeData({
    w,
    h,
    patternId: patternId.value,
    islandCustomSettings
  });
  showEventModal.value = false;
  applyMapData(data, { resetClock: true });
}

function generateTerrainMap(options = {}) {
  if (options.playSe !== false) {
    kickOffBgm();
    audio.playSe("confirm");
  }
  const { w, h } = parseMapSizeValue(mapSize.value);
  const islandCustomSettings = buildIslandCustomSettings();
  const data = createTerrainMapData({
    w,
    h,
    patternId: patternId.value,
    mountainMode: mountainMode.value,
    islandCustomSettings
  });
  showEventModal.value = false;
  applyMapData(data, { resetClock: true });
}

function updateMapClickInfo(picked) {
  if (!picked || !currentData.value) {
    mapClickInfo.value = "クリック座標: -";
    return;
  }
  const heightRaw = currentData.value.heightMap?.[picked.y]?.[picked.x];
  const heightLevel = currentData.value.heightLevelMap?.[picked.y]?.[picked.x];
  const river = picked.river ? "あり" : "なし";
  const waterfall = picked.waterfall ? "あり" : "なし";
  const lava = picked.lava ? "あり" : "なし";
  const special = picked.special || "-";
  const relief = picked.relief && picked.relief !== picked.terrain ? picked.relief : "-";
  const coast = picked.coastType === "direct" ? "海辺" : "内陸";
  const coastContact = picked.coastType === "direct" ? "あり" : "なし";
  const strong = showStrongEnemyMarkers.value
    ? (
      picked.strongInfo
        ? `候補(Lv${picked.strongInfo.level}, ${Array.isArray(picked.strongInfo.rules) ? picked.strongInfo.rules.join("+") : "-"})`
        : "なし"
    )
    : "非表示(設定OFF)";
  const caveScale = picked.special === "洞窟"
    ? (picked.caveScale === "large" ? "大" : picked.caveScale === "medium" ? "中" : "小")
    : "-";
  const caveSize = picked.special === "洞窟" ? picked.caveSize : "-";
  const tileUnits = unitsAt(picked.x, picked.y);
  const unitText = tileUnits.length
    ? tileUnits.map(unit => `${unit.name}(Lv${unit.level})`).join(", ")
    : "なし";
  mapClickInfo.value = `クリック座標: (${picked.x}, ${picked.y}) / 地形: ${picked.terrain} / 海辺判定: ${coast} / 海接触: ${coastContact} / 地勢: ${relief} / 強敵: ${strong} / 特殊: ${special} / 洞窟規模: ${caveScale}(${caveSize}) / 川: ${river} / 滝: ${waterfall} / 溶岩: ${lava} / 高度Lv: ${Number.isFinite(heightLevel) ? heightLevel : "-"} / 高度Raw: ${Number.isFinite(heightRaw) ? heightRaw : "-"} / ユニット: ${unitText}`;
}

function handlePointerDown(pointer) {
  const picked = hitAreas.find(area => Phaser.Geom.Polygon.Contains(area.polygon, pointer.worldX, pointer.worldY));
  if (!picked || !currentData.value) return;
  selectedTileKey = `${picked.x},${picked.y}`;
  const tileUnits = unitsAt(picked.x, picked.y);
  if (tileUnits.length) {
    selectedUnitId.value = tileUnits[0].id;
    updateUnitInfoText(`選択座標 (${picked.x}, ${picked.y})`);
    emitCharacterStateChange();
  }
  updateMapClickInfo(picked);
  renderMapWithPhaser();
}

onMounted(async () => {
  await nextTick();
  if (!gameRoot.value) return;

  firstGestureHandler = () => {
    kickOffBgm();
    if (firstGestureHandler) {
      window.removeEventListener("pointerdown", firstGestureHandler);
      window.removeEventListener("keydown", firstGestureHandler);
      firstGestureHandler = null;
    }
  };
  window.addEventListener("pointerdown", firstGestureHandler);
  window.addEventListener("keydown", firstGestureHandler);

  clockIntervalId = window.setInterval(() => {
    clockNowMs.value = Date.now();
  }, 250);

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
        lavaLayer = this.add.graphics();
        markerLayer = this.add.graphics();
        this.input.on("pointerdown", handlePointerDown);
        generateShapeMap({ playSe: false });
      }
    }
  });

  resizeHandler = () => renderMapWithPhaser();
  window.addEventListener("resize", resizeHandler);
});

onBeforeUnmount(() => {
  if (resizeHandler) window.removeEventListener("resize", resizeHandler);
  if (firstGestureHandler) {
    window.removeEventListener("pointerdown", firstGestureHandler);
    window.removeEventListener("keydown", firstGestureHandler);
    firstGestureHandler = null;
  }
  if (clockIntervalId) {
    window.clearInterval(clockIntervalId);
    clockIntervalId = null;
  }
  if (game) {
    game.destroy(true);
    game = null;
  }
  lavaLayer = null;
});

watch([showHeightNumbers, heightNumberFontSize, heightNumberOutlineWidth, useHeightShading, showSpecialTilesAlways, showWaterfallEffects, showStrongEnemyMarkers], () => {
  if (currentData.value) {
    mapStats.value = buildStatsText(currentData.value);
  }
  renderMapWithPhaser();
  if (selectedTileKey) {
    const picked = hitAreas.find(t => `${t.x},${t.y}` === selectedTileKey);
    if (picked) updateMapClickInfo(picked);
  }
});
</script>

<template>
  <section class="panel simulator map-top phaser-map-panel">
    <h2>地形ランダム生成 (Phaser)</h2>
    <div class="map-tools">
      <label>マップサイズ
        <select v-model="mapSize">
          <option value="30x40">下限 (30x40 = 1200マス)</option>
          <option value="36x36">標準 (36x36 = 1296マス / 推奨)</option>
          <option value="48x48">大 (48x48 = 2304マス)</option>
          <option value="60x60">特大 (60x60 = 3600マス)</option>
          <option value="72x72">超特大 (72x72 = 5184マス)</option>
          <option value="83x83">最大 (83x83 = 6889マス)</option>
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
      <button type="button" class="secondary" @click="openIslandCustomModal">島カスタム設定</button>
      <button type="button" class="secondary" @click="openSettingsModal">設定</button>
      <button v-if="isDevBuild" type="button" class="secondary" @click="showDevInfo = !showDevInfo">
        開発情報: {{ showDevInfo ? "ON" : "OFF" }}
      </button>
      <button id="generateShapeBtn" class="secondary" type="button" @click="generateShapeMap">島形状のみ</button>
      <button id="generateMapBtn" class="secondary" type="button" @click="generateTerrainMap">生成</button>
      <button id="advanceTurnBtn" class="secondary" type="button" @click="runNextTurn">ターン経過</button>
      <button id="eventManagerBtn" class="secondary" type="button" @click="showEventControlModal = true">イベント管理</button>
      <div class="zoom-controls">
        <button type="button" class="secondary" @click="zoomOut">-</button>
        <button type="button" class="secondary" @click="zoomReset">{{ zoomPercent }}%</button>
        <button type="button" class="secondary" @click="zoomIn">+</button>
      </div>
    </div>
    <div id="mapGrid" ref="gameRoot" class="phaser-map-canvas">
      <header class="field-overlay-header">
        <div class="field-resource-chip">
          <span>食料</span>
          <strong>{{ fieldResourceSummary.food }}</strong>
        </div>
        <div class="field-resource-chip">
          <span>資材</span>
          <strong>{{ fieldResourceSummary.material }}</strong>
        </div>
      </header>
      <div class="field-overlay-clock">
        <div class="turn-clock-face" :title="`経過 ${elapsedClockText}`">
          <span class="turn-clock-mark mark-top"></span>
          <span class="turn-clock-mark mark-right"></span>
          <span class="turn-clock-mark mark-bottom"></span>
          <span class="turn-clock-mark mark-left"></span>
          <div class="turn-clock-hand" :style="{ transform: `translateX(-50%) rotate(${turnClockHandDeg}deg)` }"></div>
          <div class="turn-clock-center"></div>
          <div class="turn-clock-turn">T{{ turnClockTurnNumber }}</div>
        </div>
        <div class="turn-clock-caption">次まで {{ turnClockRemainingSeconds }}s</div>
        <div class="turn-clock-caption map-turn-caption">マップT{{ mapTurnNumber }}</div>
      </div>
    </div>
    <section v-if="showDevInfo" class="dev-info-panel">
      <div class="small dev-info-label">開発モード情報</div>
      <div id="mapClickInfo" class="map-click-info">{{ mapClickInfo }}</div>
      <div class="character-dev-lines">
        <div>{{ villageInfoText }}</div>
        <div>{{ unitRulesInfoText }}</div>
        <div>{{ unitInfoText }}</div>
      </div>
      <div class="small phaser-help">クリックで座標・地形・高度を表示します。</div>
      <section class="generation-details">
        <div class="map-meta">
          <div id="mapSizeInfo">{{ mapSizeInfo }}</div>
          <div id="mapCenterInfo">{{ mapCenterInfo }}</div>
          <div id="mapTerrainProfileInfo">{{ mapTerrainProfileInfo }}</div>
        </div>
        <pre id="mapStats" class="phaser-map-stats">{{ mapStats }}</pre>
      </section>
    </section>

    <generic-modal
      :show="showSettingsModal"
      title="表示設定"
      modal-type="form"
      :fields="displaySettingsFields"
      :notes="displaySettingsNotes"
      @close="closeSettingsModal"
      @field-change="applyDisplaySettingChange"
    />

    <generic-modal
      :show="showEventModal"
      title="イベント"
      modal-type="message"
      :message="eventModalMessage"
      :notes="eventModalNotes"
      close-text="閉じる"
      @close="closeEventResultModal"
    />

    <div v-if="showEventControlModal" class="settings-backdrop" @click.self="closeEventControlModal">
      <div class="settings-modal event-control-modal">
        <h3>イベント管理</h3>
        <div class="event-mode-grid" role="radiogroup" aria-label="発生イベント選択">
          <button
            v-for="opt in eventModeOptions"
            :key="opt.value"
            type="button"
            class="event-mode-card"
            :class="{ active: eventActionType === opt.value }"
            :aria-pressed="eventActionType === opt.value"
            @click="selectEventActionType(opt.value)"
          >
            <span class="event-mode-label">{{ opt.label }}</span>
            <small class="event-mode-desc">{{ opt.desc }}</small>
          </button>
        </div>
        <div class="event-mode-hint">
          実行モード: {{ eventModeLabel(eventActionType) }} / 1ターン進行
        </div>
        <div class="setting-actions event-control-actions">
          <button type="button" class="secondary" @click="closeEventControlModal">閉じる</button>
          <button type="button" class="secondary" @click="runManagedEventTurn">実行</button>
        </div>
      </div>
    </div>

    <div v-if="showIslandCustomModal" class="settings-backdrop" @click.self="closeIslandCustomModal">
      <div class="settings-modal island-custom-modal">
        <h3>島カスタム設定</h3>
        <label class="setting-row">
          <input v-model="useIslandCustomSettings" type="checkbox" />
          カスタム島生成を使用する
        </label>
        <div class="setting-note">
          パターンを土台にしつつ、大島/孤島の配置と陸地率を上書きします。
        </div>
        <div class="island-custom-grid" :class="{ 'is-disabled': !useIslandCustomSettings }">
          <label class="setting-column island-field">
            <span>大島の数</span>
            <div class="number-stepper">
              <input
                v-model.number="customLargeIslandCount"
                type="number"
                min="1"
                max="8"
                step="1"
                :disabled="!useIslandCustomSettings"
                @change="normalizeCustomIslandSettings"
              />
              <div class="step-stack">
                <button
                  type="button"
                  class="step-btn"
                  :disabled="!useIslandCustomSettings"
                  @click="nudgeCustomIslandInt('largeIslandCount', 1)"
                >+</button>
                <button
                  type="button"
                  class="step-btn"
                  :disabled="!useIslandCustomSettings"
                  @click="nudgeCustomIslandInt('largeIslandCount', -1)"
                >-</button>
              </div>
            </div>
            <small class="field-help">1〜8で設定。</small>
          </label>
          <label class="setting-column island-field">
            <span>大島間の最小距離</span>
            <div class="number-stepper">
              <input
                v-model.number="customLargeIslandMinGap"
                type="number"
                min="2"
                max="12"
                step="1"
                :disabled="!useIslandCustomSettings"
                @change="normalizeCustomIslandSettings"
              />
              <div class="step-stack">
                <button
                  type="button"
                  class="step-btn"
                  :disabled="!useIslandCustomSettings"
                  @click="nudgeCustomIslandInt('largeIslandMinGap', 1)"
                >+</button>
                <button
                  type="button"
                  class="step-btn"
                  :disabled="!useIslandCustomSettings"
                  @click="nudgeCustomIslandInt('largeIslandMinGap', -1)"
                >-</button>
              </div>
            </div>
            <small class="field-help">島と島の間の海マス数目安。</small>
          </label>
          <label class="setting-column island-field">
            <span>孤島数 (最小〜最大)</span>
            <div class="inline-pair stepper-pair">
              <div class="number-stepper">
                <input
                  v-model.number="customIsletCountMin"
                  type="number"
                  min="0"
                  max="12"
                  step="1"
                  :disabled="!useIslandCustomSettings"
                  @change="normalizeCustomIslandSettings"
                />
                <div class="step-stack">
                  <button
                    type="button"
                    class="step-btn"
                    :disabled="!useIslandCustomSettings"
                    @click="nudgeCustomIslandInt('isletCountMin', 1)"
                  >+</button>
                  <button
                    type="button"
                    class="step-btn"
                    :disabled="!useIslandCustomSettings"
                    @click="nudgeCustomIslandInt('isletCountMin', -1)"
                  >-</button>
                </div>
              </div>
              <span>〜</span>
              <div class="number-stepper">
                <input
                  v-model.number="customIsletCountMax"
                  type="number"
                  min="0"
                  max="12"
                  step="1"
                  :disabled="!useIslandCustomSettings"
                  @change="normalizeCustomIslandSettings"
                />
                <div class="step-stack">
                  <button
                    type="button"
                    class="step-btn"
                    :disabled="!useIslandCustomSettings"
                    @click="nudgeCustomIslandInt('isletCountMax', 1)"
                  >+</button>
                  <button
                    type="button"
                    class="step-btn"
                    :disabled="!useIslandCustomSettings"
                    @click="nudgeCustomIslandInt('isletCountMax', -1)"
                  >-</button>
                </div>
              </div>
            </div>
            <small class="field-help">0〜12。生成時に範囲内で抽選。</small>
          </label>
          <label class="setting-column island-field">
            <span>目標陸地率: {{ customTargetLandPercent }}% ({{ customTargetLandTilesLabel }})</span>
            <input v-model.number="customTargetLandPercent" type="range" min="25" max="60" step="1" :disabled="!useIslandCustomSettings" />
            <small class="field-help">25〜60%。マップサイズに応じて目標マス数を表示。</small>
          </label>
        </div>
        <div class="setting-note">
          カスタムON時は、島形状パターンを土台にしつつ大島/孤島配置を上書きします。孤島サイズは孤島数に応じて自動調整し、目標陸地率(初期50%)に寄せて生成します。
        </div>
        <div class="setting-actions">
          <button type="button" class="secondary" @click="closeIslandCustomModal">閉じる</button>
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
  position: relative;
  width: 100%;
  height: min(68vh, 760px);
  border-radius: 10px;
  border: 1px solid rgba(214, 183, 124, 0.4);
  background: radial-gradient(circle at 30% 20%, #1d2835, #0f141f);
  overflow: hidden;
}

.phaser-map-canvas > canvas {
  position: relative;
  z-index: 1;
}

.field-overlay-header {
  position: absolute;
  top: 10px;
  left: 12px;
  right: 12px;
  z-index: 20;
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  border-radius: 10px;
  border: 1px solid rgba(247, 218, 158, 0.28);
  background: linear-gradient(170deg, rgba(17, 22, 33, 0.32), rgba(22, 15, 10, 0.28));
  backdrop-filter: blur(2px);
  box-shadow: inset 0 0 0 1px rgba(255, 233, 188, 0.08);
  pointer-events: none;
}

.field-resource-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid rgba(242, 214, 154, 0.32);
  background: linear-gradient(170deg, rgba(22, 29, 40, 0.34), rgba(23, 16, 11, 0.3));
  backdrop-filter: blur(2px);
  color: #f5e9c6;
  font-size: 0.82rem;
  line-height: 1;
}

.field-resource-chip strong {
  font-size: 0.9rem;
  color: #fff3cf;
}

.field-overlay-clock {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 20;
  pointer-events: none;
  width: 88px;
  display: grid;
  gap: 5px;
  justify-items: center;
  color: #fff4d2;
  font-family: "Noto Sans JP", "Consolas", monospace;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.5);
}

.turn-clock-face {
  position: relative;
  width: 66px;
  height: 66px;
  border-radius: 50%;
  border: 1px solid rgba(245, 217, 158, 0.46);
  background: radial-gradient(circle at 35% 28%, rgba(34, 46, 62, 0.82), rgba(16, 11, 8, 0.86));
  box-shadow: inset 0 0 0 1px rgba(255, 233, 188, 0.12);
}

.turn-clock-mark {
  position: absolute;
  background: rgba(255, 236, 202, 0.8);
  border-radius: 1px;
}

.turn-clock-mark.mark-top {
  top: 6px;
  left: 50%;
  width: 2px;
  height: 9px;
  transform: translateX(-50%);
}

.turn-clock-mark.mark-right {
  top: 50%;
  right: 6px;
  width: 9px;
  height: 2px;
  transform: translateY(-50%);
}

.turn-clock-mark.mark-bottom {
  bottom: 6px;
  left: 50%;
  width: 2px;
  height: 9px;
  transform: translateX(-50%);
}

.turn-clock-mark.mark-left {
  top: 50%;
  left: 6px;
  width: 9px;
  height: 2px;
  transform: translateY(-50%);
}

.turn-clock-hand {
  position: absolute;
  left: 50%;
  bottom: 50%;
  width: 2px;
  height: 24px;
  transform-origin: 50% 100%;
  background: linear-gradient(180deg, #fff2d0, #e3c072);
  border-radius: 2px;
}

.turn-clock-center {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: #ffe8b7;
  border: 1px solid rgba(72, 50, 21, 0.8);
}

.turn-clock-turn {
  position: absolute;
  left: 50%;
  top: 64%;
  transform: translate(-50%, -50%);
  font-size: 0.62rem;
  font-weight: 700;
  color: #f8e7c2;
}

.turn-clock-caption {
  border-radius: 7px;
  border: 1px solid rgba(245, 217, 158, 0.36);
  background: linear-gradient(170deg, rgba(19, 25, 35, 0.74), rgba(16, 11, 8, 0.68));
  padding: 3px 7px;
  font-size: 0.68rem;
  line-height: 1;
  font-weight: 700;
}

.turn-clock-caption.map-turn-caption {
  background: linear-gradient(170deg, rgba(39, 20, 10, 0.78), rgba(24, 16, 10, 0.72));
  border-color: rgba(247, 168, 114, 0.36);
}

.phaser-help {
  margin-top: 6px;
  color: #ddcda0;
}

.dev-info-panel {
  margin-top: 10px;
  border: 1px dashed rgba(238, 202, 138, 0.42);
  border-radius: 9px;
  padding: 8px;
  background: linear-gradient(170deg, rgba(23, 18, 13, 0.48), rgba(17, 13, 10, 0.42));
}

.dev-info-label {
  color: #efd5a0;
  letter-spacing: 0.03em;
  font-weight: 700;
}

.event-control-modal {
  width: min(460px, 100%);
}

.event-mode-grid {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.event-mode-card {
  display: grid;
  gap: 4px;
  text-align: left;
  border-radius: 10px;
  border: 1px solid rgba(221, 185, 126, 0.38);
  background: linear-gradient(170deg, rgba(26, 19, 13, 0.78), rgba(17, 12, 8, 0.72));
  color: #f3e8cb;
  padding: 9px 10px;
  cursor: pointer;
}

.event-mode-card.active {
  border-color: rgba(255, 214, 138, 0.86);
  box-shadow: inset 0 0 0 1px rgba(255, 233, 176, 0.34);
  background: linear-gradient(170deg, rgba(84, 51, 23, 0.84), rgba(39, 22, 11, 0.8));
}

.event-mode-label {
  font-size: 0.94rem;
  font-weight: 700;
}

.event-mode-desc {
  color: #ddcfa8;
  font-size: 0.76rem;
  line-height: 1.35;
}

.event-mode-hint {
  margin-top: 8px;
  border-radius: 8px;
  border: 1px solid rgba(221, 185, 126, 0.34);
  background: rgba(24, 17, 12, 0.62);
  color: #eadab2;
  padding: 7px 9px;
  font-size: 0.82rem;
}

.event-control-actions {
  gap: 8px;
}

.event-control-actions .secondary:last-child {
  border-color: rgba(255, 219, 156, 0.78);
  background: linear-gradient(180deg, rgba(150, 98, 47, 0.9), rgba(83, 50, 22, 0.92));
}

.zoom-controls {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.zoom-controls .secondary {
  min-width: 44px;
  padding: 4px 8px;
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

.character-dev-lines {
  margin-top: 6px;
  display: grid;
  gap: 6px;
  font-size: 0.85rem;
  color: #f4e7c6;
}

.character-dev-lines > div {
  border: 1px solid rgba(220, 188, 128, 0.33);
  border-radius: 8px;
  padding: 7px 9px;
  background: linear-gradient(170deg, rgba(28, 20, 14, 0.72), rgba(18, 13, 9, 0.62));
  line-height: 1.4;
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
  font-size: 1rem;
  line-height: 1.35;
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

.stepper-pair {
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
}

.stepper-pair > span {
  text-align: center;
  font-size: 1rem;
  font-weight: 700;
}

.number-stepper {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px;
  gap: 6px;
  align-items: stretch;
}

.number-stepper input[type="number"] {
  width: 100%;
  min-height: 40px;
  border-radius: 6px;
  border: 1px solid rgba(218, 184, 121, 0.42);
  background: rgba(15, 11, 7, 0.72);
  color: #f4ebd2;
  text-align: center;
  font-size: 0.96rem;
  appearance: textfield;
  -moz-appearance: textfield;
}

.number-stepper input[type="number"]::-webkit-outer-spin-button,
.number-stepper input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.step-stack {
  display: grid;
  grid-template-rows: 1fr 1fr;
  gap: 4px;
}

.step-btn {
  min-height: 18px;
  border-radius: 6px;
  border: 1px solid rgba(215, 180, 118, 0.58);
  background: linear-gradient(180deg, rgba(112, 80, 41, 0.88), rgba(62, 43, 22, 0.92));
  color: #f8e9c2;
  font-size: 0.96rem;
  font-weight: 700;
  line-height: 1;
  padding: 0;
  cursor: pointer;
}

.step-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.setting-actions {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
}

.island-custom-modal {
  width: min(560px, 100%);
}

.island-custom-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.island-custom-grid.is-disabled {
  opacity: 0.58;
}

.island-field {
  margin-top: 0;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid rgba(218, 184, 121, 0.3);
  background: rgba(20, 14, 9, 0.38);
}

.field-help {
  color: #dccfa8;
  font-size: 0.78rem;
  line-height: 1.35;
}

@media (max-width: 640px) {
  .event-mode-grid {
    grid-template-columns: 1fr;
  }

  .island-custom-grid {
    grid-template-columns: 1fr;
  }

  .field-overlay-header {
    flex-wrap: wrap;
    right: 56px;
  }
}
</style>
