import { PLAYER_COUNT } from "./schema.ts";

/**
 * MK8DX 最終リザルト画面用の OCR プロンプト。
 *
 * 画面上部のバナーは `CONGRATULATIONS!` とは限らない（`NICE TRY!` など成績で変わる）ため、
 * 特定の文字列を画面の目印にしてはいけない。同様に、黄色ハイライトは 1 位ではなく
 * **自分の行**を指すので、最上段にあるとは限らない（サンプル3では 11 行目）。
 *
 * 参照実装 (mk8dx-auto-aggregation) のプロンプトは「レースごとの結果画面」向けで、
 * "positions 1..12 with no duplicates and no gaps" を要求している。
 * 最終リザルト画面では同着により順位が重複・欠番するため、この指示は有害。
 * 本プロンプトでは順位を一切読ませない。
 *
 * 詳細は docs/design.md §4
 */
export const OCR_PROMPT = [
  "You are reading the FINAL RESULTS screen of Mario Kart 8 Deluxe. It lists exactly 12",
  "players in a single column on the left half of the image, each row showing a rank number,",
  "a character icon, a Mii name, and a total score.",
  "",
  "The banner at the top varies with the local player's placement — it may read",
  '"CONGRATULATIONS!", "NICE TRY!", or something else. Ignore it; it is not a landmark.',
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
  "- Names may contain spaces and apostrophes (e.g. \"NOT FOR ME\", \"cp is cool\", \"X's\", \"M む\").",
  "  Preserve them exactly; a space inside a name is part of the name.",
  "- Watch for dakuten ゛ and handakuten ゜: ば vs ぱ, び vs ぴ, ほ vs ぼ vs ぽ.",
  "  The handakuten is a small CIRCLE; the dakuten is two short strokes.",
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
  "- ONE row may be highlighted with a bright yellow background and dark text. This marks",
  "  the LOCAL PLAYER, not the winner, so it can be at ANY position — top, middle or bottom.",
  "  It is a normal row: read its name and score the same way, and keep it in place.",
  "- The other rows are semi-transparent, so the racetrack background shows through.",
  "  Depending on the course this background can be very bright, making white text",
  "  low-contrast. Read those rows carefully; do not skip or guess them.",
  "- The right half of the image is decorative artwork (a trophy, a character, scenery).",
  "  Ignore it entirely.",
].join("\n");
