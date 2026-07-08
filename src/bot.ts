import { AuditSeverity } from "@prisma/client";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { env, shouldAutoDeployCommands } from "./config/env.js";
import { commandMap } from "./commands/index.js";
import { deployCommands } from "./deploy-commands.js";
import { prisma } from "./services/db.js";
import { startHealthServer } from "./services/healthServer.js";
import { replyPrivate } from "./utils/reply.js";
import { PermissionService } from "./modules/permissions/permissionService.js";
import { LoggingService } from "./modules/logging/loggingService.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const permissions = new PermissionService(prisma);
const logger = new LoggingService(prisma, client);
const healthServer = startHealthServer(client);

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}.`);

  const flushMs = env.LOG_BATCH_FLUSH_SECONDS * 1000;
  setInterval(() => {
    logger.flushDueBatches().catch((error) => console.error("Failed to flush log batches:", error));
  }, flushMs);
});

client.on(Events.GuildCreate, async (guild) => {
  await permissions.ensureGuildConfig(guild.id, guild.name);
  await logger.writeAudit({
    guildId: guild.id,
    actionKey: "guild.joined",
    targetType: "Guild",
    targetId: guild.id,
    summary: `Bot joined guild ${guild.name}.`
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commandMap.get(interaction.commandName);
  if (!command) {
    await replyPrivate(interaction, "Unknown command.");
    return;
  }

  const permissionResult = await permissions.checkInteraction(interaction, command.actionKey, command.moduleKey);
  if (!permissionResult.allowed) {
    await replyPrivate(interaction, permissionResult.reason ?? "You do not have permission to use this command.");
    return;
  }

  try {
    await command.execute(interaction, {
      client,
      db: prisma,
      permissions,
      logger
    });
  } catch (error) {
    console.error(`Command failed: ${interaction.commandName}`, error);

    if (interaction.guildId) {
      await logger.writeAudit({
        guildId: interaction.guildId,
        actorUserId: interaction.user.id,
        actionKey: `command.${interaction.commandName}.failed`,
        severity: AuditSeverity.ERROR,
        summary: `Command failed: ${interaction.commandName}`,
        metadata: {
          error: error instanceof Error ? error.message : String(error)
        }
      });
    }

    await replyPrivate(interaction, "Something went wrong while running that command. Check the bot logs for details.");
  }
});

async function main(): Promise<void> {
  if (shouldAutoDeployCommands) {
    await deployCommands();
  }

  await client.login(env.DISCORD_TOKEN);
}

main().catch(async (error) => {
  console.error("Bot startup failed:", error);
  await prisma.$disconnect();
  process.exit(1);
});

async function shutdown(): Promise<void> {
  healthServer.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => {
  shutdown().catch((error) => {
    console.error("Shutdown failed:", error);
    process.exit(1);
  });
});

process.on("SIGTERM", () => {
  shutdown().catch((error) => {
    console.error("Shutdown failed:", error);
    process.exit(1);
  });
});
