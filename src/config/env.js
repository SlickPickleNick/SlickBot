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

function readOptionalVariable(primary, aliases = [], fallback) {
  const names = [primary, ...aliases];
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && String(value).trim() !== '') return String(value).trim();
  }
  return fallback !== undefined ? fallback : undefined;
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

const defaultDatabaseUrl = process.env.NODE_ENV === 'test' ? 'postgres://localhost:5432/slickbot_test' : undefined;
const databaseUrl = readOptionalVariable('DATABASE_URL', ['POSTGRES_URL'], defaultDatabaseUrl || 'postgres://localhost:5432/slickbot');
if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
}

const env = {
  DISCORD_TOKEN: readOptionalVariable('DISCORD_TOKEN', [], ''),
  DISCORD_CLIENT_ID: readOptionalVariable('DISCORD_CLIENT_ID', ['CLIENT_ID'], ''),
  DISCORD_CLIENT_SECRET: readOptionalVariable('DISCORD_CLIENT_SECRET', ['CLIENT_SECRET', 'DISCORD_SECRET', 'DISCORD_OAUTH_SECRET', 'BOT_CLIENT_SECRET'], ''),
  DISCORD_GUILD_ID: readOptionalVariable('DISCORD_GUILD_ID', ['GUILD_ID']),
  DATABASE_URL: databaseUrl,
  AUTO_DEPLOY_COMMANDS: readOptionalVariable('AUTO_DEPLOY_COMMANDS', [], 'true'),
  BOT_OWNER_IDS: readOptionalVariable('BOT_OWNER_IDS', ['OWNER_IDS'], ''),
  DEFAULT_TIMEZONE: readOptionalVariable('DEFAULT_TIMEZONE', [], 'America/New_York'),
  DEFAULT_BOT_STATUS: readOptionalVariable('DEFAULT_BOT_STATUS', [], 'online'),
  DEFAULT_BOT_ACTIVITY_TYPE: readOptionalVariable('DEFAULT_BOT_ACTIVITY_TYPE', [], 'WATCHING'),
  DEFAULT_BOT_ACTIVITY_TEXT: readOptionalVariable('DEFAULT_BOT_ACTIVITY_TEXT', [], 'the server'),
  DEFAULT_BOT_ACTIVITY_URL: readOptionalVariable('DEFAULT_BOT_ACTIVITY_URL'),
  NODE_ENV: readOptionalVariable('NODE_ENV', [], 'development'),
  WEB_HOST: readOptionalVariable('WEB_HOST', [], '0.0.0.0'),
  PORT: readNumber('PORT', 3000),
  TWITCH_CLIENT_ID: readOptionalVariable('TWITCH_CLIENT_ID', []),
  TWITCH_CLIENT_SECRET: readOptionalVariable('TWITCH_CLIENT_SECRET', []),
  YOUTUBE_API_KEY: readOptionalVariable('YOUTUBE_API_KEY', []),
  PUBLIC_URL: readOptionalVariable('PUBLIC_URL', ['WEB_URL', 'APP_URL', 'HOST_URL'])
};

function validateEnv() {
  const required = [
    { key: 'DISCORD_TOKEN', name: 'DISCORD_TOKEN' },
    { key: 'DISCORD_CLIENT_ID', name: 'DISCORD_CLIENT_ID (or CLIENT_ID)' },
    { key: 'DATABASE_URL', name: 'DATABASE_URL (or POSTGRES_URL)' }
  ];
  for (const req of required) {
    if (!env[req.key]) {
      throw new Error(`Missing required environment variable: ${req.name}`);
    }
  }
}

const botOwnerIds = normalizeList(env.BOT_OWNER_IDS);
const shouldAutoDeployCommands = String(env.AUTO_DEPLOY_COMMANDS).toLowerCase() === 'true';

module.exports = {
  env,
  botOwnerIds,
  shouldAutoDeployCommands,
  readVariable,
  readOptionalVariable,
  readNumber,
  normalizeList,
  validateEnv
};

