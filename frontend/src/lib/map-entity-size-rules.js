import { HEX_TILE_CONFIG } from "./phaser-map-panel-config.js";

// マップ上オブジェクトの基本表示ルール。
// 1. 大きさは固定画面pxではなくタイル寸法を基準にする。
// 2. カメラの拡大縮小を打ち消す逆ズーム補正は行わない。
// 3. マップ上には基本的にアイコンだけを置き、名前・人数・説明などの文字は常設しない。
// 4. 名称や詳細は、対象タイル/アイコンを選択した後の詳細UIで表示する。
export const MAP_ENTITY_SIZE_RULES = Object.freeze({
  base: Object.freeze({
    // 拠点も1タイル内に収まるアイコンとして扱う。
    diameterTiles: 0.92,
    iconTiles: 0.62
  }),
  unit: Object.freeze({
    // 1ユニットは1タイル内をほぼいっぱいに使う。
    // 選択状態でも大きさは変えず、枠線だけで区別する。
    diameterTiles: 1.0,
    glyphFontTiles: 0.36
  })
});

export function mapTileReferencePx() {
  return Math.max(1, Number(HEX_TILE_CONFIG?.width) || 40);
}

export function tileRelativePx(tileRatio) {
  return mapTileReferencePx() * Math.max(0, Number(tileRatio) || 0);
}

// 旧コード互換用。マップ上オブジェクトは画面固定サイズにしないため常に1を返す。
// 新規コードでは使用せず、通常のワールド座標オブジェクトとして描画すること。
export function readableEntityScale() {
  return 1;
}
