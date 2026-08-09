import { SlashCommandBuilder } from "discord.js";

export const COMMAND_NAME = "result";
export const SUM_COMMAND_NAME = "sum";

/** 指定できるチーム数の上限（12人 ÷ 2人 = 6チームまで） */
export const MAX_TEAMS = 6;

/** `team1`, `team2`, ... のオプション名 */
export const TEAM_OPTION_NAMES = Array.from({ length: MAX_TEAMS }, (_, i) => `team${i + 1}`);

/**
 * `/result image:<添付> team1:<tag> team2:<tag> [team3..team6]`
 *
 * Discord は必須オプションを先に並べる必要があるため、
 * image / team1 / team2 → team3..team6 の順で定義する。
 * 引数の順序がそのまま gb2 の出力ブロック順になる（docs/design.md §3）。
 */
export const resultCommand = (() => {
  const builder = new SlashCommandBuilder()
    .setName(COMMAND_NAME)
    .setDescription("最終リザルト画面のスクショから gb2 用のテキストを作ります")
    .addAttachmentOption((option) =>
      option.setName("image").setDescription("最終リザルト画面のスクリーンショット").setRequired(true),
    );

  for (const [index, name] of TEAM_OPTION_NAMES.entries()) {
    const required = index < 2;
    builder.addStringOption((option) =>
      option
        .setName(name)
        .setDescription(
          `${index + 1}番目のチームのタグ（例: Cafe）。完全なタグでなくても、識別できる部分で足ります`,
        )
        .setRequired(required),
    );
  }
  return builder;
})();

/**
 * `/sum`（オプションなし。実行するとモーダルが開く）
 *
 * 改行を含むテキストを受け取る必要があるため、入力はすべてモーダル側にある
 * （docs/design.md §16.2）。Gemini を呼ばないのでレート制限も添付検証も不要。
 */
export const sumCommand = new SlashCommandBuilder()
  .setName(SUM_COMMAND_NAME)
  .setDescription("複数模擬の結果をまとめて gb2 用の個人点テキストを作ります");
