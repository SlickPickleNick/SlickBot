const { REST, Routes } = require('discord.js');
const { env } = require('./config/env');
const { commands } = require('./commands');
const { validateCommandPayloads } = require('./utils/commandValidation');

async function deployCommands(options = {}) {
  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
  const payload = commands.map((command) => command.data.toJSON());
  const validationErrors = validateCommandPayloads(payload);

  if (validationErrors.length > 0) {
    throw new Error(`Invalid command payload:\n- ${validationErrors.join('\n- ')}`);
  }

  const clearGuildId = options.clearGuildId || (process.argv.includes('--clear-guild') ? process.argv[process.argv.indexOf('--clear-guild') + 1] : null);

  // If requested, clear commands from a specific guild
  if (clearGuildId) {
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, clearGuildId), { body: [] });
    console.log(`Cleared all guild commands for ${clearGuildId}.`);
  }

  // If DISCORD_GUILD_ID is configured, purge legacy guild commands to prevent shadowing global commands
  if (env.DISCORD_GUILD_ID && options.purgeLegacyGuild !== false) {
    try {
      await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID), { body: [] });
      console.log(`Purged legacy guild commands from ${env.DISCORD_GUILD_ID} to enable clean global command display.`);
    } catch (purgeErr) {
      console.warn(`Note: Could not clear legacy guild commands for ${env.DISCORD_GUILD_ID}:`, purgeErr.message);
    }
  }

  // Deploy Global Commands across all servers
  await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), {
    body: payload
  });
  console.log(`Registered ${payload.length} global command(s) across all servers.`);

  return { global: true, count: payload.length };
}

if (require.main === module) {
  deployCommands().catch((error) => {
    console.error('Failed to deploy commands:', error);
    process.exit(1);
  });
}

module.exports = { deployCommands };
