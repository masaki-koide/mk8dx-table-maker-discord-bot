# mk8dx-table-maker-discord-bot

MK8DX の最終リザルト画面のスクショから、[gb2.hlorenzi.com/table](https://gb2.hlorenzi.com/table)
に貼り付けるテキストを生成する Discord Bot。

**設計の確定仕様は `docs/design.md` にある。実装前に必ず読むこと。**

## 実行環境

| 項目 | 選択 |
|---|---|
| 本番ランタイム | **Node 22**（Bun ではない） |
| ホスティング | Fly.io（常時起動 / Gateway 接続） |
| Discord | `discord.js`（Gateway。HTTP Interactions ではない） |
| OCR | Gemini `gemini-2.5-flash-lite` / `@google/genai` |
| 開発ツール | Bun（`bun install` / `bun test` のみ） |

## Bun の扱い

**Bun は開発ツールとしてのみ使う。ランタイムとしては使わない。**
`discord.js` が Bun を公式サポートしていないため、本番は Node で動かす。

使ってよい:

- `bun install` / `bun add --exact`（`npm install` の代わり）
- `bun test`（`jest` / `vitest` の代わり）
- `bunx <package>`（`npx` の代わり）

**使わない**:

- `Bun.serve()` — HTTP サーバは不要（Gateway 接続のため）
- `bun <file>` での本番実行 — 本番は `node dist/index.js`
- `bun:sqlite` / `Bun.redis` / `Bun.sql` — 永続ストアは使わない
- `Bun.file` / `Bun.$` — Node で動かないため、`node:fs` / `node:child_process` を使う

環境変数は Node で動くので **dotenv が必要**（Bun の自動ロードに依存しない）。
ローカルのスクリプトは `node --env-file=.env` で読み込む。

## 依存関係

**package.json のバージョンは必ず pin する。** `^` / `~` / `latest` を使わない。
追加するときは `bun add --exact <pkg>`。

`@types/node` のメジャーは**本番ランタイムの Node メジャーに合わせる**（現在 24 系）。

## テスト

```ts
import { test, expect } from "bun:test";
```

`src/table/*`（チーム照合・検算・テキスト生成）は**ランタイム非依存の純粋関数**として書く。
Discord / Gemini に依存させない。これにより `bun test` だけで完結する。

実画像に対するゴールデンテストは API キーが必要なため、通常のテスト実行からは分離する。

## 参照実装

`../mk8dx-auto-aggregation` に OCR とテキスト生成の先行実装があるが、
**そのまま流用してはいけない箇所が多い**。差分は `docs/design.md` §9 にまとめてある。

特に注意:

- テンプレートマッチング / 画像前処理は**本プロジェクトでは廃止**（OpenCV も sharp も不要）
- 参照実装の OCR プロンプトにある「順位は 1〜12 で重複なし」は**最終リザルト画面では誤り**（同着で重複・欠番する）
- 参照実装の `charAt(0)` によるチーム分類は使わない（タグは 1 文字とは限らない）
- 得点は順位から算出しない。**最終リザルト画面に表示されている累計点を OCR で読む**

## ドメイン知識

- 1 レースの全順位の合計点は常に **82**（15+12+10+9+8+7+6+5+4+3+2+1）
- レース数はゲーム仕様上 **4 / 6 / 8 / 12** のいずれか（10 レースの卓は存在しない）。
  したがって全員の合計点は `328 / 492 / 656 / 984` のいずれかになる（検算に使う）
- 最終リザルト画面は同着で順位が重複・欠番する（例: `1,2,3,4,4,6,...,9,9,11,12`）
- Mii 名にはひらがな・カタカナ・英数字・記号（`★ ☆ ♪ * ！`）が混在する
