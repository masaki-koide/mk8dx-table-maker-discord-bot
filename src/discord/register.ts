/**
 * スラッシュコマンドを Discord に登録する。デプロイ時に 1 回だけ実行する。
 *
 * 実行:  node --env-file=.env src/discord/register.ts
 *
 * ALLOWED_GUILD_IDS が設定されていればギルド単位で登録する（即時反映）。
 * グローバル登録は反映に最大1時間かかるうえ、身内利用では不要。
 */
import { REST, Routes } from "discord.js";
import { loadConfig } from "../config.ts";
import { resultCommand } from "./command.ts";

const config = loadConfig();
const rest = new REST().setToken(config.discordToken);
const body = [resultCommand.toJSON()];

if (config.allowedGuildIds.length === 0) {
  throw new Error("ALLOWED_GUILD_IDS が空です。登録先のサーバーを指定してください");
}

for (const guildId of config.allowedGuildIds) {
  await rest.put(Routes.applicationGuildCommands(config.applicationId, guildId), { body });
  console.log(`登録しました: guild=${guildId} /${resultCommand.name}`);
}
