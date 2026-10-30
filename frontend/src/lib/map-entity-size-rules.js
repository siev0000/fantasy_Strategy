import { HEX_TILE_CONFIG } from "./phaser-map-panel-config.js";

// マップ上オブジェクトの基本表示ルール。
// 1. 大きさは固定画面pxではなくタイル寸法を基準にする。
// 2. カメラの拡大縮小を打ち消す逆ズーム補正は行わない。
// 3. マップ上には基本的にアイコンだけを置き、名前・人数・説明などの文字は常設しない。
// 4. 名称や詳細は、対象タイル/アイコンを選択した後の詳細UIで表示する。
export const MAP_ENTITY_SIZE_RULES = Object.freeze({
  wall: Object.freeze({
    lineWidthPx:5,
    pillarRadiusPx:5,
    pillarOutlinePx:1,
    color:0xd8d5ba,
    pillarOutlineColor:0x6a695b
  }),
  defenseField: Object.freeze({
    // シールド画像の縦20コマから、展開済みの10枚目（0始まり9）を常設表示する。
    sheetRows:20,
    stillFrame:9,
    coverageScale:1.25, // 範囲再生・常設結界共通の外接円倍率。画像余白を補い、マスの端まで覆う。
    alpha:0.24 // 範囲内の地形とユニットを見分けられる透明度。
  }),
  construction: Object.freeze({
    // 工期バッジは建物を覆わないようタイル幅の18%に抑える。
    turnFontTiles: 0.18,
    // 太い縁取りで文字が潰れないようにする。単位はワールドpx。
    turnStrokePx: 1,
    // 施設画像や領土線との重なりを避ける文字背景と余白。
    turnBackground: "#071014",
    turnPaddingPx: 2,
    // 工事中の画像は半透明。工期バッジは左上へ寄せて中央を空ける。
    previewAlpha: 0.5,
    turnOffsetLeftTiles: 0.22,
    turnOffsetUpTiles: 0.32,
    // 文字テクスチャを高解像度で作り、拡大時のぼやけを抑える。
    textResolution: 2
  }),
  base: Object.freeze({
    castleImageScale:0.85,
    castleMinFootprint:3,
    // 拠点も1タイル内に収まるアイコンとして扱う。
    diameterTiles: 0.92,
    iconTiles: 0.62
  }),
  unit: Object.freeze({
    // 1ユニットは1タイル内をほぼいっぱいに使う。
    // 選択状態でも大きさは変えず、枠線だけで区別する。
    diameterTiles: 1.0,
    imageFill: 0.95, // フィールドとエフェクト設定で共通の画像占有率。
    sizScalePoints:Object.freeze([
      Object.freeze({siz:0,scale:0}),Object.freeze({siz:85,scale:0.5}),
      Object.freeze({siz:170,scale:0.75}),Object.freeze({siz:500,scale:1})
    ]),
    minimumImageScale:0.1,
    previewSiz:170,
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

export function resolveV39SettlementImageScale(definition) {
  return Number(definition?.footprintTiles)>=MAP_ENTITY_SIZE_RULES.base.castleMinFootprint
    ? MAP_ENTITY_SIZE_RULES.base.castleImageScale : 1;
}

export function resolveV39UnitImageScale(unit) {
  const raw=unit?.status?.SIZ??unit?.SIZ;
  if(raw==null||raw===''||!Number.isFinite(Number(raw)))return 1;
  const points=MAP_ENTITY_SIZE_RULES.unit.sizScalePoints,siz=Math.max(0,Number(raw));
  for(let i=1;i<points.length;i++){
    if(siz>points[i].siz)continue;
    const low=points[i-1],high=points[i];
    return Math.max(MAP_ENTITY_SIZE_RULES.unit.minimumImageScale,
      low.scale+(high.scale-low.scale)*(siz-low.siz)/(high.siz-low.siz));
  }
  return points.at(-1).scale;
}

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
