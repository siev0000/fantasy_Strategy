<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Phaser from "phaser";
import GenericModal from "./GenericModal.vue";
import RaceSelectModal from "./RaceSelectModal.vue";
import ClassSelectModal from "./ClassSelectModal.vue";
import { getGameAudioController } from "../lib/audio-player.js";
import { DEFAULT_ICON_NAME, getIconSrcByName, resolveIconName } from "../lib/icon-library.js";
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
import factionDb from "../../../data/source/export/json/勢力.json";
import terrainYieldDb from "../../../data/source/export/json/地形.json";

const props = defineProps({
  selectedRace: { type: String, default: "" },
  selectedClass: { type: String, default: "" },
  selectedCharacterName: { type: String, default: "" },
  selectedVillageName: { type: String, default: "" },
  gameSetupReady: { type: Boolean, default: false },
  characterCommand: { type: Object, default: null }
});
const emit = defineEmits(["character-state-change", "open-modal", "test-controls-change"]);

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
const customWorldWrapEnabled = ref(true);
const showHeightNumbers = ref(false);
const heightNumberFontSize = ref(23);
const heightNumberOutlineWidth = ref(3);
const useHeightShading = ref(true);
const showSpecialTilesAlways = ref(true);
const showWaterfallEffects = ref(true);
const showStrongEnemyMarkers = ref(false);
const focusCameraOnTileClick = ref(false);
const showSettingsModal = ref(false);
const showEventControlModal = ref(false);
const eventActionType = ref("normal");
const showEventModal = ref(false);
const eventModalMessage = ref("");
const eventModalNotes = ref([]);
const showNationLogModal = ref(false);
const showVillageBuildModal = ref(false);
const selectedVillageBuildingKey = ref("");
const mapSizeInfo = ref("サイズ: -");
const mapCenterInfo = ref("中央座標: -");
const mapTerrainProfileInfo = ref("地形比率: -");
const mapClickInfo = ref("クリック座標: -");
const mapStats = ref("地形未生成");
const gameRoot = ref(null);
const stageShell = ref(null);
const currentData = ref(null);
const zoomPercent = ref(100);
const isDevBuild = import.meta.env.DEV;
const showDevInfo = ref(isDevBuild);
const showTestControls = ref(false);
const headerMinimized = ref(false);
const showTurnActionModal = ref(false);
const clockNowMs = ref(Date.now());
const mapClockStartMs = ref(Date.now());
const villageState = ref(null);
const unitList = ref([]);
const selectedUnitId = ref("");
const villagePlacementMode = ref(false);
const unitMoveMode = ref(false);
const showMoveUnitModal = ref(false);
const moveUnitCandidateId = ref("");
const showUnitCreateCountModal = ref(false);
const showUnitCreateRaceModal = ref(false);
const showUnitCreateClassModal = ref(false);
const unitCreateRace = ref("");
const unitCreateClass = ref("");
const unitCreateBatchCount = ref(1);
const selectedTileDetail = ref(null);
const villageInfoText = ref("初期村: -");
const unitInfoText = ref("選択ユニット: -");
const unitRulesInfoText = ref("部隊生成ルール: 一般兵 6-10 / ネームド 1");
const lastEconomySummary = ref("経済: -");
const nationLogsBySovereign = ref({});
const activeNationLogKey = ref("");
const audio = getGameAudioController();
const initialAudioVolumes = audio.getVolumeSettings();
const masterVolumePercent = ref(Math.round((initialAudioVolumes.masterVolume ?? 0.5) * 100));
const bgmVolumePercent = ref(Math.round((initialAudioVolumes.bgmVolume ?? 0.5) * 100));
const seVolumePercent = ref(Math.round((initialAudioVolumes.seVolume ?? 0.5) * 100));
const PLAYER_TERRITORY_RANGE = 1;
const TILE_BORDER_DEFAULT = { width: 1.25, color: 0x2f3848, alpha: 0.80 };
const TILE_BORDER_PLAYER = { width: 1.9, color: 0x5ad4ff, alpha: 0.96 };
const TILE_BORDER_ENEMY = { width: 1.9, color: 0xe25c5c, alpha: 0.96 };
const FOG_HIDDEN_FILL = 0x7b818a;
const FOG_HIDDEN_ALPHA = 0.94;
const FOG_HIDDEN_BORDER = { width: 1.15, color: 0x4b525e, alpha: 0.92 };
const BASE_VILLAGE_SCOUT_RANGE = 1;
const DRAG_THRESHOLD_PX = 12;
const WRAP_RING_TILE_MARGIN = 3;
const WRAP_DRAG_VIEW_RANGE_MULTIPLIER_X = 1.9;
const WRAP_DRAG_VIEW_RANGE_MULTIPLIER_Y = 1.15;
const CENTER_LOCK_ZOOM_PERCENT = 100;
const GAME_VIEW_WIDTH = 1280;
const GAME_VIEW_HEIGHT = 720;
const stageScale = ref(1);

let game = null;
let scene = null;
let baseLayer = null;
let riverLayer = null;
let lavaLayer = null;
let unitLayer = null;
let scoutLayer = null;
let markerLayer = null;
let hoverLayer = null;
let labelTexts = [];
let hitAreas = [];
let hitAreaMap = new Map();
let selectedTileKey = "";
let hoveredTileKey = "";
let resizeHandler = null;
let stageResizeObserver = null;
let clockIntervalId = null;
let firstGestureHandler = null;
let nativeWheelHandler = null;
let cameraInitialized = false;
let pendingClickFocusWorld = null;
let centerMapOnNextZoom = false;
let dragPointerId = null;
let dragStarted = false;
let dragStartScreenX = 0;
let dragStartScreenY = 0;
let dragStartScrollX = 0;
let dragStartScrollY = 0;
let pointerViewCache = new Map();
let forceMapCenterOnNextRender = true;
let territorySets = { player: new Set(), enemy: new Set() };
let exploredTileKeys = new Set();
let visibleTileKeys = new Set();
let lastCharacterCommandNonce = "";
let renderedHexBounds = null;

const terrainMap = computed(() => {
  const m = new Map();
  terrainDefinitions.forEach(def => m.set(def.key, def));
  return m;
});

const terrainYieldMap = computed(() => {
  const m = new Map();
  if (!Array.isArray(terrainYieldDb)) return m;
  for (const row of terrainYieldDb) {
    const key = nonEmptyText(row?.地形);
    if (!key) continue;
    m.set(key, row);
  }
  return m;
});

const factionRows = computed(() => {
  if (!Array.isArray(factionDb)) return [];
  return factionDb;
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
  const village = villageState.value;
  if (village) {
    const foodBag = normalizeResourceBag(village.foodStockByType, FOOD_RESOURCE_KEYS);
    const materialBag = normalizeResourceBag(village.materialStockByType, MATERIAL_RESOURCE_KEYS);
    const populationByRace = village.populationByRace || {};
    const populationDetail = Object.entries(populationByRace)
      .map(([race, count]) => `${nonEmptyText(race)}${Math.max(0, Math.floor(toSafeNumber(count, 0)))}`)
      .filter(Boolean)
      .slice(0, 4)
      .join(" / ");
    return {
      food: formatCompactNumber(sumResourceBag(foodBag, FOOD_RESOURCE_KEYS)),
      material: formatCompactNumber(sumResourceBag(materialBag, MATERIAL_RESOURCE_KEYS)),
      population: formatCompactNumber(village.population),
      foodDetail: formatResourceBag(foodBag, FOOD_RESOURCE_KEYS, FOOD_RESOURCE_LABELS),
      materialDetail: formatResourceBag(materialBag, MATERIAL_RESOURCE_KEYS, MATERIAL_RESOURCE_LABELS),
      populationDetail
    };
  }

  const data = currentData.value;
  if (!data?.grid || !Number.isFinite(data.w) || !Number.isFinite(data.h)) {
    return {
      food: "-",
      material: "-",
      population: "-",
      foodDetail: "",
      materialDetail: "",
      populationDetail: ""
    };
  }
  const summary = buildMapPotentialResourceSummary(data);
  return {
    food: formatCompactNumber(sumResourceBag(summary.food, FOOD_RESOURCE_KEYS)),
    material: formatCompactNumber(sumResourceBag(summary.material, MATERIAL_RESOURCE_KEYS)),
    population: "-",
    foodDetail: `想定 ${formatResourceBag(summary.food, FOOD_RESOURCE_KEYS, FOOD_RESOURCE_LABELS)}`,
    materialDetail: `想定 ${formatResourceBag(summary.material, MATERIAL_RESOURCE_KEYS, MATERIAL_RESOURCE_LABELS)}`,
    populationDetail: "村未確定"
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

const stageScaleStyle = computed(() => ({
  width: `${GAME_VIEW_WIDTH}px`,
  height: `${GAME_VIEW_HEIGHT}px`,
  transform: `scale(${stageScale.value})`,
  transformOrigin: "center center"
}));

const activeNationLogBucket = computed(() => {
  const key = nonEmptyText(activeNationLogKey.value);
  if (!key) return null;
  return nationLogsBySovereign.value?.[key] || null;
});

const nationLogSummaryText = computed(() => {
  const bucket = activeNationLogBucket.value;
  if (!bucket) return "ログ対象の統治者が未設定です。";
  const count = Array.isArray(bucket.entries) ? bucket.entries.length : 0;
  return `${bucket.label || "統治者"} のログ（${count}件）`;
});

const nationLogNotes = computed(() => {
  const bucket = activeNationLogBucket.value;
  const entries = Array.isArray(bucket?.entries) ? bucket.entries : [];
  if (!entries.length) return ["ログはまだありません。"];
  return entries.slice(0, 80).map(entry => {
    const turn = Math.max(0, Math.floor(toSafeNumber(entry?.turn, 0)));
    const stamp = nonEmptyText(entry?.at);
    const text = nonEmptyText(entry?.text) || "-";
    return `[T${turn}] ${stamp} ${text}`;
  });
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
    key: "focusCameraOnTileClick",
    kind: "checkbox",
    label: "クリックで視点を選択タイルへ移動する",
    value: focusCameraOnTileClick.value
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
  "クリック時の視点移動は初期OFFです。必要時のみONにしてください。",
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
const SKILL_LEVEL_FIELDS = [
  "指揮",
  "威圧",
  "看破",
  "早業",
  "技術",
  "隠密",
  "索敵",
  "農業",
  "林業",
  "漁業",
  "工業",
  "統治",
  "交渉",
  "魔法技術",
  "信仰"
];
const RESISTANCE_FIELDS = [
  "物理耐性",
  "魔法耐性",
  "炎耐性",
  "氷耐性",
  "雷耐性",
  "毒耐性",
  "光耐性",
  "闇耐性",
  "精神耐性",
  "怯み耐性",
  "出血耐性",
  "拘束耐性",
  "幻覚耐性",
  "Cr率耐性",
  "Cr威力耐性"
];
const EQUIPMENT_SLOT_KEYS = ["武器1", "武器2", "頭", "体", "足", "装飾1", "装飾2"];
const EQUIPMENT_SLOT_LABELS = {
  武器1: "武器1",
  武器2: "武器2",
  頭: "頭",
  体: "体",
  足: "足",
  装飾1: "装飾1",
  装飾2: "装飾2"
};
const WEAPON_EQUIPMENT_NAMES = ["短剣", "剣", "長剣", "槍", "斧", "戦槌", "棍棒", "弓", "銃", "杖"];
const SHIELD_EQUIPMENT_NAMES = ["盾", "大盾"];
const ACQUIRED_SKILL_FIELDS = ["Skill1", "Skill2", "Skill3", "Skill4", "Skill5", "Skill6", "Skill7", "Skill8", "Skill9", "Skill10"];
const NAMED_POOL = ["アレス", "リリア", "ガルド", "セレス", "ノクス", "フレア", "ヴェルク", "イリス"];
const VILLAGE_NAME_POOL = ["開拓村アスタ", "辺境村ノルド", "河畔村エイル", "森縁村リグナ", "丘陵村ブラム"];
const INITIAL_LEVEL_MIN = 5;
const INITIAL_LEVEL_MAX = 10;
const MOB_INITIAL_LEVEL = 5;
const MOB_INITIAL_CLASS_LEVEL = 5;
const BASE_RACE_LEVEL = 5;
const BONUS_RACE_LEVEL = 5;
const HUMAN_CLASS_BONUS_LEVEL = 5;
const STATUS_GROWTH_DIVISOR = 10;
const INITIAL_MOB_UNIT_COUNT_MIN = 2;
const INITIAL_MOB_UNIT_COUNT_MAX = 4;
const MOB_NAME_POOL = ["見習い兵", "巡回兵", "猟兵", "衛兵", "斥候"];
const CITY_SCALE_NAMED_LIMIT = {
  村: 2,
  町: 4,
  都市: 7
};
const MAX_SQUAD_MEMBER_COUNT = 5;
const EQUIPMENT_RARITY_MAP = {
  common: { label: "コモン", multiplier: 1.0 },
  uncommon: { label: "アンコモン", multiplier: 1.25 },
  rare: { label: "レア", multiplier: 1.5 },
  epic: { label: "エピック", multiplier: 1.75 },
  legendary: { label: "レジェンダリー", multiplier: 2.0 }
};
const EQUIPMENT_RARITY_KEYS = ["common", "uncommon", "rare", "epic", "legendary"];
const EQUIPMENT_RARITY_ALIAS_MAP = {
  コモン: "common",
  アンコモン: "uncommon",
  レア: "rare",
  エピック: "epic",
  レジェンダリー: "legendary"
};
const FOOD_RESOURCE_KEYS = ["穀物", "野菜", "肉", "魚"];
const MATERIAL_RESOURCE_KEYS = ["木材", "石材", "鉄"];
const FOOD_RESOURCE_LABELS = { 穀物: "穀", 野菜: "野", 肉: "肉", 魚: "魚" };
const MATERIAL_RESOURCE_LABELS = { 木材: "木", 石材: "石", 鉄: "鉄" };
const UNIT_CREATION_COST_TEMP = {
  food: { 穀物: 20, 野菜: 20, 肉: 20 },
  material: { 木材: 20, 石材: 20, 鉄: 20 }
};
const MOVE_STEP_DISTANCE_PER_ACTION = 2;
const VILLAGE_BUILDING_DEFINITIONS = [
  {
    key: "granary",
    name: "穀倉",
    description: "穀物保管で毎ターンの食料収入を底上げする。",
    cost: { 木材: 40, 石材: 24, 鉄: 0 },
    bonus: {
      food: { 穀物: 8, 野菜: 2, 肉: 0, 魚: 0 },
      material: { 木材: 0, 石材: 0, 鉄: 0 }
    }
  },
  {
    key: "lumberyard",
    name: "製材所",
    description: "伐採効率を高め、木材収入を増やす。",
    cost: { 木材: 26, 石材: 16, 鉄: 6 },
    bonus: {
      food: { 穀物: 0, 野菜: 0, 肉: 0, 魚: 0 },
      material: { 木材: 8, 石材: 0, 鉄: 0 }
    }
  },
  {
    key: "quarry",
    name: "採石場",
    description: "石材と鉄の採掘効率を上げる。",
    cost: { 木材: 18, 石材: 34, 鉄: 8 },
    bonus: {
      food: { 穀物: 0, 野菜: 0, 肉: 0, 魚: 0 },
      material: { 木材: 0, 石材: 7, 鉄: 2 }
    }
  }
];
const FOOD_SUBSTITUTE_MULTIPLIER = 1.2;
const RACE_TO_FACTION_NAME_MAP = {
  只人: "人間",
  エルフ: "森人",
  ドワーフ: "土人",
  ビーストマン: "獣人",
  竜人: "竜人",
  オーガ: "大鬼",
  ジャイアント: "巨人",
  ゴブリン: "鬼妖",
  悪魔: "悪魔",
  天使: "天使",
  ヴァンパイア: "吸血鬼"
};
const RACE_ICON_GLYPH_MAP = {
  只人: "只",
  エルフ: "森",
  ドワーフ: "土",
  ビーストマン: "獣",
  竜人: "竜",
  オーガ: "鬼",
  ジャイアント: "巨",
  ゴブリン: "妖",
  悪魔: "魔",
  天使: "天",
  ヴァンパイア: "吸"
};
const RACE_ICON_COLOR_MAP = {
  只人: 0x3e5d84,
  エルフ: 0x4a7d3c,
  ドワーフ: 0x7a5f3a,
  ビーストマン: 0x8a6d2e,
  竜人: 0x39687f,
  オーガ: 0x7f3f2e,
  ジャイアント: 0x6b5c4b,
  ゴブリン: 0x5f7c3a,
  悪魔: 0x6a2f4f,
  天使: 0x5c6fa2,
  ヴァンパイア: 0x662f4a
};

const classRows = computed(() => {
  if (!Array.isArray(classDb)) return [];
  return classDb.filter(row => nonEmptyText(row?.名前));
});

const jobClassRows = computed(() => {
  return classRows.value.filter(row => nonEmptyText(row?.種類) === "職業");
});

const canOpenUnitCreate = computed(() => {
  const village = villageState.value;
  return !!(village?.placed && Number.isFinite(village?.x) && Number.isFinite(village?.y));
});

const mobUnitCount = computed(() => {
  return unitList.value.filter(unit => isMobUnit(unit)).length;
});

const mobUnitCap = computed(() => {
  const population = Math.floor(toSafeNumber(villageState.value?.population, 0));
  return Math.max(0, Math.floor(population / 10));
});

const mobCreateRemaining = computed(() => {
  return Math.max(0, mobUnitCap.value - mobUnitCount.value);
});

const canCreateMob = computed(() => {
  return canOpenUnitCreate.value && mobCreateRemaining.value > 0;
});

const unitCreateAllowedRaces = computed(() => {
  const set = new Set();
  const villageRaceMap = villageState.value?.populationByRace;
  if (villageRaceMap && typeof villageRaceMap === "object") {
    for (const [race, countRaw] of Object.entries(villageRaceMap)) {
      const raceName = nonEmptyText(race);
      const count = Math.max(0, Math.floor(toSafeNumber(countRaw, 0)));
      if (!raceName || count <= 0) continue;
      set.add(raceName);
    }
  }
  for (const unit of unitList.value) {
    const raceName = nonEmptyText(unit?.race);
    if (!raceName) continue;
    set.add(raceName);
  }
  return Array.from(set);
});

const canOpenVillageBuild = computed(() => {
  const village = villageState.value;
  return !!(village?.placed && Number.isFinite(village?.x) && Number.isFinite(village?.y));
});

const builtVillageBuildingSet = computed(() => {
  return new Set(normalizeVillageBuildings(villageState.value?.buildings));
});

const availableVillageBuildingDefs = computed(() => {
  const built = builtVillageBuildingSet.value;
  return VILLAGE_BUILDING_DEFINITIONS.filter(def => !built.has(def.key));
});

const selectedVillageBuildingDef = computed(() => {
  const selectedKey = nonEmptyText(selectedVillageBuildingKey.value);
  const available = availableVillageBuildingDefs.value;
  if (!available.length) return null;
  return available.find(def => def.key === selectedKey) || available[0];
});

const selectedVillageBuildingCostText = computed(() => {
  const def = selectedVillageBuildingDef.value;
  if (!def) return "なし";
  return formatPositiveResourceBag(def.cost, MATERIAL_RESOURCE_KEYS, MATERIAL_RESOURCE_LABELS);
});

const selectedVillageBuildingBonusText = computed(() => {
  const def = selectedVillageBuildingDef.value;
  if (!def) return "なし";
  return formatVillageBuildingBonus(def.bonus);
});

const equipmentRows = computed(() => {
  if (!Array.isArray(equipmentDb)) return [];
  return equipmentDb.filter(row => nonEmptyText(row?.装備名));
});

const selectedUnit = computed(() => {
  return unitList.value.find(unit => unit.id === selectedUnitId.value) || null;
});

function isSovereignUnit(unit) {
  return !!unit?.isSovereign;
}

function isNamedUnit(unit) {
  return !!unit?.isNamed || nonEmptyText(unit?.unitType) === "ネームド" || isSovereignUnit(unit);
}

function isMobUnit(unit) {
  if (!unit) return false;
  if (isSovereignUnit(unit)) return false;
  if (isNamedUnit(unit)) return false;
  return true;
}

function normalizeSquadEntries(entries, leaderId = "") {
  if (!Array.isArray(entries)) return [];
  const keyPrefix = nonEmptyText(leaderId) || "unit";
  const out = [];
  const seen = new Set();
  for (const raw of entries) {
    const memberId = nonEmptyText(raw?.memberId || raw?.id);
    if (!memberId || seen.has(memberId)) continue;
    seen.add(memberId);
    out.push({
      id: nonEmptyText(raw?.id) || `${keyPrefix}-sq-${out.length + 1}`,
      memberId,
      name: nonEmptyText(raw?.name)
    });
  }
  return out;
}

function unitHasSquad(unit) {
  if (!unit) return false;
  const squads = normalizeSquadEntries(unit?.squads, unit?.id);
  return squads.length > 0 || Math.max(0, Math.floor(toSafeNumber(unit?.squadCount, 0))) > 0;
}

function squadMemberIds(unit) {
  return normalizeSquadEntries(unit?.squads, unit?.id).map(row => row.memberId);
}

function resolveDefaultSquadName(units = unitList.value) {
  const source = Array.isArray(units) ? units : [];
  let maxNo = 0;
  for (const unit of source) {
    const name = nonEmptyText(unit?.squadName);
    if (!name.startsWith("部隊")) continue;
    const tail = name.slice(2);
    const no = Number(tail);
    if (Number.isFinite(no) && no > maxNo) {
      maxNo = no;
    }
  }
  return `部隊${maxNo + 1}`;
}

function resolveUnitScoutValue(unit) {
  const skillScout = Number(unit?.skillLevels?.索敵);
  if (Number.isFinite(skillScout)) return Math.max(0, roundTo1(skillScout));
  return 0;
}

function resolveUnitStealthValue(unit) {
  const skillStealth = Number(unit?.skillLevels?.隠密);
  if (Number.isFinite(skillStealth)) return Math.max(0, roundTo1(skillStealth));
  return 0;
}

function buildSquadSummaryList(units = unitList.value) {
  const source = Array.isArray(units) ? units : [];
  const byId = new Map(source.map(unit => [unit?.id, unit]));
  const out = [];
  for (const leader of source) {
    if (!leader || !unitHasSquad(leader)) continue;
    const leaderId = nonEmptyText(leader.id);
    if (!leaderId) continue;
    const squads = normalizeSquadEntries(leader.squads, leaderId);
    if (!squads.length) continue;
    const memberIds = squads.map(row => row.memberId);
    const memberUnits = memberIds
      .map(id => byId.get(id))
      .filter(Boolean);
    const fullUnits = [leader, ...memberUnits];
    const scoutValues = fullUnits.map(resolveUnitScoutValue).sort((a, b) => b - a);
    const stealthValues = fullUnits.map(resolveUnitStealthValue);
    const maxScout = scoutValues.length ? Math.max(...scoutValues) : 0;
    const supportScout = scoutValues.slice(1).reduce((sum, value) => sum + (value / 5), 0);
    const totalStealth = stealthValues.reduce((sum, value) => sum + value, 0);
    const memberCount = fullUnits.length;
    const stealthDivisor = memberCount > 1 ? Math.max(1, memberCount * 0.75) : 1;
    out.push({
      id: nonEmptyText(leader.squadId) || `squad-${leaderId}`,
      name: nonEmptyText(leader.squadName) || resolveDefaultSquadName(source),
      leaderId,
      leaderName: nonEmptyText(leader.name) || "リーダー",
      leaderPos: {
        x: Number.isFinite(leader?.x) ? leader.x : null,
        y: Number.isFinite(leader?.y) ? leader.y : null
      },
      memberIds,
      memberNames: memberUnits.map(unit => nonEmptyText(unit?.name)).filter(Boolean),
      totalMemberCount: memberCount,
      scoutValue: roundTo1(maxScout + supportScout),
      stealthValue: roundTo1(totalStealth / stealthDivisor)
    });
  }
  return out;
}

function stripRemovedUnitFromSquads(units, removedUnitId) {
  const removedId = nonEmptyText(removedUnitId);
  if (!removedId || !Array.isArray(units)) return Array.isArray(units) ? units : [];
  return units.map(unit => {
    if (!unit) return unit;
    const prevSquads = normalizeSquadEntries(unit?.squads, unit?.id);
    const nextSquads = prevSquads.filter(row => row.memberId !== removedId);
    const prevLeaderId = nonEmptyText(unit?.squadLeaderId);
    const nextLeaderId = prevLeaderId === removedId ? "" : prevLeaderId;
    if (
      nextSquads.length === prevSquads.length
      && nextLeaderId === prevLeaderId
      && Math.max(0, Math.floor(toSafeNumber(unit?.squadCount, 0))) === nextSquads.length
    ) {
      return unit;
    }
    return {
      ...unit,
      squads: nextSquads,
      squadCount: nextSquads.length,
      squadLeaderId: nextLeaderId
    };
  });
}

function toUnitRoleLabel(unit) {
  if (!unit) return "-";
  if (isSovereignUnit(unit)) return "統治者";
  if (isNamedUnit(unit)) return "ネームド";
  return "モブ";
}

function resolveVillageScaleLabel(village) {
  const pop = toSafeNumber(village?.population, 0);
  if (pop >= 260) return "都市";
  if (pop >= 160) return "町";
  return "村";
}

function resolveNamedLimit(village) {
  const scale = resolveVillageScaleLabel(village);
  return toSafeNumber(CITY_SCALE_NAMED_LIMIT[scale], CITY_SCALE_NAMED_LIMIT.村);
}

function countPromotedNamedUnits() {
  return unitList.value.reduce((sum, unit) => {
    if (isSovereignUnit(unit)) return sum;
    return isNamedUnit(unit) ? sum + 1 : sum;
  }, 0);
}

function nonEmptyText(value) {
  const text = String(value ?? "").trim();
  return text.length ? text : "";
}

function resolveUnitIconName(name, fallback = DEFAULT_ICON_NAME) {
  return resolveIconName(nonEmptyText(name), fallback);
}

function resolveUnitIconSrc(name, fallback = DEFAULT_ICON_NAME) {
  return getIconSrcByName(resolveUnitIconName(name, fallback), fallback);
}

function resolveDefaultUnitIconName(raceName) {
  const raceKey = nonEmptyText(raceName);
  return resolveUnitIconName(raceKey, DEFAULT_ICON_NAME);
}

function toSafeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function tileHeightLevel(data, x, y) {
  const raw = data?.heightLevelMap?.[y]?.[x];
  return Number.isFinite(raw) ? Math.floor(raw) : null;
}

function movementStepCost(data, fromX, fromY, toX, toY) {
  const fromLevel = tileHeightLevel(data, fromX, fromY);
  const toLevel = tileHeightLevel(data, toX, toY);
  const extraCost = Number.isFinite(fromLevel) && Number.isFinite(toLevel) && fromLevel !== toLevel
    ? 1
    : 0;
  return 1 + extraCost;
}

function roundTo1(value) {
  return Math.round(toSafeNumber(value, 0) * 10) / 10;
}

function normalizeEquipmentRarityKey(value, fallback = "common") {
  const raw = nonEmptyText(value);
  if (!raw) return fallback;
  const lower = raw.toLowerCase();
  if (EQUIPMENT_RARITY_MAP[lower]) return lower;
  return EQUIPMENT_RARITY_ALIAS_MAP[raw] || fallback;
}

function resolveEquipmentRarity(value, fallback = "common") {
  const key = normalizeEquipmentRarityKey(value, fallback);
  const def = EQUIPMENT_RARITY_MAP[key] || EQUIPMENT_RARITY_MAP.common;
  return { key, ...def };
}

function scaleCriticalPower(baseValue, multiplier) {
  const base = Math.max(0, Math.round(toSafeNumber(baseValue, 0)));
  const top = Math.floor(base / 100) * 100;
  const tail = base % 100;
  return top + Math.round(tail * Math.max(0, toSafeNumber(multiplier, 1)));
}

function formatEquipmentRarityLabel(value) {
  return resolveEquipmentRarity(value).label;
}

function formatCompactNumber(value) {
  return String(roundTo1(value).toLocaleString("ja-JP", { minimumFractionDigits: 0, maximumFractionDigits: 1 }));
}

function buildEmptyResourceBag(keys) {
  const out = {};
  for (const key of keys) out[key] = 0;
  return out;
}

function normalizeResourceBag(raw, keys) {
  const out = buildEmptyResourceBag(keys);
  if (!raw || typeof raw !== "object") return out;
  for (const key of keys) {
    out[key] = Math.max(0, roundTo1(raw[key]));
  }
  return out;
}

function sumResourceBag(bag, keys) {
  return roundTo1(keys.reduce((sum, key) => sum + toSafeNumber(bag?.[key], 0), 0));
}

function addToResourceBag(target, delta, keys) {
  for (const key of keys) {
    target[key] = roundTo1(toSafeNumber(target[key], 0) + toSafeNumber(delta?.[key], 0));
  }
}

function multiplyResourceBag(source, factor, keys) {
  const out = buildEmptyResourceBag(keys);
  const safeFactor = toSafeNumber(factor, 0);
  for (const key of keys) {
    out[key] = roundTo1(toSafeNumber(source?.[key], 0) * safeFactor);
  }
  return out;
}

function formatResourceBag(bag, keys, labels = {}) {
  return keys.map(key => `${labels[key] || key}${formatCompactNumber(toSafeNumber(bag?.[key], 0))}`).join(" ");
}

function formatPositiveResourceBag(bag, keys, labels = {}) {
  const parts = keys
    .map(key => ({ key, value: Math.max(0, roundTo1(toSafeNumber(bag?.[key], 0))) }))
    .filter(row => row.value > 0)
    .map(row => `${labels[row.key] || row.key}${formatCompactNumber(row.value)}`);
  return parts.length ? parts.join(" ") : "なし";
}

function normalizeVillageBuildings(input) {
  const allowed = new Set(VILLAGE_BUILDING_DEFINITIONS.map(def => def.key));
  const out = [];
  const pushed = new Set();
  const source = Array.isArray(input) ? input : [];
  for (const raw of source) {
    const key = nonEmptyText(raw);
    if (!key || !allowed.has(key) || pushed.has(key)) continue;
    pushed.add(key);
    out.push(key);
  }
  return out;
}

function findVillageBuildingDefinition(key) {
  const normalized = nonEmptyText(key);
  if (!normalized) return null;
  return VILLAGE_BUILDING_DEFINITIONS.find(def => def.key === normalized) || null;
}

function formatVillageBuildingList(buildings) {
  const keys = normalizeVillageBuildings(buildings);
  if (!keys.length) return "なし";
  const names = keys
    .map(key => findVillageBuildingDefinition(key)?.name || "")
    .filter(Boolean);
  return names.length ? names.join(", ") : "なし";
}

function collectVillageBuildingIncome(village) {
  const result = {
    food: buildEmptyResourceBag(FOOD_RESOURCE_KEYS),
    material: buildEmptyResourceBag(MATERIAL_RESOURCE_KEYS),
    count: 0
  };
  const keys = normalizeVillageBuildings(village?.buildings);
  for (const key of keys) {
    const def = findVillageBuildingDefinition(key);
    if (!def) continue;
    result.count += 1;
    addToResourceBag(result.food, def.bonus?.food, FOOD_RESOURCE_KEYS);
    addToResourceBag(result.material, def.bonus?.material, MATERIAL_RESOURCE_KEYS);
  }
  return result;
}

function formatVillageBuildingBonus(bonus) {
  const foodRaw = formatPositiveResourceBag(bonus?.food, FOOD_RESOURCE_KEYS, FOOD_RESOURCE_LABELS);
  const materialRaw = formatPositiveResourceBag(bonus?.material, MATERIAL_RESOURCE_KEYS, MATERIAL_RESOURCE_LABELS);
  if (foodRaw === "なし" && materialRaw === "なし") return "なし";
  const foodText = foodRaw === "なし" ? "0" : foodRaw;
  const materialText = materialRaw === "なし" ? "0" : materialRaw;
  return `食料 +${foodText} / 資材 +${materialText}`;
}

function buildUnitCreationCost(count = 1) {
  const safeCount = Math.max(1, Math.min(20, Math.floor(toSafeNumber(count, 1))));
  return {
    count: safeCount,
    food: multiplyResourceBag(UNIT_CREATION_COST_TEMP.food, safeCount, FOOD_RESOURCE_KEYS),
    material: multiplyResourceBag(UNIT_CREATION_COST_TEMP.material, safeCount, MATERIAL_RESOURCE_KEYS)
  };
}

function canAffordUnitCreation(village, cost) {
  if (!village || !cost) return false;
  const foodBag = normalizeResourceBag(village.foodStockByType, FOOD_RESOURCE_KEYS);
  const materialBag = normalizeResourceBag(village.materialStockByType, MATERIAL_RESOURCE_KEYS);
  for (const key of FOOD_RESOURCE_KEYS) {
    if (foodBag[key] < toSafeNumber(cost.food?.[key], 0)) return false;
  }
  for (const key of MATERIAL_RESOURCE_KEYS) {
    if (materialBag[key] < toSafeNumber(cost.material?.[key], 0)) return false;
  }
  return true;
}

function applyUnitCreationCost(village, cost) {
  const nextVillage = ensureVillageStateShape(village, props.selectedRace);
  if (!nextVillage) return null;
  const nextFood = normalizeResourceBag(nextVillage.foodStockByType, FOOD_RESOURCE_KEYS);
  const nextMaterial = normalizeResourceBag(nextVillage.materialStockByType, MATERIAL_RESOURCE_KEYS);
  for (const key of FOOD_RESOURCE_KEYS) {
    nextFood[key] = roundTo1(Math.max(0, nextFood[key] - toSafeNumber(cost?.food?.[key], 0)));
  }
  for (const key of MATERIAL_RESOURCE_KEYS) {
    nextMaterial[key] = roundTo1(Math.max(0, nextMaterial[key] - toSafeNumber(cost?.material?.[key], 0)));
  }
  return ensureVillageStateShape({
    ...nextVillage,
    foodStockByType: nextFood,
    materialStockByType: nextMaterial
  }, props.selectedRace);
}

function canAffordVillageBuilding(village, definition) {
  if (!village || !definition) return false;
  const materialBag = normalizeResourceBag(village.materialStockByType, MATERIAL_RESOURCE_KEYS);
  const costBag = normalizeResourceBag(definition.cost, MATERIAL_RESOURCE_KEYS);
  for (const key of MATERIAL_RESOURCE_KEYS) {
    if (materialBag[key] < costBag[key]) return false;
  }
  return true;
}

function applyVillageBuildingCost(village, definition) {
  const nextVillage = ensureVillageStateShape(village, props.selectedRace);
  if (!nextVillage || !definition) return null;
  const nextMaterial = normalizeResourceBag(nextVillage.materialStockByType, MATERIAL_RESOURCE_KEYS);
  const costBag = normalizeResourceBag(definition.cost, MATERIAL_RESOURCE_KEYS);
  for (const key of MATERIAL_RESOURCE_KEYS) {
    nextMaterial[key] = roundTo1(Math.max(0, nextMaterial[key] - costBag[key]));
  }
  const nextBuildings = normalizeVillageBuildings([...(nextVillage.buildings || []), definition.key]);
  return ensureVillageStateShape({
    ...nextVillage,
    materialStockByType: nextMaterial,
    buildings: nextBuildings
  }, props.selectedRace);
}

function buildAutoUnitName(raceName, className, units = unitList.value) {
  const race = nonEmptyText(raceName) || "種族";
  const cls = nonEmptyText(className) || "クラス";
  const prefix = `${race}${cls}`;
  let maxNo = 0;
  const source = Array.isArray(units) ? units : [];
  for (const unit of source) {
    const name = nonEmptyText(unit?.name);
    if (!name.startsWith(prefix)) continue;
    const tail = name.slice(prefix.length);
    const no = Number(tail);
    if (Number.isFinite(no) && no > maxNo) {
      maxNo = no;
    }
  }
  return `${prefix}${maxNo + 1}`;
}

function splitTotalIntoBag(total, keys) {
  const safeTotal = Math.max(0, Math.floor(toSafeNumber(total, 0)));
  const out = buildEmptyResourceBag(keys);
  if (!keys.length || safeTotal <= 0) return out;
  const base = Math.floor(safeTotal / keys.length);
  let rem = safeTotal - (base * keys.length);
  for (const key of keys) {
    out[key] = base;
    if (rem > 0) {
      out[key] += 1;
      rem -= 1;
    }
  }
  return out;
}

function formatPopulationByRace(populationByRace) {
  const entries = Object.entries(populationByRace || {})
    .map(([race, count]) => ({ race: nonEmptyText(race), count: Math.max(0, Math.floor(toSafeNumber(count, 0))) }))
    .filter(row => row.race && row.count > 0)
    .sort((a, b) => b.count - a.count);
  if (!entries.length) return "未設定";
  return entries.map(row => `${row.race}:${formatCompactNumber(row.count)}人`).join(" / ");
}

function buildMapPotentialResourceSummary(data) {
  const summary = {
    food: buildEmptyResourceBag(FOOD_RESOURCE_KEYS),
    material: buildEmptyResourceBag(MATERIAL_RESOURCE_KEYS)
  };
  if (!data?.grid || !Number.isFinite(data.w) || !Number.isFinite(data.h)) return summary;
  const yields = terrainYieldMap.value;
  for (let y = 0; y < data.h; y += 1) {
    for (let x = 0; x < data.w; x += 1) {
      const terrain = data.grid[y][x];
      const row = yields.get(terrain) || null;
      for (const key of FOOD_RESOURCE_KEYS) {
        summary.food[key] = roundTo1(summary.food[key] + toSafeNumber(row?.[key], 0));
      }
      for (const key of MATERIAL_RESOURCE_KEYS) {
        summary.material[key] = roundTo1(summary.material[key] + toSafeNumber(row?.[key], 0));
      }
    }
  }
  return summary;
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

function normalizeWrappedCoord(value, size) {
  if (!Number.isFinite(value) || !Number.isFinite(size) || size <= 0) return 0;
  const mod = value % size;
  return mod < 0 ? mod + size : mod;
}

function normalizeWrappedDelta(delta, size) {
  if (!Number.isFinite(delta) || !Number.isFinite(size) || size <= 0) {
    return Number.isFinite(delta) ? delta : 0;
  }
  let out = delta % size;
  const half = size / 2;
  if (out > half) out -= size;
  if (out < -half) out += size;
  return out;
}

function wrapValueNear(value, reference, size) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (!Number.isFinite(reference) || !Number.isFinite(size) || size <= 0) return numeric;
  return reference + normalizeWrappedDelta(numeric - reference, size);
}

function resolveWorldWrapEnabled(dataLike = currentData.value) {
  return !!dataLike?.worldWrapEnabled;
}

function getHexNeighborCoordsBySize(w, h, x, y, worldWrapEnabled = false) {
  const isOddRow = y % 2 === 1;
  const deltas = isOddRow
    ? [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]]
    : [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];
  const result = [];
  const seen = new Set();
  for (const [dx, dy] of deltas) {
    let nx = x + dx;
    let ny = y + dy;
    if (worldWrapEnabled) {
      nx = normalizeWrappedCoord(nx, w);
      ny = normalizeWrappedCoord(ny, h);
    } else if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
      continue;
    }
    const key = coordKey(nx, ny);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ x: nx, y: ny });
  }
  return result;
}

function isPassableTerrain(terrain) {
  return terrain !== "海" && terrain !== "湖";
}

function buildPlayerTerritorySet(data) {
  const owned = new Set();
  const v = villageState.value;
  if (!data?.grid || !v?.placed || !Number.isFinite(v.x) || !Number.isFinite(v.y)) return owned;
  if (v.x < 0 || v.y < 0 || v.x >= data.w || v.y >= data.h) return owned;

  const startKey = coordKey(v.x, v.y);
  const queue = [{ x: v.x, y: v.y, d: 0 }];
  owned.add(startKey);
  while (queue.length) {
    const cur = queue.shift();
    if (!cur || cur.d >= PLAYER_TERRITORY_RANGE) continue;
    const neighbors = getHexNeighborCoordsBySize(data.w, data.h, cur.x, cur.y, resolveWorldWrapEnabled(data));
    for (const n of neighbors) {
      const key = coordKey(n.x, n.y);
      if (owned.has(key)) continue;
      if (!isPassableTerrain(data.grid[n.y][n.x])) continue;
      owned.add(key);
      queue.push({ x: n.x, y: n.y, d: cur.d + 1 });
    }
  }
  return owned;
}

function buildEnemyTerritorySet(data) {
  const hostile = new Set();
  if (!data) return hostile;

  if (Array.isArray(data.enemyTerritoryKeys)) {
    for (const key of data.enemyTerritoryKeys) {
      const text = String(key || "");
      if (!text.includes(",")) continue;
      hostile.add(text);
    }
  }

  if (Array.isArray(data.territoryMap)) {
    for (let y = 0; y < data.territoryMap.length; y += 1) {
      const row = data.territoryMap[y];
      if (!Array.isArray(row)) continue;
      for (let x = 0; x < row.length; x += 1) {
        const owner = String(row[x] || "");
        if (owner === "enemy" || owner === "hostile" || owner === "npc") {
          hostile.add(coordKey(x, y));
        }
      }
    }
  }

  return hostile;
}

function rebuildTerritorySets(data) {
  territorySets = {
    player: buildPlayerTerritorySet(data),
    enemy: buildEnemyTerritorySet(data)
  };
}

function tileOwnerAt(x, y) {
  const key = coordKey(x, y);
  if (territorySets.enemy.has(key)) return "enemy";
  if (territorySets.player.has(key)) return "player";
  return "";
}

function borderStyleForOwner(owner) {
  if (owner === "player") return TILE_BORDER_PLAYER;
  if (owner === "enemy") return TILE_BORDER_ENEMY;
  return TILE_BORDER_DEFAULT;
}

function resolveFactionRowByRace(raceKey = "") {
  const race = nonEmptyText(raceKey);
  const factionName = RACE_TO_FACTION_NAME_MAP[race] || race;
  const className = resolveRaceBaseClassName(race);
  const rows = factionRows.value;
  if (!rows.length) return null;
  const byName = rows.find(row => nonEmptyText(row?.種族) === factionName);
  if (byName) return byName;
  const byKana = rows.find(row => nonEmptyText(row?.カナ) === className);
  if (byKana) return byKana;
  return null;
}

function resolveFallbackInitialPopulation() {
  const rows = factionRows.value;
  for (const row of rows) {
    const num = Math.floor(toSafeNumber(row?.初期人数, 0));
    if (num > 0) return num;
  }
  return 10;
}

function resolveInitialVillagePopulationByRace(raceKey = "") {
  const row = resolveFactionRowByRace(raceKey);
  const num = Math.floor(toSafeNumber(row?.初期人数, 0));
  if (num > 0) return num;
  return resolveFallbackInitialPopulation();
}

function resolveRaceFoodProfile(raceKey = "") {
  const raceClassName = resolveRaceBaseClassName(raceKey);
  const row = findClassRowByName(raceClassName) || findClassRowByName(nonEmptyText(raceKey));
  const profile = buildEmptyResourceBag(FOOD_RESOURCE_KEYS);
  for (const key of FOOD_RESOURCE_KEYS) {
    profile[key] = roundTo1(Math.max(0, toSafeNumber(row?.[key], 0) / 10));
  }
  if (sumResourceBag(profile, FOOD_RESOURCE_KEYS) <= 0) {
    profile.穀物 = 1;
  }
  return profile;
}

function normalizePopulationByRace(input, totalPopulation, primaryRace = "") {
  const normalized = {};
  if (input && typeof input === "object") {
    for (const [race, countRaw] of Object.entries(input)) {
      const key = nonEmptyText(race);
      const count = Math.max(0, Math.floor(toSafeNumber(countRaw, 0)));
      if (!key || count <= 0) continue;
      normalized[key] = count;
    }
  }
  const total = Math.max(1, Math.floor(toSafeNumber(totalPopulation, 1)));
  let sum = Object.values(normalized).reduce((acc, n) => acc + Math.max(0, Math.floor(toSafeNumber(n, 0))), 0);
  const fallbackRace = nonEmptyText(primaryRace) || nonEmptyText(props.selectedRace) || "只人";
  if (!sum) {
    normalized[fallbackRace] = total;
    return normalized;
  }
  if (sum !== total) {
    const leadRace = Object.entries(normalized).sort((a, b) => b[1] - a[1])[0]?.[0] || fallbackRace;
    normalized[leadRace] = Math.max(0, toSafeNumber(normalized[leadRace], 0) + (total - sum));
    if (normalized[leadRace] <= 0) {
      delete normalized[leadRace];
    }
    sum = Object.values(normalized).reduce((acc, n) => acc + Math.max(0, Math.floor(toSafeNumber(n, 0))), 0);
    if (!sum) {
      normalized[fallbackRace] = total;
    }
  }
  return normalized;
}

function ensureVillageStateShape(village, preferredRace = "") {
  if (!village || typeof village !== "object") return null;
  const baseRace = nonEmptyText(preferredRace) || nonEmptyText(props.selectedRace) || "只人";
  const population = Math.max(1, Math.floor(toSafeNumber(village.population, resolveInitialVillagePopulationByRace(baseRace))));
  const populationByRace = normalizePopulationByRace(village.populationByRace, population, baseRace);
  const buildings = normalizeVillageBuildings(village.buildings);
  const foodStockByType = normalizeResourceBag(
    village.foodStockByType || splitTotalIntoBag(village.foodStock, FOOD_RESOURCE_KEYS),
    FOOD_RESOURCE_KEYS
  );
  const materialStockByType = normalizeResourceBag(
    village.materialStockByType || splitTotalIntoBag(village.materialStock, MATERIAL_RESOURCE_KEYS),
    MATERIAL_RESOURCE_KEYS
  );
  const syncedPopulation = Math.max(1, Math.floor(Object.values(populationByRace).reduce((acc, n) => acc + toSafeNumber(n, 0), 0)));
  return {
    ...village,
    population: syncedPopulation,
    populationByRace,
    buildings,
    foodStockByType,
    materialStockByType,
    foodStock: sumResourceBag(foodStockByType, FOOD_RESOURCE_KEYS),
    materialStock: sumResourceBag(materialStockByType, MATERIAL_RESOURCE_KEYS)
  };
}

function createInitialFoodStockByType(initialPopulation = 10) {
  const pop = Math.max(1, Math.floor(toSafeNumber(initialPopulation, 10)));
  return {
    穀物: randomInt(pop * 6, pop * 9),
    野菜: randomInt(pop * 4, pop * 7),
    肉: randomInt(pop * 3, pop * 6),
    魚: randomInt(pop * 2, pop * 5)
  };
}

function createInitialMaterialStockByType(initialPopulation = 10) {
  const pop = Math.max(1, Math.floor(toSafeNumber(initialPopulation, 10)));
  return {
    木材: randomInt(pop * 3, pop * 5),
    石材: randomInt(pop * 2, pop * 4),
    鉄: randomInt(pop * 1, pop * 3)
  };
}

function adjustVillagePopulationForTurn(village, shortageTotal = 0) {
  if (!village) return 0;
  const shortage = Math.max(0, toSafeNumber(shortageTotal, 0));
  const driftMin = shortage > 0 ? -2 : -1;
  const driftMax = shortage > 0 ? 0 : 2;
  let delta = randomInt(driftMin, driftMax);
  const entries = Object.entries(village.populationByRace || {})
    .map(([race, count]) => ({ race, count: Math.max(0, Math.floor(toSafeNumber(count, 0))) }))
    .filter(v => nonEmptyText(v.race) && v.count > 0)
    .sort((a, b) => b.count - a.count);
  const targetRace = entries[0]?.race || nonEmptyText(props.selectedRace) || "只人";
  const current = Math.max(0, Math.floor(toSafeNumber(village.populationByRace?.[targetRace], 0)));
  if (current + delta < 1) {
    delta = 1 - current;
  }
  village.populationByRace = {
    ...(village.populationByRace || {}),
    [targetRace]: Math.max(1, current + delta)
  };
  village.population = Math.max(1, Math.floor(Object.values(village.populationByRace).reduce((acc, n) => acc + toSafeNumber(n, 0), 0)));
  return delta;
}

function shouldDisableFog(data) {
  if (!data || data.shapeOnly) return true;
  const v = villageState.value;
  return villagePlacementMode.value && (!v?.placed || !Number.isFinite(v.x) || !Number.isFinite(v.y));
}

function resetVisibilityState() {
  exploredTileKeys = new Set();
  visibleTileKeys = new Set();
}

function markTileExplored(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  exploredTileKeys.add(coordKey(x, y));
}

function markPathExplored(path) {
  if (!Array.isArray(path)) return;
  for (const node of path) {
    if (!node) continue;
    markTileExplored(node.x, node.y);
  }
}

function addVisionRangeKeys(data, sx, sy, range, outSet) {
  if (!data?.grid || !outSet) return;
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;
  if (sx < 0 || sy < 0 || sx >= data.w || sy >= data.h) return;
  const safeRange = Math.max(0, Math.floor(toSafeNumber(range, 0)));
  const startKey = coordKey(sx, sy);
  if (!outSet.has(startKey)) outSet.add(startKey);
  if (safeRange <= 0) return;

  const visited = new Set([startKey]);
  const queue = [{ x: sx, y: sy, d: 0 }];
  while (queue.length) {
    const cur = queue.shift();
    if (!cur || cur.d >= safeRange) continue;
    const neighbors = getHexNeighborCoordsBySize(data.w, data.h, cur.x, cur.y, resolveWorldWrapEnabled(data));
    for (const n of neighbors) {
      const k = coordKey(n.x, n.y);
      if (visited.has(k)) continue;
      visited.add(k);
      outSet.add(k);
      queue.push({ x: n.x, y: n.y, d: cur.d + 1 });
    }
  }
}

function rebuildVisibleTiles(data) {
  if (!data?.grid) {
    visibleTileKeys = new Set();
    return;
  }
  if (shouldDisableFog(data)) {
    const all = new Set();
    for (let y = 0; y < data.h; y += 1) {
      for (let x = 0; x < data.w; x += 1) {
        all.add(coordKey(x, y));
      }
    }
    visibleTileKeys = all;
    return;
  }

  const dynamicVisible = new Set();
  const v = villageState.value;
  if (v?.placed && Number.isFinite(v.x) && Number.isFinite(v.y)) {
    addVisionRangeKeys(data, v.x, v.y, BASE_VILLAGE_SCOUT_RANGE, dynamicVisible);
  }
  for (const unit of unitList.value) {
    if (!Number.isFinite(unit?.x) || !Number.isFinite(unit?.y) || unit.x < 0 || unit.y < 0) continue;
    addVisionRangeKeys(data, unit.x, unit.y, toSafeNumber(unit.scoutRange, 0), dynamicVisible);
  }
  for (const key of dynamicVisible) {
    exploredTileKeys.add(key);
  }
  visibleTileKeys = new Set(exploredTileKeys);
}

function isTileVisible(tileKey, data) {
  if (!data?.grid) return false;
  if (shouldDisableFog(data)) return true;
  return visibleTileKeys.has(tileKey);
}

function buildReachableTileSet(data, sx, sy, maxDistance) {
  const reachable = new Set();
  if (!data?.grid) return reachable;
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return reachable;
  if (sx < 0 || sy < 0 || sx >= data.w || sy >= data.h) return reachable;
  const safeDistance = Math.max(0, Math.floor(toSafeNumber(maxDistance, 0)));
  const startKey = coordKey(sx, sy);
  reachable.add(startKey);
  if (safeDistance <= 0) return reachable;

  const minCostByKey = new Map();
  minCostByKey.set(startKey, 0);
  const queue = [{ x: sx, y: sy, cost: 0 }];
  while (queue.length) {
    let minIndex = 0;
    for (let i = 1; i < queue.length; i += 1) {
      if (queue[i].cost < queue[minIndex].cost) minIndex = i;
    }
    const [cur] = queue.splice(minIndex, 1);
    if (!cur || cur.cost > safeDistance) continue;
    const neighbors = getHexNeighborCoordsBySize(data.w, data.h, cur.x, cur.y, resolveWorldWrapEnabled(data));
    for (const n of neighbors) {
      const key = coordKey(n.x, n.y);
      if (!isPassableTerrain(data.grid[n.y][n.x])) continue;
      const stepCost = movementStepCost(data, cur.x, cur.y, n.x, n.y);
      const nextCost = cur.cost + stepCost;
      if (nextCost > safeDistance) continue;
      const best = minCostByKey.get(key);
      if (Number.isFinite(best) && best <= nextCost) continue;
      minCostByKey.set(key, nextCost);
      reachable.add(key);
      queue.push({ x: n.x, y: n.y, cost: nextCost });
    }
  }
  return reachable;
}

function findPathWithinDistance(data, sx, sy, tx, ty, maxDistance) {
  if (!data?.grid) return null;
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(tx) || !Number.isFinite(ty)) return null;
  if (tx < 0 || ty < 0 || tx >= data.w || ty >= data.h) return null;
  if (!isPassableTerrain(data.grid[ty][tx])) return null;
  const safeDistance = Math.max(0, Math.floor(toSafeNumber(maxDistance, 0)));
  const startKey = coordKey(sx, sy);
  const targetKey = coordKey(tx, ty);
  if (startKey === targetKey) return [{ x: sx, y: sy }];

  const minCostByKey = new Map();
  minCostByKey.set(startKey, 0);
  const parentByKey = new Map();
  const queue = [{ x: sx, y: sy, cost: 0 }];
  while (queue.length) {
    let minIndex = 0;
    for (let i = 1; i < queue.length; i += 1) {
      if (queue[i].cost < queue[minIndex].cost) minIndex = i;
    }
    const [cur] = queue.splice(minIndex, 1);
    if (!cur || cur.cost > safeDistance) continue;
    const currentKey = coordKey(cur.x, cur.y);
    const currentBest = minCostByKey.get(currentKey);
    if (Number.isFinite(currentBest) && cur.cost > currentBest) continue;
    const neighbors = getHexNeighborCoordsBySize(data.w, data.h, cur.x, cur.y, resolveWorldWrapEnabled(data));
    for (const n of neighbors) {
      const key = coordKey(n.x, n.y);
      if (!isPassableTerrain(data.grid[n.y][n.x])) continue;
      const stepCost = movementStepCost(data, cur.x, cur.y, n.x, n.y);
      const nextCost = cur.cost + stepCost;
      if (nextCost > safeDistance) continue;
      const best = minCostByKey.get(key);
      if (Number.isFinite(best) && best <= nextCost) continue;
      minCostByKey.set(key, nextCost);
      parentByKey.set(key, currentKey);
      if (key === targetKey) {
        const path = [{ x: tx, y: ty }];
        let cursor = targetKey;
        while (cursor !== startKey) {
          const prev = parentByKey.get(cursor);
          if (!prev) break;
          const [px, py] = prev.split(",").map(Number);
          path.push({ x: px, y: py });
          cursor = prev;
        }
        path.reverse();
        return path;
      }
      queue.push({ x: n.x, y: n.y, cost: nextCost });
    }
  }
  return null;
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
    const neighbors = getHexNeighborCoordsBySize(data.w, data.h, cur.x, cur.y, resolveWorldWrapEnabled(data));
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

function buildUnitSkillLevelsFromClass(classRow) {
  const out = {};
  for (const key of SKILL_LEVEL_FIELDS) {
    const raw = toSafeNumber(classRow?.[key], 0);
    out[key] = Math.max(0, Math.round(raw));
  }
  return out;
}

function buildUnitResistances(raceRow, classRow) {
  const out = {};
  for (const key of RESISTANCE_FIELDS) {
    const raceValue = toSafeNumber(raceRow?.[key], 0);
    const classValue = toSafeNumber(classRow?.[key], 0);
    const total = Math.round(raceValue + classValue);
    out[key] = total;
  }
  return out;
}

function allowsEquipmentBySlotCell(value) {
  const text = nonEmptyText(value);
  if (!text) return true;
  if (text.includes("×")) return false;
  if (text.toLowerCase() === "x") return false;
  if (text.includes("不可")) return false;
  return true;
}

function buildEquipmentSlotsFromClassRow(row) {
  const out = {};
  for (const slotKey of EQUIPMENT_SLOT_KEYS) {
    out[slotKey] = allowsEquipmentBySlotCell(row?.[slotKey]);
  }
  return out;
}

function resolveUnitEquipmentSlots(unit) {
  const current = unit?.equipmentSlots;
  const out = {};
  for (const slotKey of EQUIPMENT_SLOT_KEYS) {
    if (current && Object.prototype.hasOwnProperty.call(current, slotKey)) {
      out[slotKey] = !!current[slotKey];
    } else {
      out[slotKey] = true;
    }
  }
  return out;
}

function slotKeyFromIndex(indexRaw) {
  const idx = Math.max(0, Math.floor(toSafeNumber(indexRaw, 0)));
  return EQUIPMENT_SLOT_KEYS[idx] || EQUIPMENT_SLOT_KEYS[0];
}

function normalizeEquipmentSlotKey(value) {
  const text = nonEmptyText(value);
  if (!text) return "";
  if (EQUIPMENT_SLOT_KEYS.includes(text)) return text;
  if (text === "武器") return "武器1";
  return "";
}

function resolveEquipmentSlotCandidates(row) {
  const explicitSlot = normalizeEquipmentSlotKey(row?.装備部位);
  if (explicitSlot === "武器1") return ["武器1", "武器2"];
  if (explicitSlot) return [explicitSlot];

  const name = nonEmptyText(row?.装備名);
  if (SHIELD_EQUIPMENT_NAMES.includes(name)) return ["武器2"];
  if (WEAPON_EQUIPMENT_NAMES.includes(name)) return ["武器1", "武器2"];
  if (/(兜|ヘルム|帽|頭)/.test(name)) return ["頭"];
  if (/(鎧|ローブ|服|法衣|胸当|体)/.test(name)) return ["体"];
  if (/(靴|ブーツ|足)/.test(name)) return ["足"];
  if (/(指輪|リング|首飾|首輪|護符|ペンダント|装飾)/.test(name)) return ["装飾1", "装飾2"];
  return ["武器1"];
}

function equipmentRowMatchesSlot(row, slotKey) {
  const key = nonEmptyText(slotKey);
  if (!key) return false;
  const candidates = resolveEquipmentSlotCandidates(row);
  return candidates.includes(key);
}

function normalizeEquipmentList(list) {
  const source = Array.isArray(list) ? list : [];
  return source
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const slot = normalizeEquipmentSlotKey(item?.slot) || slotKeyFromIndex(index);
      return {
        ...item,
        slot
      };
    })
    .filter(Boolean);
}

function buildEquipmentResistanceBonus(equipmentList) {
  const out = {};
  for (const key of RESISTANCE_FIELDS) out[key] = 0;
  const source = normalizeEquipmentList(equipmentList);
  for (const item of source) {
    const bonus = item?.resistanceBonus;
    if (!bonus || typeof bonus !== "object") continue;
    for (const key of RESISTANCE_FIELDS) {
      out[key] += Math.round(toSafeNumber(bonus[key], 0));
    }
  }
  return out;
}

function mergeResistances(baseResistances, bonusResistances) {
  const out = {};
  for (const key of RESISTANCE_FIELDS) {
    const base = Math.round(toSafeNumber(baseResistances?.[key], 0));
    const bonus = Math.round(toSafeNumber(bonusResistances?.[key], 0));
    out[key] = base + bonus;
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

function buildCharacterStatusFromRules(raceRow, classRow, level, options = {}) {
  const safeLevel = Math.max(INITIAL_LEVEL_MIN, Math.min(INITIAL_LEVEL_MAX, Math.round(toSafeNumber(level, INITIAL_LEVEL_MIN))));
  const raceLevels = BASE_RACE_LEVEL + BONUS_RACE_LEVEL;
  const defaultClassPerLevelGain = Math.max(0, safeLevel - 1);
  const defaultClassBonus = raceIsHumanType(raceRow) ? HUMAN_CLASS_BONUS_LEVEL : 0;
  const hasFixedClassLevels = options?.classLevels !== undefined && options?.classLevels !== null;
  const classLevels = hasFixedClassLevels
    ? Math.max(0, Math.round(toSafeNumber(options.classLevels, defaultClassPerLevelGain + defaultClassBonus)))
    : (defaultClassPerLevelGain + defaultClassBonus);
  const classPerLevelGain = hasFixedClassLevels ? classLevels : defaultClassPerLevelGain;
  const classBonus = hasFixedClassLevels ? 0 : defaultClassBonus;

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

function clearCharacterGenerationState() {
  villageState.value = null;
  unitList.value = [];
  selectedUnitId.value = "";
  nationLogsBySovereign.value = {};
  activeNationLogKey.value = "";
  unitCreateBatchCount.value = 1;
  selectedVillageBuildingKey.value = "";
  showUnitCreateRaceModal.value = false;
  showUnitCreateClassModal.value = false;
  showVillageBuildModal.value = false;
  lastEconomySummary.value = "経済: -";
  villagePlacementMode.value = false;
  unitMoveMode.value = false;
  showMoveUnitModal.value = false;
  resetVisibilityState();
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

function createUnitRecord({
  raceRow,
  classRow,
  name,
  raceLabel = "",
  isSovereign = false,
  isNamed = false,
  unitType = "モブ",
  fixedLevel = null,
  fixedClassLevels = null
}) {
  const hasFixedLevel = fixedLevel !== undefined && fixedLevel !== null;
  const level = hasFixedLevel
    ? Math.max(INITIAL_LEVEL_MIN, Math.min(INITIAL_LEVEL_MAX, Math.round(toSafeNumber(fixedLevel, INITIAL_LEVEL_MIN))))
    : randomInt(INITIAL_LEVEL_MIN, INITIAL_LEVEL_MAX);
  const built = buildCharacterStatusFromRules(raceRow, classRow, level, {
    classLevels: fixedClassLevels
  });
  const equipmentSlots = buildEquipmentSlotsFromClassRow(raceRow || classRow || {});
  const equipment = chooseEquipmentForClass(classRow, isNamed || isSovereign, equipmentSlots);
  const baseResistances = buildUnitResistances(raceRow, classRow);
  const resistances = mergeResistances(baseResistances, buildEquipmentResistanceBonus(equipment));
  const moveRange = 6;
  const normalizedType = isSovereign ? "統治者" : (isNamed ? "ネームド" : unitType);
  const resolvedRace = nonEmptyText(raceLabel) || nonEmptyText(props.selectedRace) || nonEmptyText(raceRow?.名前) || "未設定";
  const iconName = resolveDefaultUnitIconName(resolvedRace);
  return {
    id: `unit-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    unitType: normalizedType,
    name: nonEmptyText(name) || (isSovereign ? "統治者" : randomPick(MOB_NAME_POOL, "モブ")),
    isSovereign: !!isSovereign,
    isNamed: !!isNamed || !!isSovereign,
    race: resolvedRace,
    iconName,
    iconSrc: resolveUnitIconSrc(iconName),
    className: nonEmptyText(classRow?.名前) || "未設定",
    level: built.level,
    x: -1,
    y: -1,
    moveRange,
    moveRemaining: moveRange,
    scoutRange: 4,
    squadCount: 0,
    squads: [],
    squadLeaderId: "",
    squadId: "",
    squadName: "",
    equipmentSlots,
    equipment,
    status: built.status,
    skillLevels: buildUnitSkillLevelsFromClass(classRow),
    baseResistances,
    resistances,
    growthRule: {
      raceLevels: built.raceLevels,
      classLevels: built.classLevels,
      classBonus: built.classBonus,
      classPerLevelGain: built.classPerLevelGain
    },
    skills: buildUnitSkillsFromClass(classRow)
  };
}

function createVillageAndInitialUnit(data) {
  if (!data || data.shapeOnly) {
    clearCharacterGenerationState();
    return;
  }
  if (!props.gameSetupReady) {
    clearCharacterGenerationState();
    mapClickInfo.value = "クリック座標: 『ゲーム開始』で統治者を作成してください。";
    updateUnitInfoText("ゲーム開始待機中。統治者作成後に初期村を配置できます。");
    return;
  }
  const selectedRaceName = nonEmptyText(props.selectedRace) || "只人";
  const initialPopulation = resolveInitialVillagePopulationByRace(selectedRaceName);
  const chosenVillageName = nonEmptyText(props.selectedVillageName);
  const pendingVillageName = chosenVillageName || randomPick(VILLAGE_NAME_POOL, "開拓村");
  const pendingPopulation = initialPopulation;
  const pendingFoodByType = createInitialFoodStockByType(pendingPopulation);
  const pendingMaterialByType = createInitialMaterialStockByType(pendingPopulation);

  villageState.value = {
    id: "village-pending",
    name: pendingVillageName,
    x: null,
    y: null,
    placed: false,
    buildings: [],
    population: pendingPopulation,
    populationByRace: {
      [selectedRaceName]: pendingPopulation
    },
    foodStockByType: pendingFoodByType,
    materialStockByType: pendingMaterialByType,
    foodStock: sumResourceBag(pendingFoodByType, FOOD_RESOURCE_KEYS),
    materialStock: sumResourceBag(pendingMaterialByType, MATERIAL_RESOURCE_KEYS)
  };

  const raceRow = chooseRaceBaseRowForSelection()
    || findClassRowByName(resolveRaceBaseClassName(selectedRaceName))
    || classRows.value[0]
    || null;
  const classRow = findClassRowByName(props.selectedClass)
    || pickClassRowForCharacter(raceRow)
    || randomPick(jobClassRows.value, classRows.value[0] || null);
  const sovereignName = nonEmptyText(props.selectedCharacterName) || "統治者";
  const sovereignUnit = createUnitRecord({
    raceRow,
    classRow,
    name: sovereignName,
    raceLabel: selectedRaceName,
    isSovereign: true,
    isNamed: true,
    unitType: "統治者"
  });

  unitList.value = [sovereignUnit];
  selectedUnitId.value = sovereignUnit.id;
  nationLogsBySovereign.value = {};
  activeNationLogKey.value = sovereignUnit.id || "nation-player";
  ensureNationLogBucket(activeNationLogKey.value, sovereignUnit.name || "統治者");
  pushNationLog(`国家を開始: 種族 ${selectedRaceName} / 初期人口 ${pendingPopulation}人`);
  pushNationLog(`統治者を任命: ${sovereignUnit.name} / ${sovereignUnit.race} / ${sovereignUnit.className} / Lv${sovereignUnit.level}`);
  villagePlacementMode.value = true;
  unitMoveMode.value = false;
  unitCreateBatchCount.value = 1;
  selectedVillageBuildingKey.value = "";
  showUnitCreateRaceModal.value = false;
  showUnitCreateClassModal.value = false;
  showVillageBuildModal.value = false;
  resetVisibilityState();
  mapClickInfo.value = "クリック座標: 初期村の配置先タイルをクリックしてください。";
  updateVillageInfoText();
  unitRulesInfoText.value = `キャラ生成ルール: 初期統治者は自動生成 / 村人口(勢力初期人数): ${pendingPopulation} 固定 / モブ上限: 人口の1/10 / ネームド上限 村2 町4 都市7 / ユニット作成(仮) 食料 ${UNIT_CREATION_COST_TEMP.food.穀物}/${UNIT_CREATION_COST_TEMP.food.野菜}/${UNIT_CREATION_COST_TEMP.food.肉} + 資材 ${UNIT_CREATION_COST_TEMP.material.木材}/${UNIT_CREATION_COST_TEMP.material.石材}/${UNIT_CREATION_COST_TEMP.material.鉄} / ターン順: 領土収入→ユニット維持費→村人口消費→不足判定`;
  updateUnitInfoText(`統治者を作成: ${sovereignUnit.name} / ${sovereignUnit.race} / ${sovereignUnit.className} / 村配置先を選択してください。`);
  emitCharacterStateChange();
}

function canPlaceVillageOnTile(picked) {
  if (!picked || !currentData.value) return false;
  const terrain = picked.rawTerrain || picked.terrain;
  if (!isPassableTerrain(terrain)) return false;
  if (terrain === "火山") return false;
  return true;
}

function placeVillageAt(x, y) {
  const selectedRaceName = nonEmptyText(props.selectedRace) || "只人";
  const initialPopulation = resolveInitialVillagePopulationByRace(selectedRaceName);
  const defaultFoodByType = createInitialFoodStockByType(initialPopulation);
  const defaultMaterialByType = createInitialMaterialStockByType(initialPopulation);
  const baseVillage = villageState.value || {
    id: "village-pending",
    name: randomPick(VILLAGE_NAME_POOL, "開拓村"),
    buildings: [],
    population: initialPopulation,
    populationByRace: {
      [selectedRaceName]: initialPopulation
    },
    foodStockByType: defaultFoodByType,
    materialStockByType: defaultMaterialByType,
    foodStock: sumResourceBag(defaultFoodByType, FOOD_RESOURCE_KEYS),
    materialStock: sumResourceBag(defaultMaterialByType, MATERIAL_RESOURCE_KEYS)
  };
  villageState.value = ensureVillageStateShape({
    ...baseVillage,
    id: `village-${x}-${y}`,
    x,
    y,
    placed: true
  }, selectedRaceName);
  unitList.value = unitList.value.map(unit => ({
    ...unit,
    x,
    y,
    moveRemaining: Math.max(0, Math.floor(toSafeNumber(unit.moveRange, 0)))
  }));
  if (unitList.value.length) {
    selectedUnitId.value = unitList.value[0].id;
  }
  villagePlacementMode.value = false;
  unitMoveMode.value = false;
  showMoveUnitModal.value = false;
  markTileExplored(x, y);
  if (currentData.value) rebuildTerritorySets(currentData.value);
  updateVillageInfoText();
  updateUnitInfoText(`初期村を配置: (${x}, ${y})`);
  pushNationLog(`初期村を配置: (${x}, ${y}) ${villageState.value?.name || ""}`);
  emitCharacterStateChange();
}

function startVillagePlacementMode() {
  if (!props.gameSetupReady) {
    updateUnitInfoText("初期村配置はゲーム開始後に可能です。");
    mapClickInfo.value = "クリック座標: 『ゲーム開始』で統治者作成を先に完了してください。";
    return;
  }
  if (!currentData.value || currentData.value.shapeOnly) return;
  villagePlacementMode.value = true;
  unitMoveMode.value = false;
  showMoveUnitModal.value = false;
  mapClickInfo.value = "クリック座標: 初期村の配置先タイルをクリックしてください。";
  emitCharacterStateChange();
  renderMapWithPhaser();
}

function emitCharacterStateChange() {
  const villageScale = resolveVillageScaleLabel(villageState.value);
  const namedLimit = resolveNamedLimit(villageState.value);
  const namedCount = countPromotedNamedUnits();
  emit("character-state-change", {
    village: villageState.value
      ? { ...villageState.value }
      : null,
    units: unitList.value.map(unit => {
      const equipmentSlots = resolveUnitEquipmentSlots(unit);
      const equipment = normalizeEquipmentList(unit?.equipment).map(e => ({ ...e }));
      const baseResistances = unit?.baseResistances
        ? { ...unit.baseResistances }
        : mergeResistances(unit?.resistances || {}, {});
      const resistances = mergeResistances(baseResistances, buildEquipmentResistanceBonus(equipment));
      const iconName = resolveUnitIconName(unit?.iconName || unit?.race, DEFAULT_ICON_NAME);
      return {
        ...unit,
        iconName,
        iconSrc: resolveUnitIconSrc(iconName),
        status: unit?.status ? { ...unit.status } : null,
        skillLevels: unit?.skillLevels ? { ...unit.skillLevels } : null,
        baseResistances,
        resistances,
        equipmentSlots,
        growthRule: unit?.growthRule ? { ...unit.growthRule } : null,
        equipment,
        skills: Array.isArray(unit?.skills) ? [...unit.skills] : []
      };
    }),
    selectedUnitId: selectedUnitId.value || "",
    squads: buildSquadSummaryList(unitList.value),
    villagePlacementMode: villagePlacementMode.value,
    unitMoveMode: unitMoveMode.value,
    villageScale,
    namedLimit,
    namedCount,
    ruleText: unitRulesInfoText.value || ""
  });
}

function canPromoteToNamed(unit) {
  if (!unit || isSovereignUnit(unit) || isNamedUnit(unit)) return false;
  const namedLimit = resolveNamedLimit(villageState.value);
  const namedCount = countPromotedNamedUnits();
  return namedCount < namedLimit;
}

function promoteMobToNamed(unitId) {
  const idx = unitList.value.findIndex(unit => unit?.id === unitId);
  if (idx < 0) return { ok: false, reason: "対象ユニットが見つかりません。" };
  const unit = unitList.value[idx];
  if (isSovereignUnit(unit)) return { ok: false, reason: "統治者は昇格対象外です。" };
  if (isNamedUnit(unit)) return { ok: false, reason: "既にネームドです。" };
  if (!canPromoteToNamed(unit)) {
    const villageScale = resolveVillageScaleLabel(villageState.value);
    const namedLimit = resolveNamedLimit(villageState.value);
    return { ok: false, reason: `ネームド上限です（${villageScale}: ${namedLimit}体）。` };
  }
  unitList.value[idx] = {
    ...unit,
    isNamed: true,
    unitType: "ネームド"
  };
  return { ok: true };
}

function configureUnitSquadState(unitId, memberIds = [], options = {}) {
  const leaderId = nonEmptyText(unitId);
  const idx = unitList.value.findIndex(unit => unit?.id === leaderId);
  if (idx < 0) return { ok: false, reason: "対象ユニットが見つかりません。" };

  const currentUnits = unitList.value;
  const leaderUnit = currentUnits[idx];
  const leaderX = Number.isFinite(leaderUnit?.x) ? leaderUnit.x : null;
  const leaderY = Number.isFinite(leaderUnit?.y) ? leaderUnit.y : null;
  if (!Number.isFinite(leaderX) || !Number.isFinite(leaderY) || leaderX < 0 || leaderY < 0) {
    return { ok: false, reason: "リーダーの座標が未確定です。" };
  }
  if (nonEmptyText(leaderUnit?.squadLeaderId)) {
    return { ok: false, reason: "このユニットは既に別部隊の隊員です。" };
  }
  const selected = [];
  const seen = new Set();
  const sourceIds = Array.isArray(memberIds) ? memberIds : [];
  for (const raw of sourceIds) {
    const memberId = nonEmptyText(raw);
    if (!memberId || memberId === leaderId || seen.has(memberId)) continue;
    const target = currentUnits.find(unit => unit?.id === memberId);
    if (!target) continue;
    if (unitHasSquad(target)) {
      return { ok: false, reason: `${target.name || "ユニット"} は既に部隊リーダーです。` };
    }
    const memberLeaderId = nonEmptyText(target?.squadLeaderId);
    if (memberLeaderId && memberLeaderId !== leaderId) {
      return { ok: false, reason: `${target.name || "ユニット"} は既に別部隊に所属しています。` };
    }
    const targetX = Number.isFinite(target?.x) ? target.x : null;
    const targetY = Number.isFinite(target?.y) ? target.y : null;
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY) || targetX !== leaderX || targetY !== leaderY) {
      return { ok: false, reason: "同じ座標にいるユニットのみ部隊編成できます。" };
    }
    seen.add(memberId);
    selected.push(memberId);
    if (selected.length >= MAX_SQUAD_MEMBER_COUNT) break;
  }
  const selectedSet = new Set(selected);
  const nextSquadName = nonEmptyText(options?.squadName)
    || nonEmptyText(leaderUnit?.squadName)
    || resolveDefaultSquadName(currentUnits);
  const nextSquadId = nonEmptyText(leaderUnit?.squadId) || `squad-${leaderId}`;

  let nextUnits = currentUnits.map(unit => {
    if (!unit) return unit;
    const currentSquads = normalizeSquadEntries(unit?.squads, unit?.id);
    let nextSquads = currentSquads;
    let nextLeaderId = nonEmptyText(unit?.squadLeaderId);
    let nextSquadIdForUnit = nonEmptyText(unit?.squadId);
    let nextSquadNameForUnit = nonEmptyText(unit?.squadName);

    if (unit.id === leaderId) {
      nextSquads = [];
      nextLeaderId = "";
      nextSquadIdForUnit = "";
      nextSquadNameForUnit = "";
    } else {
      nextSquads = currentSquads.filter(row => !selectedSet.has(row.memberId));
      if (nextLeaderId === leaderId) {
        nextLeaderId = "";
        nextSquadIdForUnit = "";
        nextSquadNameForUnit = "";
      }
      if (selectedSet.has(unit.id)) {
        nextLeaderId = leaderId;
        nextSquadIdForUnit = nextSquadId;
        nextSquadNameForUnit = nextSquadName;
      }
    }

    return {
      ...unit,
      squads: nextSquads,
      squadCount: nextSquads.length,
      squadLeaderId: nextLeaderId,
      squadId: nextSquadIdForUnit,
      squadName: nextSquadNameForUnit
    };
  });

  const nextSquads = selected.map((memberId, order) => {
    const member = nextUnits.find(unit => unit?.id === memberId);
    return {
      id: `${leaderId}-sq-${order + 1}`,
      memberId,
      name: nonEmptyText(member?.name) || `隊員${order + 1}`
    };
  });

  nextUnits = nextUnits.map(unit => (
    unit?.id === leaderId
      ? {
        ...unit,
        squads: nextSquads,
        squadCount: nextSquads.length,
        squadLeaderId: "",
        squadId: nextSquads.length ? nextSquadId : "",
        squadName: nextSquads.length ? nextSquadName : ""
      }
      : unit
  ));

  unitList.value = nextUnits;
  return {
    ok: true,
    hasSquad: nextSquads.length > 0,
    memberCount: nextSquads.length,
    memberNames: nextSquads.map(row => nonEmptyText(row.name)).filter(Boolean),
    squadName: nextSquadName
  };
}

function removeMobUnit(unitId) {
  const idx = unitList.value.findIndex(unit => unit?.id === unitId);
  if (idx < 0) return { ok: false, reason: "対象ユニットが見つかりません。" };
  const unit = unitList.value[idx];
  if (!isMobUnit(unit)) {
    return { ok: false, reason: "モブのみ削除できます。" };
  }
  const nextRaw = unitList.value.filter(row => row.id !== unitId);
  const next = stripRemovedUnitFromSquads(nextRaw, unitId);
  unitList.value = next;
  if (selectedUnitId.value === unitId) {
    selectedUnitId.value = next[0]?.id || "";
  }
  return { ok: true, removed: unit };
}

function renameLeaderSquad(unitId, squadName) {
  const leaderId = nonEmptyText(unitId);
  const nextName = nonEmptyText(squadName);
  if (!leaderId || !nextName) return { ok: false, reason: "部隊名が未入力です。" };
  const idx = unitList.value.findIndex(unit => unit?.id === leaderId);
  if (idx < 0) return { ok: false, reason: "部隊リーダーが見つかりません。" };
  const leader = unitList.value[idx];
  if (!unitHasSquad(leader)) return { ok: false, reason: "このユニットは部隊を持っていません。" };
  unitList.value[idx] = {
    ...leader,
    squadName: nextName
  };
  return { ok: true, squadName: nextName };
}

function dissolveLeaderSquad(unitId) {
  const leaderId = nonEmptyText(unitId);
  if (!leaderId) return { ok: false, reason: "部隊リーダーが未指定です。" };
  const leader = unitList.value.find(unit => unit?.id === leaderId);
  if (!leader) return { ok: false, reason: "部隊リーダーが見つかりません。" };
  if (!unitHasSquad(leader)) return { ok: false, reason: "このユニットは部隊を持っていません。" };
  return configureUnitSquadState(leaderId, [], { squadName: "" });
}

function updateUnitEquipment(unitId, slotIndexRaw, equipmentName, rarityKey, slotKeyRaw = "") {
  const targetId = nonEmptyText(unitId);
  const eqName = nonEmptyText(equipmentName);
  if (!targetId) return { ok: false, reason: "対象ユニットが未指定です。" };
  if (!eqName) return { ok: false, reason: "装備名が未指定です。" };
  const idx = unitList.value.findIndex(unit => unit?.id === targetId);
  if (idx < 0) return { ok: false, reason: "対象ユニットが見つかりません。" };
  const row = findEquipmentRowByName(eqName);
  if (!row) return { ok: false, reason: "装備データが見つかりません。" };

  const target = unitList.value[idx];
  const slotIndex = Math.max(0, Math.floor(toSafeNumber(slotIndexRaw, 0)));
  const slotKey = normalizeEquipmentSlotKey(slotKeyRaw) || slotKeyFromIndex(slotIndex);
  const equipmentSlots = resolveUnitEquipmentSlots(target);
  if (equipmentSlots[slotKey] === false) {
    return { ok: false, reason: `このユニットは ${EQUIPMENT_SLOT_LABELS[slotKey] || slotKey} を装備できません。` };
  }
  if (!equipmentRowMatchesSlot(row, slotKey)) {
    return { ok: false, reason: `${eqName} は ${EQUIPMENT_SLOT_LABELS[slotKey] || slotKey} に装備できません。` };
  }

  const currentEquipment = normalizeEquipmentList(target?.equipment).map(item => ({ ...item }));
  const nextItem = createEquipmentEntry(row, !!target?.isNamed || !!target?.isSovereign, rarityKey, slotKey);
  const nextEquipment = currentEquipment.filter(item => nonEmptyText(item?.slot) !== slotKey);
  nextEquipment.push(nextItem);
  const baseResistances = target?.baseResistances || target?.resistances || {};
  const nextResistances = mergeResistances(baseResistances, buildEquipmentResistanceBonus(nextEquipment));

  unitList.value[idx] = {
    ...target,
    equipment: normalizeEquipmentList(nextEquipment),
    resistances: nextResistances
  };
  return {
    ok: true,
    equipment: nextItem,
    slotIndex,
    slotKey
  };
}

function updateUnitIcon(unitId, iconNameRaw) {
  const targetId = nonEmptyText(unitId);
  if (!targetId) return { ok: false, reason: "対象ユニットが未指定です。" };
  const idx = unitList.value.findIndex(unit => unit?.id === targetId);
  if (idx < 0) return { ok: false, reason: "対象ユニットが見つかりません。" };
  const target = unitList.value[idx];
  const iconName = resolveUnitIconName(iconNameRaw, target?.iconName || target?.race || DEFAULT_ICON_NAME);
  unitList.value[idx] = {
    ...target,
    iconName,
    iconSrc: resolveUnitIconSrc(iconName)
  };
  return {
    ok: true,
    iconName,
    iconSrc: resolveUnitIconSrc(iconName)
  };
}

function applyCharacterCommand(command) {
  const type = nonEmptyText(command?.type);
  if (!type) return;

  if (type === "startVillagePlacement") {
    startVillagePlacementMode();
    return;
  }

  if (type === "openUnitCreate") {
    openUnitCreateModal();
    return;
  }

  const unitId = nonEmptyText(command?.unitId);
  if (!unitId) return;

  if (type === "promoteNamed") {
    const result = promoteMobToNamed(unitId);
    if (!result.ok) {
      updateUnitInfoText(`昇格失敗: ${result.reason || "条件未達"}`);
      pushNationLog(`昇格失敗: ${result.reason || "条件未達"}`);
    } else {
      const target = unitList.value.find(unit => unit.id === unitId);
      updateUnitInfoText(`${target?.name || "ユニット"} をネームドに昇格`);
      pushNationLog(`ネームド昇格: ${target?.name || "ユニット"}`);
    }
    emitCharacterStateChange();
    renderMapWithPhaser();
    return;
  }

  if (type === "removeMob") {
    const result = removeMobUnit(unitId);
    if (!result.ok) {
      updateUnitInfoText(`削除失敗: ${result.reason || "削除不可"}`);
      pushNationLog(`削除失敗: ${result.reason || "削除不可"}`);
    } else {
      const removedName = result.removed?.name || "モブ";
      updateUnitInfoText(`${removedName} を削除`);
      pushNationLog(`モブ削除: ${removedName}`);
    }
    emitCharacterStateChange();
    renderMapWithPhaser();
    return;
  }

  if (type === "createSquad") {
    const memberIds = Array.isArray(command?.memberIds) ? command.memberIds : [];
    const squadName = nonEmptyText(command?.squadName);
    const result = configureUnitSquadState(unitId, memberIds, { squadName });
    if (!result.ok) {
      updateUnitInfoText(`部隊作成失敗: ${result.reason || "作成不可"}`);
      pushNationLog(`部隊作成失敗: ${result.reason || "作成不可"}`);
    } else {
      const target = unitList.value.find(unit => unit.id === unitId);
      const names = Array.isArray(result.memberNames) ? result.memberNames.slice(0, 4).join(", ") : "";
      updateUnitInfoText(`${result.squadName || "部隊"} を作成: ${target?.name || "ユニット"} / ${result.memberCount}名${names ? ` (${names})` : ""}`);
      pushNationLog(`部隊作成: ${result.squadName || "部隊"} / リーダー ${target?.name || "ユニット"} / ${result.memberCount}名`);
    }
    emitCharacterStateChange();
    renderMapWithPhaser();
    return;
  }

  if (type === "renameSquad") {
    const squadName = nonEmptyText(command?.squadName);
    const result = renameLeaderSquad(unitId, squadName);
    if (!result.ok) {
      updateUnitInfoText(`部隊名変更失敗: ${result.reason || "変更不可"}`);
      pushNationLog(`部隊名変更失敗: ${result.reason || "変更不可"}`);
    } else {
      const leader = unitList.value.find(unit => unit.id === unitId);
      updateUnitInfoText(`部隊名変更: ${leader?.name || "リーダー"} -> ${result.squadName}`);
      pushNationLog(`部隊名変更: ${leader?.name || "リーダー"} / ${result.squadName}`);
    }
    emitCharacterStateChange();
    renderMapWithPhaser();
    return;
  }

  if (type === "dissolveSquad") {
    const result = dissolveLeaderSquad(unitId);
    if (!result.ok) {
      updateUnitInfoText(`部隊解除失敗: ${result.reason || "解除不可"}`);
      pushNationLog(`部隊解除失敗: ${result.reason || "解除不可"}`);
    } else {
      const leader = unitList.value.find(unit => unit.id === unitId);
      updateUnitInfoText(`${leader?.name || "リーダー"} の部隊を解除`);
      pushNationLog(`部隊解除: ${leader?.name || "リーダー"}`);
    }
    emitCharacterStateChange();
    renderMapWithPhaser();
    return;
  }

  if (type === "updateEquipment") {
    const slotIndex = toSafeNumber(command?.slotIndex, 0);
    const slotKey = nonEmptyText(command?.slotKey);
    const equipmentName = nonEmptyText(command?.equipmentName);
    const rarity = nonEmptyText(command?.rarity);
    const result = updateUnitEquipment(unitId, slotIndex, equipmentName, rarity, slotKey);
    if (!result.ok) {
      updateUnitInfoText(`装備変更失敗: ${result.reason || "変更不可"}`);
      pushNationLog(`装備変更失敗: ${result.reason || "変更不可"}`);
    } else {
      const target = unitList.value.find(unit => unit.id === unitId) || null;
      const item = result.equipment;
      const rarityText = item?.qualityLabel || formatEquipmentRarityLabel(item?.quality);
      const slotLabel = EQUIPMENT_SLOT_LABELS[result.slotKey] || `Slot${result.slotIndex + 1}`;
      updateUnitInfoText(`装備変更: ${target?.name || "ユニット"} / ${slotLabel} ${item?.name || "-"} [${rarityText}] / 金${item?.priceGold || 0}(仮)`);
      pushNationLog(`装備変更: ${target?.name || "ユニット"} / ${slotLabel} ${item?.name || "-"} [${rarityText}] / 金${item?.priceGold || 0}(仮)`);
    }
    emitCharacterStateChange();
    renderMapWithPhaser();
    return;
  }

  if (type === "updateIcon") {
    const iconName = nonEmptyText(command?.iconName);
    const result = updateUnitIcon(unitId, iconName);
    if (!result.ok) {
      updateUnitInfoText(`アイコン変更失敗: ${result.reason || "変更不可"}`);
      pushNationLog(`アイコン変更失敗: ${result.reason || "変更不可"}`);
    } else {
      const target = unitList.value.find(unit => unit.id === unitId) || null;
      updateUnitInfoText(`アイコン変更: ${target?.name || "ユニット"} / ${result.iconName}`);
      pushNationLog(`アイコン変更: ${target?.name || "ユニット"} / ${result.iconName}`);
    }
    emitCharacterStateChange();
    renderMapWithPhaser();
    return;
  }

  if (type === "toggleSquad") {
    const memberIds = Array.isArray(command?.memberIds) ? command.memberIds : [];
    const result = configureUnitSquadState(unitId, memberIds);
    if (!result.ok) {
      updateUnitInfoText(`部隊変更失敗: ${result.reason || "変更不可"}`);
      pushNationLog(`部隊変更失敗: ${result.reason || "変更不可"}`);
    } else {
      const target = unitList.value.find(unit => unit.id === unitId);
      const names = Array.isArray(result.memberNames) ? result.memberNames.slice(0, 4).join(", ") : "";
      const summary = result.hasSquad
        ? `編成 (${result.memberCount}名${names ? `: ${names}` : ""})`
        : "解除";
      updateUnitInfoText(`${target?.name || "ユニット"} の部隊を${summary}`);
      pushNationLog(`部隊変更: ${target?.name || "ユニット"} ${summary}`);
    }
    emitCharacterStateChange();
    renderMapWithPhaser();
  }
}

function pickEquipmentRarityForUnit(isNamed) {
  if (isNamed) return randomPick(["rare", "epic", "legendary"], "rare");
  return randomPick(["common", "uncommon"], "common");
}

function createEquipmentEntry(row, isNamed, rarityOverride = "", slotOverride = "") {
  const { key: quality, label: qualityLabel, multiplier } = resolveEquipmentRarity(
    rarityOverride,
    pickEquipmentRarityForUnit(isNamed)
  );
  const slot = normalizeEquipmentSlotKey(slotOverride) || resolveEquipmentSlotCandidates(row)[0] || "武器1";
  const power = Math.round(toSafeNumber(row?.威力, 0) * multiplier);
  const guard = Math.round(toSafeNumber(row?.ガード, 0) * multiplier);
  const criticalRate = Math.round(toSafeNumber(row?.Cr率, 0) * multiplier);
  const criticalPower = scaleCriticalPower(toSafeNumber(row?.Cr威力, 0), multiplier);
  const attackAp = Math.round(toSafeNumber(row?.攻撃AP, 0) * multiplier);
  const magicAp = Math.round(toSafeNumber(row?.魔法AP, 0) * multiplier);
  const shot = Math.round(toSafeNumber(row?.射撃, 0) * multiplier);
  const range = Number.isFinite(Number(row?.射程)) ? Math.round(toSafeNumber(row?.射程, 0)) : null;
  const itemPriceMultiplier = Math.max(0, toSafeNumber(row?.値段倍率, 1));
  const basePriceGold = Math.max(0, Math.round(20 * itemPriceMultiplier));
  const requiredMaterial = nonEmptyText(row?.必要素材);
  const resistanceBonus = {};
  for (const key of RESISTANCE_FIELDS) {
    resistanceBonus[key] = Math.round(toSafeNumber(row?.[key], 0) * multiplier);
  }
  const traits = [row?.特性1, row?.特性2, row?.特性3, row?.特性4]
    .map(v => nonEmptyText(v))
    .filter(Boolean);
  return {
    slot,
    slotLabel: EQUIPMENT_SLOT_LABELS[slot] || slot,
    name: nonEmptyText(row?.装備名) || "装備なし",
    type: nonEmptyText(row?.種別) || "",
    quality,
    qualityLabel,
    rarityMultiplier: multiplier,
    attackAp,
    magicAp,
    power,
    guard,
    criticalRate,
    criticalPower,
    shot,
    range,
    atkBonus: Math.max(0, Math.floor(power / 8)),
    defBonus: Math.max(0, Math.floor(guard / 10)),
    priceBase: 20,
    itemPriceMultiplier,
    priceGold: basePriceGold,
    requiredMaterial,
    resistanceBonus,
    traits
  };
}

function chooseEquipmentForClass(classRow, isNamed, equipmentSlots = null) {
  if (!equipmentRows.value.length) return [];
  const slots = equipmentSlots && typeof equipmentSlots === "object"
    ? equipmentSlots
    : resolveUnitEquipmentSlots({});
  const atk = toSafeNumber(classRow?.攻撃, 0);
  const mag = toSafeNumber(classRow?.魔力, 0);
  const weaponPoolBase = equipmentRows.value.filter(row => equipmentRowMatchesSlot(row, "武器1"));
  let pool = weaponPoolBase.length ? weaponPoolBase : equipmentRows.value;
  if (mag > atk + 12) {
    const staffPool = pool.filter(row => nonEmptyText(row.装備名).includes("杖"));
    if (staffPool.length) pool = staffPool;
  } else if (atk > mag + 8) {
    const meleePool = pool.filter(row => WEAPON_EQUIPMENT_NAMES.includes(nonEmptyText(row.装備名)));
    if (meleePool.length) pool = meleePool;
  }
  const primaryRow = randomPick(pool, randomPick(equipmentRows.value, null));
  const loadout = [];
  if (primaryRow && slots["武器1"] !== false) {
    loadout.push(createEquipmentEntry(primaryRow, isNamed, "", "武器1"));
  }
  const shieldPool = equipmentRows.value.filter(row => SHIELD_EQUIPMENT_NAMES.includes(nonEmptyText(row.装備名)));
  const shieldChance = isNamed ? 0.65 : 0.35;
  if (slots["武器2"] !== false && Math.random() < shieldChance) {
    const shield = randomPick(shieldPool, null);
    if (shield) loadout.push(createEquipmentEntry(shield, isNamed, "", "武器2"));
  }
  return normalizeEquipmentList(loadout);
}

function findEquipmentRowByName(name) {
  const target = nonEmptyText(name);
  if (!target) return null;
  return equipmentRows.value.find(row => nonEmptyText(row?.装備名) === target) || null;
}

function collectSkillFieldNames(row) {
  const names = new Set(ACQUIRED_SKILL_FIELDS);
  if (!row || typeof row !== "object") return Array.from(names);
  for (const key of Object.keys(row)) {
    const raw = nonEmptyText(key);
    if (!raw) continue;
    if (/^Skill\d+$/i.test(raw)) names.add(raw);
    if (/^スキル\d+$/.test(raw)) names.add(raw);
  }
  return Array.from(names);
}

function extractSkillNamesFromValue(value) {
  const text = nonEmptyText(value);
  if (!text || text === "0") return [];
  return text
    .split(/[\/,、，／]/)
    .map(part => nonEmptyText(part))
    .filter(part => part && part !== "0");
}

function buildUnitSkillsFromClass(classRow) {
  const skills = [];
  const fields = collectSkillFieldNames(classRow);
  for (const field of fields) {
    const names = extractSkillNamesFromValue(classRow?.[field]);
    if (!names.length) continue;
    skills.push(...names);
  }
  return [...new Set(skills)];
}

function updateVillageInfoText() {
  const v = ensureVillageStateShape(villageState.value, props.selectedRace);
  if (v && v !== villageState.value) {
    villageState.value = v;
  }
  if (!v) {
    villageInfoText.value = "初期村: -";
    return;
  }
  const foodText = formatResourceBag(v.foodStockByType, FOOD_RESOURCE_KEYS, FOOD_RESOURCE_LABELS);
  const materialText = formatResourceBag(v.materialStockByType, MATERIAL_RESOURCE_KEYS, MATERIAL_RESOURCE_LABELS);
  const popText = formatPopulationByRace(v.populationByRace);
  const buildingText = formatVillageBuildingList(v.buildings);
  if (!v.placed || !Number.isFinite(v.x) || !Number.isFinite(v.y)) {
    villageInfoText.value = `初期村: ${v.name} / 未配置 (マップをクリックして配置) / 人口 ${formatCompactNumber(v.population)} (${popText}) / 食料 ${formatCompactNumber(v.foodStock)} [${foodText}] / 資材 ${formatCompactNumber(v.materialStock)} [${materialText}] / 建物 ${buildingText}`;
    return;
  }
  villageInfoText.value = `初期村: ${v.name} / 座標 (${v.x}, ${v.y}) / 人口 ${formatCompactNumber(v.population)} (${popText}) / 食料 ${formatCompactNumber(v.foodStock)} [${foodText}] / 資材 ${formatCompactNumber(v.materialStock)} [${materialText}] / 建物 ${buildingText}`;
}

function updateUnitInfoText(extra = "") {
  const unit = selectedUnit.value;
  if (!unit) {
    unitInfoText.value = extra ? `選択ユニット: - / ${extra}` : "選択ユニット: -";
    return;
  }
  const eqText = unit.equipment.length
    ? normalizeEquipmentList(unit.equipment)
      .map(e => `${EQUIPMENT_SLOT_LABELS[e?.slot] || e?.slot || "-"}:${e.name}[${e.qualityLabel || formatEquipmentRarityLabel(e?.quality)}]`)
      .join(", ")
    : "なし";
  const note = extra ? ` / ${extra}` : "";
  const role = toUnitRoleLabel(unit);
  const leaderTag = unitHasSquad(unit) ? " / リーダー" : "";
  const squadLeaderId = nonEmptyText(unit?.squadLeaderId);
  const squadLeaderName = squadLeaderId
    ? (unitList.value.find(row => row?.id === squadLeaderId)?.name || squadLeaderId)
    : "";
  const memberTag = squadLeaderName ? ` / 隊員(${squadLeaderName})` : "";
  const sovereignTag = isSovereignUnit(unit) ? " / 統治者" : "";
  const moveRemaining = Math.max(0, Math.floor(toSafeNumber(unit.moveRemaining, unit.moveRange)));
  const squadCount = Math.max(0, Math.floor(toSafeNumber(unit.squadCount, 0)));
  unitInfoText.value = `選択ユニット: ${unit.name}(${role})${sovereignTag}${leaderTag}${memberTag} / Lv${unit.level} / 種族:${unit.race} / クラス:${unit.className} / 位置(${unit.x}, ${unit.y}) / 移動${unit.moveRange} 残${moveRemaining} / 索敵${unit.scoutRange} / 部隊${squadCount} / 装備:${eqText}${note}`;
}

function resolveTileTerrainForYield(data, x, y) {
  if (!data?.grid || !Number.isFinite(x) || !Number.isFinite(y)) return "";
  if (data.lavaMap?.[y]?.[x]) return "溶岩";
  const special = nonEmptyText(data.specialMap?.[y]?.[x]);
  if (special) return special;
  return nonEmptyText(data.grid?.[y]?.[x]);
}

function collectTerritoryIncome(data, ownedSet) {
  const income = {
    food: buildEmptyResourceBag(FOOD_RESOURCE_KEYS),
    material: buildEmptyResourceBag(MATERIAL_RESOURCE_KEYS),
    tiles: 0
  };
  if (!data?.grid || !(ownedSet instanceof Set) || !ownedSet.size) return income;
  const yields = terrainYieldMap.value;
  for (const key of ownedSet) {
    const pos = parseCoordKey(key);
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) continue;
    if (pos.x < 0 || pos.y < 0 || pos.x >= data.w || pos.y >= data.h) continue;
    const terrain = resolveTileTerrainForYield(data, pos.x, pos.y);
    const row = yields.get(terrain) || null;
    if (!row) continue;
    income.tiles += 1;
    for (const foodKey of FOOD_RESOURCE_KEYS) {
      income.food[foodKey] = roundTo1(income.food[foodKey] + toSafeNumber(row?.[foodKey], 0));
    }
    for (const matKey of MATERIAL_RESOURCE_KEYS) {
      income.material[matKey] = roundTo1(income.material[matKey] + toSafeNumber(row?.[matKey], 0));
    }
  }
  return income;
}

function consumeFoodWithSubstitution(stockBag, demandBag, fallbackMultiplier = FOOD_SUBSTITUTE_MULTIPLIER) {
  const stocks = normalizeResourceBag(stockBag, FOOD_RESOURCE_KEYS);
  const before = { ...stocks };
  const shortageByType = buildEmptyResourceBag(FOOD_RESOURCE_KEYS);
  const safeMultiplier = Math.max(1, toSafeNumber(fallbackMultiplier, FOOD_SUBSTITUTE_MULTIPLIER));

  for (const key of FOOD_RESOURCE_KEYS) {
    const demand = Math.max(0, roundTo1(toSafeNumber(demandBag?.[key], 0)));
    if (demand <= 0) continue;
    const direct = Math.min(stocks[key], demand);
    stocks[key] = roundTo1(stocks[key] - direct);
    const deficit = roundTo1(demand - direct);
    if (deficit <= 0) continue;
    let remainingEquivalent = roundTo1(deficit * safeMultiplier);
    const donors = FOOD_RESOURCE_KEYS
      .filter(foodKey => foodKey !== key)
      .sort((a, b) => stocks[b] - stocks[a]);
    for (const donor of donors) {
      if (remainingEquivalent <= 0) break;
      const take = Math.min(stocks[donor], remainingEquivalent);
      if (take <= 0) continue;
      stocks[donor] = roundTo1(stocks[donor] - take);
      remainingEquivalent = roundTo1(remainingEquivalent - take);
    }
    if (remainingEquivalent > 0) {
      shortageByType[key] = roundTo1(shortageByType[key] + (remainingEquivalent / safeMultiplier));
    }
  }

  const consumedByType = buildEmptyResourceBag(FOOD_RESOURCE_KEYS);
  for (const key of FOOD_RESOURCE_KEYS) {
    consumedByType[key] = roundTo1(before[key] - stocks[key]);
  }
  return {
    nextStock: stocks,
    consumedByType,
    shortageByType,
    shortageTotal: sumResourceBag(shortageByType, FOOD_RESOURCE_KEYS)
  };
}

function buildUnitUpkeepFoodDemand() {
  const demand = buildEmptyResourceBag(FOOD_RESOURCE_KEYS);
  for (const unit of unitList.value) {
    const profile = resolveRaceFoodProfile(unit?.race);
    addToResourceBag(demand, profile, FOOD_RESOURCE_KEYS);
  }
  return demand;
}

function buildPopulationFoodDemand(village) {
  const demand = buildEmptyResourceBag(FOOD_RESOURCE_KEYS);
  const popByRace = village?.populationByRace || {};
  for (const [race, countRaw] of Object.entries(popByRace)) {
    const count = Math.max(0, Math.floor(toSafeNumber(countRaw, 0)));
    if (count <= 0) continue;
    const profile = resolveRaceFoodProfile(race);
    const scaled = multiplyResourceBag(profile, count, FOOD_RESOURCE_KEYS);
    addToResourceBag(demand, scaled, FOOD_RESOURCE_KEYS);
  }
  return demand;
}

function processVillageEconomyTurn(data) {
  if (!data?.grid) {
    return { applied: false, notes: ["経済処理: マップ未生成"] };
  }
  if (!villageState.value?.placed) {
    return { applied: false, notes: ["経済処理: 初期村未配置"] };
  }

  const raceFallback = nonEmptyText(props.selectedRace) || "只人";
  const village = ensureVillageStateShape(villageState.value, raceFallback);
  if (!village) {
    return { applied: false, notes: ["経済処理: 村データ不正"] };
  }
  rebuildTerritorySets(data);

  const territoryIncome = collectTerritoryIncome(data, territorySets.player);
  const buildingIncome = collectVillageBuildingIncome(village);
  addToResourceBag(village.foodStockByType, territoryIncome.food, FOOD_RESOURCE_KEYS);
  addToResourceBag(village.materialStockByType, territoryIncome.material, MATERIAL_RESOURCE_KEYS);
  addToResourceBag(village.foodStockByType, buildingIncome.food, FOOD_RESOURCE_KEYS);
  addToResourceBag(village.materialStockByType, buildingIncome.material, MATERIAL_RESOURCE_KEYS);

  const unitUpkeepDemand = buildUnitUpkeepFoodDemand();
  const upkeepResult = consumeFoodWithSubstitution(village.foodStockByType, unitUpkeepDemand, FOOD_SUBSTITUTE_MULTIPLIER);
  village.foodStockByType = upkeepResult.nextStock;

  const populationDemand = buildPopulationFoodDemand(village);
  const popResult = consumeFoodWithSubstitution(village.foodStockByType, populationDemand, FOOD_SUBSTITUTE_MULTIPLIER);
  village.foodStockByType = popResult.nextStock;

  const shortageTotal = roundTo1(upkeepResult.shortageTotal + popResult.shortageTotal);
  const populationDelta = adjustVillagePopulationForTurn(village, shortageTotal);
  const normalizedVillage = ensureVillageStateShape(village, raceFallback);
  villageState.value = normalizedVillage;
  updateVillageInfoText();
  emitCharacterStateChange();

  const lines = [
    `領土収入: 食料 +${formatResourceBag(territoryIncome.food, FOOD_RESOURCE_KEYS, FOOD_RESOURCE_LABELS)} / 資材 +${formatResourceBag(territoryIncome.material, MATERIAL_RESOURCE_KEYS, MATERIAL_RESOURCE_LABELS)} (領土${territoryIncome.tiles}マス)`,
    `建設補正収入: ${buildingIncome.count > 0 ? `${formatVillageBuildingBonus(buildingIncome)} (建物${buildingIncome.count}件)` : "なし"}`,
    `ユニット維持費: 食料 -${formatResourceBag(upkeepResult.consumedByType, FOOD_RESOURCE_KEYS, FOOD_RESOURCE_LABELS)}${upkeepResult.shortageTotal > 0 ? ` / 不足${formatCompactNumber(upkeepResult.shortageTotal)}` : ""}`,
    `村人口消費: 食料 -${formatResourceBag(popResult.consumedByType, FOOD_RESOURCE_KEYS, FOOD_RESOURCE_LABELS)}${popResult.shortageTotal > 0 ? ` / 不足${formatCompactNumber(popResult.shortageTotal)}` : ""}`,
    shortageTotal > 0
      ? `不足ペナルティ: 後回し（将来イベント化） / 不足合計 ${formatCompactNumber(shortageTotal)}`
      : "不足ペナルティ: なし",
    `人口変動: ${populationDelta >= 0 ? "+" : ""}${populationDelta} -> ${formatCompactNumber(normalizedVillage.population)}人 (${formatPopulationByRace(normalizedVillage.populationByRace)})`
  ];
  lastEconomySummary.value = `経済: T${mapTurnNumber.value} / 食料${formatCompactNumber(normalizedVillage.foodStock)} / 資材${formatCompactNumber(normalizedVillage.materialStock)} / 人口${formatCompactNumber(normalizedVillage.population)}`;
  return {
    applied: true,
    notes: lines,
    shortageTotal,
    territoryIncome,
    upkeepResult,
    popResult,
    populationDelta
  };
}

function resolveNationLogKey() {
  const sovereign = unitList.value.find(unit => isSovereignUnit(unit));
  if (sovereign?.id) return sovereign.id;
  return nonEmptyText(activeNationLogKey.value);
}

function ensureNationLogBucket(id, label = "") {
  const key = nonEmptyText(id);
  if (!key) return null;
  const prev = nationLogsBySovereign.value?.[key];
  const next = prev
    ? { ...prev, label: nonEmptyText(label) || prev.label || "統治者", entries: Array.isArray(prev.entries) ? [...prev.entries] : [] }
    : { label: nonEmptyText(label) || "統治者", entries: [] };
  nationLogsBySovereign.value = {
    ...nationLogsBySovereign.value,
    [key]: next
  };
  if (!activeNationLogKey.value) {
    activeNationLogKey.value = key;
  }
  return next;
}

function pushNationLog(text) {
  const key = resolveNationLogKey();
  const entryText = nonEmptyText(text);
  if (!key || !entryText) return;
  const sovereign = unitList.value.find(unit => unit.id === key);
  const bucket = ensureNationLogBucket(key, sovereign?.name || "統治者");
  if (!bucket) return;
  const turn = mapTurnNumber.value;
  const at = new Date().toLocaleTimeString("ja-JP", { hour12: false });
  const nextEntries = [
    { turn, at, text: entryText },
    ...(Array.isArray(bucket.entries) ? bucket.entries : [])
  ].slice(0, 240);
  nationLogsBySovereign.value = {
    ...nationLogsBySovereign.value,
    [key]: {
      ...bucket,
      entries: nextEntries
    }
  };
}

function resolveRaceGlyph(raceName) {
  const race = nonEmptyText(raceName);
  if (!race) return "兵";
  if (Object.prototype.hasOwnProperty.call(RACE_ICON_GLYPH_MAP, race)) {
    return RACE_ICON_GLYPH_MAP[race];
  }
  return race.slice(0, 1);
}

function resolveRaceMarkerColor(raceName) {
  const race = nonEmptyText(raceName);
  if (Object.prototype.hasOwnProperty.call(RACE_ICON_COLOR_MAP, race)) {
    return RACE_ICON_COLOR_MAP[race];
  }
  return 0x4a617f;
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
  else if (key === "focusCameraOnTileClick") focusCameraOnTileClick.value = !!value;
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
    largeIslandMinGap: customLargeIslandMinGap.value,
    worldWrapEnabled: !!customWorldWrapEnabled.value
  };
}

function mapPixelSize(w, h) {
  return {
    width: (w * 40) + 20,
    height: ((h - 1) * 36) + 48
  };
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeFocusPoint(focusWorld) {
  if (!focusWorld) return null;
  const fx = Number(focusWorld.x);
  const fy = Number(focusWorld.y);
  if (!Number.isFinite(fx) || !Number.isFinite(fy)) return null;
  return { x: fx, y: fy };
}

function getCameraCenter(camera, viewW, viewH) {
  const zoom = Number.isFinite(camera?.zoom) && camera.zoom > 0 ? camera.zoom : 1;
  return {
    x: (camera?.scrollX || 0) + (viewW / zoom) / 2,
    y: (camera?.scrollY || 0) + (viewH / zoom) / 2
  };
}

function clampCameraCenter(center, worldW, worldH, viewW, viewH, zoom) {
  const halfW = (viewW / Math.max(zoom, 0.01)) / 2;
  const halfH = (viewH / Math.max(zoom, 0.01)) / 2;
  const minX = halfW;
  const maxX = worldW - halfW;
  const minY = halfH;
  const maxY = worldH - halfH;
  return {
    x: minX > maxX ? worldW / 2 : clampNumber(center.x, minX, maxX),
    y: minY > maxY ? worldH / 2 : clampNumber(center.y, minY, maxY)
  };
}

function createBoundsAccumulator() {
  return {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  };
}

function extendBoundsWithPoints(acc, points) {
  if (!acc || !Array.isArray(points)) return;
  for (const p of points) {
    const x = Number(p?.x);
    const y = Number(p?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < acc.minX) acc.minX = x;
    if (x > acc.maxX) acc.maxX = x;
    if (y < acc.minY) acc.minY = y;
    if (y > acc.maxY) acc.maxY = y;
  }
}

function finalizeBounds(acc, fallbackW = 0, fallbackH = 0) {
  if (
    !acc
    || !Number.isFinite(acc.minX)
    || !Number.isFinite(acc.maxX)
    || !Number.isFinite(acc.minY)
    || !Number.isFinite(acc.maxY)
    || acc.maxX <= acc.minX
    || acc.maxY <= acc.minY
  ) {
    return {
      minX: 0,
      minY: 0,
      maxX: Math.max(0, fallbackW),
      maxY: Math.max(0, fallbackH)
    };
  }
  return {
    minX: acc.minX,
    minY: acc.minY,
    maxX: acc.maxX,
    maxY: acc.maxY
  };
}

function clampCameraScroll(camera, worldW, worldH, viewW, viewH, options = {}) {
  if (!camera) return;
  const forceCenter = !!options?.forceCenter;
  const zoom = Number.isFinite(camera.zoom) && camera.zoom > 0 ? camera.zoom : 1;
  const viewWorldW = viewW / zoom;
  const viewWorldH = viewH / zoom;
  const wrapEnabled = resolveWorldWrapEnabled(currentData.value);
  const centerScrollX = (worldW / 2) - (viewWorldW / 2);
  const centerScrollY = (worldH / 2) - (viewWorldH / 2);
  if (forceCenter) {
    camera.scrollX = centerScrollX;
    camera.scrollY = centerScrollY;
    return;
  }
  if (wrapEnabled) {
    const bounds = renderedHexBounds || finalizeBounds(null, worldW, worldH);
    const drawnW = Math.max(1, bounds.maxX - bounds.minX);
    const drawnH = Math.max(1, bounds.maxY - bounds.minY);
    const allowedW = drawnW * WRAP_DRAG_VIEW_RANGE_MULTIPLIER_X;
    const allowedH = drawnH * WRAP_DRAG_VIEW_RANGE_MULTIPLIER_Y;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const minCenterX = centerX - (allowedW / 2);
    const maxCenterX = centerX + (allowedW / 2);
    const minCenterY = centerY - (allowedH / 2);
    const maxCenterY = centerY + (allowedH / 2);
    const minScrollX = minCenterX - (viewWorldW / 2);
    const maxScrollX = maxCenterX - (viewWorldW / 2);
    const minScrollY = minCenterY - (viewWorldH / 2);
    const maxScrollY = maxCenterY - (viewWorldH / 2);
    camera.scrollX = minScrollX > maxScrollX
      ? (minScrollX + maxScrollX) / 2
      : clampNumber(camera.scrollX, minScrollX, maxScrollX);
    camera.scrollY = minScrollY > maxScrollY
      ? (minScrollY + maxScrollY) / 2
      : clampNumber(camera.scrollY, minScrollY, maxScrollY);
    return;
  }
  const maxX = worldW - viewWorldW;
  const maxY = worldH - viewWorldH;
  camera.scrollX = maxX < 0 ? centerScrollX : clampNumber(camera.scrollX, 0, maxX);
  camera.scrollY = maxY < 0 ? centerScrollY : clampNumber(camera.scrollY, 0, maxY);
}

function resolveMinZoomPercent(dataLike = currentData.value) {
  const w = Number(dataLike?.w);
  const h = Number(dataLike?.h);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 100;
  const { width: worldW, height: worldH } = mapPixelSize(w, h);
  const fitZoomWidth = GAME_VIEW_WIDTH / Math.max(worldW, 1);
  const fitZoomHeight = GAME_VIEW_HEIGHT / Math.max(worldH, 1);
  const baseZoom = Math.min(fitZoomWidth, fitZoomHeight, 1) * 0.96;
  const maxViewW = worldW * WRAP_DRAG_VIEW_RANGE_MULTIPLIER_X;
  const maxViewH = worldH * WRAP_DRAG_VIEW_RANGE_MULTIPLIER_Y;
  const minFinalZoom = Math.max(
    GAME_VIEW_WIDTH / Math.max(maxViewW, 1),
    GAME_VIEW_HEIGHT / Math.max(maxViewH, 1)
  );
  const minPercent = Math.ceil((minFinalZoom / Math.max(baseZoom, 0.0001)) * 100);
  return Math.max(80, Math.min(resolveMaxZoomPercent(), minPercent));
}

function resolveMaxZoomPercent() {
  return 400;
}

function normalizeZoomPercent(value, dataLike = currentData.value) {
  const raw = Number.isFinite(value) ? value : Number(value);
  const safe = Number.isFinite(raw) ? Math.round(raw) : 80;
  const minZoom = resolveMinZoomPercent(dataLike);
  const maxZoom = resolveMaxZoomPercent();
  return Math.max(minZoom, Math.min(maxZoom, safe));
}

function setZoomPercent(value) {
  zoomPercent.value = normalizeZoomPercent(value, currentData.value);
  centerMapOnNextZoom = true;
  renderMapWithPhaser();
}

function isMinZoomActive(dataLike = currentData.value) {
  if (!dataLike) return false;
  const currentZoom = normalizeZoomPercent(zoomPercent.value, dataLike);
  return currentZoom <= resolveMinZoomPercent(dataLike);
}

function canDragMapAtCurrentZoom(dataLike = currentData.value) {
  return !!dataLike && !isMinZoomActive(dataLike);
}

function queueCameraFocusAtWorld(worldX, worldY) {
  const normalized = normalizeFocusPoint({ x: worldX, y: worldY });
  if (!normalized) return;
  pendingClickFocusWorld = normalized;
}

function queueCameraFocusAtTile(x, y) {
  const c = hexCenter(x, y);
  queueCameraFocusAtWorld(c.cx, c.cy);
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

function offsetHexPoints(points, offsetX = 0, offsetY = 0) {
  if (!Array.isArray(points) || (!offsetX && !offsetY)) return points;
  return points.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }));
}

function buildWrapOffsets(data) {
  if (!resolveWorldWrapEnabled(data)) return [{ x: 0, y: 0 }];
  const { width: worldW, height: worldH } = mapPixelSize(data.w, data.h);
  const xs = [-worldW, 0, worldW];
  const ys = [-worldH, 0, worldH];
  const offsets = [];
  for (const oy of ys) {
    for (const ox of xs) {
      offsets.push({ x: ox, y: oy });
    }
  }
  return offsets;
}

function isBaseWrapOffset(offset) {
  return !offset || (offset.x === 0 && offset.y === 0);
}

function shouldDrawWrappedTileCopy(x, y, offset, w, h) {
  if (isBaseWrapOffset(offset)) return true;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return false;
  const ox = offset?.x || 0;
  const oy = offset?.y || 0;
  const margin = Math.max(1, Math.min(Math.floor(WRAP_RING_TILE_MARGIN), Math.min(w, h)));
  const matchX = ox < 0
    ? x >= (w - margin)
    : ox > 0
      ? x <= (margin - 1)
      : true;
  const matchY = oy < 0
    ? y >= (h - margin)
    : oy > 0
      ? y <= (margin - 1)
      : true;
  return matchX && matchY;
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
  const { w, h, patternName, terrainRatioProfile, worldWrapEnabled } = data;
  const centerX = Math.floor((w - 1) / 2);
  const centerY = Math.floor((h - 1) / 2);
  mapSizeInfo.value = `サイズ: ${w} x ${h} (${w * h}マス)`;
  const wrapLabel = worldWrapEnabled ? "ON(折り返し表示)" : "OFF";
  mapCenterInfo.value = `中央座標: (${centerX}, ${centerY})${patternName ? ` / ${patternName}` : ""} / 端接続: ${wrapLabel}`;
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
  lines.push(`端接続: ${data?.worldWrapEnabled ? "ON (反対側へ接続)" : "OFF (端で停止)"}`);
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

function drawRiverOverlay(data, visibleKeys = null, wrapOffsets = [{ x: 0, y: 0 }]) {
  if (!riverLayer) return;
  riverLayer.clear();
  const riverData = data.riverData;
  if (!riverData) return;
  const riverSet = riverData.riverSet || new Set();
  const isVisibleKey = key => !visibleKeys || visibleKeys.has(key);

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
    for (const offset of wrapOffsets) {
      if (!shouldDrawWrappedTileCopy(pa.x, pa.y, offset, data.w, data.h)) continue;
      if (!shouldDrawWrappedTileCopy(pb.x, pb.y, offset, data.w, data.h)) continue;
      const ox = offset?.x || 0;
      const oy = offset?.y || 0;
      const fromX = ca.cx + ox;
      const fromY = ca.cy + oy;
      const toX = cb.cx + ox;
      const toY = cb.cy + oy;
      const dx = toX - fromX;
      const dy = toY - fromY;
      const len = Math.hypot(dx, dy);
      if (len < 8) continue;

      const ux = dx / len;
      const uy = dy / len;
      const px = -uy;
      const py = ux;
      const tip = {
        x: fromX + ux * Math.min(len - 2, len * 0.62),
        y: fromY + uy * Math.min(len - 2, len * 0.62)
      };
      const headLen = 6.2;
      const wing = 3.1;
      const base = { x: tip.x - ux * headLen, y: tip.y - uy * headLen };
      const p2 = { x: base.x + px * wing, y: base.y + py * wing };
      const p3 = { x: base.x - px * wing, y: base.y - py * wing };
      riverLayer.fillStyle(color, alpha);
      riverLayer.fillPoints([tip, p2, p3], true);
    }
  };

  riverLayer.lineStyle(5, 0x9ed3ff, 0.95);
  for (const ek of riverData.edgeSet || []) {
    const [a, b] = ek.split("|");
    if (!isVisibleKey(a) || !isVisibleKey(b)) continue;
    const pa = parseCoordKey(a);
    const pb = parseCoordKey(b);
    const ca = hexCenter(pa.x, pa.y);
    const cb = hexCenter(pb.x, pb.y);
    for (const offset of wrapOffsets) {
      if (!shouldDrawWrappedTileCopy(pa.x, pa.y, offset, data.w, data.h)) continue;
      if (!shouldDrawWrappedTileCopy(pb.x, pb.y, offset, data.w, data.h)) continue;
      const ox = offset?.x || 0;
      const oy = offset?.y || 0;
      riverLayer.strokeLineShape(new Phaser.Geom.Line(ca.cx + ox, ca.cy + oy, cb.cx + ox, cb.cy + oy));
    }
  }

  riverLayer.lineStyle(3.4, 0x6ab7ff, 0.82);
  for (const wk of riverData.waterLinkSet || []) {
    const [a, b] = wk.split("|");
    if (!isVisibleKey(a) || !isVisibleKey(b)) continue;
    const pa = parseCoordKey(a);
    const pb = parseCoordKey(b);
    const ca = hexCenter(pa.x, pa.y);
    const cb = hexCenter(pb.x, pb.y);
    for (const offset of wrapOffsets) {
      if (!shouldDrawWrappedTileCopy(pa.x, pa.y, offset, data.w, data.h)) continue;
      if (!shouldDrawWrappedTileCopy(pb.x, pb.y, offset, data.w, data.h)) continue;
      const ox = offset?.x || 0;
      const oy = offset?.y || 0;
      riverLayer.strokeLineShape(new Phaser.Geom.Line(ca.cx + ox, ca.cy + oy, cb.cx + ox, cb.cy + oy));
    }
  }

  for (const ek of riverData.edgeSet || []) {
    const [a, b] = ek.split("|");
    if (!isVisibleKey(a) || !isVisibleKey(b)) continue;
    const dir = directedPair(a, b);
    if (dir) drawFlowArrow(dir[0], dir[1], 0xf4fbff, 0.94);
  }
  for (const wk of riverData.waterLinkSet || []) {
    const [a, b] = wk.split("|");
    if (!isVisibleKey(a) || !isVisibleKey(b)) continue;
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
    if (!isVisibleKey(key)) return;
    const p = parseCoordKey(key);
    const c = hexCenter(p.x, p.y);
    riverLayer.fillStyle(color, 1);
    for (const offset of wrapOffsets) {
      if (!shouldDrawWrappedTileCopy(p.x, p.y, offset, data.w, data.h)) continue;
      const ox = offset?.x || 0;
      const oy = offset?.y || 0;
      riverLayer.fillCircle(c.cx + ox, c.cy + oy, radius);
    }
  };

  for (const key of riverData.riverSet || []) drawNode(key, 3.1, 0xb9e2ff);
  for (const key of riverData.sourceSet || []) drawNode(key, 4.4, 0xd7f0ff);
  for (const key of riverData.branchSet || []) drawNode(key, 3.9, 0x9ed3ff);
  for (const key of riverData.mouthSet || []) drawNode(key, 3.9, 0x6ab7ff);

  if (showWaterfallEffects.value) {
    riverLayer.lineStyle(6.1, 0xf8fcff, 0.74);
    for (const ek of riverData.waterfallEdgeSet || []) {
      const [a, b] = ek.split("|");
      if (!isVisibleKey(a) || !isVisibleKey(b)) continue;
      const pa = parseCoordKey(a);
      const pb = parseCoordKey(b);
      const ca = hexCenter(pa.x, pa.y);
      const cb = hexCenter(pb.x, pb.y);
      for (const offset of wrapOffsets) {
        if (!shouldDrawWrappedTileCopy(pa.x, pa.y, offset, data.w, data.h)) continue;
        if (!shouldDrawWrappedTileCopy(pb.x, pb.y, offset, data.w, data.h)) continue;
        const ox = offset?.x || 0;
        const oy = offset?.y || 0;
        riverLayer.strokeLineShape(new Phaser.Geom.Line(ca.cx + ox, ca.cy + oy, cb.cx + ox, cb.cy + oy));
      }
    }

    riverLayer.lineStyle(3.4, 0x8bd6ff, 0.95);
    for (const ek of riverData.waterfallEdgeSet || []) {
      const [a, b] = ek.split("|");
      if (!isVisibleKey(a) || !isVisibleKey(b)) continue;
      const pa = parseCoordKey(a);
      const pb = parseCoordKey(b);
      const ca = hexCenter(pa.x, pa.y);
      const cb = hexCenter(pb.x, pb.y);
      for (const offset of wrapOffsets) {
        if (!shouldDrawWrappedTileCopy(pa.x, pa.y, offset, data.w, data.h)) continue;
        if (!shouldDrawWrappedTileCopy(pb.x, pb.y, offset, data.w, data.h)) continue;
        const ox = offset?.x || 0;
        const oy = offset?.y || 0;
        riverLayer.strokeLineShape(new Phaser.Geom.Line(ca.cx + ox, ca.cy + oy, cb.cx + ox, cb.cy + oy));
      }
    }

    for (const key of riverData.waterfallSet || []) {
      drawNode(key, 4.4, 0xf7fbff);
      drawNode(key, 2.4, 0x87d0ff);
    }
  }
}

function drawLavaOverlay(data, visibleKeys = null, wrapOffsets = [{ x: 0, y: 0 }]) {
  if (!lavaLayer) return;
  lavaLayer.clear();
  const flow = data?.lavaFlowData;
  if (!flow) return;
  const isVisibleKey = key => !visibleKeys || visibleKeys.has(key);
  const edgeKeys = Array.isArray(flow.edgeKeys) ? flow.edgeKeys : [];
  const nodeKeys = Array.isArray(flow.nodeKeys) ? flow.nodeKeys : [];
  const sourceKeys = Array.isArray(flow.sourceKeys) ? flow.sourceKeys : [];
  if (!edgeKeys.length && !nodeKeys.length && !sourceKeys.length) return;

  lavaLayer.lineStyle(8.6, 0x7c1e08, 0.78);
  for (const ek of edgeKeys) {
    const [a, b] = String(ek).split("|");
    if (!a || !b) continue;
    if (!isVisibleKey(a) || !isVisibleKey(b)) continue;
    const pa = parseCoordKey(a);
    const pb = parseCoordKey(b);
    const ca = hexCenter(pa.x, pa.y);
    const cb = hexCenter(pb.x, pb.y);
    for (const offset of wrapOffsets) {
      if (!shouldDrawWrappedTileCopy(pa.x, pa.y, offset, data.w, data.h)) continue;
      if (!shouldDrawWrappedTileCopy(pb.x, pb.y, offset, data.w, data.h)) continue;
      const ox = offset?.x || 0;
      const oy = offset?.y || 0;
      lavaLayer.strokeLineShape(new Phaser.Geom.Line(ca.cx + ox, ca.cy + oy, cb.cx + ox, cb.cy + oy));
    }
  }

  lavaLayer.lineStyle(5.1, 0xe2672c, 0.96);
  for (const ek of edgeKeys) {
    const [a, b] = String(ek).split("|");
    if (!a || !b) continue;
    if (!isVisibleKey(a) || !isVisibleKey(b)) continue;
    const pa = parseCoordKey(a);
    const pb = parseCoordKey(b);
    const ca = hexCenter(pa.x, pa.y);
    const cb = hexCenter(pb.x, pb.y);
    for (const offset of wrapOffsets) {
      if (!shouldDrawWrappedTileCopy(pa.x, pa.y, offset, data.w, data.h)) continue;
      if (!shouldDrawWrappedTileCopy(pb.x, pb.y, offset, data.w, data.h)) continue;
      const ox = offset?.x || 0;
      const oy = offset?.y || 0;
      lavaLayer.strokeLineShape(new Phaser.Geom.Line(ca.cx + ox, ca.cy + oy, cb.cx + ox, cb.cy + oy));
    }
  }

  for (const key of nodeKeys) {
    if (!isVisibleKey(key)) continue;
    const p = parseCoordKey(key);
    const c = hexCenter(p.x, p.y);
    for (const offset of wrapOffsets) {
      if (!shouldDrawWrappedTileCopy(p.x, p.y, offset, data.w, data.h)) continue;
      const ox = offset?.x || 0;
      const oy = offset?.y || 0;
      lavaLayer.fillStyle(0xffbc6f, 1);
      lavaLayer.fillCircle(c.cx + ox, c.cy + oy, 3.3);
      lavaLayer.fillStyle(0xd04f1f, 0.95);
      lavaLayer.fillCircle(c.cx + ox, c.cy + oy, 2.1);
    }
  }
  for (const key of sourceKeys) {
    if (!isVisibleKey(key)) continue;
    const p = parseCoordKey(key);
    const c = hexCenter(p.x, p.y);
    for (const offset of wrapOffsets) {
      if (!shouldDrawWrappedTileCopy(p.x, p.y, offset, data.w, data.h)) continue;
      const ox = offset?.x || 0;
      const oy = offset?.y || 0;
      lavaLayer.fillStyle(0xffd598, 0.98);
      lavaLayer.fillCircle(c.cx + ox, c.cy + oy, 4.4);
      lavaLayer.fillStyle(0xe86d30, 0.98);
      lavaLayer.fillCircle(c.cx + ox, c.cy + oy, 2.8);
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
  const viewW = GAME_VIEW_WIDTH;
  const viewH = GAME_VIEW_HEIGHT;
  const normalizedZoomPercent = normalizeZoomPercent(zoomPercent.value, data);
  const wrapEnabled = resolveWorldWrapEnabled(data);

  const camera = scene.cameras.main;
  const prevZoom = Number.isFinite(camera.zoom) && camera.zoom > 0 ? camera.zoom : 1;
  const prevCenter = cameraInitialized
    ? getCameraCenter(camera, viewW, viewH)
    : { x: worldW / 2, y: worldH / 2 };
  if (wrapEnabled) {
    camera.setBounds(-worldW, -worldH, worldW * 3, worldH * 3);
  } else {
    camera.setBounds(0, 0, worldW, worldH);
  }
  const fitZoomWidth = viewW / Math.max(worldW, 1);
  const fitZoomHeight = viewH / Math.max(worldH, 1);
  const baseZoom = Math.min(fitZoomWidth, fitZoomHeight, 1) * 0.96;
  const finalZoom = Math.max(baseZoom * (normalizedZoomPercent / 100), 0.08);
  const zoomChanged = Math.abs(finalZoom - prevZoom) > 0.0001;
  const centerOnZoom = centerMapOnNextZoom;
  const lockCenterAtMinZoom = normalizedZoomPercent <= Math.max(
    resolveMinZoomPercent(data),
    CENTER_LOCK_ZOOM_PERCENT
  );
  camera.setZoom(finalZoom);
  const hasFocusRequest = !!pendingClickFocusWorld;
  if (!cameraInitialized || forceMapCenterOnNextRender || hasFocusRequest || zoomChanged || centerOnZoom || lockCenterAtMinZoom) {
    let targetCenter = { ...prevCenter };
    if (forceMapCenterOnNextRender || centerOnZoom) {
      targetCenter = { x: worldW / 2, y: worldH / 2 };
    }
    if (lockCenterAtMinZoom) {
      // At max zoom-out, always keep the map centered regardless of previous click focus.
      targetCenter = { x: worldW / 2, y: worldH / 2 };
    } else if (pendingClickFocusWorld) {
      targetCenter = wrapEnabled
        ? {
          x: wrapValueNear(pendingClickFocusWorld.x, prevCenter.x, worldW),
          y: wrapValueNear(pendingClickFocusWorld.y, prevCenter.y, worldH)
        }
        : {
          x: pendingClickFocusWorld.x,
          y: pendingClickFocusWorld.y
        };
    }
    if (!wrapEnabled) {
      targetCenter = clampCameraCenter(targetCenter, worldW, worldH, viewW, viewH, finalZoom);
    }
    camera.centerOn(targetCenter.x, targetCenter.y);
    // Keep min-zoom behavior on the same clamp path as normal zoom to avoid abrupt jumps.
    clampCameraScroll(camera, worldW, worldH, viewW, viewH, { forceCenter: false });
  } else {
    // Keep current camera position on simple redraws (e.g. tile click) to prevent unintended camera drift.
    clampCameraScroll(camera, worldW, worldH, viewW, viewH, { forceCenter: false });
  }
  cameraInitialized = true;
  forceMapCenterOnNextRender = false;
  centerMapOnNextZoom = false;
  pendingClickFocusWorld = null;

  baseLayer.clear();
  if (lavaLayer) lavaLayer.clear();
  markerLayer.clear();
  if (hoverLayer) hoverLayer.clear();
  clearLabels();
  hitAreas = [];
  hitAreaMap = new Map();
  rebuildTerritorySets(data);
  rebuildVisibleTiles(data);

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
  const moveContext = (() => {
    if (!unitMoveMode.value || !selectedUnit.value) {
      return { reachableSet: new Set(), startKey: "" };
    }
    const moveGroup = resolveMoveGroupForUnit(selectedUnit.value);
    if (!moveGroup.ok || !moveGroup.leader) {
      return { reachableSet: new Set(), startKey: "" };
    }
    const unit = moveGroup.leader;
    const moveRemaining = Math.max(0, Math.floor(toSafeNumber(moveGroup.minMoveRemaining, 0)));
    return {
      reachableSet: buildReachableTileSet(data, unit.x, unit.y, moveRemaining),
      startKey: coordKey(unit.x, unit.y)
    };
  })();
  const moveBlinkPhase = (clockNowMs.value % 1000) / 1000;
  const moveBlinkAlpha = 0.38 + ((Math.sin(moveBlinkPhase * Math.PI * 2) + 1) * 0.24);
  const boundsAcc = createBoundsAccumulator();

  const wrapOffsets = buildWrapOffsets(data);
  for (const wrapOffset of wrapOffsets) {
    const offX = wrapOffset?.x || 0;
    const offY = wrapOffset?.y || 0;
    const isBase = isBaseWrapOffset(wrapOffset);
    for (let y = 0; y < data.h; y += 1) {
      for (let x = 0; x < data.w; x += 1) {
        if (!shouldDrawWrappedTileCopy(x, y, wrapOffset, data.w, data.h)) continue;
        const tileKey = `${x},${y}`;
        const rawKey = data.grid[y][x];
        const reliefKey = data.reliefMap?.[y]?.[x] || "";
        const strongInfo = data.strongMonsterInfoMap?.[y]?.[x] || null;
        const visual = tileVisual(rawKey, data.shapeOnly);
        const level = data.heightLevelMap?.[y]?.[x];
        const caveScale = data.caveScaleMap?.[y]?.[x] || "";
        const special = specialVisual(data.specialMap?.[y]?.[x], caveScale);
        const tileVisible = isTileVisible(tileKey, data);
        const revealSpecial = tileVisible && !!special && (showSpecialTilesAlways.value || selectedTileKey === tileKey);
        const isWaterfall = !data.shapeOnly && !!data.riverData?.waterfallSet?.has(tileKey);
        const isLava = !data.shapeOnly && !!data.lavaMap?.[y]?.[x];
        const coastType = !data.shapeOnly ? (data.coastTypeMap?.[y]?.[x] || "") : "";
        const isCoastTile = coastType === "direct";
        const basePoints = buildHexPoints(x, y);
        const points = (offX || offY) ? offsetHexPoints(basePoints, offX, offY) : basePoints;
        extendBoundsWithPoints(boundsAcc, points);
        const mixedForestRelief = (
          !data.shapeOnly
          && rawKey === "森"
          && (reliefKey === "丘陵" || reliefKey === "山岳")
        );

        if (!tileVisible) {
          baseLayer.fillStyle(FOG_HIDDEN_FILL, FOG_HIDDEN_ALPHA);
          baseLayer.fillPoints(points, true);
        } else if (mixedForestRelief) {
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
        const owner = tileVisible ? tileOwnerAt(x, y) : "";
        const borderStyle = tileVisible ? borderStyleForOwner(owner) : FOG_HIDDEN_BORDER;
        baseLayer.lineStyle(borderStyle.width, borderStyle.color, borderStyle.alpha);
        baseLayer.strokePoints(points, true);
        if (tileVisible && moveContext.reachableSet.has(tileKey) && tileKey !== moveContext.startKey) {
          baseLayer.lineStyle(2.35, 0x6cff79, moveBlinkAlpha);
          baseLayer.strokePoints(points, true);
        }

        const baseCenter = hexCenter(x, y);
        const center = { cx: baseCenter.cx + offX, cy: baseCenter.cy + offY };
        const symbolShouldDraw = tileVisible && (drawTerrainSymbol || revealSpecial);
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

        if (tileVisible && showWaterfallEffects.value && isWaterfall) {
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

        if (tileVisible && showStrongEnemyMarkers.value && strongInfo) {
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

        if (tileVisible && drawHeightNumber && Number.isFinite(level)) {
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

        if (!isBase) continue;
        const polygon = new Phaser.Geom.Polygon(basePoints);
        const river = !data.shapeOnly && !!data.riverData?.riverSet?.has(tileKey);
        const waterfall = isWaterfall;
        hitAreas.push({
          x,
          y,
          owner,
          terrain: tileVisible ? visual.key : "不明",
          rawTerrain: visual.key,
          fogVisible: tileVisible,
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
        hitAreaMap.set(tileKey, hitAreas[hitAreas.length - 1]);
      }
    }
  }
  renderedHexBounds = finalizeBounds(boundsAcc, worldW, worldH);

  drawRiverOverlay(data, visibleTileKeys, wrapOffsets);
  drawLavaOverlay(data, visibleTileKeys, wrapOffsets);

  const v = villageState.value;
  if (v?.placed && Number.isFinite(v.x) && Number.isFinite(v.y) && isTileVisible(coordKey(v.x, v.y), data)) {
    const baseCenter = hexCenter(v.x, v.y);
    for (const offset of wrapOffsets) {
      if (!shouldDrawWrappedTileCopy(v.x, v.y, offset, data.w, data.h)) continue;
      const ox = offset?.x || 0;
      const oy = offset?.y || 0;
      const center = { cx: baseCenter.cx + ox, cy: baseCenter.cy + oy };
      markerLayer.fillStyle(0xf9e8b6, 0.92);
      markerLayer.fillCircle(center.cx, center.cy, 11.5);
      markerLayer.lineStyle(2.1, 0x6f4a1d, 0.95);
      markerLayer.strokeCircle(center.cx, center.cy, 11.5);
      markerLayer.fillStyle(0x8d6128, 0.2);
      markerLayer.fillCircle(center.cx, center.cy, 6.2);
      const villageLabel = scene.add.text(center.cx, center.cy, "村", {
        fontFamily: "Noto Sans JP, Hiragino Kaku Gothic ProN, Meiryo, sans-serif",
        fontStyle: "700",
        fontSize: "11px",
        color: "#4f3515"
      });
      villageLabel.setOrigin(0.5);
      villageLabel.setStroke("#fff7df", 2);
      labelTexts.push(villageLabel);
    }
  }

  const unitsByTile = new Map();
  for (const unit of unitList.value) {
    if (!Number.isFinite(unit?.x) || !Number.isFinite(unit?.y)) continue;
    if (unit.x < 0 || unit.y < 0 || unit.x >= data.w || unit.y >= data.h) continue;
    const tileKey = coordKey(unit.x, unit.y);
    if (!isTileVisible(tileKey, data)) continue;
    if (!unitsByTile.has(tileKey)) {
      unitsByTile.set(tileKey, []);
    }
    unitsByTile.get(tileKey).push(unit);
  }

  for (const [, members] of unitsByTile.entries()) {
    if (!members.length) continue;
    const lead = members[0];
    const baseCenter = hexCenter(lead.x, lead.y);
    const iconColor = resolveRaceMarkerColor(lead.race);
    const glyph = resolveRaceGlyph(lead.race);
    for (const offset of wrapOffsets) {
      if (!shouldDrawWrappedTileCopy(lead.x, lead.y, offset, data.w, data.h)) continue;
      const ox = offset?.x || 0;
      const oy = offset?.y || 0;
      const center = { cx: baseCenter.cx + ox, cy: baseCenter.cy + oy };
      markerLayer.fillStyle(iconColor, 0.92);
      markerLayer.fillCircle(center.cx - 12.5, center.cy - 11.5, 7.3);
      markerLayer.lineStyle(1.5, 0xe8f3ff, 0.95);
      markerLayer.strokeCircle(center.cx - 12.5, center.cy - 11.5, 7.3);
      const raceGlyphText = scene.add.text(center.cx - 12.5, center.cy - 11.5, glyph, {
        fontFamily: "Noto Sans JP, Hiragino Kaku Gothic ProN, Meiryo, sans-serif",
        fontStyle: "700",
        fontSize: "9px",
        color: "#f8fbff"
      });
      raceGlyphText.setOrigin(0.5);
      raceGlyphText.setStroke("#12202f", 2);
      labelTexts.push(raceGlyphText);

      if (members.length > 1) {
        markerLayer.fillStyle(0x18233b, 0.94);
        markerLayer.fillCircle(center.cx - 2.5, center.cy - 20, 5.5);
        markerLayer.lineStyle(1.2, 0xb9d8ff, 0.95);
        markerLayer.strokeCircle(center.cx - 2.5, center.cy - 20, 5.5);
        const countText = scene.add.text(center.cx - 2.5, center.cy - 20, `${members.length}`, {
          fontFamily: "Noto Sans JP, Hiragino Kaku Gothic ProN, Meiryo, sans-serif",
          fontStyle: "700",
          fontSize: "8px",
          color: "#dbe9ff"
        });
        countText.setOrigin(0.5);
        countText.setStroke("#09111f", 2);
        labelTexts.push(countText);
      }
    }
  }

  for (const unit of unitList.value) {
    if (!isSovereignUnit(unit)) continue;
    if (!Number.isFinite(unit.x) || !Number.isFinite(unit.y) || unit.x < 0 || unit.y < 0) continue;
    if (!isTileVisible(coordKey(unit.x, unit.y), data)) continue;
    const baseCenter = hexCenter(unit.x, unit.y);
    for (const offset of wrapOffsets) {
      if (!shouldDrawWrappedTileCopy(unit.x, unit.y, offset, data.w, data.h)) continue;
      const ox = offset?.x || 0;
      const oy = offset?.y || 0;
      const center = { cx: baseCenter.cx + ox, cy: baseCenter.cy + oy };
      markerLayer.fillStyle(0x1d2b43, 0.95);
      markerLayer.fillCircle(center.cx + 12, center.cy - 12, 8);
      markerLayer.lineStyle(1.6, 0xffe59b, 0.95);
      markerLayer.strokeCircle(center.cx + 12, center.cy - 12, 8);
      const rulerLabel = scene.add.text(center.cx + 12, center.cy - 12, "統", {
        fontFamily: "Noto Sans JP, Hiragino Kaku Gothic ProN, Meiryo, sans-serif",
        fontStyle: "700",
        fontSize: "11px",
        color: "#ffe9ad"
      });
      rulerLabel.setOrigin(0.5);
      rulerLabel.setStroke("#2a1b08", 2);
      labelTexts.push(rulerLabel);
    }
  }

  if (selectedTileKey) {
    const match = hitAreaMap.get(selectedTileKey);
    if (match) {
      for (const offset of wrapOffsets) {
        if (!shouldDrawWrappedTileCopy(match.x, match.y, offset, data.w, data.h)) continue;
        const ox = offset?.x || 0;
        const oy = offset?.y || 0;
        const points = (ox || oy) ? offsetHexPoints(match.polygon.points, ox, oy) : match.polygon.points;
        markerLayer.lineStyle(2.8, 0xffe1a8, 1);
        markerLayer.strokePoints(points, true);
        markerLayer.fillStyle(0xffe1a8, 0.15);
        markerLayer.fillPoints(points, true);
      }
    }
  }
  if (hoveredTileKey && !hitAreaMap.has(hoveredTileKey)) {
    hoveredTileKey = "";
  }
  drawHoverOverlay();
  refreshMapCursor();
}

function drawHoverOverlay() {
  if (!hoverLayer) return;
  hoverLayer.clear();
  if (!hoveredTileKey) return;
  const area = hitAreaMap.get(hoveredTileKey);
  const data = currentData.value;
  if (!area || !data) return;
  const offsets = buildWrapOffsets(currentData.value);
  for (const offset of offsets) {
    if (!shouldDrawWrappedTileCopy(area.x, area.y, offset, data.w, data.h)) continue;
    const ox = offset?.x || 0;
    const oy = offset?.y || 0;
    const points = (ox || oy) ? offsetHexPoints(area.polygon.points, ox, oy) : area.polygon.points;
    hoverLayer.lineStyle(3.2, 0xf8f0b8, 0.98);
    hoverLayer.strokePoints(points, true);
    hoverLayer.fillStyle(0xf8f0b8, 0.1);
    hoverLayer.fillPoints(points, true);
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
  result.data.worldWrapEnabled = !!currentData.value?.worldWrapEnabled;
  applyMapData(result.data, { resetClock: false, rebuildCharacters: false });
  resetAllUnitMoveRemaining();
  pushNationLog("移動残量回復: 全ユニットの移動残を最大まで回復");
  const economyResult = processVillageEconomyTurn(result.data);
  const turn = Number(result.data?.turnState?.turnNumber || 0);
  eventModalMessage.value = formatTurnEventMessage(turn, result.events, mode);
  const baseNotes = formatTurnEventNotes(result.events);
  if (economyResult.applied) {
    eventModalNotes.value = [...baseNotes, "---- 経済処理 ----", ...economyResult.notes];
    for (const line of economyResult.notes) {
      pushNationLog(line);
    }
  } else {
    eventModalNotes.value = [...baseNotes, ...economyResult.notes];
  }
  pushNationLog(`ターン進行: T${turn} / ${eventModeLabel(mode)} / イベント${result.events.length}件`);
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

function openNationLogModal() {
  kickOffBgm();
  audio.playSe("open");
  showNationLogModal.value = true;
}

function openCharacterStatusModalFromMap() {
  kickOffBgm();
  audio.playSe("open");
  emit("open-modal", "characters");
}

function openSkillTreeModalFromMap() {
  kickOffBgm();
  audio.playSe("open");
  emit("open-modal", "skill", { categories: ["魔法", "軍事", "経済", "信仰"] });
}

function openGameStartModalFromMap() {
  kickOffBgm();
  audio.playSe("open");
  emit("open-modal", "game-start");
}

function closeNationLogModal() {
  audio.playSe("cancel");
  showNationLogModal.value = false;
}

function syncSelectedVillageBuildingKey() {
  const available = availableVillageBuildingDefs.value;
  if (!available.length) {
    selectedVillageBuildingKey.value = "";
    return;
  }
  const current = nonEmptyText(selectedVillageBuildingKey.value);
  if (available.some(def => def.key === current)) return;
  selectedVillageBuildingKey.value = available[0].key;
}

function openVillageBuildModal() {
  if (!canOpenVillageBuild.value) {
    updateUnitInfoText("建設不可: 初期村を配置してください。");
    return;
  }
  syncSelectedVillageBuildingKey();
  if (!availableVillageBuildingDefs.value.length) {
    updateUnitInfoText("建設可能な建物がありません（全建設済み）。");
    return;
  }
  kickOffBgm();
  audio.playSe("open");
  showVillageBuildModal.value = true;
}

function closeVillageBuildModal() {
  audio.playSe("cancel");
  showVillageBuildModal.value = false;
}

function applyVillageConstruction() {
  if (!canOpenVillageBuild.value) {
    updateUnitInfoText("建設失敗: 初期村を配置してください。");
    return;
  }
  const village = ensureVillageStateShape(villageState.value, props.selectedRace);
  if (!village) {
    updateUnitInfoText("建設失敗: 村データが不正です。");
    return;
  }
  syncSelectedVillageBuildingKey();
  const definition = selectedVillageBuildingDef.value;
  if (!definition) {
    updateUnitInfoText("建設失敗: 建設可能な建物がありません。");
    return;
  }
  if (!canAffordVillageBuilding(village, definition)) {
    const costText = formatPositiveResourceBag(definition.cost, MATERIAL_RESOURCE_KEYS, MATERIAL_RESOURCE_LABELS);
    updateUnitInfoText(`建設失敗: 資材不足 (必要: ${costText})`);
    return;
  }
  const nextVillage = applyVillageBuildingCost(village, definition);
  if (!nextVillage) {
    updateUnitInfoText("建設失敗: 村データ更新に失敗しました。");
    return;
  }
  villageState.value = nextVillage;
  updateVillageInfoText();
  updateUnitInfoText(`建設完了: ${definition.name} / 補正 ${formatVillageBuildingBonus(definition.bonus)}`);
  pushNationLog(`建設完了: ${definition.name} / コスト ${formatPositiveResourceBag(definition.cost, MATERIAL_RESOURCE_KEYS, MATERIAL_RESOURCE_LABELS)} / 補正 ${formatVillageBuildingBonus(definition.bonus)}`);
  emitCharacterStateChange();
  audio.playSe("confirm");
  showVillageBuildModal.value = false;
}

function openUnitCreateModal() {
  if (!props.gameSetupReady) {
    updateUnitInfoText("ユニット作成はゲーム開始後に可能です。");
    return;
  }
  if (!canCreateMob.value) {
    const cap = mobUnitCap.value;
    const current = mobUnitCount.value;
    updateUnitInfoText(`ユニット作成不可: モブ上限に到達 (${current}/${cap}) または村未配置`);
    return;
  }
  if (!canOpenUnitCreate.value) {
    updateUnitInfoText("ユニット作成には初期村の配置が必要です。");
    return;
  }
  kickOffBgm();
  audio.playSe("open");
  const allowedRaces = unitCreateAllowedRaces.value;
  if (!allowedRaces.length) {
    updateUnitInfoText("ユニット作成不可: 自陣営に所属する種族がありません。");
    return;
  }
  unitCreateBatchCount.value = Math.max(1, Math.min(unitCreateBatchCount.value, mobCreateRemaining.value));
  showUnitCreateCountModal.value = true;
}

function closeUnitCreateCountModal() {
  audio.playSe("cancel");
  showUnitCreateCountModal.value = false;
}

function confirmUnitCreateCount() {
  normalizeUnitCreateBatchCount();
  const allowedRaces = unitCreateAllowedRaces.value;
  if (!allowedRaces.length) {
    updateUnitInfoText("ユニット作成不可: 自陣営に所属する種族がありません。");
    showUnitCreateCountModal.value = false;
    return;
  }
  showUnitCreateCountModal.value = false;
  const preferredRace = nonEmptyText(unitCreateRace.value);
  unitCreateRace.value = allowedRaces.includes(preferredRace)
    ? preferredRace
    : allowedRaces[0];
  unitCreateClass.value = nonEmptyText(props.selectedClass);
  showUnitCreateRaceModal.value = true;
  audio.playSe("confirm");
}

function nudgeUnitCreateBatchCount(delta) {
  const step = Math.floor(toSafeNumber(delta, 0));
  if (!Number.isFinite(step) || step === 0) return;
  const current = Math.floor(toSafeNumber(unitCreateBatchCount.value, 1));
  unitCreateBatchCount.value = current + step;
  normalizeUnitCreateBatchCount();
}

function toggleTestControls() {
  showTestControls.value = !showTestControls.value;
  if (!showTestControls.value) {
    showDevInfo.value = false;
  } else if (isDevBuild) {
    showDevInfo.value = true;
  }
}

function openTurnActionModal() {
  kickOffBgm();
  audio.playSe("open");
  showTurnActionModal.value = true;
}

function closeTurnActionModal() {
  audio.playSe("cancel");
  showTurnActionModal.value = false;
}

function runNextTurnFromClock() {
  showTurnActionModal.value = false;
  runNextTurn({ playSe: false });
}

function openEventControlFromClock() {
  showTurnActionModal.value = false;
  openEventControlModal();
}

function closeUnitCreateRaceModal() {
  audio.playSe("cancel");
  showUnitCreateRaceModal.value = false;
}

function closeUnitCreateClassModal() {
  audio.playSe("cancel");
  showUnitCreateClassModal.value = false;
}

function applyUnitCreateRace(raceKey) {
  const key = nonEmptyText(raceKey);
  if (!key) return;
  if (!unitCreateAllowedRaces.value.includes(key)) {
    updateUnitInfoText("種族選択失敗: 自陣営に所属していない種族は選べません。");
    return;
  }
  unitCreateRace.value = key;
  unitCreateClass.value = "";
  showUnitCreateRaceModal.value = false;
  showUnitCreateClassModal.value = true;
  audio.playSe("change");
}

function applyUnitCreateClass(payload) {
  const className = nonEmptyText(payload?.className);
  if (!className) return;
  unitCreateClass.value = className;
  showUnitCreateClassModal.value = false;
  createUnitFromSelection();
}

function normalizeUnitCreateBatchCount() {
  const raw = Math.floor(toSafeNumber(unitCreateBatchCount.value, 1));
  const maxAllowed = Math.max(1, mobCreateRemaining.value);
  unitCreateBatchCount.value = Math.max(1, Math.min(maxAllowed, raw));
}

function createUnitFromSelection() {
  if (!canCreateMob.value) {
    const cap = mobUnitCap.value;
    const current = mobUnitCount.value;
    updateUnitInfoText(`ユニット作成不可: モブ上限に到達 (${current}/${cap}) または村未配置`);
    return;
  }
  if (!canOpenUnitCreate.value) {
    updateUnitInfoText("ユニット作成には初期村の配置が必要です。");
    return;
  }
  normalizeUnitCreateBatchCount();
  const raceName = nonEmptyText(unitCreateRace.value) || nonEmptyText(props.selectedRace) || "只人";
  if (!unitCreateAllowedRaces.value.includes(raceName)) {
    updateUnitInfoText(`ユニット作成失敗: 種族 ${raceName} は自陣営に所属していません。`);
    return;
  }
  const className = nonEmptyText(unitCreateClass.value) || nonEmptyText(props.selectedClass);
  const classRow = findClassRowByName(className) || randomPick(jobClassRows.value, null);
  if (!classRow) {
    updateUnitInfoText("ユニット作成失敗: クラスデータが見つかりません。");
    return;
  }
  const raceRow = findClassRowByName(resolveRaceBaseClassName(raceName)) || classRows.value[0] || null;
  if (!raceRow) {
    updateUnitInfoText("ユニット作成失敗: 種族データが見つかりません。");
    return;
  }
  const village = ensureVillageStateShape(villageState.value, raceName);
  if (!village || !village.placed) {
    updateUnitInfoText("ユニット作成失敗: 村が未配置です。");
    return;
  }
  const requestedCount = Math.max(1, Math.floor(toSafeNumber(unitCreateBatchCount.value, 1)));
  const availableSlots = Math.max(0, mobCreateRemaining.value);
  if (availableSlots <= 0) {
    updateUnitInfoText(`ユニット作成失敗: モブ上限 ${mobUnitCount.value}/${mobUnitCap.value}`);
    return;
  }
  const createCount = Math.min(requestedCount, availableSlots);
  const cappedByPopulation = requestedCount > createCount;
  const cost = buildUnitCreationCost(createCount);
  if (!canAffordUnitCreation(village, cost)) {
    updateUnitInfoText(`ユニット作成失敗: 資源不足 (必要: 食料 ${formatResourceBag(cost.food, FOOD_RESOURCE_KEYS, FOOD_RESOURCE_LABELS)} / 資材 ${formatResourceBag(cost.material, MATERIAL_RESOURCE_KEYS, MATERIAL_RESOURCE_LABELS)})`);
    return;
  }
  const nextVillage = applyUnitCreationCost(village, cost);
  if (!nextVillage) {
    updateUnitInfoText("ユニット作成失敗: 村データ更新に失敗しました。");
    return;
  }

  const createdUnits = [];
  const namingUnits = [...unitList.value];
  for (let i = 0; i < createCount; i += 1) {
    const unit = createUnitRecord({
      raceRow,
      classRow,
      name: buildAutoUnitName(raceName, className, namingUnits),
      raceLabel: raceName,
      isSovereign: false,
      isNamed: false,
      unitType: "モブ",
      fixedLevel: MOB_INITIAL_LEVEL,
      fixedClassLevels: MOB_INITIAL_CLASS_LEVEL
    });
    unit.x = village.x;
    unit.y = village.y;
    unit.moveRemaining = Math.max(0, Math.floor(toSafeNumber(unit.moveRange, 0)));
    createdUnits.push(unit);
    namingUnits.push(unit);
  }

  unitList.value = [...unitList.value, ...createdUnits];
  villageState.value = nextVillage;
  selectedUnitId.value = createdUnits[0]?.id || selectedUnitId.value;
  updateVillageInfoText();
  const firstName = createdUnits[0]?.name || "-";
  const lastName = createdUnits[createdUnits.length - 1]?.name || "-";
  updateUnitInfoText(`ユニット作成: ${createdUnits.length}体 (${raceName}/${className})${cappedByPopulation ? ` / 上限により ${requestedCount} -> ${createCount}` : ""} / ${firstName}${createdUnits.length > 1 ? ` ... ${lastName}` : ""} / 村座標 (${village.x}, ${village.y})`);
  pushNationLog(`ユニット作成: ${createdUnits.length}体 (${raceName}/${className})${cappedByPopulation ? ` [上限補正 ${requestedCount}->${createCount}]` : ""} / ${firstName}${createdUnits.length > 1 ? `〜${lastName}` : ""} / コスト 食料 ${formatResourceBag(cost.food, FOOD_RESOURCE_KEYS, FOOD_RESOURCE_LABELS)} / 資材 ${formatResourceBag(cost.material, MATERIAL_RESOURCE_KEYS, MATERIAL_RESOURCE_LABELS)} / モブ ${mobUnitCount.value}/${mobUnitCap.value}`);
  emitCharacterStateChange();
  audio.playSe("confirm");
  renderMapWithPhaser();
}

function selectEventActionType(mode) {
  const next = String(mode || "normal");
  if (eventActionType.value === next) return;
  kickOffBgm();
  audio.playSe("change");
  eventActionType.value = next;
}

function applyMapData(data, options = {}) {
  const normalizedData = {
    ...(data || {}),
    worldWrapEnabled: data?.worldWrapEnabled == null
      ? !!customWorldWrapEnabled.value
      : !!data.worldWrapEnabled
  };
  currentData.value = normalizedData;
  zoomPercent.value = normalizeZoomPercent(zoomPercent.value, normalizedData);
  customWorldWrapEnabled.value = !!normalizedData.worldWrapEnabled;
  selectedTileKey = "";
  hoveredTileKey = "";
  selectedTileDetail.value = null;
  showMoveUnitModal.value = false;
  cameraInitialized = false;
  forceMapCenterOnNextRender = options.forceCenterOnInit !== false;
  pendingClickFocusWorld = null;
  dragPointerId = null;
  dragStarted = false;
  if (options.rebuildCharacters !== false) {
    resetVisibilityState();
  }
  if (options.rebuildCharacters !== false) {
    createVillageAndInitialUnit(normalizedData);
  }
  if (options.resetClock !== false) {
    mapClockStartMs.value = Date.now();
    clockNowMs.value = mapClockStartMs.value;
  }
  updateMeta(normalizedData);
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
  data.worldWrapEnabled = !!customWorldWrapEnabled.value;
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
  data.worldWrapEnabled = !!customWorldWrapEnabled.value;
  showEventModal.value = false;
  applyMapData(data, { resetClock: true });
}

function updateMapClickInfo(picked) {
  if (!picked || !currentData.value) {
    mapClickInfo.value = "クリック座標: -";
    selectedTileDetail.value = null;
    return;
  }
  if (!picked.fogVisible) {
    const moveModeText = unitMoveMode.value ? " / 移動モード: ON" : "";
    const placementModeText = villagePlacementMode.value ? " / 配置モード: ON" : "";
    mapClickInfo.value = `クリック座標: (${picked.x}, ${picked.y}) / 地形: 不明(未探索)${moveModeText}${placementModeText}`;
    selectedTileDetail.value = {
      x: picked.x,
      y: picked.y,
      terrain: "不明(未探索)",
      territory: "不明",
      coast: "-",
      relief: "-",
      special: "-",
      river: "-",
      waterfall: "-",
      lava: "-",
      heightLevel: "-",
      heightRaw: "-",
      village: "不明",
      units: "不明"
    };
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
    ? tileUnits.map(unit => {
      const tags = [];
      if (isSovereignUnit(unit)) tags.push("統");
      if (unitHasSquad(unit)) tags.push("隊");
      if (nonEmptyText(unit?.squadLeaderId)) tags.push("員");
      if (isNamedUnit(unit) && !isSovereignUnit(unit)) tags.push("名");
      const tagText = tags.length ? `[${tags.join("")}]` : "";
      return `${unit.name}${tagText}(Lv${unit.level})`;
    }).join(", ")
    : "なし";
  const village = villageState.value?.placed && villageState.value?.x === picked.x && villageState.value?.y === picked.y ? "あり" : "なし";
  const villageDetailText = village === "あり"
    ? `${nonEmptyText(villageState.value?.name) || "村"} / ${villageState.value?.scale || "村"} / 人口${formatCompactNumber(villageState.value?.population)} / 建設:${formatVillageBuildingList(villageState.value?.buildings)}`
    : "なし";
  const owner = picked.owner || tileOwnerAt(picked.x, picked.y);
  const ownerText = owner === "player" ? "自領" : owner === "enemy" ? "敵領" : "未所属";
  const placementModeText = villagePlacementMode.value ? " / 配置モード: ON" : "";
  const moveModeText = unitMoveMode.value ? " / 移動モード: ON" : "";
  selectedTileDetail.value = {
    x: picked.x,
    y: picked.y,
    terrain: picked.terrain,
    territory: ownerText,
    coast,
    relief,
    special,
    river,
    waterfall,
    lava,
    heightLevel: Number.isFinite(heightLevel) ? String(heightLevel) : "-",
    heightRaw: Number.isFinite(heightRaw) ? String(heightRaw) : "-",
    village: villageDetailText,
    units: unitText
  };
  mapClickInfo.value = `クリック座標: (${picked.x}, ${picked.y}) / 地形: ${picked.terrain} / 領土: ${ownerText} / 村: ${village} / 海辺判定: ${coast} / 海接触: ${coastContact} / 地勢: ${relief} / 強敵: ${strong} / 特殊: ${special} / 洞窟規模: ${caveScale}(${caveSize}) / 川: ${river} / 滝: ${waterfall} / 溶岩: ${lava} / 高度Lv: ${Number.isFinite(heightLevel) ? heightLevel : "-"} / 高度Raw: ${Number.isFinite(heightRaw) ? heightRaw : "-"} / ユニット: ${unitText}${moveModeText}${placementModeText}`;
}

function setCanvasCursor(style) {
  if (game?.canvas) {
    game.canvas.style.cursor = style;
  }
}

function refreshMapCursor() {
  if (dragStarted) {
    setCanvasCursor("grabbing");
    return;
  }
  setCanvasCursor(canDragMapAtCurrentZoom() ? "grab" : "default");
}

function updateStageScale() {
  const shell = stageShell.value;
  if (!shell) return;
  const shellWidth = Math.max(1, Math.floor(shell.clientWidth || 0));
  const shellHeight = Math.max(1, Math.floor(shell.clientHeight || 0));
  const fitScale = Math.min(shellWidth / GAME_VIEW_WIDTH, shellHeight / GAME_VIEW_HEIGHT);
  const nextScale = Math.max(0.25, Math.min(2.5, fitScale || 1));
  stageScale.value = Math.round(nextScale * 1000) / 1000;
}

function findHitAreaAtWorld(worldX, worldY) {
  const data = currentData.value;
  if (!data || !Number.isFinite(worldX) || !Number.isFinite(worldY)) return null;
  const findInBase = (baseWorldX, baseWorldY) => {
    const roughY = clampNumber(Math.round((baseWorldY - 24) / 36), 0, data.h - 1);
    for (let y = Math.max(0, roughY - 1); y <= Math.min(data.h - 1, roughY + 1); y += 1) {
      const offsetX = y % 2 === 1 ? 20 : 0;
      const roughX = clampNumber(Math.round((baseWorldX - offsetX - 20) / 40), 0, data.w - 1);
      for (let x = Math.max(0, roughX - 1); x <= Math.min(data.w - 1, roughX + 1); x += 1) {
        const area = hitAreaMap.get(coordKey(x, y));
        if (area && Phaser.Geom.Polygon.Contains(area.polygon, baseWorldX, baseWorldY)) {
          return area;
        }
      }
    }
    return hitAreas.find(area => Phaser.Geom.Polygon.Contains(area.polygon, baseWorldX, baseWorldY)) || null;
  };

  if (!resolveWorldWrapEnabled(data)) {
    return findInBase(worldX, worldY);
  }

  const wrapOffsets = buildWrapOffsets(data);
  for (const offset of wrapOffsets) {
    const localX = worldX - (offset?.x || 0);
    const localY = worldY - (offset?.y || 0);
    const area = findInBase(localX, localY);
    if (!area) continue;
    if (shouldDrawWrappedTileCopy(area.x, area.y, offset, data.w, data.h)) {
      return area;
    }
  }
  return null;
}

function resolvePointerViewPosition(pointer) {
  const fallbackX = Number(pointer?.x);
  const fallbackY = Number(pointer?.y);
  const pointerId = pointer?.id;
  const canvas = game?.canvas;
  const clientX = Number(pointer?.event?.clientX);
  const clientY = Number(pointer?.event?.clientY);
  if (canvas && Number.isFinite(clientX) && Number.isFinite(clientY)) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const resolved = {
        x: ((clientX - rect.left) / rect.width) * GAME_VIEW_WIDTH,
        y: ((clientY - rect.top) / rect.height) * GAME_VIEW_HEIGHT
      };
      if (pointerId !== undefined && pointerId !== null) {
        pointerViewCache.set(pointerId, resolved);
      }
      return resolved;
    }
  }
  if (pointerId !== undefined && pointerId !== null) {
    const cached = pointerViewCache.get(pointerId);
    if (cached && Number.isFinite(cached.x) && Number.isFinite(cached.y)) {
      return { x: cached.x, y: cached.y };
    }
  }
  return {
    x: Number.isFinite(fallbackX) ? fallbackX : 0,
    y: Number.isFinite(fallbackY) ? fallbackY : 0
  };
}

function resolvePointerWorldPosition(pointer) {
  const camera = scene?.cameras?.main;
  if (camera) {
    const view = resolvePointerViewPosition(pointer);
    const world = camera.getWorldPoint(view.x, view.y);
    if (Number.isFinite(world?.x) && Number.isFinite(world?.y)) {
      return { x: world.x, y: world.y };
    }
  }
  return {
    x: Number(pointer?.worldX),
    y: Number(pointer?.worldY)
  };
}

function updateHoveredTileByPointer(pointer) {
  const world = resolvePointerWorldPosition(pointer);
  const picked = findHitAreaAtWorld(world.x, world.y);
  const nextKey = picked ? coordKey(picked.x, picked.y) : "";
  if (nextKey === hoveredTileKey) return;
  hoveredTileKey = nextKey;
  drawHoverOverlay();
}

function resolveUnitMoveRemaining(unit) {
  return Math.max(0, Math.floor(toSafeNumber(unit?.moveRemaining, unit?.moveRange)));
}

function resolveMoveGroupForUnit(unit, options = {}) {
  const allowMemberAsLeader = !!options?.allowMemberAsLeader;
  if (!unit) return { ok: false, reason: "ユニットが見つかりません。" };
  const leaderId = nonEmptyText(unit?.squadLeaderId);
  if (leaderId && !allowMemberAsLeader) {
    return { ok: false, reason: "部隊所属ユニットは単独移動できません。部隊リーダーを選択してください。" };
  }
  if (leaderId && allowMemberAsLeader) {
    const leader = unitList.value.find(row => row?.id === leaderId) || null;
    if (!leader) {
      return { ok: false, reason: "所属部隊のリーダーが見つかりません。" };
    }
    return resolveMoveGroupForUnit(leader, { allowMemberAsLeader: false });
  }

  const participants = [unit];
  if (unitHasSquad(unit)) {
    const memberIds = squadMemberIds(unit);
    for (const memberId of memberIds) {
      const member = unitList.value.find(row => row?.id === memberId) || null;
      if (!member) {
        return { ok: false, reason: "部隊メンバー情報が不足しています。" };
      }
      participants.push(member);
    }
  }

  const leaderX = Number(unit?.x);
  const leaderY = Number(unit?.y);
  if (!Number.isFinite(leaderX) || !Number.isFinite(leaderY) || leaderX < 0 || leaderY < 0) {
    return { ok: false, reason: "ユニット位置が未確定です。" };
  }

  for (const member of participants) {
    const x = Number(member?.x);
    const y = Number(member?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
      return { ok: false, reason: "部隊メンバー位置が未確定です。" };
    }
    if (x !== leaderX || y !== leaderY) {
      return { ok: false, reason: "部隊メンバーが同じ座標に揃っていません。" };
    }
  }

  const minMoveRemaining = participants.reduce((min, row) => Math.min(min, resolveUnitMoveRemaining(row)), Infinity);
  return {
    ok: true,
    leader: unit,
    participants,
    participantIds: participants.map(row => row.id),
    minMoveRemaining: Number.isFinite(minMoveRemaining) ? minMoveRemaining : 0,
    isSquadMove: participants.length > 1
  };
}

function canUseUnitAsMoveCandidate(unit) {
  if (!unit) return false;
  const group = resolveMoveGroupForUnit(unit);
  return group.ok && group.minMoveRemaining > 0;
}

function displayMoveRemainingForCandidate(unit) {
  const group = resolveMoveGroupForUnit(unit);
  if (!group.ok) return resolveUnitMoveRemaining(unit);
  return group.minMoveRemaining;
}

function canUseUnitMoveMode() {
  const data = currentData.value;
  if (!data || data.shapeOnly || villagePlacementMode.value) return false;
  return unitList.value.some(unit => canUseUnitAsMoveCandidate(unit));
}

function movableUnits() {
  return unitList.value.filter(unit => canUseUnitAsMoveCandidate(unit));
}

function openMoveUnitSelectModal() {
  const candidates = movableUnits();
  if (!candidates.length) return;
  const preferred = selectedUnitId.value && candidates.some(unit => unit.id === selectedUnitId.value)
    ? selectedUnitId.value
    : candidates[0].id;
  moveUnitCandidateId.value = preferred;
  showMoveUnitModal.value = true;
}

function closeMoveUnitSelectModal() {
  showMoveUnitModal.value = false;
}

function confirmMoveUnitSelection() {
  const candidates = movableUnits();
  if (!candidates.length) {
    showMoveUnitModal.value = false;
    return;
  }
  const target = candidates.find(unit => unit.id === moveUnitCandidateId.value) || candidates[0];
  selectedUnitId.value = target.id;
  unitMoveMode.value = true;
  showMoveUnitModal.value = false;
  updateUnitInfoText(`${target.name} を移動対象に選択`);
  emitCharacterStateChange();
  renderMapWithPhaser();
}

function toggleUnitMoveMode() {
  if (unitMoveMode.value) {
    unitMoveMode.value = false;
    showMoveUnitModal.value = false;
    mapClickInfo.value = "クリック座標: - / ユニット移動モードを OFF にしました。";
    emitCharacterStateChange();
    renderMapWithPhaser();
    return;
  }
  if (!canUseUnitMoveMode()) return;
  openMoveUnitSelectModal();
}

function moveSelectedUnitToTile(picked) {
  const data = currentData.value;
  const selected = selectedUnit.value;
  if (!data || !selected || !picked) return { moved: false };
  const moveGroup = resolveMoveGroupForUnit(selected);
  if (!moveGroup.ok || !moveGroup.leader) {
    return { moved: false, reason: moveGroup.reason || "移動対象を確定できません。" };
  }
  const unit = moveGroup.leader;
  if (!isPassableTerrain(data.grid[picked.y][picked.x])) {
    return { moved: false, reason: "海/湖には移動できません。" };
  }
  const moveRemaining = Math.max(0, Math.floor(toSafeNumber(moveGroup.minMoveRemaining, 0)));
  if (moveRemaining <= 0) {
    return { moved: false, reason: "移動残量がありません。ターン経過で回復します。" };
  }
  const path = findPathWithinDistance(data, unit.x, unit.y, picked.x, picked.y, moveRemaining);
  if (!path) {
    return { moved: false, reason: `移動残量(${moveRemaining})で到達できません。` };
  }
  const pathDistance = Math.max(0, path.length - 1);
  if (pathDistance <= 0) {
    return { moved: false };
  }
  const maxStepTiles = Math.min(MOVE_STEP_DISTANCE_PER_ACTION, pathDistance);
  let stepIndex = 0;
  let spentCost = 0;
  for (let i = 1; i <= maxStepTiles; i += 1) {
    const prev = path[i - 1];
    const next = path[i];
    if (!prev || !next) break;
    const stepCost = movementStepCost(data, prev.x, prev.y, next.x, next.y);
    if (spentCost + stepCost > moveRemaining) break;
    spentCost += stepCost;
    stepIndex = i;
  }
  if (stepIndex <= 0) {
    return { moved: false, reason: "高度差の影響で移動残量が不足しています。" };
  }
  const stepNode = path[stepIndex] || path[path.length - 1];
  const fromX = unit.x;
  const fromY = unit.y;
  const nextRemaining = Math.max(0, moveRemaining - spentCost);
  const participantIdSet = new Set(moveGroup.participantIds);
  unitList.value = unitList.value.map(row => {
    if (!participantIdSet.has(row.id)) return row;
    const ownRemaining = resolveUnitMoveRemaining(row);
    return {
      ...row,
      x: stepNode.x,
      y: stepNode.y,
      moveRemaining: Math.max(0, ownRemaining - spentCost)
    };
  });
  markPathExplored(path.slice(0, stepIndex + 1));
  const movePrefix = moveGroup.isSquadMove
    ? `部隊移動(${moveGroup.participants.length}体)`
    : "移動";
  updateUnitInfoText(`${movePrefix}: (${fromX}, ${fromY}) -> (${stepNode.x}, ${stepNode.y}) / +${stepIndex}マス / コスト${spentCost} / 残${nextRemaining}`);
  emitCharacterStateChange();
  return {
    moved: true,
    distance: stepIndex,
    remaining: nextRemaining,
    cost: spentCost,
    movedUnitCount: moveGroup.participants.length
  };
}

function resetAllUnitMoveRemaining() {
  if (!unitList.value.length) return;
  unitList.value = unitList.value.map(unit => ({
    ...unit,
    moveRemaining: Math.max(0, Math.floor(toSafeNumber(unit.moveRange, 0)))
  }));
  emitCharacterStateChange();
}

function handleMapTileClick(pointer) {
  const world = resolvePointerWorldPosition(pointer);
  const picked = findHitAreaAtWorld(world.x, world.y);
  if (!picked || !currentData.value) return;
  // Click should not move camera unless explicit focus-on-click is enabled.
  pendingClickFocusWorld = null;
  selectedTileKey = coordKey(picked.x, picked.y);
  if (villagePlacementMode.value) {
    if (!canPlaceVillageOnTile(picked)) {
      updateMapClickInfo(picked);
      mapClickInfo.value += " / 初期村は陸地(海/湖/火山以外)に配置してください。";
      renderMapWithPhaser();
      return;
    }
    placeVillageAt(picked.x, picked.y);
  }
  let moveResult = null;
  if (unitMoveMode.value) {
    moveResult = moveSelectedUnitToTile(picked);
    if (moveResult?.reason) {
      updateUnitInfoText(`移動失敗: ${moveResult.reason}`);
    }
  }
  const tileUnits = unitsAt(picked.x, picked.y);
  if (tileUnits.length) {
    const preferredUnit = tileUnits.find(unit => unit.id === selectedUnitId.value)
      || tileUnits.find(unit => canUseUnitAsMoveCandidate(unit))
      || tileUnits[0];
    selectedUnitId.value = preferredUnit.id;
    updateUnitInfoText(`選択座標 (${picked.x}, ${picked.y})`);
    emitCharacterStateChange();
  }
  if (focusCameraOnTileClick.value) {
    queueCameraFocusAtTile(picked.x, picked.y);
  }
  renderMapWithPhaser();
  const latest = hitAreaMap.get(selectedTileKey);
  if (latest) {
    updateMapClickInfo(latest);
  } else {
    updateMapClickInfo(picked);
  }
  if (moveResult?.moved) {
    mapClickInfo.value += " / 移動成功";
  }
}

function handlePointerDown(pointer) {
  if (!scene || !currentData.value) return;
  dragPointerId = pointer.id;
  dragStarted = false;
  if (!canDragMapAtCurrentZoom()) {
    setCanvasCursor("default");
    return;
  }
  const view = resolvePointerViewPosition(pointer);
  dragStartScreenX = view.x;
  dragStartScreenY = view.y;
  dragStartScrollX = scene.cameras.main.scrollX;
  dragStartScrollY = scene.cameras.main.scrollY;
}

function handlePointerMove(pointer) {
  if (!scene || !currentData.value) return;
  if (pointer.id === dragPointerId && pointer.isDown) {
    if (!canDragMapAtCurrentZoom()) {
      dragStarted = false;
      setCanvasCursor("default");
      return;
    }
    const view = resolvePointerViewPosition(pointer);
    const deltaX = view.x - dragStartScreenX;
    const deltaY = view.y - dragStartScreenY;
    if (!dragStarted && Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD_PX) {
      dragStarted = true;
      setCanvasCursor("grabbing");
    }
    if (dragStarted) {
      const camera = scene.cameras.main;
      camera.scrollX = dragStartScrollX - (deltaX / Math.max(camera.zoom, 0.01));
      camera.scrollY = dragStartScrollY - (deltaY / Math.max(camera.zoom, 0.01));
      const size = mapPixelSize(currentData.value.w, currentData.value.h);
      clampCameraScroll(camera, size.width, size.height, game.scale.width, game.scale.height);
      return;
    }
  }
  updateHoveredTileByPointer(pointer);
}

function resetDragState() {
  dragPointerId = null;
  dragStarted = false;
  refreshMapCursor();
}

function handlePointerUp(pointer) {
  if (!scene || !currentData.value) return;
  if (pointer?.id !== undefined && pointer?.id !== null) {
    pointerViewCache.delete(pointer.id);
  }
  if (pointer.id !== dragPointerId) {
    updateHoveredTileByPointer(pointer);
    return;
  }
  const wasDrag = dragStarted;
  resetDragState();
  if (wasDrag) {
    updateHoveredTileByPointer(pointer);
    return;
  }
  handleMapTileClick(pointer);
}

function handlePointerLeave() {
  hoveredTileKey = "";
  drawHoverOverlay();
  if (dragPointerId !== null) resetDragState();
  pointerViewCache.clear();
}

function handleCanvasWheel(event) {
  if (!scene || !currentData.value) return;
  if (event?.preventDefault) event.preventDefault();
  const direction = Number(event?.deltaY) < 0 ? 1 : -1;
  const nextZoom = normalizeZoomPercent(zoomPercent.value + (direction * 25));
  if (nextZoom === zoomPercent.value) return;
  setZoomPercent(nextZoom);
}

onMounted(async () => {
  await nextTick();
  if (!gameRoot.value || !stageShell.value) return;

  updateStageScale();
  requestAnimationFrame(() => {
    updateStageScale();
  });
  if (typeof ResizeObserver !== "undefined") {
    stageResizeObserver = new ResizeObserver(() => {
      updateStageScale();
    });
    stageResizeObserver.observe(stageShell.value);
  }

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
    if (unitMoveMode.value && currentData.value) {
      renderMapWithPhaser();
    }
  }, 250);

  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: gameRoot.value,
    width: GAME_VIEW_WIDTH,
    height: GAME_VIEW_HEIGHT,
    scale: {
      mode: Phaser.Scale.NONE,
      width: GAME_VIEW_WIDTH,
      height: GAME_VIEW_HEIGHT
    },
    transparent: true,
    scene: {
      create() {
        scene = this;
        baseLayer = this.add.graphics();
        riverLayer = this.add.graphics();
        lavaLayer = this.add.graphics();
        markerLayer = this.add.graphics();
        hoverLayer = this.add.graphics();
        this.input.on("pointerdown", handlePointerDown);
        this.input.on("pointermove", handlePointerMove);
        this.input.on("pointerup", handlePointerUp);
        this.input.on("pointerupoutside", handlePointerUp);
        this.input.on("gameout", handlePointerLeave);
        const canvas = this.game?.canvas;
        if (canvas && !nativeWheelHandler) {
          nativeWheelHandler = event => handleCanvasWheel(event);
          canvas.addEventListener("wheel", nativeWheelHandler, { passive: false });
        }
        refreshMapCursor();
        // generateShapeMap({ playSe: false });
        generateTerrainMap({ playSe: false });
      }
    }
  });

  resizeHandler = () => {
    updateStageScale();
    renderMapWithPhaser();
  };
  window.addEventListener("resize", resizeHandler);
});

onBeforeUnmount(() => {
  if (resizeHandler) window.removeEventListener("resize", resizeHandler);
  if (stageResizeObserver) {
    stageResizeObserver.disconnect();
    stageResizeObserver = null;
  }
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
    if (nativeWheelHandler && game.canvas) {
      game.canvas.removeEventListener("wheel", nativeWheelHandler);
      nativeWheelHandler = null;
    }
    setCanvasCursor("default");
    game.destroy(true);
    game = null;
  }
  lavaLayer = null;
  hoverLayer = null;
  hitAreaMap = new Map();
  hoveredTileKey = "";
  selectedTileKey = "";
  selectedTileDetail.value = null;
  pendingClickFocusWorld = null;
  pointerViewCache.clear();
  resetVisibilityState();
});

watch(showTestControls, visible => {
  emit("test-controls-change", !!visible);
}, { immediate: true });

watch(customWorldWrapEnabled, enabled => {
  if (!currentData.value) return;
  currentData.value = {
    ...currentData.value,
    worldWrapEnabled: !!enabled
  };
  cameraInitialized = false;
  pendingClickFocusWorld = null;
  updateMeta(currentData.value);
  renderMapWithPhaser();
});

watch([showHeightNumbers, heightNumberFontSize, heightNumberOutlineWidth, useHeightShading, showSpecialTilesAlways, showWaterfallEffects, showStrongEnemyMarkers], () => {
  if (currentData.value) {
    mapStats.value = buildStatsText(currentData.value);
  }
  renderMapWithPhaser();
  if (selectedTileKey) {
    const picked = hitAreaMap.get(selectedTileKey);
    if (picked) updateMapClickInfo(picked);
  }
});

watch([currentData, selectedUnitId, villagePlacementMode], () => {
  if (!canUseUnitMoveMode() && unitMoveMode.value) {
    unitMoveMode.value = false;
    renderMapWithPhaser();
  }
});

watch(() => props.gameSetupReady, ready => {
  if (!currentData.value || currentData.value.shapeOnly) return;
  createVillageAndInitialUnit(currentData.value);
  if (ready) {
    mapClickInfo.value = "クリック座標: 初期村の配置先タイルをクリックしてください。";
  }
  renderMapWithPhaser();
});

watch(() => props.selectedCharacterName, nextName => {
  const normalized = nonEmptyText(nextName);
  if (!normalized || !unitList.value.length) return;
  const idx = unitList.value.findIndex(unit => isSovereignUnit(unit));
  if (idx < 0) return;
  if (unitList.value[idx].name === normalized) return;
  unitList.value[idx] = {
    ...unitList.value[idx],
    name: normalized
  };
  ensureNationLogBucket(unitList.value[idx].id, normalized);
  updateUnitInfoText();
  emitCharacterStateChange();
});

watch(() => props.selectedVillageName, nextName => {
  const normalized = nonEmptyText(nextName);
  if (!normalized || !villageState.value) return;
  if (villageState.value.name === normalized) return;
  villageState.value = {
    ...villageState.value,
    name: normalized
  };
  updateVillageInfoText();
  emitCharacterStateChange();
});

watch(() => props.characterCommand, command => {
  const nonce = nonEmptyText(command?.nonce);
  if (!nonce || nonce === lastCharacterCommandNonce) return;
  lastCharacterCommandNonce = nonce;
  applyCharacterCommand(command);
}, { deep: true });
</script>

<template>
  <section class="panel simulator map-top phaser-map-panel">
    <div ref="stageShell" class="phaser-stage-shell">
      <div class="phaser-stage-anchor">
      <div class="phaser-stage" :style="stageScaleStyle">
        <div id="mapGrid" ref="gameRoot" class="phaser-map-canvas">
      <header class="field-overlay-header" :class="{ minimized: headerMinimized }">
        <button type="button" class="overlay-action-btn mini overlay-header-toggle" @click="headerMinimized = !headerMinimized">
          {{ headerMinimized ? "展開" : "最小化" }}
        </button>
        <template v-if="!headerMinimized">
        <div class="field-resource-chip">
          <span>食料</span>
          <strong>{{ fieldResourceSummary.food }}</strong>
          <small>{{ fieldResourceSummary.foodDetail }}</small>
        </div>
        <div class="field-resource-chip">
          <span>資材</span>
          <strong>{{ fieldResourceSummary.material }}</strong>
          <small>{{ fieldResourceSummary.materialDetail }}</small>
        </div>
        <div class="field-resource-chip">
          <span>総人口</span>
          <strong>{{ fieldResourceSummary.population }}</strong>
          <small>{{ fieldResourceSummary.populationDetail }}</small>
        </div>
        <div class="field-overlay-actions">
          <button type="button" class="overlay-action-btn" @click="openCharacterStatusModalFromMap">自キャラ</button>
          <button type="button" class="overlay-action-btn" @click="openSkillTreeModalFromMap">スキルツリー</button>
          <button type="button" class="overlay-action-btn" @click="openNationLogModal">ログ</button>
          <button
            type="button"
            class="overlay-action-btn"
            :disabled="!canUseUnitMoveMode()"
            :aria-pressed="unitMoveMode"
            @click="toggleUnitMoveMode"
          >
            ユニット移動: {{ unitMoveMode ? "ON" : "OFF" }}
          </button>
          <button type="button" class="overlay-action-btn" :disabled="!canCreateMob" @click="openUnitCreateModal">ユニット作成</button>
          <button type="button" class="overlay-action-btn" :disabled="!canOpenVillageBuild" @click="openVillageBuildModal">建設</button>
        </div>
        </template>
      </header>
      <section class="field-overlay-tile-detail">
        <div class="field-overlay-tile-title">選択マス詳細</div>
        <div v-if="selectedTileDetail" class="field-overlay-tile-grid">
          <div><span>座標</span><strong>({{ selectedTileDetail.x }}, {{ selectedTileDetail.y }})</strong></div>
          <div><span>領土</span><strong>{{ selectedTileDetail.territory }}</strong></div>
          <div><span>土地</span><strong>{{ selectedTileDetail.terrain }}</strong></div>
          <div><span>地勢</span><strong>{{ selectedTileDetail.relief }}</strong></div>
          <div><span>海辺</span><strong>{{ selectedTileDetail.coast }}</strong></div>
          <div><span>特殊</span><strong>{{ selectedTileDetail.special }}</strong></div>
          <div><span>川/滝/溶岩</span><strong>{{ selectedTileDetail.river }} / {{ selectedTileDetail.waterfall }} / {{ selectedTileDetail.lava }}</strong></div>
          <div><span>高度</span><strong>Lv {{ selectedTileDetail.heightLevel }} (Raw {{ selectedTileDetail.heightRaw }})</strong></div>
          <div class="wide"><span>町状態</span><strong>{{ selectedTileDetail.village }}</strong></div>
          <div class="wide"><span>ユニット</span><strong>{{ selectedTileDetail.units }}</strong></div>
        </div>
        <div v-else class="field-overlay-tile-empty">マスをクリックすると詳細を表示します。</div>
      </section>
      <div class="field-overlay-bottom-right">
        <button type="button" class="overlay-test-btn" @click="toggleTestControls">
          テスト: {{ showTestControls ? "ON" : "OFF" }}
        </button>
        <div class="field-overlay-clock">
          <button type="button" class="turn-clock-button" :title="`経過 ${elapsedClockText}`" @click="openTurnActionModal">
            <div class="turn-clock-face">
              <span class="turn-clock-mark mark-top"></span>
              <span class="turn-clock-mark mark-right"></span>
              <span class="turn-clock-mark mark-bottom"></span>
              <span class="turn-clock-mark mark-left"></span>
              <div class="turn-clock-hand" :style="{ transform: `translateX(-50%) rotate(${turnClockHandDeg}deg)` }"></div>
              <div class="turn-clock-center"></div>
              <div class="turn-clock-turn">T{{ turnClockTurnNumber }}</div>
            </div>
          </button>
          <div class="turn-clock-caption">次まで {{ turnClockRemainingSeconds }}s</div>
          <div class="turn-clock-caption map-turn-caption">マップT{{ mapTurnNumber }}</div>
        </div>
      </div>
      <aside v-if="showTestControls" class="in-canvas-test-panel">
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
          <button id="gameStartBtn" type="button" class="secondary" @click="openGameStartModalFromMap">ゲーム開始</button>
          <button type="button" class="secondary" @click="openIslandCustomModal">島カスタム設定</button>
          <button type="button" class="secondary" @click="openSettingsModal">設定</button>
          <button v-if="isDevBuild" type="button" class="secondary" @click="showDevInfo = !showDevInfo">
            開発情報: {{ showDevInfo ? "ON" : "OFF" }}
          </button>
          <button id="generateShapeBtn" class="secondary" type="button" @click="generateShapeMap">島形状のみ</button>
          <button id="generateMapBtn" class="secondary" type="button" @click="generateTerrainMap">生成</button>
          <button
            id="placeVillageBtn"
            class="secondary"
            type="button"
            :disabled="!currentData || currentData.shapeOnly"
            @click="startVillagePlacementMode"
          >
            初期村を配置
          </button>
          <button
            id="unitMoveModeBtn"
            class="secondary"
            type="button"
            :disabled="!canUseUnitMoveMode()"
            :aria-pressed="unitMoveMode"
            @click="toggleUnitMoveMode"
          >
            ユニット移動: {{ unitMoveMode ? "ON" : "OFF" }}
          </button>
          <button id="advanceTurnBtn" class="secondary" type="button" @click="runNextTurn">ターン経過</button>
          <button id="eventManagerBtn" class="secondary" type="button" @click="showEventControlModal = true">イベント管理</button>
          <button id="createUnitBtn" class="secondary" type="button" :disabled="!canCreateMob" @click="openUnitCreateModal">ユニット作成</button>
          <button id="villageBuildBtn" class="secondary" type="button" :disabled="!canOpenVillageBuild" @click="openVillageBuildModal">建設</button>
          <button id="nationLogBtn" class="secondary" type="button" @click="openNationLogModal">統治者ログ</button>
          <div class="zoom-controls">
            <button type="button" class="secondary" @click="zoomOut">-</button>
            <button type="button" class="secondary" @click="zoomReset">{{ zoomPercent }}%</button>
            <button type="button" class="secondary" @click="zoomIn">+</button>
          </div>
        </div>
        <section v-if="showDevInfo" class="dev-info-panel in-canvas-dev-info">
          <div class="small dev-info-label">開発モード情報</div>
          <div id="mapClickInfo" class="map-click-info">{{ mapClickInfo }}</div>
          <div class="character-dev-lines">
            <div>{{ villageInfoText }}</div>
            <div>{{ unitRulesInfoText }}</div>
            <div>{{ unitInfoText }}</div>
            <div>{{ lastEconomySummary }}</div>
          </div>
          <div class="small phaser-help">クリックで詳細表示 / ドラッグで移動 / ホイールでカーソル中心に拡大縮小 / ユニット移動ONでクリック移動（緑点滅枠が移動可能範囲、高度変化マスは移動コスト+1）。</div>
          <section class="generation-details">
            <div class="map-meta">
              <div id="mapSizeInfo">{{ mapSizeInfo }}</div>
              <div id="mapCenterInfo">{{ mapCenterInfo }}</div>
              <div id="mapTerrainProfileInfo">{{ mapTerrainProfileInfo }}</div>
            </div>
            <pre id="mapStats" class="phaser-map-stats">{{ mapStats }}</pre>
          </section>
        </section>
        </aside>
      </div>
    </div>
    </div>
    </div>

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

    <generic-modal
      :show="showNationLogModal"
      title="統治者ログ"
      modal-type="message"
      :message="nationLogSummaryText"
      :notes="nationLogNotes"
      close-text="閉じる"
      :wide="true"
      @close="closeNationLogModal"
    />

    <div v-if="showUnitCreateCountModal" class="settings-backdrop" @click.self="closeUnitCreateCountModal">
      <div class="settings-modal unit-create-count-modal">
        <h3>ユニット作成数</h3>
        <div class="small">作成する人数を決めてから、種族とクラスを選択します。</div>
        <div class="unit-create-count-picker">
          <button type="button" class="secondary count-step-btn" :disabled="!canCreateMob" @click="nudgeUnitCreateBatchCount(-1)">-</button>
          <input
            v-model.number="unitCreateBatchCount"
            type="number"
            min="1"
            :max="Math.max(1, mobCreateRemaining)"
            step="1"
            :disabled="!canCreateMob"
            @change="normalizeUnitCreateBatchCount"
          />
          <button type="button" class="secondary count-step-btn" :disabled="!canCreateMob" @click="nudgeUnitCreateBatchCount(1)">+</button>
        </div>
        <div class="small">モブ {{ mobUnitCount }}/{{ mobUnitCap }} (残り {{ mobCreateRemaining }})</div>
        <div class="setting-actions">
          <button type="button" class="secondary" @click="closeUnitCreateCountModal">閉じる</button>
          <button type="button" class="secondary" :disabled="!canCreateMob" @click="confirmUnitCreateCount">次へ</button>
        </div>
      </div>
    </div>

    <race-select-modal
      :show="showUnitCreateRaceModal"
      :selected-race="unitCreateRace || props.selectedRace"
      :allowed-races="unitCreateAllowedRaces"
      @close="closeUnitCreateRaceModal"
      @confirm="applyUnitCreateRace"
    />

    <class-select-modal
      :show="showUnitCreateClassModal"
      :selected-race="unitCreateRace || props.selectedRace"
      :selected-class="unitCreateClass || props.selectedClass"
      @close="closeUnitCreateClassModal"
      @confirm="applyUnitCreateClass"
    />

    <div v-if="showVillageBuildModal" class="settings-backdrop" @click.self="closeVillageBuildModal">
      <div class="settings-modal village-build-modal">
        <h3>村の建設</h3>
        <div class="small build-hint">建設済み: {{ formatVillageBuildingList(villageState?.buildings) }}</div>
        <div v-if="availableVillageBuildingDefs.length" class="village-build-list">
          <button
            v-for="def in availableVillageBuildingDefs"
            :key="`build-${def.key}`"
            type="button"
            class="village-build-item"
            :class="{ active: selectedVillageBuildingDef?.key === def.key }"
            @click="selectedVillageBuildingKey = def.key"
          >
            <div class="move-unit-line">
              <strong>{{ def.name }}</strong>
              <span class="small">未建設</span>
            </div>
            <div class="small">{{ def.description }}</div>
            <div class="small">必要資材: {{ formatPositiveResourceBag(def.cost, MATERIAL_RESOURCE_KEYS, MATERIAL_RESOURCE_LABELS) }}</div>
            <div class="small">毎ターン補正: {{ formatVillageBuildingBonus(def.bonus) }}</div>
          </button>
        </div>
        <div v-else class="small">建設可能な建物はありません（全建設済み）。</div>
        <div v-if="selectedVillageBuildingDef" class="small build-selected-info">
          選択中: {{ selectedVillageBuildingDef.name }} / 必要資材 {{ selectedVillageBuildingCostText }} / 補正 {{ selectedVillageBuildingBonusText }}
        </div>
        <div class="setting-actions">
          <button type="button" class="secondary" @click="closeVillageBuildModal">閉じる</button>
          <button type="button" class="secondary" :disabled="!selectedVillageBuildingDef" @click="applyVillageConstruction">この建物を建設</button>
        </div>
      </div>
    </div>

    <div v-if="showMoveUnitModal" class="settings-backdrop" @click.self="closeMoveUnitSelectModal">
      <div class="settings-modal move-unit-modal">
        <h3>移動ユニット選択</h3>
        <div class="small move-unit-note">移動対象のユニットを選択してください。1回の移動処理は2マスまで進行します。部隊所属ユニットは単独移動できず、部隊リーダーを選択した場合は部隊全員が同時移動します。</div>
        <div class="move-unit-list">
          <button
            v-for="unit in movableUnits()"
            :key="`move-select-${unit.id}`"
            type="button"
            class="move-unit-item"
            :class="{ active: moveUnitCandidateId === unit.id }"
            @click="moveUnitCandidateId = unit.id"
          >
            <div class="move-unit-line">
              <strong>{{ unit.name }}</strong>
              <span>{{ toUnitRoleLabel(unit) }}</span>
            </div>
            <div class="small">
              Lv{{ unit.level }} / 座標({{ unit.x }}, {{ unit.y }}) / 移動残 {{ displayMoveRemainingForCandidate(unit) }} / 索敵 {{ unit.scoutRange }}
            </div>
            <div class="small">部隊: {{ unit.squadCount || 0 }} <span v-if="unitHasSquad(unit)">/ リーダー</span></div>
          </button>
        </div>
        <div class="setting-actions">
          <button type="button" class="secondary" @click="closeMoveUnitSelectModal">閉じる</button>
          <button type="button" class="secondary" @click="confirmMoveUnitSelection">このユニットで移動開始</button>
        </div>
      </div>
    </div>

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

    <div v-if="showTurnActionModal" class="settings-backdrop" @click.self="closeTurnActionModal">
      <div class="settings-modal turn-action-modal">
        <h3>ターン操作</h3>
        <div class="small turn-action-note">時計からターン進行やイベント管理を選択します。</div>
        <div class="setting-actions">
          <button type="button" class="secondary" @click="closeTurnActionModal">閉じる</button>
          <button type="button" class="secondary" @click="openEventControlFromClock">イベント管理を開く</button>
          <button type="button" class="secondary" @click="runNextTurnFromClock">ターン経過</button>
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
        <label class="setting-row">
          <input v-model="customWorldWrapEnabled" type="checkbox" />
          端を反対側へ接続する（ワールドラップ）
        </label>
        <div class="setting-note">
          ON: マップ端でスクロールが止まらず反対側へ折り返します。OFF: 端で止まります。
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
  margin: 0 !important;
  padding: 0 !important;
  border: none !important;
  border-radius: 0 !important;
  background: transparent;
  color: #f8f0d8;
  box-shadow: none;
  font-size: 25px;
  width: 100vw;
  height: 100dvh;
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

.phaser-stage-shell {
  position: relative;
  width: 100%;
  height: 100dvh;
  max-height: none;
  min-height: 0;
  aspect-ratio: auto;
  overflow: hidden;
  display: grid;
  place-items: center;
}

.phaser-stage-anchor {
  position: relative;
  width: 1280px;
  height: 720px;
}

.phaser-stage {
  width: 1280px;
  height: 720px;
  display: block;
}

.phaser-map-canvas {
  position: relative;
  width: 1280px;
  height: 720px;
  border-radius: 10px;
  border: 1px solid rgba(214, 183, 124, 0.4);
  background: radial-gradient(circle at 30% 20%, #1d2835, #0f141f);
  overflow: hidden;
}

.phaser-map-canvas > canvas {
  position: relative;
  z-index: 1;
}

.in-canvas-test-panel {
  position: absolute;
  left: 12px;
  top: 58px;
  z-index: 24;
  width: min(320px, calc(100% - 104px));
  height: 370px;
  max-height: 370px;
  overflow-y: auto;
  overflow-x: hidden;
  border: 1px solid rgba(218, 184, 125, 0.4);
  border-radius: 10px;
  background: linear-gradient(170deg, rgba(18, 13, 10, 0.86), rgba(12, 16, 24, 0.82));
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.36);
  padding: 8px;
}

.map-tools {
  display: grid;
  grid-template-columns: 1fr;
  align-items: stretch;
  gap: 7px;
}

.map-tools > * {
  width: 100%;
}

.map-tools label {
  display: grid;
  gap: 3px;
  font-size: 0.74rem;
  color: #f4e8ca;
}

.map-tools select {
  width: 100%;
  min-height: 30px;
  border: 1px solid rgba(208, 172, 113, 0.6);
  border-radius: 7px;
  background: rgba(255, 249, 236, 0.9);
  color: #2f2517;
  font-size: 0.74rem;
  padding: 4px 6px;
}

.map-tools .secondary {
  width: 100%;
}

.field-overlay-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  border-radius: 0 0 10px 10px;
  border: 1px solid rgba(247, 218, 158, 0.28);
  background: linear-gradient(170deg, rgba(17, 22, 33, 0.32), rgba(22, 15, 10, 0.28));
  backdrop-filter: blur(2px);
  box-shadow: inset 0 0 0 1px rgba(255, 233, 188, 0.08);
  pointer-events: auto;
}

.field-overlay-header.minimized {
  right: auto;
  padding: 4px 6px;
  border-radius: 0 0 8px 0;
}

.overlay-header-toggle {
  flex: 0 0 auto;
}

.field-resource-chip {
  display: grid;
  gap: 2px 8px;
  grid-template-columns: auto auto;
  align-items: center;
  padding: 5px 10px 6px;
  border-radius: 12px;
  border: 1px solid rgba(242, 214, 154, 0.32);
  background: linear-gradient(170deg, rgba(22, 29, 40, 0.34), rgba(23, 16, 11, 0.3));
  backdrop-filter: blur(2px);
  color: #f5e9c6;
  font-size: 0.82rem;
  line-height: 1.1;
}

.field-resource-chip strong {
  justify-self: end;
  font-size: 0.9rem;
  color: #fff3cf;
}

.field-resource-chip small {
  grid-column: 1 / -1;
  color: rgba(245, 234, 201, 0.82);
  font-size: 0.67rem;
  letter-spacing: 0.01em;
}

.field-overlay-tile-detail {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 20;
  width: min(420px, calc(100% - 116px));
  max-height: 220px;
  overflow: auto;
  border: 1px solid rgba(239, 207, 141, 0.42);
  border-radius: 10px;
  background: linear-gradient(170deg, rgba(17, 22, 33, 0.74), rgba(22, 15, 10, 0.7));
  box-shadow: inset 0 0 0 1px rgba(255, 233, 188, 0.08);
  padding: 7px 9px;
  color: #f7ecd0;
}

.field-overlay-tile-title {
  font-size: 0.72rem;
  font-weight: 700;
  margin-bottom: 5px;
  color: #f9e9bc;
}

.field-overlay-tile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 8px;
}

.field-overlay-tile-grid > div {
  display: grid;
  gap: 1px;
}

.field-overlay-tile-grid > div.wide {
  grid-column: 1 / -1;
}

.field-overlay-tile-grid span {
  font-size: 0.62rem;
  color: rgba(241, 228, 193, 0.78);
}

.field-overlay-tile-grid strong {
  font-size: 0.72rem;
  line-height: 1.3;
  color: #fff4d2;
  font-weight: 700;
  word-break: break-word;
}

.field-overlay-tile-empty {
  font-size: 0.74rem;
  color: rgba(243, 228, 193, 0.84);
}

.field-overlay-actions {
  margin-left: auto;
  display: inline-flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.overlay-action-btn {
  border: 1px solid rgba(222, 193, 135, 0.56);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(244, 223, 185, 0.92), rgba(213, 186, 143, 0.9));
  color: #2d2418;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1;
  padding: 5px 8px;
  cursor: pointer;
}

.overlay-action-btn.mini {
  min-width: 26px;
  padding: 4px 6px;
}

.overlay-action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.field-overlay-bottom-right {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 20;
  display: inline-flex;
  align-items: flex-end;
  gap: 8px;
  pointer-events: auto;
}

.field-overlay-clock {
  width: 88px;
  display: grid;
  gap: 5px;
  justify-items: center;
  color: #fff4d2;
  font-family: "Noto Sans JP", "Consolas", monospace;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.5);
}

.turn-clock-button {
  border: none;
  background: transparent;
  padding: 0;
  margin: 0;
  cursor: pointer;
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

.turn-clock-button:hover .turn-clock-face {
  box-shadow:
    inset 0 0 0 1px rgba(255, 233, 188, 0.2),
    0 0 0 1px rgba(255, 233, 188, 0.35);
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

.overlay-test-btn {
  border: 1px solid rgba(220, 190, 132, 0.58);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(245, 225, 189, 0.92), rgba(208, 181, 140, 0.9));
  color: #2d2418;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1;
  padding: 6px 9px;
  cursor: pointer;
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

.in-canvas-dev-info {
  margin-top: 8px;
}

.dev-info-label {
  color: #efd5a0;
  letter-spacing: 0.03em;
  font-weight: 700;
}

.event-control-modal {
  width: min(460px, 100%);
}

.unit-create-count-modal {
  width: min(360px, 100%);
  display: grid;
  gap: 8px;
}

.unit-create-count-picker {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.unit-create-count-picker input {
  width: 96px;
  border: 1px solid rgba(173, 138, 86, 0.7);
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 1rem;
  text-align: center;
}

.count-step-btn {
  min-width: 42px;
}

.turn-action-modal {
  width: min(360px, 100%);
}

.turn-action-note {
  color: #eadab2;
}

.move-unit-modal {
  width: min(520px, 100%);
  display: grid;
  gap: 8px;
}

.move-unit-note {
  color: #eadab2;
}

.move-unit-list {
  display: grid;
  gap: 7px;
  max-height: min(46vh, 360px);
  overflow: auto;
  padding-right: 2px;
}

.move-unit-item {
  border: 1px solid rgba(221, 185, 126, 0.4);
  border-radius: 9px;
  background: linear-gradient(170deg, rgba(24, 17, 12, 0.78), rgba(17, 12, 8, 0.72));
  color: #f3e7c8;
  padding: 8px 9px;
  text-align: left;
  display: grid;
  gap: 3px;
}

.move-unit-item.active {
  border-color: rgba(141, 255, 159, 0.82);
  box-shadow: inset 0 0 0 1px rgba(141, 255, 159, 0.24);
  background: linear-gradient(170deg, rgba(24, 42, 21, 0.84), rgba(14, 28, 13, 0.8));
}

.move-unit-line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: baseline;
}

.village-build-modal {
  width: min(560px, 100%);
  display: grid;
  gap: 8px;
}

.build-hint {
  color: #eadab2;
}

.village-build-list {
  display: grid;
  gap: 7px;
  max-height: min(42vh, 320px);
  overflow: auto;
  padding-right: 2px;
}

.village-build-item {
  border: 1px solid rgba(221, 185, 126, 0.4);
  border-radius: 9px;
  background: linear-gradient(170deg, rgba(24, 17, 12, 0.78), rgba(17, 12, 8, 0.72));
  color: #f3e7c8;
  padding: 8px 9px;
  text-align: left;
  display: grid;
  gap: 3px;
}

.village-build-item.active {
  border-color: rgba(141, 200, 255, 0.88);
  box-shadow: inset 0 0 0 1px rgba(141, 200, 255, 0.24);
  background: linear-gradient(170deg, rgba(17, 35, 52, 0.84), rgba(10, 20, 32, 0.8));
}

.build-selected-info {
  color: #f0dfb7;
  border-top: 1px solid rgba(221, 186, 125, 0.35);
  padding-top: 7px;
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
    left: 0;
    right: 0;
    top: 0;
  }

  .field-overlay-tile-detail {
    width: min(95%, 390px);
    max-height: 190px;
    bottom: 8px;
    left: 8px;
  }

  .field-overlay-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .field-overlay-bottom-right {
    right: 8px;
    bottom: 8px;
    gap: 6px;
  }

  .overlay-test-btn {
    padding: 5px 8px;
    font-size: 0.68rem;
  }
}
</style>
