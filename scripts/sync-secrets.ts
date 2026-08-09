/**
 * ローカルの .env を Fly.io のシークレットに同期する。
 *
 *   node scripts/sync-secrets.ts [--prune] [--dry-run] [--file .env]
 *
 * `fly secrets import` は追加・上書きしかしないため、.env からキーを消しても
 * Fly 側には残り続ける。--prune を付けると、.env に無いキーを Fly から削除して
 * 本当の意味で同期する（既定では削除しない）。
 *
 * fly.toml の [env] に書いた値（NODE_ENV など）は対象外。秘密でない値であっても、
 * デプロイ環境の設定は .env 側に集約する運用を前提にしている。
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const valueOf = (flag: string, fallback: string) => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1]! : fallback;
};

const ENV_FILE = valueOf("--file", ".env");
const PRUNE = has("--prune");
const DRY_RUN = has("--dry-run");

/** fly.toml の [env] で管理していて、シークレットにはしない値 */
const MANAGED_IN_FLY_TOML = new Set(["NODE_ENV"]);

function parseEnvFile(path: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    // 値が空の行はスキップ（「未設定」を意味させたいため。消したいなら --prune）
    if (value === "" || MANAGED_IN_FLY_TOML.has(key)) continue;
    entries.set(key, value);
  }
  return entries;
}

function fly(args: string[], input?: string): string {
  return execFileSync("fly", args, { encoding: "utf8", input, stdio: ["pipe", "pipe", "inherit"] });
}

function remoteKeys(): string[] {
  const parsed: unknown = JSON.parse(fly(["secrets", "list", "--json"]));
  if (!Array.isArray(parsed)) throw new Error("fly secrets list --json の出力を解釈できません");
  return parsed
    .map((row) => (row as { Name?: string; name?: string }).Name ?? (row as { name?: string }).name)
    .filter((name): name is string => typeof name === "string");
}

const local = parseEnvFile(ENV_FILE);
if (local.size === 0) {
  throw new Error(`${ENV_FILE} に有効なキーがありません。誤って全削除しないよう中断します`);
}

const remote = new Set(remoteKeys());
const added = [...local.keys()].filter((k) => !remote.has(k));
const kept = [...local.keys()].filter((k) => remote.has(k));
const extra = [...remote].filter((k) => !local.has(k));

console.log(`${ENV_FILE} → Fly.io\n`);
for (const key of added) console.log(`  + ${key}  (新規)`);
for (const key of kept) console.log(`  ~ ${key}  (上書き)`);
for (const key of extra) {
  console.log(`  ${PRUNE ? "-" : "!"} ${key}  (${ENV_FILE} に無い${PRUNE ? " → 削除" : "。--prune で削除)"}`);
}

if (DRY_RUN) {
  console.log("\n--dry-run のため何も実行しませんでした");
  process.exit(0);
}
if (!PRUNE && extra.length > 0) {
  console.log(`\n注意: 上記 ${extra.length} 件は Fly 側に残ります（コードのデフォルトを上書きし続けます）`);
}

// import / unset はそれぞれマシンの再起動を伴うので、変更がある場合のみ実行する
const payload = [...local].map(([k, v]) => `${k}=${v}`).join("\n");
console.log("\nシークレットを反映しています（マシンが再起動します）...");
fly(["secrets", "import"], `${payload}\n`);

if (PRUNE && extra.length > 0) {
  console.log("不要なシークレットを削除しています...");
  fly(["secrets", "unset", ...extra]);
}
console.log("完了しました。`fly logs` で起動を確認してください");
