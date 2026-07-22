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
const { ApplicationService } = require('./modules/support/supportService');
const { handleMemberJoin: handleWelcomeMemberJoin } = require('./modules/community/welcomeService');
const { GiveawayService } = require('./modules/community/giveawayService');
const { BirthdayService } = require('./modules/community/birthdayService');
const { ScheduledMessageService } = require('./modules/automation/scheduledMessageService');
const { ServerStatsService } = require('./modules/community/serverStatsService');
const { BotUpdatesService } = require('./modules/status/botUpdatesService');
const { CustomCommandService } = require('./modules/custom/customCommandService');
const { JoinCreateService } = require('./modules/voice/joinCreateService');
const { LevelingService } = require('./modules/community/levelingService');
const { CommunityGameService } = require('./modules/community/gameService');
const { FaqService } = require('./modules/community/faqService');
const { TemporaryRoleService } = require('./modules/moderation/tempRoleService');
const { handleReactionRole, syncAllPublishedReactionPanels } = require('./modules/community/rolePanelService');
const { handleComponentInteraction } = require('./services/interactionRouter');
const { ActionKeys } = require('./modules/permissions/actionKeys');
const { ModuleKeys } = require('./modules/moduleRegistry');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User, Partials.GuildMember]
});

const permissions = new PermissionService();
const logger = new LoggingService(client);
const status = new StatusService(client);
const moderation = new ModerationService();
const applications = new ApplicationService();
const giveaways = new GiveawayService();
const birthdays = new BirthdayService();
const scheduledMessages = new ScheduledMessageService();
const serverStats = new ServerStatsService();
const botUpdates = new BotUpdatesService();
const customCommands = new CustomCommandService();
const joinCreate = new JoinCreateService();
const leveling = new LevelingService();
const communityGames = new CommunityGameService();
const faq = new FaqService();
const tempRoles = new TemporaryRoleService();
const healthServer = startHealthServer(client);

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`SlickBot logged in as ${readyClient.user.tag}.`);

  if (env.DISCORD_GUILD_ID) {
    await permissions.ensureGuildConfig(env.DISCORD_GUILD_ID, readyClient.guilds.cache.get(env.DISCORD_GUILD_ID)?.name || null);
    await status.applySavedPresence(env.DISCORD_GUILD_ID);
  } else {
    await status.applySavedPresence(null);
  }

  for (const guild of readyClient.guilds.cache.values()) {
    await permissions.ensureGuildConfig(guild.id, guild.name).catch((error) => console.error(`Failed to ensure guild config for ${guild.name}:`, error));
  }

  setInterval(() => {
    giveaways.processDueGiveaways(readyClient, logger).catch((error) => console.error('Failed to process due giveaways:', error));
  }, 60 * 1000);
  await giveaways.processDueGiveaways(readyClient, logger).catch((error) => console.error('Failed to process due giveaways:', error));

  setInterval(() => {
    birthdays.processBirthdays(readyClient, logger).catch((error) => console.error('Failed to process birthdays:', error));
  }, 60 * 60 * 1000);
  await birthdays.processBirthdays(readyClient, logger).catch((error) => console.error('Failed to process birthdays:', error));

  setInterval(() => {
    scheduledMessages.processDue(readyClient, logger).catch((error) => console.error('Failed to process scheduled messages:', error));
  }, 60 * 1000);
  await scheduledMessages.processDue(readyClient, logger).catch((error) => console.error('Failed to process scheduled messages:', error));

  setInterval(() => {
    applications.processExpiredSessions(readyClient, logger).catch((error) => console.error('Failed to process expired application sessions:', error));
  }, 30 * 1000);
  await applications.processExpiredSessions(readyClient, logger).catch((error) => console.error('Failed to process expired application sessions:', error));

  setInterval(() => {
    communityGames.expireStaleSessions(readyClient).catch((error) => console.error('Failed to expire stale community games:', error));
  }, 5 * 60 * 1000);
  await communityGames.expireStaleSessions(readyClient).catch((error) => console.error('Failed to expire stale community games:', error));

  setInterval(() => {
    tempRoles.processExpired(readyClient, logger).catch((error) => console.error('Failed to process temporary role expirations:', error));
  }, 60 * 1000);
  await tempRoles.processExpired(readyClient, logger).catch((error) => console.error('Failed to process temporary role expirations:', error));

  setInterval(() => {
    for (const guild of readyClient.guilds.cache.values()) {
      serverStats.updateStats(guild, logger, '15-minute fallback interval', { forceMemberFetch: true }).catch((error) => console.error(`Failed interval server stats update for ${guild.name}:`, error));
    }
  }, 15 * 60 * 1000);

  for (const guild of readyClient.guilds.cache.values()) {
    serverStats.scheduleUpdate(guild, logger, 'startup', 10 * 1000, { forceMemberFetch: true });
  }

  await botUpdates.announceStartup(readyClient, logger).catch((error) => console.error('Failed to process bot update announcements:', error));
  await joinCreate.repairStartup(readyClient, logger).catch((error) => console.error('Failed to repair join-to-create channels:', error));

  for (const guild of readyClient.guilds.cache.values()) {
    const reactionRolesEnabled = await permissions.isModuleEnabled(guild.id, 'REACTION_ROLES').catch(() => false);
    if (reactionRolesEnabled) {
      syncAllPublishedReactionPanels(readyClient, guild.id)
        .then((result) => console.log(`Reaction panel sync for ${guild.name}: ${result.messages} message(s), ${result.added} reaction(s) available.`))
        .catch((error) => console.error(`Failed to sync reaction panels for ${guild.name}:`, error));
    }
  }
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

  const welcomeEnabled = await permissions.isModuleEnabled(member.guild.id, 'WELCOME').catch(() => false);
  if (welcomeEnabled) {
    await handleWelcomeMemberJoin(member, logger).catch((error) => console.error('Failed to run welcome flow:', error));
  }
  serverStats.scheduleUpdate(member.guild, logger, 'member join', 10 * 1000, { forceMemberFetch: true });
});

client.on(Events.GuildMemberRemove, async (member) => {
  serverStats.scheduleUpdate(member.guild, logger, 'member leave', 10 * 1000, { forceMemberFetch: true });
  await logger.log({
    guildId: member.guild.id,
    eventKey: 'member-leave',
    title: 'Member Left',
    body: `${member.user?.tag || member.id} (${member.id}) left the server.`,
    metadata: { userId: member.id, bot: member.user?.bot || false }
  }).catch((error) => console.error('Failed to log member leave:', error));
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  if (newMember.user?.bot) return;

  if (oldMember.nickname !== newMember.nickname) {
    await logger.log({
      guildId: newMember.guild.id,
      eventKey: 'member-nickname',
      title: 'Nickname Changed',
      body: [
        `Member: ${newMember.user.tag} (${newMember.id})`,
        `Before: ${oldMember.nickname || oldMember.user.username}`,
        `After: ${newMember.nickname || newMember.user.username}`
      ].join('\n'),
      metadata: { userId: newMember.id, before: oldMember.nickname, after: newMember.nickname }
    }).catch((error) => console.error('Failed to log nickname change:', error));
  }

  const oldRoleIds = new Set(oldMember.roles.cache.keys());
  const newRoleIds = new Set(newMember.roles.cache.keys());
  const addedRoles = [...newRoleIds].filter((roleId) => !oldRoleIds.has(roleId));
  const removedRoles = [...oldRoleIds].filter((roleId) => !newRoleIds.has(roleId));

  if (addedRoles.length || removedRoles.length) {
    await logger.log({
      guildId: newMember.guild.id,
      eventKey: 'member-roles',
      title: 'Member Roles Updated',
      body: [
        `Member: ${newMember.user.tag} (${newMember.id})`,
        addedRoles.length ? `Added: ${addedRoles.map((roleId) => `<@&${roleId}>`).join(', ')}` : null,
        removedRoles.length ? `Removed: ${removedRoles.map((roleId) => `<@&${roleId}>`).join(', ')}` : null
      ].filter(Boolean).join('\n'),
      metadata: { userId: newMember.id, addedRoles, removedRoles }
    }).catch((error) => console.error('Failed to log member role change:', error));
  }
});

client.on(Events.MessageDelete, async (message) => {
  await handleCountingMessageMutationEvent(message, 'DELETED');
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

  await handleCountingMessageMutationEvent(newMessage, 'EDITED');
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
    eventKey: action === 'Voice Channel Joined' ? 'voice-join' : action === 'Voice Channel Left' ? 'voice-leave' : 'voice-move',
    title: action,
    body,
    metadata: {
      userId: user?.id || null,
      oldChannelId,
      newChannelId
    }
  }).catch((error) => console.error('Failed to log voice state:', error));
  const guild = newState.guild || oldState.guild;
  const joinCreateEnabled = await permissions.isModuleEnabled(guild.id, 'JOIN_TO_CREATE').catch(() => false);
  if (joinCreateEnabled) {
    await joinCreate.handleVoiceState(oldState, newState, logger).catch((error) => console.error('Failed to process join-to-create voice state:', error));
  }
  serverStats.scheduleVoiceStateUpdate(guild, logger, 'voice state');
});


client.on(Events.MessageCreate, async (message) => {
  if (message.author?.bot) return;

  if (message.guild) {
    if (await permissions.isIgnored(message.guild.id, message.author.id).catch(() => false)) return;

    let countingResult = { handled: false, suppressNormalXp: false };
    const activeCountingConfig = await communityGames.getActiveCountingConfigForChannel(message.guild.id, message.channelId).catch(() => null);
    if (activeCountingConfig) {
      const gamesEnabled = await permissions.isModuleEnabled(message.guild.id, ModuleKeys.COMMUNITY_GAMES).catch(() => false);
      const gamesAccess = gamesEnabled
        ? await permissions.checkPublicInteraction(messageToPermissionInteraction(message), ActionKeys.GamesPlay, ModuleKeys.COMMUNITY_GAMES).catch(() => ({ allowed: false }))
        : { allowed: false };
      if (gamesAccess.allowed) {
        countingResult = await communityGames.handleCountingMessage(message, logger, activeCountingConfig).catch(async (error) => {
          console.error('Failed to process counting game message:', error);
          await logger.log({
            guildId: message.guild.id,
            eventKey: 'community-game-error',
            title: 'Community Game Error',
            body: error instanceof Error ? error.message : String(error),
            metadata: { game: 'COUNTING', channelId: message.channelId, authorId: message.author.id }
          }).catch(() => {});
          return { handled: false, suppressNormalXp: false };
        });
      }
    }

    const customCommandsEnabled = await permissions.isModuleEnabled(message.guild.id, ModuleKeys.CUSTOM_COMMANDS).catch(() => false);
    if (customCommandsEnabled) {
      const customCommandAccess = await permissions.checkPublicInteraction(messageToPermissionInteraction(message), ActionKeys.CustomCommandsUse, ModuleKeys.CUSTOM_COMMANDS).catch(() => ({ allowed: false }));
      if (customCommandAccess.allowed) {
        await customCommands.handleMessage(message, logger).catch(async (error) => {
          console.error('Failed to process custom command:', error);
          await logger.log({
            guildId: message.guild.id,
            eventKey: 'custom-command-error',
            title: 'Custom Command Error',
            body: error instanceof Error ? error.message : String(error),
            metadata: { channelId: message.channelId, authorId: message.author.id }
          }).catch(() => {});
        });
      }
    }

    const levelingEnabled = await permissions.isModuleEnabled(message.guild.id, 'LEVELING').catch(() => false);
    if (levelingEnabled && !countingResult.suppressNormalXp) {
      await leveling.processMessage(message, logger).catch((error) => console.error('Failed to process message XP:', error));
    }
    return;
  }

  await applications.handleDmResponse({ message, client, logger }).catch((error) => {
    console.error('Failed to handle DM application response:', error);
  });
});


async function handleCountingMessageMutationEvent(message, mutationType) {
  if (!message?.guildId) return;
  const gamesEnabled = await permissions.isModuleEnabled(message.guildId, ModuleKeys.COMMUNITY_GAMES).catch(() => false);
  if (!gamesEnabled) return;
  await communityGames.handleCountingMessageMutation(message, mutationType, logger).catch(async (error) => {
    console.error(`Failed to process ${mutationType.toLowerCase()} counting message:`, error);
    await logger.log({
      guildId: message.guildId,
      eventKey: 'community-game-error',
      title: 'Community Game Error',
      body: error instanceof Error ? error.message : String(error),
      metadata: { game: 'COUNTING', messageId: message.id, mutationType }
    }).catch(() => {});
  });
}


async function handleFaqThreadChange(thread, action) {
  const guildId = thread?.guild?.id || thread?.guildId;
  if (!guildId) return;
  const faqEnabled = await permissions.isModuleEnabled(guildId, ModuleKeys.FAQ).catch(() => false);
  if (!faqEnabled) return;
  await faq.handleForumThreadChange(thread, client, logger, action).catch(async (error) => {
    console.error(`Failed to refresh FAQ index after thread ${action}:`, error);
    await logger.log({
      guildId,
      eventKey: 'faq-error',
      title: 'FAQ Forum Refresh Failed',
      body: error instanceof Error ? error.message : String(error),
      metadata: { threadId: thread?.id || null, parentId: thread?.parentId || thread?.parent?.id || null, action }
    }).catch(() => {});
  });
}

client.on(Events.ThreadCreate, async (thread) => {
  await handleFaqThreadChange(thread, 'created');
});

client.on(Events.ThreadUpdate, async (oldThread, newThread) => {
  await handleFaqThreadChange(newThread || oldThread, 'updated');
});

client.on(Events.ThreadDelete, async (thread) => {
  await handleFaqThreadChange(thread, 'deleted');
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user?.bot) return;
  const guildId = reaction.message?.guildId;
  if (!guildId) return;
  if (await permissions.isIgnored(guildId, user.id).catch(() => false)) {
    await reaction.users.remove(user.id).catch(() => {});
    return;
  }
  const enabled = await permissions.isModuleEnabled(guildId, ModuleKeys.REACTION_ROLES).catch(() => false);
  if (!enabled) return;
  const reactionAccess = await buildReactionPermissionInteraction(reaction, user).then((permissionInteraction) => permissions.checkPublicInteraction(permissionInteraction, ActionKeys.RolePanelsUse, ModuleKeys.REACTION_ROLES)).catch(() => ({ allowed: false }));
  if (!reactionAccess.allowed) {
    await reaction.users.remove(user.id).catch(() => {});
    return;
  }
  await handleReactionRole({ reaction, user, action: 'add', logger }).catch((error) => console.error('Failed to handle reaction role add:', error));
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user?.bot) return;
  const guildId = reaction.message?.guildId;
  if (!guildId) return;
  if (await permissions.isIgnored(guildId, user.id).catch(() => false)) return;
  const enabled = await permissions.isModuleEnabled(guildId, ModuleKeys.REACTION_ROLES).catch(() => false);
  if (!enabled) return;
  const reactionAccess = await buildReactionPermissionInteraction(reaction, user).then((permissionInteraction) => permissions.checkPublicInteraction(permissionInteraction, ActionKeys.RolePanelsUse, ModuleKeys.REACTION_ROLES)).catch(() => ({ allowed: false }));
  if (!reactionAccess.allowed) return;
  await handleReactionRole({ reaction, user, action: 'remove', logger }).catch((error) => console.error('Failed to handle reaction role remove:', error));
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    const command = commandMap.get(interaction.commandName);
    if (command && typeof command.autocomplete === 'function') {
      await command.autocomplete(interaction).catch((error) => console.error(`Autocomplete failed: ${interaction.commandName}`, error));
    }
    return;
  }

  if (!interaction.isChatInputCommand()) {
    if (interaction.guildId && await permissions.isIgnored(interaction.guildId, interaction.user.id)) {
      await replyPrivate(interaction, 'You are currently blocked from interacting with SlickBot.');
      return;
    }

    if (interaction.isMessageContextMenuCommand?.()) {
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
        await command.execute(interaction, { client, permissions, logger, status, moderation });
      } catch (error) {
        console.error(`Context command failed: ${interaction.commandName}`, error);
        await replyPrivate(interaction, 'Something went wrong while running that command. Check the bot logs for details.').catch(() => {});
      }
      return;
    }

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

  if (typeof command.isPublic === 'function' && command.isPublic(interaction)) {
    const publicResult = await permissions.checkPublicInteraction(interaction, actionKey, moduleKey);
    if (!publicResult.allowed) {
      await replyPrivate(interaction, publicResult.reason || 'You cannot use this command.');
      return;
    }
  } else {
    const permissionResult = await permissions.checkInteraction(interaction, actionKey, moduleKey);
    if (!permissionResult.allowed) {
      await replyPrivate(interaction, permissionResult.reason || 'You do not have permission to use this command.');
      return;
    }
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


function messageToPermissionInteraction(message) {
  return {
    guildId: message.guild?.id,
    guild: message.guild,
    channelId: message.channelId,
    user: message.author,
    member: message.member,
    memberPermissions: message.member?.permissions
  };
}

async function buildReactionPermissionInteraction(reaction, user) {
  const guild = reaction.message?.guild;
  const member = guild ? await guild.members.fetch(user.id).catch(() => null) : null;
  return {
    guildId: guild?.id,
    guild,
    channelId: reaction.message?.channelId,
    user,
    member,
    memberPermissions: member?.permissions
  };
}

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
