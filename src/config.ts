import { DEFAULT_MODEL } from "./ocr/gemini.ts";

export type Config = {
  discordToken: string;
  applicationId: string;
  geminiApiKey: string;
  geminiModel: string;
  /** 空 = このフィルタを使わない */
  allowedGuildIds: string[];
  /** 空 = このフィルタを使わない */
  allowedUserIds: string[];
  rateLimitPerUserHour: number;
  rateLimitGlobalDay: number;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`環境変数 ${name} が設定されていません`);
  return value;
}

function list(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function number(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * 起動時に一度だけ呼び、不備があればフェイルファストする。
 *
 * allowlist が両方とも空の場合は**起動を拒否する**。
 * 誰でも叩ける状態で動き出すのを構造的に防ぐため（docs/design.md §8）。
 */
export function loadConfig(): Config {
  const config: Config = {
    discordToken: required("DISCORD_BOT_TOKEN"),
    applicationId: required("DISCORD_APPLICATION_ID"),
    geminiApiKey: required("GEMINI_API_KEY"),
    geminiModel: process.env.GEMINI_MODEL || DEFAULT_MODEL,
    allowedGuildIds: list("ALLOWED_GUILD_IDS"),
    allowedUserIds: list("ALLOWED_USER_IDS"),
    rateLimitPerUserHour: number("RATE_LIMIT_PER_USER_HOUR", 20),
    rateLimitGlobalDay: number("RATE_LIMIT_GLOBAL_DAY", 100),
  };

  if (config.allowedGuildIds.length === 0 && config.allowedUserIds.length === 0) {
    throw new Error(
      "ALLOWED_GUILD_IDS と ALLOWED_USER_IDS の両方が空です。" +
        "誰でも実行できる状態になるため起動を中止しました。少なくとも一方を設定してください。",
    );
  }
  return config;
}
