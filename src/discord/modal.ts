import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { MAX_MOGI } from "../table/sum.ts";

export const SUM_MODAL_ID = "sum";

/** `mogi1` .. `mogi5`。並び順がそのまま `|` の順序になる */
export const MOGI_INPUT_IDS = Array.from({ length: MAX_MOGI }, (_, i) => `mogi${i + 1}`);

/** TextInput 1 つあたりの上限（Discord の制約）。12行の表なら十分に収まる */
const MAX_INPUT_LENGTH = 4000;

/**
 * `/sum` のモーダル（docs/design.md §16.2）。
 *
 * スラッシュコマンドの String オプションには**改行を入力できない**ため、
 * 複数行のチーム別テキストを受け取る手段はモーダルしかない。
 * TextInput は最大 5 個なので、一度に集計できるのは 5 模擬まで。
 */
export function buildSumModal(): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(SUM_MODAL_ID).setTitle("複数模擬の個人点を集計");

  for (const [index, id] of MOGI_INPUT_IDS.entries()) {
    const input = new TextInputBuilder()
      .setCustomId(id)
      .setLabel(`${index + 1}模擬目`)
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("/result の出力をそのまま貼り付け")
      .setMaxLength(MAX_INPUT_LENGTH)
      .setRequired(index < 2);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }

  return modal;
}

/**
 * 埋まっているフィールドを宣言順に集める。
 * 空欄はスキップして前に詰めるので、`|` の位置は**詰めた後の順番**になる。
 */
export function collectMogiTexts(get: (id: string) => string): string[] {
  return MOGI_INPUT_IDS.map((id) => get(id).trim()).filter((text) => text !== "");
}
