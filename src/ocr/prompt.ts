import { PLAYER_COUNT } from "./schema.ts";

/**
 * MK8DX 最終リザルト画面（CONGRATULATIONS! 画面）用の OCR プロンプト。
 *
 * 参照実装 (mk8dx-auto-aggregation) のプロンプトは「レースごとの結果画面」向けで、
 * "positions 1..12 with no duplicates and no gaps" を要求している。
 * 最終リザルト画面では同着により順位が重複・欠番するため、この指示は有害。
 * 本プロンプトでは順位を一切読ませない。
 *
 * 詳細は docs/design.md §4
 */
export const OCR_PROMPT = [
  "You are reading the FINAL RESULTS screen of Mario Kart 8 Deluxe (the screen with the",
  '"CONGRATULATIONS!" banner and a trophy). It lists exactly 12 players in a single column',
  "on the left half of the image.",
  "",
  "For each of the 12 rows, from TOP to BOTTOM in display order, extract exactly two things:",
  "  1. name  — the player's Mii name (the text next to the character icon)",
  "  2. score — the number at the RIGHT EDGE of that row (the player's total points)",
  "",
  "CRITICAL RULES:",
  `- Return exactly ${PLAYER_COUNT} entries, in top-to-bottom display order. Never skip a row.`,
  "- DO NOT read or return the rank number on the left edge. It is irrelevant.",
  "- Two players may have the same Mii name, and two players may have the same score.",
  "  Duplicates are allowed and must both be returned.",
  "",
  "READING THE NAMES:",
  "- Mii names may contain hiragana (ひらがな), katakana (カタカナ), kanji, Latin letters,",
  "  digits, and symbols such as ★ ☆ ♪ ♥ ● ■ * ! ！.",
  "- Names may mix scripts freely (e.g. \"Cafe☆とどーる\", \"Aまいか\", \"イカ3かん！\").",
  "- Reproduce the name EXACTLY as displayed, including symbols and full-width vs half-width",
  "  characters. Do not translate, transliterate, normalize, or trim anything.",
  "- Distinguish carefully between similar characters: ソ/ン, シ/ツ, カ/力, ー/一, ロ/口,",
  "  and between hiragana and katakana forms of the same sound (も vs モ, い vs イ).",
  "",
  "READING THE SCORES:",
  "- Scores use a stylized angular font. Take care with 1/7, 3/8, 5/6, 0/8.",
  "- A score is typically between 20 and 180.",
  "",
  "VISUAL CONDITIONS TO EXPECT:",
  "- The top row may be highlighted with a bright yellow background and dark text",
  "  (this marks the local player). It is a normal row — read it the same way.",
  "- The other rows are semi-transparent, so the racetrack background shows through.",
  "  Depending on the course this background can be very bright, making white text",
  "  low-contrast. Read those rows carefully; do not skip or guess them.",
  "- The right half of the image is a decorative trophy. Ignore it entirely.",
].join("\n");
