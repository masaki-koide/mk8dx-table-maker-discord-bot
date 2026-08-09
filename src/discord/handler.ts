import type { ChatInputCommandInteraction, ModalSubmitInteraction } from "discord.js";
import { MessageFlags } from "discord.js";
import { extractResults } from "../ocr/gemini.ts";
import { parseResult } from "../table/parse.ts";
import { buildReport } from "../table/report.ts";
import { buildSumReport } from "../table/sum.ts";
import { TEAM_OPTION_NAMES } from "./command.ts";
import { checkAllowed, checkAttachment, type AllowList, type RateLimiter } from "./guard.ts";
import { formatMessage } from "./message.ts";
import { buildSumModal, collectMogiTexts } from "./modal.ts";

export type HandlerDeps = {
  allow: AllowList;
  rateLimiter: RateLimiter;
  model: string;
};

/** `/sum` は Gemini を呼ばないので allowlist しか要らない */
export type SumDeps = { allow: AllowList };

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

/**
 * `/sum` — モーダルを出すだけ。
 *
 * `showModal()` は**最初の応答**でなければならないため `deferReply()` は使えない。
 * ここで行う処理は allowlist のチェックだけなので 3 秒制限に対して十分に速い。
 */
export async function handleSum(
  interaction: ChatInputCommandInteraction,
  deps: SumDeps,
): Promise<void> {
  const allowed = checkAllowed(deps.allow, {
    guildId: interaction.guildId,
    userId: interaction.user.id,
  });
  if (!allowed.ok) {
    await interaction.reply(ephemeral(`❌ ${allowed.reason}`));
    return;
  }
  await interaction.showModal(buildSumModal());
}

/**
 * `/sum` のモーダル送信。
 *
 * 純粋な文字列処理なので数ミリ秒で終わる。defer せずそのまま返す。
 * レート制限は掛けない（Gemini を呼ばず課金が発生しないため。docs/design.md §16.7）。
 */
export async function handleSumSubmit(
  interaction: ModalSubmitInteraction,
  deps: SumDeps,
): Promise<void> {
  const allowed = checkAllowed(deps.allow, {
    guildId: interaction.guildId,
    userId: interaction.user.id,
  });
  if (!allowed.ok) {
    await interaction.reply(ephemeral(`❌ ${allowed.reason}`));
    return;
  }

  // 未入力の任意フィールドは送信ペイロードに含まれないことがあり、
  // getTextInputValue() は見つからないと例外を投げる
  const texts = collectMogiTexts((id) => {
    try {
      return interaction.fields.getTextInputValue(id);
    } catch {
      return "";
    }
  });
  if (texts.length < 2) {
    await interaction.reply(ephemeral("❌ 2模擬分以上を貼り付けてください"));
    return;
  }

  const report = buildSumReport(texts.map(parseResult));
  if (report.rows.length === 0) {
    await interaction.reply(
      ephemeral("❌ 選手行を1つも読み取れませんでした（`名前 点数` の行が必要です）"),
    );
    return;
  }

  await interaction.reply(formatMessage(report));
}
