require('dotenv').config();

function readVariable(primary, aliases = [], fallback) {
  const names = [primary, ...aliases];
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && String(value).trim() !== '') return String(value).trim();
  }

  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${primary}${aliases.length ? ` (aliases: ${aliases.join(', ')})` : ''}`);
}

function readOptionalVariable(primary, aliases = []) {
  const names = [primary, ...aliases];
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && String(value).trim() !== '') return String(value).trim();
  }
  return undefined;
}

function readNumber(primary, fallback) {
  const value = readOptionalVariable(primary);
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function normalizeList(value) {
  if (!value) return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

const databaseUrl = readVariable('DATABASE_URL', ['POSTGRES_URL']);
process.env.DATABASE_URL = databaseUrl;

const env = {
  DISCORD_TOKEN: readVariable('DISCORD_TOKEN'),
  DISCORD_CLIENT_ID: readVariable('DISCORD_CLIENT_ID', ['CLIENT_ID']),
  DISCORD_GUILD_ID: readOptionalVariable('DISCORD_GUILD_ID', ['GUILD_ID']),
  DATABASE_URL: databaseUrl,
  AUTO_DEPLOY_COMMANDS: readVariable('AUTO_DEPLOY_COMMANDS', [], 'true'),
  BOT_OWNER_IDS: readVariable('BOT_OWNER_IDS', ['OWNER_IDS'], ''),
  DEFAULT_TIMEZONE: readVariable('DEFAULT_TIMEZONE', [], 'America/New_York'),
  DEFAULT_BOT_STATUS: readVariable('DEFAULT_BOT_STATUS', [], 'online'),
  DEFAULT_BOT_ACTIVITY_TYPE: readVariable('DEFAULT_BOT_ACTIVITY_TYPE', [], 'WATCHING'),
  DEFAULT_BOT_ACTIVITY_TEXT: readVariable('DEFAULT_BOT_ACTIVITY_TEXT', [], 'the server'),
  DEFAULT_BOT_ACTIVITY_URL: readOptionalVariable('DEFAULT_BOT_ACTIVITY_URL'),
  NODE_ENV: readVariable('NODE_ENV', [], 'development'),
  WEB_HOST: readVariable('WEB_HOST', [], '0.0.0.0'),
  PORT: readNumber('PORT', 3000)
};

const botOwnerIds = normalizeList(env.BOT_OWNER_IDS);
const shouldAutoDeployCommands = String(env.AUTO_DEPLOY_COMMANDS).toLowerCase() === 'true';

module.exports = {
  env,
  botOwnerIds,
  shouldAutoDeployCommands,
  normalizeList
};
