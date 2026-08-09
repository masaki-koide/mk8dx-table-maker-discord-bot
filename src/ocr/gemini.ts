import { GoogleGenAI } from "@google/genai";
import { OCR_PROMPT } from "./prompt.ts";
import { assertOcrResult, OCR_RESPONSE_SCHEMA, type OcrResult } from "./schema.ts";

export const DEFAULT_MODEL = "gemini-2.5-flash-lite";

/** Vision API 呼び出しのタイムアウト（ミリ秒） */
const TIMEOUT_MS = 30_000;

export type OcrOptions = {
  model?: string;
  /**
   * thinking トークンの上限。
   * 0 = 思考なし（最速・最安・最も決定的）。精度が足りない場合の逃げ道として引き上げる。
   */
  thinkingBudget?: number;
};

export type OcrRun = {
  result: OcrResult;
  raw: string;
  usage?: { input?: number; output?: number; total?: number };
};

/**
 * 最終リザルト画面の画像から 12 人分の名前と累計点を読み取る。
 *
 * 画像は前処理せずそのまま送る（crop / コントラスト補正はしない）。
 * 理由は docs/design.md §9.2
 */
export async function extractResults(
  image: { data: Uint8Array; mimeType: string },
  options: OcrOptions = {},
): Promise<OcrRun> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const ai = new GoogleGenAI({ apiKey });
  const model = options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          { text: OCR_PROMPT },
          {
            inlineData: {
              mimeType: image.mimeType,
              data: Buffer.from(image.data).toString("base64"),
            },
          },
        ],
      },
    ],
    config: {
      // 再現性のため 0 に固定する。LLM-OCR の最大のリスクは
      // 「読めない」ことではなく「毎回違う答えを返す」こと。
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: OCR_RESPONSE_SCHEMA,
      thinkingConfig: { thinkingBudget: options.thinkingBudget ?? 0 },
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    },
  });

  const raw = response.text;
  if (!raw) throw new Error("Gemini returned an empty response");

  // Structured Output を使っているので JSON の正規表現サルベージは不要
  const result = assertOcrResult(JSON.parse(raw));

  return {
    result,
    raw,
    usage: {
      input: response.usageMetadata?.promptTokenCount,
      output: response.usageMetadata?.candidatesTokenCount,
      total: response.usageMetadata?.totalTokenCount,
    },
  };
}
