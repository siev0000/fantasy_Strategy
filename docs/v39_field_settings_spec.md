# v39 フィールド設定仕様

> v39のフィールド生成設定と生成フローの正本。
>
> 既存の `PhaserMapGeneratorPanel.vue` / `map-generator.js` の生成ルールを引き継ぎ、UI都合で新しい生成ルールを作らない。

## 1. 入口

`管理 → フィールド設定`

固定ボタン:

`#v39-manage-field-settings`

公開API:

```js
window.openFieldSettingsModal()
window.closeFieldSettingsModal()
window.getV39FieldSettings()
window.generateFieldFromSettings(settings)
```

設定保存先:

```text
localStorage: v39-field-settings-v1
```

## 2. 起動フロー

起動直後は固定の60×60マップを自動生成しない。

```text
v39固定HTML表示
  ↓
フィールドruntime初期化
  ↓
フィールド未生成状態
  ↓
フィールド設定を開く
  ↓
ユーザーが設定
  ↓
生成
  ↓
createTerrainMapData(settings)
  ↓
Phaserフィールド生成
```

マップ再生成時にfooter / 管理 / 研究レールなどの固定HTMLは作り直さない。

## 3. マップサイズ

旧実装と同じ選択肢を使用する。

| 表示 | 値 |
|---|---|
| 下限 | 30×40 |
| 標準 / 推奨 | 36×36 |
| 大 | 48×48 |
| 特大 | 60×60 |
| 超特大 | 72×72 |
| 最大 | 83×83 |

初期値は `60x60`。

## 4. 島形状パターン

`map-generator.js` の既存パターンを使用する。

- `realistic` リアル島
- `balanced` 標準諸島
- `continent` 大陸型
- `archipelago` 多島海
- `twins` 双子島
- `chain` 列島型

初期値は `realistic`。

## 5. 山岳モード

既存山岳モードを使用する。

- `random` ランダム（単峰 / 群峰 / 混合）
- `single` 単峰固定
- `multi` 群峰固定
- `mixed` 混合固定

初期値は `random`。

## 6. 島カスタム設定

初期状態はOFF。

カスタムON時は島形状パターンを土台に、以下を上書きする。

| 設定 | 初期値 | 範囲 |
|---|---:|---:|
| 大島の数 | 2 | 1〜8 |
| 孤島数 最小 | 1 | 0〜12 |
| 孤島数 最大 | 4 | 0〜12 |
| 目標陸地率 | 50% | 25〜60% |
| 大島間の最小距離 | 6 | 2〜12 |
| 大陸あたり川本数 最小 | 3 | 1〜12 |
| 大陸あたり川本数 最大 | 4 | 1〜12 |
| ワールド端接続 | ON | ON/OFF |

`createTerrainMapData()` へ渡す形式:

```js
{
  w,
  h,
  patternId,
  mountainMode,
  islandCustomSettings: {
    enabled,
    largeIslandCount,
    isletCountMin,
    isletCountMax,
    riverPerContinentMin,
    riverPerContinentMax,
    targetLandRatio,
    largeIslandMinGap,
    worldWrapEnabled
  }
}
```

## 7. 正規化

生成前に以下を行う。

- 数値を既存範囲へClampする。
- 孤島数は `min <= max` へ並べ替える。
- 川本数も `min <= max` へ並べ替える。
- 目標陸地率はUI上の%を `0.25〜0.60` の比率へ変換する。
- 未知の島パターン / 山岳モードは既定値へ戻す。

## 8. 再生成

生成ボタンを押した場合:

1. UI値を取得。
2. `v39-field-settings-v1` へ保存。
3. 現在のPhaser Gameがあれば破棄。
4. `createTerrainMapData(settings)` を実行。
5. 新しいPhaserフィールドを生成。
6. カメラを新しいマップ全体へfit。
7. `v39:field-generated` を通知。
8. 設定画面を閉じる。

固定HTML UIは破棄しない。

## 9. 関連ファイル

- `frontend/src/v39-field-runtime-final.js`
- `frontend/src/v39-field-settings-final.js`
- `frontend/src/v39-field-settings-stabilizer.js`
- `frontend/src/v39-bootstrap.js`
- `frontend/src/lib/map-generator.js`
- `frontend/src/components/PhaserMapGeneratorPanel.vue`（旧仕様参照元）

## 10. 実装状態

| 項目 | 状態 |
|---|---|
| 設定画面 | 実装済み |
| マップサイズ | 実装済み |
| 島形状 | 実装済み |
| 山岳モード | 実装済み |
| 島カスタム | 実装済み |
| 河川本数 | 実装済み |
| 目標陸地率 | 実装済み |
| ワールド端接続設定の受け渡し | 実装済み |
| 設定保存 | 実装済み |
| 生成 / 再生成 | 実装済み |
| 起動時自動60×60生成の廃止 | 実装済み |
