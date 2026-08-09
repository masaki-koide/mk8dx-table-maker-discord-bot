/**
 * `/result` が出力したチーム別テキストを、選手行の配列に戻す（docs/design.md §16.3）。
 *
 * ユーザーは Discord からコピペするので、コードフェンス・`✅` 行・`⚠️` 行が
 * 付いてくる。**寛容にパースして捨てる**。
 */

export type ParsedPlayer = {
  /** 生テキストのまま。正規化しない（照合は sum.ts の sumKey で行う） */
  name: string;
  score: number;
};

/**
 * 選手行の判定: **行末が「空白 + 数字」なら選手行、それ以外は見出し行**。
 *
 * 名前の途中の空白は保つ（`S ぴ 64` → `S ぴ` / 64）。
 * 全角数字も受けるが、名前側は NFKC しない。
 *
 * 既知の穴: タグが `Team 1` のように「空白 + 数字」で終わると見出しが選手行に化ける。
 * 実タグは `ラッパー` / `Cafe☆` / `M` / `も` のような形なので受け入れる（合計点が
 * 狂うため §16.6 の検算が拾う）。
 */
const PLAYER_LINE = /^(.*\S)\s+([0-9０-９]+)$/u;

/** 明示的に捨てる行（`/result` の投稿をそのままコピーしたときに混ざる） */
const NOISE = /^(```|✅|⚠️|❌)/u;

export function parseResult(text: string): ParsedPlayer[] {
  const players: ParsedPlayer[] = [];

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (line === "" || NOISE.test(line)) continue;

    const matched = PLAYER_LINE.exec(line);
    if (!matched) continue; // 見出し行（`Cafe` / `(未分類)` など）

    players.push({
      name: matched[1]!,
      score: Number(matched[2]!.normalize("NFKC")),
    });
  }

  return players;
}
