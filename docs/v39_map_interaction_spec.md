# v39 マップ操作・描画仕様

> v39上側フィールドの **カメラ操作 / タイル選択 / 標高描画 / 表示設定連携** の正本。
>
> 実装を変更した場合は、`frontend/src/v39-field-runtime.js` と同じ変更単位でこの設計書も更新する。

## 1. 対象

- `.playfield`
- `#v39-phaser-field`
- Phaser canvas
- 地形 / 河川 / 滝 / 特殊地形描画
- マップカメラ
- タイル選択
- `#v39-map-camera-controls`
- 管理 → 表示設定との連携

固定footer / 管理メニュー / 研究UIはこの設計書の対象外。`docs/v39_ui_interaction_map.md` を参照する。

---

## 2. 現在のフィールド初期化

現在の `v39-field-runtime.js` は起動時に以下を実行する。

```text
.playfield / #map を待機
  ↓
#v39-phaser-field を生成
  ↓
参照SVG #map を非表示
  ↓
createTerrainMapData({
  w: 60,
  h: 60,
  patternId: "realistic",
  mountainMode: "random"
})
  ↓
Phaserフィールド生成
  ↓
地形 / 河川 / 特殊地形描画
  ↓
初期カメラfit
  ↓
入力イベント接続
```

現在値:

| 項目 | 値 |
|---|---|
| 幅 | 60 |
| 高さ | 60 |
| patternId | `realistic` |
| mountainMode | `random` |
| 最大ズーム | 初期fit倍率の6倍 |

### 既知の残課題

本来のフィールド設定仕様は「設定 → 生成」だが、現在のruntimeはまだページ起動時に60×60を自動生成する。

また `installCustomFieldSettingsPlaceholder()` による旧 `mobileFabPanel` 入口もruntime内に残っている。固定管理ボタン `#v39-manage-field-settings` へ一本化する際に削除対象。

---

## 3. カメラ初期fit

`fitCamera(scene)` を使用する。

処理:

1. マップ全体サイズを算出。
2. viewportへ収まる倍率を算出。
3. 余白係数 `0.97` を適用。
4. マップ中央へ移動。
5. `scene.v39FitZoom` に最小ズームを保存。
6. `scene.v39RequestedZoom` に現在要求ズームを保存。

現在はPhaserのcamera boundsを固定せず、独自 `clampCamera()` で表示範囲を制限する。

---

## 4. ズーム

### 4.1 ズーム範囲

```text
minZoom = scene.v39FitZoom
maxZoom = scene.v39FitZoom * 6
```

すべての入力はこの範囲へClampする。

### 4.2 PCホイール

対象:

`#v39-phaser-field`

イベント:

`wheel`

倍率:

- 上方向: `× 1.16`
- 下方向: `÷ 1.16`

マウス位置を基準点として、そのワールド座標がズーム前後でずれないようcamera scrollを補正する。

### 4.3 ダブルクリック

イベント:

`dblclick`

倍率:

`× 1.5`

クリック位置を中心に拡大する。

### 4.4 スマホピンチ

Pointer Eventsを使用する。

2本のpointer間距離について、

```text
nextDistance / oldDistance
```

を倍率として `zoomAt()` へ渡す。

ピンチ中央点をズーム基準とする。

### 4.5 スマホダブルタップ

条件:

- 前回tapから320ms未満
- 距離28px未満

倍率:

`× 1.5`

### 4.6 画面上の＋ / −

コンテナ:

`#v39-map-camera-controls`

ボタン:

```html
[data-map-zoom="in"]
[data-map-zoom="out"]
```

倍率:

- ＋: `× 1.3`
- −: `÷ 1.3`

表示中マップ領域の中心を基準にズームする。

管理 → 表示設定の「地図の拡大縮小ボタン」をOFFにすると、このコントロールを非表示にする。

### 4.7 旧 `mapZoomController.js` との関係

以前のVue実装には `zoomIn / zoomOut / zoomReset / setZoomPercent()` が存在する。

現行v39 runtimeはそれを直接呼ばず、`zoomAt()` / `zoomCenter()` をruntime内で実装している。

ゲームロジックを本格移植する段階では、選択タイル / 自拠点フォーカス規則など旧仕様との整合を確認する。UI都合で別ルールを新設しない。

---

## 5. ドラッグ / パン

対象:

`#v39-phaser-field`

Pointer Events:

- `pointerdown`
- `pointermove`
- `pointerup`
- `pointercancel`

単一pointer移動時:

```text
camera.scrollX -= dx / camera.zoom
camera.scrollY -= dy / camera.zoom
```

移動後に `clampCamera()` を実行する。

ドラッグしたpointerupはタイル選択として扱わない。

現在は初期fit倍率でもpointerドラッグ処理自体は存在する。旧 `mapZoomController.js` の「最小ズーム時ドラッグ不可」とは差があるため、旧ルールを最終採用する場合は実装と同時に本設計書を更新する。

---

## 6. リサイズ

Phaser Scaleの `resize` を監視する。

`resizeCameraPreservingView(scene)` の役割:

1. 新viewportに対するfit倍率を再計算。
2. 現在要求ズームを可能な限り維持。
3. `fit ～ fit×6` にClamp。
4. カメラを強制的にマップ中央へ戻さない。
5. `clampCamera()` で表示可能範囲を補正。

画面回転やfooterサイズ変化で、毎回初期ズームへ戻さない。

---

## 7. タイル選択

### 7.1 選択条件

pointerup時にドラッグ扱いでなければ、pointer座標からワールド座標へ変換し、六角形内判定を行う。

使用処理:

- `clientToCameraPoint()`
- `cameraPointToWorld()`
- `resolveTileAtWorldPoint()`
- `containsWorldPoint()`

### 7.2 選択表示

選択タイルは黄色系の太線でPhaser上に描画する。

選択情報:

```js
{
  x,
  y,
  terrain,
  height,
  special
}
```

保存先:

`scene.v39SelectedTile`

通知:

```js
window.dispatchEvent(new CustomEvent("v39:tile-selected", {
  detail: selected
}));
```

現行では `#landTerrain` に `special || terrain` も反映する。

土地タブの詳細情報は、このイベントを入口として段階的に接続する。

---

## 8. 標高 / 深度による色補正

データ:

`heightLevelMap[y][x]`

### 8.1 陸地

`shadeColorByHeight(hex, level)` を使用する。

基準:

```text
minLevel = -2
maxLevel = 8
brightness = 1.18 → 0.74
```

低地ほど明るく、高地ほど暗くする。

地形色そのものは `terrainDefinitions` を基準とする。

### 8.2 海

`shadeSeaColorByDepth(hex, level)` を使用する。

現在のruntimeでは、負の高度Lvが深くなるほど暗くする。

```text
brightness = 1 - min(0.62, depth * 0.09)
```

陸地と海で同じ補正式を使用しない。

---

## 9. ヘックス境界

管理 → 表示設定:

`高低差がある境界だけ表示`

保存値:

`heightOutlineOnly`

### ON（初期値）

- 同じ高度Lv同士の通常黒枠を省略する。
- 高低差がある境界を視認できる表示にする。

### OFF

- 全ヘックスの通常輪郭線を表示する。

境界判定に `heightLevelMap` を使用する。

標高データ自体をUI表示都合で削除しない。

---

## 10. 表示設定との連携

保存先:

```text
localStorage: v39-display-settings-v1
```

マップが参照する主な値:

```js
heightOutlineOnly
heightShading
```

変更イベント:

```text
v39:display-settings-changed
```

Phaser sceneはこのイベントを監視し、**地形Graphicsのみ再描画**する。

`createTerrainMapData()` は呼び直さない。

つまり、

- 高度色ON/OFF
- 境界表示切替

はマップ再生成ではなく表示変更として扱う。

---

## 11. 地形 / 河川 / 特殊地形

生成データは `createTerrainMapData()` の既存結果を使用する。

描画:

- 地形: `drawTerrain()`
- 河川 / 水路: `drawRivers()`
- 滝: `cornerWaterfallEdgeSet`
- 特殊地形: `drawSpecialTerrain()`

特殊地形の現行簡易ラベル:

- 沼地 → `沼`
- 峡谷 → `峡`
- 洞窟 → `洞`

地形生成規則そのものをv39 runtime独自仕様へ変更しない。

---

## 12. マップと固定UIの境界

マップ生成 / 再描画で変更してよいもの:

- `#v39-phaser-field`
- Phaser canvas
- Phaser Graphics / Text
- `#v39-map-camera-controls`（マップ専用動的コントロール）

変更してはいけないもの:

- `.topbar`
- `.footer`
- footerタブ
- `#footManage`
- `#researchRail`
- 固定管理ボタン

マップ再生成を理由に固定UIを再生成しない。

---

## 13. デバッグ / 自動確認用公開情報

現在のruntime:

```js
window.__v39FieldRuntime
```

内容:

- `game`
- `mapData`
- `mapWidth`
- `mapHeight`
- `patternId`
- `mountainMode`

テキスト状態:

```js
window.render_game_to_text()
```

返却内容には以下を含む。

- map size / pattern
- playfield / footer寸法比
- active footer tab
- display settings
- selected tile
- camera zoom / min / max / scroll

`window.advanceTime()` は現在 `render_game_to_text()` を返す確認用hook。

---

## 14. 現在の実装状態

| 機能 | 状態 |
|---|---|
| 初期60×60生成 | 実装済み（将来カスタム生成へ変更） |
| terrainDefinitionsによる地形色 | 実装済み |
| 高度による陸地陰影 | 実装済み |
| 海深度による色補正 | 実装済み |
| 高低差境界表示切替 | 実装済み |
| PCホイールズーム | 実装済み |
| ＋ / −ズーム | 実装済み |
| ダブルクリック拡大 | 実装済み |
| スマホピンチ | 実装済み |
| スマホダブルタップ拡大 | 実装済み |
| ドラッグ / パン | 実装済み |
| リサイズ時のカメラ維持 | 実装済み |
| タイル選択 | 実装済み |
| `v39:tile-selected` 通知 | 実装済み |
| 土地詳細フル接続 | 進行中 |
| フィールド設定値からの生成 | 未接続 |
| 旧Vueマップ全ゲーム機能移植 | 進行中 |
