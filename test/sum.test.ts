import { expect, test } from "bun:test";
import type { ParsedPlayer } from "../src/table/parse.ts";
import { buildSumReport, sumKey } from "../src/table/sum.ts";
import expected01 from "./fixtures/sample-01.expected.json" with { type: "json" };
import expected02 from "./fixtures/sample-02.expected.json" with { type: "json" };

const mogi01: ParsedPlayer[] = expected01.players.map((p) => ({ ...p }));
const mogi02: ParsedPlayer[] = expected02.players.map((p) => ({ ...p }));

/** 同じ面子・別の点数配分の模擬を作る（点の割り当てを逆順にするので合計 984 は保たれる） */
const rotated = (players: readonly ParsedPlayer[]): ParsedPlayer[] =>
  players.map((p, i) => ({ name: p.name, score: players[players.length - 1 - i]!.score }));

const rename = (players: readonly ParsedPlayer[], from: string, to: string): ParsedPlayer[] =>
  players.map((p) => (p.name === from ? { ...p, score: p.score, name: to } : { ...p }));

test("2模擬をまとめて 名前 点|点 を出す", () => {
  const report = buildSumReport([mogi01, rotated(mogi01)]);

  expect(report.warnings).toEqual([]);
  expect(report.clean).toBe(true);
  expect(report.headlines).toEqual([
    "✅ 1模擬目: 984点 (12レース)",
    "✅ 2模擬目: 984点 (12レース)",
  ]);
  expect(report.table.split("\n")[0]).toBe("ラッパーひろし 133|52");
  expect(report.table.split("\n").at(-1)).toBe("イカいっかん 52|133");
  expect(report.table.endsWith("\n")).toBe(false);
});

test("全行が必ず模擬数と同じセグメントを持つ（欠場は 0 埋め）", () => {
  const shortHanded = mogi01.slice(0, 11);
  const report = buildSumReport([mogi01, shortHanded, mogi01]);

  expect(report.rows.every((row) => row.scores.length === 3)).toBe(true);
  expect(report.table).toContain("イカいっかん 52|0|52");
});

test("空白の有無だけが違う名前は同一人物に畳み、最初に出現した表記で出す", () => {
  const report = buildSumReport([mogi02, rename(mogi02, "S ぴ", "Sぴ")]);

  expect(report.rows).toHaveLength(12);
  expect(report.table).toContain("S ぴ 64|64");
  expect(report.table).not.toContain("Sぴ 0|64");
  expect(report.warnings).toEqual([]);
});

test("誤読で人が割れたら、通算人数と近い候補で気づかせる", () => {
  const report = buildSumReport([mogi01, rename(mogi01, "いもすけりん", "いもすけリん")]);

  expect(report.rows).toHaveLength(13);
  expect(report.warnings).toContain("通算13人います（期待: 12人）");
  expect(report.warnings).toContain(
    "「いもすけりん」は1模擬目にしかいません（近い候補: 「いもすけリん」— 同じ人ではありませんか？）",
  );
  expect(report.warnings).toContain(
    "「いもすけリん」は2模擬目にしかいません（近い候補: 「いもすけりん」— 同じ人ではありませんか？）",
  );
  // 警告が出ても表は必ず出力する
  expect(report.table).toContain("いもすけりん 97|0");
  expect(report.table).toContain("いもすけリん 0|97");
});

test("同名が複数いる場合は出現順に対応させ、行数を保つ", () => {
  const report = buildSumReport([
    [
      { name: "M", score: 89 },
      { name: "M", score: 72 },
    ],
    [
      { name: "M", score: 60 },
      { name: "M", score: 50 },
    ],
  ]);

  expect(report.table).toBe(["M 89|60", "M 72|50"].join("\n"));
  expect(report.warnings).toContain(
    "「M」が同名で2人います。1模擬目からの出現順で対応させました",
  );
});

test("模擬ごとにレース数が違ってもよい", () => {
  const sixRaces: ParsedPlayer[] = mogi01.map((p) => ({ name: p.name, score: 41 })); // 41*12 = 492
  const report = buildSumReport([mogi01, sixRaces]);

  expect(report.headlines).toEqual([
    "✅ 1模擬目: 984点 (12レース)",
    "✅ 2模擬目: 492点 (6レース)",
  ]);
  expect(report.warnings).toEqual([]);
});

test("検算NGの模擬は ✅ に出ず、何模擬目かを警告する", () => {
  const broken = mogi01.map((p, i) => (i === 0 ? { ...p, score: p.score - 3 } : { ...p }));
  const report = buildSumReport([mogi01, broken]);

  expect(report.headlines).toEqual(["✅ 1模擬目: 984点 (12レース)"]);
  expect(report.warnings).toContain("2模擬目の合計点が不正です。981点(期待値: 984点)");
});

test("模擬ごとの人数が12人でなければ警告する", () => {
  const report = buildSumReport([mogi01, mogi01.slice(0, 11)]);
  expect(report.warnings).toContain("2模擬目は11人です（期待: 12人）");
});

test("照合キーは NFKC・大小文字・空白だけを畳む（かな↔カナは畳まない）", () => {
  expect(sumKey("Ｓ ぴ")).toBe(sumKey("sぴ"));
  expect(sumKey("イカ")).not.toBe(sumKey("いか"));
});
