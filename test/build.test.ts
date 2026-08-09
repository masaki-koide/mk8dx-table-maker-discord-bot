import { expect, test } from "bun:test";
import { buildTable } from "../src/table/build.ts";
import { assignTeams } from "../src/table/match.ts";
import { buildReport } from "../src/table/report.ts";
import expected02 from "./fixtures/sample-02.expected.json" with { type: "json" };
import expected01 from "./fixtures/sample-01.expected.json" with { type: "json" };

const table = (players: { name: string; score: number }[], tags: string[]) =>
  buildTable(assignTeams(players, tags), tags);

test("実サンプル2から gb2 テキストを生成する", () => {
  expect(table(expected02.players, expected02.tags)).toBe(
    [
      "Cafe",
      "Cafe☆とどーる 111",
      "Cafe☆コメタ 85",
      "Cafe☆スダハ 76",
      "",
      "S",
      "SPYAIR♪ 93",
      "SS★Turbo 91",
      "S ぴ 64",
      "",
      "M",
      "M む 89",
      "M 89",
      "M★ 72",
      "",
      "も",
      "もりま 79",
      "ももやのごはんですよ 72",
      "もも 63",
    ].join("\n"),
  );
});

test("ブロック順は引数の順に従う", () => {
  const reordered = table(expected02.players, ["も", "M", "S", "Cafe"]);
  expect(reordered.split("\n\n").map((b) => b.split("\n")[0])).toEqual(["も", "M", "S", "Cafe"]);
});

test("末尾に余分な改行を付けない", () => {
  const text = table(expected01.players, expected01.tags);
  expect(text.endsWith("\n")).toBe(false);
  expect(text).toContain("イカいっかん 52");
});

test("未分類プレイヤーは末尾のブロックに出す（省略しない）", () => {
  const text = table(
    [
      { name: "Aたろう", score: 100 },
      { name: "謎の人", score: 50 },
    ],
    ["A"],
  );
  expect(text).toBe(["A", "Aたろう 100", "", "(未分類)", "謎の人 50"].join("\n"));
});

test("1人も一致しないタグのブロックは出さない", () => {
  expect(table([{ name: "Aたろう", score: 100 }], ["A", "B"])).toBe("A\nAたろう 100");
});

test("実サンプル2のレポートは警告なしで通る", () => {
  const report = buildReport(expected02.players, expected02.tags);
  expect(report.warnings).toEqual([]);
  expect(report.clean).toBe(true);
  expect(report.headline).toBe("✅ 合計 984点 (12レース) / 4チーム — 検算OK");
});

test("検算・未一致・人数の偏りをすべて警告する", () => {
  const players = expected02.players.map((p) => ({ ...p }));
  players[1] = { name: "謎の人", score: 90 }; // S チームから1人減らし、合計を 981 にする
  const report = buildReport(players, expected02.tags);

  expect(report.clean).toBe(false);
  expect(report.warnings).toContain("合計点が不正です。981点(期待値: 984点)");
  expect(report.warnings).toContain("「謎の人」はどのタグにも一致しませんでした");
  expect(report.warnings.some((w) => w.startsWith("チーム人数が揃っていません"))).toBe(true);
  // 警告が出ても表は必ず出力する
  expect(report.table).toContain("謎の人 90");
});

test("読み取れた人数が12人でなければ警告する", () => {
  const report = buildReport(expected02.players.slice(0, 11), expected02.tags);
  expect(report.warnings).toContain("11人しか読み取れませんでした（期待: 12人）");
});
