/** 1 レースの全順位の合計点（15+12+10+9+8+7+6+5+4+3+2+1） */
export const POINTS_PER_RACE = 82;

/**
 * 全プレイヤーの合計点として成立しうる値。
 * レース数はゲーム仕様上 4 / 6 / 8 / 12 に限られる（10 レースの卓は存在しない）。
 * 昇順であることを前提にしている。
 */
export const VALID_TOTALS = [328, 492, 656, 984] as const;

export type ChecksumResult =
  | { ok: true; total: number; raceCount: number }
  | { ok: false; total: number; expected: number };

/**
 * 合計点が成立しうる値かどうかを判定する。
 *
 * 不成立の場合は「最も近い有効値」を期待値として返す。
 * 同距離のとき（410 / 574 / 820）は**大きい方**を採用する。
 * 8 レースと 12 レースの間隔が広い（164 → 328）ため、この区間の期待値は外れやすい。
 * あくまで人間が誤読箇所を探す手がかりであり、断定ではない。
 */
export function verifyTotal(total: number): ChecksumResult {
  const raceCount = total / POINTS_PER_RACE;
  if ((VALID_TOTALS as readonly number[]).includes(total)) {
    return { ok: true, total, raceCount };
  }

  let expected: number = VALID_TOTALS[0];
  let best = Infinity;
  for (const candidate of VALID_TOTALS) {
    const distance = Math.abs(candidate - total);
    // <= にすることで、同距離なら後方（＝より大きい）候補が勝つ
    if (distance <= best) {
      best = distance;
      expected = candidate;
    }
  }
  return { ok: false, total, expected };
}

/** 合計点からレース数を求める（検算が通っている場合のみ意味を持つ） */
export function raceCountOf(total: number): number {
  return total / POINTS_PER_RACE;
}
