import { Client, Events, GatewayIntentBits } from "discord.js";
import { loadConfig } from "./config.ts";
import { COMMAND_NAME } from "./discord/command.ts";
import { RateLimiter } from "./discord/guard.ts";
import { handleResult, type HandlerDeps } from "./discord/handler.ts";

const config = loadConfig();

const deps: HandlerDeps = {
  allow: { guildIds: config.allowedGuildIds, userIds: config.allowedUserIds },
  rateLimiter: new RateLimiter({
    perUserHour: config.rateLimitPerUserHour,
    globalDay: config.rateLimitGlobalDay,
  }),
  model: config.geminiModel,
};

// スラッシュコマンドの受信に MessageContent は不要
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (ready) => {
  console.log(`ログインしました: ${ready.user.tag}`);
  console.log(`許可サーバー: ${config.allowedGuildIds.join(", ") || "(制限なし)"}`);
  console.log(`許可ユーザー: ${config.allowedUserIds.join(", ") || "(制限なし)"}`);
  console.log(`モデル: ${config.geminiModel}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== COMMAND_NAME) return;
  try {
    await handleResult(interaction, deps);
  } catch (error) {
    // ハンドラ内で応答済みのはずだが、応答前に落ちた場合の最後の砦
    console.error("[interaction] 未捕捉のエラー:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ 内部エラーが発生しました", flags: 64 }).catch(() => {});
    }
  }
});

// Gateway は自動再接続するが、認証エラー等で落ちたときは気づけるようにする
client.on(Events.Error, (error) => console.error("[gateway] エラー:", error));

await client.login(config.discordToken);
