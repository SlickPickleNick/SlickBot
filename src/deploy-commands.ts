import { REST, Routes } from "discord.js";
import { env } from "./config/env.js";
import { commands } from "./commands/index.js";

export async function deployCommands(): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);
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

if (import.meta.url === `file://${process.argv[1]}`) {
  deployCommands().catch((error) => {
    console.error("Failed to deploy commands:", error);
    process.exit(1);
  });
}
