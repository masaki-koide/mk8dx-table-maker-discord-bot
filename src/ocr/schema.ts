import { Type, type Schema } from "@google/genai";

/** MK8DX の 1 卓のプレイヤー数（最終リザルト画面は常に 12 行） */
export const PLAYER_COUNT = 12;

/**
 * OCR で読み取る 1 行分。
 *
 * 順位カラムは意図的に読まない:
 *   - gb2 への出力に不要（必要なのは名前と点のみ）
 *   - 同着で順位が重複・欠番するため、読ませると失敗モードが増える
 *     (例: 1,2,3,4,4,6,7,8,9,9,11,12)
 * 詳細は docs/design.md §4
 */
export type OcrPlayer = {
  /** Mii 名。OCR の生テキストをそのまま保持する（正規化しない） */
  name: string;
  /** 全レースの累計点 */
  score: number;
};

export type OcrResult = {
  /** 画面の表示順（上から）に 12 件 */
  players: OcrPlayer[];
};

/** Gemini の Structured Output に渡すスキーマ */
export const OCR_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    players: {
      type: Type.ARRAY,
      minItems: String(PLAYER_COUNT),
      maxItems: String(PLAYER_COUNT),
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: "The player's Mii name, exactly as displayed.",
          },
          score: {
            type: Type.INTEGER,
            description: "The total points shown on the right edge of the row.",
          },
        },
        required: ["name", "score"],
        propertyOrdering: ["name", "score"],
      },
    },
  },
  required: ["players"],
};

/** モデル出力が期待どおりの形かを検証する（スキーマ強制の取りこぼし対策） */
export function assertOcrResult(value: unknown): OcrResult {
  if (typeof value !== "object" || value === null || !Array.isArray((value as OcrResult).players)) {
    throw new Error("OCR response does not contain a players array");
  }
  const players = (value as OcrResult).players;
  for (const player of players) {
    if (typeof player?.name !== "string" || !Number.isInteger(player?.score)) {
      throw new Error(`OCR response contains a malformed row: ${JSON.stringify(player)}`);
    }
  }
  return { players };
}
