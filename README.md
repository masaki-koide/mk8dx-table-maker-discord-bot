# mk8dx-table-maker-discord-bot

MK8DX の最終リザルト画面のスクリーンショットから、
[Lorenzi's Gallery Table](https://gb2.hlorenzi.com/table) に貼り付けるテキストを生成する Discord Bot。

```
/result image:<スクショ> team1:Cafe team2:S team3:M team4:も
```

```
✅ 合計 984点 (12レース) / 4チーム — 検算OK

Cafe
Cafe☆とどーる 111
Cafe☆コメタ 85
Cafe☆スダハ 76

S
SPYAIR♪ 93
...
```

設計の確定仕様は [`docs/design.md`](docs/design.md) を参照。

## セットアップ

```bash
bun install
cp .env.example .env
```

`.env` に最低限これらが必要:

- `DISCORD_BOT_TOKEN` / `DISCORD_APPLICATION_ID` — Discord Developer Portal で取得。
  **「Public Bot」は OFF にすること**（自分以外がインストールできなくなる）
- `GEMINI_API_KEY` — **課金を有効にしていない**プロジェクトで発行する。
  無料枠を超えたら 429 で止まり、請求が発生しない
- `ALLOWED_GUILD_IDS` — 未設定だと起動を拒否する（誰でも叩ける状態を防ぐため）

```bash
bun run register   # スラッシュコマンドをサーバーに登録（初回とコマンド変更時）
bun run dev        # ローカル起動
```

## デプロイ（Fly.io）

```bash
fly launch --no-deploy
bun run secrets:sync          # .env の内容を Fly のシークレットに反映
fly deploy
fly scale count 1             # Gateway は1台のみ。2台だと1コマンドに2回応答する
```

以降は `main` への push で GitHub Actions が自動デプロイする（要 `FLY_API_TOKEN` シークレット）。

### 設定値の扱い

**本番の設定は `.env` を正とし、`bun run secrets:sync` で反映する。**
`fly deploy` はシークレットに触らないので、`.env` を変えただけでは本番に反映されない。

`.env` からキーを削除した場合は `--prune` を付ける（`fly secrets import` は追加・上書きしかしないため、
付けないと Fly 側に残り続けてコードのデフォルトを上書きし続ける）。

```bash
bun run secrets:sync -- --dry-run    # 差分だけ確認
bun run secrets:sync -- --prune      # .env に無いキーを Fly から削除
```

## コマンド

| コマンド | 内容 |
|---|---|
| `bun test` | ユニットテスト（API キー不要） |
| `bun run typecheck` | 型チェック |
| `bun run dev` | ローカルで Bot を起動 |
| `bun run register` | スラッシュコマンドを登録 |
| `bun run secrets:sync` | `.env` を Fly のシークレットに同期（`--dry-run` / `--prune`） |
| `bun run verify:ocr` | 実画像に対する OCR の安定性・正確性を検証（要 API キー） |
| `bun run preview <image> <tag...>` | 実画像から投稿本文を生成して表示（要 API キー） |

本番ランタイムは Node、Bun は開発ツールとしてのみ使う。詳細は [`CLAUDE.md`](CLAUDE.md)。
