// 村中心から領土として扱う半径。
export const PLAYER_TERRITORY_RANGE = 1;

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
export const FOG_HIDDEN_ALPHA = 0.94;
export const FOG_HIDDEN_ALPHA_TEST = 0.56;
export const FOG_HIDDEN_BORDER = { width: 1.15, color: 0x4b525e, alpha: 0.92 };

// 索敵とカメラ操作に関する共通値。
export const BASE_VILLAGE_SCOUT_RANGE = 1;
export const DRAG_THRESHOLD_PX = 12;
export const WRAP_RING_TILE_MARGIN = 3;
export const WRAP_DRAG_VIEW_RANGE_MULTIPLIER_X = 1.9;
export const WRAP_DRAG_VIEW_RANGE_MULTIPLIER_Y = 1.15;
export const CENTER_LOCK_ZOOM_PERCENT = 100;

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

// マップ上マーカーの位置・サイズ設定。
export const MAP_UNIT_MARKER_CONFIG = {
  offsetX: -10,
  offsetY: -10,
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
export const HEADER_RESOURCE_ICON_VISUAL_SIZE_PX = 20;
export const HEADER_RESOURCE_ICON_LAYOUT_SIZE_PX = 14;
export const HEADER_RESOURCE_ICON_SCALE = HEADER_RESOURCE_ICON_VISUAL_SIZE_PX / HEADER_RESOURCE_ICON_LAYOUT_SIZE_PX;
