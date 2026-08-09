/**
 * `/sum` の集計待ちバッファ（docs/design.md §16.2）。
 *
 * モーダルに n 模擬分を貼る案は、**クリップボードが 1 つしか保持できない**ため
 * n ≥ 2 で成立しなかった。代わりにメッセージのコンテキストメニューで 1 件ずつ溜める。
 *
 * `RateLimiter` と同じくプロセス内に持つ。デプロイ・再起動で消えるが、
 * 追加のたびに件数を ephemeral で返すので**消えたことにその場で気づける**し、
 * 押し直すコストも低い。永続ストアを入れる理由にはならないと判断している。
 */

import { MAX_MOGI } from "../table/sum.ts";

/** 最後の追加からこの時間が経ったバッファは捨てる */
export const PENDING_TTL_MS = 60 * 60 * 1000;

export type AddResult =
  | { ok: true; count: number }
  | { ok: false; reason: string };

type Bucket = { texts: string[]; updatedAt: number };

export class PendingSums {
  private readonly byUser = new Map<string, Bucket>();
  private readonly max: number;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(
    options: { max?: number; ttlMs?: number } = {},
    now: () => number = Date.now,
  ) {
    this.max = options.max ?? MAX_MOGI;
    this.ttlMs = options.ttlMs ?? PENDING_TTL_MS;
    this.now = now;
  }

  add(userId: string, text: string): AddResult {
    const texts = this.live(userId);
    if (texts.length >= this.max) {
      return { ok: false, reason: `一度に集計できるのは${this.max}模擬までです` };
    }
    texts.push(text);
    this.byUser.set(userId, { texts, updatedAt: this.now() });
    return { ok: true, count: texts.length };
  }

  /** 最後に追加した 1 件を取り消し、残り件数を返す */
  undo(userId: string): number {
    const texts = this.live(userId);
    texts.pop();
    if (texts.length === 0) {
      this.byUser.delete(userId);
      return 0;
    }
    this.byUser.set(userId, { texts, updatedAt: this.now() });
    return texts.length;
  }

  count(userId: string): number {
    return this.live(userId).length;
  }

  /** 溜まっているものを取り出して**空にする** */
  take(userId: string): string[] {
    const texts = this.live(userId);
    this.byUser.delete(userId);
    return texts;
  }

  /** TTL 切れを捨てたうえで、そのユーザーの配列（コピー）を返す */
  private live(userId: string): string[] {
    const bucket = this.byUser.get(userId);
    if (!bucket) return [];
    if (this.now() - bucket.updatedAt >= this.ttlMs) {
      this.byUser.delete(userId);
      return [];
    }
    return [...bucket.texts];
  }
}
