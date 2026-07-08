const { Client, Events, GatewayIntentBits, Partials } = require('discord.js');
const { env, shouldAutoDeployCommands } = require('./config/env');
const { commandMap } = require('./commands');
const { deployCommands } = require('./deployCommands');
const { initDatabase } = require('./services/initDatabase');
const { closeDatabase } = require('./services/db');
const { startHealthServer } = require('./services/healthServer');
const { replyPrivate } = require('./utils/reply');
const { PermissionService } = require('./modules/permissions/permissionService');
const { LoggingService } = require('./modules/logging/loggingService');
const { StatusService } = require('./modules/status/statusService');
const { ModerationService } = require('./modules/moderation/moderationService');
const { handleComponentInteraction } = require('./services/interactionRouter');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User, Partials.GuildMember]
});

const permissions = new PermissionService();
const logger = new LoggingService(client);
const status = new StatusService(client);
const moderation = new ModerationService();
const healthServer = startHealthServer(client);

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`SlickBot logged in as ${readyClient.user.tag}.`);

  if (env.DISCORD_GUILD_ID) {
    await permissions.ensureGuildConfig(env.DISCORD_GUILD_ID, readyClient.guilds.cache.get(env.DISCORD_GUILD_ID)?.name || null);
    await status.applySavedPresence(env.DISCORD_GUILD_ID);
  } else {
    await status.applySavedPresence(null);
  }

  const flushMs = env.LOG_BATCH_FLUSH_SECONDS * 1000;
  setInterval(() => {
    logger.flushDueBatches().catch((error) => console.error('Failed to flush log batches:', error));
  }, flushMs);
});

client.on(Events.GuildCreate, async (guild) => {
  await permissions.ensureGuildConfig(guild.id, guild.name);
  await logger.writeAudit({
    guildId: guild.id,
    actionKey: 'guild.joined',
    targetType: 'Guild',
    targetId: guild.id,
    summary: `SlickBot joined guild ${guild.name}.`
  });
});


client.on(Events.GuildMemberAdd, async (member) => {
  await logger.log({
    guildId: member.guild.id,
    eventKey: 'member-join',
    title: 'Member Joined',
    body: `${member.user.tag} (${member.id}) joined the server.`,
    metadata: { userId: member.id, bot: member.user.bot }
  }).catch((error) => console.error('Failed to log member join:', error));
});

client.on(Events.GuildMemberRemove, async (member) => {
  await logger.log({
    guildId: member.guild.id,
    eventKey: 'member-leave',
    title: 'Member Left',
    body: `${member.user?.tag || member.id} (${member.id}) left the server.`,
    metadata: { userId: member.id, bot: member.user?.bot || false }
  }).catch((error) => console.error('Failed to log member leave:', error));
});

client.on(Events.MessageDelete, async (message) => {
  if (!message.guild || message.author?.bot) return;
  await logger.log({
    guildId: message.guild.id,
    eventKey: 'message-delete',
    title: 'Message Deleted',
    body: [
      `Channel: <#${message.channelId}>`,
      `Author: ${message.author ? `${message.author.tag} (${message.author.id})` : 'Unknown'}`,
      `Content: ${message.content || '[No content available]'}`
    ].join('\n'),
    metadata: {
      channelId: message.channelId,
      authorId: message.author?.id || null,
      messageId: message.id
    }
  }).catch((error) => console.error('Failed to log message delete:', error));
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (!newMessage.guild || newMessage.author?.bot) return;
  const oldContent = oldMessage.content || '[No previous content available]';
  const newContent = newMessage.content || '[No new content available]';
  if (oldContent === newContent) return;

  await logger.log({
    guildId: newMessage.guild.id,
    eventKey: 'message-edit',
    title: 'Message Edited',
    body: [
      `Channel: <#${newMessage.channelId}>`,
      `Author: ${newMessage.author ? `${newMessage.author.tag} (${newMessage.author.id})` : 'Unknown'}`,
      `Before: ${oldContent}`,
      `After: ${newContent}`
    ].join('\n'),
    metadata: {
      channelId: newMessage.channelId,
      authorId: newMessage.author?.id || null,
      messageId: newMessage.id
    }
  }).catch((error) => console.error('Failed to log message edit:', error));
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const guildId = newState.guild.id || oldState.guild.id;
  const user = newState.member?.user || oldState.member?.user;
  if (!guildId || user?.bot) return;

  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;
  if (oldChannelId === newChannelId) return;

  let action = 'Voice Channel Moved';
  let body = `${user ? `${user.tag} (${user.id})` : 'Unknown user'} moved from <#${oldChannelId}> to <#${newChannelId}>.`;

  if (!oldChannelId && newChannelId) {
    action = 'Voice Channel Joined';
    body = `${user ? `${user.tag} (${user.id})` : 'Unknown user'} joined <#${newChannelId}>.`;
  } else if (oldChannelId && !newChannelId) {
    action = 'Voice Channel Left';
    body = `${user ? `${user.tag} (${user.id})` : 'Unknown user'} left <#${oldChannelId}>.`;
  }

  await logger.log({
    guildId,
    eventKey: 'voice',
    title: action,
    body,
    metadata: {
      userId: user?.id || null,
      oldChannelId,
      newChannelId
    }
  }).catch((error) => console.error('Failed to log voice state:', error));
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    await handleComponentInteraction(interaction, { client, permissions, logger, status, moderation }).catch((error) => {
      console.error('Component interaction failed:', error);
    });
    return;
  }

  const command = commandMap.get(interaction.commandName);
  if (!command) {
    await replyPrivate(interaction, 'Unknown command.');
    return;
  }

  const actionKey = typeof command.getActionKey === 'function' ? command.getActionKey(interaction) : command.actionKey;
  const moduleKey = typeof command.getModuleKey === 'function' ? command.getModuleKey(interaction) : command.moduleKey;
  const permissionResult = await permissions.checkInteraction(interaction, actionKey, moduleKey);
  if (!permissionResult.allowed) {
    await replyPrivate(interaction, permissionResult.reason || 'You do not have permission to use this command.');
    return;
  }

  try {
    await command.execute(interaction, {
      client,
      permissions,
      logger,
      status,
      moderation
    });
  } catch (error) {
    console.error(`Command failed: ${interaction.commandName}`, error);

    if (interaction.guildId) {
      await logger.writeAudit({
        guildId: interaction.guildId,
        actorUserId: interaction.user.id,
        actionKey: `command.${interaction.commandName}.failed`,
        severity: 'ERROR',
        summary: `Command failed: ${interaction.commandName}`,
        metadata: {
          error: error instanceof Error ? error.message : String(error)
        }
      }).catch(() => {});
    }

    await replyPrivate(interaction, 'Something went wrong while running that command. Check the bot logs for details.');
  }
});

async function main() {
  await initDatabase();

  if (shouldAutoDeployCommands) {
    await deployCommands();
  }

  await client.login(env.DISCORD_TOKEN);
}

main().catch(async (error) => {
  console.error('SlickBot startup failed:', error);
  await closeDatabase().catch(() => {});
  process.exit(1);
});

async function shutdown() {
  console.log('Shutting down SlickBot...');
  healthServer.close();
  client.destroy();
  await closeDatabase();
  process.exit(0);
}

process.on('SIGINT', () => {
  shutdown().catch((error) => {
    console.error('Shutdown failed:', error);
    process.exit(1);
  });
});

process.on('SIGTERM', () => {
  shutdown().catch((error) => {
    console.error('Shutdown failed:', error);
    process.exit(1);
  });
});
