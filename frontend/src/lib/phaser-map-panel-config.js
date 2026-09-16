import { getVillageScaleDefinitions } from "../composables/villageCoreUtils.js";
import { getGameDataRows } from "./game-data-registry.js";

// 村中心から領土として扱う半径。
export const PLAYER_TERRITORY_RANGE = 1;

// 領土タイル運用設定（資源化/居住化）。
export const TERRITORY_TILE_MODE_RESOURCE = "resource";
export const TERRITORY_TILE_MODE_SETTLEMENT = "settlement";
export const TERRITORY_TILE_MODE_CONFIG = {
  [TERRITORY_TILE_MODE_RESOURCE]: {
    label: "資源化",
    populationCapacityBonus: 5,
    employmentSlots: 10,
    incomeMultiplier: 2.0 // 資源+100%
  },
  [TERRITORY_TILE_MODE_SETTLEMENT]: {
    label: "居住化",
    populationCapacityBonus: 15,
    employmentSlots: 5,
    incomeMultiplier: 1.0
  }
};
export const TERRITORY_TILE_MODE_CONVERSION_TURNS = 2;

// 暫定値。領土最大HPの正式値が確定したら、この設定だけを変更する。
export const TERRITORY_TILE_MAX_HP = 100;

// 領土タイルの住居区分（保有可能人数計算）。
// 総収容人数 = 1マスあたり収容人数 × 使用マス数
export const TERRITORY_RESIDENTIAL_LEVEL_LAND = "land";
export const TERRITORY_RESIDENTIAL_LEVEL_ATTACHED = "attached";
const SETTLEMENT_SCALE_DEFINITIONS = getVillageScaleDefinitions();
const settlementScaleKeyAt = (level, fallback) => SETTLEMENT_SCALE_DEFINITIONS.find(row => row.level === level)?.key || fallback;
export const TERRITORY_RESIDENTIAL_LEVEL_VILLAGE = settlementScaleKeyAt(1, "village");
export const TERRITORY_RESIDENTIAL_LEVEL_TOWN = settlementScaleKeyAt(2, "town");
export const TERRITORY_RESIDENTIAL_LEVEL_CITY = settlementScaleKeyAt(3, "city");
export const TERRITORY_RESIDENTIAL_LEVEL_METROPOLIS = settlementScaleKeyAt(4, "metropolis");
export const TERRITORY_RESIDENTIAL_LEVEL_ORDER = SETTLEMENT_SCALE_DEFINITIONS.map(row => row.key).filter(Boolean);
export const TERRITORY_RESIDENTIAL_LEVEL_CONFIG = {
  [TERRITORY_RESIDENTIAL_LEVEL_LAND]: {
    label: "土地",
    capacityPerTile: 5,
    footprintTiles: 1,
    iconName: "",
    markerIconSize: 0
  },
  [TERRITORY_RESIDENTIAL_LEVEL_ATTACHED]: {
    label: "付属領域",
    capacityPerTile: 0,
    footprintTiles: 1,
    iconName: "",
    markerIconSize: 0
  },
  ...Object.fromEntries(SETTLEMENT_SCALE_DEFINITIONS.map(row => [row.key, {
    label:row.name,
    capacityPerTile:row.capacityPerTile,
    footprintTiles:row.footprintTiles,
    iconName:row.imageName,
    markerIconSize:row.displaySize
  }]))
};

// 六角タイル枠線の見た目設定。
// UIプロトタイプの見やすさを取り込み、通常タイルの輪郭を少し濃くする。
// 塗り色やFog判定には触れず、既存の探索/視界ロジックを維持する。
export const TILE_BORDER_DEFAULT = { width: 1.0, color: 0x26353b, alpha: 0.95 };
export const TILE_BORDER_PLAYER = { width: 2.25, color: 0x5ad4ff, alpha: 0.98 };
export const TILE_BORDER_ENEMY = { width: 2.25, color: 0xe25c5c, alpha: 0.98 };
export const TILE_BORDER_FACTION_WIDTH = 2.25;
export const TILE_BORDER_FACTION_ALPHA = 0.98;

// マルチ/テスト時に勢力境界へ順番に割り当てる色。
export const FACTION_BORDER_COLOR_PALETTE = [
  0x5ad4ff, 0xff6b6b, 0x8bff7d, 0xffb86a, 0xc98cff,
  0xffe36a, 0x6affcf, 0xff8ac8, 0xb0ff6a, 0x6a8dff,
  0xff9c5f, 0x7d6aff, 0x4be3b0, 0xd6ff6a, 0xff7a8a
];

// 未探索/非可視タイル（Fog）の表示設定。
export const FOG_HIDDEN_FILL = 0x7b818a;
export const FOG_HIDDEN_ALPHA = 0.5; // Fogタイルは半透明の塗りつぶしで、下の地形がうっすら見えるようにする。
export const FOG_HIDDEN_ALPHA_TEST = 0.5;// Fogタイルの境界線は、Fogの下に薄く描いて、Fogが消えたときに自然に見えるようにする。
export const FOG_HIDDEN_BORDER = { width: 1.15, color: 0x4b525e, alpha: 0.92 };

// 索敵とカメラ操作に関する共通値。
export const BASE_VILLAGE_SCOUT_RANGE = 1;
export const DRAG_THRESHOLD_PX = 12;
export const WRAP_RING_TILE_MARGIN = 3;
export const WRAP_DRAG_VIEW_RANGE_MULTIPLIER_X = 1.9;
export const WRAP_DRAG_VIEW_RANGE_MULTIPLIER_Y = 1.15;
export const CENTER_LOCK_ZOOM_PERCENT = 100;
// 時間経過の共通基準（ここを変えると全体速度が変わる）。
export const TURN_SECONDS = 30;
// 自動進行を停止するターン間隔（例: 10Tごとに停止）。
export const AUTO_TURN_PAUSE_EVERY_TURNS = 10;
// 1マス移動の基本は「2ターン / 移動値1」。
export const MOVE_TIME_BASE_TURNS = 2;
export const MOVE_STEP_INTERVAL_MS = Math.max(100, Math.round((TURN_SECONDS / 60) * 1000)); // 60秒/ターン時1000ms、30秒なら500ms

// テスト勢力の上限数。
export const MAX_TEST_PLAYER_COUNT = 8;

// 六角タイル描画の基本寸法。
// width/height を変更した場合、関連する描画・当たり判定へ一括反映される。
export const HEX_TILE_CONFIG = Object.freeze({
  width: 62,
  height: 74,
  rowStep: 56,
  oddRowOffsetX: 31
});

// ゲーム開始時の配置モード定義。
export const GAME_START_PLAYER_PLACEMENT_MODE_ALL_RANDOM = "all_random";
export const GAME_START_PLAYER_PLACEMENT_MODE_PLAYER_RANDOM_ONLY = "player_random_only";
export const GAME_START_PLAYER_PLACEMENT_MODE_PLAYER_CHOOSE = "player_choose";
export const GAME_START_PLAYER_PLACEMENT_MODE_VALUES = new Set([
  GAME_START_PLAYER_PLACEMENT_MODE_ALL_RANDOM,
  GAME_START_PLAYER_PLACEMENT_MODE_PLAYER_RANDOM_ONLY,
  GAME_START_PLAYER_PLACEMENT_MODE_PLAYER_CHOOSE
]);

const TERRAIN_DEFINITION_ROWS = getGameDataRows("地形")
  .filter(row => String(row?.地形 ?? "").trim());

function splitTerrainAliases(value) {
  if (Array.isArray(value)) {
    return value.map(alias => String(alias ?? "").trim()).filter(Boolean);
  }
  return String(value ?? "")
    .split(/[,、|/]/)
    .map(alias => alias.trim())
    .filter(Boolean);
}

// 勢力データの地形名ゆれは地形JSONの「別名」から正規名へ変換する。
export const FACTION_TERRAIN_ALIAS_MAP = Object.freeze(Object.fromEntries(
  TERRAIN_DEFINITION_ROWS.flatMap(row => {
    const terrainName = String(row.地形).trim();
    return [terrainName, ...splitTerrainAliases(row.別名)]
      .map(alias => [alias, terrainName]);
  })
));

// 勢力の優先配置先として使う地形カテゴリ。種類は地形JSONへ追加する。
const FACTION_PLACEMENT_TERRAIN_ROWS = TERRAIN_DEFINITION_ROWS
  .filter(row => String(row?.勢力配置区分 ?? "").trim());
export const BASE_TERRAIN_KEYS = new Set(FACTION_PLACEMENT_TERRAIN_ROWS
  .filter(row => String(row.勢力配置区分).trim() === "基本")
  .map(row => String(row.地形).trim()));
export const SPECIAL_TERRAIN_KEYS = new Set(FACTION_PLACEMENT_TERRAIN_ROWS
  .filter(row => String(row.勢力配置区分).trim() === "特殊")
  .map(row => String(row.地形).trim()));

// ゲーム描画の解像度プリセット。
export const GAME_VIEW_PRESET_CONFIG = Object.freeze({
  performance: Object.freeze({
    label: "軽量重視",
    width: 960,
    height: 480
  }),
  balance: Object.freeze({
    label: "バランス",
    width: 1440,
    height: 720
  }),
  quality: Object.freeze({
    label: "高品質",
    width: 1920,
    height: 960
  })
});
export const DEFAULT_GAME_VIEW_PRESET_KEY = "balance";

// 既存処理との互換用: 既定プリセットを基準解像度として扱う。
const DEFAULT_GAME_VIEW_PRESET = GAME_VIEW_PRESET_CONFIG[DEFAULT_GAME_VIEW_PRESET_KEY];
export const GAME_VIEW_WIDTH = DEFAULT_GAME_VIEW_PRESET.width;
export const GAME_VIEW_HEIGHT = DEFAULT_GAME_VIEW_PRESET.height;

// UI手動スケール設定（見た目調整用）。
// ここを変更すると、ゲーム内UIの相対サイズだけを調整できる。
// root側の自動フィットスケール（画面サイズ追従）とは独立。
export const UI_MANUAL_SCALE_CONFIG = {
  clock: 1.5, // 右下時計UI
  ownFactionPanel: 1.5 // field-overlay-own-faction-panel
};

// マップ上マーカーの位置・サイズ設定。
export const MAP_UNIT_MARKER_CONFIG = {
  offsetX: 0,
  offsetY: 0,
  radius: 11,
  iconSize: 30
};
export const MAP_ENEMY_MARKER_CONFIG = {
  offsetX: 10,
  offsetY: 10,
  radius: 7.5,
  iconSize: 24
};
export const MAP_FACTION_MARKER_CONFIG = {
  offsetX: -13,
  offsetY: 12,
  radius: 7.5
};

// 村/町/都市マーカー設定。
// 画像は透過前提で表示し、必要時のみ背面の丸背景を描く。
export const MAP_SETTLEMENT_MARKER_CONFIG = {
  iconSize: 54,
  drawBackdrop: false,
  backdropOuterRadius: 17.25,
  backdropInnerRadius: 9.3
};

// 領土運用「資源化」タイルのマーカー設定。
export const MAP_RESOURCE_TILE_MARKER_CONFIG = {
  iconSize: 33,
  offsetX: 0,
  offsetY: 10
};

// 統治者マーク（王冠）の設定。
export const MAP_SOVEREIGN_MARKER_CONFIG = {
  offsetX: -12,
  offsetY: -16,
  radius: 12,
  iconSize: 14,
  fallbackFontSizePx: 17
};

// 特殊地形アイコン設定。
export const MAP_SPECIAL_ICON_CONFIG = {
  defaultSize: 53,
  caveSize: 45,
  offsetY: -0,
  fallbackTextFontSizePx: 38,
  fallbackCaveTextFontSizePx: 30
};

// 森タイル上に重ねるアイコン設定。
export const MAP_FOREST_ICON_CONFIG = {
  size: 68,
  offsetY: 0
};

// 滝アイコン設定。
export const MAP_WATERFALL_ICON_CONFIG = {
  size: 33,
  yOffsetWhenTerrainSymbolVisible: -0,
  yOffsetWhenTerrainSymbolHidden: +0,
  fallbackFontSizePx: 17
};

// ヘッダー資源アイコン設定。
// 見た目サイズを大きくしても、レイアウト占有サイズを抑えてヘッダー高さを維持する。
export const HEADER_RESOURCE_ICON_VISUAL_SIZE_PX = 36;
export const HEADER_RESOURCE_ICON_LAYOUT_SIZE_PX = 16;
export const HEADER_RESOURCE_ICON_SCALE = HEADER_RESOURCE_ICON_VISUAL_SIZE_PX / HEADER_RESOURCE_ICON_LAYOUT_SIZE_PX;

// ヘッダー資材アイコン設定（食料とは別に手動調整可能）。
export const HEADER_MATERIAL_ICON_VISUAL_SIZE_PX = 39;
export const HEADER_MATERIAL_ICON_LAYOUT_SIZE_PX = 17;
export const HEADER_MATERIAL_ICON_SCALE = HEADER_MATERIAL_ICON_VISUAL_SIZE_PX / HEADER_MATERIAL_ICON_LAYOUT_SIZE_PX;

// ヘッダー食料/資材チップのサイズ係数（文字・余白比率）。
export const HEADER_FOOD_CHIP_SCALE = 1.72;
export const HEADER_MATERIAL_CHIP_SCALE = 1.72;

// フィールド上の丸アイコンボタン設定。
export const OVERLAY_ICON_BUTTON_SIZE_PX = 65;
export const OVERLAY_ICON_BUTTON_ICON_INSET_PX = 8;
export const OVERLAY_ICON_BUTTON_EMOJI_SIZE_PX = 30;
export const OVERLAY_ICON_BUTTON_PLUS_BADGE_SIZE_PX = 18;
