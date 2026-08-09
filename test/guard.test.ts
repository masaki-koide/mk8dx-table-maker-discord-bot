import { expect, test } from "bun:test";
import {
  checkAllowed,
  checkAttachment,
  MAX_IMAGE_BYTES,
  RateLimiter,
} from "../src/discord/guard.ts";

const image = { contentType: "image/jpeg", size: 300_000, name: "s.jpg" };

test("guild allowlist だけ設定した場合、そのサーバーなら誰でも通る", () => {
  const allow = { guildIds: ["g1"], userIds: [] };
  expect(checkAllowed(allow, { guildId: "g1", userId: "誰でも" }).ok).toBe(true);
  expect(checkAllowed(allow, { guildId: "g2", userId: "誰でも" }).ok).toBe(false);
  // DM（guildId が null）も弾く
  expect(checkAllowed(allow, { guildId: null, userId: "誰でも" }).ok).toBe(false);
});

test("user allowlist だけ設定した場合、そのユーザーならどこでも通る", () => {
  const allow = { guildIds: [], userIds: ["u1"] };
  expect(checkAllowed(allow, { guildId: null, userId: "u1" }).ok).toBe(true);
  expect(checkAllowed(allow, { guildId: "g9", userId: "u2" }).ok).toBe(false);
});

test("両方設定した場合は両方を満たす必要がある", () => {
  const allow = { guildIds: ["g1"], userIds: ["u1"] };
  expect(checkAllowed(allow, { guildId: "g1", userId: "u1" }).ok).toBe(true);
  expect(checkAllowed(allow, { guildId: "g1", userId: "u2" }).ok).toBe(false);
  expect(checkAllowed(allow, { guildId: "g2", userId: "u1" }).ok).toBe(false);
});

test("画像以外の添付を弾く", () => {
  expect(checkAttachment(image).ok).toBe(true);
  expect(checkAttachment({ ...image, contentType: "application/pdf" }).ok).toBe(false);
  expect(checkAttachment({ ...image, contentType: null }).ok).toBe(false);
});

test("大きすぎる画像を弾く", () => {
  expect(checkAttachment({ ...image, size: MAX_IMAGE_BYTES }).ok).toBe(true);
  expect(checkAttachment({ ...image, size: MAX_IMAGE_BYTES + 1 }).ok).toBe(false);
});

test("ユーザーごとの時間あたり上限", () => {
  let now = 0;
  const limiter = new RateLimiter({ perUserHour: 2, globalDay: 100 }, () => now);

  expect(limiter.tryConsume("u1").ok).toBe(true);
  expect(limiter.tryConsume("u1").ok).toBe(true);
  expect(limiter.tryConsume("u1").ok).toBe(false);
  // 別のユーザーは影響を受けない
  expect(limiter.tryConsume("u2").ok).toBe(true);

  // 1時間経てば回復する
  now += 60 * 60 * 1000 + 1;
  expect(limiter.tryConsume("u1").ok).toBe(true);
});

test("全体の1日あたり上限", () => {
  let now = 0;
  const limiter = new RateLimiter({ perUserHour: 100, globalDay: 2 }, () => now);

  expect(limiter.tryConsume("u1").ok).toBe(true);
  expect(limiter.tryConsume("u2").ok).toBe(true);
  expect(limiter.tryConsume("u3").ok).toBe(false);

  now += 24 * 60 * 60 * 1000 + 1;
  expect(limiter.tryConsume("u3").ok).toBe(true);
});

test("弾かれた実行は枠を消費しない", () => {
  let now = 0;
  const limiter = new RateLimiter({ perUserHour: 100, globalDay: 1 }, () => now);

  expect(limiter.tryConsume("u1").ok).toBe(true);
  expect(limiter.tryConsume("u2").ok).toBe(false); // 全体上限で弾かれる
  expect(limiter.tryConsume("u2").ok).toBe(false);

  // u2 は1度も成功していないので、全体枠が空けば通る
  now += 24 * 60 * 60 * 1000 + 1;
  expect(limiter.tryConsume("u2").ok).toBe(true);
});
