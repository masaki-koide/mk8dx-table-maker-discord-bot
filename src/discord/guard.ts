/**
 * Gemini を呼ぶ **前** に弾くためのガード（docs/design.md §8）。
 * ここを通過した呼び出しだけが課金対象の処理に進む。
 */

export type Verdict = { ok: true } | { ok: false; reason: string };

const OK: Verdict = { ok: true };

/** 添付画像の上限サイズ（バイト） */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type AllowList = {
  /** 空 = このフィルタを使わない */
  guildIds: readonly string[];
  /** 空 = このフィルタを使わない */
  userIds: readonly string[];
};

/**
 * 空でないリストは「通過必須のフィルタ」として働く。
 * 例: guildIds だけ設定 → そのサーバー内なら誰でも可（身内サーバー運用）
 */
export function checkAllowed(
  allow: AllowList,
  actor: { guildId: string | null; userId: string },
): Verdict {
  if (allow.guildIds.length > 0 && (actor.guildId === null || !allow.guildIds.includes(actor.guildId))) {
    return { ok: false, reason: "このサーバーでは利用できません" };
  }
  if (allow.userIds.length > 0 && !allow.userIds.includes(actor.userId)) {
    return { ok: false, reason: "このユーザーは利用を許可されていません" };
  }
  return OK;
}

export type AttachmentLike = {
  contentType: string | null;
  size: number;
  name: string;
};

export function checkAttachment(attachment: AttachmentLike): Verdict {
  if (!attachment.contentType?.startsWith("image/")) {
    return { ok: false, reason: `画像ファイルを添付してください（受け取った形式: ${attachment.contentType ?? "不明"}）` };
  }
  if (attachment.size > MAX_IMAGE_BYTES) {
    const mb = (attachment.size / 1024 / 1024).toFixed(1);
    return { ok: false, reason: `画像が大きすぎます（${mb}MB / 上限 ${MAX_IMAGE_BYTES / 1024 / 1024}MB）` };
  }
  return OK;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * プロセス内レート制限。
 *
 * 常駐 Gateway 形態なので外部ストアは不要。再起動でリセットされて構わない
 * （目的は「気づかないうちに叩かれ続ける」ことの防止であり、厳密な課金制御ではない）。
 */
export class RateLimiter {
  private readonly perUser = new Map<string, number[]>();
  private global: number[] = [];
  private readonly limits: { perUserHour: number; globalDay: number };
  private readonly now: () => number;

  // Node のネイティブ型ストリップは parameter property を扱えないため、
  // フィールドは明示的に宣言する（tsconfig の erasableSyntaxOnly で強制している）
  constructor(limits: { perUserHour: number; globalDay: number }, now: () => number = Date.now) {
    this.limits = limits;
    this.now = now;
  }

  /** 通過できるなら記録して ok を返す。弾いた場合は何も記録しない。 */
  tryConsume(userId: string): Verdict {
    const t = this.now();
    this.global = this.global.filter((ts) => t - ts < DAY_MS);
    const mine = (this.perUser.get(userId) ?? []).filter((ts) => t - ts < HOUR_MS);

    if (mine.length >= this.limits.perUserHour) {
      this.perUser.set(userId, mine);
      return { ok: false, reason: `1時間あたりの実行回数の上限（${this.limits.perUserHour}回）に達しました` };
    }
    if (this.global.length >= this.limits.globalDay) {
      this.perUser.set(userId, mine);
      return { ok: false, reason: `本日の全体の実行回数の上限（${this.limits.globalDay}回）に達しました` };
    }

    mine.push(t);
    this.perUser.set(userId, mine);
    this.global.push(t);
    return OK;
  }
}
