/**
 * ALLOWED_GUILD_IDS の全サーバーにスラッシュコマンドを登録する。
 * 初回と、コマンド定義（src/discord/command.ts）を変更したときに実行する。
 *
 *   node --env-file=.env scripts/register.ts
 */
import { loadConfig } from "../src/config.ts";
import { GuildNotInvitedError, inviteUrl, registerCommands } from "../src/discord/register.ts";

const config = loadConfig();

if (config.allowedGuildIds.length === 0) {
  throw new Error("ALLOWED_GUILD_IDS が空です。登録先のサーバーを指定してください");
}

try {
  await registerCommands(config.discordToken, config.applicationId, config.allowedGuildIds);
} catch (error) {
  if (error instanceof GuildNotInvitedError) {
    console.error(`\n❌ ${error.message}`);
    console.error(`   先に招待してください: ${inviteUrl(config.applicationId)}`);
    process.exit(1);
  }
  throw error;
}
