import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().optional().or(z.literal("")),
  DATABASE_URL: z.string().min(1),
  AUTO_DEPLOY_COMMANDS: z.string().default("true"),
  BOT_OWNER_IDS: z.string().default(""),
  DEFAULT_TIMEZONE: z.string().default("America/New_York"),
  LOG_BATCH_FLUSH_SECONDS: z.coerce.number().int().positive().default(300),
  NODE_ENV: z.string().default("development")
});

export const env = envSchema.parse(process.env);

export const botOwnerIds = env.BOT_OWNER_IDS
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

export const shouldAutoDeployCommands = env.AUTO_DEPLOY_COMMANDS.toLowerCase() === "true";
