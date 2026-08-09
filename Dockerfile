# 依存の解決だけ Bun で行う（bun.lock を尊重するため）
FROM oven/bun:1.3.14 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# 実行は Node。discord.js が Bun を公式サポートしていないため（docs/design.md §10）
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Node 24 は TypeScript を実行時に型ストリップするのでビルド手順は不要。
# ソースをそのまま置く。
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.ts"]
