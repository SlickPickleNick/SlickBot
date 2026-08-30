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

  // Multi-server mode: default to global deployment unless explicitly specified with options.guildId or --guild
  const targetGuildId = options.guildId || (process.argv.includes('--guild') ? process.argv[process.argv.indexOf('--guild') + 1] : null);
  const isGlobal = options.global ?? (targetGuildId ? false : true);
  const clearGuildId = options.clearGuildId || (process.argv.includes('--clear-guild') ? process.argv[process.argv.indexOf('--clear-guild') + 1] : null);

  // If requested, clear commands from a specific guild
  if (clearGuildId) {
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, clearGuildId), { body: [] });
    console.log(`Cleared all guild commands for ${clearGuildId}.`);
  }

  if (isGlobal) {
    // If DISCORD_GUILD_ID is set in environment, clear legacy guild commands to prevent command shadowing
    if (env.DISCORD_GUILD_ID) {
      try {
        await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID), { body: [] });
        console.log(`Purged legacy guild commands from ${env.DISCORD_GUILD_ID} to prevent command shadowing.`);
      } catch (purgeErr) {
        console.warn(`Note: Could not clear legacy guild commands for ${env.DISCORD_GUILD_ID}:`, purgeErr.message);
      }
    }

    await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), {
      body: payload
    });
    console.log(`Registered ${payload.length} global command(s). (Available across all servers)`);
    return { global: true, count: payload.length };
  }

  if (targetGuildId) {
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, targetGuildId), {
      body: payload
    });
    console.log(`Registered ${payload.length} guild command(s) for ${targetGuildId}.`);
    return { global: false, guildId: targetGuildId, count: payload.length };
  }

  throw new Error('No guild ID specified and global deployment is disabled.');
}

if (require.main === module) {
  deployCommands().catch((error) => {
    console.error('Failed to deploy commands:', error);
    process.exit(1);
  });
}

module.exports = { deployCommands };
