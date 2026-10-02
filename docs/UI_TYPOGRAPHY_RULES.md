# UI文字サイズの管理

調整元は `frontend/src/v39/ui/v39-typography.css` に統一する。

- `--pc-base-font`: PCの通常文字。初期値15px。
- `--mobile-base-font`: 幅699px以下の通常文字。初期値12px。
- `--font-body`: 選択された基準サイズに表示設定の倍率を掛けた通常文字。
- `--pc-min-font / --mobile-min-font`: 読ませる補助文字の下限。初期値PC11px／スマホ10px。8〜13相当の小文字へ適用し、表示設定倍率にも連動する。6・7相当の装飾専用文字は別扱い。
- `--font-secondary / --font-compact / --font-heading`: 補助文字・小ラベル・見出し。通常文字に対する比率で定義する。
- `--font-size-N`: 既存デザインを保つサイズ段階。PC基準15pxのときN相当になり、基準値・端末・設定倍率に連動する。装飾や大きな文字も同じ調整元を使う。

各画面・Vueコンポーネント・JSで生成するCSSでは、`font-size` にこれらの変数を使用する。固定pxや同じ計算式を再定義しない。非表示用の0、親を継承するem/rem、アイコン寸法から算出するバッジは別扱いとする。

共通CSSはHTMLのheadから読み込み、初回描画から適用する。旧 `v39-readable-fonts.js` の後付け上書きは廃止し、部隊・土地・行動の文字サイズ補正は描画元へ統合済み。文字サイズだけを修正するための追加styleや!importantを増やさない。既存レイアウト用の!importantは本整理の対象外。

Phaser/canvas上の地図ラベル・ダメージ数値のサイズはHTML文字とは別管理であり、この整理では変更しない。

確認: `node scripts/check-v39-test-turns-fonts.mjs`。PC/スマホ、設定120%、基準変数変更、後付けstyle不在、建設ターン進行を検証する。
