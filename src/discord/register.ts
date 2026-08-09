import { REST, Routes } from "discord.js";
import { resultCommand, sumCommand } from "./command.ts";

/** Discord API のエラーコード: Bot がそのサーバーに参加していない／権限がない */
const MISSING_ACCESS = 50001;

export class GuildNotInvitedError extends Error {
  readonly guildId: string;
  constructor(guildId: string) {
    super(`Bot がサーバー ${guildId} に参加していません`);
    this.name = "GuildNotInvitedError";
    this.guildId = guildId;
  }
}

/**
 * スラッシュコマンドをギルド単位で登録する。
 *
 * ギルド単位の登録は**即時反映**される。グローバル登録は最大1時間かかるうえ、
 * 身内利用では不要なので使わない。
 *
 * Bot が未招待のサーバーに対しては GuildNotInvitedError を投げる。
 */
export async function registerCommands(
  token: string,
  applicationId: string,
  guildIds: readonly string[],
): Promise<void> {
  const rest = new REST().setToken(token);
  const commands = [resultCommand, sumCommand];
  const body = commands.map((command) => command.toJSON());

  for (const guildId of guildIds) {
    try {
      await rest.put(Routes.applicationGuildCommands(applicationId, guildId), { body });
      const names = commands.map((command) => `/${command.name}`).join(" ");
      console.log(`  ✅ ${names} を登録しました (guild=${guildId})`);
    } catch (error) {
      if ((error as { code?: number }).code === MISSING_ACCESS) {
        throw new GuildNotInvitedError(guildId);
      }
      throw error;
    }
  }
}

/** そのアプリをサーバーに追加するための招待 URL */
export function inviteUrl(applicationId: string): string {
  const params = new URLSearchParams({
    client_id: applicationId,
    // bot: Gateway 接続に必要 / applications.commands: スラッシュコマンド登録に必要
    scope: "bot applications.commands",
    // 2048 = Send Messages
    permissions: "2048",
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}
