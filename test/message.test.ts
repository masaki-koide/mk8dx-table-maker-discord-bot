import { expect, test } from "bun:test";
import { collectTags } from "../src/discord/handler.ts";
import { formatMessage } from "../src/discord/message.ts";
import { buildReport } from "../src/table/report.ts";
import expected02 from "./fixtures/sample-02.expected.json" with { type: "json" };

test("警告なしのときは要約行 + コードブロック", () => {
  const message = formatMessage(buildReport(expected02.players, expected02.tags));
  expect(message).toBe(
    [
      "✅ 合計 984点 (12レース) / 4チーム — 検算OK",
      "",
      "```",
      buildReport(expected02.players, expected02.tags).table,
      "```",
    ].join("\n"),
  );
});

test("警告は ⚠️ 付きでコードブロックの前に出る", () => {
  const players = expected02.players.map((p) => ({ ...p }));
  players[1] = { name: "謎の人", score: 90 };
  const message = formatMessage(buildReport(players, expected02.tags));

  expect(message).toContain("⚠️ 合計点が不正です。981点(期待値: 984点)");
  expect(message.indexOf("⚠️")).toBeLessThan(message.indexOf("```"));
  // 検算NGなので ✅ の要約行は出ない
  expect(message).not.toContain("✅");
});

test("上限を超える場合は警告を削り、表は絶対に切らない", () => {
  const players = expected02.players.map((p, i) => ({ name: `未一致${i}`, score: p.score }));
  const report = buildReport(players, expected02.tags);
  expect(report.warnings.length).toBeGreaterThan(5);

  const limit = 400;
  const message = formatMessage(report, limit);
  expect(message.length).toBeLessThanOrEqual(limit);
  expect(message).toContain("件の警告");
  // 表本体は完全に残っている
  expect(message).toContain(report.table);
});

test("team1..team6 を宣言順に集め、空欄を落とす", () => {
  const given: Record<string, string | null> = {
    team1: "Cafe",
    team2: " S ",
    team3: null,
    team4: "M",
    team5: "  ",
    team6: "も",
  };
  expect(collectTags((name) => given[name] ?? null)).toEqual(["Cafe", "S", "M", "も"]);
});
