/** Discord のメッセージ本文の上限 */
export const MAX_MESSAGE_LENGTH = 2000;

/**
 * `/result` の `Report` と `/sum` の `SumReport` の共通部分。
 * `headlines` が配列なのは、`/sum` が模擬ごとに検算行を出すため（docs/design.md §16.5）。
 */
export type Formattable = {
  headlines: readonly string[];
  table: string;
  warnings: readonly string[];
};

/**
 * レポートを Discord の投稿本文に組み立てる。
 *
 * 表はコードブロックで囲む。名前に `*` `_` `~` が含まれると Markdown で装飾されて
 * 壊れるため（実サンプルに `ラッパーたかし*` が存在する）。
 *
 * 上限を超える場合は**警告側を削る**。表は人間が gb2 に貼る本体なので絶対に切らない。
 */
export function formatMessage(report: Formattable, limit = MAX_MESSAGE_LENGTH): string {
  const block = ["```", report.table, "```"].join("\n");
  const head = [...report.headlines];

  const compose = (warnings: string[]) =>
    [...head, ...warnings, ...(head.length || warnings.length ? [""] : []), block].join("\n");

  const warnings = report.warnings.map((w) => `⚠️ ${w}`);
  if (compose(warnings).length <= limit) return compose(warnings);

  // 1件ずつ削って収める
  for (let keep = warnings.length - 1; keep >= 0; keep--) {
    const trimmed = [...warnings.slice(0, keep), `⚠️ …他 ${warnings.length - keep} 件の警告`];
    const candidate = compose(trimmed);
    if (candidate.length <= limit) return candidate;
  }
  return compose([`⚠️ 警告 ${warnings.length} 件（長すぎるため省略）`]);
}
