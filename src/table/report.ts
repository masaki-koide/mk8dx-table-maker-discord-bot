import { PLAYER_COUNT, type OcrPlayer } from "../ocr/schema.ts";
import { buildTable } from "./build.ts";
import { verifyTotal } from "./checksum.ts";
import { assignTeams, collidingTags, type AssignedPlayer } from "./match.ts";

export type Report = {
  /** 検算が通ったときの要約行。通らなければ null（代わりに warnings に理由が入る） */
  headline: string | null;
  /** gb2 に貼り付けるテキスト本体 */
  table: string;
  /** 問題がひとつもなければ true */
  clean: boolean;
  warnings: string[];
  players: AssignedPlayer[];
};

/**
 * OCR 結果とタグから、Discord に投稿する本文を組み立てる。
 *
 * 出力は「人間が目視で検算して手元で直す下書き」という位置づけ（docs/design.md §1）。
 * したがって、どの警告も表の出力を止めない。**黙って間違えないこと**が最優先。
 */
export function buildReport(players: readonly OcrPlayer[], tags: readonly string[]): Report {
  const warnings: string[] = [];
  const assigned = assignTeams(players, tags);
  const table = buildTable(assigned, tags);

  // --- 検算 ---
  const total = players.reduce((sum, p) => sum + p.score, 0);
  const checksum = verifyTotal(total);
  if (!checksum.ok) {
    warnings.push(`合計点が不正です。${checksum.total}点(期待値: ${checksum.expected}点)`);
  }

  // --- 読み取れた人数 ---
  if (players.length !== PLAYER_COUNT) {
    warnings.push(`${players.length}人しか読み取れませんでした（期待: ${PLAYER_COUNT}人）`);
  }

  // --- 正規化後に衝突するタグ ---
  for (const group of collidingTags(tags)) {
    warnings.push(`タグ「${group.join("」「")}」は区別できません（全角/半角・大小文字の違いのみ）`);
  }

  // --- どのタグにも一致しなかったプレイヤー ---
  for (const player of assigned) {
    if (player.tag !== null) continue;
    const hint = player.suggestion ? `（近い候補: ${player.suggestion}）` : "";
    warnings.push(`「${player.name}」はどのタグにも一致しませんでした${hint}`);
  }

  // --- 1 人も一致しなかったタグ ---
  for (const tag of tags) {
    if (!assigned.some((p) => p.tag === tag)) {
      warnings.push(`タグ「${tag}」に一致するプレイヤーがいません`);
    }
  }

  // --- チーム人数の偏り ---
  const counts = tags.map((tag) => ({ tag, n: assigned.filter((p) => p.tag === tag).length }));
  const evenly = players.length % tags.length === 0;
  const expectedSize = players.length / tags.length;
  if (evenly && counts.some((c) => c.n !== expectedSize)) {
    warnings.push(
      `チーム人数が揃っていません: ${counts.map((c) => `${c.tag}=${c.n}`).join(", ")}`,
    );
  }

  const headline = checksum.ok
    ? `✅ 合計 ${checksum.total}点 (${checksum.raceCount}レース) / ${tags.length}チーム — 検算OK`
    : null;

  return { headline, table, clean: warnings.length === 0, warnings, players: assigned };
}
