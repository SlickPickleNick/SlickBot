const { REST, Routes } = require('discord.js');
const { env, validateEnv } = require('../config/env');
const { commands } = require('../commands');
const { validateCommandPayloads } = require('../utils/commandValidation');

async function purgeAndSyncCommands() {
  validateEnv();

  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
  const payload = commands.map((command) => command.data.toJSON());
  const validationErrors = validateCommandPayloads(payload);

  if (validationErrors.length > 0) {
    throw new Error(`Invalid command payload:\n- ${validationErrors.join('\n- ')}`);
  }

  console.log('--- SlickBot Command Deduplication & Clean Sync ---');

  // Step 1: Discover all guilds the bot belongs to
  let guildIdsToClean = [];
  if (env.DISCORD_GUILD_ID) {
    guildIdsToClean.push(env.DISCORD_GUILD_ID);
  }

  // Check if specific guild passed via CLI argument
  const argGuild = process.argv.find((a) => /^\d{17,20}$/.test(a));
  if (argGuild && !guildIdsToClean.includes(argGuild)) {
    guildIdsToClean.push(argGuild);
  }

  try {
    const userGuilds = await rest.get(Routes.userGuilds());
    if (Array.isArray(userGuilds)) {
      for (const g of userGuilds) {
        if (!guildIdsToClean.includes(g.id)) {
          guildIdsToClean.push(g.id);
        }
      }
    }
  } catch (err) {
    console.warn('Note: Could not automatically fetch guild list via OAuth; checking explicitly configured guilds.');
  }

  // Step 2: Purge guild-scoped commands from all detected guilds
  console.log(`Checking ${guildIdsToClean.length} guild(s) for legacy guild-scoped commands to purge...`);
  for (const guildId of guildIdsToClean) {
    try {
      await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, guildId), { body: [] });
      console.log(`✅ Purged guild-scoped commands from guild ${guildId}.`);
    } catch (err) {
      console.warn(`⚠️ Could not purge guild commands for ${guildId}: ${err.message}`);
    }
  }

  // Step 3: Register clean Global Commands across Discord
  console.log(`Registering ${payload.length} clean global command(s)...`);
  await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), {
    body: payload
  });
  console.log(`🎉 Success! All duplicate guild commands purged and ${payload.length} global commands registered.`);
  console.log('Commands will now appear exactly ONCE across all servers.');
}

if (require.main === module) {
  purgeAndSyncCommands().catch((error) => {
    console.error('Command clean sync failed:', error);
    process.exit(1);
  });
}

module.exports = { purgeAndSyncCommands };
