import { HEX_TILE_CONFIG } from "./phaser-map-panel-config.js";

// マップ上オブジェクトの基本表示ルール。
// 1. 大きさは固定画面pxではなくタイル寸法を基準にする。
// 2. カメラの拡大縮小を打ち消す逆ズーム補正は行わない。
// 3. マップ上には基本的にアイコンだけを置き、名前・人数・説明などの文字は常設しない。
// 4. 名称や詳細は、対象タイル/アイコンを選択した後の詳細UIで表示する。
export const MAP_ENTITY_SIZE_RULES = Object.freeze({
  construction: Object.freeze({
    // 建築・居住化の残りターン文字。タイル幅の30%（初期12%の2.5倍）。
    turnFontTiles: 0.30,
    // 太い縁取りで文字が潰れないようにする。単位はワールドpx。
    turnStrokePx: 1,
    // 施設画像や領土線との重なりを避ける文字背景と余白。
    turnBackground: "#071014",
    turnPaddingPx: 2,
    // 工事中の画像は半透明。ターン表示はマス中央よりタイル幅の12%上。
    previewAlpha: 0.5,
    turnOffsetUpTiles: 0.12,
    // 文字テクスチャを高解像度で作り、拡大時のぼやけを抑える。
    textResolution: 2
  }),
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
  }),
  nest: Object.freeze({
    // ユニットの下に重なっても外周から巣を判別できる大きさにする。
    diameterTiles: 1.22,
    iconTiles: 1.12,
    glyphFontTiles: 0.34,
    // 所属個体が1体だけの巣は、通常巣より控えめに表示する。
    singleMemberScale: 0.8
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
