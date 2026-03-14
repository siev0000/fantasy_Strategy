<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Phaser from "phaser";
import GenericModal from "./GenericModal.vue";
import RaceSelectModal from "./RaceSelectModal.vue";
import ClassSelectModal from "./ClassSelectModal.vue";
import OwnFactionNavigatorModal from "./OwnFactionNavigatorModal.vue";
import { getGameAudioController } from "../lib/audio-player.js";
import { DEFAULT_ICON_NAME, getIconSrcByName, hasIconName, resolveIconName } from "../lib/icon-library.js";
import { createOwnCharacterNavigatorEntries, createOwnSquadNavigatorEntries } from "../lib/own-faction-navigator.js";
import {
  clampCameraCenter as clampCameraCenterUtil,
  clampCameraScroll as clampCameraScrollUtil,
  clampNumber as clampNumberUtil,
  createBoundsAccumulator as createBoundsAccumulatorUtil,
  extendBoundsWithPoints as extendBoundsWithPointsUtil,
  finalizeBounds as finalizeBoundsUtil,
  getCameraCenter as getCameraCenterUtil,
  normalizeZoomPercent as normalizeZoomPercentUtil,
  resolveMinZoomPercent as resolveMinZoomPercentUtil
} from "../composables/mapCameraUtils.js";
import { createMapZoomController } from "../composables/mapZoomController.js";
import {
  buildCharacterStatusFromRules as buildCharacterStatusFromRulesUtil,
  buildUnitResistances as buildUnitResistancesUtil,
  buildUnitSkillLevelsFromRules as buildUnitSkillLevelsFromRulesUtil,
  formatStatusCompact as formatStatusCompactUtil,
  rowStatusVector as rowStatusVectorUtil
} from "../composables/unitStatusUtils.js";
import {
  buildSquadSummaryList as buildSquadSummaryListUtil,
  configureUnitSquadState as configureUnitSquadStateUtil,
  dissolveLeaderSquad as dissolveLeaderSquadUtil,
  isMobUnit as isMobUnitUtil,
  isNamedUnit as isNamedUnitUtil,
  isSovereignUnit as isSovereignUnitUtil,
  normalizeSquadEntries as normalizeSquadEntriesUtil,
  renameLeaderSquad as renameLeaderSquadUtil,
  resolveDefaultSquadName as resolveDefaultSquadNameUtil,
  updateLeaderSquadIcon as updateLeaderSquadIconUtil,
  resolveUnitScoutValue as resolveUnitScoutValueUtil,
  resolveUnitStealthValue as resolveUnitStealthValueUtil,
  squadMemberIds as squadMemberIdsUtil,
  stripRemovedUnitFromSquads as stripRemovedUnitFromSquadsUtil,
  toUnitRoleLabel as toUnitRoleLabelUtil,
  unitHasSquad as unitHasSquadUtil
} from "../composables/unitCoreUtils.js";
import {
  adjustVillagePopulationForTurn as adjustVillagePopulationForTurnUtil,
  createInitialFoodStockByType as createInitialFoodStockByTypeUtil,
  createInitialMaterialStockByType as createInitialMaterialStockByTypeUtil,
  resolveNamedLimit as resolveNamedLimitUtil,
  resolveVillageScaleLabel as resolveVillageScaleLabelUtil
} from "../composables/villageCoreUtils.js";
import {
  addToResourceBag as addToResourceBagUtil,
  applyVillageEconomyTurn as applyVillageEconomyTurnUtil,
  buildEmptyResourceBag as buildEmptyResourceBagUtil,
  buildVillageEconomyTurnReport as buildVillageEconomyTurnReportUtil,
  buildPopulationFoodDemand as buildPopulationFoodDemandUtil,
  buildUnitUpkeepFoodDemand as buildUnitUpkeepFoodDemandUtil,
  collectTerritoryIncome as collectTerritoryIncomeUtil,
  consumeFoodWithSubstitution as consumeFoodWithSubstitutionUtil,
  formatPositiveResourceBag as formatPositiveResourceBagUtil,
  formatResourceBag as formatResourceBagUtil,
  multiplyResourceBag as multiplyResourceBagUtil,
  normalizeResourceBag as normalizeResourceBagUtil,
  splitTotalIntoBag as splitTotalIntoBagUtil,
  sumResourceBag as sumResourceBagUtil
} from "../composables/resourceEconomyUtils.js";
import {
  buildOtherFactionLabel,
  buildTestPlayerLabel,
  DEFAULT_TEST_PLAYER_ID,
  PRIMARY_TEST_PLAYER_LABEL
} from "../lib/test-player-data.js";
import {
  BASE_TERRAIN_KEYS,
  BASE_VILLAGE_SCOUT_RANGE,
  CENTER_LOCK_ZOOM_PERCENT,
  DRAG_THRESHOLD_PX,
  FACTION_BORDER_COLOR_PALETTE,
  FACTION_TERRAIN_ALIAS_MAP,
  FOG_HIDDEN_ALPHA,
  FOG_HIDDEN_ALPHA_TEST,
  FOG_HIDDEN_BORDER,
  FOG_HIDDEN_FILL,
  GAME_START_PLAYER_PLACEMENT_MODE_ALL_RANDOM,
  GAME_START_PLAYER_PLACEMENT_MODE_PLAYER_CHOOSE,
  GAME_START_PLAYER_PLACEMENT_MODE_PLAYER_RANDOM_ONLY,
  GAME_START_PLAYER_PLACEMENT_MODE_VALUES,
  GAME_VIEW_HEIGHT,
  GAME_VIEW_WIDTH,
  HEADER_RESOURCE_ICON_LAYOUT_SIZE_PX,
  HEADER_RESOURCE_ICON_SCALE,
  HEADER_RESOURCE_ICON_VISUAL_SIZE_PX,
  MAP_ENEMY_MARKER_CONFIG,
  MAP_FACTION_MARKER_CONFIG,
  MAP_SPECIAL_ICON_CONFIG,
  MAP_UNIT_MARKER_CONFIG,
  MAP_WATERFALL_ICON_CONFIG,
  MAX_TEST_PLAYER_COUNT,
  PLAYER_TERRITORY_RANGE,
  SPECIAL_TERRAIN_KEYS,
  TILE_BORDER_DEFAULT,
  TILE_BORDER_ENEMY,
  TILE_BORDER_FACTION_ALPHA,
  TILE_BORDER_FACTION_WIDTH,
  TILE_BORDER_PLAYER,
  WRAP_DRAG_VIEW_RANGE_MULTIPLIER_X,
  WRAP_DRAG_VIEW_RANGE_MULTIPLIER_Y,
  WRAP_RING_TILE_MARGIN
} from "../lib/phaser-map-panel-config.js";
import {
  advanceTerrainTurn,
  createIslandShapeData,
  createTerrainMapData,
  hexCenter,
  parseCoordKey,
  terrainDefinitions
} from "../lib/map-generator.js";
import classDb from "../../../data/source/export/json/クラス.json";
import enemySpawnDb from "../../../data/source/export/json/出現敵.json";
import equipmentDb from "../../../data/source/export/json/装備.json";
import factionDb from "../../../data/source/export/json/勢力.json";
import terrainYieldDb from "../../../data/source/export/json/地形.json";

const props = defineProps({
  selectedRace: { type: String, default: "" },
  selectedClass: { type: String, default: "" },
  selectedCharacterName: { type: String, default: "" },
  selectedVillageName: { type: String, default: "" },
  gameSetupReady: { type: Boolean, default: false },
  gameSetupProgressText: { type: String, default: "" },
  characterCommand: { type: Object, default: null }
});
const emit = defineEmits(["character-state-change", "open-modal", "test-controls-change", "save-snapshot"]);

// マップ生成/表示の基本設定
const mapSize = ref("36x36"); // 生成時のマップサイズ
const patternId = ref("realistic"); // 島形状プリセット
const mountainMode = ref("random"); // 山岳生成モード
const showIslandCustomModal = ref(false); // 島カスタム設定モーダル表示
const useIslandCustomSettings = ref(false); // 島カスタム設定ON/OFF
const customLargeIslandCount = ref(2); // 大島の数
const customIsletCountMin = ref(1); // 孤島数(最小)
const customIsletCountMax = ref(4); // 孤島数(最大)
const customTargetLandPercent = ref(50); // 目標陸地率(%)
const customLargeIslandMinGap = ref(6); // 大島同士の最小距離
const customWorldWrapEnabled = ref(true); // ワールドラップON/OFF
const showHeightNumbers = ref(false); // 高度Lvの数字表示
const heightNumberFontSize = ref(23); // 高度Lv文字サイズ
const heightNumberOutlineWidth = ref(3); // 高度Lv文字の枠線太さ
const useHeightShading = ref(true); // 高度による色補正
const useFiveResourceMode = ref(false); // 資源を5分類表示するか
const materialHeaderExpanded = ref(false); // 資材ヘッダーの詳細表示ON/OFF
const showSpecialTilesAlways = ref(true); // 隠し特殊地形の常時表示
const showWaterfallEffects = ref(true); // 滝エフェクト表示
const showStrongEnemyMarkers = ref(false); // 強敵候補表示
const focusCameraOnTileClick = ref(false); // クリック時カメラフォーカス
const showSettingsModal = ref(false); // 表示設定モーダル表示
const showQuickSettingsModal = ref(false); // 右上設定メニュー表示
const saveExportInProgress = ref(false); // セーブ出力中フラグ
const saveLoadInProgress = ref(false); // セーブ読込中フラグ
const saveLoadInput = ref(null); // セーブ読込用input
const showEventControlModal = ref(false); // イベント管理モーダル表示
const eventActionType = ref("normal"); // イベント実行モード
const showEventModal = ref(false); // イベント結果モーダル表示
const eventModalMessage = ref(""); // イベント結果メッセージ
const eventModalNotes = ref([]); // イベント結果詳細行
const showNationLogModal = ref(false); // 統治者ログモーダル表示
const showPinnedNationLogPanel = ref(false); // 右側ログ固定表示ON/OFF
const showVillageBuildModal = ref(false); // 建設/都市能力モーダル表示
const selectedVillageBuildingKey = ref("");
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
const showTestControls = ref(false);
const testPlayerSlots = ref([]); // テスト用プレイヤー勢力スロット
const activeTestPlayerId = ref(DEFAULT_TEST_PLAYER_ID); // 現在操作中プレイヤーID
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
const QUICK_SETTINGS_ICON_SRC = getIconSrcByName("設定", DEFAULT_ICON_NAME);

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
let clockIntervalId = null;
let firstGestureHandler = null;
let nativeWheelHandler = null;
let cameraInitialized = false;
let pendingClickFocusWorld = null;
let pendingClickFocusMode = "near";
let centerMapOnNextZoom = false;
let dragPointerId = null;
let dragStarted = false;
let dragStartScreenX = 0;
let dragStartScreenY = 0;
let dragStartScrollX = 0;
let dragStartScrollY = 0;
let pointerViewCache = new Map();
let touchPointerViewMap = new Map();
let pinchActive = false;
let pinchStartDistance = 0;
let suppressTouchTapUntilRelease = false;
let forceMapCenterOnNextRender = true;
let territorySets = { player: new Set(), enemy: new Set() };
let territoryOwnerByTile = new Map();
let exploredTileKeys = new Set();
let visibleTileKeys = new Set();
let spottedEnemyTileKeys = new Set();
let spottedFactionTileKeys = new Set();
let raceMarkerTexturePending = new Set();
let lastCharacterCommandNonce = "";
let renderedHexBounds = null;
let applyingTestPlayerState = false;

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
    const materialBag = normalizeMaterialStockBag(village.materialStockByType);
    const populationByRace = village.populationByRace || {};
    const populationDetail = Object.entries(populationByRace)
      .map(([race, count]) => `${nonEmptyText(race)}${Math.max(0, Math.floor(toSafeNumber(count, 0)))}`)
      .filter(Boolean)
      .slice(0, 4)
      .join(" / ");
    return {
      food: formatCompactNumber(sumFoodForDisplay(foodBag)),
      material: formatCompactNumber(sumMaterialForDisplay(materialBag)),
      population: formatCompactNumber(village.population),
      foodEntries: buildFoodSummaryEntries(foodBag),
      materialEntries: buildMaterialSummaryEntries(materialBag),
      materialCollapsedEntries: buildMaterialCollapsedEntries(materialBag),
      materialGroups: buildMaterialHeaderGroupEntries(materialBag),
      populationDetail
    };
  }

  const data = currentData.value;
  if (!data?.grid || !Number.isFinite(data.w) || !Number.isFinite(data.h)) {
    return {
      food: "-",
      material: "-",
      population: "-",
      foodEntries: [],
      materialEntries: [],
      materialCollapsedEntries: [],
      materialGroups: [],
      populationDetail: ""
    };
  }
  const summary = buildMapPotentialResourceSummary(data);
  return {
    food: formatCompactNumber(sumFoodForDisplay(summary.food)),
    material: formatCompactNumber(sumMaterialForDisplay(summary.material)),
    population: "-",
    foodEntries: buildFoodSummaryEntries(summary.food),
    materialEntries: buildMaterialSummaryEntries(summary.material),
    materialCollapsedEntries: buildMaterialCollapsedEntries(summary.material),
    materialGroups: buildMaterialHeaderGroupEntries(summary.material),
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

const activeTestPlayerSlot = computed(() => {
  const id = nonEmptyText(activeTestPlayerId.value);
  if (!id) return testPlayerSlots.value[0] || null;
  return testPlayerSlots.value.find(slot => nonEmptyText(slot?.id) === id) || testPlayerSlots.value[0] || null;
});

const isTestMultiplayerActive = computed(() => testPlayerSlots.value.length > 1);

const testPlayersReadyCount = computed(() => {
  return testPlayerSlots.value.reduce((sum, slot) => (slot?.ready ? sum + 1 : sum), 0);
});

const testPlayersReadyLabel = computed(() => {
  const total = testPlayerSlots.value.length;
  if (total <= 1) return "1人プレイ";
  return `${testPlayersReadyCount.value}/${total} がターン終了`;
});

const activeTestPlayerReady = computed(() => !!activeTestPlayerSlot.value?.ready);

const factionBorderStyleMap = computed(() => {
  const out = new Map();
  const slots = Array.isArray(testPlayerSlots.value) ? testPlayerSlots.value : [];
  for (let i = 0; i < slots.length; i += 1) {
    const slotId = nonEmptyText(slots[i]?.id);
    if (!slotId) continue;
    const color = FACTION_BORDER_COLOR_PALETTE[i % FACTION_BORDER_COLOR_PALETTE.length];
    out.set(slotId, {
      width: TILE_BORDER_FACTION_WIDTH,
      color,
      alpha: TILE_BORDER_FACTION_ALPHA
    });
  }
  return out;
});

const mapCanvasStyle = computed(() => ({
  "--header-resource-icon-layout-size": `${HEADER_RESOURCE_ICON_LAYOUT_SIZE_PX}px`,
  "--header-resource-icon-scale": String(HEADER_RESOURCE_ICON_SCALE)
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

const ownSquadNavigatorEntries = computed(() => {
  const byId = new Map(unitList.value.map(unit => [nonEmptyText(unit?.id), unit]).filter(row => row[0]));
  return createOwnSquadNavigatorEntries({
    squadSummaries: buildSquadSummaryList(unitList.value).map(summary => ({
      ...summary,
      x: summary?.leaderPos?.x,
      y: summary?.leaderPos?.y
    })),
    unitByIdMap: byId,
    moveUnitIconSrc,
    moveUnitIconGlyph
  });
});

const ownCharacterNavigatorEntries = computed(() => {
  return createOwnCharacterNavigatorEntries({
    unitList: unitList.value,
    isSovereignUnit,
    isNamedUnit,
    toUnitRoleLabel,
    moveUnitIconSrc,
    moveUnitIconGlyph
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
    key: "useFiveResourceMode",
    kind: "checkbox",
    label: "資源を5分類表示にする（食料/木材/鉄/金/魂）",
    value: useFiveResourceMode.value
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
  "魔術",
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
const NAMED_POOL = ["アレス", "リリア", "ガルド", "セレス", "ノクス", "フレア", "ヴェルク", "イリス"];
const VILLAGE_NAME_POOL = ["開拓村アスタ", "辺境村ノルド", "河畔村エイル", "森縁村リグナ", "丘陵村ブラム"];
const INITIAL_LEVEL_MIN = 5;
const INITIAL_LEVEL_MAX = 10;
const MOB_INITIAL_LEVEL = 5;
const INITIAL_RACE_LEVEL_OFFSET = 5;
const STATUS_GROWTH_DIVISOR = 10;
const ENEMY_LEVEL_BASE = 5;
const ENEMY_LEVEL_PER_HEIGHT = 5;
const ENEMY_LEVEL_JITTER_MIN = -5;
const ENEMY_LEVEL_JITTER_MAX = 5;
const ENEMY_STRONG_HEIGHT_BONUS = 0;
const ENEMY_LEVEL_MAX = 120;
const ENEMY_STRONG_LEADER_LEVEL_BONUS = 5;
const ENEMY_STRONG_NO_ARMAMENT_LEVEL_BONUS = 2;
const ENEMY_STRONG_FOLLOWER_LEVEL_SCALE = 0.8;
const ENEMY_STRONG_FOLLOWER_MIN = 2;
const ENEMY_STRONG_FOLLOWER_MAX = 5;
const ENEMY_STRONG_EQUIPMENT_TIER = "rare";
const ENEMY_EQUIPMENT_FIELDS = ["武器", "副武器", "胴", "頭", "足", "装飾1", "装飾2"];
const ENCOUNTER_ATTACK_BASE_CHANCE = 0.45;
const ENCOUNTER_ATTACK_DIFF_FACTOR = 0.03;
const ENCOUNTER_ATTACK_MIN_CHANCE = 0.2;
const ENCOUNTER_ATTACK_MAX_CHANCE = 0.9;
const ENCOUNTER_FUMBLE_CHANCE = 0.08;
const ENCOUNTER_MAX_LOG_LINES = 12;
const ENCOUNTER_SCOUT_DISTANCE_DECAY_PER_TILE = 50;
const UNIT_VISION_BASE_RANGE = 1;
const UNIT_VISION_SCOUT_STEP = 75;
const NAMED_STATUS_SKILL_BONUS_MULTIPLIER = 1.15;
const INITIAL_MOB_UNIT_COUNT_MIN = 2;
const INITIAL_MOB_UNIT_COUNT_MAX = 4;
const MOB_NAME_POOL = ["見習い兵", "巡回兵", "猟兵", "衛兵", "斥候"];
const CITY_SCALE_NAMED_LIMIT = {
  村: 2,
  町: 4,
  都市: 7,
  大都市: 10
};
const MAX_SQUAD_MEMBER_COUNT = 5;
const CITY_ABILITY_KEYS = ["鍛冶場", "魔法", "信仰", "軍事", "経済"];
const CITY_ABILITY_ACTIVE_CAP = 4;
const CITY_ABILITY_DEFINED_CAP = 7;
const CITY_ABILITY_GROWTH_COST = {
  鍛冶場: {
    2: { 木材: 20, 石材: 20, 鉄: 12 },
    3: { 木材: 30, 石材: 26, 鉄: 20, 銀鉄: 6 },
    4: { 木材: 44, 石材: 34, 鉄: 28, 銀鉄: 12, 青金鋼: 4, 赤黒鋼: 2 }
  },
  魔法: {
    2: { 木材: 12, 石材: 18, 鉄: 8, 銀: 8, 宝石: 2 },
    3: { 木材: 20, 石材: 26, 鉄: 12, 銀: 14, 金: 6, 宝石: 4 },
    4: { 木材: 28, 石材: 36, 鉄: 18, 銀: 22, 金: 12, 宝石: 8 }
  },
  信仰: {
    2: { 木材: 10, 石材: 20, 鉄: 8, 銀: 8 },
    3: { 木材: 16, 石材: 30, 鉄: 12, 銀: 14, 金: 8, 宝石: 2 },
    4: { 木材: 24, 石材: 42, 鉄: 18, 銀: 20, 金: 14, 宝石: 6 }
  },
  軍事: {
    2: { 木材: 26, 石材: 20, 鉄: 14 },
    3: { 木材: 38, 石材: 30, 鉄: 22, 銀鉄: 8 },
    4: { 木材: 52, 石材: 40, 鉄: 30, 銀鉄: 14, 青金鋼: 4 }
  },
  経済: {
    2: { 木材: 22, 石材: 16, 鉄: 8, 銀: 6 },
    3: { 木材: 32, 石材: 24, 鉄: 14, 銀: 10, 金: 4 },
    4: { 木材: 44, 石材: 30, 鉄: 20, 銀: 16, 金: 8, 宝石: 2 }
  }
};
const ECONOMY_GAIN_MULTIPLIER_BY_LEVEL = {
  1: 1.0,
  2: 1.15,
  3: 1.3,
  4: 1.5
};
const EQUIPMENT_LEVEL_BY_RARITY = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5
};
const EQUIPMENT_CRAFT_MATERIAL_COST_BY_LEVEL = {
  1: { 木材: 10, 黒木: 0, 特木: 0, 鉄: 10, 銀鉄: 0, 青金鋼: 0, 赤黒鋼: 0 },
  2: { 木材: 20, 黒木: 0, 特木: 0, 鉄: 20, 銀鉄: 0, 青金鋼: 0, 赤黒鋼: 0 },
  3: { 木材: 10, 黒木: 10, 特木: 0, 鉄: 10, 銀鉄: 10, 青金鋼: 0, 赤黒鋼: 0 },
  4: { 木材: 10, 黒木: 20, 特木: 10, 鉄: 10, 銀鉄: 20, 青金鋼: 5, 赤黒鋼: 5 }
};
const EQUIPMENT_CRAFT_MAGIC_FAITH_COST_BY_LEVEL = {
  1: { 金: 5, 銀: 10, 宝石: 0 },
  2: { 金: 10, 銀: 20, 宝石: 5 },
  3: { 金: 20, 銀: 40, 宝石: 10 },
  4: { 金: 40, 銀: 80, 宝石: 20 }
};
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
const FOOD_RESOURCE_KEYS = ["穀物", "野菜", "肉", "魚", "死体", "魂"];
const FOOD_RESOURCE_SIMPLE_KEYS = ["食料", "魂"];
const MATERIAL_RESOURCE_KEYS = ["木材", "黒木", "特木", "石材", "鉄", "銀鉄", "青金鋼", "赤黒鋼", "金", "銀", "宝石"];
const MATERIAL_RESOURCE_LEGACY_KEYS = ["木材", "石材", "鉄"];
const MATERIAL_RESOURCE_SIMPLE_KEYS = ["木材", "鉄", "金"];
const MATERIAL_RESOURCE_SOURCE_KEYS = ["木材", "黒木", "特木", "石材", "鉄", "銀鉄", "青金鋼", "赤黒鋼", "金", "銀", "宝石"];
const MATERIAL_SOURCE_TO_RESOURCE_MAP = {
  木材: "木材",
  黒木: "黒木",
  特木: "特木",
  石材: "石材",
  鉄: "鉄",
  銀鉄: "銀鉄",
  青金鋼: "青金鋼",
  赤黒鋼: "赤黒鋼",
  金: "金",
  銀: "銀",
  宝石: "宝石"
};
const FOOD_RESOURCE_LABELS = { 穀物: "穀", 野菜: "野", 肉: "肉", 魚: "魚", 死体: "死", 魂: "魂" };
const FOOD_RESOURCE_SIMPLE_LABELS = { 食料: "食", 魂: "魂" };
const MATERIAL_RESOURCE_LABELS = { 木材: "木", 黒木: "黒", 特木: "特", 石材: "石", 鉄: "鉄", 銀鉄: "銀鉄", 青金鋼: "青鋼", 赤黒鋼: "赤鋼", 金: "金", 銀: "銀", 宝石: "宝" };
const MATERIAL_RESOURCE_SIMPLE_LABELS = { 木材: "木", 鉄: "鉄", 金: "金" };
const FOOD_RESOURCE_SIMPLE_WEIGHT_MAP = {
  食料: { 穀物: 1, 野菜: 1, 肉: 1, 魚: 1 },
  魂: { 死体: 1, 魂: 2 }
};
const MATERIAL_RESOURCE_SIMPLE_WEIGHT_MAP = {
  木材: { 木材: 1, 黒木: 2, 特木: 4 },
  鉄: { 鉄: 1, 銀鉄: 2, 青金鋼: 4, 赤黒鋼: 4 },
  金: { 金: 2, 銀: 1, 宝石: 2 }
};
const MATERIAL_HEADER_GROUP_DEFS = [
  { label: "木材", keys: ["木材", "黒木", "特木", "石材"] },
  { label: "金属", keys: ["鉄", "銀鉄", "青金鋼", "赤黒鋼"] },
  { label: "貴金属", keys: ["金", "銀", "宝石"] }
];
const MATERIAL_HEADER_GROUP_SIMPLE_DEFS = [
  { label: "木材", key: "木材" },
  { label: "鉄", key: "鉄" },
  { label: "金", key: "金" }
];
const RESOURCE_ICON_NAME_MAP = {
  食料: "穀物",
  死体: "アンデット"
};
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
const ECONOMY_GAIN_SCALE = 0.1;
const ECONOMY_CONSUMPTION_SCALE = 0.1;
const ECONOMY_COST_SCALE = 0.1;
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

function parseEnemySpawnCountRange(raw) {
  const text = nonEmptyText(raw);
  if (!text) return { min: 1, max: 1, explicit: false };
  const numeric = Number(text);
  if (Number.isFinite(numeric)) {
    const value = Math.max(1, Math.floor(numeric));
    return { min: value, max: value, explicit: true };
  }
  const rangeMatch = text.match(/(\d+)\s*[~〜\-]\s*(\d+)/);
  if (rangeMatch) {
    const a = Math.max(1, Math.floor(Number(rangeMatch[1])));
    const b = Math.max(1, Math.floor(Number(rangeMatch[2])));
    return {
      min: Math.min(a, b),
      max: Math.max(a, b),
      explicit: true
    };
  }
  const singleMatch = text.match(/(\d+)/);
  if (singleMatch) {
    const value = Math.max(1, Math.floor(Number(singleMatch[1])));
    return { min: value, max: value, explicit: true };
  }
  return { min: 1, max: 1, explicit: false };
}

const enemySpawnRows = computed(() => {
  if (!Array.isArray(enemySpawnDb)) return [];
  const rows = [];
  for (const raw of enemySpawnDb) {
    const terrainKey = nonEmptyText(raw?.出現地形);
    const raceName = nonEmptyText(raw?.種族);
    const check = nonEmptyText(raw?.チェック用);
    if (!terrainKey || !raceName || !check.includes("○")) continue;
    const lvMinRaw = Number(raw?.Lv_Min);
    const lvMaxRaw = Number(raw?.Lv_Max);
    if (!Number.isFinite(lvMinRaw) || !Number.isFinite(lvMaxRaw)) continue;
    const lvMin = Math.max(1, Math.floor(Math.min(lvMinRaw, lvMaxRaw)));
    const lvMax = Math.max(lvMin, Math.floor(Math.max(lvMinRaw, lvMaxRaw)));
    const className = nonEmptyText(raw?.サブクラス);
    const spawnCount = parseEnemySpawnCountRange(raw?.出現数);
    const armamentNames = ENEMY_EQUIPMENT_FIELDS
      .map(key => nonEmptyText(raw?.[key]))
      .filter(value => value && value !== "0");
    rows.push({
      terrainKey,
      raceName,
      className: className && className !== "0" ? className : "",
      displayName: nonEmptyText(raw?.種族名) || raceName,
      lvMin,
      lvMax,
      spawnCountMin: spawnCount.min,
      spawnCountMax: spawnCount.max,
      spawnCountExplicit: !!spawnCount.explicit,
      armamentNames,
      hasArmament: armamentNames.length > 0,
      check
    });
  }
  return rows;
});

const enemySpawnRulesByTerrain = computed(() => {
  const map = new Map();
  for (const row of enemySpawnRows.value) {
    if (!map.has(row.terrainKey)) map.set(row.terrainKey, []);
    map.get(row.terrainKey).push(row);
  }
  return map;
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

const cityAbilityRows = computed(() => {
  const village = ensureVillageStateShape(villageState.value, props.selectedRace);
  return CITY_ABILITY_KEYS.map(key => {
    const level = resolveVillageAbilityLevel(village, key, CITY_ABILITY_DEFINED_CAP);
    const cappedLevel = Math.min(level, CITY_ABILITY_ACTIVE_CAP);
    const nextLevel = Math.min(CITY_ABILITY_ACTIVE_CAP, cappedLevel + 1);
    const atCap = cappedLevel >= CITY_ABILITY_ACTIVE_CAP;
    const cost = atCap
      ? buildEmptyResourceBag(MATERIAL_RESOURCE_KEYS)
      : resolveCityAbilityUpgradeCost(key, nextLevel);
    const canUpgrade = !atCap && canAffordCityAbilityUpgrade(village, key);
    return {
      key,
      level: cappedLevel,
      nextLevel,
      atCap,
      cost,
      costText: atCap ? "上限到達" : formatMaterialPositiveResourceBag(cost),
      canUpgrade
    };
  });
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
  return formatMaterialPositiveResourceBag(def.cost);
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
  return isSovereignUnitUtil(unit);
}

function isNamedUnit(unit) {
  return isNamedUnitUtil(unit, { nonEmptyText });
}

function isMobUnit(unit) {
  return isMobUnitUtil(unit, { nonEmptyText });
}

function normalizeSquadEntries(entries, leaderId = "") {
  return normalizeSquadEntriesUtil(entries, leaderId, { nonEmptyText });
}

function unitHasSquad(unit) {
  return unitHasSquadUtil(unit, { nonEmptyText, toSafeNumber });
}

function squadMemberIds(unit) {
  return squadMemberIdsUtil(unit, { nonEmptyText });
}

function resolveDefaultSquadName(units = unitList.value) {
  return resolveDefaultSquadNameUtil(units, { nonEmptyText });
}

function resolveUnitScoutValue(unit) {
  return resolveUnitScoutValueUtil(unit, { roundTo1 });
}

function resolveUnitStealthValue(unit) {
  return resolveUnitStealthValueUtil(unit, { roundTo1 });
}

function buildSquadSummaryList(units = unitList.value) {
  return buildSquadSummaryListUtil(units, {
    nonEmptyText,
    toSafeNumber,
    roundTo1,
    resolveDefaultSquadName,
    normalizeSquadEntries,
    unitHasSquad,
    resolveUnitScoutValue,
    resolveUnitStealthValue
  });
}

function stripRemovedUnitFromSquads(units, removedUnitId) {
  return stripRemovedUnitFromSquadsUtil(units, removedUnitId, {
    nonEmptyText,
    toSafeNumber,
    normalizeSquadEntries
  });
}

function toUnitRoleLabel(unit) {
  return toUnitRoleLabelUtil(unit, { nonEmptyText });
}

function resolveVillageScaleLabel(village) {
  return resolveVillageScaleLabelUtil(village, { toSafeNumber });
}

function resolveNamedLimit(village) {
  return resolveNamedLimitUtil(village, {
    toSafeNumber,
    namedLimitByScale: CITY_SCALE_NAMED_LIMIT
  });
}

function normalizeCityAbilityLevel(value, fallback = 1, max = CITY_ABILITY_DEFINED_CAP) {
  const safe = Math.max(1, Math.floor(toSafeNumber(value, fallback)));
  return Math.min(max, safe);
}

function normalizeCityLevels(input) {
  const out = {};
  const source = input && typeof input === "object" ? input : {};
  for (const key of CITY_ABILITY_KEYS) {
    out[key] = normalizeCityAbilityLevel(source[key], 1, CITY_ABILITY_DEFINED_CAP);
  }
  return out;
}

function resolveVillageCityLevels(village) {
  return normalizeCityLevels(village?.cityLevels);
}

function resolveVillageAbilityLevel(village, key, cap = CITY_ABILITY_DEFINED_CAP) {
  const cityLevels = resolveVillageCityLevels(village);
  const level = normalizeCityAbilityLevel(cityLevels?.[key], 1, CITY_ABILITY_DEFINED_CAP);
  return Math.min(cap, level);
}

function resolveEconomyGainMultiplier(village) {
  const level = resolveVillageAbilityLevel(village, "経済", CITY_ABILITY_ACTIVE_CAP);
  const byTable = toSafeNumber(ECONOMY_GAIN_MULTIPLIER_BY_LEVEL[level], 0);
  if (byTable > 0) return byTable;
  return roundTo1(1 + Math.max(0, level - 1) * 0.15);
}

function resolveCityAbilityUpgradeCost(abilityKey, nextLevel) {
  const key = nonEmptyText(abilityKey);
  const lv = Math.max(1, Math.floor(toSafeNumber(nextLevel, 1)));
  const table = CITY_ABILITY_GROWTH_COST[key] || {};
  return normalizeResourceBag(table[lv], MATERIAL_RESOURCE_KEYS);
}

function canAffordCityAbilityUpgrade(village, abilityKey) {
  if (!village) return false;
  const key = nonEmptyText(abilityKey);
  if (!key || !CITY_ABILITY_KEYS.includes(key)) return false;
  const current = resolveVillageAbilityLevel(village, key, CITY_ABILITY_DEFINED_CAP);
  if (current >= CITY_ABILITY_ACTIVE_CAP) return false;
  const nextLevel = current + 1;
  const cost = resolveCityAbilityUpgradeCost(key, nextLevel);
  const stock = normalizeMaterialStockBag(village.materialStockByType);
  for (const matKey of MATERIAL_RESOURCE_KEYS) {
    if (toSafeNumber(stock[matKey], 0) < toSafeNumber(cost[matKey], 0)) return false;
  }
  return true;
}

function applyCityAbilityUpgrade(village, abilityKey) {
  const nextVillage = ensureVillageStateShape(village, props.selectedRace);
  if (!nextVillage) return null;
  const key = nonEmptyText(abilityKey);
  if (!key || !CITY_ABILITY_KEYS.includes(key)) return null;
  const current = resolveVillageAbilityLevel(nextVillage, key, CITY_ABILITY_DEFINED_CAP);
  if (current >= CITY_ABILITY_ACTIVE_CAP) return null;
  const nextLevel = current + 1;
  const cost = resolveCityAbilityUpgradeCost(key, nextLevel);
  const stock = normalizeMaterialStockBag(nextVillage.materialStockByType);
  for (const matKey of MATERIAL_RESOURCE_KEYS) {
    const value = roundTo1(Math.max(0, toSafeNumber(stock[matKey], 0) - toSafeNumber(cost[matKey], 0)));
    stock[matKey] = value;
  }
  const cityLevels = {
    ...resolveVillageCityLevels(nextVillage),
    [key]: nextLevel
  };
  return ensureVillageStateShape({
    ...nextVillage,
    materialStockByType: stock,
    cityLevels
  }, props.selectedRace);
}

function formatCityAbilityLevels(village) {
  const levels = resolveVillageCityLevels(village);
  return CITY_ABILITY_KEYS
    .map(key => `${key}Lv${resolveVillageAbilityLevel({ cityLevels: levels }, key, CITY_ABILITY_DEFINED_CAP)}`)
    .join(" / ");
}

function resolveEquipmentCraftLevel(rarityKey) {
  const rarity = normalizeEquipmentRarity(rarityKey, "common");
  const level = toSafeNumber(EQUIPMENT_LEVEL_BY_RARITY[rarity], 1);
  return Math.max(1, Math.floor(level));
}

function resolveSmithCraftCap(village) {
  return resolveVillageAbilityLevel(village, "鍛冶場", CITY_ABILITY_ACTIVE_CAP);
}

function isMagicEquipmentRow(row) {
  if (!row || typeof row !== "object") return false;
  const name = nonEmptyText(row?.装備名);
  if (name.includes("杖") || name.includes("法")) return true;
  const traits = [row?.特性1, row?.特性2, row?.特性3, row?.特性4]
    .map(v => nonEmptyText(v))
    .filter(Boolean)
    .join("/");
  return traits.includes("魔");
}

function isFaithEquipmentRow(row) {
  if (!row || typeof row !== "object") return false;
  const name = nonEmptyText(row?.装備名);
  if (name.includes("聖") || name.includes("神")) return true;
  const traits = [row?.特性1, row?.特性2, row?.特性3, row?.特性4]
    .map(v => nonEmptyText(v))
    .filter(Boolean)
    .join("/");
  return traits.includes("信仰") || traits.includes("光");
}

function buildEquipmentCraftMaterialCost(row, rarityKey) {
  const level = resolveEquipmentCraftLevel(rarityKey);
  const tableLevel = Math.max(1, Math.min(4, level));
  const base = normalizeResourceBag(EQUIPMENT_CRAFT_MATERIAL_COST_BY_LEVEL[tableLevel], MATERIAL_RESOURCE_KEYS);
  const isMagic = isMagicEquipmentRow(row);
  const isFaith = isFaithEquipmentRow(row);
  const addPrecious = (isMagic || isFaith)
    ? normalizeResourceBag(EQUIPMENT_CRAFT_MAGIC_FAITH_COST_BY_LEVEL[tableLevel], MATERIAL_RESOURCE_KEYS)
    : buildEmptyResourceBag(MATERIAL_RESOURCE_KEYS);
  const total = normalizeMaterialStockBag(base);
  addToResourceBag(total, addPrecious, MATERIAL_RESOURCE_KEYS);
  return {
    level,
    tableLevel,
    isMagic,
    isFaith,
    material: total
  };
}

function canAffordEquipmentCraft(village, craftCost) {
  if (!village || !craftCost?.material) return false;
  const stock = normalizeMaterialStockBag(village.materialStockByType);
  for (const key of MATERIAL_RESOURCE_KEYS) {
    if (toSafeNumber(stock[key], 0) < toSafeNumber(craftCost.material?.[key], 0)) return false;
  }
  return true;
}

function applyEquipmentCraftCost(village, craftCost) {
  const nextVillage = ensureVillageStateShape(village, props.selectedRace);
  if (!nextVillage || !craftCost?.material) return null;
  const nextStock = normalizeMaterialStockBag(nextVillage.materialStockByType);
  for (const key of MATERIAL_RESOURCE_KEYS) {
    nextStock[key] = roundTo1(
      Math.max(0, toSafeNumber(nextStock[key], 0) - toSafeNumber(craftCost.material?.[key], 0))
    );
  }
  return ensureVillageStateShape({
    ...nextVillage,
    materialStockByType: nextStock
  }, props.selectedRace);
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
  const iconName = nonEmptyText(name);
  if (iconName && hasIconName(iconName)) {
    return getIconSrcByName(iconName, iconName);
  }
  const fallbackName = nonEmptyText(fallback);
  if (fallbackName && hasIconName(fallbackName)) {
    return getIconSrcByName(fallbackName, fallbackName);
  }
  return "";
}

function resolveAvailableIconName(...candidates) {
  for (const candidate of candidates) {
    const iconName = nonEmptyText(candidate);
    if (iconName && hasIconName(iconName)) return iconName;
  }
  return "";
}

function resolveSpecialOverlayIconName(specialKey) {
  if (specialKey === "沼地") return resolveAvailableIconName("沼地", "沼");
  if (specialKey === "洞窟") return resolveAvailableIconName("洞窟");
  if (specialKey === "峡谷") return resolveAvailableIconName("峡谷", "渓谷");
  return "";
}

function resolveWaterfallIconName() {
  return resolveAvailableIconName("滝");
}

function resolveSovereignIconName() {
  return resolveAvailableIconName("王冠");
}

function resolveClassRowIconName(row, fallback = DEFAULT_ICON_NAME) {
  if (!row) return "";
  const imageId = nonEmptyText(row?.画像ID);
  if (!imageId) return "";
  if (hasIconName(imageId)) return imageId;
  const fallbackIcon = nonEmptyText(fallback);
  if (fallbackIcon && hasIconName(fallbackIcon)) return fallbackIcon;
  return "";
}

function resolveDefaultUnitIconName(options = {}) {
  const raceName = nonEmptyText(options?.raceName);
  const className = nonEmptyText(options?.className);
  const classRow = options?.classRow || findClassRowByName(className);
  const raceRow = options?.raceRow || findClassRowByName(resolveRaceBaseClassName(raceName));
  const classIcon = resolveClassRowIconName(classRow, "");
  if (classIcon) return classIcon;
  const raceIcon = resolveClassRowIconName(raceRow, "");
  if (raceIcon) return raceIcon;
  const raceKey = nonEmptyText(raceName);
  if (raceKey && hasIconName(raceKey)) return raceKey;
  return "";
}

function resolveFallbackIconNameForUnit(unit) {
  const className = nonEmptyText(unit?.className);
  const raceName = nonEmptyText(unit?.race);
  return resolveDefaultUnitIconName({ raceName, className });
}

function resolveUnitIconNameStrict(name, fallback = "") {
  const iconName = nonEmptyText(name);
  if (iconName && hasIconName(iconName)) return iconName;
  const fallbackName = nonEmptyText(fallback);
  if (fallbackName && hasIconName(fallbackName)) return fallbackName;
  return "";
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

function normalizeEquipmentRarity(value, fallback = "common") {
  return normalizeEquipmentRarityKey(value, fallback);
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
  return String(Math.trunc(roundTo1(value)).toLocaleString("ja-JP", { minimumFractionDigits: 0, maximumFractionDigits: 0 }));
}

function buildEmptyResourceBag(keys) {
  return buildEmptyResourceBagUtil(keys);
}

function normalizeResourceBag(raw, keys) {
  return normalizeResourceBagUtil(raw, keys, { roundTo1 });
}

function sumResourceBag(bag, keys) {
  return sumResourceBagUtil(bag, keys, { roundTo1, toSafeNumber });
}

function addToResourceBag(target, delta, keys) {
  addToResourceBagUtil(target, delta, keys, { roundTo1, toSafeNumber });
}

function multiplyResourceBag(source, factor, keys) {
  return multiplyResourceBagUtil(source, factor, keys, { roundTo1, toSafeNumber });
}

function formatResourceBag(bag, keys, labels = {}) {
  return formatResourceBagUtil(bag, keys, labels, { toSafeNumber, formatCompactNumber });
}

function formatPositiveResourceBag(bag, keys, labels = {}) {
  return formatPositiveResourceBagUtil(bag, keys, labels, { toSafeNumber, roundTo1, formatCompactNumber });
}

const foodDisplayKeys = computed(() => (
  useFiveResourceMode.value ? FOOD_RESOURCE_SIMPLE_KEYS : FOOD_RESOURCE_KEYS
));

const foodDisplayLabels = computed(() => (
  useFiveResourceMode.value ? FOOD_RESOURCE_SIMPLE_LABELS : FOOD_RESOURCE_LABELS
));

const materialDisplayKeys = computed(() => (
  useFiveResourceMode.value ? MATERIAL_RESOURCE_SIMPLE_KEYS : MATERIAL_RESOURCE_KEYS
));

const materialDisplayLabels = computed(() => (
  useFiveResourceMode.value ? MATERIAL_RESOURCE_SIMPLE_LABELS : MATERIAL_RESOURCE_LABELS
));

function normalizeMaterialStockBag(raw) {
  const normalized = buildEmptyResourceBag(MATERIAL_RESOURCE_KEYS);
  if (!raw || typeof raw !== "object") return normalized;
  // 旧保存互換: 旧カテゴリキーを代表資源へ移す
  normalized.鉄 = roundTo1(normalized.鉄 + Math.max(0, toSafeNumber(raw?.金属, 0)));
  normalized.金 = roundTo1(normalized.金 + Math.max(0, toSafeNumber(raw?.貴金属, 0)));
  for (const sourceKey of MATERIAL_RESOURCE_SOURCE_KEYS) {
    const resourceKey = MATERIAL_SOURCE_TO_RESOURCE_MAP[sourceKey];
    if (!resourceKey || !Object.prototype.hasOwnProperty.call(normalized, resourceKey)) continue;
    normalized[resourceKey] = roundTo1(normalized[resourceKey] + Math.max(0, toSafeNumber(raw[sourceKey], 0)));
  }
  return normalized;
}

function weightedSumFromBag(sourceBag, weightMap) {
  if (!sourceBag || typeof sourceBag !== "object" || !weightMap || typeof weightMap !== "object") return 0;
  return roundTo1(
    Object.entries(weightMap).reduce(
      (sum, [key, weight]) => sum + (toSafeNumber(sourceBag?.[key], 0) * toSafeNumber(weight, 1)),
      0
    )
  );
}

function buildWeightedBagFromSource(sourceBag, targetWeightDefs) {
  const out = {};
  if (!targetWeightDefs || typeof targetWeightDefs !== "object") return out;
  for (const [targetKey, weightMap] of Object.entries(targetWeightDefs)) {
    out[targetKey] = weightedSumFromBag(sourceBag, weightMap);
  }
  return out;
}

function toFoodDisplayBag(raw) {
  const stockBag = normalizeResourceBag(raw, FOOD_RESOURCE_KEYS);
  if (!useFiveResourceMode.value) return stockBag;
  return buildWeightedBagFromSource(stockBag, FOOD_RESOURCE_SIMPLE_WEIGHT_MAP);
}

function sumFoodForDisplay(raw) {
  return sumResourceBag(toFoodDisplayBag(raw), foodDisplayKeys.value);
}

function buildFoodSummaryEntries(raw) {
  return buildResourceSummaryEntries(toFoodDisplayBag(raw), foodDisplayKeys.value);
}

function formatFoodResourceBag(raw) {
  return formatResourceBag(toFoodDisplayBag(raw), foodDisplayKeys.value, foodDisplayLabels.value);
}

function formatFoodPositiveResourceBag(raw) {
  return formatPositiveResourceBag(toFoodDisplayBag(raw), foodDisplayKeys.value, foodDisplayLabels.value);
}

function toMaterialDisplayBag(raw) {
  const stockBag = normalizeMaterialStockBag(raw);
  if (!useFiveResourceMode.value) return stockBag;
  return buildWeightedBagFromSource(stockBag, MATERIAL_RESOURCE_SIMPLE_WEIGHT_MAP);
}

function sumMaterialForDisplay(raw) {
  return sumResourceBag(toMaterialDisplayBag(raw), materialDisplayKeys.value);
}

function buildMaterialSummaryEntries(raw) {
  return buildResourceSummaryEntries(toMaterialDisplayBag(raw), materialDisplayKeys.value);
}

function formatMaterialResourceBag(raw) {
  return formatResourceBag(toMaterialDisplayBag(raw), materialDisplayKeys.value, materialDisplayLabels.value);
}

function formatMaterialPositiveResourceBag(raw) {
  return formatPositiveResourceBag(toMaterialDisplayBag(raw), materialDisplayKeys.value, materialDisplayLabels.value);
}

function buildMaterialCollapsedEntries(raw) {
  if (useFiveResourceMode.value) {
    const bag = toMaterialDisplayBag(raw);
    const defs = [
      { key: "木材", label: "木材", iconKey: "木材", value: roundTo1(toSafeNumber(bag?.木材, 0)) },
      { key: "鉄", label: "鉄", iconKey: "鉄", value: roundTo1(toSafeNumber(bag?.鉄, 0)) },
      { key: "金", label: "金", iconKey: "金", value: roundTo1(toSafeNumber(bag?.金, 0)) }
    ];
    return defs.map(def => ({
      ...def,
      iconSrc: resolveResourceIconSrc(def.iconKey),
      displayValue: formatCompactNumber(def.value)
    }));
  }
  const bag = normalizeMaterialStockBag(raw);
  const totalWood = roundTo1(
    toSafeNumber(bag?.木材, 0)
    + toSafeNumber(bag?.黒木, 0)
    + toSafeNumber(bag?.特木, 0)
  );
  const totalMetal = roundTo1(
    toSafeNumber(bag?.鉄, 0)
    + toSafeNumber(bag?.銀鉄, 0)
    + toSafeNumber(bag?.青金鋼, 0)
    + toSafeNumber(bag?.赤黒鋼, 0)
  );
  const defs = [
    { key: "木材", label: "木材", iconKey: "木材", value: totalWood },
    { key: "石", label: "石", iconKey: "石材", value: roundTo1(toSafeNumber(bag?.石材, 0)) },
    { key: "鉄", label: "鉄", iconKey: "鉄", value: totalMetal },
    { key: "金", label: "金", iconKey: "金", value: roundTo1(toSafeNumber(bag?.金, 0)) },
    { key: "銀", label: "銀", iconKey: "銀", value: roundTo1(toSafeNumber(bag?.銀, 0)) }
  ];
  return defs.map(def => ({
    ...def,
    iconSrc: resolveResourceIconSrc(def.iconKey),
    displayValue: formatCompactNumber(def.value)
  }));
}

function buildMaterialHeaderGroupEntries(raw) {
  if (useFiveResourceMode.value) {
    const bag = toMaterialDisplayBag(raw);
    return MATERIAL_HEADER_GROUP_SIMPLE_DEFS.map(group => {
      const value = roundTo1(toSafeNumber(bag?.[group.key], 0));
      return {
        label: group.label,
        value,
        displayValue: formatCompactNumber(value),
        details: [{
          key: group.key,
          label: group.key,
          value,
          displayValue: formatCompactNumber(value),
          iconSrc: resolveResourceIconSrc(group.key)
        }]
      };
    });
  }
  const bag = normalizeMaterialStockBag(raw);
  return MATERIAL_HEADER_GROUP_DEFS.map(group => {
    const details = group.keys.map(key => ({
      key,
      label: key,
      value: roundTo1(toSafeNumber(bag?.[key], 0)),
      displayValue: formatCompactNumber(toSafeNumber(bag?.[key], 0)),
      iconSrc: resolveResourceIconSrc(key)
    }));
    const value = roundTo1(group.keys.reduce((sum, key) => sum + toSafeNumber(bag?.[key], 0), 0));
    return {
      label: group.label,
      value,
      displayValue: formatCompactNumber(value),
      details
    };
  });
}

function toggleMaterialHeaderExpanded() {
  materialHeaderExpanded.value = !materialHeaderExpanded.value;
}

function resolveResourceIconSrc(resourceKey) {
  const key = nonEmptyText(resourceKey);
  const preferred = RESOURCE_ICON_NAME_MAP[key] || key;
  return getIconSrcByName(preferred, DEFAULT_ICON_NAME);
}

function buildResourceSummaryEntries(bag, keys) {
  return (Array.isArray(keys) ? keys : [])
    .map(key => {
      const rawValue = toSafeNumber(bag?.[key], 0);
      const displayValue = formatCompactNumber(rawValue);
      return {
        key,
        iconSrc: resolveResourceIconSrc(key),
        rawValue,
        displayValue
      };
    })
    .filter(entry => entry.rawValue > 0);
}

function buildMaterialIncomeFromTerrainRow(row) {
  const out = buildEmptyResourceBag(MATERIAL_RESOURCE_KEYS);
  if (!row || typeof row !== "object") return out;
  for (const sourceKey of MATERIAL_RESOURCE_SOURCE_KEYS) {
    const resourceKey = MATERIAL_SOURCE_TO_RESOURCE_MAP[sourceKey];
    if (!resourceKey) continue;
    out[resourceKey] = roundTo1(out[resourceKey] + toSafeNumber(row?.[sourceKey], 0));
  }
  return out;
}

function scaleResourceBagByFactor(bag, keys, factor = 1) {
  const safeFactor = Math.max(0, toSafeNumber(factor, 1));
  return multiplyResourceBag(bag, safeFactor, keys);
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
  const gainScale = ECONOMY_GAIN_SCALE * resolveEconomyGainMultiplier(village);
  result.food = scaleResourceBagByFactor(result.food, FOOD_RESOURCE_KEYS, gainScale);
  result.material = scaleResourceBagByFactor(result.material, MATERIAL_RESOURCE_KEYS, gainScale);
  return result;
}

function formatVillageBuildingBonus(bonus) {
  const foodRaw = formatFoodPositiveResourceBag(bonus?.food);
  const materialRaw = formatMaterialPositiveResourceBag(bonus?.material);
  if (foodRaw === "なし" && materialRaw === "なし") return "なし";
  const foodText = foodRaw === "なし" ? "0" : foodRaw;
  const materialText = materialRaw === "なし" ? "0" : materialRaw;
  return `食料 +${foodText} / 資材 +${materialText}`;
}

function buildUnitCreationCost(count = 1) {
  const safeCount = Math.max(1, Math.min(20, Math.floor(toSafeNumber(count, 1))));
  const scaledCount = safeCount * ECONOMY_COST_SCALE;
  return {
    count: safeCount,
    food: multiplyResourceBag(UNIT_CREATION_COST_TEMP.food, scaledCount, FOOD_RESOURCE_KEYS),
    material: multiplyResourceBag(UNIT_CREATION_COST_TEMP.material, scaledCount, MATERIAL_RESOURCE_KEYS)
  };
}

function canAffordUnitCreation(village, cost) {
  if (!village || !cost) return false;
  const foodBag = normalizeResourceBag(village.foodStockByType, FOOD_RESOURCE_KEYS);
  const materialBag = normalizeMaterialStockBag(village.materialStockByType);
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
  const nextMaterial = normalizeMaterialStockBag(nextVillage.materialStockByType);
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
  const materialBag = normalizeMaterialStockBag(village.materialStockByType);
  const costBag = scaleResourceBagByFactor(
    normalizeResourceBag(definition.cost, MATERIAL_RESOURCE_KEYS),
    MATERIAL_RESOURCE_KEYS,
    ECONOMY_COST_SCALE
  );
  for (const key of MATERIAL_RESOURCE_KEYS) {
    if (materialBag[key] < costBag[key]) return false;
  }
  return true;
}

function applyVillageBuildingCost(village, definition) {
  const nextVillage = ensureVillageStateShape(village, props.selectedRace);
  if (!nextVillage || !definition) return null;
  const nextMaterial = normalizeMaterialStockBag(nextVillage.materialStockByType);
  const costBag = scaleResourceBagByFactor(
    normalizeResourceBag(definition.cost, MATERIAL_RESOURCE_KEYS),
    MATERIAL_RESOURCE_KEYS,
    ECONOMY_COST_SCALE
  );
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
  return splitTotalIntoBagUtil(total, keys, { toSafeNumber });
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
      addToResourceBag(summary.material, buildMaterialIncomeFromTerrainRow(row), MATERIAL_RESOURCE_KEYS);
    }
  }
  const gainScale = ECONOMY_GAIN_SCALE * resolveEconomyGainMultiplier(villageState.value);
  summary.food = scaleResourceBagByFactor(summary.food, FOOD_RESOURCE_KEYS, gainScale);
  summary.material = scaleResourceBagByFactor(summary.material, MATERIAL_RESOURCE_KEYS, gainScale);
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

function buildVisibilitySnapshotFromLiveState() {
  return {
    exploredTileKeys: Array.from(exploredTileKeys || []).map(v => String(v || "")),
    visibleTileKeys: Array.from(visibleTileKeys || []).map(v => String(v || "")),
    spottedEnemyTileKeys: Array.from(spottedEnemyTileKeys || []).map(v => String(v || "")),
    spottedFactionTileKeys: Array.from(spottedFactionTileKeys || []).map(v => String(v || ""))
  };
}

function applyVisibilitySnapshotToLiveState(snapshot) {
  const explored = Array.isArray(snapshot?.exploredTileKeys) ? snapshot.exploredTileKeys : [];
  const visible = Array.isArray(snapshot?.visibleTileKeys) ? snapshot.visibleTileKeys : [];
  const spotted = Array.isArray(snapshot?.spottedEnemyTileKeys) ? snapshot.spottedEnemyTileKeys : [];
  const spottedFaction = Array.isArray(snapshot?.spottedFactionTileKeys) ? snapshot.spottedFactionTileKeys : [];
  exploredTileKeys = new Set(explored.map(v => String(v || "")));
  visibleTileKeys = new Set(visible.map(v => String(v || "")));
  spottedEnemyTileKeys = new Set(spotted.map(v => String(v || "")));
  spottedFactionTileKeys = new Set(spottedFaction.map(v => String(v || "")));
}

function resolveRaceFromUnitList(units = []) {
  const sovereign = units.find(unit => isSovereignUnit(unit)) || units[0] || null;
  return nonEmptyText(sovereign?.race) || nonEmptyText(props.selectedRace) || "只人";
}

function resolveActiveFactionRace() {
  return resolveRaceFromUnitList(unitList.value);
}

function buildLiveFactionStateSnapshot() {
  return {
    village: deepCloneJsonValue(villageState.value, null),
    units: deepCloneJsonValue(unitList.value, []),
    selectedUnitId: nonEmptyText(selectedUnitId.value),
    villagePlacementMode: !!villagePlacementMode.value,
    unitMoveMode: !!unitMoveMode.value,
    nationLogKey: nonEmptyText(activeNationLogKey.value),
    visibility: buildVisibilitySnapshotFromLiveState()
  };
}

function applyFactionStateSnapshotToLiveState(snapshot, options = {}) {
  const units = Array.isArray(snapshot?.units)
    ? snapshot.units.map(unit => deepCloneJsonValue(unit, {}))
    : [];
  const raceFallback = resolveRaceFromUnitList(units);
  const villageRaw = snapshot?.village ? deepCloneJsonValue(snapshot.village, null) : null;
  const village = villageRaw ? ensureVillageStateShape(villageRaw, raceFallback) : null;
  const nextSelectedUnitId = nonEmptyText(snapshot?.selectedUnitId) || units[0]?.id || "";
  const nextNationLogKey = nonEmptyText(snapshot?.nationLogKey)
    || nonEmptyText(units.find(unit => isSovereignUnit(unit))?.id)
    || `nation-${nonEmptyText(activeTestPlayerId.value) || DEFAULT_TEST_PLAYER_ID}`;
  const sovereignName = nonEmptyText(units.find(unit => isSovereignUnit(unit))?.name) || "統治者";

  applyingTestPlayerState = true;
  villageState.value = village;
  unitList.value = units;
  selectedUnitId.value = nextSelectedUnitId;
  villagePlacementMode.value = !!snapshot?.villagePlacementMode;
  unitMoveMode.value = !!snapshot?.unitMoveMode;
  activeNationLogKey.value = nextNationLogKey;
  ensureNationLogBucket(nextNationLogKey, sovereignName);
  applyVisibilitySnapshotToLiveState(snapshot?.visibility || {});
  applyingTestPlayerState = false;

  updateVillageInfoText();
  updateUnitInfoText();
  if (currentData.value) {
    rebuildTerritorySets(currentData.value);
    rebuildVisibleTiles(currentData.value);
  }
  if (options.emitState !== false) emitCharacterStateChange();
  if (options.render !== false) renderMapWithPhaser();
}

function buildTestPlayerSlotFromLiveState(id, label, options = {}) {
  return {
    id: nonEmptyText(id) || DEFAULT_TEST_PLAYER_ID,
    label: nonEmptyText(label) || PRIMARY_TEST_PLAYER_LABEL,
    isPlayer: options?.isPlayer !== false,
    race: nonEmptyText(options?.race) || resolveRaceFromUnitList(unitList.value),
    ready: !!options?.ready,
    factionState: options?.factionState
      ? deepCloneJsonValue(options.factionState, buildLiveFactionStateSnapshot())
      : buildLiveFactionStateSnapshot()
  };
}

function syncActiveTestPlayerSlotFromLiveState() {
  if (applyingTestPlayerState) return;
  const activeId = nonEmptyText(activeTestPlayerId.value) || DEFAULT_TEST_PLAYER_ID;
  const next = [...testPlayerSlots.value];
  const idx = next.findIndex(slot => nonEmptyText(slot?.id) === activeId);
  const factionState = buildLiveFactionStateSnapshot();
  if (idx < 0) {
    next.push(buildTestPlayerSlotFromLiveState(activeId, buildTestPlayerLabel(next.length + 1), { factionState }));
  } else {
    next[idx] = {
      ...next[idx],
      race: resolveRaceFromUnitList(unitList.value),
      factionState
    };
  }
  testPlayerSlots.value = next;
}

function resetTestPlayerSlotsFromLiveState() {
  const primary = buildTestPlayerSlotFromLiveState(DEFAULT_TEST_PLAYER_ID, PRIMARY_TEST_PLAYER_LABEL, { isPlayer: true, ready: false });
  testPlayerSlots.value = [primary];
  activeTestPlayerId.value = primary.id;
}

function ensureTestPlayerSlotsInitialized() {
  if (testPlayerSlots.value.length) return;
  resetTestPlayerSlotsFromLiveState();
}

function initializeTestPlayerSlotsFromConfig(config = {}) {
  const requestedPlayers = Math.max(1, Math.floor(toSafeNumber(config?.playerCount, 1)));
  const requestedOthers = Math.max(0, Math.floor(toSafeNumber(config?.otherFactionCount, 0)));
  const requestedTotalRaw = Math.max(1, Math.floor(toSafeNumber(config?.totalCount, requestedPlayers + requestedOthers)));
  const total = Math.max(1, Math.min(MAX_TEST_PLAYER_COUNT, requestedTotalRaw));
  const playerCount = Math.max(1, Math.min(requestedPlayers, total));
  const otherCount = Math.max(0, Math.min(requestedOthers, Math.max(0, total - playerCount)));

  nationLogsBySovereign.value = {};
  activeNationLogKey.value = "";
  const nextSlots = [];
  for (let i = 1; i <= total; i += 1) {
    const id = `player-${i}`;
    const isPlayer = i <= playerCount;
    const label = isPlayer ? buildTestPlayerLabel(i) : buildOtherFactionLabel(i - playerCount);
    const factionState = createDraftFactionStateForAdditionalPlayer(id, String(i));
    const sovereign = Array.isArray(factionState?.units)
      ? factionState.units.find(unit => isSovereignUnit(unit)) || factionState.units[0] || null
      : null;
    ensureNationLogBucket(factionState?.nationLogKey, nonEmptyText(sovereign?.name) || `統治者${i}`);
    nextSlots.push({
      id,
      label,
      race: nonEmptyText(sovereign?.race) || nonEmptyText(props.selectedRace) || "只人",
      isPlayer,
      ready: false,
      factionState
    });
  }
  testPlayerSlots.value = nextSlots;
  activeTestPlayerId.value = nextSlots[0]?.id || DEFAULT_TEST_PLAYER_ID;
  const activeSlot = nextSlots[0] || null;
  if (activeSlot?.factionState) {
    applyFactionStateSnapshotToLiveState(activeSlot.factionState, { emitState: true, render: !!currentData.value });
  } else {
    emitCharacterStateChange();
    if (currentData.value) renderMapWithPhaser();
  }
  return { ok: true, total, playerCount, otherCount };
}

function resolveNextTestPlayerIdentity() {
  const usedIds = new Set(testPlayerSlots.value.map(slot => nonEmptyText(slot?.id)).filter(Boolean));
  let maxNo = 0;
  for (const slot of testPlayerSlots.value) {
    const id = nonEmptyText(slot?.id);
    const m = id.match(/^player-(\d+)$/);
    if (!m) continue;
    const no = Math.max(0, Math.floor(toSafeNumber(m[1], 0)));
    if (no > maxNo) maxNo = no;
  }
  let nextNo = Math.max(1, maxNo + 1);
  let nextId = `player-${nextNo}`;
  while (usedIds.has(nextId)) {
    nextNo += 1;
    nextId = `player-${nextNo}`;
  }
  return {
    id: nextId,
    no: nextNo,
    label: buildTestPlayerLabel(nextNo)
  };
}

function createDraftFactionStateForAdditionalPlayer(slotId, label, options = {}) {
  const raceName = nonEmptyText(options?.raceName) || nonEmptyText(props.selectedRace) || "只人";
  const preferredClassName = nonEmptyText(options?.className) || nonEmptyText(props.selectedClass);
  const raceRow = findClassRowByName(resolveRaceBaseClassName(raceName))
    || chooseRaceBaseRowForSelection()
    || classRows.value[0]
    || null;
  const classRow = findClassRowByName(preferredClassName)
    || pickClassRowForCharacter(raceRow)
    || classRows.value[0]
    || null;
  const sovereign = createUnitRecord({
    raceRow,
    classRow,
    name: nonEmptyText(options?.sovereignName) || `統治者${label}`,
    raceLabel: raceName,
    isSovereign: true,
    isNamed: true,
    unitType: "統治者"
  });
  sovereign.x = null;
  sovereign.y = null;
  const initialPopulation = resolveInitialVillagePopulationByRace(raceName);
  const villageName = nonEmptyText(options?.villageName) || randomPick(VILLAGE_NAME_POOL, "開拓村");
  const village = ensureVillageStateShape({
    id: `${slotId}-village-pending`,
    name: villageName,
    x: null,
    y: null,
    placed: false,
    cityLevels: normalizeCityLevels({}),
    buildings: [],
    population: initialPopulation,
    populationByRace: {
      [raceName]: initialPopulation
    },
    foodStockByType: buildEmptyResourceBag(FOOD_RESOURCE_KEYS),
    materialStockByType: buildEmptyResourceBag(MATERIAL_RESOURCE_KEYS)
  }, raceName);
  return {
    village,
    units: [sovereign],
    selectedUnitId: sovereign.id,
    villagePlacementMode: true,
    unitMoveMode: false,
    nationLogKey: sovereign.id,
    visibility: {
      exploredTileKeys: [],
      visibleTileKeys: [],
      spottedEnemyTileKeys: [],
      spottedFactionTileKeys: []
    }
  };
}

function switchActiveTestPlayer(playerId, options = {}) {
  const targetId = nonEmptyText(playerId);
  if (!targetId) return;
  const currentId = nonEmptyText(activeTestPlayerId.value);
  if (currentId && currentId !== targetId) {
    syncActiveTestPlayerSlotFromLiveState();
  }
  const slot = testPlayerSlots.value.find(row => nonEmptyText(row?.id) === targetId);
  if (!slot) return;
  activeTestPlayerId.value = targetId;
  applyFactionStateSnapshotToLiveState(slot.factionState, {
    emitState: options.emitState !== false,
    render: false
  });
  const focusOnSwitch = options.focusOnSwitch !== false;
  if (focusOnSwitch) {
    const focused = focusActiveFactionPrimaryTile(slot?.factionState);
    if (!focused) {
      centerMapOnNextZoom = true;
    }
  }
  if (options.render !== false) renderMapWithPhaser();
}

function focusActiveFactionPrimaryTile(factionState = null) {
  const village = factionState?.village || null;
  const villageX = Math.floor(toSafeNumber(village?.x, NaN));
  const villageY = Math.floor(toSafeNumber(village?.y, NaN));
  if (village?.placed && Number.isFinite(villageX) && Number.isFinite(villageY) && villageX >= 0 && villageY >= 0) {
    centerMapOnNextZoom = false;
    queueCameraFocusAtTile(villageX, villageY, { mode: "absolute" });
    return true;
  }
  const units = Array.isArray(factionState?.units) ? factionState.units : [];
  const sovereign = units.find(unit => isSovereignUnit(unit)) || units[0] || null;
  const unitX = Math.floor(toSafeNumber(sovereign?.x, NaN));
  const unitY = Math.floor(toSafeNumber(sovereign?.y, NaN));
  if (Number.isFinite(unitX) && Number.isFinite(unitY) && unitX >= 0 && unitY >= 0) {
    centerMapOnNextZoom = false;
    queueCameraFocusAtTile(unitX, unitY, { mode: "absolute" });
    return true;
  }
  return false;
}

function applySovereignProfileToSlot(command = {}) {
  const targetId = nonEmptyText(command?.slotId) || nonEmptyText(activeTestPlayerId.value) || DEFAULT_TEST_PLAYER_ID;
  if (!targetId) return { ok: false, reason: "勢力IDが未指定です。" };
  ensureTestPlayerSlotsInitialized();
  switchActiveTestPlayer(targetId, { emitState: false, render: false });

  const currentSlot = testPlayerSlots.value.find(slot => nonEmptyText(slot?.id) === targetId) || null;
  const raceName = nonEmptyText(command?.race)
    || nonEmptyText(currentSlot?.race)
    || nonEmptyText(props.selectedRace)
    || "只人";
  const className = nonEmptyText(command?.className) || nonEmptyText(props.selectedClass);
  const fallbackLabel = nonEmptyText(currentSlot?.label) || "勢力";
  const labelNo = (fallbackLabel.match(/\d+/)?.[0]) || "1";
  const sovereignName = nonEmptyText(command?.characterName) || `統治者${labelNo}`;
  const villageName = nonEmptyText(command?.villageName) || randomPick(VILLAGE_NAME_POOL, "開拓村");
  const nextState = createDraftFactionStateForAdditionalPlayer(targetId, labelNo, {
    raceName,
    className,
    sovereignName,
    villageName
  });
  const nextSlots = testPlayerSlots.value.map(slot => {
    if (nonEmptyText(slot?.id) !== targetId) return slot;
    return {
      ...slot,
      race: raceName,
      factionState: nextState
    };
  });
  testPlayerSlots.value = nextSlots;
  applyFactionStateSnapshotToLiveState(nextState, { emitState: true, render: false });
  updateUnitInfoText(`勢力設定: ${fallbackLabel} / ${sovereignName} / ${raceName}${className ? ` / ${className}` : ""}`);
  pushNationLog(`勢力設定: ${fallbackLabel} / 統治者 ${sovereignName} / 種族 ${raceName}${className ? ` / クラス ${className}` : ""}`);
  if (currentData.value) renderMapWithPhaser();
  return { ok: true, slotId: targetId };
}

function addTestPlayerFaction() {
  ensureTestPlayerSlotsInitialized();
  if (testPlayerSlots.value.length >= MAX_TEST_PLAYER_COUNT) {
    updateUnitInfoText(`プレイヤー勢力は最大 ${MAX_TEST_PLAYER_COUNT} までです。`);
    audio.playSe("cancel");
    return;
  }
  if (!currentData.value || currentData.value.shapeOnly) {
    updateUnitInfoText("勢力追加は地形マップ生成後に使用できます。");
    audio.playSe("cancel");
    return;
  }
  syncActiveTestPlayerSlotFromLiveState();
  const nextIdentity = resolveNextTestPlayerIdentity();
  const id = nextIdentity.id;
  const label = nextIdentity.label;
  const factionState = createDraftFactionStateForAdditionalPlayer(id, String(nextIdentity.no));
  ensureNationLogBucket(factionState.nationLogKey, `統治者${nextIdentity.no}`);
  pushNationLog(`勢力追加: ${label} を作成`);
  testPlayerSlots.value = [
    ...testPlayerSlots.value,
      {
        id,
        label,
        isPlayer: true,
        race: nonEmptyText(props.selectedRace) || "只人",
        ready: false,
        factionState
      }
  ];
  switchActiveTestPlayer(id);
  updateUnitInfoText(`${label} を追加しました。初期村を配置してください。`);
  audio.playSe("confirm");
}

function removeActiveTestPlayerFaction() {
  ensureTestPlayerSlotsInitialized();
  if (testPlayerSlots.value.length <= 1) {
    updateUnitInfoText("最後の1勢力は削除できません。");
    audio.playSe("cancel");
    return;
  }
  const targetId = nonEmptyText(activeTestPlayerId.value);
  if (!targetId) return;
  const removed = testPlayerSlots.value.find(slot => nonEmptyText(slot?.id) === targetId) || null;
  const next = testPlayerSlots.value.filter(slot => nonEmptyText(slot?.id) !== targetId);
  testPlayerSlots.value = next;
  const fallback = next[0] || null;
  if (fallback) {
    switchActiveTestPlayer(fallback.id);
  }
  updateUnitInfoText(`${removed?.label || "選択勢力"} を削除しました。`);
  audio.playSe("confirm");
}

function markActiveTestPlayerTurnReady() {
  const targetId = nonEmptyText(activeTestPlayerId.value);
  if (!targetId) return;
  testPlayerSlots.value = testPlayerSlots.value.map(slot => {
    if (nonEmptyText(slot?.id) !== targetId) return slot;
    return { ...slot, ready: true };
  });
}

function clearAllTestPlayerTurnReady() {
  testPlayerSlots.value = testPlayerSlots.value.map(slot => ({ ...slot, ready: false }));
}

function areAllTestPlayersReady() {
  if (testPlayerSlots.value.length <= 1) return true;
  return testPlayerSlots.value.every(slot => !!slot?.ready);
}

function buildPlayerTerritorySet(data, villageOverride = villageState.value) {
  const owned = new Set();
  const v = villageOverride;
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
  const hostile = buildEnemyTerritorySet(data);
  const ownerMap = new Map();
  for (const key of hostile) {
    ownerMap.set(key, "enemy");
  }
  if (testPlayerSlots.value.length > 1) {
    const activeId = nonEmptyText(activeTestPlayerId.value);
    const player = new Set();
    for (const slot of testPlayerSlots.value) {
      const slotId = nonEmptyText(slot?.id);
      const set = buildPlayerTerritorySet(data, slot?.factionState?.village);
      if (slotId && slotId === activeId) {
        for (const key of set) {
          player.add(key);
          ownerMap.set(key, slotId);
        }
      } else {
        for (const key of set) {
          hostile.add(key);
          if (!ownerMap.has(key)) ownerMap.set(key, slotId || "enemy");
        }
      }
    }
    territorySets = { player, enemy: hostile };
    territoryOwnerByTile = ownerMap;
    return;
  }
  const playerSet = buildPlayerTerritorySet(data, villageState.value);
  for (const key of playerSet) {
    ownerMap.set(key, "player");
  }
  territorySets = {
    player: playerSet,
    enemy: hostile
  };
  territoryOwnerByTile = ownerMap;
}

function tileOwnerAt(x, y) {
  const key = coordKey(x, y);
  if (territorySets.player.has(key)) return "player";
  if (territorySets.enemy.has(key)) return "enemy";
  return "";
}

function tileFactionOwnerIdAt(x, y) {
  const key = coordKey(x, y);
  return nonEmptyText(territoryOwnerByTile.get(key));
}

function resolveFactionLabelById(slotId = "") {
  const id = nonEmptyText(slotId);
  if (!id) return "";
  const slot = testPlayerSlots.value.find(row => nonEmptyText(row?.id) === id) || null;
  return nonEmptyText(slot?.label);
}

function borderStyleForOwner(owner, factionOwnerId = "") {
  if (isTestMultiplayerActive.value && factionOwnerId) {
    const factionStyle = factionBorderStyleMap.value.get(factionOwnerId);
    if (factionStyle) return factionStyle;
  }
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

function normalizeFactionTerrainToken(rawToken) {
  const token = nonEmptyText(rawToken)
    .replace(/\s+/g, "")
    .replace(/[　]/g, "");
  if (!token) return "";
  return FACTION_TERRAIN_ALIAS_MAP[token] || token;
}

function resolveFactionTerrainPreferenceByRace(raceKey = "") {
  const row = resolveFactionRowByRace(raceKey);
  const terrainRaw = nonEmptyText(row?.土地);
  if (!terrainRaw) {
    return {
      base: new Set(),
      special: new Set()
    };
  }
  const base = new Set();
  const special = new Set();
  const tokens = terrainRaw
    .split(/[,\u3001\/]/)
    .map(token => normalizeFactionTerrainToken(token))
    .filter(Boolean);
  for (const token of tokens) {
    if (BASE_TERRAIN_KEYS.has(token)) base.add(token);
    else if (SPECIAL_TERRAIN_KEYS.has(token)) special.add(token);
  }
  return { base, special };
}

function resolveFactionPreferredHeightLevelByRace(raceKey = "") {
  const row = resolveFactionRowByRace(raceKey);
  const h = Number(row?.高さ);
  if (!Number.isFinite(h)) return null;
  return Math.floor(h);
}

function resolveFactionPlacementSpecByRace(raceKey = "") {
  const race = nonEmptyText(raceKey) || "只人";
  const preference = resolveFactionTerrainPreferenceByRace(race);
  return {
    race,
    preferredBaseTerrains: preference.base,
    preferredSpecialTerrains: preference.special,
    preferredHeightLevel: resolveFactionPreferredHeightLevelByRace(race)
  };
}

function resolveSlotPlacementStrategy(slot, placementConfig = {}) {
  const isPlayer = !!slot?.isPlayer;
  const randomPlacementEnabled = placementConfig?.randomPlacementEnabled !== false;
  const mode = GAME_START_PLAYER_PLACEMENT_MODE_VALUES.has(placementConfig?.playerPlacementMode)
    ? placementConfig.playerPlacementMode
    : GAME_START_PLAYER_PLACEMENT_MODE_ALL_RANDOM;

  if (!randomPlacementEnabled && isPlayer) return "manual";
  if (mode === GAME_START_PLAYER_PLACEMENT_MODE_PLAYER_CHOOSE && isPlayer) return "manual";
  if (mode === GAME_START_PLAYER_PLACEMENT_MODE_PLAYER_RANDOM_ONLY) {
    return isPlayer ? "random" : "auto";
  }
  return randomPlacementEnabled ? "random" : "auto";
}

function resolveRaceFoodProfile(raceKey = "") {
  const raceClassName = resolveRaceBaseClassName(raceKey);
  const row = findClassRowByName(raceClassName) || findClassRowByName(nonEmptyText(raceKey));
  const profile = buildEmptyResourceBag(FOOD_RESOURCE_KEYS);
  for (const key of FOOD_RESOURCE_KEYS) {
    profile[key] = roundTo1(Math.max(0, toSafeNumber(row?.[key], 0) / 10));
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
  const materialSource = village.materialStockByType || splitTotalIntoBag(village.materialStock, MATERIAL_RESOURCE_LEGACY_KEYS);
  const materialStockByType = normalizeMaterialStockBag(materialSource);
  const cityLevels = normalizeCityLevels(village.cityLevels);
  const syncedPopulation = Math.max(1, Math.floor(Object.values(populationByRace).reduce((acc, n) => acc + toSafeNumber(n, 0), 0)));
  return {
    ...village,
    population: syncedPopulation,
    populationByRace,
    cityLevels,
    buildings,
    foodStockByType,
    materialStockByType,
    foodStock: sumResourceBag(foodStockByType, FOOD_RESOURCE_KEYS),
    materialStock: sumResourceBag(materialStockByType, MATERIAL_RESOURCE_KEYS)
  };
}

function createInitialFoodStockByType(initialPopulation = 10) {
  return createInitialFoodStockByTypeUtil(initialPopulation, { toSafeNumber, randomInt });
}

function createInitialMaterialStockByType(initialPopulation = 10) {
  const initial = createInitialMaterialStockByTypeUtil(initialPopulation, { toSafeNumber, randomInt });
  return normalizeMaterialStockBag(initial);
}

function adjustVillagePopulationForTurn(village, shortageTotal = 0) {
  return adjustVillagePopulationForTurnUtil(village, shortageTotal, {
    toSafeNumber,
    randomInt,
    nonEmptyText,
    selectedRaceFallback: props.selectedRace
  });
}

function shouldDisableFog(data) {
  if (!data || data.shapeOnly) return true;
  if (showTestControls.value) return true;
  const v = villageState.value;
  return villagePlacementMode.value && (!v?.placed || !Number.isFinite(v.x) || !Number.isFinite(v.y));
}

function resetVisibilityState() {
  exploredTileKeys = new Set();
  visibleTileKeys = new Set();
  spottedEnemyTileKeys = new Set();
  spottedFactionTileKeys = new Set();
}

function markTileExplored(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  exploredTileKeys.add(coordKey(x, y));
}

function markEnemySpotted(x, y, data = currentData.value) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const w = Number.isFinite(data?.w) ? data.w : 0;
  const h = Number.isFinite(data?.h) ? data.h : 0;
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  const tileEnemies = data?.enemySpawnMap?.[y]?.[x];
  if (!Array.isArray(tileEnemies) || !tileEnemies.length) return false;
  const key = coordKey(x, y);
  if (spottedEnemyTileKeys.has(key)) {
    markTileExplored(x, y);
    return false;
  }
  spottedEnemyTileKeys.add(key);
  markTileExplored(x, y);
  return true;
}

function markFactionSpotted(x, y, data = currentData.value) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const w = Number.isFinite(data?.w) ? data.w : 0;
  const h = Number.isFinite(data?.h) ? data.h : 0;
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  const key = coordKey(x, y);
  if (spottedFactionTileKeys.has(key)) {
    markTileExplored(x, y);
    return false;
  }
  spottedFactionTileKeys.add(key);
  markTileExplored(x, y);
  return true;
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
    addVisionRangeKeys(data, unit.x, unit.y, resolveUnitVisionRange(unit), dynamicVisible);
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
  return rowStatusVectorUtil(row, {
    statusGrowthFields: fields,
    statusGrowthDivisor: STATUS_GROWTH_DIVISOR,
    toSafeNumber
  });
}

function buildUnitSkillLevelsFromClass(raceRow, classRow, raceLevels, classLevels) {
  return buildUnitSkillLevelsFromRulesUtil({
    raceRow,
    classRow,
    raceLevels,
    classLevels,
    raceLevelBaseOffset: INITIAL_RACE_LEVEL_OFFSET,
    skillLevelFields: SKILL_LEVEL_FIELDS,
    statusGrowthDivisor: STATUS_GROWTH_DIVISOR,
    toSafeNumber
  });
}

function buildUnitResistances(raceRow, classRow) {
  return buildUnitResistancesUtil(raceRow, classRow, {
    resistanceFields: RESISTANCE_FIELDS,
    toSafeNumber
  });
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

function formatStatusCompact(status) {
  return formatStatusCompactUtil(status);
}

function buildCharacterStatusFromRules(raceRow, classRow, level, options = {}) {
  return buildCharacterStatusFromRulesUtil({
    raceRow,
    classRow,
    level,
    raceLevels: options?.raceLevels,
    classLevels: options?.classLevels,
    isHumanRace: raceIsHumanType(raceRow),
    statusGrowthFields: STATUS_GROWTH_FIELDS,
    toSafeNumber,
    initialLevelMin: INITIAL_LEVEL_MIN,
    initialLevelMax: INITIAL_LEVEL_MAX,
    raceLevelBaseOffset: INITIAL_RACE_LEVEL_OFFSET,
    statusGrowthDivisor: STATUS_GROWTH_DIVISOR,
    defaultSizBase: 100
  });
}

function buildEnemyCharacterStatusFromRules(raceRow, classRow, level, options = {}) {
  return buildCharacterStatusFromRulesUtil({
    raceRow,
    classRow: classRow || {},
    level,
    raceLevels: options?.raceLevels,
    classLevels: options?.classLevels,
    isHumanRace: raceIsHumanType(raceRow),
    statusGrowthFields: STATUS_GROWTH_FIELDS,
    toSafeNumber,
    initialLevelMin: 1,
    initialLevelMax: ENEMY_LEVEL_MAX,
    raceLevelBaseOffset: INITIAL_RACE_LEVEL_OFFSET,
    statusGrowthDivisor: STATUS_GROWTH_DIVISOR,
    defaultSizBase: 100
  });
}

function collectEnemySpawnTerrainKeys(data, x, y) {
  const set = new Set();
  const terrain = nonEmptyText(data?.grid?.[y]?.[x]);
  if (terrain) set.add(terrain);
  const relief = nonEmptyText(data?.reliefMap?.[y]?.[x]);
  if (relief === "山岳") set.add("山岳");
  const special = nonEmptyText(data?.specialMap?.[y]?.[x]);
  if (special) set.add(special);
  const key = coordKey(x, y);
  if (data?.riverData?.riverSet?.has(key)) set.add("河川");
  if (data?.lavaMap?.[y]?.[x]) set.add("溶岩");
  return Array.from(set);
}

function resolveEnemyBaseLevelByTile(data, x, y, isStrongTile) {
  const rawHeightLevel = Math.floor(toSafeNumber(data?.heightLevelMap?.[y]?.[x], 0));
  const heightDistanceFromZero = Math.abs(rawHeightLevel) + (isStrongTile ? ENEMY_STRONG_HEIGHT_BONUS : 0);
  const jitter = randomInt(ENEMY_LEVEL_JITTER_MIN, ENEMY_LEVEL_JITTER_MAX);
  const level = ENEMY_LEVEL_BASE + (ENEMY_LEVEL_PER_HEIGHT * heightDistanceFromZero) + jitter;
  return Math.max(1, Math.min(ENEMY_LEVEL_MAX, Math.floor(level)));
}

function resolveEnemySpawnCountByTile(rule) {
  if (!rule?.spawnCountExplicit) return 1;
  const min = Math.max(1, Math.floor(toSafeNumber(rule?.spawnCountMin, 1)));
  const max = Math.max(min, Math.floor(toSafeNumber(rule?.spawnCountMax, min)));
  return randomInt(min, max);
}

function levelDistanceFromRange(level, min, max) {
  if (level < min) return min - level;
  if (level > max) return level - max;
  return 0;
}

function pickEnemyRule(candidates, baseLevel, preferClosestRange = false) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  if (!preferClosestRange) return randomPick(candidates, null);
  let minDistance = Number.POSITIVE_INFINITY;
  const near = [];
  for (const row of candidates) {
    const d = levelDistanceFromRange(baseLevel, Math.max(1, Math.floor(toSafeNumber(row?.lvMin, 1))), Math.max(1, Math.floor(toSafeNumber(row?.lvMax, 1))));
    if (d < minDistance) {
      minDistance = d;
      near.length = 0;
      near.push(row);
    } else if (d === minDistance) {
      near.push(row);
    }
  }
  return randomPick(near, randomPick(candidates, null));
}

function clampEnemyLevel(levelRaw) {
  return Math.max(1, Math.min(ENEMY_LEVEL_MAX, Math.floor(toSafeNumber(levelRaw, 1))));
}

function resolveNormalEnemyLevel(baseLevel, rule, spawnCount) {
  const lvMin = Math.max(1, Math.floor(toSafeNumber(rule?.lvMin, 1)));
  const lvMax = Math.max(lvMin, Math.floor(toSafeNumber(rule?.lvMax, lvMin)));
  const countPenalty = Math.max(0, Math.floor(toSafeNumber(spawnCount, 1)) - 1) * 2;
  const adjustedMax = Math.max(lvMin, lvMax - countPenalty);
  const normalizedBase = Math.floor(toSafeNumber(baseLevel, lvMin));
  const clamped = Math.max(lvMin, Math.min(adjustedMax, normalizedBase));
  return clampEnemyLevel(clamped);
}

function buildEnemySpawnDataForMap(data) {
  if (!data || data.shapeOnly || !Number.isFinite(data?.w) || !Number.isFinite(data?.h) || !Array.isArray(data?.grid)) {
    return {
      enemySpawnMap: null,
      enemySpawnStats: null
    };
  }
  if (Array.isArray(data.enemySpawnMap) && data.enemySpawnMap.length === data.h) {
    return {
      enemySpawnMap: data.enemySpawnMap,
      enemySpawnStats: data.enemySpawnStats || null
    };
  }
  const rows = enemySpawnRows.value;
  const rulesByTerrain = enemySpawnRulesByTerrain.value;
  if (!rows.length || !rulesByTerrain.size) {
      return {
        enemySpawnMap: Array.from({ length: data.h }, () => Array.from({ length: data.w }, () => null)),
        enemySpawnStats: {
          total: 0,
          totalUnits: 0,
          strongTileCount: 0,
          byTerrain: {}
        }
    };
  }

  const enemySpawnMap = Array.from({ length: data.h }, () => Array.from({ length: data.w }, () => null));
  const stats = {
    total: 0,
    totalUnits: 0,
    strongTileCount: 0,
    byTerrain: {}
  };

  for (let y = 0; y < data.h; y += 1) {
    for (let x = 0; x < data.w; x += 1) {
      const terrainKeys = collectEnemySpawnTerrainKeys(data, x, y);
      if (!terrainKeys.length) continue;
      const isStrongTile = data?.strongMonsterMap?.[y]?.[x] === "強敵候補";
      const baseLevel = resolveEnemyBaseLevelByTile(data, x, y, isStrongTile);
      const terrainCandidates = [];
      const candidates = [];
      for (const terrainKey of terrainKeys) {
        const pool = rulesByTerrain.get(terrainKey) || [];
        for (const rule of pool) {
          const merged = { ...rule, matchedTerrain: terrainKey };
          terrainCandidates.push(merged);
          if (baseLevel < rule.lvMin || baseLevel > rule.lvMax) continue;
          candidates.push(merged);
        }
      }
      let picked = pickEnemyRule(candidates, baseLevel, false);
      if (!picked && isStrongTile) {
        picked = pickEnemyRule(terrainCandidates, baseLevel, true);
      }
      if (!picked && isStrongTile) {
        const globalFallback = rows.map(row => ({ ...row, matchedTerrain: row.terrainKey }));
        picked = pickEnemyRule(globalFallback, baseLevel, true);
      }
      if (!picked) continue;
      const spawnCount = resolveEnemySpawnCountByTile(picked);
      if (spawnCount <= 0) continue;

      let raceRow = findClassRowByName(picked.raceName);
      if (!raceRow && isStrongTile) {
        const fallbackPool = [
          ...terrainCandidates,
          ...rows.map(row => ({ ...row, matchedTerrain: row.terrainKey }))
        ];
        const validPool = fallbackPool.filter(row => !!findClassRowByName(row.raceName));
        const fallbackPicked = pickEnemyRule(validPool, baseLevel, true);
        if (fallbackPicked) {
          picked = fallbackPicked;
          raceRow = findClassRowByName(picked.raceName);
        }
      }
      if (!raceRow) continue;
      const classRow = picked.className ? findClassRowByName(picked.className) : null;
      const tileEnemies = [];

      const tileMaxRuleLevel = terrainCandidates.length
        ? terrainCandidates.reduce((maxLv, row) => Math.max(maxLv, Math.max(1, Math.floor(toSafeNumber(row?.lvMax, baseLevel)))), Math.max(1, baseLevel))
        : Math.max(1, baseLevel);

      const pushEnemyRecord = (enemyLevel, index, role, groupCount, roleBaseLevel) => {
        const progression = classRow
          ? resolveGrowthLevelsForUnitLevel(raceRow, enemyLevel, ENEMY_LEVEL_MAX)
          : { raceLevels: enemyLevel, classLevels: 0 };
        const raceLevels = Math.max(0, Math.floor(toSafeNumber(progression.raceLevels, 0)));
        const classLevels = Math.max(0, Math.floor(toSafeNumber(progression.classLevels, 0)));
        const built = buildEnemyCharacterStatusFromRules(raceRow, classRow || {}, enemyLevel, {
          raceLevels,
          classLevels
        });
        const skillLevels = buildUnitSkillLevelsFromClass(raceRow, classRow || {}, built.raceLevels, built.classLevels);
        const resistances = buildUnitResistances(raceRow, classRow || {});
        const skills = buildUnitSkillsForProgression({
          raceRow,
          classRow: classRow || {},
          raceLevels: built.raceLevels,
          classLevels: built.classLevels
        });
        tileEnemies.push({
          id: `enemy-${x}-${y}-${index}`,
          name: picked.displayName || picked.raceName,
          race: nonEmptyText(raceRow?.名前) || picked.raceName,
          className: classRow ? nonEmptyText(classRow?.名前) : "",
          level: built.level,
          baseLevel: roleBaseLevel,
          targetLevel: enemyLevel,
          matchedTerrain: picked.matchedTerrain,
          strong: isStrongTile,
          strongRole: role,
          strongGroupSize: groupCount,
          equipmentTier: isStrongTile ? ENEMY_STRONG_EQUIPMENT_TIER : "",
          armamentNames: Array.isArray(picked.armamentNames) ? [...picked.armamentNames] : [],
          status: built.status,
          skillLevels,
          skills,
          resistances,
          spawnCount: groupCount,
          spawnIndex: index + 1,
          growthRule: {
            raceLevels: built.raceLevels,
            classLevels: built.classLevels,
            raceLevelBonus: 0
          }
        });
      };

      if (isStrongTile) {
        const hasArmament = !!picked.hasArmament;
        const leaderLevel = clampEnemyLevel(
          tileMaxRuleLevel
            + ENEMY_STRONG_LEADER_LEVEL_BONUS
            + (hasArmament ? 0 : ENEMY_STRONG_NO_ARMAMENT_LEVEL_BONUS)
        );
        const followerLevel = clampEnemyLevel(Math.floor(tileMaxRuleLevel * ENEMY_STRONG_FOLLOWER_LEVEL_SCALE));
        const followerCount = randomInt(ENEMY_STRONG_FOLLOWER_MIN, ENEMY_STRONG_FOLLOWER_MAX);
        const groupCount = 1 + followerCount;
        pushEnemyRecord(leaderLevel, 0, "leader", groupCount, leaderLevel);
        for (let i = 0; i < followerCount; i += 1) {
          pushEnemyRecord(followerLevel, i + 1, "follower", groupCount, followerLevel);
        }
      } else {
        const normalEnemyLevel = resolveNormalEnemyLevel(baseLevel, picked, spawnCount);
        for (let i = 0; i < spawnCount; i += 1) {
          pushEnemyRecord(normalEnemyLevel, i, "normal", spawnCount, normalEnemyLevel);
        }
      }
      enemySpawnMap[y][x] = tileEnemies;

      stats.total += 1;
      stats.totalUnits += tileEnemies.length;
      if (isStrongTile) stats.strongTileCount += 1;
      stats.byTerrain[picked.matchedTerrain] = Math.max(0, Math.floor(toSafeNumber(stats.byTerrain[picked.matchedTerrain], 0))) + tileEnemies.length;
    }
  }

  return {
    enemySpawnMap,
    enemySpawnStats: stats
  };
}

function enemiesAt(x, y, data = currentData.value) {
  const list = data?.enemySpawnMap?.[y]?.[x];
  if (!Array.isArray(list)) return [];
  return list.filter(Boolean);
}

function clearCharacterGenerationState() {
  applyingTestPlayerState = true;
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
  applyingTestPlayerState = false;
  resetTestPlayerSlotsFromLiveState();
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

function clampUnitLevel(value, fallback = INITIAL_LEVEL_MIN, maxLevel = INITIAL_LEVEL_MAX) {
  const safe = Math.round(toSafeNumber(value, fallback));
  const cappedMax = Math.max(1, Math.floor(toSafeNumber(maxLevel, INITIAL_LEVEL_MAX)));
  return Math.max(1, Math.min(cappedMax, safe));
}

function resolveGrowthLevelsForUnitLevel(raceRow, totalLevel, maxLevel = INITIAL_LEVEL_MAX) {
  const level = clampUnitLevel(totalLevel, INITIAL_LEVEL_MIN, maxLevel);
  if (raceIsHumanType(raceRow)) {
    return { raceLevels: 0, classLevels: level };
  }
  let raceLevels = 0;
  let classLevels = 0;
  for (let lv = 1; lv <= level; lv += 1) {
    if (lv % 2 === 1) {
      raceLevels += 1;
    } else {
      classLevels += 1;
    }
  }
  return { raceLevels, classLevels };
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
  fixedClassLevels = null,
  fixedRaceLevels = null,
  secondaryClassName = ""
}) {
  const hasFixedLevel = fixedLevel !== undefined && fixedLevel !== null;
  const level = hasFixedLevel
    ? clampUnitLevel(fixedLevel, INITIAL_LEVEL_MIN)
    : randomInt(INITIAL_LEVEL_MIN, INITIAL_LEVEL_MAX);
  const progression = resolveGrowthLevelsForUnitLevel(raceRow, level);
  const raceLevels = fixedRaceLevels == null ? progression.raceLevels : Math.max(0, Math.floor(toSafeNumber(fixedRaceLevels, progression.raceLevels)));
  const classLevels = fixedClassLevels == null ? progression.classLevels : Math.max(0, Math.floor(toSafeNumber(fixedClassLevels, progression.classLevels)));
  const secondaryClass = nonEmptyText(secondaryClassName);
  const secondaryClassRow = secondaryClass ? findClassRowByName(secondaryClass) : null;
  const secondaryClassLevels = raceIsHumanType(raceRow) && level >= 10 && secondaryClassRow ? 1 : 0;
  const built = buildCharacterStatusFromRules(raceRow, classRow, level, {
    raceLevels,
    classLevels
  });
  const baseSkillLevels = buildUnitSkillLevelsFromClass(raceRow, classRow, built.raceLevels, built.classLevels);
  const namedBonus = applyNamedStatusSkillBonus(
    built.status,
    baseSkillLevels,
    !!isNamed && !isSovereign
  );
  const equipmentSlots = buildEquipmentSlotsFromClassRow(raceRow || classRow || {});
  const equipment = chooseEquipmentForClass(classRow, isNamed || isSovereign, equipmentSlots);
  const baseResistances = buildUnitResistances(raceRow, classRow);
  const resistances = mergeResistances(baseResistances, buildEquipmentResistanceBonus(equipment));
  const moveRange = 6;
  const normalizedType = isSovereign ? "統治者" : (isNamed ? "ネームド" : unitType);
  const resolvedRace = nonEmptyText(raceLabel) || nonEmptyText(props.selectedRace) || nonEmptyText(raceRow?.名前) || "未設定";
  const iconName = resolveDefaultUnitIconName({
    raceName: resolvedRace,
    className: nonEmptyText(classRow?.名前),
    classRow,
    raceRow
  });
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
    status: namedBonus.status,
    skillLevels: namedBonus.skillLevels,
    baseResistances,
    resistances,
    growthRule: {
      raceLevels: built.raceLevels,
      classLevels: built.classLevels,
      classBonus: built.classBonus,
      classPerLevelGain: built.classPerLevelGain,
      secondaryClassName: secondaryClassRow ? nonEmptyText(secondaryClassRow?.名前) : "",
      secondaryClassLevels
    },
    secondaryClassName: secondaryClassRow ? nonEmptyText(secondaryClassRow?.名前) : "",
    skills: buildUnitSkillsForProgression({
      raceRow,
      classRow,
      raceLevels: built.raceLevels,
      classLevels: built.classLevels,
      secondaryClassRow,
      secondaryClassLevels
    })
  };
}

function resolveSecondaryClassCandidates(mainClassName = "") {
  const main = nonEmptyText(mainClassName);
  return jobClassRows.value.filter(row => {
    const name = nonEmptyText(row?.名前);
    if (!name) return false;
    return name !== main;
  });
}

function rebuildUnitByLevelRules(unit, options = {}) {
  if (!unit) return { ok: false, reason: "対象ユニットが見つかりません。" };
  const raceName = nonEmptyText(unit?.race) || nonEmptyText(props.selectedRace) || "只人";
  const className = nonEmptyText(unit?.className) || nonEmptyText(props.selectedClass);
  const raceRow = findClassRowByName(resolveRaceBaseClassName(raceName)) || null;
  const classRow = findClassRowByName(className) || null;
  if (!raceRow) return { ok: false, reason: "種族データが見つかりません。" };
  if (!classRow) return { ok: false, reason: "クラスデータが見つかりません。" };

  const nextLevel = clampUnitLevel(options?.level ?? unit?.level, unit?.level || INITIAL_LEVEL_MIN);
  const progression = resolveGrowthLevelsForUnitLevel(raceRow, nextLevel);
  const built = buildCharacterStatusFromRules(raceRow, classRow, nextLevel, {
    raceLevels: progression.raceLevels,
    classLevels: progression.classLevels
  });

  let secondaryClassName = nonEmptyText(options?.secondaryClassName || unit?.secondaryClassName);
  let secondaryClassRow = secondaryClassName ? findClassRowByName(secondaryClassName) : null;
  if (secondaryClassName && !secondaryClassRow) {
    secondaryClassName = "";
    secondaryClassRow = null;
  }
  const human = raceIsHumanType(raceRow);
  if (!human || nextLevel < 10) {
    secondaryClassName = "";
    secondaryClassRow = null;
  }
  if (human && nextLevel >= 10 && !secondaryClassRow && options?.autoPickSecondaryClass) {
    const candidates = resolveSecondaryClassCandidates(className);
    const picked = randomPick(candidates, null);
    if (picked) {
      secondaryClassName = nonEmptyText(picked?.名前);
      secondaryClassRow = picked;
    }
  }
  const secondaryClassLevels = (human && nextLevel >= 10 && secondaryClassRow) ? 1 : 0;
  const equipment = normalizeEquipmentList(unit?.equipment);
  const baseResistances = buildUnitResistances(raceRow, classRow);
  const resistances = mergeResistances(baseResistances, buildEquipmentResistanceBonus(equipment));
  const baseSkillLevels = buildUnitSkillLevelsFromClass(raceRow, classRow, built.raceLevels, built.classLevels);
  const namedBonus = applyNamedStatusSkillBonus(
    built.status,
    baseSkillLevels,
    !!unit?.isNamed && !isSovereignUnit(unit)
  );

  const nextUnit = {
    ...unit,
    level: built.level,
    status: namedBonus.status,
    skillLevels: namedBonus.skillLevels,
    baseResistances,
    resistances,
    growthRule: {
      ...(unit?.growthRule || {}),
      raceLevels: built.raceLevels,
      classLevels: built.classLevels,
      classBonus: built.classBonus,
      classPerLevelGain: built.classPerLevelGain,
      secondaryClassName,
      secondaryClassLevels
    },
    secondaryClassName,
    skills: buildUnitSkillsForProgression({
      raceRow,
      classRow,
      raceLevels: built.raceLevels,
      classLevels: built.classLevels,
      secondaryClassRow,
      secondaryClassLevels
    })
  };
  return {
    ok: true,
    unit: nextUnit,
    level: built.level,
    raceLevels: built.raceLevels,
    classLevels: built.classLevels,
    secondaryClassName
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
  const selectedRaceName = resolveActiveFactionRace();
  const initialPopulation = resolveInitialVillagePopulationByRace(selectedRaceName);
  const chosenVillageName = nonEmptyText(props.selectedVillageName);
  const pendingVillageName = chosenVillageName || randomPick(VILLAGE_NAME_POOL, "開拓村");
  const pendingPopulation = initialPopulation;
  const pendingFoodByType = buildEmptyResourceBag(FOOD_RESOURCE_KEYS);
  const pendingMaterialByType = buildEmptyResourceBag(MATERIAL_RESOURCE_KEYS);

  villageState.value = {
    id: "village-pending",
    name: pendingVillageName,
    x: null,
    y: null,
    placed: false,
    cityLevels: normalizeCityLevels({}),
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
  const unitCostPreview = buildUnitCreationCost(1);
  unitRulesInfoText.value = `キャラ生成ルール: 初期統治者は自動生成 / 村人口(勢力初期人数): ${pendingPopulation} 固定 / モブ上限: 人口の1/10 / ネームド上限 村2 町4 都市7 / ユニット作成(仮) 食料 ${formatFoodResourceBag(unitCostPreview.food)} + 資材 ${formatMaterialResourceBag(unitCostPreview.material)} / ターン順: 領土収入→ユニット維持費→村人口消費→不足判定`;
  updateUnitInfoText(`統治者を作成: ${sovereignUnit.name} / ${sovereignUnit.race} / ${sovereignUnit.className} / 村配置先を選択してください。`);
  if (testPlayerSlots.value.length > 1) {
    syncActiveTestPlayerSlotFromLiveState();
  } else {
    resetTestPlayerSlotsFromLiveState();
  }
  emitCharacterStateChange();
}

function buildGameStartPlacementConfig(command = {}) {
  const randomPlacementEnabled = command?.randomPlacementEnabled !== false;
  const modeRaw = nonEmptyText(command?.playerPlacementMode);
  const playerPlacementMode = GAME_START_PLAYER_PLACEMENT_MODE_VALUES.has(modeRaw)
    ? modeRaw
    : GAME_START_PLAYER_PLACEMENT_MODE_ALL_RANDOM;
  return {
    randomPlacementEnabled,
    playerPlacementMode
  };
}

function resolveFactionEntryForSlot(slot, fallbackIndex = 0, placementConfig = {}) {
  const slotId = nonEmptyText(slot?.id) || `player-${fallbackIndex + 1}`;
  const units = Array.isArray(slot?.factionState?.units) ? slot.factionState.units : [];
  const race = resolveRaceFromUnitList(units)
    || nonEmptyText(slot?.race)
    || nonEmptyText(props.selectedRace)
    || "只人";
  const placementSpec = resolveFactionPlacementSpecByRace(race);
  const isPlayer = slot?.isPlayer != null
    ? !!slot.isPlayer
    : (fallbackIndex === 0 || nonEmptyText(slot?.label).startsWith("プレイヤー"));
  const strategy = resolveSlotPlacementStrategy({ ...slot, isPlayer }, placementConfig);
  return {
    id: slotId,
    label: nonEmptyText(slot?.label) || `勢力${fallbackIndex + 1}`,
    race,
    isPlayer,
    strategy,
    preferredBaseTerrains: placementSpec.preferredBaseTerrains,
    preferredSpecialTerrains: placementSpec.preferredSpecialTerrains,
    preferredHeightLevel: placementSpec.preferredHeightLevel
  };
}

function isVillagePlaceableTerrain(data, x, y) {
  const terrain = nonEmptyText(data?.grid?.[y]?.[x]);
  if (!terrain) return false;
  if (terrain === "海" || terrain === "湖" || terrain === "火山") return false;
  return true;
}

function evaluateFactionTileSuitability(data, entry, x, y) {
  const terrain = nonEmptyText(data?.grid?.[y]?.[x]);
  const special = nonEmptyText(data?.specialMap?.[y]?.[x]);
  const heightLevelRaw = Number(data?.heightLevelMap?.[y]?.[x]);
  const preferredBaseTerrains = entry?.preferredBaseTerrains instanceof Set ? entry.preferredBaseTerrains : new Set();
  const preferredSpecialTerrains = entry?.preferredSpecialTerrains instanceof Set ? entry.preferredSpecialTerrains : new Set();
  const preferredHeightLevel = Number.isFinite(entry?.preferredHeightLevel) ? entry.preferredHeightLevel : null;

  const hasTerrainPreference = preferredBaseTerrains.size > 0 || preferredSpecialTerrains.size > 0;
  const terrainMatch = preferredBaseTerrains.has(terrain);
  const specialMatch = preferredSpecialTerrains.has(special);
  const terrainScore = hasTerrainPreference ? ((terrainMatch || specialMatch) ? 1 : 0) : 0.6;

  let heightScore = 0.55;
  if (preferredHeightLevel != null && Number.isFinite(heightLevelRaw)) {
    const diff = Math.abs(Math.floor(heightLevelRaw) - preferredHeightLevel);
    heightScore = Math.max(0, 1 - (diff / 4));
  } else if (preferredHeightLevel != null) {
    heightScore = 0.25;
  }

  const total = (terrainScore * 0.72) + (heightScore * 0.28);
  return {
    total,
    terrainScore,
    heightScore,
    matched: terrainMatch || specialMatch,
    terrain,
    special,
    heightLevel: Number.isFinite(heightLevelRaw) ? Math.floor(heightLevelRaw) : null
  };
}

function resolvePlacementMinDistanceByMap(data, factionCount) {
  const side = Math.max(1, Math.min(data?.w || 0, data?.h || 0));
  const baseDistance = Math.max(2, Math.floor(side * 0.17));
  const scale = Math.max(0.55, Math.sqrt(4 / Math.max(2, factionCount)));
  return Math.max(2, Math.floor(baseDistance * scale));
}

function planFactionVillagePlacements(data, entries, placementConfig = {}, options = {}) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const fixedPlacements = Array.isArray(options?.fixedPlacements)
    ? options.fixedPlacements
      .filter(row => row && Number.isFinite(row.x) && Number.isFinite(row.y))
      .map(row => ({
        ...row,
        key: coordKey(row.x, row.y)
      }))
    : [];
  const fixedSlotIds = new Set(fixedPlacements.map(row => nonEmptyText(row?.slotId)).filter(Boolean));
  const candidates = [];
  for (let y = 0; y < (data?.h || 0); y += 1) {
    for (let x = 0; x < (data?.w || 0); x += 1) {
      if (!isVillagePlaceableTerrain(data, x, y)) continue;
      candidates.push({ x, y, key: coordKey(x, y) });
    }
  }
  const autoEntries = safeEntries.filter(entry => entry.strategy !== "manual" && !fixedSlotIds.has(nonEmptyText(entry?.id)));
  const manualEntries = safeEntries.filter(entry => entry.strategy === "manual");
  const placementMinDistance = resolvePlacementMinDistanceByMap(data, Math.max(1, safeEntries.length));
  const used = new Set(fixedPlacements.map(row => row.key));
  const placements = fixedPlacements.map(row => ({
    ...row,
    minDist: placementMinDistance,
    suitability: evaluateFactionTileSuitability(
      data,
      safeEntries.find(entry => nonEmptyText(entry?.id) === nonEmptyText(row?.slotId)) || null,
      row.x,
      row.y
    )
  }));
  const sortedAutoEntries = [...autoEntries].sort((a, b) => {
    const aPref = (a.preferredBaseTerrains?.size || 0) + (a.preferredSpecialTerrains?.size || 0);
    const bPref = (b.preferredBaseTerrains?.size || 0) + (b.preferredSpecialTerrains?.size || 0);
    return aPref - bPref;
  });
  const bestSuitabilityBySlot = new Map();

  for (const entry of safeEntries) {
    let best = 0;
    for (const candidate of candidates) {
      const suit = evaluateFactionTileSuitability(data, entry, candidate.x, candidate.y);
      if (suit.total > best) best = suit.total;
    }
    bestSuitabilityBySlot.set(entry.id, best);
  }

  for (const entry of sortedAutoEntries) {
    let bestPick = null;
    for (const candidate of candidates) {
      if (used.has(candidate.key)) continue;
      const suit = evaluateFactionTileSuitability(data, entry, candidate.x, candidate.y);
      const minDist = placements.length
        ? placements.reduce((best, placed) => Math.min(best, hexDistance(candidate, placed)), Number.POSITIVE_INFINITY)
        : placementMinDistance;
      const distScore = Math.min(1.25, minDist / Math.max(1, placementMinDistance));
      const tooClosePenalty = minDist < Math.max(2, Math.floor(placementMinDistance * 0.65)) ? 16 : 0;
      const randomJitter = entry.strategy === "random" ? Math.random() * 5.5 : 0;
      const score = (suit.total * 100) + (distScore * 38) + (suit.matched ? 10 : -6) + randomJitter - tooClosePenalty;
      if (!bestPick || score > bestPick.score) {
        bestPick = {
          ...candidate,
          score,
          suitability: suit,
          minDist
        };
      }
    }
    if (!bestPick) continue;
    used.add(bestPick.key);
    placements.push({
      x: bestPick.x,
      y: bestPick.y,
      key: bestPick.key,
      slotId: entry.id,
      race: entry.race,
      label: entry.label,
      minDist: bestPick.minDist,
      suitability: bestPick.suitability
    });
  }

  const assignmentBySlot = new Map(
    fixedPlacements
      .map(row => [nonEmptyText(row?.slotId), row])
      .filter(row => !!row[0])
  );
  for (const placed of placements) {
    const slotId = nonEmptyText(placed?.slotId);
    if (slotId) assignmentBySlot.set(slotId, placed);
  }

  const placedSuitabilityTotal = placements.reduce((sum, row) => sum + (row.suitability?.total || 0), 0);
  const matchedCount = placements.reduce((sum, row) => sum + (row.suitability?.matched ? 1 : 0), 0);
  const minPairDistance = placements.length > 1
    ? placements.reduce((best, row, idx) => {
      let rowBest = Number.POSITIVE_INFINITY;
      for (let i = 0; i < placements.length; i += 1) {
        if (i === idx) continue;
        rowBest = Math.min(rowBest, hexDistance(row, placements[i]));
      }
      return Math.min(best, rowBest);
    }, Number.POSITIVE_INFINITY)
    : placementMinDistance;
  const supportedCount = safeEntries.reduce((sum, entry) => sum + ((bestSuitabilityBySlot.get(entry.id) || 0) >= 0.70 ? 1 : 0), 0);
  const score = (Math.max(0, placements.length - fixedPlacements.length) * 1000)
    + (matchedCount * 220)
    + (supportedCount * 140)
    + Math.round(placedSuitabilityTotal * 100)
    + Math.round((Number.isFinite(minPairDistance) ? minPairDistance : 0) * 10);

  return {
    placementMinDistance,
    entries: safeEntries,
    autoEntries,
    manualEntries,
    placements,
    assignmentBySlot,
    bestSuitabilityBySlot,
    supportedCount,
    matchedCount,
    score,
    allAutoPlaced: placements.length >= (autoEntries.length + fixedPlacements.length),
    avgPlacedSuitability: placements.length ? placedSuitabilityTotal / placements.length : 0
  };
}

function buildFactionStateWithVillagePlacement(slot, data, placement) {
  const slotId = nonEmptyText(slot?.id) || DEFAULT_TEST_PLAYER_ID;
  const fallbackNo = (slotId.match(/\d+/)?.[0]) || "1";
  const baseState = deepCloneJsonValue(slot?.factionState, null)
    || createDraftFactionStateForAdditionalPlayer(slotId, fallbackNo);
  const raceName = resolveRaceFromUnitList(baseState?.units || [])
    || nonEmptyText(slot?.race)
    || nonEmptyText(props.selectedRace)
    || "只人";
  const initialPopulation = resolveInitialVillagePopulationByRace(raceName);
  const initialStock = buildInitialVillageStockByTerritory(data, placement.x, placement.y);
  const defaultFoodByType = initialStock.food;
  const defaultMaterialByType = initialStock.material;
  const baseVillage = baseState.village || {
    id: `${slotId}-village-pending`,
    name: randomPick(VILLAGE_NAME_POOL, "開拓村"),
    cityLevels: normalizeCityLevels({}),
    buildings: [],
    population: initialPopulation,
    populationByRace: {
      [raceName]: initialPopulation
    },
    foodStockByType: defaultFoodByType,
    materialStockByType: defaultMaterialByType,
    foodStock: sumResourceBag(defaultFoodByType, FOOD_RESOURCE_KEYS),
    materialStock: sumResourceBag(defaultMaterialByType, MATERIAL_RESOURCE_KEYS)
  };
  const village = ensureVillageStateShape({
    ...baseVillage,
    id: `${slotId}-village-${placement.x}-${placement.y}`,
    x: placement.x,
    y: placement.y,
    placed: true,
    foodStockByType: defaultFoodByType,
    materialStockByType: defaultMaterialByType
  }, raceName);
  const units = Array.isArray(baseState.units)
    ? baseState.units.map(unit => ({
      ...unit,
      x: placement.x,
      y: placement.y,
      moveRemaining: Math.max(0, Math.floor(toSafeNumber(unit?.moveRange, 0)))
    }))
    : [];
  const tileKey = coordKey(placement.x, placement.y);
  return {
    ...baseState,
    village,
    units,
    selectedUnitId: units[0]?.id || "",
    villagePlacementMode: false,
    unitMoveMode: false,
    visibility: {
      exploredTileKeys: [tileKey],
      visibleTileKeys: [tileKey],
      spottedEnemyTileKeys: [],
      spottedFactionTileKeys: []
    }
  };
}

function buildFactionStateWithPendingVillage(slot) {
  const slotId = nonEmptyText(slot?.id) || DEFAULT_TEST_PLAYER_ID;
  const fallbackNo = (slotId.match(/\d+/)?.[0]) || "1";
  const baseState = deepCloneJsonValue(slot?.factionState, null)
    || createDraftFactionStateForAdditionalPlayer(slotId, fallbackNo);
  const baseRace = resolveRaceFromUnitList(baseState?.units || [])
    || nonEmptyText(slot?.race)
    || nonEmptyText(props.selectedRace)
    || "只人";
  const population = resolveInitialVillagePopulationByRace(baseRace);
  const nextVillage = ensureVillageStateShape({
    ...(baseState.village || {}),
    id: `${slotId}-village-pending`,
    name: nonEmptyText(baseState?.village?.name) || randomPick(VILLAGE_NAME_POOL, "開拓村"),
    x: null,
    y: null,
    placed: false,
    population,
    populationByRace: {
      [baseRace]: population
    },
    cityLevels: normalizeCityLevels(baseState?.village?.cityLevels || {}),
    buildings: normalizeVillageBuildings(baseState?.village?.buildings || []),
    foodStockByType: buildEmptyResourceBag(FOOD_RESOURCE_KEYS),
    materialStockByType: buildEmptyResourceBag(MATERIAL_RESOURCE_KEYS)
  }, baseRace);
  return {
    ...baseState,
    village: nextVillage,
    villagePlacementMode: true,
    unitMoveMode: false,
    visibility: {
      exploredTileKeys: [],
      visibleTileKeys: [],
      spottedEnemyTileKeys: [],
      spottedFactionTileKeys: []
    }
  };
}

function applyFactionPlacementsToSlots(data, plan, placementConfig = {}) {
  const slots = Array.isArray(testPlayerSlots.value) ? [...testPlayerSlots.value] : [];
  if (!slots.length) return { autoPlacedCount: 0, manualPlayerCount: 0 };
  const assignmentBySlot = plan?.assignmentBySlot instanceof Map ? plan.assignmentBySlot : new Map();
  const activeBefore = nonEmptyText(activeTestPlayerId.value);

  const nextSlots = slots.map((slot, idx) => {
    const entry = resolveFactionEntryForSlot(slot, idx, placementConfig);
    const placement = assignmentBySlot.get(entry.id);
    const slotVillagePlaced = !!slot?.factionState?.village?.placed;
    let nextState = null;
    if (placement && !(entry.strategy === "manual" && slotVillagePlaced)) {
      nextState = buildFactionStateWithVillagePlacement(slot, data, placement);
    } else if (entry.strategy === "manual") {
      nextState = slotVillagePlaced
        ? deepCloneJsonValue(slot?.factionState, null)
        : buildFactionStateWithPendingVillage(slot);
    } else {
      nextState = deepCloneJsonValue(slot?.factionState, null);
    }
    return {
      ...slot,
      race: entry.race,
      ready: false,
      factionState: nextState || slot?.factionState
    };
  });
  testPlayerSlots.value = nextSlots;

  const firstManualPlayer = nextSlots.find((slot, idx) => {
    const entry = resolveFactionEntryForSlot(slot, idx, placementConfig);
    return entry.strategy === "manual" && entry.isPlayer && !slot?.factionState?.village?.placed;
  }) || null;
  const restoreId = firstManualPlayer?.id
    || (nextSlots.some(slot => nonEmptyText(slot?.id) === activeBefore) ? activeBefore : nonEmptyText(nextSlots[0]?.id) || DEFAULT_TEST_PLAYER_ID);
  activeTestPlayerId.value = restoreId;
  const restoreSlot = nextSlots.find(slot => nonEmptyText(slot?.id) === restoreId) || null;
  if (restoreSlot?.factionState) {
    applyFactionStateSnapshotToLiveState(restoreSlot.factionState, { emitState: true, render: false });
  } else {
    emitCharacterStateChange();
  }

  if (firstManualPlayer) {
    villagePlacementMode.value = true;
    unitMoveMode.value = false;
    showMoveUnitModal.value = false;
    mapClickInfo.value = "クリック座標: 初期村の配置先タイルをクリックしてください。";
    updateUnitInfoText(`${firstManualPlayer.label} は手動配置モードです。初期村の配置先をクリックしてください。`);
  }
  rebuildTerritorySets(data);
  rebuildVisibleTiles(data);
  renderMapWithPhaser();

  const autoPlacedCount = nextSlots.reduce((sum, slot) => {
    const placed = !!slot?.factionState?.village?.placed;
    return sum + (placed ? 1 : 0);
  }, 0);
  const manualPlayerCount = nextSlots.reduce((sum, slot, idx) => {
    const entry = resolveFactionEntryForSlot(slot, idx, placementConfig);
    return sum + ((entry.isPlayer && entry.strategy === "manual") ? 1 : 0);
  }, 0);
  return {
    autoPlacedCount,
    manualPlayerCount
  };
}

function generateTerrainMapForGameStart(entries, placementConfig = {}) {
  const { w, h } = parseMapSizeValue(mapSize.value);
  const islandCustomSettings = buildIslandCustomSettings();
  const attemptCount = Math.max(6, Math.min(20, 6 + (entries.length * 2)));
  let best = null;
  for (let i = 0; i < attemptCount; i += 1) {
    const data = createTerrainMapData({
      w,
      h,
      patternId: patternId.value,
      mountainMode: mountainMode.value,
      islandCustomSettings
    });
    data.worldWrapEnabled = !!customWorldWrapEnabled.value;
    const plan = planFactionVillagePlacements(data, entries, placementConfig);
    if (!best || plan.score > best.score) {
      best = {
        data,
        plan,
        score: plan.score,
        attempt: i + 1
      };
    }
    if (plan.allAutoPlaced && plan.supportedCount >= entries.length) break;
  }
  return best;
}

function collectFixedVillagePlacementsForSetup(entries = [], data = currentData.value) {
  const slots = Array.isArray(testPlayerSlots.value) ? testPlayerSlots.value : [];
  if (!slots.length || !Array.isArray(entries) || !entries.length) return [];
  const w = Number(data?.w);
  const h = Number(data?.h);
  const byEntryId = new Map(entries.map(entry => [nonEmptyText(entry?.id), entry]));
  const usedTileKeys = new Set();
  const fixed = [];
  for (const slot of slots) {
    const slotId = nonEmptyText(slot?.id);
    if (!slotId || !byEntryId.has(slotId)) continue;
    const village = slot?.factionState?.village || null;
    if (!village?.placed) continue;
    const x = Math.floor(toSafeNumber(village?.x, Number.NaN));
    const y = Math.floor(toSafeNumber(village?.y, Number.NaN));
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (Number.isFinite(w) && (x < 0 || x >= w)) continue;
    if (Number.isFinite(h) && (y < 0 || y >= h)) continue;
    const key = coordKey(x, y);
    if (usedTileKeys.has(key)) continue;
    usedTileKeys.add(key);
    const entry = byEntryId.get(slotId);
    fixed.push({
      slotId,
      label: nonEmptyText(slot?.label) || nonEmptyText(entry?.label) || slotId,
      race: nonEmptyText(slot?.race) || nonEmptyText(entry?.race) || "只人",
      x,
      y,
      key
    });
  }
  return fixed;
}

function prepareGameStartMap(command = {}) {
  ensureTestPlayerSlotsInitialized();
  const placementConfig = buildGameStartPlacementConfig(command);
  const entries = testPlayerSlots.value.map((slot, idx) => resolveFactionEntryForSlot(slot, idx, placementConfig));
  if (!entries.length) {
    updateUnitInfoText("開始失敗: 勢力データが未設定です。");
    return { ok: false, reason: "勢力未設定" };
  }
  const generated = generateTerrainMapForGameStart(entries, placementConfig);
  if (!generated?.data) {
    updateUnitInfoText("開始失敗: マップ生成に失敗しました。");
    return { ok: false, reason: "map_generation_failed" };
  }
  const activeIdBefore = nonEmptyText(activeTestPlayerId.value) || nonEmptyText(testPlayerSlots.value[0]?.id) || DEFAULT_TEST_PLAYER_ID;
  showEventModal.value = false;
  applyMapData(generated.data, { resetClock: true, rebuildCharacters: false });
  switchActiveTestPlayer(activeIdBefore, { emitState: true, render: false });
  const total = entries.length;
  const supportText = `${generated.plan.supportedCount}/${total}`;
  updateUnitInfoText(`開始マップ生成: 適正地形対応 ${supportText} / 最低距離目標 ${generated.plan.placementMinDistance} / 試行 ${generated.attempt}回`);
  renderMapWithPhaser();
  return { ok: true };
}

function finalizeGameStartSetup(command = {}) {
  ensureTestPlayerSlotsInitialized();
  syncActiveTestPlayerSlotFromLiveState();
  const placementConfig = buildGameStartPlacementConfig(command);
  const entries = testPlayerSlots.value.map((slot, idx) => resolveFactionEntryForSlot(slot, idx, placementConfig));
  if (!entries.length) {
    updateUnitInfoText("開始失敗: 勢力データが未設定です。");
    return { ok: false, reason: "勢力未設定" };
  }
  const reuseCurrentMap = !!command?.reuseCurrentMap && !!currentData.value && !currentData.value.shapeOnly;
  let mapData = null;
  let plan = null;
  let attemptCount = 1;
  showEventModal.value = false;
  if (reuseCurrentMap) {
    mapData = currentData.value;
    const fixedPlacements = collectFixedVillagePlacementsForSetup(entries, mapData);
    plan = planFactionVillagePlacements(mapData, entries, placementConfig, {
      fixedPlacements
    });
  } else {
    const generated = generateTerrainMapForGameStart(entries, placementConfig);
    if (!generated?.data) {
      updateUnitInfoText("開始失敗: マップ生成に失敗しました。");
      return { ok: false, reason: "map_generation_failed" };
    }
    mapData = generated.data;
    plan = generated.plan;
    attemptCount = generated.attempt;
    applyMapData(mapData, { resetClock: true, rebuildCharacters: false });
  }
  const placementResult = applyFactionPlacementsToSlots(mapData, plan, placementConfig);
  const placedCount = plan.placements.length;
  const total = entries.length;
  const minDistance = plan.placementMinDistance;
  const supportText = `${plan.supportedCount}/${total}`;
  const modeText = reuseCurrentMap ? "既存マップ維持" : `試行 ${attemptCount}回`;
  updateUnitInfoText(`開始配置完了: 自動配置 ${placedCount}/${total} / 適正地形対応 ${supportText} / 最低距離目標 ${minDistance} / ${modeText}`);
  pushNationLog(`開始配置: 自動 ${placementResult.autoPlacedCount}/${total} / 手動プレイヤー ${placementResult.manualPlayerCount} / 距離目標 ${minDistance} / ${modeText}`);
  emitCharacterStateChange();
  renderMapWithPhaser();
  return { ok: true };
}

function canPlaceVillageOnTile(picked) {
  if (!picked || !currentData.value) return false;
  const terrain = picked.rawTerrain || picked.terrain;
  if (!isPassableTerrain(terrain)) return false;
  if (terrain === "火山") return false;
  return true;
}

function placeVillageAt(x, y) {
  const selectedRaceName = resolveActiveFactionRace();
  const initialPopulation = resolveInitialVillagePopulationByRace(selectedRaceName);
  const initialStock = buildInitialVillageStockByTerritory(currentData.value, x, y);
  const defaultFoodByType = initialStock.food;
  const defaultMaterialByType = initialStock.material;
  const baseVillage = villageState.value || {
    id: "village-pending",
    name: randomPick(VILLAGE_NAME_POOL, "開拓村"),
    cityLevels: normalizeCityLevels({}),
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
    placed: true,
    foodStockByType: defaultFoodByType,
    materialStockByType: defaultMaterialByType
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
  pushNationLog(`初期資源設定: 領土収入(${initialStock.tiles}マス)x3 / 食料 ${formatFoodResourceBag(defaultFoodByType)} / 資材 ${formatMaterialResourceBag(defaultMaterialByType)}`);
  syncActiveTestPlayerSlotFromLiveState();
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
  if (!applyingTestPlayerState) {
    syncActiveTestPlayerSlotFromLiveState();
  }
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
      const iconFallback = resolveFallbackIconNameForUnit(unit);
      const iconName = resolveUnitIconNameStrict(unit?.iconName, iconFallback);
      const subIconName = resolveUnitIconNameStrict(unit?.subIconName, "");
      return {
        ...unit,
        iconName,
        iconSrc: resolveUnitIconSrc(iconName),
        subIconName,
        subIconSrc: resolveUnitIconSrc(subIconName, ""),
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

function deepCloneJsonValue(value, fallback = null) {
  try {
    const raw = JSON.stringify(value);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function buildBinaryMapFromCoordSet(setLike, w, h) {
  const out = Array.from({ length: h }, () => Array.from({ length: w }, () => 0));
  if (!setLike || typeof setLike[Symbol.iterator] !== "function") return out;
  for (const key of setLike) {
    const parsed = parseCoordKey(nonEmptyText(key));
    const px = Number(parsed?.x);
    const py = Number(parsed?.y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    const x = Math.floor(px);
    const y = Math.floor(py);
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    out[y][x] = 1;
  }
  return out;
}

function cloneEnemySpawnMapForSave(enemySpawnMap) {
  if (!Array.isArray(enemySpawnMap)) return [];
  return enemySpawnMap.map(row => {
    if (!Array.isArray(row)) return [];
    return row.map(cell => {
      if (!Array.isArray(cell)) return [];
      return cell.map(enemy => deepCloneJsonValue(enemy, {}));
    });
  });
}

function buildMapSnapshotForSave() {
  const data = currentData.value;
  if (!data || !Number.isFinite(data?.w) || !Number.isFinite(data?.h)) return null;
  const w = Math.max(1, Math.floor(toSafeNumber(data.w, 0)));
  const h = Math.max(1, Math.floor(toSafeNumber(data.h, 0)));
  const riverData = data?.riverData || {};
  return {
    size: { w, h },
    generation: {
      patternId: nonEmptyText(data?.patternId) || nonEmptyText(patternId.value),
      mountainMode: nonEmptyText(data?.mountainMode) || nonEmptyText(mountainMode.value) || "random",
      patternName: nonEmptyText(data?.patternName),
      worldWrapEnabled: !!resolveWorldWrapEnabled(data),
      shapeOnly: !!data?.shapeOnly,
      terrainRatioProfile: deepCloneJsonValue(data?.terrainRatioProfile, null)
    },
    turnState: deepCloneJsonValue(data?.turnState, { turnNumber: 0 }),
    base: {
      grid: deepCloneJsonValue(data?.grid, []),
      heightMap: deepCloneJsonValue(data?.heightMap, []),
      heightLevelMap: deepCloneJsonValue(data?.heightLevelMap, []),
      topLayerMap: deepCloneJsonValue(data?.topLayerMap, []),
      reliefMap: deepCloneJsonValue(data?.reliefMap, []),
      coastTypeMap: deepCloneJsonValue(data?.coastTypeMap, []),
      specialMap: deepCloneJsonValue(data?.specialMap, [])
    },
    dynamic: {
      lavaMap: deepCloneJsonValue(data?.lavaMap, []),
      lavaFlowData: deepCloneJsonValue(data?.lavaFlowData, null),
      enemySpawnMap: cloneEnemySpawnMapForSave(data?.enemySpawnMap),
      strongEnemyMap: deepCloneJsonValue(data?.strongEnemyMap, []),
      river: {
        riverMap: buildBinaryMapFromCoordSet(riverData?.riverSet, w, h),
        sourceMap: buildBinaryMapFromCoordSet(riverData?.sourceSet, w, h),
        branchMap: buildBinaryMapFromCoordSet(riverData?.branchSet, w, h),
        mouthMap: buildBinaryMapFromCoordSet(riverData?.mouthSet, w, h),
        waterLinkMap: buildBinaryMapFromCoordSet(riverData?.waterLinkSet, w, h),
        waterfallMap: buildBinaryMapFromCoordSet(riverData?.waterfallSet, w, h),
        edgeList: Array.from(riverData?.edgeSet || []).map(v => String(v || "")),
        waterfallEdgeList: Array.from(riverData?.waterfallEdgeSet || []).map(v => String(v || ""))
      }
    },
    visibility: {
      exploredTileKeys: Array.from(exploredTileKeys || []).map(v => String(v || "")),
      visibleTileKeys: Array.from(visibleTileKeys || []).map(v => String(v || "")),
      spottedEnemyTileKeys: Array.from(spottedEnemyTileKeys || []).map(v => String(v || "")),
      spottedFactionTileKeys: Array.from(spottedFactionTileKeys || []).map(v => String(v || "")),
      territory: {
        player: Array.from(territorySets?.player || []).map(v => String(v || "")),
        enemy: Array.from(territorySets?.enemy || []).map(v => String(v || ""))
      }
    },
    multiplayer: {
      activePlayerId: nonEmptyText(activeTestPlayerId.value) || DEFAULT_TEST_PLAYER_ID,
      players: testPlayerSlots.value.map(slot => ({
        id: nonEmptyText(slot?.id),
        label: nonEmptyText(slot?.label),
        isPlayer: slot?.isPlayer !== false,
        race: nonEmptyText(slot?.race),
        ready: !!slot?.ready,
        factionState: deepCloneJsonValue(slot?.factionState, null)
      }))
    }
  };
}

function buildCoordSetFromBinaryMap(binaryMap, w, h) {
  const out = new Set();
  if (!Array.isArray(binaryMap) || !Number.isFinite(w) || !Number.isFinite(h)) return out;
  for (let y = 0; y < Math.min(h, binaryMap.length); y += 1) {
    const row = binaryMap[y];
    if (!Array.isArray(row)) continue;
    for (let x = 0; x < Math.min(w, row.length); x += 1) {
      if (toSafeNumber(row[x], 0) > 0) out.add(coordKey(x, y));
    }
  }
  return out;
}

function restoreRiverDataFromSaveSnapshot(snapshot, w, h) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const riverSet = buildCoordSetFromBinaryMap(snapshot.riverMap, w, h);
  const sourceSet = buildCoordSetFromBinaryMap(snapshot.sourceMap, w, h);
  const branchSet = buildCoordSetFromBinaryMap(snapshot.branchMap, w, h);
  const mouthSet = buildCoordSetFromBinaryMap(snapshot.mouthMap, w, h);
  const waterLinkSet = buildCoordSetFromBinaryMap(snapshot.waterLinkMap, w, h);
  const waterfallSet = buildCoordSetFromBinaryMap(snapshot.waterfallMap, w, h);
  const edgeSet = new Set(
    (Array.isArray(snapshot.edgeList) ? snapshot.edgeList : [])
      .map(v => String(v || ""))
      .filter(Boolean)
  );
  const waterfallEdgeSet = new Set(
    (Array.isArray(snapshot.waterfallEdgeList) ? snapshot.waterfallEdgeList : [])
      .map(v => String(v || ""))
      .filter(Boolean)
  );
  return {
    riverSet,
    sourceSet,
    branchSet,
    mouthSet,
    edgeSet,
    waterLinkSet,
    waterfallSet,
    waterfallEdgeSet
  };
}

function buildMapDataFromSaveSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const w = Math.max(1, Math.floor(toSafeNumber(snapshot?.size?.w, 0)));
  const h = Math.max(1, Math.floor(toSafeNumber(snapshot?.size?.h, 0)));
  if (w <= 0 || h <= 0) return null;
  const riverData = restoreRiverDataFromSaveSnapshot(snapshot?.dynamic?.river, w, h);
  return {
    w,
    h,
    patternId: nonEmptyText(snapshot?.generation?.patternId) || nonEmptyText(patternId.value),
    mountainMode: nonEmptyText(snapshot?.generation?.mountainMode) || nonEmptyText(mountainMode.value) || "random",
    patternName: nonEmptyText(snapshot?.generation?.patternName),
    terrainRatioProfile: deepCloneJsonValue(snapshot?.generation?.terrainRatioProfile, null),
    worldWrapEnabled: !!snapshot?.generation?.worldWrapEnabled,
    shapeOnly: !!snapshot?.generation?.shapeOnly,
    turnState: deepCloneJsonValue(snapshot?.turnState, { turnNumber: 0 }),
    grid: deepCloneJsonValue(snapshot?.base?.grid, []),
    heightMap: deepCloneJsonValue(snapshot?.base?.heightMap, []),
    heightLevelMap: deepCloneJsonValue(snapshot?.base?.heightLevelMap, []),
    topLayerMap: deepCloneJsonValue(snapshot?.base?.topLayerMap, []),
    reliefMap: deepCloneJsonValue(snapshot?.base?.reliefMap, []),
    coastTypeMap: deepCloneJsonValue(snapshot?.base?.coastTypeMap, []),
    specialMap: deepCloneJsonValue(snapshot?.base?.specialMap, []),
    lavaMap: deepCloneJsonValue(snapshot?.dynamic?.lavaMap, []),
    lavaFlowData: deepCloneJsonValue(snapshot?.dynamic?.lavaFlowData, null),
    enemySpawnMap: cloneEnemySpawnMapForSave(snapshot?.dynamic?.enemySpawnMap),
    strongEnemyMap: deepCloneJsonValue(snapshot?.dynamic?.strongEnemyMap, []),
    riverData
  };
}

function normalizeVisibilitySnapshot(raw, fallback = {}) {
  const source = raw && typeof raw === "object" ? raw : fallback;
  return {
    exploredTileKeys: Array.isArray(source?.exploredTileKeys) ? source.exploredTileKeys.map(v => String(v || "")).filter(Boolean) : [],
    visibleTileKeys: Array.isArray(source?.visibleTileKeys) ? source.visibleTileKeys.map(v => String(v || "")).filter(Boolean) : [],
    spottedEnemyTileKeys: Array.isArray(source?.spottedEnemyTileKeys) ? source.spottedEnemyTileKeys.map(v => String(v || "")).filter(Boolean) : [],
    spottedFactionTileKeys: Array.isArray(source?.spottedFactionTileKeys) ? source.spottedFactionTileKeys.map(v => String(v || "")).filter(Boolean) : []
  };
}

function normalizeFactionStateFromSave(raw, fallbackVisibility = {}) {
  if (!raw || typeof raw !== "object") return null;
  const units = Array.isArray(raw?.units) ? raw.units.map(unit => deepCloneJsonValue(unit, {})) : [];
  const villageRaw = raw?.village ? deepCloneJsonValue(raw.village, null) : null;
  const raceFallback = nonEmptyText(raw?.race) || resolveRaceFromUnitList(units);
  const village = villageRaw ? ensureVillageStateShape(villageRaw, raceFallback) : null;
  const selected = nonEmptyText(raw?.selectedUnitId) || units[0]?.id || "";
  const nationLogKey = nonEmptyText(raw?.factionId)
    || nonEmptyText(units.find(unit => isSovereignUnit(unit))?.id)
    || "nation-player";
  return {
    village,
    units,
    selectedUnitId: selected,
    villagePlacementMode: !!raw?.villagePlacementMode,
    unitMoveMode: !!raw?.unitMoveMode,
    nationLogKey,
    visibility: normalizeVisibilitySnapshot(raw?.visibility, fallbackVisibility)
  };
}

function normalizeTestPlayersFromSave(snapshotPlayers, fallbackVisibility = {}) {
  if (!Array.isArray(snapshotPlayers)) return [];
  const out = [];
  for (let i = 0; i < snapshotPlayers.length; i += 1) {
    const row = snapshotPlayers[i];
    const id = nonEmptyText(row?.id) || `player-${i + 1}`;
    const label = nonEmptyText(row?.label) || buildTestPlayerLabel(i + 1);
    const stateRaw = row?.factionState && typeof row.factionState === "object" ? row.factionState : null;
    if (!stateRaw) continue;
    const state = {
      village: deepCloneJsonValue(stateRaw?.village, null),
      units: Array.isArray(stateRaw?.units) ? stateRaw.units.map(unit => deepCloneJsonValue(unit, {})) : [],
      selectedUnitId: nonEmptyText(stateRaw?.selectedUnitId),
      villagePlacementMode: !!stateRaw?.villagePlacementMode,
      unitMoveMode: !!stateRaw?.unitMoveMode,
      nationLogKey: nonEmptyText(stateRaw?.nationLogKey) || `nation-${id}`,
      visibility: normalizeVisibilitySnapshot(stateRaw?.visibility, fallbackVisibility)
    };
    out.push({
      id,
      label,
      isPlayer: row?.isPlayer !== false,
      race: nonEmptyText(row?.race) || resolveRaceFromUnitList(state.units),
      ready: !!row?.ready,
      factionState: state
    });
  }
  return out;
}

function applyLoadedSaveState(payload) {
  const mapSnapshot = payload?.mapSnapshot || payload?.map || payload?.saveData?.map || null;
  const nextData = buildMapDataFromSaveSnapshot(mapSnapshot);
  if (!nextData) {
    return { ok: false, reason: "ロード失敗: マップデータ形式が不正です。" };
  }
  const fallbackVisibility = normalizeVisibilitySnapshot(mapSnapshot?.visibility, {});
  const saveFaction = payload?.faction || payload?.saveData?.factions?.[0] || null;
  const fallbackFactionState = normalizeFactionStateFromSave(saveFaction, fallbackVisibility);
  const loadedSlots = normalizeTestPlayersFromSave(mapSnapshot?.multiplayer?.players, fallbackVisibility);
  const loadedActiveId = nonEmptyText(mapSnapshot?.multiplayer?.activePlayerId);

  applyMapData(nextData, {
    resetClock: false,
    rebuildCharacters: false,
    forceCenterOnInit: true
  });

  nationLogsBySovereign.value = {};
  const nextSlots = loadedSlots.length
    ? loadedSlots
    : [buildTestPlayerSlotFromLiveState(DEFAULT_TEST_PLAYER_ID, PRIMARY_TEST_PLAYER_LABEL, {
      factionState: fallbackFactionState || buildLiveFactionStateSnapshot(),
      ready: false
    })];
  testPlayerSlots.value = nextSlots.slice(0, MAX_TEST_PLAYER_COUNT);
  activeTestPlayerId.value = loadedActiveId
    && testPlayerSlots.value.some(slot => slot.id === loadedActiveId)
    ? loadedActiveId
    : (testPlayerSlots.value[0]?.id || DEFAULT_TEST_PLAYER_ID);

  for (const slot of testPlayerSlots.value) {
    const sovereign = slot?.factionState?.units?.find(unit => isSovereignUnit(unit)) || slot?.factionState?.units?.[0] || null;
    const label = nonEmptyText(sovereign?.name) || nonEmptyText(slot?.label) || "統治者";
    ensureNationLogBucket(nonEmptyText(slot?.factionState?.nationLogKey) || `nation-${slot?.id}`, label);
  }

  const activeSlot = testPlayerSlots.value.find(slot => slot.id === activeTestPlayerId.value) || testPlayerSlots.value[0] || null;
  if (activeSlot?.factionState) {
    applyFactionStateSnapshotToLiveState(activeSlot.factionState, { emitState: true, render: true });
  } else {
    renderMapWithPhaser();
    emitCharacterStateChange();
  }
  updateMeta(nextData);
  pushNationLog("セーブデータをロードしました。");
  return { ok: true };
}

function emitSaveSnapshot(reason = "manual") {
  emit("save-snapshot", {
    reason: nonEmptyText(reason) || "manual",
    generatedAt: new Date().toISOString(),
    snapshot: buildMapSnapshotForSave()
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
  const namedBonus = applyNamedStatusSkillBonus(unit?.status, unit?.skillLevels, true);
  unitList.value[idx] = {
    ...unit,
    isNamed: true,
    unitType: "ネームド",
    status: namedBonus.status,
    skillLevels: namedBonus.skillLevels
  };
  return { ok: true };
}

function configureUnitSquadState(unitId, memberIds = [], options = {}) {
  const result = configureUnitSquadStateUtil(unitList.value, unitId, memberIds, {
    squadName: options?.squadName,
    squadIconName: options?.squadIconName,
    maxSquadMemberCount: MAX_SQUAD_MEMBER_COUNT,
    nonEmptyText,
    normalizeSquadEntries,
    unitHasSquad,
    resolveDefaultSquadName
  });
  if (!result?.ok) return result;
  unitList.value = Array.isArray(result.nextUnits) ? result.nextUnits : unitList.value;
  return {
    ok: true,
    hasSquad: !!result.hasSquad,
    memberCount: Math.max(0, Math.floor(toSafeNumber(result.memberCount, 0))),
    memberNames: Array.isArray(result.memberNames) ? result.memberNames : [],
    squadName: nonEmptyText(result.squadName)
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
  const result = renameLeaderSquadUtil(unitList.value, unitId, squadName, {
    nonEmptyText,
    unitHasSquad
  });
  if (!result?.ok) return result;
  unitList.value = Array.isArray(result.nextUnits) ? result.nextUnits : unitList.value;
  return { ok: true, squadName: nonEmptyText(result.squadName) };
}

function dissolveLeaderSquad(unitId) {
  const result = dissolveLeaderSquadUtil(unitList.value, unitId, {
    maxSquadMemberCount: MAX_SQUAD_MEMBER_COUNT,
    nonEmptyText,
    normalizeSquadEntries,
    unitHasSquad,
    resolveDefaultSquadName
  });
  if (!result?.ok) return result;
  unitList.value = Array.isArray(result.nextUnits) ? result.nextUnits : unitList.value;
  return {
    ok: true,
    hasSquad: !!result.hasSquad,
    memberCount: Math.max(0, Math.floor(toSafeNumber(result.memberCount, 0))),
    memberNames: Array.isArray(result.memberNames) ? result.memberNames : [],
    squadName: nonEmptyText(result.squadName)
  };
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
  const village = ensureVillageStateShape(villageState.value, props.selectedRace);
  if (!village?.placed) {
    return { ok: false, reason: "装備変更には都市（初期村）の配置が必要です。" };
  }
  const craftCost = buildEquipmentCraftMaterialCost(row, rarityKey);
  const smithCap = resolveSmithCraftCap(village);
  if (craftCost.level > smithCap) {
    return { ok: false, reason: `鍛冶場Lv不足: 必要Lv${craftCost.level} / 現在Lv${smithCap}` };
  }
  if (craftCost.isMagic) {
    const magicLv = resolveVillageAbilityLevel(village, "魔法", CITY_ABILITY_ACTIVE_CAP);
    if (craftCost.level > magicLv) {
      return { ok: false, reason: `魔法Lv不足: 必要Lv${craftCost.level} / 現在Lv${magicLv}` };
    }
  }
  if (craftCost.isFaith) {
    const faithLv = resolveVillageAbilityLevel(village, "信仰", CITY_ABILITY_ACTIVE_CAP);
    if (craftCost.level > faithLv) {
      return { ok: false, reason: `信仰Lv不足: 必要Lv${craftCost.level} / 現在Lv${faithLv}` };
    }
  }
  if (!canAffordEquipmentCraft(village, craftCost)) {
    return { ok: false, reason: `素材不足: 必要 ${formatMaterialPositiveResourceBag(craftCost.material)}` };
  }

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
  const nextVillage = applyEquipmentCraftCost(village, craftCost);
  if (nextVillage) {
    villageState.value = nextVillage;
  }
  return {
    ok: true,
    equipment: nextItem,
    slotIndex,
    slotKey,
    craftCost
  };
}

function updateUnitIcon(unitId, iconNameRaw) {
  const targetId = nonEmptyText(unitId);
  if (!targetId) return { ok: false, reason: "対象ユニットが未指定です。" };
  const idx = unitList.value.findIndex(unit => unit?.id === targetId);
  if (idx < 0) return { ok: false, reason: "対象ユニットが見つかりません。" };
  const target = unitList.value[idx];
  const iconName = resolveUnitIconNameStrict(iconNameRaw, target?.subIconName || "");
  unitList.value[idx] = {
    ...target,
    subIconName: iconName,
    subIconSrc: resolveUnitIconSrc(iconName, "")
  };
  return {
    ok: true,
    iconName,
    iconSrc: resolveUnitIconSrc(iconName, "")
  };
}

function updateSquadIcon(unitId, iconNameRaw) {
  const targetId = nonEmptyText(unitId);
  if (!targetId) return { ok: false, reason: "部隊リーダーが未指定です。" };
  const iconName = resolveUnitIconNameStrict(iconNameRaw, "");
  const result = updateLeaderSquadIconUtil(unitList.value, targetId, iconName, {
    nonEmptyText,
    unitHasSquad
  });
  if (!result?.ok) return result;
  unitList.value = Array.isArray(result.nextUnits) ? result.nextUnits : unitList.value;
  return {
    ok: true,
    iconName: nonEmptyText(result.squadIconName)
  };
}

function applyCharacterCommand(command) {
  const type = nonEmptyText(command?.type);
  if (!type) return;

  if (type === "batch") {
    const commands = Array.isArray(command?.commands) ? command.commands : [];
    for (const row of commands) {
      if (!row || typeof row !== "object") continue;
      applyCharacterCommand(row);
    }
    return;
  }

  if (type === "requestSaveSnapshot") {
    emitSaveSnapshot(nonEmptyText(command?.reason) || "manual");
    return;
  }

  if (type === "startVillagePlacement") {
    startVillagePlacementMode();
    return;
  }

  if (type === "prepareGameStartMap") {
    const result = prepareGameStartMap(command);
    if (!result.ok) {
      updateUnitInfoText(result.reason || "開始マップの準備に失敗しました。");
      audio.playSe("cancel");
      return;
    }
    return;
  }

  if (type === "openUnitCreate") {
    openUnitCreateModal();
    return;
  }

  if (type === "initTestPlayerSlots") {
    const result = initializeTestPlayerSlotsFromConfig({
      playerCount: command?.playerCount,
      otherFactionCount: command?.otherFactionCount,
      totalCount: command?.totalCount
    });
    if (!result.ok) {
      updateUnitInfoText(result.reason || "勢力初期化に失敗しました。");
      return;
    }
    updateUnitInfoText(`勢力を初期化: プレイヤー${result.playerCount} / 別勢力${result.otherCount} / 合計${result.total}`);
    return;
  }

  if (type === "applySovereignProfile") {
    const result = applySovereignProfileToSlot(command);
    if (!result.ok) {
      updateUnitInfoText(result.reason || "勢力設定に失敗しました。");
    }
    return;
  }

  if (type === "finalizeGameStartSetup") {
    const result = finalizeGameStartSetup(command);
    if (!result.ok) {
      updateUnitInfoText(result.reason || "ゲーム開始設定の確定に失敗しました。");
      audio.playSe("cancel");
      return;
    }
    audio.playSe("confirm");
    return;
  }

  if (type === "switchActiveTestPlayer") {
    const targetPlayerId = nonEmptyText(command?.playerId) || nonEmptyText(command?.slotId);
    if (!targetPlayerId) return;
    switchActiveTestPlayer(targetPlayerId);
    return;
  }

  if (type === "loadSaveState") {
    const result = applyLoadedSaveState(command?.payload || {});
    if (!result.ok) {
      updateUnitInfoText(result.reason || "ロード失敗: データ適用に失敗しました。");
      audio.playSe("cancel");
      return;
    }
    updateUnitInfoText("ロード完了: セーブデータを反映しました。");
    audio.playSe("confirm");
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

  if (type === "levelUnit") {
    const idx = unitList.value.findIndex(unit => unit?.id === unitId);
    if (idx < 0) return;
    const unit = unitList.value[idx];
    const delta = Math.max(-5, Math.min(5, Math.floor(toSafeNumber(command?.delta, 1))));
    const targetLevel = clampUnitLevel(toSafeNumber(unit?.level, INITIAL_LEVEL_MIN) + delta, unit?.level || INITIAL_LEVEL_MIN);
    const result = rebuildUnitByLevelRules(unit, { level: targetLevel });
    if (!result.ok || !result.unit) {
      updateUnitInfoText(`Lv変更失敗: ${result.reason || "更新不可"}`);
      pushNationLog(`Lv変更失敗: ${result.reason || "更新不可"}`);
    } else {
      unitList.value[idx] = result.unit;
      const secondary = nonEmptyText(result.secondaryClassName);
      const extra = secondary ? ` / 第2クラス:${secondary}` : "";
      updateUnitInfoText(`Lv変更: ${result.unit.name} -> Lv${result.level} (種族Lv${result.raceLevels} / クラスLv${result.classLevels})${extra}`);
      pushNationLog(`Lv変更: ${result.unit.name} / Lv${result.level} (種族Lv${result.raceLevels} / クラスLv${result.classLevels})${extra}`);
    }
    emitCharacterStateChange();
    renderMapWithPhaser();
    return;
  }

  if (type === "assignSecondaryClass") {
    const idx = unitList.value.findIndex(unit => unit?.id === unitId);
    if (idx < 0) return;
    const unit = unitList.value[idx];
    const className = nonEmptyText(command?.secondaryClassName);
    if (!className) {
      updateUnitInfoText("第2クラス設定失敗: クラス未指定");
      return;
    }
    const raceRow = findClassRowByName(resolveRaceBaseClassName(unit?.race)) || null;
    if (!raceIsHumanType(raceRow)) {
      updateUnitInfoText("第2クラス設定失敗: 人族のみ設定できます。");
      return;
    }
    const level = clampUnitLevel(unit?.level, INITIAL_LEVEL_MIN);
    if (level < 10) {
      updateUnitInfoText("第2クラス設定失敗: Lv10以上で設定できます。");
      return;
    }
    if (className === nonEmptyText(unit?.className)) {
      updateUnitInfoText("第2クラス設定失敗: メインクラスと同じです。");
      return;
    }
    const result = rebuildUnitByLevelRules(unit, {
      level,
      secondaryClassName: className
    });
    if (!result.ok || !result.unit) {
      updateUnitInfoText(`第2クラス設定失敗: ${result.reason || "設定不可"}`);
      pushNationLog(`第2クラス設定失敗: ${result.reason || "設定不可"}`);
    } else {
      unitList.value[idx] = result.unit;
      updateUnitInfoText(`第2クラス設定: ${result.unit.name} / ${result.secondaryClassName || className}`);
      pushNationLog(`第2クラス設定: ${result.unit.name} / ${result.secondaryClassName || className}`);
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
    const squadIconName = nonEmptyText(command?.squadIconName);
    const result = configureUnitSquadState(unitId, memberIds, { squadName, squadIconName });
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

  if (type === "updateSquadIcon") {
    const iconName = nonEmptyText(command?.iconName);
    const result = updateSquadIcon(unitId, iconName);
    if (!result.ok) {
      updateUnitInfoText(`部隊アイコン変更失敗: ${result.reason || "変更不可"}`);
      pushNationLog(`部隊アイコン変更失敗: ${result.reason || "変更不可"}`);
    } else {
      const leader = unitList.value.find(unit => unit.id === unitId) || null;
      const squadName = nonEmptyText(leader?.squadName) || nonEmptyText(leader?.name) || "部隊";
      const label = result.iconName || "(なし)";
      updateUnitInfoText(`部隊アイコン変更: ${squadName} / ${label}`);
      pushNationLog(`部隊アイコン変更: ${squadName} / ${label}`);
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
      const craftCostText = formatMaterialPositiveResourceBag(result?.craftCost?.material);
      updateVillageInfoText();
      updateUnitInfoText(`装備変更: ${target?.name || "ユニット"} / ${slotLabel} ${item?.name || "-"} [${rarityText}] / 素材 ${craftCostText}`);
      pushNationLog(`装備変更: ${target?.name || "ユニット"} / ${slotLabel} ${item?.name || "-"} [${rarityText}] / 素材 ${craftCostText}`);
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
  const craftCost = buildEquipmentCraftMaterialCost(row, quality);
  const requiredMaterial = formatMaterialPositiveResourceBag(craftCost.material);
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
    craftLevel: craftCost.level,
    craftCostMaterial: craftCost.material,
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

function extractSkillNamesFromValue(value) {
  const text = nonEmptyText(value);
  if (!text || text === "0") return [];
  return text
    .split(/[\/,、，／]/)
    .map(part => nonEmptyText(part))
    .filter(part => part && part !== "0");
}

function buildUnitSkillsFromRowByLevel(row, levelCount) {
  const cap = Math.max(0, Math.min(10, Math.floor(toSafeNumber(levelCount, 0))));
  if (!row || typeof row !== "object" || cap <= 0) return [];
  const skills = [];
  for (let i = 1; i <= cap; i += 1) {
    const english = `Skill${i}`;
    const japanese = `スキル${i}`;
    const names = [
      ...extractSkillNamesFromValue(row?.[english]),
      ...extractSkillNamesFromValue(row?.[japanese])
    ];
    if (names.length) skills.push(...names);
  }
  return [...new Set(skills)];
}

function buildUnitSkillsForProgression({
  raceRow,
  classRow,
  raceLevels = 0,
  classLevels = 0,
  secondaryClassRow = null,
  secondaryClassLevels = 0
} = {}) {
  const merged = [
    ...buildUnitSkillsFromRowByLevel(raceRow, raceLevels),
    ...buildUnitSkillsFromRowByLevel(classRow, classLevels),
    ...buildUnitSkillsFromRowByLevel(secondaryClassRow, secondaryClassLevels)
  ];
  return [...new Set(merged)];
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
  const foodText = formatFoodResourceBag(v.foodStockByType);
  const materialText = formatMaterialResourceBag(v.materialStockByType);
  const popText = formatPopulationByRace(v.populationByRace);
  const buildingText = formatVillageBuildingList(v.buildings);
  const scaleText = resolveVillageScaleLabel(v);
  const cityAbilityText = formatCityAbilityLevels(v);
  if (!v.placed || !Number.isFinite(v.x) || !Number.isFinite(v.y)) {
    villageInfoText.value = `初期村: ${v.name} / 規模 ${scaleText} / 未配置 (マップをクリックして配置) / 人口 ${formatCompactNumber(v.population)} (${popText}) / 食料 ${formatCompactNumber(v.foodStock)} [${foodText}] / 資材 ${formatCompactNumber(v.materialStock)} [${materialText}] / 能力 ${cityAbilityText} / 建物 ${buildingText}`;
    return;
  }
  villageInfoText.value = `初期村: ${v.name} / 規模 ${scaleText} / 座標 (${v.x}, ${v.y}) / 人口 ${formatCompactNumber(v.population)} (${popText}) / 食料 ${formatCompactNumber(v.foodStock)} [${foodText}] / 資材 ${formatCompactNumber(v.materialStock)} [${materialText}] / 能力 ${cityAbilityText} / 建物 ${buildingText}`;
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

function buildInitialVillageStockByTerritory(data, x, y) {
  const result = {
    food: buildEmptyResourceBag(FOOD_RESOURCE_KEYS),
    material: buildEmptyResourceBag(MATERIAL_RESOURCE_KEYS),
    tiles: 0
  };
  if (!data?.grid || !Number.isFinite(x) || !Number.isFinite(y)) return result;
  if (x < 0 || y < 0 || x >= data.w || y >= data.h) return result;

  const ownedSet = new Set([coordKey(x, y)]);
  const queue = [{ x, y, d: 0 }];
  while (queue.length) {
    const cur = queue.shift();
    if (!cur || cur.d >= PLAYER_TERRITORY_RANGE) continue;
    const neighbors = getHexNeighborCoordsBySize(data.w, data.h, cur.x, cur.y, resolveWorldWrapEnabled(data));
    for (const n of neighbors) {
      const key = coordKey(n.x, n.y);
      if (ownedSet.has(key)) continue;
      if (!isPassableTerrain(data.grid[n.y][n.x])) continue;
      ownedSet.add(key);
      queue.push({ x: n.x, y: n.y, d: cur.d + 1 });
    }
  }

  const territoryIncome = collectTerritoryIncome(data, ownedSet);
  result.tiles = Math.max(0, Math.floor(toSafeNumber(territoryIncome.tiles, 0)));
  result.food = scaleResourceBagByFactor(territoryIncome.food, FOOD_RESOURCE_KEYS, 3);
  result.material = scaleResourceBagByFactor(territoryIncome.material, MATERIAL_RESOURCE_KEYS, 3);
  return result;
}

function collectTerritoryIncome(data, ownedSet) {
  const rawIncome = collectTerritoryIncomeUtil(
    data,
    ownedSet,
    FOOD_RESOURCE_KEYS,
    MATERIAL_RESOURCE_SOURCE_KEYS,
    {
      roundTo1,
      toSafeNumber,
      parseCoordKey,
      resolveTileTerrainForYield,
      terrainYieldMap: terrainYieldMap.value
    }
  );
  const income = {
    food: rawIncome.food,
    material: buildEmptyResourceBag(MATERIAL_RESOURCE_KEYS),
    tiles: rawIncome.tiles
  };
  for (const sourceKey of MATERIAL_RESOURCE_SOURCE_KEYS) {
    const resourceKey = MATERIAL_SOURCE_TO_RESOURCE_MAP[sourceKey];
    if (!resourceKey) continue;
    income.material[resourceKey] = roundTo1(
      income.material[resourceKey] + toSafeNumber(rawIncome.material?.[sourceKey], 0)
    );
  }
  const gainScale = ECONOMY_GAIN_SCALE * resolveEconomyGainMultiplier(villageState.value);
  income.food = scaleResourceBagByFactor(income.food, FOOD_RESOURCE_KEYS, gainScale);
  income.material = scaleResourceBagByFactor(income.material, MATERIAL_RESOURCE_KEYS, gainScale);
  return income;
}

function consumeFoodWithSubstitution(stockBag, demandBag, fallbackMultiplier = FOOD_SUBSTITUTE_MULTIPLIER) {
  return consumeFoodWithSubstitutionUtil(
    stockBag,
    demandBag,
    FOOD_RESOURCE_KEYS,
    fallbackMultiplier,
    { toSafeNumber, roundTo1 }
  );
}

function buildUnitUpkeepFoodDemand() {
  const demand = buildUnitUpkeepFoodDemandUtil(
    unitList.value,
    FOOD_RESOURCE_KEYS,
    resolveRaceFoodProfile,
    { roundTo1, toSafeNumber }
  );
  return scaleResourceBagByFactor(demand, FOOD_RESOURCE_KEYS, ECONOMY_CONSUMPTION_SCALE);
}

function buildPopulationFoodDemand(village) {
  const demand = buildPopulationFoodDemandUtil(
    village,
    FOOD_RESOURCE_KEYS,
    resolveRaceFoodProfile,
    { roundTo1, toSafeNumber }
  );
  return scaleResourceBagByFactor(demand, FOOD_RESOURCE_KEYS, ECONOMY_CONSUMPTION_SCALE);
}

function processVillageEconomyTurn(data, options = {}) {
  if (!data?.grid) {
    return { applied: false, notes: ["経済処理: マップ未生成"] };
  }
  if (!villageState.value?.placed) {
    return { applied: false, notes: ["経済処理: 初期村未配置"] };
  }

  const raceFallback = nonEmptyText(options?.raceFallback) || nonEmptyText(props.selectedRace) || "只人";
  const village = ensureVillageStateShape(villageState.value, raceFallback);
  if (!village) {
    return { applied: false, notes: ["経済処理: 村データ不正"] };
  }
  rebuildTerritorySets(data);

  const territoryIncome = collectTerritoryIncome(data, territorySets.player);
  const buildingIncome = collectVillageBuildingIncome(village);
  const unitUpkeepDemand = buildUnitUpkeepFoodDemand();
  const populationDemand = buildPopulationFoodDemand(village);
  const economyCore = applyVillageEconomyTurnUtil(village, {
    territoryIncome,
    buildingIncome,
    unitUpkeepDemand,
    populationDemand,
    foodKeys: FOOD_RESOURCE_KEYS,
    materialKeys: MATERIAL_RESOURCE_KEYS,
    fallbackMultiplier: FOOD_SUBSTITUTE_MULTIPLIER,
    adjustVillagePopulationForTurn: shortage => adjustVillagePopulationForTurn(village, shortage)
  }, { roundTo1, toSafeNumber });
  const upkeepResult = economyCore.upkeepResult;
  const popResult = economyCore.popResult;
  const shortageTotal = economyCore.shortageTotal;
  const populationDelta = economyCore.populationDelta;
  const normalizedVillage = ensureVillageStateShape(village, raceFallback);
  villageState.value = normalizedVillage;
  updateVillageInfoText();
  if (options.emitState !== false) emitCharacterStateChange();

  const reportFormatResourceBag = (bag, keys, labels) => {
    const safeKeys = Array.isArray(keys) ? keys : [];
    if (safeKeys.some(key => FOOD_RESOURCE_KEYS.includes(key) || FOOD_RESOURCE_SIMPLE_KEYS.includes(key))) {
      return formatResourceBag(toFoodDisplayBag(bag), safeKeys, labels);
    }
    if (safeKeys.some(key => MATERIAL_RESOURCE_KEYS.includes(key) || MATERIAL_RESOURCE_SIMPLE_KEYS.includes(key) || key === "金属")) {
      return formatResourceBag(toMaterialDisplayBag(bag), safeKeys, labels);
    }
    return formatResourceBag(bag, safeKeys, labels);
  };

  const report = buildVillageEconomyTurnReportUtil({
    territoryIncome,
    buildingIncome,
    upkeepResult,
    popResult,
    shortageTotal,
    populationDelta,
    normalizedVillage,
    mapTurnNumber: mapTurnNumber.value,
    foodKeys: foodDisplayKeys.value,
    materialKeys: materialDisplayKeys.value,
    foodLabels: foodDisplayLabels.value,
    materialLabels: materialDisplayLabels.value
  }, {
    formatResourceBag: reportFormatResourceBag,
    formatCompactNumber,
    formatVillageBuildingBonus,
    formatPopulationByRace
  });
  const lines = report.lines;
  lastEconomySummary.value = report.summary;
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

function resolveRaceIconNameForUnit(unit) {
  const raceName = nonEmptyText(unit?.race);
  const raceRow = findClassRowByName(resolveRaceBaseClassName(raceName));
  const raceIconName = resolveClassRowIconName(raceRow, "");
  if (raceIconName) return raceIconName;
  if (raceName && hasIconName(raceName)) return raceName;
  return "";
}

function resolveEnemyIconName(enemy) {
  if (!enemy) return "";
  const className = nonEmptyText(enemy?.className);
  const raceName = nonEmptyText(enemy?.race);
  const classRow = className ? findClassRowByName(className) : null;
  const classIcon = resolveClassRowIconName(classRow, "");
  if (classIcon) return classIcon;
  const raceRow = raceName ? findClassRowByName(raceName) : null;
  const raceIcon = resolveClassRowIconName(raceRow, "");
  if (raceIcon) return raceIcon;
  if (raceName && hasIconName(raceName)) return raceName;
  return "";
}

function moveUnitIconSrc(unit) {
  const iconName = resolveAvailableIconName(
    unit?.subIconName,
    unit?.iconName,
    resolveRaceIconNameForUnit(unit)
  );
  if (!iconName) return "";
  return resolveUnitIconSrc(iconName, "");
}

function moveUnitIconGlyph(unit) {
  return resolveRaceGlyph(unit?.race);
}

function raceMarkerTextureKey(iconName) {
  const name = nonEmptyText(iconName);
  if (!name) return "";
  return `race-marker:${name}`;
}

function ensureRaceMarkerTexture(iconName) {
  const name = nonEmptyText(iconName);
  if (!name || !scene?.textures) return "";
  const textureKey = raceMarkerTextureKey(name);
  if (!textureKey) return "";
  if (scene.textures.exists(textureKey)) return textureKey;
  if (raceMarkerTexturePending.has(name)) return "";
  const src = resolveUnitIconSrc(name, "");
  if (!src) return "";
  raceMarkerTexturePending.add(name);
  const image = new Image();
  image.decoding = "async";
  image.onload = () => {
    raceMarkerTexturePending.delete(name);
    if (!scene?.textures) return;
    if (!scene.textures.exists(textureKey)) {
      scene.textures.addImage(textureKey, image);
    }
    if (currentData.value) {
      renderMapWithPhaser();
    }
  };
  image.onerror = () => {
    raceMarkerTexturePending.delete(name);
  };
  image.src = src;
  return "";
}

function unitsAt(x, y) {
  return unitList.value.filter(unit => unit.x === x && unit.y === y);
}

function scaleNumericMapValues(input, multiplier) {
  if (!input || typeof input !== "object") return input;
  const out = {};
  const scale = Math.max(0, toSafeNumber(multiplier, 1));
  for (const [key, value] of Object.entries(input)) {
    const numeric = toSafeNumber(value, NaN);
    out[key] = Number.isFinite(numeric) ? Math.round(numeric * scale) : value;
  }
  return out;
}

function applyNamedStatusSkillBonus(status, skillLevels, enabled = false) {
  if (!enabled) {
    return { status, skillLevels };
  }
  return {
    status: scaleNumericMapValues(status, NAMED_STATUS_SKILL_BONUS_MULTIPLIER),
    skillLevels: scaleNumericMapValues(skillLevels, NAMED_STATUS_SKILL_BONUS_MULTIPLIER)
  };
}

function resolveEncounterScoutValueForUnit(unit) {
  const skillScout = resolveUnitScoutValue(unit);
  const fallbackScout = Math.max(0, roundTo1(toSafeNumber(unit?.scoutRange, 0)));
  return Math.max(skillScout, fallbackScout);
}

function resolveUnitVisionRange(unit) {
  const scoutValue = Math.max(0, roundTo1(resolveEncounterScoutValueForUnit(unit)));
  const bonusRange = Math.max(0, Math.floor(scoutValue / UNIT_VISION_SCOUT_STEP));
  return Math.max(0, UNIT_VISION_BASE_RANGE + bonusRange);
}

function resolveEncounterStealthValueForUnit(unit) {
  return Math.max(0, resolveUnitStealthValue(unit));
}

function resolveEncounterScoutValueForEnemy(enemy) {
  return Math.max(0, roundTo1(toSafeNumber(enemy?.skillLevels?.索敵, 0)));
}

function resolveEncounterStealthValueForEnemy(enemy) {
  return Math.max(0, roundTo1(toSafeNumber(enemy?.skillLevels?.隠密, 0)));
}

function resolveEncounterGroupSense(scoutValues = [], stealthValues = []) {
  const scouts = (Array.isArray(scoutValues) ? scoutValues : [])
    .map(v => Math.max(0, roundTo1(toSafeNumber(v, 0))))
    .sort((a, b) => b - a);
  const steaths = (Array.isArray(stealthValues) ? stealthValues : [])
    .map(v => Math.max(0, roundTo1(toSafeNumber(v, 0))));
  const maxScout = scouts.length ? scouts[0] : 0;
  const supportScout = scouts.slice(1).reduce((sum, value) => sum + (value / 5), 0);
  const totalStealth = steaths.reduce((sum, value) => sum + value, 0);
  const count = Math.max(1, steaths.length || scouts.length);
  const stealthDivisor = count > 1 ? Math.max(1, count * 0.75) : 1;
  return {
    scout: roundTo1(maxScout + supportScout),
    stealth: roundTo1(totalStealth / stealthDivisor),
    count
  };
}

function buildPlayerEncounterGroups() {
  const groups = [];
  const byId = new Map(unitList.value.map(unit => [unit?.id, unit]));
  const squadSummaries = buildSquadSummaryList(unitList.value);
  const groupedUnitIds = new Set();

  for (const summary of squadSummaries) {
    const leader = byId.get(summary?.leaderId);
    if (!leader || !Number.isFinite(leader?.x) || !Number.isFinite(leader?.y)) continue;
    const members = (Array.isArray(summary?.memberIds) ? summary.memberIds : [])
      .map(id => byId.get(id))
      .filter(Boolean);
    const membersAll = [leader, ...members];
    for (const row of membersAll) groupedUnitIds.add(row.id);
    const sense = resolveEncounterGroupSense(
      membersAll.map(resolveEncounterScoutValueForUnit),
      membersAll.map(resolveEncounterStealthValueForUnit)
    );
    groups.push({
      id: `player-squad-${leader.id}`,
      type: "squad",
      label: nonEmptyText(summary?.name) || nonEmptyText(leader?.name) || "部隊",
      x: leader.x,
      y: leader.y,
      scout: sense.scout,
      stealth: sense.stealth,
      count: membersAll.length,
      unitNames: membersAll.map(unit => nonEmptyText(unit?.name)).filter(Boolean)
    });
  }

  for (const unit of unitList.value) {
    if (!unit || groupedUnitIds.has(unit.id)) continue;
    if (nonEmptyText(unit?.squadLeaderId)) continue;
    if (!Number.isFinite(unit?.x) || !Number.isFinite(unit?.y) || unit.x < 0 || unit.y < 0) continue;
    const sense = resolveEncounterGroupSense(
      [resolveEncounterScoutValueForUnit(unit)],
      [resolveEncounterStealthValueForUnit(unit)]
    );
    groups.push({
      id: `player-solo-${unit.id}`,
      type: "solo",
      label: nonEmptyText(unit?.name) || "探索キャラ",
      x: unit.x,
      y: unit.y,
      scout: sense.scout,
      stealth: sense.stealth,
      count: 1,
      unitNames: [nonEmptyText(unit?.name) || "探索キャラ"]
    });
  }
  return groups;
}

function buildEnemyEncounterGroups(data = currentData.value) {
  if (!Array.isArray(data?.enemySpawnMap)) return [];
  const groups = [];
  for (let y = 0; y < data.h; y += 1) {
    for (let x = 0; x < data.w; x += 1) {
      const enemies = enemiesAt(x, y, data);
      if (!enemies.length) continue;
      const sense = resolveEncounterGroupSense(
        enemies.map(resolveEncounterScoutValueForEnemy),
        enemies.map(resolveEncounterStealthValueForEnemy)
      );
      const first = enemies[0];
      groups.push({
        id: `enemy-${x}-${y}`,
        x,
        y,
        scout: sense.scout,
        stealth: sense.stealth,
        count: enemies.length,
        strong: enemies.some(enemy => !!enemy?.strong),
        names: enemies.map(enemy => nonEmptyText(enemy?.name) || nonEmptyText(enemy?.race) || "敵")
          .filter(Boolean),
        topLevel: enemies.reduce((maxLv, enemy) => Math.max(maxLv, Math.max(1, Math.floor(toSafeNumber(enemy?.level, 1)))), 1),
        terrain: nonEmptyText(first?.matchedTerrain) || nonEmptyText(data?.grid?.[y]?.[x]) || "-"
      });
    }
  }
  return groups;
}

function buildOpposingFactionUnitsByTile(data = currentData.value) {
  const result = new Map();
  if (!data || !Number.isFinite(data?.w) || !Number.isFinite(data?.h)) return result;
  const activeId = nonEmptyText(activeTestPlayerId.value);
  for (const slot of testPlayerSlots.value) {
    const slotId = nonEmptyText(slot?.id);
    if (!slotId || slotId === activeId) continue;
    const units = Array.isArray(slot?.factionState?.units) ? slot.factionState.units : [];
    const factionLabel = nonEmptyText(slot?.label) || slotId;
    for (const unit of units) {
      const x = Math.floor(toSafeNumber(unit?.x, Number.NaN));
      const y = Math.floor(toSafeNumber(unit?.y, Number.NaN));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < 0 || y < 0 || x >= data.w || y >= data.h) continue;
      const key = coordKey(x, y);
      let bucket = result.get(key);
      if (!bucket) {
        bucket = {
          x,
          y,
          key,
          factionIds: new Set(),
          factionLabels: new Set(),
          units: []
        };
        result.set(key, bucket);
      }
      bucket.factionIds.add(slotId);
      bucket.factionLabels.add(factionLabel);
      bucket.units.push(unit);
    }
  }
  return result;
}

function buildOtherFactionEncounterGroups(data = currentData.value) {
  const tileMap = buildOpposingFactionUnitsByTile(data);
  if (!tileMap.size) return [];
  const groups = [];
  for (const bucket of tileMap.values()) {
    const sense = resolveEncounterGroupSense(
      bucket.units.map(resolveEncounterScoutValueForUnit),
      bucket.units.map(resolveEncounterStealthValueForUnit)
    );
    const names = bucket.units
      .map(unit => nonEmptyText(unit?.name) || nonEmptyText(unit?.race) || "勢力ユニット")
      .filter(Boolean);
    groups.push({
      id: `faction-${Array.from(bucket.factionIds).join("_")}-${bucket.key}`,
      kind: "faction",
      x: bucket.x,
      y: bucket.y,
      scout: sense.scout,
      stealth: sense.stealth,
      count: bucket.units.length,
      factionIds: Array.from(bucket.factionIds),
      factionLabel: Array.from(bucket.factionLabels).join("/"),
      names
    });
  }
  return groups;
}

function formatOpposingFactionUnitsAtTile(x, y, options = {}) {
  if (!currentData.value) return "なし";
  const map = options?.tileMap instanceof Map
    ? options.tileMap
    : buildOpposingFactionUnitsByTile(currentData.value);
  const key = coordKey(x, y);
  const bucket = map.get(key);
  if (!bucket || !Array.isArray(bucket.units) || !bucket.units.length) return "なし";
  return bucket.units.map(unit => {
    const name = nonEmptyText(unit?.name) || nonEmptyText(unit?.race) || "勢力ユニット";
    const lv = Math.max(1, Math.floor(toSafeNumber(unit?.level, 1)));
    return `${name}(Lv${lv})`;
  }).join(", ");
}

function resolveEncounterDistance(playerGroup, enemyGroup) {
  if (!playerGroup || !enemyGroup) return Number.POSITIVE_INFINITY;
  return hexDistance(
    { x: playerGroup.x, y: playerGroup.y },
    { x: enemyGroup.x, y: enemyGroup.y }
  );
}

function runEnemyEncounterCheck(options = {}) {
  const context = nonEmptyText(options?.context) || "turn";
  const focusPos = options?.focusPos;
  const data = currentData.value;
  if (!data || data.shapeOnly || !Array.isArray(data.enemySpawnMap)) {
    return { context, entries: [], notes: [] };
  }

  const playerGroups = buildPlayerEncounterGroups().filter(group => {
    if (!focusPos || !Number.isFinite(focusPos?.x) || !Number.isFinite(focusPos?.y)) return true;
    return group.x === focusPos.x && group.y === focusPos.y;
  });
  const enemyGroups = buildEnemyEncounterGroups(data);
  const factionGroups = buildOtherFactionEncounterGroups(data);
  const hostileGroups = [
    ...enemyGroups.map(group => ({ ...group, kind: "spawn" })),
    ...factionGroups
  ];
  const entries = [];
  let discoveredAnyTarget = false;

  for (const player of playerGroups) {
    for (const enemy of hostileGroups) {
      const kind = nonEmptyText(enemy?.kind) || "spawn";
      const distance = resolveEncounterDistance(player, enemy);
      if (!Number.isFinite(distance)) continue;
      const enemyTileKey = coordKey(enemy.x, enemy.y);
      const alreadySpottedEnemy = kind === "faction"
        ? spottedFactionTileKeys.has(enemyTileKey)
        : spottedEnemyTileKeys.has(enemyTileKey);
      const playerEffectiveScout = roundTo1(player.scout - (distance * ENCOUNTER_SCOUT_DISTANCE_DECAY_PER_TILE));
      const enemyEffectiveScout = roundTo1(enemy.scout - (distance * ENCOUNTER_SCOUT_DISTANCE_DECAY_PER_TILE));
      const playerFoundEnemy = playerEffectiveScout > enemy.stealth;
      const enemyFoundPlayer = enemyEffectiveScout > player.stealth;
      if (!playerFoundEnemy && !enemyFoundPlayer) continue;
      let newlySpottedEnemy = false;
      if (playerFoundEnemy) {
        newlySpottedEnemy = kind === "faction"
          ? markFactionSpotted(enemy.x, enemy.y, data)
          : markEnemySpotted(enemy.x, enemy.y, data);
        discoveredAnyTarget = newlySpottedEnemy || discoveredAnyTarget;
      }

      let enemyAttack = false;
      let ambushByFumble = false;
      let attackChance = 0;
      let attackRoll = null;
      let fumbleRoll = null;
      if (enemyFoundPlayer) {
        fumbleRoll = Math.random();
        if (fumbleRoll < ENCOUNTER_FUMBLE_CHANCE) {
          ambushByFumble = true;
          enemyAttack = true;
        } else {
          attackChance = clampNumber(
            ENCOUNTER_ATTACK_BASE_CHANCE + ((enemyEffectiveScout - player.stealth) * ENCOUNTER_ATTACK_DIFF_FACTOR),
            ENCOUNTER_ATTACK_MIN_CHANCE,
            ENCOUNTER_ATTACK_MAX_CHANCE
          );
          attackRoll = Math.random();
          enemyAttack = attackRoll < attackChance;
        }
      }

      entries.push({
        context,
        playerGroup: {
          id: player.id,
          label: player.label,
          type: player.type,
          x: player.x,
          y: player.y,
          scout: player.scout,
          stealth: player.stealth,
          count: player.count,
          unitNames: player.unitNames
        },
        enemyGroup: {
          id: enemy.id,
          kind,
          x: enemy.x,
          y: enemy.y,
          scout: enemy.scout,
          stealth: enemy.stealth,
          count: enemy.count,
          topLevel: enemy.topLevel,
          terrain: enemy.terrain,
          strong: enemy.strong,
          names: enemy.names,
          factionLabel: nonEmptyText(enemy?.factionLabel)
        },
        distance,
        enemyTileKey,
        alreadySpottedEnemy,
        newlySpottedEnemy,
        playerEffectiveScout,
        enemyEffectiveScout,
        playerFoundEnemy,
        enemyFoundPlayer,
        enemyAttack,
        ambushByFumble,
        attackChance,
        attackRoll,
        fumbleRoll
      });
    }
  }

  const notes = [];
  if (!entries.length) {
    notes.push(
      context === "move"
        ? "索敵判定(移動): 周辺に敵影なし"
        : "索敵判定(ターン): 敵影なし"
    );
  } else {
    const emittedNotes = [];
    for (const entry of entries) {
      if (entry.alreadySpottedEnemy && !entry.newlySpottedEnemy) {
        // Already discovered enemy should not be logged repeatedly.
        continue;
      }
      const playerTag = `${entry.playerGroup.label}(索${entry.playerGroup.scout}/隠${entry.playerGroup.stealth})`;
      const enemyHead = entry.enemyGroup.kind === "faction"
        ? `${entry.enemyGroup.factionLabel || "他勢力"}部隊`
        : (entry.enemyGroup.names[0] || "敵");
      const enemyTag = `${enemyHead}x${entry.enemyGroup.count}(索${entry.enemyGroup.scout}/隠${entry.enemyGroup.stealth})`;
      const detectText = entry.playerFoundEnemy ? "発見成功" : "未発見";
      const foundByEnemyText = entry.enemyFoundPlayer ? "被発見" : "未発見";
      let attackText = "接敵なし";
      if (entry.enemyFoundPlayer) {
        if (entry.ambushByFumble) {
          attackText = "不意打ち被弾(ファンブル)";
        } else if (entry.enemyAttack) {
          attackText = `襲撃判定成功(${Math.round(entry.attackChance * 100)}%)`;
        } else {
          attackText = `襲撃判定失敗(${Math.round(entry.attackChance * 100)}%)`;
        }
      }
      emittedNotes.push(
        `索敵: ${playerTag} vs ${enemyTag} / 距離${entry.distance} / ${detectText} / ${foundByEnemyText} / ${attackText}`
      );
      if (emittedNotes.length >= ENCOUNTER_MAX_LOG_LINES) break;
    }
    notes.push(...emittedNotes);
    const suppressedCount = entries.length - emittedNotes.length;
    if (suppressedCount > 0 && !notes.length) {
      notes.push(
        context === "move"
          ? "索敵判定(移動): 既知敵のみ（新規ログなし）"
          : "索敵判定(ターン): 既知敵のみ（新規ログなし）"
      );
    }
    if (entries.length > emittedNotes.length && emittedNotes.length >= ENCOUNTER_MAX_LOG_LINES) {
      notes.push(`索敵: ほか ${entries.length - emittedNotes.length} 件(既知含む)`);
    }
  }

  console.log("[EncounterCheck]", { context, entries, notes });
  for (const note of notes) {
    pushNationLog(note);
  }
  if (discoveredAnyTarget) {
    renderMapWithPhaser();
  }
  return { context, entries, notes };
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
  else if (key === "useFiveResourceMode") useFiveResourceMode.value = !!value;
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

function normalizeFocusPoint(focusWorld) {
  if (!focusWorld) return null;
  const fx = Number(focusWorld.x);
  const fy = Number(focusWorld.y);
  if (!Number.isFinite(fx) || !Number.isFinite(fy)) return null;
  return { x: fx, y: fy };
}

const clampNumber = clampNumberUtil;
const getCameraCenter = getCameraCenterUtil;
const clampCameraCenter = clampCameraCenterUtil;
const createBoundsAccumulator = createBoundsAccumulatorUtil;
const extendBoundsWithPoints = extendBoundsWithPointsUtil;
const finalizeBounds = finalizeBoundsUtil;

function clampCameraScroll(camera, worldW, worldH, viewW, viewH, options = {}) {
  clampCameraScrollUtil(camera, worldW, worldH, viewW, viewH, {
    ...options,
    wrapEnabled: resolveWorldWrapEnabled(currentData.value),
    renderedHexBounds,
    wrapDragMultiplierX: WRAP_DRAG_VIEW_RANGE_MULTIPLIER_X,
    wrapDragMultiplierY: WRAP_DRAG_VIEW_RANGE_MULTIPLIER_Y
  });
}

function resolveMinZoomPercent(dataLike = currentData.value) {
  return resolveMinZoomPercentUtil(dataLike, {
    mapPixelSize,
    gameViewWidth: GAME_VIEW_WIDTH,
    gameViewHeight: GAME_VIEW_HEIGHT,
    wrapDragMultiplierX: WRAP_DRAG_VIEW_RANGE_MULTIPLIER_X,
    wrapDragMultiplierY: WRAP_DRAG_VIEW_RANGE_MULTIPLIER_Y,
    resolveMaxZoomPercent,
    minZoomFloor: 80,
    defaultPercent: 100
  });
}

function resolveMaxZoomPercent(dataLike = currentData.value) {
  const w = Number(dataLike?.w);
  const h = Number(dataLike?.h);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 400;
  // 36x36 => 400%, 72x72 => 800% になるようにマップ総タイル数の平方根でスケール。
  const baseTiles = 36 * 36;
  const tileCount = Math.max(1, w * h);
  const scaled = 400 * Math.sqrt(tileCount / baseTiles);
  return Math.round(clampNumber(scaled, 400, 1200));
}

function normalizeZoomPercent(value, dataLike = currentData.value) {
  return normalizeZoomPercentUtil(value, dataLike, {
    resolveMinZoomPercent,
    resolveMaxZoomPercent,
    defaultPercent: 80
  });
}

const zoomController = createMapZoomController({
  getCurrentData: () => currentData.value,
  getVillageState: () => villageState.value,
  getZoomPercent: () => zoomPercent.value,
  setZoomPercentValue: value => {
    zoomPercent.value = value;
  },
  normalizeZoomPercent,
  resolveMinZoomPercent,
  toSafeNumber,
  nonEmptyText,
  normalizeFocusPoint,
  hexCenter,
  setCenterMapOnNextZoom: value => {
    centerMapOnNextZoom = !!value;
  },
  setPendingFocus: (focusWorld, mode = "near") => {
    pendingClickFocusWorld = focusWorld;
    pendingClickFocusMode = mode;
  },
  renderMapWithPhaser: () => {
    renderMapWithPhaser();
  }
});

const {
  setZoomPercent,
  isMinZoomActive,
  canDragMapAtCurrentZoom,
  queueCameraFocusAtWorld,
  queueCameraFocusAtTile,
  zoomIn,
  zoomOut,
  zoomReset
} = zoomController;

function focusCameraToNavigatorTarget(x, y, options = {}) {
  const data = currentData.value;
  if (!data || data.shapeOnly) {
    updateUnitInfoText("視点移動失敗: マップ未生成です。");
    return;
  }
  const tx = Math.floor(toSafeNumber(x, NaN));
  const ty = Math.floor(toSafeNumber(y, NaN));
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) {
    updateUnitInfoText("視点移動失敗: 対象座標が未配置です。");
    return;
  }
  if (tx < 0 || ty < 0 || tx >= data.w || ty >= data.h) {
    updateUnitInfoText(`視点移動失敗: 範囲外座標 (${tx}, ${ty})`);
    return;
  }
  const unitId = nonEmptyText(options?.unitId);
  if (unitId && unitList.value.some(unit => nonEmptyText(unit?.id) === unitId)) {
    selectedUnitId.value = unitId;
  }
  selectedTileKey = coordKey(tx, ty);
  queueCameraFocusAtTile(tx, ty);
  renderMapWithPhaser();
  const picked = hitAreaMap.get(selectedTileKey);
  if (picked) updateMapClickInfo(picked);
  const label = nonEmptyText(options?.label) || "対象";
  updateUnitInfoText(`${label}へ視点移動: (${tx}, ${ty})`);
}

function focusCameraToUnitByIdFromNavigator(unitId) {
  const targetId = nonEmptyText(unitId);
  if (!targetId) return;
  const target = unitList.value.find(unit => nonEmptyText(unit?.id) === targetId) || null;
  if (!target) {
    updateUnitInfoText("視点移動失敗: 対象ユニットが見つかりません。");
    return;
  }
  focusCameraToNavigatorTarget(target.x, target.y, {
    unitId: target.id,
    label: nonEmptyText(target.name) || "ユニット"
  });
}

function focusCameraToSquadByLeaderFromNavigator(leaderId) {
  const targetLeaderId = nonEmptyText(leaderId);
  if (!targetLeaderId) return;
  const leader = unitList.value.find(unit => nonEmptyText(unit?.id) === targetLeaderId) || null;
  if (!leader) {
    updateUnitInfoText("視点移動失敗: 部隊リーダーが見つかりません。");
    return;
  }
  const squadName = nonEmptyText(leader?.squadName) || nonEmptyText(leader?.name) || "部隊";
  focusCameraToNavigatorTarget(leader.x, leader.y, {
    unitId: leader.id,
    label: squadName
  });
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
    turnState,
    enemySpawnStats
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
  if (enemySpawnStats) {
    const enemyTotal = Math.max(0, Math.floor(toSafeNumber(enemySpawnStats.total, 0)));
    const enemyUnits = Math.max(0, Math.floor(toSafeNumber(enemySpawnStats.totalUnits, 0)));
    const strongCount = Math.max(0, Math.floor(toSafeNumber(enemySpawnStats.strongTileCount, 0)));
    lines.push(`敵候補: ${enemyTotal}マス / 敵総数: ${enemyUnits} / 強敵地形: ${strongCount}`);
    const byTerrain = enemySpawnStats.byTerrain && typeof enemySpawnStats.byTerrain === "object"
      ? enemySpawnStats.byTerrain
      : {};
    const terrainEntries = Object.entries(byTerrain)
      .map(([key, value]) => [key, Math.max(0, Math.floor(toSafeNumber(value, 0)))])
      .filter(([key, value]) => nonEmptyText(key) && value > 0)
      .sort((a, b) => b[1] - a[1]);
    if (terrainEntries.length) {
      lines.push(`敵地形内訳: ${terrainEntries.map(([key, value]) => `${key} ${value}`).join(" / ")}`);
    }
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
      targetCenter = wrapEnabled && pendingClickFocusMode !== "absolute"
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
  pendingClickFocusMode = "near";

  baseLayer.clear();
  if (lavaLayer) lavaLayer.clear();
  markerLayer.clear();
  if (hoverLayer) hoverLayer.clear();
  clearLabels();
  hitAreas = [];
  hitAreaMap = new Map();
  rebuildTerritorySets(data);
  rebuildVisibleTiles(data);
  const opposingFactionTileMap = buildOpposingFactionUnitsByTile(data);

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
  const fogHiddenAlpha = showTestControls.value ? FOG_HIDDEN_ALPHA_TEST : FOG_HIDDEN_ALPHA;
  const waterfallTextureKey = ensureRaceMarkerTexture(resolveWaterfallIconName());
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
        if (!tileVisible) {
          baseLayer.fillStyle(FOG_HIDDEN_FILL, fogHiddenAlpha);
          baseLayer.fillPoints(points, true);
        }
        if (revealSpecial) {
          baseLayer.fillStyle(toColorInt(special.overlayColor), special.overlayAlpha);
          baseLayer.fillPoints(points, true);
        }
        const owner = tileVisible ? tileOwnerAt(x, y) : "";
        const factionOwnerId = tileVisible ? tileFactionOwnerIdAt(x, y) : "";
        const borderStyle = tileVisible ? borderStyleForOwner(owner, factionOwnerId) : FOG_HIDDEN_BORDER;
        baseLayer.lineStyle(borderStyle.width, borderStyle.color, borderStyle.alpha);
        baseLayer.strokePoints(points, true);
        if (tileVisible && moveContext.reachableSet.has(tileKey) && tileKey !== moveContext.startKey) {
          baseLayer.lineStyle(2.35, 0x6cff79, moveBlinkAlpha);
          baseLayer.strokePoints(points, true);
        }

        const baseCenter = hexCenter(x, y);
        const center = { cx: baseCenter.cx + offX, cy: baseCenter.cy + offY };
        const symbolShouldDraw = tileVisible && (drawTerrainSymbol || revealSpecial);
        let specialIconRendered = false;
        if (revealSpecial) {
          const specialIconName = resolveSpecialOverlayIconName(special.key);
          const specialIconTextureKey = ensureRaceMarkerTexture(specialIconName);
          if (specialIconTextureKey && scene.textures.exists(specialIconTextureKey)) {
            const iconSize = special.key === "洞窟"
              ? MAP_SPECIAL_ICON_CONFIG.caveSize
              : MAP_SPECIAL_ICON_CONFIG.defaultSize;
            const specialIcon = scene.add.image(
              center.cx,
              center.cy + MAP_SPECIAL_ICON_CONFIG.offsetY,
              specialIconTextureKey
            );
            specialIcon.setDisplaySize(iconSize, iconSize);
            specialIcon.setOrigin(0.5);
            labelTexts.push(specialIcon);
            specialIconRendered = true;
          }
        }
        if (symbolShouldDraw && !specialIconRendered) {
          const terrainShort = mixedForestRelief
            ? (reliefKey === "山岳" ? "森山" : "森丘")
            : visual.short;
          const symbolLabel = scene.add.text(center.cx, center.cy - 6, revealSpecial ? special.short : terrainShort, {
            fontFamily: "Times New Roman, Yu Mincho, serif",
            fontSize: revealSpecial
              ? `${special.key === "洞窟"
                ? MAP_SPECIAL_ICON_CONFIG.fallbackCaveTextFontSizePx
                : MAP_SPECIAL_ICON_CONFIG.fallbackTextFontSizePx}px`
              : "19px",
            color: revealSpecial ? special.textColor : "#f8f5e8"
          });
          symbolLabel.setOrigin(0.5);
          labelTexts.push(symbolLabel);
        }

        if (tileVisible && showWaterfallEffects.value && isWaterfall) {
          const fallY = symbolShouldDraw
            ? center.cy + MAP_WATERFALL_ICON_CONFIG.yOffsetWhenTerrainSymbolVisible
            : center.cy + MAP_WATERFALL_ICON_CONFIG.yOffsetWhenTerrainSymbolHidden;
          if (waterfallTextureKey && scene.textures.exists(waterfallTextureKey)) {
            const fallIcon = scene.add.image(center.cx, fallY, waterfallTextureKey);
            fallIcon.setDisplaySize(MAP_WATERFALL_ICON_CONFIG.size, MAP_WATERFALL_ICON_CONFIG.size);
            fallIcon.setOrigin(0.5);
            labelTexts.push(fallIcon);
          } else {
            const fallLabel = scene.add.text(center.cx, fallY, "滝", {
              fontFamily: "Noto Sans JP, Hiragino Kaku Gothic ProN, Meiryo, sans-serif",
              fontStyle: "700",
              fontSize: `${MAP_WATERFALL_ICON_CONFIG.fallbackFontSizePx}px`,
              color: "#ecf8ff"
            });
            fallLabel.setStroke("#153a52", 3);
            fallLabel.setShadow(0, 0, "#000000", 3, false, true);
            fallLabel.setOrigin(0.5);
            labelTexts.push(fallLabel);
          }
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

        const hasTileEnemy = Array.isArray(data?.enemySpawnMap?.[y]?.[x]) && data.enemySpawnMap[y][x].length > 0;
        const hasFactionEnemy = opposingFactionTileMap.has(tileKey);
        const spottedEnemyVisible = tileVisible && hasTileEnemy && spottedEnemyTileKeys.has(tileKey);
        const spottedFactionVisible = tileVisible && hasFactionEnemy && spottedFactionTileKeys.has(tileKey);
        if (spottedEnemyVisible) {
          const tileEnemyList = Array.isArray(data?.enemySpawnMap?.[y]?.[x]) ? data.enemySpawnMap[y][x] : [];
          const leadEnemy = tileEnemyList.length ? tileEnemyList[0] : null;
          const enemyMarkerIconName = resolveEnemyIconName(leadEnemy);
          const enemyMarkerTextureKey = ensureRaceMarkerTexture(enemyMarkerIconName);
          const enemyMx = center.cx + MAP_ENEMY_MARKER_CONFIG.offsetX;
          const enemyMy = center.cy + MAP_ENEMY_MARKER_CONFIG.offsetY;
          if (enemyMarkerTextureKey && scene.textures.exists(enemyMarkerTextureKey)) {
            const enemyIconSprite = scene.add.image(enemyMx, enemyMy, enemyMarkerTextureKey);
            enemyIconSprite.setDisplaySize(MAP_ENEMY_MARKER_CONFIG.iconSize, MAP_ENEMY_MARKER_CONFIG.iconSize);
            enemyIconSprite.setOrigin(0.5);
            labelTexts.push(enemyIconSprite);
          } else {
            const enemyMarker = scene.add.text(enemyMx, enemyMy, "敵", {
              fontFamily: "Noto Sans JP, Hiragino Kaku Gothic ProN, Meiryo, sans-serif",
              fontStyle: "700",
              fontSize: "9px",
              color: "#fff2da"
            });
            enemyMarker.setOrigin(0.5);
            enemyMarker.setStroke("#3f0f0f", 2);
            labelTexts.push(enemyMarker);
          }
        }
        if (spottedFactionVisible) {
          const factionMx = center.cx + MAP_FACTION_MARKER_CONFIG.offsetX;
          const factionMy = center.cy + MAP_FACTION_MARKER_CONFIG.offsetY;
          markerLayer.fillStyle(0x2c68b8, 0.96);
          markerLayer.fillCircle(factionMx, factionMy, MAP_FACTION_MARKER_CONFIG.radius);
          markerLayer.lineStyle(1.2, 0xe3f1ff, 0.94);
          markerLayer.strokeCircle(factionMx, factionMy, MAP_FACTION_MARKER_CONFIG.radius);
          const factionMarker = scene.add.text(factionMx, factionMy, "勢", {
            fontFamily: "Noto Sans JP, Hiragino Kaku Gothic ProN, Meiryo, sans-serif",
            fontStyle: "700",
            fontSize: "9px",
            color: "#f2f7ff"
          });
          factionMarker.setOrigin(0.5);
          factionMarker.setStroke("#0f2142", 2);
          labelTexts.push(factionMarker);
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
    const squadMarkerIconName = members
      .map(unit => nonEmptyText(unit?.squadIconName))
      .find(name => name.length > 0) || "";
    const markerIconName = resolveAvailableIconName(
      squadMarkerIconName,
      resolveRaceIconNameForUnit(lead)
    );
    const markerTextureKey = ensureRaceMarkerTexture(markerIconName);
    const glyph = resolveRaceGlyph(lead.race);
    for (const offset of wrapOffsets) {
      if (!shouldDrawWrappedTileCopy(lead.x, lead.y, offset, data.w, data.h)) continue;
      const ox = offset?.x || 0;
      const oy = offset?.y || 0;
      const center = { cx: baseCenter.cx + ox, cy: baseCenter.cy + oy };
      const unitMx = center.cx + MAP_UNIT_MARKER_CONFIG.offsetX;
      const unitMy = center.cy + MAP_UNIT_MARKER_CONFIG.offsetY;
      markerLayer.fillStyle(iconColor, 0.92);
      markerLayer.fillCircle(unitMx, unitMy, MAP_UNIT_MARKER_CONFIG.radius);
      markerLayer.lineStyle(1.5, 0xe8f3ff, 0.95);
      markerLayer.strokeCircle(unitMx, unitMy, MAP_UNIT_MARKER_CONFIG.radius);
      if (markerTextureKey && scene.textures.exists(markerTextureKey)) {
        const raceIconSprite = scene.add.image(unitMx, unitMy, markerTextureKey);
        raceIconSprite.setDisplaySize(MAP_UNIT_MARKER_CONFIG.iconSize, MAP_UNIT_MARKER_CONFIG.iconSize);
        raceIconSprite.setOrigin(0.5);
        labelTexts.push(raceIconSprite);
      } else {
        const raceGlyphText = scene.add.text(unitMx, unitMy, glyph, {
          fontFamily: "Noto Sans JP, Hiragino Kaku Gothic ProN, Meiryo, sans-serif",
          fontStyle: "700",
          fontSize: "11px",
          color: "#f8fbff"
        });
        raceGlyphText.setOrigin(0.5);
        raceGlyphText.setStroke("#12202f", 2);
        labelTexts.push(raceGlyphText);
      }

      if (members.length > 1) {
        const countText = scene.add.text(
          unitMx + MAP_UNIT_MARKER_CONFIG.radius * 0.66,
          unitMy + MAP_UNIT_MARKER_CONFIG.radius * 0.66,
          `${members.length}`,
          {
            fontFamily: "Consolas, 'Courier New', monospace",
            fontStyle: "800",
            fontSize: "11px",
            color: "#f2f7ff"
          }
        );
        countText.setOrigin(0.5);
        countText.setStroke("#09111f", 1);
        countText.setResolution(2);
        labelTexts.push(countText);
      }
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

function runTurnForActiveFaction(data, options = {}) {
  if (currentData.value) rebuildTerritorySets(currentData.value);
  resetAllUnitMoveRemaining();
  pushNationLog("移動残量回復: 全ユニットの移動残を最大まで回復");
  const economyResult = processVillageEconomyTurn(data, {
    raceFallback: nonEmptyText(options?.raceFallback),
    emitState: false
  });
  const encounterResult = runEnemyEncounterCheck({ context: "turn" });
  return {
    economyResult,
    encounterResult
  };
}

function runTurnForAllTestPlayers(data) {
  const slots = [...testPlayerSlots.value];
  const activeBefore = nonEmptyText(activeTestPlayerId.value);
  const allEconomyNotes = [];
  const allEncounterNotes = [];

  for (const slot of slots) {
    if (!slot?.factionState) continue;
    applyFactionStateSnapshotToLiveState(slot.factionState, { emitState: false, render: false });
    const result = runTurnForActiveFaction(data, {
      raceFallback: nonEmptyText(slot?.race)
    });
    slot.factionState = buildLiveFactionStateSnapshot();
    const head = `--- ${nonEmptyText(slot?.label) || nonEmptyText(slot?.id) || "プレイヤー"} ---`;
    const economyLines = Array.isArray(result?.economyResult?.notes) ? result.economyResult.notes : [];
    const encounterLines = Array.isArray(result?.encounterResult?.notes) ? result.encounterResult.notes : [];
    allEconomyNotes.push(head, ...economyLines);
    allEncounterNotes.push(head, ...encounterLines);
  }

  testPlayerSlots.value = slots.map(slot => ({ ...slot, ready: false }));
  const restoreId = testPlayerSlots.value.some(slot => slot.id === activeBefore)
    ? activeBefore
    : (testPlayerSlots.value[0]?.id || DEFAULT_TEST_PLAYER_ID);
  const restoreSlot = testPlayerSlots.value.find(slot => slot.id === restoreId) || null;
  activeTestPlayerId.value = restoreId;
  if (restoreSlot?.factionState) {
    applyFactionStateSnapshotToLiveState(restoreSlot.factionState, { emitState: false, render: false });
  }

  return {
    economyNotes: allEconomyNotes,
    encounterNotes: allEncounterNotes
  };
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
  ensureTestPlayerSlotsInitialized();
  if (isTestMultiplayerActive.value) {
    syncActiveTestPlayerSlotFromLiveState();
    markActiveTestPlayerTurnReady();
    const activeLabel = nonEmptyText(activeTestPlayerSlot.value?.label) || "プレイヤー";
    if (!areAllTestPlayersReady()) {
      updateUnitInfoText(`ターン待機: ${activeLabel} が終了（${testPlayersReadyLabel.value}）`);
      renderMapWithPhaser();
      return;
    }
  }
  const mode = String(options?.eventMode || "normal");
  const result = advanceTerrainTurn(currentData.value, {
    eventMode: mode
  });
  result.data.worldWrapEnabled = !!currentData.value?.worldWrapEnabled;
  applyMapData(result.data, { resetClock: false, rebuildCharacters: false });
  const turnRuntime = isTestMultiplayerActive.value
    ? runTurnForAllTestPlayers(result.data)
    : (() => {
      const singleResult = runTurnForActiveFaction(result.data);
      return {
        economyNotes: Array.isArray(singleResult?.economyResult?.notes) ? singleResult.economyResult.notes : [],
        encounterNotes: Array.isArray(singleResult?.encounterResult?.notes) ? singleResult.encounterResult.notes : [],
        economyApplied: !!singleResult?.economyResult?.applied
      };
    })();
  const turn = Number(result.data?.turnState?.turnNumber || 0);
  eventModalMessage.value = formatTurnEventMessage(turn, result.events, mode);
  const baseNotes = formatTurnEventNotes(result.events);
  const economyNotes = Array.isArray(turnRuntime?.economyNotes) ? turnRuntime.economyNotes : [];
  const encounterNotes = Array.isArray(turnRuntime?.encounterNotes) ? turnRuntime.encounterNotes : [];
  const economyApplied = turnRuntime?.economyApplied !== false;
  if (economyApplied) {
    eventModalNotes.value = [...baseNotes, "---- 経済処理 ----", ...economyNotes, "---- 索敵処理 ----", ...encounterNotes];
    for (const line of economyNotes) {
      if (String(line || "").startsWith("--- ")) continue;
      pushNationLog(line);
    }
  } else {
    eventModalNotes.value = [...baseNotes, ...economyNotes, "---- 索敵処理 ----", ...encounterNotes];
  }
  clearAllTestPlayerTurnReady();
  emitCharacterStateChange();
  renderMapWithPhaser();
  pushNationLog(`ターン進行: T${turn} / ${eventModeLabel(mode)} / イベント${result.events.length}件`);
  showEventModal.value = true;
}

function runManagedEventTurn() {
  runNextTurn({ eventMode: eventActionType.value, playSe: false });
  showEventControlModal.value = false;
}

function openQuickSettingsModalFromMap() {
  kickOffBgm();
  audio.playSe("open");
  showQuickSettingsModal.value = true;
}

function closeQuickSettingsModalFromMap() {
  audio.playSe("cancel");
  showQuickSettingsModal.value = false;
}

function openDisplaySettingsFromQuickMenu() {
  showQuickSettingsModal.value = false;
  openSettingsModal();
}

function buildSaveDownloadFileName() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `fantasy_strategy_save_${y}${m}${d}_${hh}${mm}${ss}.json`;
}

async function downloadSaveDataFromQuickMenu() {
  if (saveExportInProgress.value) return;
  saveExportInProgress.value = true;
  try {
    const exporter = typeof window !== "undefined" ? window.export_game_save_data : null;
    if (typeof exporter !== "function") {
      updateUnitInfoText("セーブ失敗: エクスポート関数が未初期化です。");
      audio.playSe("cancel");
      return;
    }
    const jsonText = await exporter();
    const text = nonEmptyText(jsonText);
    if (!text) {
      updateUnitInfoText("セーブ失敗: 出力データが空です。");
      audio.playSe("cancel");
      return;
    }
    const fileName = buildSaveDownloadFileName();
    const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    updateUnitInfoText(`セーブ完了: ${fileName}`);
    pushNationLog(`セーブ出力: ${fileName}`);
    audio.playSe("confirm");
    showQuickSettingsModal.value = false;
  } catch (error) {
    console.error("[QuickSettings][SaveExport] failed", error);
    updateUnitInfoText("セーブ失敗: 出力処理でエラーが発生しました。");
    audio.playSe("cancel");
  } finally {
    saveExportInProgress.value = false;
  }
}

function openSaveLoadFileDialogFromQuickMenu() {
  if (saveLoadInProgress.value) return;
  const input = saveLoadInput.value;
  if (!input) {
    updateUnitInfoText("ロード失敗: ファイル入力の初期化に失敗しました。");
    audio.playSe("cancel");
    return;
  }
  input.value = "";
  input.click();
}

async function handleSaveLoadFileChange(event) {
  const input = event?.target;
  const file = input?.files?.[0] || null;
  if (!file) return;
  if (saveLoadInProgress.value) return;
  saveLoadInProgress.value = true;
  try {
    const text = await file.text();
    const importer = typeof window !== "undefined" ? window.import_game_save_data : null;
    if (typeof importer !== "function") {
      updateUnitInfoText("ロード失敗: インポート関数が未初期化です。");
      audio.playSe("cancel");
      return;
    }
    const result = await importer(text);
    if (!result || result.ok === false) {
      const reason = nonEmptyText(result?.reason) || "ロード失敗: データ適用に失敗しました。";
      updateUnitInfoText(reason);
      audio.playSe("cancel");
      return;
    }
    updateUnitInfoText(`ロード完了: ${file.name}`);
    showQuickSettingsModal.value = false;
    audio.playSe("confirm");
  } catch (error) {
    console.error("[QuickSettings][SaveLoad] failed", error);
    updateUnitInfoText("ロード失敗: JSONの読み込みに失敗しました。");
    audio.playSe("cancel");
  } finally {
    saveLoadInProgress.value = false;
    if (input) input.value = "";
  }
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

function handleOwnUnitNavigatorFocusUnit(payload = {}) {
  focusCameraToUnitByIdFromNavigator(payload?.unitId);
}

function handleOwnUnitNavigatorFocusSquad(payload = {}) {
  focusCameraToSquadByLeaderFromNavigator(payload?.leaderId);
}

function handleOwnUnitNavigatorOpenCharacterStatus(payload = {}) {
  const targetId = nonEmptyText(payload?.unitId);
  if (targetId && unitList.value.some(unit => nonEmptyText(unit?.id) === targetId)) {
    selectedUnitId.value = targetId;
  }
  openCharacterStatusModalFromMap();
}

function handleOwnUnitNavigatorSelectMoveUnit(payload = {}) {
  if (unitMoveMode.value) {
    toggleUnitMoveMode();
    return;
  }
  const targetId = nonEmptyText(payload?.unitId);
  if (!targetId) return;
  const source = unitList.value.find(unit => nonEmptyText(unit?.id) === targetId) || null;
  if (!source) {
    updateUnitInfoText("移動対象の選択に失敗: ユニットが見つかりません。");
    return;
  }
  const leaderId = nonEmptyText(source?.squadLeaderId);
  const target = leaderId
    ? (unitList.value.find(unit => nonEmptyText(unit?.id) === leaderId) || source)
    : source;
  if (!canUseUnitAsMoveCandidate(target)) {
    updateUnitInfoText(`${nonEmptyText(target?.name) || "ユニット"} は移動対象にできません。`);
    return;
  }
  kickOffBgm();
  audio.playSe("select");
  selectedUnitId.value = target.id;
  moveUnitCandidateId.value = target.id;
  unitMoveMode.value = true;
  showMoveUnitModal.value = false;
  updateUnitInfoText(`${target.name} を移動対象に設定`);
  emitCharacterStateChange();
  renderMapWithPhaser();
}

function togglePinnedNationLogPanel() {
  kickOffBgm();
  audio.playSe("change");
  showPinnedNationLogPanel.value = !showPinnedNationLogPanel.value;
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
    const costText = formatMaterialPositiveResourceBag(definition.cost);
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
  pushNationLog(`建設完了: ${definition.name} / コスト ${formatMaterialPositiveResourceBag(definition.cost)} / 補正 ${formatVillageBuildingBonus(definition.bonus)}`);
  emitCharacterStateChange();
  audio.playSe("confirm");
  showVillageBuildModal.value = false;
}

function applyCityAbilityLevelUp(abilityKey) {
  if (!canOpenVillageBuild.value) {
    updateUnitInfoText("都市能力強化失敗: 初期村を配置してください。");
    return;
  }
  const village = ensureVillageStateShape(villageState.value, props.selectedRace);
  if (!village) {
    updateUnitInfoText("都市能力強化失敗: 村データが不正です。");
    return;
  }
  const key = nonEmptyText(abilityKey);
  if (!CITY_ABILITY_KEYS.includes(key)) {
    updateUnitInfoText("都市能力強化失敗: 能力キーが不正です。");
    return;
  }
  const current = resolveVillageAbilityLevel(village, key, CITY_ABILITY_DEFINED_CAP);
  if (current >= CITY_ABILITY_ACTIVE_CAP) {
    updateUnitInfoText(`都市能力強化失敗: ${key} は当面上限Lv${CITY_ABILITY_ACTIVE_CAP}です。`);
    return;
  }
  const nextLevel = current + 1;
  const cost = resolveCityAbilityUpgradeCost(key, nextLevel);
  if (!canAffordCityAbilityUpgrade(village, key)) {
    updateUnitInfoText(`都市能力強化失敗: 資材不足 (${key} Lv${nextLevel} / 必要: ${formatMaterialPositiveResourceBag(cost)})`);
    return;
  }
  const nextVillage = applyCityAbilityUpgrade(village, key);
  if (!nextVillage) {
    updateUnitInfoText("都市能力強化失敗: 村データ更新に失敗しました。");
    return;
  }
  villageState.value = nextVillage;
  updateVillageInfoText();
  updateUnitInfoText(`都市能力強化: ${key} Lv${current} -> Lv${nextLevel} / コスト ${formatMaterialPositiveResourceBag(cost)}`);
  pushNationLog(`都市能力強化: ${key} Lv${current} -> Lv${nextLevel} / コスト ${formatMaterialPositiveResourceBag(cost)}`);
  emitCharacterStateChange();
  audio.playSe("confirm");
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
    ensureTestPlayerSlotsInitialized();
  }
}

function handleActiveTestPlayerSelection() {
  const targetId = nonEmptyText(activeTestPlayerId.value);
  if (!targetId) return;
  switchActiveTestPlayer(targetId);
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
    updateUnitInfoText(`ユニット作成失敗: 資源不足 (必要: 食料 ${formatFoodResourceBag(cost.food)} / 資材 ${formatMaterialResourceBag(cost.material)})`);
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
      fixedLevel: MOB_INITIAL_LEVEL
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
  pushNationLog(`ユニット作成: ${createdUnits.length}体 (${raceName}/${className})${cappedByPopulation ? ` [上限補正 ${requestedCount}->${createCount}]` : ""} / ${firstName}${createdUnits.length > 1 ? `〜${lastName}` : ""} / コスト 食料 ${formatFoodResourceBag(cost.food)} / 資材 ${formatMaterialResourceBag(cost.material)} / モブ ${mobUnitCount.value}/${mobUnitCap.value}`);
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
  const baseData = {
    ...(data || {}),
    worldWrapEnabled: data?.worldWrapEnabled == null
      ? !!customWorldWrapEnabled.value
      : !!data.worldWrapEnabled
  };
  const enemySpawnData = buildEnemySpawnDataForMap(baseData);
  const normalizedData = {
    ...baseData,
    ...enemySpawnData
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
  pendingClickFocusMode = "near";
  dragPointerId = null;
  dragStarted = false;
  touchPointerViewMap.clear();
  pinchActive = false;
  pinchStartDistance = 0;
  suppressTouchTapUntilRelease = false;
  if (options.rebuildCharacters !== false) {
    resetVisibilityState();
  }
  if (options.rebuildCharacters !== false) {
    createVillageAndInitialUnit(normalizedData);
    if (testPlayerSlots.value.length > 1) {
      syncActiveTestPlayerSlotFromLiveState();
    } else {
      resetTestPlayerSlotsFromLiveState();
    }
  } else {
    ensureTestPlayerSlotsInitialized();
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
      units: "不明",
      enemies: "不明",
      canOpenVillageActions: false
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
  const tileEnemies = enemiesAt(picked.x, picked.y, currentData.value);
  const tileKey = coordKey(picked.x, picked.y);
  const opposingFactionTileMap = buildOpposingFactionUnitsByTile(currentData.value);
  const hasOpposingFactionUnits = opposingFactionTileMap.has(tileKey);
  const factionSpotted = showTestControls.value || spottedFactionTileKeys.has(tileKey);
  const opposingFactionText = hasOpposingFactionUnits
    ? (factionSpotted
      ? formatOpposingFactionUnitsAtTile(picked.x, picked.y, { tileMap: opposingFactionTileMap })
      : "未発見")
    : "なし";
  console.log("[EnemySpawn][TileSelect]", {
    x: picked.x,
    y: picked.y,
    terrain: picked.terrain,
    heightLevel: Number.isFinite(heightLevel) ? heightLevel : null,
    enemyCount: tileEnemies.length,
    enemies: tileEnemies,
    opposingFactionCount: hasOpposingFactionUnits ? toSafeNumber(opposingFactionTileMap.get(tileKey)?.units?.length, 0) : 0,
    opposingFactionSpotted: factionSpotted
  });
  const monsterEnemyText = tileEnemies.length
    ? tileEnemies.map(enemy => {
      const parts = [];
      const name = nonEmptyText(enemy?.name) || nonEmptyText(enemy?.race) || "敵";
      const lv = Math.max(1, Math.floor(toSafeNumber(enemy?.level, 1)));
      parts.push(`${name}(Lv${lv})`);
      const className = nonEmptyText(enemy?.className);
      if (className) parts.push(`/${className}`);
      if (enemy?.strong) parts.push("[強]");
      return parts.join("");
    }).join(", ")
    : "なし";
  const enemyText = hasOpposingFactionUnits || factionSpotted
    ? `モンスター:${monsterEnemyText} / 他勢力:${opposingFactionText}`
    : monsterEnemyText;
  const village = villageState.value?.placed && villageState.value?.x === picked.x && villageState.value?.y === picked.y ? "あり" : "なし";
  const villageDetailText = village === "あり"
    ? `${nonEmptyText(villageState.value?.name) || "村"} / ${resolveVillageScaleLabel(villageState.value)} / 人口${formatCompactNumber(villageState.value?.population)} / 能力:${formatCityAbilityLevels(villageState.value)} / 建設:${formatVillageBuildingList(villageState.value?.buildings)}`
    : "なし";
  const owner = picked.owner || tileOwnerAt(picked.x, picked.y);
  const ownerFactionId = tileFactionOwnerIdAt(picked.x, picked.y);
  const ownerFactionLabel = resolveFactionLabelById(ownerFactionId);
  const ownerText = isTestMultiplayerActive.value && ownerFactionId
    ? `${ownerFactionLabel || ownerFactionId}領`
    : (owner === "player" ? "自領" : owner === "enemy" ? "敵領" : "未所属");
  const isOwnVillageTile = !!(
    owner === "player"
    && villageState.value?.placed
    && villageState.value?.x === picked.x
    && villageState.value?.y === picked.y
  );
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
    units: unitText,
    enemies: enemyText,
    canOpenVillageActions: isOwnVillageTile
  };
  mapClickInfo.value = `クリック座標: (${picked.x}, ${picked.y}) / 地形: ${picked.terrain} / 領土: ${ownerText} / 村: ${village} / 海辺判定: ${coast} / 海接触: ${coastContact} / 地勢: ${relief} / 強敵: ${strong} / 特殊: ${special} / 洞窟規模: ${caveScale}(${caveSize}) / 川: ${river} / 滝: ${waterfall} / 溶岩: ${lava} / 高度Lv: ${Number.isFinite(heightLevel) ? heightLevel : "-"} / 高度Raw: ${Number.isFinite(heightRaw) ? heightRaw : "-"} / 敵: ${enemyText} / ユニット: ${unitText}${moveModeText}${placementModeText}`;
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

function isTouchPointer(pointer) {
  if (pointer?.wasTouch) return true;
  return nonEmptyText(pointer?.event?.pointerType).toLowerCase() === "touch";
}

function upsertTouchPointerView(pointer) {
  if (!isTouchPointer(pointer)) return false;
  const pointerId = pointer?.id;
  if (pointerId === undefined || pointerId === null) return false;
  const view = resolvePointerViewPosition(pointer);
  if (!Number.isFinite(view?.x) || !Number.isFinite(view?.y)) return false;
  touchPointerViewMap.set(pointerId, { x: view.x, y: view.y });
  return true;
}

function removeTouchPointerView(pointer) {
  const pointerId = pointer?.id;
  if (pointerId === undefined || pointerId === null) return;
  touchPointerViewMap.delete(pointerId);
}

function getActiveTouchPair() {
  if (touchPointerViewMap.size < 2) return null;
  const points = Array.from(touchPointerViewMap.values());
  const a = points[0];
  const b = points[1];
  if (!a || !b) return null;
  return [a, b];
}

function applyWheelStyleZoomStep(direction) {
  const stepDirection = direction > 0 ? 1 : -1;
  const nextZoom = normalizeZoomPercent(zoomPercent.value + (stepDirection * 25));
  if (nextZoom === zoomPercent.value) return false;
  setZoomPercent(nextZoom, { centerMode: "village" });
  return true;
}

function updatePinchZoom() {
  if (!scene || !currentData.value || touchPointerViewMap.size < 2) return;
  const pair = getActiveTouchPair();
  if (!pair) return;
  const [a, b] = pair;
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  if (!Number.isFinite(distance) || distance < 8) return;

  if (!pinchActive) {
    pinchActive = true;
    pinchStartDistance = distance;
    suppressTouchTapUntilRelease = true;
    if (dragPointerId !== null) resetDragState();
    setCanvasCursor("default");
    return;
  }

  const scaleRatio = distance / Math.max(pinchStartDistance, 1);
  if (Math.abs(scaleRatio - 1) < 0.08) return;
  applyWheelStyleZoomStep(scaleRatio > 1 ? 1 : -1);
  pinchStartDistance = distance;
}

function finishPinchIfNeeded() {
  if (touchPointerViewMap.size >= 2) return;
  pinchActive = false;
  pinchStartDistance = 0;
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

function isDirectMoveSelectableUnit(unit) {
  if (!unit) return false;
  return !nonEmptyText(unit?.squadLeaderId);
}

function canUseUnitAsMoveCandidate(unit) {
  if (!unit) return false;
  if (!isDirectMoveSelectableUnit(unit)) return false;
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
  runEnemyEncounterCheck({
    context: "move",
    focusPos: { x: stepNode.x, y: stepNode.y }
  });
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
  pendingClickFocusMode = "near";
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
  const touchPointer = upsertTouchPointerView(pointer);
  if (touchPointer && touchPointerViewMap.size >= 2) {
    updatePinchZoom();
    return;
  }
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
  const isTouch = upsertTouchPointerView(pointer);
  if ((isTouch && touchPointerViewMap.size >= 2) || pinchActive) {
    updatePinchZoom();
    return;
  }
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
  const touchPointer = isTouchPointer(pointer);
  if (touchPointer) {
    removeTouchPointerView(pointer);
    finishPinchIfNeeded();
  }
  if (pointer?.id !== undefined && pointer?.id !== null) {
    pointerViewCache.delete(pointer.id);
  }
  if (touchPointer && (pinchActive || suppressTouchTapUntilRelease)) {
    if (pointer.id === dragPointerId) {
      resetDragState();
    }
    if (touchPointerViewMap.size === 0) {
      suppressTouchTapUntilRelease = false;
    }
    updateHoveredTileByPointer(pointer);
    return;
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
  if (touchPointer && touchPointerViewMap.size === 0) {
    suppressTouchTapUntilRelease = false;
  }
}

function handlePointerLeave() {
  hoveredTileKey = "";
  drawHoverOverlay();
  if (dragPointerId !== null) resetDragState();
  pointerViewCache.clear();
  touchPointerViewMap.clear();
  pinchActive = false;
  pinchStartDistance = 0;
  suppressTouchTapUntilRelease = false;
}

function handleCanvasWheel(event) {
  if (!scene || !currentData.value) return;
  if (event?.preventDefault) event.preventDefault();
  const direction = Number(event?.deltaY) < 0 ? 1 : -1;
  applyWheelStyleZoomStep(direction);
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
    if (unitMoveMode.value && currentData.value) {
      renderMapWithPhaser();
    }
  }, 250);

  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: gameRoot.value,
    width: GAME_VIEW_WIDTH,
    height: GAME_VIEW_HEIGHT,
    // Improve clarity when the 1280x720 canvas is CSS-scaled on different displays.
    resolution: Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
    antialias: true,
    pixelArt: false,
    scale: {
      mode: Phaser.Scale.NONE,
      width: GAME_VIEW_WIDTH,
      height: GAME_VIEW_HEIGHT
    },
    transparent: true,
    scene: {
      create() {
        scene = this;
        // スマホの2本指ピンチズーム用に追加ポインタを確保する。
        this.input.addPointer(2);
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
    renderMapWithPhaser();
  };
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
  pendingClickFocusMode = "near";
  pointerViewCache.clear();
  touchPointerViewMap.clear();
  pinchActive = false;
  pinchStartDistance = 0;
  suppressTouchTapUntilRelease = false;
  raceMarkerTexturePending = new Set();
  resetVisibilityState();
});

watch(showTestControls, visible => {
  emit("test-controls-change", !!visible);
  if (currentData.value) {
    rebuildVisibleTiles(currentData.value);
    renderMapWithPhaser();
  }
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

watch([showHeightNumbers, heightNumberFontSize, heightNumberOutlineWidth, useHeightShading, useFiveResourceMode, showSpecialTilesAlways, showWaterfallEffects, showStrongEnemyMarkers], () => {
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
  if (!ready) return;
  if (!currentData.value || currentData.value.shapeOnly) return;
  if (unitList.value.length || villageState.value) return;
  createVillageAndInitialUnit(currentData.value);
  mapClickInfo.value = "クリック座標: 初期村の配置先タイルをクリックしてください。";
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
    <div class="phaser-stage">
        <div id="mapGrid" ref="gameRoot" class="phaser-map-canvas" :style="mapCanvasStyle">
      <header class="field-overlay-header" :class="{ minimized: headerMinimized }">
        <template v-if="!headerMinimized">
        <div class="field-resource-chip">
          <span>食料</span>
          <strong>{{ fieldResourceSummary.food }}</strong>
          <small class="resource-icon-row">
            <span
              v-for="entry in fieldResourceSummary.foodEntries"
              :key="`food-${entry.key}`"
              class="resource-icon-entry"
              :title="entry.key"
            >
              <img :src="entry.iconSrc" :alt="entry.key" />
              <em>{{ entry.displayValue }}</em>
            </span>
          </small>
        </div>
        <div
          class="field-resource-chip field-resource-chip-clickable field-resource-chip-inline-label"
          role="button"
          tabindex="0"
          :aria-pressed="materialHeaderExpanded"
          @click="toggleMaterialHeaderExpanded"
          @keydown.enter.prevent="toggleMaterialHeaderExpanded"
          @keydown.space.prevent="toggleMaterialHeaderExpanded"
        >
          <span>資材</span>
          <small v-if="!materialHeaderExpanded" class="resource-icon-row">
            <span
              v-for="entry in fieldResourceSummary.materialCollapsedEntries"
              :key="`mat-collapsed-${entry.key}`"
              class="resource-icon-entry"
              :title="entry.label"
            >
              <img :src="entry.iconSrc" :alt="entry.label" />
              <em>{{ entry.displayValue }}</em>
            </span>
          </small>
          <small v-else class="material-rows">
            <span
              v-for="group in fieldResourceSummary.materialGroups"
              :key="`mat-group-${group.label}`"
              class="material-row"
            >
              <span
                v-for="detail in group.details"
                :key="`mat-detail-${group.label}-${detail.key}`"
                class="material-token"
                :title="detail.key"
              >
                <img :src="detail.iconSrc" :alt="detail.key" />
                <em>{{ detail.displayValue }}</em>
              </span>
            </span>
          </small>
        </div>
        <div class="field-resource-chip">
          <span>総人口</span>
          <strong>{{ fieldResourceSummary.population }}</strong>
          <small>{{ fieldResourceSummary.populationDetail }}</small>
        </div>
        <div class="field-overlay-actions">
          <button type="button" class="overlay-action-btn" @click="openCharacterStatusModalFromMap">自キャラ</button>
          <button type="button" class="overlay-action-btn" @click="openSkillTreeModalFromMap">スキルツリー</button>
          <button type="button" class="overlay-action-btn" :aria-pressed="showPinnedNationLogPanel" @click="togglePinnedNationLogPanel">
            ログ表示: {{ showPinnedNationLogPanel ? "ON" : "OFF" }}
          </button>
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
          <button
            type="button"
            class="overlay-action-btn icon-only"
            title="設定"
            aria-label="設定"
            @click="openQuickSettingsModalFromMap"
          >
            <img class="overlay-action-icon" :src="QUICK_SETTINGS_ICON_SRC" alt="設定" />
          </button>
        </div>
        </template>
        <button
          type="button"
          class="overlay-header-drawer-toggle"
          :class="{ minimized: headerMinimized }"
          :title="headerMinimized ? 'ヘッダーを展開' : 'ヘッダーを最小化'"
          :aria-label="headerMinimized ? 'ヘッダーを展開' : 'ヘッダーを最小化'"
          @click="headerMinimized = !headerMinimized"
        >
          <span class="overlay-header-drawer-arrow" aria-hidden="true">{{ headerMinimized ? "▽" : "△" }}</span>
        </button>
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
          <div class="wide"><span>敵候補</span><strong>{{ selectedTileDetail.enemies }}</strong></div>
          <div class="wide"><span>ユニット</span><strong>{{ selectedTileDetail.units }}</strong></div>
        </div>
        <div v-if="selectedTileDetail?.canOpenVillageActions" class="field-overlay-tile-actions">
          <button type="button" class="overlay-action-btn" :disabled="!canOpenVillageBuild" @click="openVillageBuildModal">建設</button>
        </div>
        <div v-else class="field-overlay-tile-empty">マスをクリックすると詳細を表示します。</div>
      </section>
      <aside class="field-overlay-own-faction-panel">
        <own-faction-navigator-modal
          :squad-entries="ownSquadNavigatorEntries"
          :unit-entries="ownCharacterNavigatorEntries"
          :selected-unit-id="selectedUnitId"
          :can-use-move-mode="canUseUnitMoveMode()"
          :move-mode-enabled="unitMoveMode"
          :reset-key="activeTestPlayerId"
          @focus-unit="handleOwnUnitNavigatorFocusUnit"
          @focus-squad="handleOwnUnitNavigatorFocusSquad"
          @open-character-status="handleOwnUnitNavigatorOpenCharacterStatus"
          @select-move-unit="handleOwnUnitNavigatorSelectMoveUnit"
        />
      </aside>
      <aside v-if="showPinnedNationLogPanel" class="field-overlay-live-log">
        <div class="field-overlay-live-log-head">
          <strong>統治者ログ</strong>
          <button type="button" class="overlay-action-btn mini" @click="togglePinnedNationLogPanel">×</button>
        </div>
        <div class="field-overlay-live-log-summary">{{ nationLogSummaryText }}</div>
        <div class="field-overlay-live-log-list">
          <div v-for="(line, idx) in nationLogNotes" :key="`live-log-${idx}`">{{ line }}</div>
        </div>
      </aside>
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
          <section class="test-player-controls">
            <div class="small">テストプレイヤー</div>
            <label>操作勢力
              <select v-model="activeTestPlayerId" @change="handleActiveTestPlayerSelection">
                <option v-for="slot in testPlayerSlots" :key="`test-player-${slot.id}`" :value="slot.id">
                  {{ slot.label }} {{ slot.ready ? "(終了)" : "(未終了)" }}
                </option>
              </select>
            </label>
            <div class="test-player-actions">
              <button type="button" class="secondary" :disabled="testPlayerSlots.length >= MAX_TEST_PLAYER_COUNT" @click="addTestPlayerFaction">
                勢力追加
              </button>
              <button type="button" class="secondary" :disabled="testPlayerSlots.length <= 1" @click="removeActiveTestPlayerFaction">
                選択勢力削除
              </button>
            </div>
            <div class="small">ターン状態: {{ testPlayersReadyLabel }}</div>
          </section>
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
          <button id="advanceTurnBtn" class="secondary" type="button" :disabled="isTestMultiplayerActive && activeTestPlayerReady" @click="runNextTurn">
            {{ isTestMultiplayerActive ? (activeTestPlayerReady ? "ターン終了済み" : "ターン終了") : "ターン経過" }}
          </button>
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
          <div class="small phaser-help">クリックで詳細表示 / ドラッグで移動 / ホイール・2本指ピンチで拡大縮小 / ユニット移動ONでクリック移動（緑点滅枠が移動可能範囲、高度変化マスは移動コスト+1）。</div>
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

    <generic-modal
      :show="showSettingsModal"
      title="表示設定"
      modal-type="form"
      :fields="displaySettingsFields"
      :notes="displaySettingsNotes"
      @close="closeSettingsModal"
      @field-change="applyDisplaySettingChange"
    />
    <div v-if="showQuickSettingsModal" class="settings-backdrop" @click.self="closeQuickSettingsModalFromMap">
      <div class="settings-modal quick-settings-modal">
        <h3>設定メニュー</h3>
        <div class="quick-settings-grid">
          <button type="button" class="secondary" @click="openDisplaySettingsFromQuickMenu">音量/表示設定</button>
          <button type="button" class="secondary" :disabled="saveExportInProgress" @click="downloadSaveDataFromQuickMenu">
            {{ saveExportInProgress ? "セーブ生成中..." : "セーブデータ保存" }}
          </button>
          <button type="button" class="secondary" :disabled="saveLoadInProgress" @click="openSaveLoadFileDialogFromQuickMenu">
            {{ saveLoadInProgress ? "ロード中..." : "セーブデータ読込" }}
          </button>
          <input
            ref="saveLoadInput"
            type="file"
            accept=".json,application/json"
            class="visually-hidden"
            @change="handleSaveLoadFileChange"
          />
        </div>
        <div class="setting-note">
          セーブは現在の進行状態を JSON で保存します。
        </div>
        <div class="setting-actions">
          <button type="button" class="secondary" @click="closeQuickSettingsModalFromMap">閉じる</button>
        </div>
      </div>
    </div>

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
        <div class="small build-hint">都市規模: {{ resolveVillageScaleLabel(villageState) }} / 都市能力: {{ formatCityAbilityLevels(villageState) }}</div>
        <div class="city-ability-grid">
          <div
            v-for="row in cityAbilityRows"
            :key="`city-ability-${row.key}`"
            class="city-ability-item"
          >
            <div class="move-unit-line">
              <strong>{{ row.key }} Lv{{ row.level }}</strong>
              <span class="small">{{ row.atCap ? "上限" : `次 Lv${row.nextLevel}` }}</span>
            </div>
            <div class="small">必要資材: {{ row.costText }}</div>
            <button type="button" class="secondary" :disabled="!row.canUpgrade" @click="applyCityAbilityLevelUp(row.key)">
              Lvアップ
            </button>
          </div>
        </div>
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
            <div class="small">必要資材: {{ formatMaterialPositiveResourceBag(def.cost) }}</div>
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
        <div class="small move-unit-note">移動対象は「単体ユニット」または「部隊リーダー（部隊移動）」のみ選択できます。1回の移動処理は2マスまで進行します。</div>
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
              <span class="move-unit-name-with-icon">
                <img v-if="moveUnitIconSrc(unit)" :src="moveUnitIconSrc(unit)" :alt="`${unit.race || unit.name} アイコン`" class="move-unit-icon" />
                <span v-else class="move-unit-icon-fallback">{{ moveUnitIconGlyph(unit) }}</span>
                <strong>{{ unit.name }}</strong>
              </span>
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

<style scoped src="./PhaserMapGeneratorPanel.css"></style>
