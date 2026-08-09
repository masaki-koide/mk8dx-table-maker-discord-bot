/**
 * OCR 検証スクリプト（docs/design.md §12）
 *
 * サンプル画像を N 回ずつ読み取り、次の 2 つを測る:
 *   1. 安定性 — 同じ画像で毎回同じ結果が返るか（LLM-OCR の最大のリスク）
 *   2. 正確性 — 手動でラベル付けした正解と一致するか
 *
 * 実行:  node --env-file=.env scripts/verify-ocr.ts [--runs 5] [--model <name>] [--thinking <n>]
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { extractResults, DEFAULT_MODEL } from "../src/ocr/gemini.ts";
import type { OcrPlayer } from "../src/ocr/schema.ts";

const FIXTURES_DIR = path.join(import.meta.dirname, "..", "test", "fixtures");

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const RUNS = Number(arg("runs", "5"));
const MODEL = arg("model", process.env.GEMINI_MODEL ?? DEFAULT_MODEL);
const THINKING = Number(arg("thinking", "0"));

const key = (players: OcrPlayer[]) => players.map((p) => `${p.name}\t${p.score}`).join("\n");

type Fixture = {
  name: string;
  imagePath: string;
  expected: { players: OcrPlayer[]; total: number; note?: string };
};

async function loadFixtures(): Promise<Fixture[]> {
  const files = (await readdir(FIXTURES_DIR)).filter((f) => f.endsWith(".expected.json")).sort();
  return Promise.all(
    files.map(async (f) => {
      const name = f.replace(".expected.json", "");
      return {
        name,
        imagePath: path.join(FIXTURES_DIR, `${name}.jpg`),
        expected: JSON.parse(await readFile(path.join(FIXTURES_DIR, f), "utf8")),
      };
    }),
  );
}

function diff(expected: OcrPlayer[], actual: OcrPlayer[]): string[] {
  const out: string[] = [];
  if (expected.length !== actual.length) {
    out.push(`行数が違う: 期待 ${expected.length} / 実際 ${actual.length}`);
  }
  for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
    const e = expected[i];
    const a = actual[i];
    if (!e || !a) {
      out.push(`  行${i + 1}: ${e ? `欠落 (期待 ${e.name} ${e.score})` : `余分 (${a!.name} ${a!.score})`}`);
      continue;
    }
    if (e.name !== a.name) out.push(`  行${i + 1} 名前: 期待「${e.name}」/ 実際「${a.name}」`);
    if (e.score !== a.score) out.push(`  行${i + 1} 点数: 期待 ${e.score} / 実際 ${a.score}`);
  }
  return out;
}

const fixtures = await loadFixtures();
console.log(`model=${MODEL}  temperature=0  thinkingBudget=${THINKING}  runs=${RUNS}\n`);

let allStable = true;
let allAccurate = true;
let totalIn = 0;
let totalOut = 0;

for (const fixture of fixtures) {
  console.log(`━━━ ${fixture.name} ━━━  ${fixture.expected.note ?? ""}`);
  const data = new Uint8Array(await readFile(fixture.imagePath));
  const observed = new Map<string, number>();
  let firstFailure: string[] | null = null;

  for (let run = 1; run <= RUNS; run++) {
    const started = Date.now();
    try {
      const { result, usage } = await extractResults(
        { data, mimeType: "image/jpeg" },
        { model: MODEL, thinkingBudget: THINKING },
      );
      totalIn += usage?.input ?? 0;
      totalOut += usage?.output ?? 0;

      const k = key(result.players);
      observed.set(k, (observed.get(k) ?? 0) + 1);

      const sum = result.players.reduce((acc, p) => acc + p.score, 0);
      const problems = diff(fixture.expected.players, result.players);
      if (problems.length && !firstFailure) firstFailure = problems;

      console.log(
        `  run ${run}: ${problems.length === 0 ? "✅ 一致" : `❌ ${problems.length}件の差異`}` +
          `  合計=${sum}${sum === fixture.expected.total ? "" : ` (期待 ${fixture.expected.total})`}` +
          `  ${Date.now() - started}ms`,
      );
    } catch (error) {
      allStable = false;
      allAccurate = false;
      console.log(`  run ${run}: 💥 ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const stable = observed.size === 1;
  const accurate = observed.size === 1 && observed.has(key(fixture.expected.players));
  allStable &&= stable;
  allAccurate &&= accurate;

  console.log(`  安定性: ${stable ? "✅ 全runで同一" : `❌ ${observed.size}種類の異なる結果`}`);
  if (firstFailure) {
    console.log(`  正解との差異:`);
    for (const line of firstFailure) console.log(`  ${line}`);
  }
  console.log();
}

// 概算コスト: gemini-2.5-flash-lite は入力 $0.10 / 出力 $0.40 per 1M tokens 前後（要確認）
const calls = fixtures.length * RUNS;
const usd = (totalIn / 1e6) * 0.1 + (totalOut / 1e6) * 0.4;
console.log(
  `トークン: in=${totalIn} out=${totalOut} (${calls}回)  ` +
    `概算 $${usd.toFixed(5)} = 1回あたり $${(usd / calls).toFixed(6)}`,
);
console.log(`\n判定: 安定性 ${allStable ? "✅" : "❌"} / 正確性 ${allAccurate ? "✅" : "❌"}`);
process.exit(allStable && allAccurate ? 0 : 1);
