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

固定footer / 管理メニュー / 研究UIは `docs/v39_ui_interaction_map.md` を参照する。

---

## 2. 現在のフィールド初期化

現在の `v39-field-runtime.js` は起動時に60×60 / realistic / randomで自動生成する。

これは暫定状態であり、最終的には `管理 → フィールド設定 → 生成` から `createTerrainMapData(settings)` を呼ぶ。

マップ再生成で固定HTML UIを作り直さない。

---

## 3. カメラ初期fit

`fitCamera(scene)` でマップ全体がviewportへ収まる倍率を算出し、余白係数 `0.97` を適用する。

保存値:

```text
scene.v39FitZoom
scene.v39RequestedZoom
```

`scene.v39FitZoom` を最小倍率とする。

---

## 4. 最大拡大率

### 正本仕様

最大ズームは固定6倍ではなく、**表示設定から変更可能**にする。

```text
初期値: 10倍
最小設定値: 6倍
最大設定値: 16倍
step: 1倍
```

意味:

```text
maxZoom = scene.v39FitZoom * maxZoomFactor
```

設定名:

`最大拡大率`

予定DOM:

```text
#v39-max-zoom-factor
#v39-max-zoom-factor-value
```

保存先:

```text
localStorage: v39-display-settings-v1
maxZoomFactor
```

スマホ / PCで同じ値を使用する。

### 変更時

`v39:display-settings-changed` を受けて、

1. 最大ズーム値を更新する。
2. 現在ズームが新上限を超えていれば新上限へClampする。
3. マップデータは再生成しない。
4. 現在カメラ中心を可能な限り維持する。

小さいスマホでは初期fit倍率自体が小さくなるため、10倍程度まで許可して1マスを十分大きく表示できるようにする。

---

## 5. ズーム入力

### PCホイール

- `wheel`
- 上: `×1.16`
- 下: `÷1.16`
- pointer位置を基準にズームする。

### ダブルクリック

- `dblclick`
- `×1.5`
- クリック位置を基準にする。

### スマホピンチ

2本pointer間距離の比率をそのままズーム倍率へ使用する。

### スマホダブルタップ

- 320ms未満
- 28px未満
- `×1.5`

### ＋ / −ボタン

コンテナ:

`#v39-map-camera-controls`

- ＋: `×1.3`
- −: `÷1.3`

表示設定「地図の拡大縮小ボタン」がOFFなら非表示。

すべての入力は `fitZoom ～ fitZoom×maxZoomFactor` にClampする。

---

## 6. ドラッグ / パン

Pointer Events:

- pointerdown
- pointermove
- pointerup
- pointercancel

単一pointerではcamera scrollを移動し、`clampCamera()` でマップ外へ行き過ぎないよう補正する。

ドラッグ後のpointerupはタイル選択にしない。

---

## 7. リサイズ

`resizeCameraPreservingView(scene)` を使用する。

- viewport変更後のfit倍率を再計算
- 現在ズームを可能な限り維持
- 新しい最小 / 最大ズームへClamp
- 強制的にマップ中央へ戻さない
- `clampCamera()` を実行

画面回転やfooterサイズ変更で初期ズームへ戻さない。

---

## 8. タイル選択

pointerup時にドラッグ扱いでなければ、pointer座標からワールド座標へ変換し六角形内判定を行う。

選択状態:

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

土地タブはこのイベントを入口として詳細を更新する。

---

## 9. 標高 / 深度色

### 陸地

`heightLevelMap[y][x]` と `shadeColorByHeight()` を使用する。

```text
minLevel = -2
maxLevel = 8
brightness = 1.18 → 0.74
```

低地ほど明るく、高地ほど暗くする。

### 海

`shadeSeaColorByDepth()` を使用する。

深い海ほど暗くする。

陸地と海で同じ補正式を使用しない。

---

## 10. ヘックス境界

表示設定:

`高低差がある境界だけ表示`

保存値:

`heightOutlineOnly`

ON:

- 同高度Lv同士の通常黒枠を省略。
- 高低差境界を強調。

OFF:

- 全ヘックスの通常輪郭線を表示。

---

## 11. 表示設定との連携

保存先:

```text
localStorage: v39-display-settings-v1
```

マップ関連値:

```js
heightOutlineOnly
heightShading
showZoomControls
maxZoomFactor
```

通知:

```text
v39:display-settings-changed
```

表示変更では `createTerrainMapData()` を呼び直さない。

- 高度色変更 → terrain Graphics再描画
- 境界変更 → terrain Graphics再描画
- ズームボタン表示 → DOM表示切替
- 最大拡大率変更 → camera上限更新

---

## 12. 地形 / 河川 / 特殊地形

生成データは `createTerrainMapData()` の既存結果を使用する。

描画:

- 地形: `drawTerrain()`
- 河川 / 水路: `drawRivers()`
- 滝: `cornerWaterfallEdgeSet`
- 特殊地形: `drawSpecialTerrain()`

地形生成規則そのものをv39独自仕様へ変更しない。

---

## 13. マップと固定UIの境界

マップ側が変更してよいもの:

- `#v39-phaser-field`
- Phaser canvas
- Phaser Graphics / Text
- `#v39-map-camera-controls`

変更してはいけないもの:

- `.topbar`
- `.footer`
- footerタブ
- `#footManage`
- `#researchRail`
- 固定管理ボタン

---

## 14. 現在の状態

| 機能 | 状態 |
|---|---|
| 初期60×60生成 | 実装済み / 暫定 |
| 高度による陸地陰影 | 実装済み |
| 海深度色 | 実装済み |
| 高低差境界切替 | 実装済み |
| PCホイールズーム | 実装済み |
| ＋ / −ズーム | 実装済み |
| ダブルクリック拡大 | 実装済み |
| スマホピンチ | 実装済み |
| スマホダブルタップ | 実装済み |
| ドラッグ / パン | 実装済み |
| リサイズ時カメラ維持 | 実装済み |
| タイル選択 | 実装済み |
| 最大拡大率10倍 | **設計確定 / 未実装** |
| 最大拡大率表示設定6〜16倍 | **設計確定 / 未実装** |
| フィールド設定値から生成 | 未接続 |
| 旧Vueゲーム機能全移植 | 進行中 |
