import { expect, test } from "bun:test";
import { PendingSums } from "../src/discord/pending.ts";

const clock = () => {
  let t = 0;
  return { now: () => t, advance: (ms: number) => (t += ms) };
};

test("追加した順に取り出し、取り出したら空になる", () => {
  const pending = new PendingSums({}, () => 0);
  expect(pending.add("u1", "A")).toEqual({ ok: true, count: 1 });
  expect(pending.add("u1", "B")).toEqual({ ok: true, count: 2 });

  expect(pending.take("u1")).toEqual(["A", "B"]);
  expect(pending.count("u1")).toBe(0);
});

test("ユーザーごとに独立している", () => {
  const pending = new PendingSums({}, () => 0);
  pending.add("u1", "A");
  pending.add("u2", "X");
  expect(pending.take("u1")).toEqual(["A"]);
  expect(pending.take("u2")).toEqual(["X"]);
});

test("上限を超えたら拒否する（溜まっている分は壊さない）", () => {
  const pending = new PendingSums({ max: 2 }, () => 0);
  pending.add("u1", "A");
  pending.add("u1", "B");

  const rejected = pending.add("u1", "C");
  expect(rejected.ok).toBe(false);
  expect(pending.take("u1")).toEqual(["A", "B"]);
});

test("undo は最後の1件を消し、残り件数を返す", () => {
  const pending = new PendingSums({}, () => 0);
  pending.add("u1", "A");
  pending.add("u1", "B");

  expect(pending.undo("u1")).toBe(1);
  expect(pending.undo("u1")).toBe(0);
  expect(pending.undo("u1")).toBe(0); // 空でも壊れない
  expect(pending.take("u1")).toEqual([]);
});

test("最後の追加から TTL が過ぎたら捨てる", () => {
  const time = clock();
  const pending = new PendingSums({ ttlMs: 1000 }, time.now);

  pending.add("u1", "A");
  time.advance(999);
  pending.add("u1", "B"); // 触ると TTL が延びる
  time.advance(999);
  expect(pending.count("u1")).toBe(2);

  time.advance(1);
  expect(pending.count("u1")).toBe(0);
});

test("take が返す配列を書き換えても内部状態に影響しない", () => {
  const pending = new PendingSums({}, () => 0);
  pending.add("u1", "A");
  const taken = pending.take("u1");
  taken.push("B");
  expect(pending.count("u1")).toBe(0);
});
