import "dotenv/config";

function readVariable(primary: string, aliases: string[] = [], fallback?: string): string {
  const names = [primary, ...aliases];
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value.trim() !== "") return value.trim();
  }

  if (fallback !== undefined) return fallback;

  throw new Error(`Missing required environment variable: ${primary}${aliases.length ? ` (aliases: ${aliases.join(", ")})` : ""}`);
}

function readOptionalVariable(primary: string, aliases: string[] = []): string | undefined {
  const names = [primary, ...aliases];
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value.trim() !== "") return value.trim();
  }
  return undefined;
}

function readNumber(primary: string, fallback: number): number {
  const value = readOptionalVariable(primary);
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function normalizeList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const databaseUrl = readVariable("DATABASE_URL", ["POSTGRES_URL"]);

// Prisma reads DATABASE_URL directly from process.env. This keeps TitanBot-style
// POSTGRES_URL compatibility while still using Prisma's standard DATABASE_URL.
process.env.DATABASE_URL = databaseUrl;

export const env = {
  DISCORD_TOKEN: readVariable("DISCORD_TOKEN"),
  DISCORD_CLIENT_ID: readVariable("DISCORD_CLIENT_ID", ["CLIENT_ID"]),
  DISCORD_GUILD_ID: readOptionalVariable("DISCORD_GUILD_ID", ["GUILD_ID"]),
  DATABASE_URL: databaseUrl,
  AUTO_DEPLOY_COMMANDS: readVariable("AUTO_DEPLOY_COMMANDS", [], "true"),
  BOT_OWNER_IDS: readVariable("BOT_OWNER_IDS", ["OWNER_IDS"], ""),
  DEFAULT_TIMEZONE: readVariable("DEFAULT_TIMEZONE", [], "America/New_York"),
  LOG_BATCH_FLUSH_SECONDS: readNumber("LOG_BATCH_FLUSH_SECONDS", 300),
  NODE_ENV: readVariable("NODE_ENV", [], "development"),
  WEB_HOST: readVariable("WEB_HOST", [], "0.0.0.0"),
  PORT: readNumber("PORT", 3000)
};

export const botOwnerIds = normalizeList(env.BOT_OWNER_IDS);
export const shouldAutoDeployCommands = env.AUTO_DEPLOY_COMMANDS.toLowerCase() === "true";
