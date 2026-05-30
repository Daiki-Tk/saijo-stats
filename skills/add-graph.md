# グラフ追加スキル

## このスキルを使う場面
ダッシュボードに新しいグラフを追加するとき

## 手順
1. 追加するデータがdata/フォルダのどのCSVにあるか確認する
2. js/dashboard.jsの該当セクションに描画関数を追加する
3. index.htmlに対応するcanvas要素とカード構造を追加する
4. css/style.cssに必要なクラスがなければ追加する
5. 既存グラフのコードスタイル・命名規則に合わせること
6. ローカルで動作確認後にGitHubにプッシュする

## 命名規則
- グラフIDはキャメルケース（例：popChart, finChart）
- 描画関数名は「render + セクション名 + Charts」
  （例：renderPopCharts, renderFinCharts）

## 注意点
- Chart.jsのバージョンは4.4.1を使うこと
- 既存グラフと色・スタイルを統一すること
- グラフのないカードには .dl-img-btn を表示しないこと
