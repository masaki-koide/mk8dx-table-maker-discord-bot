import { expect, test } from "bun:test";
import { parseResult } from "../src/table/parse.ts";

test("/result の投稿をそのままコピペしても選手行だけ拾う", () => {
  const pasted = [
    "✅ 合計 984点 (12レース) / 4チーム — 検算OK",
    "⚠️ 「謎の人」はどのタグにも一致しませんでした",
    "",
    "```",
    "Cafe",
    "Cafe☆とどーる 111",
    "Cafe☆コメタ 85",
    "",
    "S",
    "SPYAIR♪ 93",
    "",
    "(未分類)",
    "謎の人 90",
    "```",
  ].join("\n");

  expect(parseResult(pasted)).toEqual([
    { name: "Cafe☆とどーる", score: 111 },
    { name: "Cafe☆コメタ", score: 85 },
    { name: "SPYAIR♪", score: 93 },
    { name: "謎の人", score: 90 },
  ]);
});

test("名前の途中の空白は保つ", () => {
  expect(parseResult("S ぴ 64\nM む 89")).toEqual([
    { name: "S ぴ", score: 64 },
    { name: "M む", score: 89 },
  ]);
});

test("名前がタグそのものと同じでも選手行として読む", () => {
  expect(parseResult("M\nM 89")).toEqual([{ name: "M", score: 89 }]);
});

test("名前に数字が含まれていても点数だけを切り出す", () => {
  expect(parseResult("イカ3かん！ 61")).toEqual([{ name: "イカ3かん！", score: 61 }]);
});

test("全角数字・全角スペース・CRLF・行頭の余白を吸収する", () => {
  expect(parseResult("  ラッパーひろし　１３３  \r\nいもすけ 70\r\n")).toEqual([
    { name: "ラッパーひろし", score: 133 },
    { name: "いもすけ", score: 70 },
  ]);
});

test("見出し行と空行は落とす", () => {
  expect(parseResult("Cafe\n\n   \nも\n(未分類)")).toEqual([]);
});

test("既知の穴: タグが「空白 + 数字」で終わると選手行に化ける", () => {
  // 実タグは `ラッパー` / `Cafe☆` / `M` / `も` のような形なので受け入れる（§16.3）。
  // 合計点が狂うので §16.6 の検算が拾う。
  expect(parseResult("Team 1\nTeam 1あ 80")).toEqual([
    { name: "Team", score: 1 },
    { name: "Team 1あ", score: 80 },
  ]);
});
