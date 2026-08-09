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

複数の模擬をまたいだ**個人点**は `/sum` でまとめる。実行するとモーダルが開くので、
模擬ごとに `/result` の出力を貼り付ける（最大 5 模擬）。合計は gb2 が計算する。

```
✅ 1模擬目: 984点 (12レース)
✅ 2模擬目: 984点 (12レース)

ラッパーひろし 133|122
いもすけりん 97|0
...
```

設計の確定仕様は [`docs/design.md`](docs/design.md) を参照（`/sum` は §16）。

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

## 利用を許可するサーバーを増やす

```bash
bun run add-guild -- <サーバーID>
```

これ1つで完結します。内部では次の順に実行されます:

1. そのサーバーにスラッシュコマンドを登録（＝Bot が参加しているかの確認を兼ねる）
2. `.env` の `ALLOWED_GUILD_IDS` に追記
3. `bun run secrets:sync` で本番に反映（**マシンが再起動します**。10秒ほど落ちます）

**Bot が未招待なら 1 で止まり、`.env` は書き換わりません。** 招待 URL が表示されるので、
そこから追加してからやり直してください。Public Bot を OFF にしているので、
**追加できるのはアプリのオーナーだけ**です。

```bash
bun run add-guild -- <サーバーID> --dry-run   # 何が起きるか確認するだけ
bun run add-guild -- <サーバーID> --no-sync   # .env と登録まで。本番反映は後で
```

サーバーIDは Discord でサーバーを右クリック →「サーバーIDをコピー」。
出てこない場合は 設定 → 詳細設定 → 開発者モード を ON にしてください。

### 手動でやる場合

```bash
# 1. 招待 URL を確認（引数なしで実行すると表示されます）
bun run add-guild
# 2. .env の ALLOWED_GUILD_IDS にカンマ区切りで追記
# 3. コマンドを登録
bun run register
# 4. 本番に反映
bun run secrets:sync
```

**4 を忘れると本番だけ古い許可リストのままになり**、新しいサーバーで
「このサーバーでは利用できません」と拒否され続けます。`fly deploy` では反映されません。

## サーバーを許可対象から外す

`.env` の `ALLOWED_GUILD_IDS` から該当 ID を削除して `bun run secrets:sync`。

スラッシュコマンド自体は登録されたまま残るので、そのサーバーの `/result` / `/sum` は
表示はされるが実行すると拒否される、という状態になります。完全に消すなら
Bot をそのサーバーから退出させてください。

## コマンド

| コマンド | 内容 |
|---|---|
| `bun test` | ユニットテスト（API キー不要） |
| `bun run typecheck` | 型チェック |
| `bun run dev` | ローカルで Bot を起動 |
| `bun run add-guild -- <id>` | 許可サーバーを追加（登録 → `.env` 更新 → 本番反映） |
| `bun run register` | 全許可サーバーにスラッシュコマンドを登録 |
| `bun run secrets:sync` | `.env` を Fly のシークレットに同期（`--dry-run` / `--prune`） |
| `bun run verify:ocr` | 実画像に対する OCR の安定性・正確性を検証（要 API キー） |
| `bun run preview <image> <tag...>` | 実画像から投稿本文を生成して表示（要 API キー） |

本番ランタイムは Node、Bun は開発ツールとしてのみ使う。詳細は [`CLAUDE.md`](CLAUDE.md)。
