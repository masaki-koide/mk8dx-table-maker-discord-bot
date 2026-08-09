import { expect, test } from "bun:test";
import { assignTeams, collidingTags, matchTag, suggestTag } from "../src/table/match.ts";

test("前方一致（実サンプル1のタグ）", () => {
  const tags = ["ラッパー", "いもすけ", "J", "イカ"];
  expect(matchTag("ラッパーひろし", tags)).toBe("ラッパー");
  expect(matchTag("いもすけうらぎりもの", tags)).toBe("いもすけ");
  expect(matchTag("Jちゃーはん", tags)).toBe("J");
  expect(matchTag("イカ3かん！", tags)).toBe("イカ");
});

test("後方一致", () => {
  const tags = ["A", "スペシャル"];
  expect(matchTag("たかしスペシャル", tags)).toBe("スペシャル");
  expect(matchTag("いもすけスペシャル", tags)).toBe("スペシャル");
});

test("最長タグが勝つ：短い前方タグに吸われない", () => {
  // 「後方一致を常に優先」でも正解するケース
  expect(matchTag("Aスペシャル", ["A", "スペシャル"])).toBe("スペシャル");
});

test("最長タグが勝つ：短い後方タグに吸われない", () => {
  // 「後方一致を常に優先」だと `あ` に吸われて壊れるケース。
  // このテストが後方一致優先を採用しなかった理由そのもの。
  expect(matchTag("ラッパーみあ", ["ラッパー", "あ"])).toBe("ラッパー");
});

test("同じ長さで競合したら後方一致が勝つ", () => {
  expect(matchTag("AほげB", ["A", "B"])).toBe("B");
});

test("タグ同士が包含関係でも最長が勝つ", () => {
  expect(matchTag("SS★Turbo", ["S", "SS"])).toBe("SS");
  expect(matchTag("SPYAIR♪", ["S", "SS"])).toBe("S");
});

test("タグは完全でなくてよい（識別できる部分で足りる）", () => {
  // ☆ を打たずに Cafe だけで一致する
  expect(matchTag("Cafe☆とどーる", ["Cafe", "S", "M", "も"])).toBe("Cafe");
});

test("名前がタグそのものと同一（実サンプル2の `M`）", () => {
  expect(matchTag("M", ["Cafe", "S", "M", "も"])).toBe("M");
});

test("照合時のみ NFKC + 小文字化する", () => {
  expect(matchTag("Ｍむ", ["M"])).toBe("M");
  expect(matchTag("cafe☆とどーる", ["Cafe"])).toBe("Cafe");
});

test("ひらがな↔カタカナは畳み込まない", () => {
  expect(matchTag("イカルド", ["いか"])).toBeNull();
});

test("一致しなければ null", () => {
  expect(matchTag("もりま", ["Cafe", "S", "M"])).toBeNull();
  expect(matchTag("なにか", [])).toBeNull();
  expect(matchTag("なにか", ["", "  "])).toBeNull();
});

test("未一致のときだけ、かな畳み込みで候補を提案する", () => {
  expect(suggestTag("イカルド", ["いか", "J"])).toBe("いか");
  expect(suggestTag("まったく別", ["いか", "J"])).toBeNull();
});

test("正規化後に衝突するタグを検出する", () => {
  expect(collidingTags(["M", "Ｍ", "S"])).toEqual([["M", "Ｍ"]]);
  expect(collidingTags(["M", "S"])).toEqual([]);
});

test("実サンプル1が全員正しく分類される", () => {
  const tags = ["ラッパー", "いもすけ", "J", "イカ"];
  const names = [
    "ラッパーひろし", "ラッパー☆ヤミラミ", "いもすけりん", "J",
    "Jちゃーはん", "Jやなさま", "イカルド", "いもすけ",
    "いもすけうらぎりもの", "ラッパーたかし*", "イカ3かん！", "イカいっかん",
  ];
  const assigned = assignTeams(names.map((name) => ({ name, score: 0 })), tags);
  expect(assigned.filter((p) => p.tag === null)).toEqual([]);
  for (const tag of tags) {
    expect(assigned.filter((p) => p.tag === tag)).toHaveLength(3);
  }
});

test("実サンプル2が全員正しく分類される", () => {
  const tags = ["Cafe", "S", "M", "も"];
  const names = [
    "Cafe☆とどーる", "SPYAIR♪", "SS★Turbo", "M む",
    "M", "Cafe☆コメタ", "もりま", "Cafe☆スダハ",
    "M★", "ももやのごはんですよ", "S ぴ", "もも",
  ];
  const assigned = assignTeams(names.map((name) => ({ name, score: 0 })), tags);
  expect(assigned.filter((p) => p.tag === null)).toEqual([]);
  for (const tag of tags) {
    expect(assigned.filter((p) => p.tag === tag)).toHaveLength(3);
  }
});
