/**
 * 利用を許可するサーバーを追加する。
 *
 *   node --env-file=.env scripts/add-guild.ts <guildId> [--dry-run] [--no-sync]
 *
 * 手順を1つにまとめたもの。個別にやると「.env は直したが secrets:sync を忘れて
 * 本番では拒否され続ける」「コマンドを登録し忘れて /result が出てこない」を踏みやすい。
 *
 * 処理順:
 *   1. Bot がそのサーバーに参加しているか確認（コマンド登録を試みる）
 *   2. 成功したら .env の ALLOWED_GUILD_IDS に追記
 *   3. Fly のシークレットに同期（本番マシンが再起動する）
 *
 * 1 が失敗したら .env は書き換えない。招待前に設定だけ進んでしまうのを防ぐため。
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { GuildNotInvitedError, inviteUrl, registerCommands } from "../src/discord/register.ts";

const ENV_FILE = ".env";
const KEY = "ALLOWED_GUILD_IDS";

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const NO_SYNC = argv.includes("--no-sync");
const guildId = argv.find((a) => !a.startsWith("--"));

const token = process.env.DISCORD_BOT_TOKEN;
const applicationId = process.env.DISCORD_APPLICATION_ID;
if (!token || !applicationId) {
  throw new Error("DISCORD_BOT_TOKEN と DISCORD_APPLICATION_ID が必要です（--env-file=.env を付けましたか）");
}

if (!guildId) {
  console.error("usage: node --env-file=.env scripts/add-guild.ts <guildId> [--dry-run] [--no-sync]");
  console.error(`\nサーバーIDは Discord でサーバーを右クリック →「サーバーIDをコピー」で取得できます`);
  console.error(`（表示されない場合は 設定 → 詳細設定 → 開発者モード を ON に）`);
  console.error(`\n招待がまだなら先にこの URL から追加してください:\n  ${inviteUrl(applicationId)}`);
  process.exit(2);
}
if (!/^\d{17,20}$/.test(guildId)) {
  throw new Error(`サーバーIDの形式が不正です: ${guildId}（17〜20桁の数字のはずです）`);
}

// --- 現在の許可リスト ---
const envText = readFileSync(ENV_FILE, "utf8");
const line = envText.split("\n").find((l) => l.trimStart().startsWith(`${KEY}=`));
const current = (line?.slice(line.indexOf("=") + 1) ?? "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

if (current.includes(guildId)) {
  console.log(`ℹ️  ${guildId} は既に ${KEY} に入っています。コマンドの再登録だけ行います`);
} else {
  console.log(`${KEY}: ${current.join(", ") || "(空)"} → ${[...current, guildId].join(", ")}`);
}

// --- 1. 招待済みかを、実際にコマンドを登録して確かめる ---
console.log("\nスラッシュコマンドを登録しています...");
if (DRY_RUN) {
  console.log("  (--dry-run のためスキップ)");
} else {
  try {
    await registerCommands(token, applicationId, [guildId]);
  } catch (error) {
    if (error instanceof GuildNotInvitedError) {
      console.error(`\n❌ ${error.message}`);
      console.error(`   先にこの URL から Bot を追加してください:\n   ${inviteUrl(applicationId)}`);
      console.error(`   （Public Bot を OFF にしているため、追加できるのはアプリのオーナーだけです）`);
      console.error(`\n.env は変更していません。招待後にもう一度実行してください。`);
      process.exit(1);
    }
    throw error;
  }
}

// --- 2. .env を更新（コメントや他の行はそのまま） ---
if (!current.includes(guildId)) {
  const updated = [...current, guildId].join(",");
  const nextText = line
    ? envText.replace(line, `${KEY}=${updated}`)
    : `${envText.replace(/\n*$/, "\n")}${KEY}=${updated}\n`;

  if (DRY_RUN) {
    console.log(`\n(--dry-run) ${ENV_FILE} に書き込む内容: ${KEY}=${updated}`);
  } else {
    writeFileSync(ENV_FILE, nextText);
    console.log(`\n✅ ${ENV_FILE} を更新しました`);
  }
}

// --- 3. 本番に反映 ---
if (DRY_RUN || NO_SYNC) {
  console.log(
    NO_SYNC
      ? "\n--no-sync のため本番には反映していません。`bun run secrets:sync` を忘れずに"
      : "\n--dry-run のため何も実行しませんでした",
  );
  process.exit(0);
}

console.log("\n本番に反映しています（マシンが再起動します）...");
execFileSync("node", ["scripts/sync-secrets.ts"], { stdio: "inherit" });
console.log("\n完了しました。新しいサーバーで /result が使えます");
