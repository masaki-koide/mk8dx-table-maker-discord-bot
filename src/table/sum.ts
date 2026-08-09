import { PLAYER_COUNT } from "../ocr/schema.ts";
import { verifyTotal } from "./checksum.ts";
import type { ParsedPlayer } from "./parse.ts";

/** モーダルに置ける TextInput の上限（Discord の制約）＝ 一度に集計できる模擬数 */
export const MAX_MOGI = 5;

/**
 * 模擬をまたいだ同一人物の照合キー。
 *
 * §5 の `normalize()` に加えて**全空白を除去する**。
 * `Sぴ` / `S ぴ`、`Mむ` / `M む` は実サンプルで実際に揺れており、
 * 畳まないと同一人物が 2 行に割れるため（docs/design.md §16.4）。
 *
 * 出力する名前には適用しない。生テキストのまま出す。
 */
export function sumKey(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

export type SumRow = {
  /** 表示に使う生テキスト。同じキーの中で**最初に出現したもの**（＝若い模擬のもの） */
  name: string;
  /** 長さ = 模擬数。出場していない模擬は 0（gb2 は 0 を受け付ける） */
  scores: number[];
  /** その模擬に実際に出場していたか。0 点と欠場を区別するために持つ */
  present: boolean[];
};

export type SumReport = {
  /** 模擬ごとの検算 OK 行。NG の模擬は headlines に出ず warnings に入る */
  headlines: string[];
  /** gb2 に貼り付けるテキスト本体 */
  table: string;
  clean: boolean;
  warnings: string[];
  rows: SumRow[];
};

/**
 * n 模擬分の選手行から、gb2 用の個人点リストを組み立てる（docs/design.md §16）。
 *
 * `/result` と同じく、**どの警告も表の出力を止めない**。
 * 合計は gb2 が計算するので、ここでは足し算をしない（検算を除く）。
 */
export function buildSumReport(mogis: readonly (readonly ParsedPlayer[])[]): SumReport {
  const n = mogis.length;
  if (n === 0) {
    return { headlines: [], table: "", clean: true, warnings: [], rows: [] };
  }

  const headlines: string[] = [];
  const warnings: string[] = [];

  // --- 模擬ごとの検算と人数（全体の総和では見ない。レース数の混在に耐えるため） ---
  for (const [index, players] of mogis.entries()) {
    const label = `${index + 1}模擬目`;
    const checksum = verifyTotal(players.reduce((sum, p) => sum + p.score, 0));
    if (checksum.ok) {
      headlines.push(`✅ ${label}: ${checksum.total}点 (${checksum.raceCount}レース)`);
    } else {
      warnings.push(
        `${label}の合計点が不正です。${checksum.total}点(期待値: ${checksum.expected}点)`,
      );
    }
    if (players.length !== PLAYER_COUNT) {
      warnings.push(`${label}は${players.length}人です（期待: ${PLAYER_COUNT}人）`);
    }
  }

  const { rows, duplicates } = buildRows(mogis);
  const table = rows.map((row) => `${row.name} ${row.scores.join("|")}`).join("\n");

  // --- 通算ユニーク人数（サブ交代なし・12人固定が前提。名前誤読をここで拾う） ---
  if (rows.length !== PLAYER_COUNT) {
    warnings.push(`通算${rows.length}人います（期待: ${PLAYER_COUNT}人）`);
  }

  for (const duplicate of duplicates) {
    warnings.push(
      `「${duplicate.name}」が同名で${duplicate.count}人います。1模擬目からの出現順で対応させました`,
    );
  }

  // --- 出場模擬数が足りない人（サブなし前提では、これは名前誤読の症状） ---
  for (const row of rows) {
    if (row.present.every(Boolean)) continue;
    const suggestion = suggestSamePlayer(row, rows);
    const hint = suggestion ? `（近い候補: 「${suggestion}」— 同じ人ではありませんか？）` : "";
    const appeared = indexesOf(row.present, true);
    const missing = indexesOf(row.present, false);
    const detail =
      appeared.length === 1
        ? `${appeared[0]! + 1}模擬目にしかいません`
        : `${missing.map((i) => `${i + 1}模擬目`).join("・")}に出ていません`;
    warnings.push(`「${row.name}」は${detail}${hint}`);
  }

  return { headlines, table, clean: warnings.length === 0, warnings, rows };
}

/**
 * 名前でグループ化し、**各模擬の i 番目の出現を i 行目に割り当てる**。
 *
 * 同名が複数いる場合、誰と誰が同一人物かは原理的に判定不能なので出現順で機械的に対応させる。
 * 当てずっぽうだが、**全行が n セグメントを保ち、模擬ごとの合計も全体の合計も正しくなる**
 * （docs/design.md §16.4）。通常の「同名なし」はこの規則の k=1 の特殊形になる。
 */
function buildRows(mogis: readonly (readonly ParsedPlayer[])[]): {
  rows: SumRow[];
  duplicates: { name: string; count: number }[];
} {
  const n = mogis.length;
  type Entry = { name: string; occurrences: ParsedPlayer[][] };
  const entries = new Map<string, Entry>();

  for (const [index, players] of mogis.entries()) {
    for (const player of players) {
      const key = sumKey(player.name);
      const entry = entries.get(key) ?? {
        name: player.name, // 最初に出現した生テキストを表示に使う
        occurrences: Array.from({ length: n }, (): ParsedPlayer[] => []),
      };
      entry.occurrences[index]!.push(player);
      entries.set(key, entry);
    }
  }

  const rows: SumRow[] = [];
  const duplicates: { name: string; count: number }[] = [];

  for (const entry of entries.values()) {
    const slots = Math.max(...entry.occurrences.map((o) => o.length));
    if (slots > 1) duplicates.push({ name: entry.name, count: slots });
    for (let i = 0; i < slots; i++) {
      rows.push({
        name: entry.name,
        scores: entry.occurrences.map((o) => o[i]?.score ?? 0),
        present: entry.occurrences.map((o) => o[i] !== undefined),
      });
    }
  }

  return { rows, duplicates };
}

/**
 * 出場模擬数が足りない行に対して、**同一人物の誤読候補を提案する**（自動採用はしない）。
 *
 * 候補の条件:
 *   - 相手も出場模擬数が足りない
 *   - **出場模擬が重ならない**（同じ模擬に両方いるなら別人と確定するため）
 *   - 編集距離が名前の長さに対して十分小さい
 */
function suggestSamePlayer(row: SumRow, rows: readonly SumRow[]): string | null {
  const key = sumKey(row.name);
  let best: { name: string; distance: number } | null = null;

  for (const other of rows) {
    if (other === row || other.present.every(Boolean)) continue;
    if (other.present.some((p, i) => p && row.present[i])) continue;

    const otherKey = sumKey(other.name);
    if (otherKey === key) continue;

    const distance = editDistance(key, otherKey);
    const limit = Math.max(1, Math.floor(Math.max(key.length, otherKey.length) / 3));
    if (distance > limit) continue;
    if (!best || distance < best.distance) best = { name: other.name, distance };
  }

  return best?.name ?? null;
}

/** レーベンシュタイン距離。候補提案にしか使わないので素朴な実装で十分（名前は高々数十文字） */
export function editDistance(a: string, b: string): number {
  const source = [...a];
  const target = [...b];
  let previous = Array.from({ length: target.length + 1 }, (_, i) => i);

  for (let i = 1; i <= source.length; i++) {
    const current = [i];
    for (let j = 1; j <= target.length; j++) {
      const cost = source[i - 1] === target[j - 1] ? 0 : 1;
      current.push(Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + cost));
    }
    previous = current;
  }
  return previous[target.length]!;
}

const indexesOf = (flags: readonly boolean[], value: boolean): number[] =>
  flags.flatMap((flag, index) => (flag === value ? [index] : []));
