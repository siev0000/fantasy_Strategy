// 村中心から領土として扱う半径。
export const PLAYER_TERRITORY_RANGE = 1;

// 領土タイル運用設定（資源化/居住化）。
export const TERRITORY_TILE_MODE_RESOURCE = "resource";
export const TERRITORY_TILE_MODE_SETTLEMENT = "settlement";
export const TERRITORY_TILE_MODE_CONFIG = {
  [TERRITORY_TILE_MODE_RESOURCE]: {
    label: "資源化",
    populationCapacityBonus: 5,
    incomeMultiplier: 2.0 // 資源+100%
  },
  [TERRITORY_TILE_MODE_SETTLEMENT]: {
    label: "居住化",
    populationCapacityBonus: 15,
    incomeMultiplier: 1.0
  }
};
export const TERRITORY_TILE_MODE_CONVERSION_TURNS = 2;

// 領土タイルの住居区分（保有可能人数計算）。
// 総収容人数 = 1マスあたり収容人数 × 使用マス数
export const TERRITORY_RESIDENTIAL_LEVEL_LAND = "land";
export const TERRITORY_RESIDENTIAL_LEVEL_ATTACHED = "attached";
export const TERRITORY_RESIDENTIAL_LEVEL_VILLAGE = "village";
export const TERRITORY_RESIDENTIAL_LEVEL_TOWN = "town";
export const TERRITORY_RESIDENTIAL_LEVEL_CITY = "city";
export const TERRITORY_RESIDENTIAL_LEVEL_METROPOLIS = "metropolis";
export const TERRITORY_RESIDENTIAL_LEVEL_ORDER = [
  TERRITORY_RESIDENTIAL_LEVEL_VILLAGE,
  TERRITORY_RESIDENTIAL_LEVEL_TOWN,
  TERRITORY_RESIDENTIAL_LEVEL_CITY,
  TERRITORY_RESIDENTIAL_LEVEL_METROPOLIS
];
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
  [TERRITORY_RESIDENTIAL_LEVEL_VILLAGE]: {
    label: "村",
    capacityPerTile: 20,
    footprintTiles: 1,
    iconName: "村",
    markerIconSize: 32
  },
  [TERRITORY_RESIDENTIAL_LEVEL_TOWN]: {
    label: "町",
    capacityPerTile: 50,
    footprintTiles: 2,
    iconName: "町",
    markerIconSize: 38
  },
  [TERRITORY_RESIDENTIAL_LEVEL_CITY]: {
    label: "都市",
    capacityPerTile: 100,
    footprintTiles: 3,
    iconName: "都市",
    markerIconSize: 44
  },
  [TERRITORY_RESIDENTIAL_LEVEL_METROPOLIS]: {
    label: "大都市",
    capacityPerTile: 150,
    footprintTiles: 7,
    iconName: "大都市",
    markerIconSize: 52
  }
};

// 六角タイル枠線の見た目設定。
export const TILE_BORDER_DEFAULT = { width: 1.0, color: 0x2f3848, alpha: 0.5 };
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
export const MOVE_STEP_INTERVAL_MS = 1000; // 移動時の1マスごとの待機時間(ms)

// テスト勢力の上限数。
export const MAX_TEST_PLAYER_COUNT = 8;

// ゲーム開始時の配置モード定義。
export const GAME_START_PLAYER_PLACEMENT_MODE_ALL_RANDOM = "all_random";
export const GAME_START_PLAYER_PLACEMENT_MODE_PLAYER_RANDOM_ONLY = "player_random_only";
export const GAME_START_PLAYER_PLACEMENT_MODE_PLAYER_CHOOSE = "player_choose";
export const GAME_START_PLAYER_PLACEMENT_MODE_VALUES = new Set([
  GAME_START_PLAYER_PLACEMENT_MODE_ALL_RANDOM,
  GAME_START_PLAYER_PLACEMENT_MODE_PLAYER_RANDOM_ONLY,
  GAME_START_PLAYER_PLACEMENT_MODE_PLAYER_CHOOSE
]);

// 勢力データの地形名ゆれを正規化するマップ。
export const FACTION_TERRAIN_ALIAS_MAP = {
  平地: "平地",
  森: "森",
  丘: "丘陵",
  丘陵: "丘陵",
  山: "山岳",
  山岳: "山岳",
  雪: "雪原",
  雪原: "雪原",
  火山: "火山",
  湖: "湖",
  砂漠: "砂漠",
  河: "河川",
  河川: "河川",
  沼: "沼地",
  沼地: "沼地",
  洞: "洞窟",
  洞窟: "洞窟",
  渓谷: "峡谷",
  峡谷: "峡谷"
};

// 生成・描画で使う地形カテゴリ。
export const BASE_TERRAIN_KEYS = new Set(["平地", "森", "丘陵", "山岳", "雪原", "火山", "湖", "砂漠", "河川"]);
export const SPECIAL_TERRAIN_KEYS = new Set(["沼地", "洞窟", "峡谷"]);

// ゲーム描画の基準解像度。
export const GAME_VIEW_WIDTH = 1280;
export const GAME_VIEW_HEIGHT = 720;

// UI手動スケール設定（見た目調整用）。
// ここを変更すると、ゲーム内UIの相対サイズだけを調整できる。
// root側の自動フィットスケール（画面サイズ追従）とは独立。
export const UI_MANUAL_SCALE_CONFIG = {
  clock: 1.5, // 右下時計UI
  ownFactionPanel: 1.5 // field-overlay-own-faction-panel
};

// マップ上マーカーの位置・サイズ設定。
export const MAP_UNIT_MARKER_CONFIG = {
  offsetX: -10,
  offsetY: 10,
  radius: 7.3,
  iconSize: 20
};
export const MAP_ENEMY_MARKER_CONFIG = {
  offsetX: 10,
  offsetY: 10,
  radius: 5,
  iconSize: 16
};
export const MAP_FACTION_MARKER_CONFIG = {
  offsetX: -13,
  offsetY: 12,
  radius: 5
};

// 村/町/都市マーカー設定。
// 画像は透過前提で表示し、必要時のみ背面の丸背景を描く。
export const MAP_SETTLEMENT_MARKER_CONFIG = {
  iconSize: 36,
  drawBackdrop: false,
  backdropOuterRadius: 11.5,
  backdropInnerRadius: 6.2
};

// 領土運用「資源化」タイルのマーカー設定。
export const MAP_RESOURCE_TILE_MARKER_CONFIG = {
  iconSize: 22
};

// 統治者マーク（王冠）の設定。
export const MAP_SOVEREIGN_MARKER_CONFIG = {
  offsetX: -12,
  offsetY: -16,
  radius: 8,
  iconSize: 9,
  fallbackFontSizePx: 11
};

// 特殊地形アイコン設定。
export const MAP_SPECIAL_ICON_CONFIG = {
  defaultSize: 35,
  caveSize: 30,
  offsetY: -0,
  fallbackTextFontSizePx: 25,
  fallbackCaveTextFontSizePx: 20
};

// 滝アイコン設定。
export const MAP_WATERFALL_ICON_CONFIG = {
  size: 30,
  yOffsetWhenTerrainSymbolVisible: -0,
  yOffsetWhenTerrainSymbolHidden: +0,
  fallbackFontSizePx: 11
};

// ヘッダー資源アイコン設定。
// 見た目サイズを大きくしても、レイアウト占有サイズを抑えてヘッダー高さを維持する。
export const HEADER_RESOURCE_ICON_VISUAL_SIZE_PX = 24;
export const HEADER_RESOURCE_ICON_LAYOUT_SIZE_PX = 16;
export const HEADER_RESOURCE_ICON_SCALE = HEADER_RESOURCE_ICON_VISUAL_SIZE_PX / HEADER_RESOURCE_ICON_LAYOUT_SIZE_PX;

// ヘッダー資材アイコン設定（食料とは別に手動調整可能）。
export const HEADER_MATERIAL_ICON_VISUAL_SIZE_PX = 26;
export const HEADER_MATERIAL_ICON_LAYOUT_SIZE_PX = 17;
export const HEADER_MATERIAL_ICON_SCALE = HEADER_MATERIAL_ICON_VISUAL_SIZE_PX / HEADER_MATERIAL_ICON_LAYOUT_SIZE_PX;

// ヘッダー食料/資材チップのサイズ係数（文字・余白比率）。
export const HEADER_FOOD_CHIP_SCALE = 1.15;
export const HEADER_MATERIAL_CHIP_SCALE = 1.15;

// フィールド上の丸アイコンボタン設定。
export const OVERLAY_ICON_BUTTON_SIZE_PX = 65;
export const OVERLAY_ICON_BUTTON_ICON_INSET_PX = 8;
export const OVERLAY_ICON_BUTTON_EMOJI_SIZE_PX = 30;
export const OVERLAY_ICON_BUTTON_PLUS_BADGE_SIZE_PX = 18;
