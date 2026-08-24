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

  const isGlobal = options.global || process.argv.includes('--global') || (!env.DISCORD_GUILD_ID && !options.guildId);
  const targetGuildId = options.guildId || (!isGlobal ? env.DISCORD_GUILD_ID : null);
  const clearGuildId = options.clearGuildId || (process.argv.includes('--clear-guild') ? process.argv[process.argv.indexOf('--clear-guild') + 1] : null);

  // If requested, clear commands from a specific guild
  if (clearGuildId) {
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, clearGuildId), { body: [] });
    console.log(`Cleared all guild commands for ${clearGuildId}.`);
  }

  if (isGlobal) {
    // If DISCORD_GUILD_ID is set in environment, clear legacy guild commands to prevent duplicate entries
    if (env.DISCORD_GUILD_ID && (options.clearLegacyGuild !== false || process.argv.includes('--clear-legacy'))) {
      try {
        await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID), { body: [] });
        console.log(`Purged legacy guild commands from ${env.DISCORD_GUILD_ID} to prevent duplicates.`);
      } catch (purgeErr) {
        console.warn(`Note: Could not clear legacy guild commands for ${env.DISCORD_GUILD_ID}:`, purgeErr.message);
      }
    }

    await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), {
      body: payload
    });
    console.log(`Registered ${payload.length} global command(s). (Global commands propagate across Discord within a few minutes)`);
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
