const { REST, Routes } = require('discord.js');
const { env } = require('./config/env');
const { commands } = require('./commands');

async function deployCommands() {
  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
  const payload = commands.map((command) => command.data.toJSON());

  if (env.DISCORD_GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID), {
      body: payload
    });
    console.log(`Registered ${payload.length} guild command(s) for ${env.DISCORD_GUILD_ID}.`);
    return;
  }

  await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), {
    body: payload
  });
  console.log(`Registered ${payload.length} global command(s).`);
}

if (require.main === module) {
  deployCommands().catch((error) => {
    console.error('Failed to deploy commands:', error);
    process.exit(1);
  });
}

module.exports = { deployCommands };
