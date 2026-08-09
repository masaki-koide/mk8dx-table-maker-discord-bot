import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  MessageContextMenuCommandInteraction,
  ModalSubmitInteraction,
} from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import { extractResults } from "../ocr/gemini.ts";
import { verifyTotal } from "../table/checksum.ts";
import { parseResult } from "../table/parse.ts";
import { buildReport } from "../table/report.ts";
import { buildSumReport } from "../table/sum.ts";
import { TEAM_OPTION_NAMES } from "./command.ts";
import { checkAllowed, checkAttachment, type AllowList, type RateLimiter } from "./guard.ts";
import { formatMessage } from "./message.ts";
import { buildSumModal, collectMogiTexts } from "./modal.ts";
import type { PendingSums } from "./pending.ts";

export type HandlerDeps = {
  allow: AllowList;
  rateLimiter: RateLimiter;
  model: string;
};

/** `/sum` 系は Gemini を呼ばないので allowlist と集計バッファしか要らない */
export type SumDeps = { allow: AllowList; pending: PendingSums };

/** 「最後の1件を取り消す」ボタン */
export const SUM_UNDO_BUTTON_ID = "sum:undo";

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
 * メッセージのコンテキストメニュー「集計に追加」。
 *
 * 対象メッセージの本文はインタラクションのペイロードに同梱されて届くので、
 * **ユーザーは何もコピーしない**。`/result` の出力にも、手で直した表を自分で
 * 投稿したものにも使える（docs/design.md §16.2）。
 */
export async function handleAddToSum(
  interaction: MessageContextMenuCommandInteraction,
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

  const text = interaction.targetMessage.content;
  const summary = summarize(text);
  if (summary === null) {
    await interaction.reply(
      ephemeral("❌ このメッセージから選手行を読み取れませんでした（`名前 点数` の行が必要です）"),
    );
    return;
  }

  const added = deps.pending.add(interaction.user.id, text);
  if (!added.ok) {
    await interaction.reply(ephemeral(`❌ ${added.reason}。先に \`/sum\` で出力してください`));
    return;
  }

  const next = added.count >= 2 ? "`/sum` で出力できます" : "もう1模擬追加してください";
  await interaction.reply({
    content: `✅ ${added.count}模擬目として追加しました（${summary}）\n${next}`,
    components: [undoRow()],
    flags: MessageFlags.Ephemeral,
  });
}

/** 「最後の1件を取り消す」ボタン。押した時点の**最後の1件**を消す */
export async function handleUndoAdd(
  interaction: ButtonInteraction,
  deps: SumDeps,
): Promise<void> {
  const remaining = deps.pending.undo(interaction.user.id);
  await interaction.update({
    content:
      remaining === 0
        ? "↩️ 取り消しました（集計待ちは0件です）"
        : `↩️ 取り消しました（集計待ちは${remaining}模擬です）`,
    components: [],
  });
}

/**
 * `/sum` — 溜めた模擬を出力してクリアする。
 *
 * 0 件のときはモーダルを開く。Discord の外（テキストエディタ / gb2）から
 * 貼り付ける経路を残すため（docs/design.md §16.2）。
 * `showModal()` は**最初の応答**でなければならないので `deferReply()` は使えないが、
 * ここは純粋な文字列処理なので 3 秒制限に対して十分に速い。
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

  const pendingCount = deps.pending.count(interaction.user.id);
  if (pendingCount === 0) {
    await interaction.showModal(buildSumModal());
    return;
  }
  if (pendingCount === 1) {
    await interaction.reply(
      ephemeral("❌ 1模擬分しか追加されていません。もう1件「集計に追加」してください"),
    );
    return;
  }

  const texts = deps.pending.take(interaction.user.id);
  await interaction.reply(formatMessage(buildSumReport(texts.map(parseResult))));
}

const undoRow = () =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(SUM_UNDO_BUTTON_ID)
      .setLabel("最後の1件を取り消す")
      .setStyle(ButtonStyle.Secondary),
  );

/**
 * 追加したメッセージが本当に狙ったものかを、その場で確かめられるようにする要約。
 * 選手行が 1 行も無ければ null（＝追加対象として不適）。
 */
function summarize(text: string): string | null {
  const players = parseResult(text);
  if (players.length === 0) return null;
  const checksum = verifyTotal(players.reduce((sum, p) => sum + p.score, 0));
  return checksum.ok
    ? `${players.length}人 / ${checksum.total}点 = ${checksum.raceCount}レース`
    : `${players.length}人 / ${checksum.total}点 ⚠️ 期待値 ${checksum.expected}点`;
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
