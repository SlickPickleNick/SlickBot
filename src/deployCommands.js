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

  const primaryGuildId = options.guildId || env.DISCORD_GUILD_ID || (process.argv.includes('--guild') ? process.argv[process.argv.indexOf('--guild') + 1] : null);
  const clearGuildId = options.clearGuildId || (process.argv.includes('--clear-guild') ? process.argv[process.argv.indexOf('--clear-guild') + 1] : null);

  // If requested, clear commands from a specific guild
  if (clearGuildId) {
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, clearGuildId), { body: [] });
    console.log(`Cleared all guild commands for ${clearGuildId}.`);
  }

  // 1. Deploy Global Commands (covers all servers in the multi-server network)
  await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), {
    body: payload
  });
  console.log(`Registered ${payload.length} global command(s). (Multi-server coverage)`);

  // 2. Also deploy directly to the primary/initial guild for INSTANT 0-delay availability
  let deployedGuildId = null;
  if (primaryGuildId) {
    try {
      await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, primaryGuildId), {
        body: payload
      });
      console.log(`Registered ${payload.length} guild command(s) for primary guild ${primaryGuildId} (instant 0-delay updates).`);
      deployedGuildId = primaryGuildId;
    } catch (guildErr) {
      console.warn(`Note: Could not deploy direct guild commands to ${primaryGuildId}:`, guildErr.message);
    }
  }

  return { global: true, count: payload.length, guildId: deployedGuildId };
}

if (require.main === module) {
  deployCommands().catch((error) => {
    console.error('Failed to deploy commands:', error);
    process.exit(1);
  });
}

module.exports = { deployCommands };
