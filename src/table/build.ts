import type { AssignedPlayer } from "./match.ts";

/** 未分類プレイヤーをまとめるブロックの見出し */
export const UNMATCHED_HEADER = "(未分類)";

/**
 * gb2.hlorenzi.com/table 互換テキストを生成する。
 *
 *   - ブロック順 = 引数 `tags` の順（＝コマンドの引数順）
 *   - 見出し = ユーザーが入力したタグ文字列そのまま
 *     （OCR 結果から共通接頭辞を復元する案は、1 人分の誤読で `Cafe☆` が `Caf` に縮むため採らない）
 *   - ブロック内の順序 = 入力順（＝画面の表示順＝得点降順）
 *   - 未分類プレイヤーは末尾に `(未分類)` ブロックとして出す。省略はしない（手で貼り直せるように）
 *   - ブロック間は空行 1 行。末尾に余分な改行は付けない
 */
export function buildTable(players: readonly AssignedPlayer[], tags: readonly string[]): string {
  const blocks: string[] = [];

  for (const tag of tags) {
    const members = players.filter((p) => p.tag === tag);
    if (members.length === 0) continue;
    blocks.push([tag, ...members.map(line)].join("\n"));
  }

  const unmatched = players.filter((p) => p.tag === null);
  if (unmatched.length > 0) {
    blocks.push([UNMATCHED_HEADER, ...unmatched.map(line)].join("\n"));
  }

  return blocks.join("\n\n").replace(/\r\n?/g, "\n");
}

const line = (player: AssignedPlayer) => `${player.name} ${player.score}`;
