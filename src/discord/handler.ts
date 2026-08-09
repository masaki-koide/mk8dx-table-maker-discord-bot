import type { ChatInputCommandInteraction } from "discord.js";
import { MessageFlags } from "discord.js";
import { extractResults } from "../ocr/gemini.ts";
import { buildReport } from "../table/report.ts";
import { TEAM_OPTION_NAMES } from "./command.ts";
import { checkAllowed, checkAttachment, type AllowList, type RateLimiter } from "./guard.ts";
import { formatMessage } from "./message.ts";

export type HandlerDeps = {
  allow: AllowList;
  rateLimiter: RateLimiter;
  model: string;
};

/** `team1`..`team6` を宣言順に集め、空欄を除いて返す（＝出力ブロックの順序） */
export function collectTags(get: (name: string) => string | null): string[] {
  return TEAM_OPTION_NAMES.map((name) => get(name)?.trim() ?? "").filter((tag) => tag !== "");
}

const ephemeral = (content: string) => ({ content, flags: MessageFlags.Ephemeral } as const);

export async function handleResult(
  interaction: ChatInputCommandInteraction,
  deps: HandlerDeps,
): Promise<void> {
  // --- Gemini を呼ぶ前のガード（課金対象の処理に進ませない） ---
  const allowed = checkAllowed(deps.allow, {
    guildId: interaction.guildId,
    userId: interaction.user.id,
  });
  if (!allowed.ok) {
    await interaction.reply(ephemeral(`❌ ${allowed.reason}`));
    return;
  }

  const attachment = interaction.options.getAttachment("image", true);
  const attachmentCheck = checkAttachment(attachment);
  if (!attachmentCheck.ok) {
    await interaction.reply(ephemeral(`❌ ${attachmentCheck.reason}`));
    return;
  }

  const tags = collectTags((name) => interaction.options.getString(name));
  if (tags.length < 2) {
    await interaction.reply(ephemeral("❌ チームタグを2つ以上指定してください"));
    return;
  }

  const quota = deps.rateLimiter.tryConsume(interaction.user.id);
  if (!quota.ok) {
    await interaction.reply(ephemeral(`❌ ${quota.reason}`));
    return;
  }

  // --- ここから先は数秒かかるので defer する（Discord の3秒制限） ---
  await interaction.deferReply();

  try {
    const response = await fetch(attachment.url);
    if (!response.ok) {
      throw new Error(`添付画像を取得できませんでした (HTTP ${response.status})`);
    }
    const data = new Uint8Array(await response.arrayBuffer());

    const { result } = await extractResults(
      { data, mimeType: attachment.contentType ?? "image/jpeg" },
      { model: deps.model },
    );
    const report = buildReport(result.players, tags);
    await interaction.editReply(formatMessage(report));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[/result] 失敗:", error);
    await interaction.editReply(`❌ 読み取りに失敗しました: ${detail}`);
  }
}
