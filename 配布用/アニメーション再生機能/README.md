# Phaserアニメーション再生機能

このフォルダを別のVue 3 + Phaser 3プロジェクトへコピーして使用できます。
既存の `fantasy_Strategy` 側のコードは参照しない独立版です。

## 含まれるもの

- `phaser-effect-player.mjs`: Phaser上でスプライトシートを再生する本体
- `EffectPlayerControls.vue`: エフェクト、角度、大きさ、色を選ぶVue部品
- `effect-catalog.example.js`: Viteで同梱画像を一覧化する例
- `導入例.vue`: Phaser Sceneとの接続例
- `assets/effect`: 現在使用中のエフェクト画像と一覧JSON

## 導入

1. このフォルダをコピーします。
2. コピー先に `vue` と `phaser` が導入済みであることを確認します。
3. `導入例.vue` を参考に、Phaser Scene作成後にプレイヤーを生成します。

```js
import PhaserEffectPlayer from "./アニメーション再生機能/phaser-effect-player.mjs";

const effectPlayer = new PhaserEffectPlayer(scene);

await effectPlayer.play({
  src: effectImageUrl,
  x: worldX,
  y: worldY,
  angleDeg: 0,
  scalePercent: 50,
  renderStyle: "soft"
});
```

`x` と `y` は画面座標ではなく、Phaserのワールド座標です。ヘックスのマスを対象にする場合は、コピー先のマップ処理でマス中心をワールド座標へ変換してから渡してください。

## 連続再生

`sequenceSources` の先頭から順に再生します。初期設定では各画像の間隔は10msです。

```js
await effectPlayer.play({
  sequenceSources: [
    { src: fireRainUrl },
    { src: flameUrl }
  ],
  x: worldX,
  y: worldY
});
```

## 再生設定

| 項目 | 内容 | 初期値 |
|---|---|---:|
| `totalDurationMs` | 画像1枚分の総再生時間。コマ数に関係なく一定 | `1500` |
| `sequenceGapMs` | 連続画像の間隔 | `10` |
| `angleDeg` | 角度 | `0` |
| `scalePercent` | 大きさ | `50` |
| `sourceScaleMultiplier` | 素材固有の倍率 | `1` |
| `renderStyle` | `soft`、`rect`、`none` | `soft` |
| `tint` | `#ffffff` または16進数 | 指定なし |
| `colorStrengthPercent` | 色変更の強さ | `100` |
| `hueAnimationDegPerFrame` | 1コマごとの色相変化 | `0` |
| `grayscaleBase` | 元画像をグレースケール化 | `false` |
| `showPreviousFrameGhost` | 直前コマを薄く残す | `false` |
| `frameOffsets` | コマごとの位置補正 `{ 0: { x, y } }` | `{}` |

コンストラクタでも `totalDurationMs` などの初期値を変更できます。

```js
const effectPlayer = new PhaserEffectPlayer(scene, {
  totalDurationMs: 4000,
  sequenceGapMs: 10
});
```

## 素材の分割規則

- 横長画像は横方向のスプライトシートとして分割します。
- 幅320pxで縦に長い画像は、縦120pxごとに分割します。
- その他の縦長画像は、正方形のコマまたは120px単位で分割します。
- `アニメーション1` の素材は一覧生成時に `sourceScaleMultiplier: 2` を付けています。
- `effect_list.json` に画像のないメモ行があっても、一覧生成時に自動で除外します。
- 全体画像の中心が指定座標へ合うよう、コマごとに描画位置を補正します。

## 終了処理

Vueコンポーネントの破棄時やScene終了時に呼び出してください。

```js
effectPlayer.destroy();
```

## 簡易テスト

コピー先で次を実行すると、画像分割と連続再生の基本処理を確認できます。

```bash
npm test
```
