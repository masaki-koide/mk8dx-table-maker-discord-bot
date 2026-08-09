/**
 * 実画像を OCR にかけて、Discord に投稿される本文をそのまま表示する。
 *
 * 実行:  node --env-file=.env scripts/preview.ts test/fixtures/sample-02.jpg Cafe S M も
 */
import { readFile } from "node:fs/promises";
import { formatMessage } from "../src/discord/message.ts";
import { extractResults } from "../src/ocr/gemini.ts";
import { buildReport } from "../src/table/report.ts";

const [imagePath, ...tags] = process.argv.slice(2);
if (!imagePath || tags.length < 2) {
  console.error("usage: preview.ts <image> <tag1> <tag2> [tag3...]");
  process.exit(2);
}

const data = new Uint8Array(await readFile(imagePath));
const mimeType = imagePath.endsWith(".png") ? "image/png" : "image/jpeg";

const started = Date.now();
const { result } = await extractResults({ data, mimeType });
const report = buildReport(result.players, tags);

console.log(`--- ${imagePath}  tags=[${tags.join(", ")}]  ${Date.now() - started}ms ---\n`);
console.log(formatMessage(report));
