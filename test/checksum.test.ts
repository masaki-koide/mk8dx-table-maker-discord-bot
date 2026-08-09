import { expect, test } from "bun:test";
import { verifyTotal, VALID_TOTALS } from "../src/table/checksum.ts";

test("有効な合計はレース数つきで通る", () => {
  expect(verifyTotal(984)).toEqual({ ok: true, total: 984, raceCount: 12 });
  expect(verifyTotal(656)).toEqual({ ok: true, total: 656, raceCount: 8 });
  expect(verifyTotal(492)).toEqual({ ok: true, total: 492, raceCount: 6 });
  expect(verifyTotal(328)).toEqual({ ok: true, total: 328, raceCount: 4 });
});

test("10レース(820点)は有効値ではない", () => {
  expect(VALID_TOTALS).not.toContain(820 as never);
  expect(verifyTotal(820).ok).toBe(false);
});

test("不正な合計には最も近い有効値を返す", () => {
  expect(verifyTotal(981)).toEqual({ ok: false, total: 981, expected: 984 });
  expect(verifyTotal(660)).toEqual({ ok: false, total: 660, expected: 656 });
  expect(verifyTotal(500)).toEqual({ ok: false, total: 500, expected: 492 });
});

test("同距離のときは大きい方に寄せる", () => {
  // 328 / 492 の中間
  expect(verifyTotal(410)).toEqual({ ok: false, total: 410, expected: 492 });
  // 492 / 656 の中間
  expect(verifyTotal(574)).toEqual({ ok: false, total: 574, expected: 656 });
  // 656 / 984 の中間（10レース廃止でここがタイになった）
  expect(verifyTotal(820)).toEqual({ ok: false, total: 820, expected: 984 });
});

test("範囲外は下限・上限にクリップされる", () => {
  expect(verifyTotal(0)).toEqual({ ok: false, total: 0, expected: 328 });
  expect(verifyTotal(40)).toEqual({ ok: false, total: 40, expected: 328 });
  expect(verifyTotal(5000)).toEqual({ ok: false, total: 5000, expected: 984 });
});
