import type { OcrPlayer } from "../ocr/schema.ts";

/**
 * 照合用の正規化。
 * 全角/半角と大文字小文字の揺れだけを吸収する。
 * ひらがな↔カタカナは畳み込まない（`イカ` と `いもすけ` のような別チームを潰すため）。
 *
 * 出力する名前には適用しない。人間が画像と見比べて直せるよう、生テキストを保つ。
 */
export function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase();
}

/** カタカナをひらがなに畳み込む。**候補の提案にのみ**使い、自動採用はしない。 */
function foldKana(value: string): string {
  return normalize(value).replace(/[ァ-ヶ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0x60),
  );
}

type Candidate = { tag: string; length: number; kind: "prefix" | "suffix" };

/**
 * プレイヤー名に一致するタグを 1 つ選ぶ。一致しなければ null。
 *
 * ルール（docs/design.md §5）:
 *   1. 全タグとの前方一致・後方一致をすべて列挙する
 *   2. **最長タグ勝ち**
 *   3. 同じ長さなら後方一致を優先
 *
 * 「後方一致を常に優先」ではない点に注意。タグ `ラッパー` と `あ` があるとき、
 * `ラッパーみあ` は後方一致優先だと `あ` に吸われてしまう。長さで決めれば正しく `ラッパー` になる。
 */
export function matchTag(playerName: string, tags: readonly string[]): string | null {
  const name = normalize(playerName);
  const candidates: Candidate[] = [];

  for (const tag of tags) {
    const t = normalize(tag);
    if (t === "") continue;
    if (name.startsWith(t)) candidates.push({ tag, length: t.length, kind: "prefix" });
    if (name.endsWith(t)) candidates.push({ tag, length: t.length, kind: "suffix" });
  }
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.length !== b.length) return b.length - a.length;
    if (a.kind !== b.kind) return a.kind === "suffix" ? -1 : 1;
    return 0;
  });
  return candidates[0]!.tag;
}

/**
 * どのタグにも一致しなかった名前に対して、ひらがな↔カタカナを畳み込んで再照合し、
 * 惜しかったタグを提案する。**自動採用はしない**（誤爆を静かに通さないため）。
 */
export function suggestTag(playerName: string, tags: readonly string[]): string | null {
  const name = foldKana(playerName);
  let best: Candidate | null = null;

  for (const tag of tags) {
    const t = foldKana(tag);
    if (t === "") continue;
    if (name.startsWith(t) || name.endsWith(t)) {
      if (!best || t.length > best.length) best = { tag, length: t.length, kind: "prefix" };
    }
  }
  return best?.tag ?? null;
}

export type AssignedPlayer = OcrPlayer & {
  /** 一致したタグ（ユーザーが入力した文字列そのまま）。一致しなければ null */
  tag: string | null;
  /** 未一致のときの提案タグ */
  suggestion: string | null;
};

export function assignTeams(
  players: readonly OcrPlayer[],
  tags: readonly string[],
): AssignedPlayer[] {
  return players.map((player) => {
    const tag = matchTag(player.name, tags);
    return {
      ...player,
      tag,
      suggestion: tag === null ? suggestTag(player.name, tags) : null,
    };
  });
}

/** 正規化後に衝突するタグの組を返す（例: `M` と `ｍ`）。警告用。 */
export function collidingTags(tags: readonly string[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const tag of tags) {
    const key = normalize(tag);
    if (key === "") continue;
    groups.set(key, [...(groups.get(key) ?? []), tag]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}
