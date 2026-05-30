# Claude への指示

## 基本ルール

- 回答は常に日本語で行うこと
- ファイルを作成・変更する前に、何をするか一言確認すること
- エラーが出たら原因を日本語で説明してから修正すること
- コードにはコメント（説明文）を日本語で入れること

---

## プロジェクト概要
愛媛県西条市の公式統計データ（2011〜2026年）を
グラフで可視化するダッシュボード。
市民・行政・研究者が使うことを想定している。
GitHub Pages（https://daiki-tk.github.io/saijo-stats/）で公開中。

## ファイル構成
- index.html：骨格のみ（HTMLの構造）
- css/style.css：全デザイン・レイアウト
- js/dashboard.js：グラフ描画・インタラクション・CSV読み込み
- data/*.csv：統計データ（population/industry/agriculture/
              finance/education/tourism）

## 技術スタック
- HTML / CSS / バニラJavaScript
- Chart.js 4.4.1（CDN経由）
- データ形式：年度,項目名,値 の3列CSV

## デザインルール
- メインカラー：#0a5c4a（石鎚山グリーン）
- フォント：Noto Sans JP
- カードのborder-radius：12px
- KPIカードは .kpi クラスを使うこと

## 禁止事項
- jQueryなど未使用の外部ライブラリを確認なしに追加しないこと
- data/フォルダのCSVを直接書き換えないこと
- style.cssのメインカラー（#0a5c4a）を変更しないこと
- index.htmlのGoogle Analytics設定を変更しないこと

## Git運用ルール
- 作業完了時は必ずコミットしてGitHubにプッシュすること
- コミットメッセージは日本語で「何を・なぜ変えたか」を書くこと
- 例：「人口グラフに画像保存ボタンを追加（ダウンロード機能の実装）」
- 大きな変更の前は必ずブランチを作成してから作業すること
